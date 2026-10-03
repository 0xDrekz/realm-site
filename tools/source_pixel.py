#!/usr/bin/env python3
"""
REALM — putting the Source on the collection's pixel grid.

    python3 tools/source_pixel.py        writes art/source-pixel.png

The Source was composed by hand as a painting, and squared onto the 600 x 4
grid it still read as one: soft gradients, no outline, and a busy violet sky
where every other being stands in a black void. Next to the other 1,110 it
looked like it had come from a different collection.

This keeps the composition exactly — nothing is redrawn — and brings it into
the same language as everything else:

  1. the sky behind is pushed most of the way to the collection's black,
     with the figure, its wings and the two mushrooms held as they are;
  2. the collection's own star field is laid into that dark;
  3. it is sharpened on the 600 grid and cut to a fixed palette with no
     dithering, so its edges land on pixel edges the way the others' do;
  4. a dark ink line is drawn on the shadow side of its hardest edges,
     the outline every generated being has.

64 colours, not 48, for the reason drop.py gives: at 48 the green running
down its centre disappears, and so does the blue of its eyes.

art/source.png stays the master. This writes a new file beside it.
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
import traits
from palettes import BY_NAME

GRID, COLOURS, DARKEN = 600, 64, 0.62


def held(a):
    """What stays as painted: the figure, the wings, the mushrooms, the eyes."""
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    mx, mn, lum = a.max(axis=2), a.min(axis=2), a.mean(axis=2)
    sat = (mx - mn) / (mx + 1)
    bone = (sat < 0.30) & (lum > 120)                              # hair, wings, face
    red = (a[:, :, 0] > a[:, :, 2] * 1.3) & (a[:, :, 0] > 90)     # the mushrooms
    keep = ndimage.binary_opening(ndimage.binary_closing(bone | red, iterations=3), iterations=2)
    lab, n = ndimage.label(keep)
    sizes = ndimage.sum(keep, lab, range(1, n + 1))
    big = np.isin(lab, 1 + np.where(sizes > keep.size * 0.004)[0])
    big = ndimage.binary_fill_holes(ndimage.binary_closing(big, iterations=6))
    # its three eyes are the only blue in the middle of the face
    face = (np.abs(xx - w / 2) < w * 0.17) & (yy > h * 0.22) & (yy < h * 0.58)
    eyes = face & (a[:, :, 2] > a[:, :, 0] * 1.15) & (lum < 200)
    eyes = ndimage.binary_dilation(eyes, iterations=4)
    return np.clip(ndimage.gaussian_filter((big | eyes).astype(float), 5) * 1.5, 0, 1), eyes


def ink(img, strength=0.55):
    a = np.asarray(img).astype(float)
    l = a.mean(axis=2)
    g = np.hypot(ndimage.sobel(l, 1), ndimage.sobel(l, 0))
    g /= max(g.max(), 1e-6)
    m = (g > np.percentile(g, 93)) & (l < np.percentile(l, 70))
    a[m] = a[m] * (1 - strength) + np.array([10, 6, 16]) * strength
    return Image.fromarray(a.astype(np.uint8))


def make(src_path=f"{ROOT}/art/source.png", out_path=f"{ROOT}/art/source-pixel.png"):
    src = Image.open(src_path).convert("RGB").resize((GRID, GRID), Image.LANCZOS)
    a = np.asarray(src).astype(float)
    soft, eyes = held(a)

    # the sky toward black
    dark = a * (1 - DARKEN) + np.array([4, 2, 10]) * DARKEN
    a = a * soft[..., None] + dark * (1 - soft[..., None])

    # the eyes a touch bluer, so the palette cut keeps them blue
    a[eyes] = np.clip(a[eyes] * np.array([0.80, 0.92, 1.28]), 0, 255)

    # the collection's stars, only in the dark
    st = traits.stars(GRID, GRID, "Field", BY_NAME["Celestial"], 1111)
    al = st[:, :, 3:4] / 255.0 * (1 - soft[..., None])
    a = a * (1 - al) + st[:, :, :3] * al

    img = Image.fromarray(a.astype(np.uint8))
    img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=160, threshold=2))
    img = img.quantize(colors=COLOURS, method=Image.MEDIANCUT,
                       dither=Image.Dither.NONE).convert("RGB")
    img = ink(img)
    img.resize((GRID * 4, GRID * 4), Image.NEAREST).save(out_path, optimize=True)
    return out_path


if __name__ == "__main__":
    print(make())
