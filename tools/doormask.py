#!/usr/bin/env python3
"""
REALM — the shape of the opening in the tree.

    python3 tools/doormask.py

Writes door-mask.png: white where the doorway is, black everywhere else.

gate.js draws a live portal through this. The mask is what stops its colours
leaking onto the bark -- eyeballing a rectangle over the arch would spill at
the shoulders, where the frame curves in and the opening does not.

So the shape is taken from the artwork rather than guessed: the opening is
the violet and cyan the painter put inside the arch, kept as one connected
piece, its holes filled, and its edge pulled in a pixel so the portal never
sits on the stonework.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = f"{ROOT}/art/scenes/tree-source.png"


def main():
    a = np.asarray(Image.open(SRC).convert("RGB")).astype(int)
    h, w, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    # The opening is violet and teal, which nothing else in the painting is:
    # the tree is green, the door and its frame are brown and gold.
    viol = (b > g + 18) & (b > r + 10)
    teal = (g > r + 18) & (b > r + 18)
    m = viol | teal

    # ONLY above the foot of the arch. Below that the same colours are the
    # glow lying on the ground OUTSIDE the doorway -- light the door is
    # casting rather than the way through, and painting the portal onto it
    # is the leak that kept coming back.
    box = np.zeros((h, w), bool)
    box[int(0.43 * h):int(0.838 * h), int(0.42 * w):int(0.68 * w)] = True
    m &= box

    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit("found no doorway")
    m = lab == int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))) + 1

    m = ndimage.binary_closing(m, np.ones((9, 9)))
    m = ndimage.binary_fill_holes(m)
    m = ndimage.binary_opening(m, np.ones((5, 5)))
    m = ndimage.binary_erosion(m, np.ones((3, 3)), iterations=1)

    ys, xs = np.where(m)
    print(f"  the opening: {m.sum()} pixels, "
          f"x {xs.min()/w:.3f}-{xs.max()/w:.3f}, y {ys.min()/h:.3f}-{ys.max()/h:.3f}")
    print(f"  put this in gate.js:  GAP = {{ x0: {xs.min()/w-0.004:.3f}, "
          f"y0: {ys.min()/h-0.004:.3f}, x1: {xs.max()/w+0.004:.3f}, "
          f"y1: {ys.max()/h+0.004:.3f} }}")

    # RGBA, with the shape in the ALPHA channel.
    #
    # A greyscale mask looks right in an image viewer and does nothing in a
    # browser: canvas "destination-in" keeps pixels by alpha, and a grey PNG
    # loads fully opaque, so every pixel is kept and the portal comes out as
    # the bounding rectangle. The shape has to BE the transparency.
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (m * 255).astype(np.uint8)
    Image.fromarray(rgba, mode="RGBA").save(f"{ROOT}/door-mask.png", optimize=True)
    print(f"  written: door-mask.png "
          f"({os.path.getsize(f'{ROOT}/door-mask.png') // 1024} KB)")


if __name__ == "__main__":
    main()
