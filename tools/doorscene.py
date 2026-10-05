"""The door scene: door.jpg and the cut-out of its doorway (door-mask.png).

    pip install scipy
    python3 tools/doorscene.py path/to/picture.jpg

The picture is the whole first screen, on phones and computers alike: the
tree, the door and the mushroom forest either side. The light through the
doorway is drawn live by gate.js on top of the opening, so the opening is
found here and written out as door-mask.png (the shape is in the alpha).

The opening is the one place in the picture that is saturated violet,
green, red or magenta. Inside a box around the door that colour is found,
the largest patch kept and its holes filled.

Prints the AIM and GAP lines for the top of gate.js.
"""
import os, sys
import numpy as np
from scipy import ndimage
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRIM = 12                       # the screenshot's rounded corners
BOX = (548, 205, 660, 535)      # around the opening, in the trimmed picture

src = Image.open(sys.argv[1]).convert("RGB")
pic = src.crop((TRIM, TRIM, src.width - TRIM, src.height - TRIM))
pic.save(os.path.join(ROOT, "door.jpg"), quality=92)

hsv = np.asarray(pic.convert("HSV")).astype(int)
h, s, v = hsv[..., 0] * 360 // 255, hsv[..., 1], hsv[..., 2]
lit = (s > 110) & (v > 70) & (((h >= 80) & (h <= 150)) | (h >= 250) | (h <= 12))
x0, y0, x1, y1 = BOX
m = np.zeros(lit.shape, bool)
m[y0:y1, x0:x1] = lit[y0:y1, x0:x1]
m = ndimage.binary_closing(m, iterations=3)
lab, n = ndimage.label(m)
m = lab == 1 + np.argmax(ndimage.sum(m, lab, range(1, n + 1)))
m = ndimage.binary_fill_holes(m)
m = ndimage.binary_dilation(m, iterations=2)    # just over the painted edge

rgba = np.zeros(m.shape + (4,), np.uint8)
rgba[..., 3] = m * 255
Image.fromarray(rgba, "RGBA").save(os.path.join(ROOT, "door-mask.png"), optimize=True)

ys, xs = np.where(m)
W, H = pic.size
print("door.jpg", pic.size)
print(f"const AIM = {{ x: {xs.mean() / W:.3f}, y: {ys.mean() / H:.3f} }};")
print(f"const GAP = {{ x0: {(xs.min() - 1) / W:.3f}, y0: {(ys.min() - 1) / H:.3f}, "
      f"x1: {(xs.max() + 2) / W:.3f}, y1: {(ys.max() + 2) / H:.3f} }};")
