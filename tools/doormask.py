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

    # The opening is everything in the arch that is NOT green.
    #
    # Looking only for violet and cyan found the bright core of the gap and
    # missed its edges, where the light has gone pale or warm -- so the
    # portal came out as a narrow slot when the opening is most of the
    # archway beside the door. The frame and the tree are green; the door
    # panel is dark; everything else in there is the way through.
    green = (a[..., 1] > a[..., 0] + 6) & (a[..., 1] > a[..., 2] + 6)
    inside = ~green & (a.mean(2) > 46)

    box = np.zeros((h, w), bool)
    # The lower bound is 0.885, not the 0.95 it was: below that the light
    # spills out past the arch onto the step, and a portal that paints the
    # threshold is leaking out of the doorway rather than coming through it.
    # Down to 0.945: the light spreads left across the step at the foot of
    # the arch, and that spread is part of the opening rather than a leak
    # out of it -- it is still inside the archway, on the floor of it.
    box[int(0.515 * h):int(0.945 * h), int(0.33 * w):int(0.68 * w)] = True
    m = inside & box

    # one piece, not the speckle of sky showing through leaves nearby
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit("found no doorway")
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    m = lab == (int(np.argmax(sizes)) + 1)

    # close the gaps the swirl leaves, then fill it solid
    m = ndimage.binary_closing(m, np.ones((11, 11)))
    m = ndimage.binary_fill_holes(m)
    m = ndimage.binary_opening(m, np.ones((5, 5)))
    m = ndimage.binary_fill_holes(m)

    # step back off the stonework
    m = ndimage.binary_erosion(m, np.ones((3, 3)), iterations=2)

    ys, xs = np.where(m)
    print(f"  the opening: {m.sum()} pixels, "
          f"x {xs.min()/w:.3f}-{xs.max()/w:.3f}, y {ys.min()/h:.3f}-{ys.max()/h:.3f}")
    print(f"  centre {xs.mean()/w:.3f}, {ys.mean()/h:.3f}")

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
