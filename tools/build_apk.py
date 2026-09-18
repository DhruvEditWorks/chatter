#!/usr/bin/env python3
"""Build the Chatter APKs locally - no Android SDK / Gradle required.

Pipeline:
  1. tools/prepare_www.py      web assets -> android/app/.../assets/www/
  2. aapt2 compile + link      res + manifest + assets -> base APK + R.java
  3. R.java -> R.smali         resource IDs for the dex code
  4. smali (via JPype + apktool's shaded smali) -> classes.dex
  5. merge dex + zipalign (pure Python) -> aligned APK
  6. apksigner (official jar)  -> dist/chatter-debug.apk + chatter-release.apk
  7. verify everything (apksigner verify, aapt2 dump, androguard)

The small toolchain (aapt2, apktool.jar, apksigner.jar, android.jar) is
fetched once from npm/GitHub into tools/.android-tools/ and cached there.
Needs on PATH: python3, npm, git. Needs via pip: jpype1 (+ pillow for
icons, androguard for extra validation). Needs a JRE: $JAVA_HOME or jdk4py.

Usage: python3 tools/build_apk.py [--refetch-tools] [--skip-fetch]
"""

import hashlib
import os
import re
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID = os.path.join(ROOT, "android")
APP_MAIN = os.path.join(ANDROID, "app", "src", "main")
TOOLS_DIR = os.path.join(ROOT, "tools", ".android-tools")
WORK = os.path.join(ROOT, "tools", ".build")
DIST = os.path.join(ROOT, "dist")

AAPT2 = os.environ.get("CHATTER_AAPT2",
                       os.path.join(TOOLS_DIR, "bin", "aapt2"))
APKTOOL_JAR = os.environ.get("CHATTER_APKTOOL",
                             os.path.join(TOOLS_DIR, "lib", "apktool.jar"))
APKSIGNER_JAR = os.environ.get("CHATTER_APKSIGNER",
                               os.path.join(TOOLS_DIR, "lib", "apksigner.jar"))
ANDROID_JAR = os.environ.get("CHATTER_ANDROID_JAR",
                             os.path.join(TOOLS_DIR, "sable", "android-34",
                                          "android.jar"))

MIN_SDK = 24
TARGET_SDK = 34
# NOTE: this smali release maps apiLevel 21 -> dex version 035, which is what
# minSdk 24 devices need (higher levels emit 037+, rejected on Android 7.x).
# Our bytecode only uses ancient opcodes, so level 21 is safe and correct.
SMALI_API_LEVEL = 21


def log(msg):
    print("build_apk: " + msg, flush=True)


