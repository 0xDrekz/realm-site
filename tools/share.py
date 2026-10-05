#!/usr/bin/env python3
"""
REALM — the picture that shows when the link is posted (og.png).

    python3 tools/share.py [path-to-realm-collection]

Built from the collection itself and the logo, never from the previous
og.png: the last version copied itself forward and kept showing the old
beings long after the collection was redrawn.

It carries no claim about the collection's shape (that lives in the meta
description, as text). The emblem on the left, four beings on the right,
quiet to loud. The Source is left out on purpose: it stays a surprise.

After running it, bump the ?v= on og.png in the HTML so Telegram, X and
Discord fetch the new picture instead of their cached copy.
"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "realm-collection")
W, H = 1200, 630
VOID = (3, 1, 10)
GOLD = (227, 186, 92)
FONT = "/mnt/skills/examples/canvas-design/canvas-fonts/PixelifySans-Medium.ttf"

# real tokens, one per tier from Legendary up to God
SHOW = [("Legendary", "Lotus Sprite"), ("Mythic", None), ("Entity", "Tide Priest"), ("God", "Sun Wraith")]


def pick(drop, tier, being):
    for t in drop:
        if t["Tier"] == tier and (being is None or t["Being"] == being):
            return t["id"]
    raise SystemExit(f"no {tier} {being or ''} in drop.json")


def main():
    drop = json.load(open(os.path.join(COL, "drop.json")))
    out = Image.new("RGB", (W, H), VOID)

    # a violet bloom behind everything, like the chamber
    glow = Image.new("RGB", (W, H), VOID)
    g = ImageDraw.Draw(glow)
    g.ellipse((60, 40, 560, 590), fill=(70, 30, 120))
    g.ellipse((560, 60, 1180, 570), fill=(40, 18, 72))
    out = Image.blend(out, glow.filter(ImageFilter.GaussianBlur(120)), 0.9)

    # the emblem and the name, on the left
    logo = Image.open(os.path.join(ROOT, "logo.png")).convert("RGB").resize((360, 360), Image.NEAREST)
    mask = Image.eval(logo.convert("L"), lambda v: 255 if v > 14 else 0)
    out.paste(logo, (130, 92), mask)
    d = ImageDraw.Draw(out)
    f = ImageFont.truetype(FONT, 58)
    word = "R E A L M"
    tw = d.textlength(word, font=f)
    d.text((310 - tw / 2, 470), word, font=f, fill=GOLD)
    f2 = ImageFont.truetype(FONT, 24)
    sub = "1,111 beings"
    d.text((310 - d.textlength(sub, font=f2) / 2, 540), sub, font=f2, fill=(157, 143, 196))

    # four real beings, 2 x 2, on the right
    cell, gap = 236, 14
    x0 = W - (cell * 2 + gap) - 86
    y0 = (H - (cell * 2 + gap)) // 2
    for i, (tier, being) in enumerate(SHOW):
        n = pick(drop, tier, being)
        art = Image.open(os.path.join(COL, "images", f"{n}.png")).convert("RGB").resize((cell, cell), Image.LANCZOS)
        x, y = x0 + (i % 2) * (cell + gap), y0 + (i // 2) * (cell + gap)
        out.paste(art, (x, y))
        d.rectangle((x, y, x + cell - 1, y + cell - 1), outline=GOLD)

    # the site's frame
    d.rectangle((18, 18, W - 19, H - 19), outline=GOLD)

    out.save(os.path.join(ROOT, "og.png"), optimize=True)
    out.resize((600, 315), Image.LANCZOS).save(os.path.join(ROOT, "og-small.png"), optimize=True)
    print("og.png written —", os.path.getsize(os.path.join(ROOT, "og.png")) // 1024, "KB")


if __name__ == "__main__":
    main()
