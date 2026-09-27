#!/usr/bin/env python3
"""
REALM — generating the whole drop.

    python3 tools/drop.py [out-dir]

1,111 beings in one go: ten sectors of 111, numbered straight through, and
then the 1,111th, which is the Source.

This replaces generating a round at a time. The collection is no longer
released in stages, so it is no longer made in stages either — and making it
in one pass is what lets uniqueness be checked across the whole thing rather
than inside each sector, which is the check that actually matters.

`tools/round.py` still generates a single sector, and this calls it ten
times with a running offset and a shared set of used combinations.
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

SECTORS = 10
PER_SECTOR = sum(R.COUNTS.values())          # 111
TOTAL = PER_SECTOR * SECTORS + 1             # 1,111 — the Source is the last

# ---- the Source ----------------------------------------------------------
# The 1,111th being. One in the collection, weight 111, and the only being
# that is not one of ten of its kind.
#
# PLACEHOLDER: it has not been drawn yet, so it borrows the God's drawing
# wearing its own colourway with every trait at its loudest. Swap the drawing
# for the real one and delete this note. Nothing else here needs to change.
SOURCE_BEING = "god-serpent"
SOURCE_DRAWN = False                          # flip to True once it is drawn
SOURCE_WEAVE = "Auric"
SOURCE_TRAITS = dict(Stars="Dense", Geometry="Metatron", GeometryUnder="Mandala",
                     Lightning="Tempest", UFOs="Fleet", Planets="Cluster",
                     Explosions="Barrage", Mushrooms="Grove", Trees="Copse",
                     Smoke="Shroud", Dust="Heavy", Spores="Golden", Aura="Warm",
                     Eyes="Ringed")


def make_source(out_dir, n, rng):
    info = R.BEINGS[SOURCE_BEING]
    pal = dict(BY_NAME[R.PALETTE_FOR[SOURCE_WEAVE]])
    pal["weave"] = dict(WEAVES[SOURCE_WEAVE])
    pal["weave"]["vivid"] = pal["weave"].get("vivid", 1.0) + 0.45

    t = dict(SOURCE_TRAITS)
    t["ExtraEyes"] = info.get("extra_eyes") or None

    canvas, scale = 600, 4
    img = render(f"{ROOT}/art/beings/{SOURCE_BEING}.png", pal, t, canvas, scale,
                 seed=int(rng.integers(0, 1 << 30)), mode=info["mode"],
                 eye_mode=info.get("eye_mode", "holes"),
                 fill=info["rung"] / canvas)
    png = f"{out_dir}/images/{n}.png"
    img.save(png, optimize=True)

    attrs = [{"trait_type": "Tier", "value": "Source"},
             {"trait_type": "Being", "value": SOURCE_BEING},
             {"trait_type": "Colourway", "value": SOURCE_WEAVE}]
    for k in ("Geometry", "Stars", "Planets", "UFOs", "Explosions", "Lightning",
              "Smoke", "Dust", "Trees", "Mushrooms", "Spores", "Aura", "Eyes"):
        attrs.append({"trait_type": k, "value": t[k]})
    attrs.append({"trait_type": "Sector", "value": "The Source"})
    attrs.append({"trait_type": "Sector number", "value": "10"})

    json.dump({"name": f"REALM #{n} — The Source", "symbol": "REALM",
               "description": "The 1,111th being of the realm. There is one, "
                              "and there will never be another.",
               "image": f"{n}.png", "attributes": attrs,
               "properties": {"files": [{"uri": f"{n}.png", "type": "image/png"}],
                              "category": "image"}},
              open(f"{out_dir}/metadata/{n}.json", "w"), indent=2)

    row = {"id": n, "tier": "source", "being": SOURCE_BEING,
           "colourway": SOURCE_WEAVE, "png": png, "loud": 1.0, "sector": 10}
    row.update({k: t[k] for k in R.TRAITS})
    return row


# ---- checking the whole drop --------------------------------------------
def verify(rows, out_dir):
    bad = []

    if len(rows) != TOTAL:
        bad.append(f"{len(rows)} beings, not {TOTAL}")

    want = {t: n * SECTORS for t, n in R.COUNTS.items()}
    want["source"] = 1
    got = {}
    for r in rows:
        got[r["tier"]] = got.get(r["tier"], 0) + 1
    for tier, n in want.items():
        if got.get(tier, 0) != n:
            bad.append(f"{got.get(tier, 0)} {tier}, not {n}")

    # ten sectors of 111, and the Source counted in the tenth
    for s in range(1, SECTORS + 1):
        n = sum(1 for r in rows if r["sector"] == s)
        expect = PER_SECTOR + (1 if s == SECTORS else 0)
        if n != expect:
            bad.append(f"sector {s} holds {n} beings, not {expect}")

    # numbered straight through with no gaps and no repeats
    ids = sorted(r["id"] for r in rows)
    if ids != list(range(1, TOTAL + 1)):
        bad.append("the ids are not 1.." + str(TOTAL) + " exactly once")

    # every combination unique across the whole drop, not merely each sector
    keys = [(r["being"], r["colourway"]) + tuple(r[k] for k in R.TRAITS) for r in rows]
    if len(set(keys)) != len(keys):
        bad.append(f"{len(keys) - len(set(keys))} repeated combinations across the drop")

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

    if not SOURCE_DRAWN:
        print("\n  NOTE: the Source is still the God's drawing as a placeholder.")

    if bad:
        print(f"\n{len(bad)} problem(s):")
        for b in bad[:40]:
            print("  - " + b)
        raise SystemExit(1)

    print(f"\nall checks pass: {TOTAL} beings, tier counts exact, ten sectors, "
          "every combination unique across the whole drop, every image present.")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/out/drop"
    os.makedirs(f"{out}/images", exist_ok=True)
    os.makedirs(f"{out}/metadata", exist_ok=True)

    seen, rows = set(), []
    for s in range(1, SECTORS + 1):
        print(f"sector {s}/{SECTORS} — {R.SECTOR_NAMES[s - 1]}")
        rows += R.generate(s, out, offset=(s - 1) * PER_SECTOR, seen=seen)

    print("the Source")
    rows.append(make_source(out, TOTAL, np.random.default_rng(1111)))

    json.dump(rows, open(f"{out}/drop.json", "w"), indent=2)
    verify(rows, out)


if __name__ == "__main__":
    main()
