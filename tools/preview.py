#!/usr/bin/env python3
"""
REALM — the eight pictures shown on the website.

One being per tier, beside the tier names in the Beings panel.

They come out of the same pipeline as the collection but from a seed that
belongs to NO round, so nothing on the page is a token anybody will be
minted. They show what a tier looks like; they are not the thing being sold.
"""
import os, sys, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
from render import render
from palettes import BY_NAME
from weaves import WEAVES

BEINGS = json.load(open(f"{ROOT}/art/beings.json"))
PAL = {"Regalia":"Void", "Verdant":"Verdigris", "Furnace":"Ember", "Abyss":"Deep",
       "Ossuary":"Bone", "Auric":"Aurum", "Bloom":"Bloom", "Eclipse":"Eclipse"}

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
 ("entity",    "crowned-entity", "Auric",   dict(Stars="Dense",  Geometry="Gatefold",
                                                 UFOs="Few", Explosions="One")),
 ("god",       "god-serpent",    "Eclipse", dict(Stars="Dense",  Geometry="Rosette",
                                                 GeometryUnder="Flower", Lightning="Tempest",
                                                 UFOs="Few", Planets="Ringed",
                                                 Explosions="Two", Mushrooms="Grove",
                                                 Smoke="Wisp")),

 # ---- PLACEHOLDER ----
 # The Source is the 1,111th being and there is exactly one. It has not been
 # drawn yet, so this is the God's drawing wearing the Source's palette and
 # every trait at its loudest. It is here so the site is not missing a tier;
 # it is NOT the Source. Replace the drawing and delete this note.
 ("source",    "god-serpent",    "Auric",   dict(Stars="Dense",  Geometry="Metatron",
                                                 GeometryUnder="Mandala",
                                                 Lightning="Tempest", UFOs="Fleet",
                                                 Planets="Cluster", Explosions="Barrage",
                                                 Mushrooms="Grove", Trees="Copse",
                                                 Smoke="Shroud", Dust="Heavy",
                                                 Spores="Golden", Aura="Warm")),
]

BASE = dict(Stars="None", Planets="None", Geometry="None", GeometryUnder="None",
            UFOs="None", Smoke="None", Dust="Faint", Eyes="Ringed",
            Explosions="None", Lightning="None", Trees="None", Mushrooms="None",
            Spores="Golden", Aura="Opposed")


def main():
    os.makedirs(f"{ROOT}/preview", exist_ok=True)
    for tier, being, wname, extra in SHOW:
        info = BEINGS[being]
        t = dict(BASE); t.update(extra)
        t["ExtraEyes"] = info.get("extra_eyes") or None
        pal = dict(BY_NAME[PAL[wname]]); pal["weave"] = dict(WEAVES[wname])
        img = render(f"{ROOT}/art/beings/{being}.png", pal, t, 600, 4, seed=SEED,
                     mode=info["mode"], eye_mode=info.get("eye_mode", "holes"),
                     fill=480/600, colours=48)
        # shrunk, then cut to 64 colours: a page does not need 2400 pixels
        img.resize((360, 360), Image.BOX).convert("RGB") \
           .quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE) \
           .save(f"{ROOT}/preview/{tier}.png", optimize=True)
        print(f"  {tier:10s} {being}")


if __name__ == "__main__":
    main()
