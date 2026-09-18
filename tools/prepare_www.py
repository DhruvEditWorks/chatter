#!/usr/bin/env python3
"""Prepare the web assets for the Chatter Android app.

Reads the repository's web files (index.html, contacts.json,
upcoming_replies.txt, avatars/) and produces a cleaned, self-contained
copy under android/app/src/main/assets/www/.

Cleaning performed on index.html:
  1. Removes the Arena tournament tracking scripts
     (<script data-arena-recording> and <script data-arena-views>), which
     phone home to designarena.ai and load rrweb from a CDN. They are
     useless (and unwanted) inside the mobile app.
  2. Adds mobile-web-app-capable meta tags (harmless on desktop).

Everything else is copied byte-for-byte. Exits non-zero on any failure.
"""

import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "android", "app", "src", "main", "assets", "www")

ARENA_SCRIPT_RE = re.compile(
    r'<script\s+data-arena-[a-z]+="true">.*?</script>', re.DOTALL
)
FORBIDDEN_RE = re.compile(r"arena|rrweb|designarena", re.IGNORECASE)


def fail(msg):
    print("prepare_www: ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def main():
    src_html = os.path.join(ROOT, "index.html")
    if not os.path.isfile(src_html):
        fail("index.html not found at repo root")

    with open(src_html, "r", encoding="utf-8") as f:
        html = f.read()
    print("prepare_www: index.html input: %d bytes" % len(html))

    # 1. Strip Arena tracking scripts.
    html, n = ARENA_SCRIPT_RE.subn("", html)
    print("prepare_www: removed %d arena tracking script block(s)" % n)
    if n < 2:
        fail("expected to remove 2 arena script blocks, removed %d" % n)

    # 2. Mobile meta tags (insert once, right after the viewport meta).
    if "mobile-web-app-capable" not in html:
        html, n = re.subn(
            r'(<meta name="viewport"[^>]*>)',
            r'\1\n    <meta name="mobile-web-app-capable" content="yes" />\n'
            r'    <meta name="apple-mobile-web-app-capable" content="yes" />',
            html,
            count=1,
        )
        if n != 1:
            fail("viewport meta tag not found for meta injection")

    # 3. Safety check: no tracking leftovers.
    leftovers = FORBIDDEN_RE.findall(html)
    if leftovers:
        fail("tracking leftovers still present: %r" % (set(leftovers),))

    # 4. Sanity: the app must still reference its local data files.
    for token in ("./contacts.json", "./upcoming_replies.txt"):
        if token not in html:
            fail("expected token %r missing from index.html" % token)

    # 5. Write output tree.
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    for name in ("contacts.json", "upcoming_replies.txt"):
        src = os.path.join(ROOT, name)
        if not os.path.isfile(src):
            fail("required file missing: " + name)
        shutil.copy2(src, os.path.join(OUT, name))

    av_src = os.path.join(ROOT, "avatars")
    av_dst = os.path.join(OUT, "avatars")
    if not os.path.isdir(av_src):
        fail("avatars/ directory missing")
    shutil.copytree(av_src, av_dst)

    # 6. Report.
    total = 0
    nfiles = 0
    for dirpath, _dirnames, filenames in os.walk(OUT):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            total += os.path.getsize(fp)
            nfiles += 1
    print("prepare_www: wrote %d files, %d bytes -> %s"
          % (nfiles, total, os.path.relpath(OUT, ROOT)))
    print("prepare_www: OK")


if __name__ == "__main__":
    main()
