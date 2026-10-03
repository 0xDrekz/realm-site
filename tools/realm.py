#!/usr/bin/env python3
"""
REALM — the thing you see through the doorway.

    python3 tools/realm.py

Makes realm.png: a tall, seamless, vivid texture that gate.js drifts behind
the open door.

It is built from the Source's own artwork rather than generated. A
procedural plasma was tried first and looked like a screensaver -- the
problem was not its colours or its detail, it was that nothing generated
carries the density of something drawn. This takes the geometry and smoke
from the corner of the Source, where there is no creature, and that reads
as a place immediately.

Seamless vertically: the strip is stacked with its own mirror, so drifting
upward through it loops for ever with no join.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = f"{ROOT}/art/scenes/tree-source.png"

# The top-left corner: geometry and smoke only.
#
# A taller crop reached the mushroom, and a mushroom cap is a RECOGNISABLE
# THING -- it made the doorway read as a picture of a mushroom rather than
# as a place. Nothing nameable may be in here. The realm has to be texture
# and depth, not objects.
# The BRIGHT part of the gap, not all of it.
#
# The opening's own top is in shadow -- brightness 68 against 120 to 200
# further down -- and lifting the whole gap meant that dark band drifted
# up through the arch and left the top of the doorway looking unfilled.
# Starting below it takes only the lit column.
CROP = (0.422, 0.560, 0.640, 0.943)
OUT_W = 220


def main():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    box = (int(CROP[0] * w), int(CROP[1] * h), int(CROP[2] * w), int(CROP[3] * h))
    strip = im.crop(box)

    ow = OUT_W
    oh = round(ow * strip.height / strip.width)
    strip = strip.resize((ow, oh), Image.LANCZOS)

    a = np.asarray(strip).astype(float)

    # Even it out BOTH WAYS.
    #
    # The strip is a photograph of the gap, so it carries the gap's own
    # shading: dark at the top where the arch is in shadow, and dark down
    # BOTH EDGES where the light falls away beside the door and beside the
    # frame. Stretched across the whole opening, those dark edges land
    # inside it -- the left one hides behind the door, and the right one is
    # a strip of unlit doorway that looks exactly like a gap in the fill.
    #
    # Measured before this: 63 at the edges against 188 in the middle, and
    # 68 at the top against 199 lower down.
    #
    # Each row and each column is pulled most of the way toward the strip's
    # average, so the colour still varies and the brightness does not. It
    # also hides the join where the mirror meets.
    for axis in (1, 0):
        band = a.mean(axis=(axis, 2), keepdims=True)
        a = np.clip(a * (0.82 * (a.mean() / np.maximum(band, 1)) + 0.18), 0, 255)

    # push the colour out: this sits behind a doorway in a green tree and has
    # to read as somewhere else entirely
    g = a.mean(axis=2, keepdims=True)
    a = np.clip(g + (a - g) * 1.45, 0, 255)
    a = np.clip(255 * (a / 255) ** 0.94, 0, 255)      # barely lifted: richer, not paler

    # stack with its own mirror so a slow drift upward never shows a join
    top = a
    bot = a[::-1]
    tile = np.concatenate([top, bot], axis=0)

    out = Image.fromarray(tile.astype(np.uint8))
    q = out.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    q.save(f"{ROOT}/realm.png", optimize=True)

    arr = np.asarray(q.convert("RGB"))
    mx, mn = arr.max(2), arr.min(2)
    sat = np.where(mx > 8, (mx - mn) / np.maximum(mx, 1), 0)
    print(f"  realm.png  {out.size}  {os.path.getsize(f'{ROOT}/realm.png')//1024} KB")
    print(f"  mean {arr.mean():.0f}  saturation {sat.mean():.3f}  "
          f"(the tree's is about 0.30)")
    print("  seamless vertically: the second half is the first, mirrored")


if __name__ == "__main__":
    main()
