#!/usr/bin/env python3
"""
REALM — installing the tree.

    python3 tools/installtree.py

The painting in art/scenes/tree-source.png, sized and palletised for the
site. A LIGHT touch: this one arrived with a white sun, a lit doorway and
clean edges, so it is not banded or darkened the way the old soft one had
to be. The site's pixel look comes from drawing it at PX=2 with nearest,
not from damaging the source.

The sun's core is stamped white after quantising, because a palette built
from a mostly-green picture will not spend an entry on the few hundred
pixels that say "this is a light".
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUN = (0.492, 0.298)


def build(src, width, cols, path, core_r):
    a = np.asarray(Image.open(src).convert("RGB")).astype(float)
    h0, w0, _ = a.shape
    g = a.mean(axis=2, keepdims=True)
    a = np.clip(g + (a - g) * 1.12, 0, 255)
    a = np.clip(255 * (a / 255) ** 1.06, 0, 255)

    im = Image.fromarray(a.astype(np.uint8))
    if width != w0:
        im = im.resize((width, round(width * h0 / w0)), Image.LANCZOS)

    q = im.quantize(colors=cols - 1, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()[:(cols - 1) * 3] + [255, 255, 255]
    idx = np.asarray(q).copy()
    hh, ww = idx.shape
    yy, xx = np.mgrid[0:hh, 0:ww]
    d = np.sqrt((xx - SUN[0] * ww) ** 2 + (yy - SUN[1] * hh) ** 2)
    idx[d < core_r * ww] = cols - 1

    out = Image.fromarray(idx, "P")
    out.putpalette(pal)
    out.save(f"{ROOT}/{path}", optimize=True)
    arr = np.asarray(out.convert("RGB"))
    print(f"  {path:16s} {out.size}  {os.path.getsize(f'{ROOT}/{path}')//1024:>4} KB  "
          f"white px {(arr.min(axis=2) > 250).sum()}")


def main():
    src = f"{ROOT}/art/scenes/tree-source.png"
    print("installing the tree:")
    build(src, 640, 96, "tree.png", 0.009)
    build(src, 340, 64, "tree-small.png", 0.011)
    print("\nthen: python3 tools/doormask.py  and  python3 tools/realm.py")


if __name__ == "__main__":
    main()
