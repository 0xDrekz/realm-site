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
from PIL import Image, ImageFilter

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
# This is deliberately NOT the GAP that gate.js clips to. The mask stops at
# the doorstep and starts at the left edge of the opening; this only has to
# be a patch of the painting worth stretching, so it takes the widest, most
# evenly lit column available and ignores where the doorway actually is.
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

    # Put the bite back in first.
    #
    # Flattening the strip (below) is what stops dark bands drifting through
    # the arch, but it works by pulling every row and column toward the
    # average -- and that takes the local contrast with it. The result filled
    # the doorway evenly and read as a flat wash.
    #
    # So the contrast is pushed UP before the flattening and the flattening
    # then removes whatever bands that amplified. Doing it the other way
    # round would re-introduce the bands it just took out.
    mu = a.mean()
    a = np.clip(mu + (a - mu) * 1.38, 0, 255)

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
    #
    # Twice round, and almost all the way: one pass at 0.82 left the columns
    # running 83 to 141 once the contrast above was pushed up, because the
    # pass only corrects the fraction of the drift it is given and the
    # contrast boost had made the drift bigger.
    for _ in range(2):
        for axis in (1, 0):
            band = a.mean(axis=(axis, 2), keepdims=True)
            a = np.clip(a * (0.95 * (a.mean() / np.maximum(band, 1)) + 0.05), 0, 255)

    # push the colour out: this sits behind a doorway in a green tree and has
    # to read as somewhere else entirely
    g = a.mean(axis=2, keepdims=True)
    a = np.clip(g + (a - g) * 1.45, 0, 255)
    a = np.clip(255 * (a / 255) ** 0.94, 0, 255)      # barely lifted: richer, not paler

    # Nothing in here may be black.
    #
    # The texture supplies the LIGHTNESS of what is in the doorway -- the
    # colour comes from a separate field drawn over it with the "color"
    # blend, which keeps the backdrop's lightness and replaces its hue. So a
    # pixel that is black here stays black there however vivid the colour
    # over it, and the contrast boost above had left enough of them to read
    # as holes punched in the portal.
    #
    # Lifting the floor costs a little contrast and buys a doorway with
    # nothing missing from it.
    # Nor pure white. Where the texture peaks the colour over it comes out
    # as a pale wash, because the "color" blend cannot saturate a pixel that
    # has no room left to be lighter. Holding the ceiling down keeps the
    # highlights coloured instead of bleached.
    FLOOR, CEIL = 40, 228
    a = FLOOR + a * (CEIL - FLOOR) / 255

    # And then held DOWN.
    #
    # The colour over this is applied with the "color" blend, which takes
    # the lightness from here -- so a bright texture gives pastel, not
    # vivid. At a mean of 199 the doorway came out as watercolour. Rich
    # colour wants its lightness in the middle, with the highlights earning
    # their brightness rather than everything being bright at once.
    a = np.clip(255 * (a / 255) ** 1.22, 0, 255)

    # Give it edges.
    #
    # The strip is a photograph of a painted glow, so left alone it is
    # SOFT -- and dropped into a site built entirely out of hard pixels,
    # the one soft thing on the screen is the doorway, which is the one
    # place that was supposed to have the most in it. It read as airbrush.
    #
    # Sharpened, then cut into bands of brightness with the colour of each
    # pixel kept: the shapes in it get an edge and the whole thing speaks
    # the same language as the rest of the artwork.
    blur = np.stack([np.asarray(Image.fromarray(a[..., c].astype(np.uint8))
                                .filter(ImageFilter.GaussianBlur(1.6)), float)
                     for c in range(3)], axis=2)
    a = np.clip(a + (a - blur) * 0.9, 0, 255)

    BANDS = 11
    v = a.max(axis=2, keepdims=True)
    step = np.clip(np.round(v / 255 * BANDS) / BANDS * 255, 1, 255)
    a = np.clip(a * (step / np.maximum(v, 1)), 0, 255)

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
