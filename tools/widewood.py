"""The forest either side of the tree, for wide screens (tree-wide.jpg).

    python3 tools/widewood.py

The painting is tall, made for a phone. On a wide screen the tree is sized
to the height and the forest stands either side of it: great spotted
mushrooms in violet, red and blue, big leaves, ferns and sparks.

The forest is art/forest-wide-src.jpg, a wide picture of the whole scene.
Its own middle (where it shows the doorway) is replaced by the real
painting, lined up on the sun in the canopy, so gate.js can draw the
swaying tree over it and only the forest shows either side. Beyond the
picture's own edges it is carried on by reflection, for very wide screens.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLANK = 700                         # composite px either side of the tree
BLEND = 60                          # px of the painting's edge the forest fades into
SRC_SUN_X = 572                     # where the sun sits in the source picture, px
SCREEN = 1.08                       # gate.js sizes the tree to 1.08 x the window's height

tree = Image.open(os.path.join(ROOT, "tree.png")).convert("RGB")
TW, TH = tree.size
src = Image.open(os.path.join(ROOT, "art", "forest-wide-src.jpg")).convert("RGB")

# the source shows one window; the tree is drawn 1.08 x the window, so the
# window is TH / 1.08 tall in the tree's pixels, sitting low in it
sh = round(TH / SCREEN)
s = sh / src.height
sw = round(src.width * s)
pic = np.asarray(src.resize((sw, sh), Image.LANCZOS)).astype(float)

W = FLANK * 2 + TW
x0 = round(FLANK + 0.492 * TW - SRC_SUN_X * s)     # line the sun up with the painting's
y0 = TH - sh
left, right, top = x0, W - (x0 + sw), y0
pic = np.pad(pic, ((top, 0), (max(0, left), max(0, right)), (0, 0)), mode="reflect")
if left < 0: pic = pic[:, -left:]
a = pic[:, :W].copy()

# the painting itself in the middle, the forest faded into its edge
t = np.asarray(tree).astype(float)
ramp = np.ones(TW)
ramp[:BLEND] = np.linspace(0, 1, BLEND) ** 1.2
ramp[-BLEND:] = np.linspace(1, 0, BLEND) ** 1.2
a[:, FLANK:FLANK + TW] = a[:, FLANK:FLANK + TW] * (1 - ramp[None, :, None]) + t * ramp[None, :, None]

# a little darker at the very edges, where the reflection carries on
xs = np.arange(W)
edge = np.clip(1 - np.minimum(xs, W - 1 - xs) / 260, 0, 1)
a *= (1 - .45 * edge ** 1.5)[None, :, None]

out = Image.fromarray(a.clip(0, 255).astype(np.uint8))
out.save(os.path.join(ROOT, "tree-wide.jpg"), quality=90)
print("tree-wide.jpg", out.size, os.path.getsize(os.path.join(ROOT, "tree-wide.jpg")) // 1024, "KB",
      "| gate.js: WOOD_FLANK", FLANK, "/ 640, WOOD_W", W, "/ 640, WOOD_BLEND", BLEND, "/ 640")
