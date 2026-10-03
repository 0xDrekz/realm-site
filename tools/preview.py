#!/usr/bin/env python3
"""
REALM — the nine pictures shown on the website.

One being per tier, beside the tier names in the Beings panel.

They come out of the same pipeline as the collection but from a seed that
belongs to NO part of the collection, so nothing on the page is a token
anybody will be minted. The Source is the exception: there is one of it,
and the page shows the real thing. They show what a tier looks like; they are not the thing being sold.
"""
import os, sys, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
from render import render
from palettes import BY_NAME
from weaves import ALL_WEAVES
from round import PALETTE_FOR as PAL

BEINGS = json.load(open(f"{ROOT}/art/beings.json"))

SEED = 90210          # belongs to no round

SHOW = [
 ("common",    "grey-tall",      "Abyss",   dict(Stars="Sparse", Geometry="Lattice")),
 ("uncommon",  "reptilian",      "Verdant", dict(Stars="Field",  Geometry="Yantra")),
 ("rare",      "cyclops",        "Furnace", dict(Stars="Field",  Geometry="Flower",
                                                 Mushrooms="Few")),
 ("epic",      "fanged",         "Abyss",   dict(Stars="Field",  Geometry="Metatron",
                                                 Planets="One")),
 ("legendary", "fairy",          "Bloom",   dict(Stars="Dense",  Geometry="Rosette",
                                                 Mushrooms="Cluster")),
 ("mythic",    "six-eyed",       "Eclipse", dict(Stars="Dense",  Geometry="Spiral",
                                                 Lightning="Storm")),
 ("entity",    "crowned-entity", "Sapphire",   dict(Stars="Dense",  Geometry="Gatefold",
                                                 UFOs="Few", Explosions="One")),
 ("god",       "god-serpent",    "Prism", dict(Stars="Dense",  Geometry="Rosette",
                                                 GeometryUnder="Flower", Lightning="Tempest",
                                                 UFOs="Few", Planets="Ringed",
                                                 Explosions="Two", Mushrooms="Grove",
                                                 Smoke="Wisp")),

]

BASE = dict(Stars="None", Planets="None", Geometry="None", GeometryUnder="None",
            UFOs="None", Smoke="None", Dust="Faint", Eyes="Ringed",
            Explosions="None", Lightning="None", Trees="None", Mushrooms="None",
            Spores="Golden", Aura="Opposed")


def main():
    os.makedirs(f"{ROOT}/preview", exist_ok=True)

    # The Source is not generated — it arrived as a finished composition. Its
    # preview is the version in the collection, on the pixel grid, shrunk.
    src = f"{ROOT}/art/source-pixel.png"
    if os.path.exists(src):
        Image.open(src).convert("RGB").resize((360, 360), Image.BOX) \
             .quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE) \
             .save(f"{ROOT}/preview/source.png", optimize=True)
        print("  source     (the finished drawing, on the pixel grid)")

    for tier, being, wname, extra in SHOW:
        info = BEINGS[being]
        t = dict(BASE); t.update(extra)
        t["ExtraEyes"] = info.get("extra_eyes") or None
        pal = dict(BY_NAME[PAL[wname]]); pal["weave"] = dict(ALL_WEAVES[wname])
        img = render(f"{ROOT}/art/beings/{being}.png", pal, t, 600, 4, seed=SEED,
                     mode=info["mode"], eye_mode=info.get("eye_mode", "holes"),
                     fill=480/600, colours=48, tone=info.get("tone"))
        # shrunk, then cut to 64 colours: a page does not need 2400 pixels
        img.resize((360, 360), Image.BOX).convert("RGB") \
           .quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE) \
           .save(f"{ROOT}/preview/{tier}.png", optimize=True)
        print(f"  {tier:10s} {being}")


if __name__ == "__main__":
    main()
