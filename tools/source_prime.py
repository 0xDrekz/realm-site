#!/usr/bin/env python3
"""
REALM — the Prime Source, coloured from its greyscale master.

    python3 tools/source_prime.py        writes art/source-prime.png

The master (art/masters/prime-source-grey.jpg) is drawn in greys so its
colour can be chosen and changed without redrawing it. The star is found
as the bright structure round the middle and given a gold ramp; the clouds
and sky around it get violet and teal, swept round the picture. Cut to 64
colours on the collection's 600 grid and blown up to 2400.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = f"{ROOT}/art/masters/prime-source-grey.jpg"
OUT = f"{ROOT}/art/source-prime.png"

DARK = (6, 3, 18)
GOLD = [DARK, (80, 40, 90), (210, 140, 40), (255, 214, 100), (255, 252, 226)]
VIOLET = [DARK, (60, 24, 120), (150, 70, 230), (220, 170, 255), (255, 240, 255)]
TEAL = [DARK, (14, 50, 110), (40, 170, 220), (160, 240, 255), (240, 255, 255)]


def _ramp(stops, v):
    stops = np.array(stops, float)
    idx = np.clip(v, 0, 1) * (len(stops) - 1)
    lo = np.floor(idx).astype(int)
    hi = np.minimum(lo + 1, len(stops) - 1)
    f = (idx - lo)[..., None]
    return stops[lo] * (1 - f) + stops[hi] * f


def make(master=MASTER, out=OUT, grid=600):
    src = Image.open(master).convert("L")
    w, h = src.size
    side = min(w, h)
    src = src.crop(((w - side) // 2, (h - side) // 2,
                    (w - side) // 2 + side, (h - side) // 2 + side))
    g = np.asarray(src.resize((grid, grid), Image.BOX)).astype(float) / 255

    # the eye: the brightest place once the picture is blurred
    cy, cx = np.unravel_index(ndimage.gaussian_filter(g, 12).argmax(), g.shape)
    yy, xx = np.mgrid[0:grid, 0:grid]
    r = np.hypot(yy - cy, xx - cx) / (grid / 2)
    ang = np.arctan2(yy - cy, xx - cx)

    # the star is bright structure near the middle; the clouds are dimmer, further out
    local = ndimage.uniform_filter(g, 25)
    star = np.clip((r < 1.05) * (1.15 - r) * 1.6, 0, 1) * np.clip((local - 0.12) * 4, 0, 1)
    star = np.clip(ndimage.gaussian_filter(star, 3) * 1.4, 0, 1)[..., None]
    sweep = (0.5 + 0.5 * np.sin(ang + 0.6))[..., None]

    clouds = _ramp(VIOLET, g) * sweep + _ramp(TEAL, g) * (1 - sweep)
    c = _ramp(GOLD, g) * star + clouds * (1 - star)
    img = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8))
    img = img.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    img.resize((grid * 4, grid * 4), Image.NEAREST).save(out, optimize=True)
    return out


if __name__ == "__main__":
    print(make())