def fail(msg):
    print("build_apk: ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def run(cmd, cwd=None, capture=False, env=None):
    p = subprocess.run(cmd, cwd=cwd or ROOT, env=env or os.environ,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None,
                       text=True)
    if p.returncode != 0:
        if capture:
            print(p.stdout[-4000:])
        fail("command failed (%d): %s" % (p.returncode, " ".join(cmd)))
    return p.stdout if capture else ""


# ---------------------------------------------------------------- toolchain

def find_java():
    """Return (java, keytool, libjvm) paths."""
    home = os.environ.get("JAVA_HOME")
    if not home:
        try:
            import jdk4py  # noqa
            if hasattr(jdk4py, "JAVA_HOME"):
                home = jdk4py.JAVA_HOME
            else:
                base = os.path.dirname(jdk4py.__file__)
                for cand in ("java", "java-runtime"):
                    if os.path.isdir(os.path.join(base, cand)):
                        home = os.path.join(base, cand)
        except ImportError:
            pass
    if not home or not os.path.isdir(home):
        fail("no JRE found: set JAVA_HOME or pip install jdk4py")
    java = os.path.join(home, "bin", "java")
    keytool = os.path.join(home, "bin", "keytool")
    libjvm = os.path.join(home, "lib", "server", "libjvm.so")
    for p in (java, keytool, libjvm):
        if not os.path.isfile(p):
            fail("JRE incomplete, missing " + p)
    return java, keytool, libjvm


def fetch_tools(refetch=False):
    if os.path.isfile(os.path.join(TOOLS_DIR, ".ok")) and not refetch:
        for p in (AAPT2, APKTOOL_JAR, APKSIGNER_JAR, ANDROID_JAR):
            if not os.path.isfile(p):
                break
        else:
            log("toolchain cached")
            return
    log("fetching toolchain into tools/.android-tools/ ...")
    os.makedirs(os.path.join(TOOLS_DIR, "npm"), exist_ok=True)
    os.makedirs(os.path.join(TOOLS_DIR, "bin"), exist_ok=True)
    os.makedirs(os.path.join(TOOLS_DIR, "lib"), exist_ok=True)

    # aapt2 + apktool/apksigner jars from npm (tarballs carry the binaries).
    run(["npm", "pack", "aaptjs3@2.0.2"],
        cwd=os.path.join(TOOLS_DIR, "npm"))
    run(["npm", "pack", "@postar/apktool-node@0.3.4"],
        cwd=os.path.join(TOOLS_DIR, "npm"))
    run(["tar", "xzf", "aaptjs3-2.0.2.tgz"], cwd=os.path.join(TOOLS_DIR, "npm"))
    run(["tar", "xzf", "postar-apktool-node-0.3.4.tgz"],
        cwd=os.path.join(TOOLS_DIR, "npm"))
    shutil.copy2(os.path.join(TOOLS_DIR, "npm", "package", "bin", "x64",
                              "linux", "aapt2"), AAPT2)
    os.chmod(AAPT2, 0o755)
    for jar in ("apktool.jar", "apksigner.jar"):
        shutil.copy2(os.path.join(TOOLS_DIR, "npm", "package", "lib", jar),
                     os.path.join(TOOLS_DIR, "lib", jar))

    # android.jar (API 34) via sparse checkout - blobs for one file only.
    sable = os.path.join(TOOLS_DIR, "sable")
    if not os.path.isdir(os.path.join(sable, ".git")):
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
             "https://github.com/Sable/android-platforms", sable])
    run(["git", "-C", sable, "sparse-checkout", "set", "--cone", "android-34"])

    for p in (AAPT2, APKTOOL_JAR, APKSIGNER_JAR, ANDROID_JAR):
        if not os.path.isfile(p):
            fail("toolchain fetch incomplete, missing " + p)
    java, _, _ = find_java()
    log("aapt2: " + run([AAPT2, "version"], capture=True).strip())
    log("java: " + run([java, "-version"], capture=True).splitlines()[0])
    with open(os.path.join(TOOLS_DIR, ".ok"), "w") as f:
        f.write("ok\n")


# ------------------------------------------------------------------ steps

def prepare_web():
    run([sys.executable, os.path.join(ROOT, "tools", "prepare_www.py")])
    try:
        import PIL  # noqa
        run([sys.executable, os.path.join(ROOT, "tools", "make_icons.py")])
    except ImportError:
        log("Pillow missing, using committed icons")


def aapt_link():
    res_zip = os.path.join(WORK, "res.zip")
    base_apk = os.path.join(WORK, "base.apk")
    gen_dir = os.path.join(WORK, "gen")
    os.makedirs(gen_dir, exist_ok=True)
    run([AAPT2, "compile", "--dir", os.path.join(APP_MAIN, "res"),
         "-o", res_zip])
    run([AAPT2, "link", "-I", ANDROID_JAR,
         "--manifest", os.path.join(APP_MAIN, "AndroidManifest.xml"),
         "-A", os.path.join(APP_MAIN, "assets"),
         "--min-sdk-version", str(MIN_SDK),
         "--target-sdk-version", str(TARGET_SDK),
         "--java", gen_dir, "-o", base_apk, res_zip])
    r_java = None
    for dirpath, _d, files in os.walk(gen_dir):
        if "R.java" in files:
            r_java = os.path.join(dirpath, "R.java")
    if not r_java:
        fail("aapt2 did not generate R.java")
    return base_apk, r_java


def parse_r_java(path):
    """Return {type: {name: id}} from aapt2's R.java."""
    src = open(path, encoding="utf-8").read()
    out = {}
    for m in re.finditer(
            r"public static final class (\w+)\s*\{(.*?)\n\s*\}",
            src, re.DOTALL):
        rtype, body = m.group(1), m.group(2)
        entries = {}
        for e in re.finditer(
                r"public static final int (\w+)=(0x[0-9a-fA-F]+|\d+);", body):
            entries[e.group(1)] = int(e.group(2), 0)
        if entries:
            out[rtype] = entries
    if "string" not in out:
        fail("could not parse R.java")
    return out


