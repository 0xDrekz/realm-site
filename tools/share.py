#!/usr/bin/env python3
"""
REALM — the picture that shows when the link is posted.

    python3 tools/share.py

The old one said "1,111 BEINGS · 10 SECTORS", baked into the pixels, and it
outlived the sectors by a whole restructure. Every link anybody posted was
advertising a drop that no longer existed, and nothing on the site could
have caught it because it was an image.

So this one carries NO claim about the shape of the collection. It shows the
emblem and four beings, and the wording that can go stale lives in the meta
description in index.html, where it is text and can be checked.

It keeps the top of the existing og.png — the emblem and REALM, which are
still true — and replaces everything under them.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
VOID = (3, 1, 10)
GOLD = (227, 186, 92)

# four beings, quiet to loud, so the strip reads as a range rather than a row
SHOW = ["common", "rare", "god", "source"]


def main():
    out = Image.new("RGB", (W, H), VOID)

    # the emblem, lifted from the existing share image, which is correct
    # above the subtitle line — cropped tight and moved left
    old = Image.open(f"{ROOT}/og.png").convert("RGB")
    mark = old.crop((430, 60, 770, 460))          # the diamond and DMT
    mark = mark.resize((int(mark.width * 0.82), int(mark.height * 0.82)), Image.LANCZOS)
    out.paste(mark, (96, (H - mark.height) // 2))

    # the beings, in a 2 x 2, on the right
    cell, gap = 232, 14
    grid_w = cell * 2 + gap
    x0 = W - grid_w - 96
    y0 = (H - (cell * 2 + gap)) // 2
    for i, key in enumerate(SHOW):
        p = f"{ROOT}/preview/{key}.png"
        if not os.path.exists(p):
            raise SystemExit(f"missing {p} — run tools/preview.py first")
        art = Image.open(p).convert("RGB").resize((cell, cell), Image.NEAREST)
        x = x0 + (i % 2) * (cell + gap)
        y = y0 + (i // 2) * (cell + gap)
        out.paste(art, (x, y))
        # a hairline, the same one used everywhere else on the site
        for e in range(cell):
            for (px, py) in ((x + e, y), (x + e, y + cell - 1),
                             (x, y + e), (x + cell - 1, y + e)):
                out.putpixel((px, py), GOLD)

    # the frame the site's own pages carry
    for e in range(W):
        out.putpixel((e, 18), GOLD); out.putpixel((e, H - 19), GOLD)
    for e in range(H):
        out.putpixel((18, e), GOLD); out.putpixel((W - 19, e), GOLD)

    out.save(f"{ROOT}/og.png", optimize=True)
    small = out.resize((600, 315), Image.LANCZOS)
    small.save(f"{ROOT}/og-small.png", optimize=True)
    print(f"og.png written — {os.path.getsize(f'{ROOT}/og.png') // 1024} KB, no claims baked in")


if __name__ == "__main__":
    main()
