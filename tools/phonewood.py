"""The painting with mushrooms at its feet, for phones (tree-phone*.png).

    python3 tools/phonewood.py

A phone is tall and the forest stands either side of the tree, so a phone
can never step back far enough to see it: the tree would shrink to a band
across the middle. Instead the mushrooms are brought in, in front of the
tree's roots in the bottom corners, taken from art/forest-wide-src.jpg.

Each cluster fades out toward the doorway and upward, and the fade keeps
the caps (anything that is not leaf-green) more solid than the ferns, so
the mushrooms read and their surroundings melt into the painting.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tree = Image.open(os.path.join(ROOT, "tree.png")).convert("RGB")
src = Image.open(os.path.join(ROOT, "art", "forest-wide-src.jpg")).convert("RGB")
TW, TH = tree.size
FEET = 760     # where the clusters stand: above the button, which covers the bottom of a phone

# source box, left edge in the painting, width in the painting, and the band
# (in painting x) over which it fades out toward the doorway
CLUSTERS = [
    ((0, 140, 390, 642),    95, 195, (212, 266)),
    ((770, 120, 1179, 642), 396, 205, (452, 414)),
]


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


a = np.asarray(tree).astype(float)
for box, x0, w, (solid, gone) in CLUSTERS:
    patch = src.crop(box)
    h = round(patch.height * w / patch.width)
    p = np.asarray(patch.resize((w, h), Image.LANCZOS)).astype(float)
    ys, xs = np.mgrid[0:h, 0:w]
    px = xs + x0                                                    # painting x
    across = smooth((gone - px) / (gone - solid))                   # 1 away from the door, 0 at it
    up = smooth(ys / (h * .16))                                     # fades in from the top
    r, g, b = p[..., 0], p[..., 1], p[..., 2]
    green = smooth((g - np.maximum(r, b)) / 30)                     # leaf-green melts sooner
    down = smooth((h - 1 - ys) / (h * .16))                         # and into the ground
    alpha = (across * up * down * (1 - .5 * green))[..., None]
    y0 = FEET - h
    lo, hi = max(0, x0), min(TW, x0 + w)
    p, alpha = p[:, lo - x0:hi - x0], alpha[:, lo - x0:hi - x0]
    region = a[y0:FEET, lo:hi]
    region[:] = region * (1 - alpha) + p * alpha

out = Image.fromarray(a.clip(0, 255).astype(np.uint8))
out.save(os.path.join(ROOT, "tree-phone.png"), optimize=True)
out.resize((340, 458), Image.LANCZOS).save(os.path.join(ROOT, "tree-phone-small.png"), optimize=True)
print("tree-phone.png", out.size)
