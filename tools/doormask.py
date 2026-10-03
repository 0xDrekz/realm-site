#!/usr/bin/env python3
"""
REALM — the shape of the opening in the tree.

    python3 tools/doormask.py

Writes door-mask.png: the gap beside the ajar door, as transparency.
gate.js draws the portal through it, and it is what stops the colour
touching the stonework or the door panel.

THE SHAPE IS TRACED BY HAND, not found by colour.

Three attempts found it from colour and all three failed the same way.
Below the foot of the arch, the glow lying on the ground is the SAME
violet as the way through -- so every rule either missed the edges of the
opening or painted the floor outside it. The failure was not in the
thresholds; it is that the picture genuinely does not distinguish them.

So the opening is marked in solid white on a copy of the painting
(art/scenes/door-marked.png) and this lines that copy up with the
original. The mark may be any crop, any scale, drawn on a phone -- the
registration finds where it belongs by matching the painting around it,
with the marked area itself excluded from the comparison so the mark
cannot pull the fit toward itself.

To redo it: paint the opening solid white over the artwork, save it as
art/scenes/door-marked.png, and run this. It prints the GAP and AIM lines
to paste into gate.js.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = f"{ROOT}/art/scenes/tree-source.png"
MARK = f"{ROOT}/art/scenes/door-marked.png"


def marked(img):
    """The white the opening was painted in — one piece, holes filled."""
    a = np.asarray(img).astype(int)
    m = a.min(axis=2) >= 254
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit("no white mark found in " + MARK)
    m = lab == int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))) + 1
    return ndimage.binary_fill_holes(m)


def register(cut, src, mark, coarse=24):
    """Find the scale and offset that lay the marked copy over the painting.

    Scored on everything EXCEPT the mark, so a big white shape cannot drag
    the fit toward whatever in the original happens to be bright.
    """
    sg = np.asarray(src.convert("L")).astype(float)
    W, H = src.size
    valid = ~ndimage.binary_dilation(mark, np.ones((9, 9)))

    def search(scales, xs, ys):
        best = None
        for s in scales:
            nw, nh = int(cut.width * s), int(cut.height * s)
            if nw >= W or nh >= H or nw < 8 or nh < 8:
                continue
            small = np.asarray(cut.resize((nw, nh), Image.LANCZOS).convert("L")).astype(float)
            vm = np.asarray(Image.fromarray((valid * 255).astype(np.uint8))
                            .resize((nw, nh), Image.NEAREST)) > 127
            for oy in ys(nh):
                for ox in xs(nw):
                    d = np.abs(sg[oy:oy + nh, ox:ox + nw] - small)[vm]
                    if d.size < 1000:
                        continue
                    e = d.mean()
                    if best is None or e < best[0]:
                        best = (e, s, ox, oy, nw, nh)
        return best

    rough = search(np.arange(0.30, 1.05, 0.02),
                   lambda nw: range(0, W - nw + 1, max(4, (W - nw) // coarse or 1)),
                   lambda nh: range(0, H - nh + 1, max(4, (H - nh) // coarse or 1)))
    if rough is None:
        raise SystemExit("could not line the mark up with the painting")
    _, s0, x0, y0, _, _ = rough
    fine = search(np.arange(max(0.05, s0 - 0.025), s0 + 0.025, 0.0025),
                  lambda nw: range(max(0, x0 - 14), min(W - nw, x0 + 14) + 1),
                  lambda nh: range(max(0, y0 - 14), min(H - nh, y0 + 14) + 1))
    return fine or rough


def snap(seed, art, reach=14):
    """Grow the hand trace out onto the painting's own edges.

    A line drawn with a finger stops a few pixels short of where the
    stonework actually begins, and on the right of the arch -- where the
    frame curves away and the opening widens -- short by a few pixels is a
    visible strip of unpainted stone.

    So the trace is treated as a SEED rather than as the answer. It grows
    outward, but only into pixels that look like the opening (bright, and
    not the green of the tree or the dark of the frame), and only within
    `reach` pixels of where the hand put it. The hand decides where the
    opening is; the painting decides exactly where it ends.
    """
    r, g, b = art[..., 0], art[..., 1], art[..., 2]
    mean = art.mean(2)
    green = (g > r + 10) & (g > b + 10)
    opening = ~green & (mean > 70)

    near = ndimage.binary_dilation(seed, np.ones((3, 3)), iterations=reach)
    allowed = (opening & near) | seed
    grown = ndimage.binary_propagation(seed, mask=allowed)
    grown = ndimage.binary_closing(grown, np.ones((5, 5)))
    grown = ndimage.binary_fill_holes(grown)
    print(f"  snapped to the painting: {seed.sum()} -> {grown.sum()} pixels")
    return grown


def main():
    src = Image.open(ART).convert("RGB")
    cut = Image.open(MARK).convert("RGB")
    W, H = src.size
    mark = marked(cut)

    err, scale, ox, oy, nw, nh = register(cut, src, mark)
    print(f"  lined up: error {err:.2f}  scale {scale:.4f}  offset {ox},{oy}")
    if err > 14:
        print("  ! that is a poor fit — is the mark drawn on this painting?")

    small = np.asarray(Image.fromarray((mark * 255).astype(np.uint8))
                       .resize((nw, nh), Image.NEAREST)) > 127
    m = np.zeros((H, W), bool)
    m[oy:oy + nh, ox:ox + nw] = small

    lab, n = ndimage.label(m)
    m = lab == int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))) + 1
    m = ndimage.binary_fill_holes(m)

    m = snap(m, np.asarray(src).astype(int))
    m = ndimage.binary_erosion(m, np.ones((3, 3)), iterations=1)   # off the stone

    ys, xs = np.where(m)
    x0, x1 = xs.min() / W, xs.max() / W
    y0, y1 = ys.min() / H, ys.max() / H
    print(f"  the opening: {m.sum()} pixels, x {x0:.3f}-{x1:.3f}, y {y0:.3f}-{y1:.3f}")

    # RGBA, with the shape in the ALPHA channel. A greyscale mask looks right
    # in an image viewer and does nothing in a browser: canvas
    # "destination-in" keeps pixels by alpha, and a grey PNG loads fully
    # opaque, so the portal comes out as its bounding rectangle.
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = m * 255
    Image.fromarray(rgba, "RGBA").save(f"{ROOT}/door-mask.png", optimize=True)
    print(f"  written: door-mask.png "
          f"({os.path.getsize(f'{ROOT}/door-mask.png') // 1024} KB)")

    print("\n  paste into gate.js:")
    print(f"    const AIM = {{ x: {(x0+x1)/2:.3f}, y: {(y0+y1)/2:.3f} }};")
    print(f"    const GAP = {{ x0: {x0-0.003:.3f}, y0: {y0-0.003:.3f}, "
          f"x1: {x1+0.003:.3f}, y1: {y1+0.003:.3f} }};")
    print(f"  and into tools/realm.py:")
    print(f"    CROP = ({x0-0.003:.3f}, {y0-0.003:.3f}, {x1+0.003:.3f}, {y1+0.003:.3f})")


if __name__ == "__main__":
    main()
