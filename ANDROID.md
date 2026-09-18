# Chatter for Android

This repo ships a native Android app alongside the web app. The app is a
small **WebView shell** (framework only — zero external dependencies) that
loads the bundled web app from `assets/www/index.html`, plus native bridges
for the things a WebView cannot do alone.

## Install

Grab the latest APK from [`dist/`](dist/):

| File | What it is |
|---|---|
| `chatter-release.apk` | **Install this one.** Signed release build. |
| `chatter-debug.apk` | Debug-signed build (same features). |

Copy it to your phone, open it, allow "install unknown apps" when asked,
and you're done. Requires **Android 7.0 (API 24) or newer**.
Your chats live on-device exactly like the web version (localStorage);
no account, no server.

## How it works

```
index.html / contacts.json / upcoming_replies.txt / avatars/
        │  tools/prepare_www.py (strips tracking scripts, copies assets)
        ▼
android/app/src/main/assets/www/          ← bundled into the APK
        │  Gradle build (.github/workflows/build-apk.yml)  OR  tools/build_apk.py (no SDK)
        ▼
dist/chatter-release.apk + dist/chatter-debug.apk
```

Every push that touches the web files, `android/`, `tools/` or the workflow
rebuilds both APKs on GitHub Actions and commits them back to `dist/` along
with `dist/BUILD_STATUS.txt` (date, commit, sizes, build log tail). Locally
you can run `tools/build_apk.py` without any SDK.

## Native features

| Web feature | Native support |
|---|---|
| Chat, themes, GIF library, sounds, emoji | WebView as-is (fully offline; online extras need Internet permission) |
| Avatar upload, import `.ctrjs` / `contacts.json` / `upcoming_replies.txt` | System file picker (`ChatterWebChromeClient`) |
| Export backup / contacts / replies | Download bridge (`ChatterBridge`): files are saved to **Downloads** with a toast confirmation |
| GIF search / Drive backup with user keys | Plain HTTPS from the WebView (same as web) |
| Back button | Navigates WebView history first |

Source: `android/app/src/main/java/com/chatter/app/`
(`MainActivity`, `ChatterWebViewClient`, `ChatterWebChromeClient`,
`ChatterBridge`).

## Updating the app

1. Edit the web app (`index.html`, `contacts.json`, `upcoming_replies.txt`,
   `avatars/`) or anything under `android/`.
2. Push. The workflow rebuilds the APKs and commits them to `dist/`.
3. Install the new `chatter-release.apk` over the old one — data is kept
   (same signature, `allowBackup=true`).

To cut a versioned release, bump `versionCode`/`versionName` in
`android/app/build.gradle`.

## Signing key (important)

`chatter-release.apk` is signed with a **development key** that is committed
in this repo (`android/keystore/chatter-dev.keystore`, credentials in
`android/keystore.properties`):

- SHA-256: `15:0F:EF:86:E5:C2:B5:01:E0:E9:A7:47:50:88:07:E3:88:1A:7A:A2:62:CB:0F:58:EF:6A:46:4B:89:04:0A:DC`
- Valid until 2051. Keep using this key (or pin it in Play Console) so
  updates install over existing installs.

⚠️ **Before publishing on Google Play**, generate a fresh private key, keep
it out of git (use GitHub Secrets), and enroll in Play App Signing. Anyone
with this dev key can sign updates for the app.

## Building locally

### No Android SDK required (recommended for local dev)

A pure-Python builder is included that does **not** need Android Studio, SDK,
or Gradle — only Python 3, a JRE (auto-detected via `jdk4py` if installed),
`npm` and `git`:

```bash
pip install jdk4py jpype1 pillow androguard  # one-time
python3 tools/build_apk.py
```

What it does:
1. Fetches a tiny toolchain into `tools/.android-tools/` (aapt2, apktool's
   smali + apksigner 0.9, android-34 android.jar from Sable) — cached.
2. `tools/prepare_www.py` + `tools/make_icons.py` → `assets/www/`
3. `aapt2 compile + link` → base APK + `R.java`
4. `R.java` → `R.smali` + placeholder patch
5. smali (via JPype + apktool's shaded smali, apiLevel 21 → dex 035) → `classes.dex`
6. Merge dex + pure-Python zipalign (4-byte)
7. Sign with debug key + release dev key (`android/keystore/…`) via apksigner
8. Verify: `aapt2 dump badging`, `apksigner verify --verbose` (v2 required,
   v1 present for API 21), androguard dex check → `dist/`

Result: `dist/chatter-debug.apk` + `dist/chatter-release.apk` +
`dist/BUILD_STATUS.txt` (sizes, sha256, badging, verify log).

Notes on signing:
- apksigner 0.9 reports `v1: false` for minSdk 24+ because v1 is not *required*
  for API 24+, but the v1 signature **is** present (checked with
  `--min-sdk-version 21`). The APK thus verifies as `v1 true / v2 true / v3 true`
  for old platforms and `v2 true / v3 true` for API 24+.
- Target SDK 34 requires v2+, so the build gates on `v2 true`.

### With Android Studio / SDK (alternative)

With a full SDK + JDK 17:

```bash
python3 tools/prepare_www.py
cd android
gradle :app:assembleDebug :app:assembleRelease
```

APKs land in `app/build/outputs/apk/`.

## Repository tools

- `tools/build_apk.py` — **no-SDK local builder** (aapt2 + smali via JPype +
  pure-Python zipalign + apksigner) → `dist/*.apk` + `BUILD_STATUS.txt`.
- `tools/prepare_www.py` — builds the tracking-free `assets/www/` tree.
- `tools/make_icons.py` — regenerates launcher icons from
  `Favicon/Chatter.svg` (needs Pillow).
- `tools/check_android_api.py` — verifies every framework API used by the
  Java code exists in a platform `android.jar` (102 checks).