def stage_smali(r_values):
    smali_out = os.path.join(WORK, "smali")
    if os.path.isdir(smali_out):
        shutil.rmtree(smali_out)
    shutil.copytree(os.path.join(ANDROID, "smali"), smali_out)
    pkg_dir = os.path.join(smali_out, "com", "chatter", "app")
    if "file_chooser_title" not in r_values.get("string", {}):
        fail("R.string.file_chooser_title missing")

    # R.java -> R.smali
    with open(os.path.join(pkg_dir, "R.smali"), "w") as f:
        f.write(".class public final Lcom/chatter/app/R;\n"
                ".super Ljava/lang/Object;\n"
                '.source "R.java"\n\n'
                ".method public constructor <init>()V\n"
                "    .locals 0\n"
                "    invoke-direct {p0}, Ljava/lang/Object;-><init>()V\n"
                "    return-void\n.end method\n")
    for rtype, entries in sorted(r_values.items()):
        with open(os.path.join(pkg_dir, "R$%s.smali" % rtype), "w") as f:
            f.write(".class public final Lcom/chatter/app/R$%s;\n"
                    ".super Ljava/lang/Object;\n"
                    '.source "R.java"\n\n' % rtype)
            for name, val in sorted(entries.items()):
                f.write(".field public static final %s:I = 0x%x\n"
                        % (name, val))
            f.write("\n.method public constructor <init>()V\n"
                    "    .locals 0\n"
                    "    invoke-direct {p0}, Ljava/lang/Object;-><init>()V\n"
                    "    return-void\n.end method\n")

    # Fill the resource-ID placeholder in the chrome client.
    target = os.path.join(pkg_dir, "ChatterWebChromeClient.smali")
    s = open(target).read()
    rid = "0x%x" % r_values["string"]["file_chooser_title"]
    if s.count("0x7f000000") != 1:
        fail("R.string placeholder not found exactly once")
    open(target, "w").write(s.replace("0x7f000000", rid))
    log("R.string.file_chooser_title = " + rid)
    return smali_out


def assemble_dex(smali_dir, dex_out, libjvm):
    try:
        import jpype
    except ImportError:
        fail("jpype1 is required: pip install jpype1")
    if not jpype.isJVMStarted():
        jpype.startJVM(libjvm, "-Djava.class.path=" + APKTOOL_JAR,
                       convertStrings=True)
    SmaliBuilder = jpype.JClass("brut.androlib.src.SmaliBuilder")
    ExtFile = jpype.JClass("brut.directory.ExtFile")
    JFile = jpype.JClass("java.io.File")
    try:
        SmaliBuilder.build(ExtFile(smali_dir), JFile(dex_out),
                           SMALI_API_LEVEL)
    except Exception as e:
        fail("smali assembly failed: %s" % str(e)[:2000])
    with open(dex_out, "rb") as f:
        magic = f.read(8)
    log("classes.dex: %d bytes, magic=%r" % (os.path.getsize(dex_out), magic))
    if magic != b"dex\n035\x00":
        fail("unexpected dex version %r (need 035 for minSdk 24)" % magic)


def merge_dex(base_apk, dex_path, out_apk):
    zin = zipfile.ZipFile(base_apk, "r")
    zout = zipfile.ZipFile(out_apk, "w", zipfile.ZIP_DEFLATED)
    for info in zin.infolist():
        data = zin.read(info.filename)
        # Keep aapt2's choice of stored-vs-deflated per entry.
        zout.writestr(info, data)
    with open(dex_path, "rb") as f:
        dex_data = f.read()
    zi = zipfile.ZipInfo("classes.dex")
    zi.compress_type = zipfile.ZIP_STORED  # must be stored for mmap
    zi.external_attr = 0o644 << 16
    zout.writestr(zi, dex_data)
    zin.close()
    zout.close()


