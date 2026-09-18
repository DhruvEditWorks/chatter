#!/usr/bin/env python3
"""Generate Android launcher icons + splash art from the Chatter logo.

Replicates Favicon/Chatter.svg (coral gradient rounded square, white chat
bubble, three coral dots) with Pillow and writes all density buckets plus
the adaptive-icon foreground and the splash-screen mark.

Outputs (under android/app/src/main/res/):
  mipmap-<dpi>/ic_launcher.png        48/72/96/144/192 px
  mipmap-<dpi>/ic_launcher_round.png  same, circle-cropped
  drawable-nodpi/ic_launcher_foreground.png   432 px, bubble on transparency
  drawable-nodpi/splash_mark.png              512 px full icon for splash
"""

import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("make_icons: Pillow is required (pip install pillow)", file=sys.stderr)
    sys.exit(1)

try:
    import numpy as _np  # fast diagonal gradient
except ImportError:
    _np = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

C_TOP = (0xFF, 0x6B, 0x57)      # #ff6b57
C_BOT = (0xFF, 0x8F, 0x5E)      # #ff8f5e
C_MID = (0xFF, 0x7D, 0x58)      # #ff7d58
WHITE = (255, 255, 255, 255)

# SVG geometry in a 64-unit viewBox (see Favicon/Chatter.svg).
RECT = (4, 4, 60, 60)           # x0, y0, x1, y1
RECT_RX = 17
BUBBLE_RECT = (13, 18, 51, 43)
BUBBLE_R = 7
TAIL = [(31.5, 43), (23, 50), (23, 43)]
DOTS = [(25.5, 31.5, C_TOP), (33.5, 31.5, C_MID), (41.5, 31.5, C_BOT)]
DOT_R = 2.7

SS = 4  # supersample factor for smooth edges


def vbox(size):
    """Scale factor from 64-unit viewBox to `size` px."""
    return size / 64.0


def diagonal_gradient(size):
    """Full-bleed diagonal gradient C_TOP -> C_BOT as RGBA image."""
    if _np is not None:
        y, x = _np.mgrid[0:size, 0:size].astype(_np.float32)
        t = ((x + y) / (2.0 * (size - 1)))[..., None]
        top = _np.array(C_TOP, dtype=_np.float32)
        bot = _np.array(C_BOT, dtype=_np.float32)
        rgb = (top + (bot - top) * t).astype(_np.uint8)
        alpha = _np.full((size, size, 1), 255, dtype=_np.uint8)
        return Image.fromarray(_np.concatenate([rgb, alpha], axis=2), "RGBA")
    # Pure-Python fallback (slower): horizontal strips + rotate trick.
    img = Image.new("RGBA", (size, 1))
    px = img.load()
    for x in range(size):
        t = x / max(size - 1, 1)
        px[x, 0] = (round(C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t),
                    round(C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t),
                    round(C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t), 255)
    img = img.resize((size, size))
    return img.rotate(45, resample=Image.BICUBIC, center=(size / 2, size / 2)).crop(
        (0, 0, size, size))


def rounded_mask(size, box, radius):
    k = vbox(size)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([box[0] * k, box[1] * k, box[2] * k, box[3] * k],
                        radius=radius * k, fill=255)
    return mask


def draw_bubble(draw, size):
    """Draw the white bubble + tail + dots onto an ImageDraw (RGBA)."""
    k = vbox(size)
    x0, y0, x1, y1 = BUBBLE_RECT
    draw.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k],
                           radius=BUBBLE_R * k, fill=WHITE)
    draw.polygon([(x * k, y * k) for x, y in TAIL], fill=WHITE)
    for cx, cy, col in DOTS:
        draw.ellipse([cx * k - DOT_R * k, cy * k - DOT_R * k,
                      cx * k + DOT_R * k, cy * k + DOT_R * k],
                     fill=col + (255,))


def full_icon(size):
    """Complete app icon (gradient tile + bubble) at `size` px."""
    big = size * SS
    bg = diagonal_gradient(big)
    bg.putalpha(rounded_mask(big, RECT, RECT_RX))
    d = ImageDraw.Draw(bg)
    draw_bubble(d, big)
    return bg.resize((size, size), Image.LANCZOS)


def bubble_only(size):
    """Bubble + dots centered on transparency (adaptive foreground)."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_bubble(d, big)
    return img.resize((size, size), Image.LANCZOS)


def circle_crop(img):
    s = img.size[0]
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s, s], fill=255)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def save(img, *parts):
    path = os.path.join(RES, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print("make_icons: %s (%d bytes)" % (os.path.relpath(path, ROOT),
                                         os.path.getsize(path)))


def main():
    master = full_icon(1024)
    for dpi, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96),
                    ("xxhdpi", 144), ("xxxhdpi", 192)):
        icon = master.resize((px, px), Image.LANCZOS)
        save(icon, "mipmap-%s" % dpi, "ic_launcher.png")
        save(circle_crop(icon), "mipmap-%s" % dpi, "ic_launcher_round.png")
    save(bubble_only(432), "drawable-nodpi", "ic_launcher_foreground.png")
    save(master.resize((512, 512), Image.LANCZOS), "drawable-nodpi",
         "splash_mark.png")
    print("make_icons: OK")


if __name__ == "__main__":
    main()
