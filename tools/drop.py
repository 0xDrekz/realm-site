#!/usr/bin/env python3
"""
REALM — generating the whole drop.

    python3 tools/drop.py [out-dir]

1,111 beings in one go: 1,110 generated, and then the Source, which is not
generated because it was composed by hand.

There are no rounds and no sectors. The collection is made in one pass, which
is what lets uniqueness be checked across the whole thing — the check that
actually matters.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
import round as R
from render import render
from palettes import BY_NAME
from weaves import WEAVES

GENERATED = R.GENERATED                      # 1,110
TOTAL = GENERATED + 1                        # the Source is the 1,111th

# ---- the Source ----------------------------------------------------------
# The 1,111th being. One in the collection, weight 111, and the only being
# that is not one of ten of its kind.
#
# It is the ONE picture in the collection that is not generated. It arrived
# as a finished composition with its own geometry, mushrooms and smoke, so
# putting it through trait generation would lay a second mandala over the
# first. It is squared, put on the same 600 x 4 grid as everything else, and
# used as drawn.
#
# Its palette is 64 colours rather than the collection's 48. That is not a
# preference: at 48 the green channel down its centre disappears completely —
# 0 of 7,143 pixels survive, measured — and at 64 it comes back.
SOURCE_ART   = f"{ROOT}/art/source.png"
SOURCE_DRAWN = True

# what is actually in the picture, rather than what a roll would have given it
SOURCE_TRAITS = dict(Stars="None", Geometry="Yantra", GeometryUnder="Mandala",
                     Lightning="None", UFOs="None", Planets="None",
                     Explosions="None", Mushrooms="Few", Trees="None",
                     Smoke="Shroud", Dust="Faint", Spores="Golden",
                     Aura="Cold", Eyes="Slit")


def make_source(out_dir, n, rng):
    if not os.path.exists(SOURCE_ART):
        raise SystemExit(f"the Source's picture is missing: {SOURCE_ART}")
    img = Image.open(SOURCE_ART).convert("RGB")
    if img.size != (2400, 2400):
        raise SystemExit(f"the Source is {img.size[0]}x{img.size[1]}, not 2400x2400")
    png = f"{out_dir}/images/{n}.png"
    img.save(png, optimize=True)

    attrs = [{"trait_type": "Tier", "value": "Source"},
             {"trait_type": "Being", "value": "source"},
             {"trait_type": "Colourway", "value": "The Source"}]
    for k in ("Geometry", "Stars", "Planets", "UFOs", "Explosions", "Lightning",
              "Smoke", "Dust", "Trees", "Mushrooms", "Spores", "Aura", "Eyes"):
        attrs.append({"trait_type": k, "value": SOURCE_TRAITS[k]})

    json.dump({"name": f"REALM #{n} \u2014 The Source", "symbol": "REALM",
               "description": "The 1,111th being of the realm. There is one, "
                              "and there will never be another.",
               "image": f"{n}.png", "attributes": attrs,
               "properties": {"files": [{"uri": f"{n}.png", "type": "image/png"}],
                              "category": "image"}},
              open(f"{out_dir}/metadata/{n}.json", "w"), indent=2)

    row = {"id": n, "tier": "source", "being": "source",
           "colourway": "The Source", "png": png, "loud": 1.0}
    row.update({k: SOURCE_TRAITS[k] for k in R.TRAITS})
    return row


# ---- checking the whole drop --------------------------------------------
def verify(rows, out_dir):
    bad = []

    if len(rows) != TOTAL:
        bad.append(f"{len(rows)} beings, not {TOTAL}")

    want = dict(R.COUNTS)
    want["source"] = 1
    got = {}
    for r in rows:
        got[r["tier"]] = got.get(r["tier"], 0) + 1
    for tier, n in want.items():
        if got.get(tier, 0) != n:
            bad.append(f"{got.get(tier, 0)} {tier}, not {n}")

    # numbered straight through with no gaps and no repeats
    ids = sorted(r["id"] for r in rows)
    if ids != list(range(1, TOTAL + 1)):
        bad.append("the ids are not 1.." + str(TOTAL) + " exactly once")

    # every combination unique across the whole collection
    keys = [(r["being"], r["colourway"]) + tuple(r[k] for k in R.TRAITS) for r in rows]
    if len(set(keys)) != len(keys):
        bad.append(f"{len(keys) - len(set(keys))} repeated combinations")

    # every picture there, the right size, and not blank
    for r in rows:
        if not os.path.exists(r["png"]):
            bad.append(f"#{r['id']}: no image"); continue
        im = Image.open(r["png"])
        if im.size != (2400, 2400):
            bad.append(f"#{r['id']}: {im.size[0]}x{im.size[1]}, not 2400x2400")
        a = np.asarray(im.convert("RGB"))
        if a.std() < 3:
            bad.append(f"#{r['id']}: blank")

    if bad:
        print(f"\n{len(bad)} problem(s):")
        for b in bad[:40]:
            print("  - " + b)
        raise SystemExit(1)

    print(f"\nall checks pass: {TOTAL} beings, tier counts exact, "
          "every combination unique, every image present.")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/out/drop"
    os.makedirs(f"{out}/images", exist_ok=True)
    os.makedirs(f"{out}/metadata", exist_ok=True)

    print(f"generating {GENERATED} beings")
    rows = R.generate(out)

    print("the Source")
    rows.append(make_source(out, TOTAL, np.random.default_rng(1111)))

    json.dump(rows, open(f"{out}/drop.json", "w"), indent=2)
    verify(rows, out)


if __name__ == "__main__":
    main()