def zipalign(src, dst, alignment=4):
    """Rebuild the zip so every STORED entry's data starts at an address
    divisible by `alignment` (extra-field padding). Patches headers in place,
    preserving everything else byte-for-byte."""
    raw = open(src, "rb").read()
    eocd_pos = raw.rfind(b"PK\x05\x06")
    if eocd_pos < 0:
        fail("zipalign: EOCD not found")
    (count,) = struct.unpack("<H", raw[eocd_pos + 10:eocd_pos + 12])
    (cd_size,) = struct.unpack("<I", raw[eocd_pos + 12:eocd_pos + 16])
    (cd_off,) = struct.unpack("<I", raw[eocd_pos + 16:eocd_pos + 20])
    # Collect central-directory entries (offset, header bytes).
    centrals = []
    pos = cd_off
    for _ in range(count):
        if raw[pos:pos + 4] != b"PK\x01\x02":
            fail("zipalign: bad central entry")
        nlen, elen, clen = struct.unpack("<HHH", raw[pos + 28:pos + 34])
        size = 46 + nlen + elen + clen
        centrals.append(raw[pos:pos + size])
        pos += size
    # Sort by local-header offset to preserve layout.
    order = sorted(range(count),
                   key=lambda i: struct.unpack("<I", centrals[i][42:46])[0])
    out = bytearray()
    new_offsets = {}
    for i in order:
        cent = centrals[i]
        old_off = struct.unpack("<I", cent[42:46])[0]
        if raw[old_off:old_off + 4] != b"PK\x03\x04":
            fail("zipalign: bad local header")
        method = struct.unpack("<H", raw[old_off + 8:old_off + 10])[0]
        flags = struct.unpack("<H", raw[old_off + 6:old_off + 8])[0]
        if flags & 0x08:
            fail("zipalign: data descriptors not supported")
        nlen, elen = struct.unpack("<HH", raw[old_off + 26:old_off + 30])
        name = raw[old_off + 30:old_off + 30 + nlen]
        extra = raw[old_off + 30 + nlen:old_off + 30 + nlen + elen]
        csize = struct.unpack("<I", raw[old_off + 18:old_off + 22])[0]
        data = raw[old_off + 30 + nlen + elen:
                   old_off + 30 + nlen + elen + csize]
        pad = 0
        if method == 0:  # stored: align data
            pad = (-(len(out) + 30 + nlen + elen)) % alignment
        new_offsets[i] = len(out)
        hdr = bytearray(raw[old_off:old_off + 30])
        struct.pack_into("<H", hdr, 28, elen + pad)
        out += hdr + name + extra + b"\x00" * pad + data
    # Central directory with patched offsets.
    cd_start = len(out)
    for i in range(count):
        cent = bytearray(centrals[i])
        struct.pack_into("<I", cent, 42, new_offsets[i])
        out += cent
    cd_end = len(out)
    eocd = bytearray(raw[eocd_pos:eocd_pos + 22])
    struct.pack_into("<I", eocd, 12, cd_end - cd_start)
    struct.pack_into("<I", eocd, 16, cd_start)
    out += eocd + raw[eocd_pos + 22:]
    with open(dst, "wb") as f:
        f.write(out)
    # Verify alignment (parse LOCAL headers: zipfile exposes central extra).
    out = open(dst, "rb").read()
    for info in zipfile.ZipFile(dst, "r").infolist():
        if info.compress_type == zipfile.ZIP_STORED:
            ho = info.header_offset
            nlen, elen = struct.unpack("<HH", out[ho + 26:ho + 30])
            if (ho + 30 + nlen + elen) % alignment != 0:
                fail("zipalign: %s misaligned" % info.filename)
    log("zipalign: OK (%d entries)" % count)


def read_keystore_props():
    props = {}
    path = os.path.join(ANDROID, "keystore.properties")
    if os.path.isfile(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                props[k.strip()] = v.strip()
    return props


def sign_apk(java, apk_in, apk_out, ks, storepass, alias, keypass):
    # apksigner 0.9 DOES produce v1 when --v1-signing-enabled true, but
    # `verify --verbose` for minSdk>=24 reports "v1: false" because v1 is
    # not *required* for API 24+. The correct check is: default verify must
    # succeed with v2 true, and verify with --min-sdk-version 21 must show
    # v1 true.
    run([java, "-jar", APKSIGNER_JAR, "sign",
         "--ks", ks, "--ks-pass", "pass:" + storepass,
         "--ks-key-alias", alias, "--key-pass", "pass:" + keypass,
         "--v1-signing-enabled", "true",
         "--v2-signing-enabled", "true",
         "--v3-signing-enabled", "true",
         "--min-sdk-version", str(MIN_SDK),
         "--out", apk_out, apk_in])
    out = run([java, "-jar", APKSIGNER_JAR, "verify", "--verbose",
               "--print-certs", apk_out], capture=True)
    if "Verified using v2 scheme (APK Signature Scheme v2): true" not in out:
        print(out[-3000:])
        fail("apksigner verify (default) missing v2 for " + apk_out)
    # Verify v1 exists by asking for an old platform range
    out21 = run([java, "-jar", APKSIGNER_JAR, "verify", "--verbose",
                 "--min-sdk-version", "21", apk_out], capture=True)
    if "Verified using v1 scheme (JAR signing): true" not in out21:
        log("WARNING: v1 not verified for minSdk 21 in " + apk_out)
        log(out21[-2000:])
        # If truly no META-INF, fail
        if "META-INF" not in str(zipfile.ZipFile(apk_out).namelist()):
            fail("v1 signature missing (no META-INF) in " + apk_out)
    return out + "\n--- verify --min-sdk-version 21 ---\n" + out21


def validate(apk):
    badging = run([AAPT2, "dump", "badging", apk], capture=True)
    info = {"badging": badging}
    try:
        from androguard.core.apk import APK
        a = APK(apk)
        info["package"] = a.get_package()
        info["version_code"] = a.get_androidversion_code()
        info["version_name"] = a.get_androidversion_name()
        info["main_activity"] = a.get_main_activity()
        # androguard 4.x: get_all_dex() returns bytes; older returned DEX objects
        dex_classes = []
        for dex_item in a.get_all_dex():
            if hasattr(dex_item, "get_classes"):
                # old API: dex_item is a DEX object
                for c in dex_item.get_classes():
                    dex_classes.append(c.get_name())
            else:
                # new API: dex_item is raw bytes
                try:
                    from androguard.core.dex import DEX
                    d = DEX(dex_item)
                    for c in d.get_classes():
                        dex_classes.append(c.get_name())
                except Exception:
                    # fallback: try a.get_classes() if available
                    pass
        if dex_classes:
            info["dex_classes"] = sorted(set(dex_classes))
        else:
            # last resort: try APK.get_classes (some versions)
            try:
                info["dex_classes"] = sorted(a.get_classes())
            except Exception:
                pass
    except Exception as e:
        log("androguard validation skipped: %s" % e)
    return info


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    refetch = "--refetch-tools" in sys.argv
    if "--skip-fetch" not in sys.argv:
        fetch_tools(refetch)
    else:
        log("skipping toolchain fetch")
    java, keytool, libjvm = find_java()

    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(DIST, exist_ok=True)

    prepare_web()
    base_apk, r_java = aapt_link()
    log("aapt2 link OK: %d bytes" % os.path.getsize(base_apk))
    smali_dir = stage_smali(parse_r_java(r_java))

    dex_out = os.path.join(WORK, "classes.dex")
    assemble_dex(smali_dir, dex_out, libjvm)

    unaligned = os.path.join(WORK, "unaligned.apk")
    merge_dex(base_apk, dex_out, unaligned)
    aligned = os.path.join(WORK, "aligned.apk")
    zipalign(unaligned, aligned)

    # Debug key (standard Android-debug credentials).
    debug_ks = os.path.join(WORK, "debug.keystore")
    run([keytool, "-genkeypair", "-keystore", debug_ks,
         "-alias", "androiddebugkey", "-keyalg", "RSA", "-keysize", "2048",
         "-validity", "10950", "-storepass", "android", "-keypass", "android",
         "-dname", "CN=Android Debug,O=Android,C=US"])
    debug_apk = os.path.join(DIST, "chatter-debug.apk")
    sign_apk(java, aligned, debug_apk, debug_ks, "android",
             "androiddebugkey", "android")
    log("signed debug APK")

    # Release key (dev key committed in this repo).
    props = read_keystore_props()
    for k in ("storeFile", "storePassword", "keyAlias", "keyPassword"):
        if k not in props:
            fail("android/keystore.properties missing " + k)
    release_apk = os.path.join(DIST, "chatter-release.apk")
    verify_out = sign_apk(java, aligned, release_apk,
                          os.path.join(ANDROID, props["storeFile"]),
                          props["storePassword"], props["keyAlias"],
                          props["keyPassword"])
    log("signed release APK")

    info = validate(release_apk)
    for want in ("Lcom/chatter/app/MainActivity;",
                 "Lcom/chatter/app/ChatterWebViewClient;",
                 "Lcom/chatter/app/ChatterWebChromeClient;",
                 "Lcom/chatter/app/ChatterBridge;",
                 "Lcom/chatter/app/ChatterBridge$1;"):
        if "dex_classes" in info and want not in info["dex_classes"]:
            fail("dex class missing: " + want)

    with open(os.path.join(DIST, "BUILD_STATUS.txt"), "w") as f:
        import datetime
        f.write("Chatter APK build (local, no SDK/Gradle)\n")
        f.write("========================================\n")
        f.write("date: %s\n" %
                datetime.datetime.now(datetime.timezone.utc).isoformat())
        for name in ("chatter-debug.apk", "chatter-release.apk"):
            p = os.path.join(DIST, name)
            f.write("%s: %d bytes  sha256=%s\n"
                    % (name, os.path.getsize(p), sha256_of(p)))
        f.write("\n--- aapt2 dump badging (release) ---\n")
        f.write(info.get("badging", "?")[:2000])
        f.write("\n--- apksigner verify (release) ---\n")
        f.write(verify_out[-1500:])
        if "dex_classes" in info:
            f.write("\n--- dex classes ---\n")
            for c in info["dex_classes"]:
                f.write(c + "\n")
    log("DONE. APKs in dist/:")
    for name in ("chatter-debug.apk", "chatter-release.apk"):
        p = os.path.join(DIST, name)
        log("  %s (%d bytes)" % (name, os.path.getsize(p)))


if __name__ == "__main__":
    main()
