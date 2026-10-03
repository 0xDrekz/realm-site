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
import hashlib, json, os, sys
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
# The hand-made painting is art/source.png. What goes into the collection is
# that painting put on the collection's pixel grid by tools/source_pixel.py,
# so it no longer reads as a different collection beside the other 1,110.
SOURCE_ART   = f"{ROOT}/art/source-pixel.png"
SOURCE_DRAWN = True

# what is actually in the picture, rather than what a roll would have given it
SOURCE_TRAITS = dict(Stars="Field", Geometry="Yantra", GeometryUnder="Mandala",
                     Lightning="None", UFOs="None", Planets="None",
                     Explosions="None", Mushrooms="Few", Trees="None",
                     Smoke="Shroud", Dust="Faint", Spores="Golden",
                     Aura="Cold", Eyes="Painted")


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


# ---- provenance ----------------------------------------------------------
# A record, published BEFORE the mint opens, that proves afterwards that the
# collection nobody had seen is the collection that was handed out.
#
# Each image is hashed, the hashes are joined in token order, and that string
# is hashed again. Change one pixel of one being, or swap two of them around,
# and the final hash changes completely.
#
# BE HONEST ABOUT WHAT THIS PROVES. It proves the collection was not altered
# after the hash was published. It does NOT prove that the mapping from mint
# order to token number was fair — that is the launchpad's shuffle, not ours,
# and it needs its own answer. Saying more than this is the thing the hash
# exists to stop.
def provenance(rows, out_dir):
    each = []
    for r in sorted(rows, key=lambda r: r["id"]):
        h = hashlib.sha256(open(r["png"], "rb").read()).hexdigest()
        each.append({"id": r["id"], "sha256": h})
    joined = "".join(e["sha256"] for e in each)
    final = hashlib.sha256(joined.encode()).hexdigest()

    json.dump({"hash": final, "count": len(each),
               "how": ("sha256 of each image, concatenated in token order, "
                       "sha256 of the result"),
               "proves": ("that the collection was not altered after this hash "
                          "was published. It does not prove how mint order was "
                          "assigned to token number."),
               "images": each},
              open(f"{out_dir}/provenance.json", "w"), indent=2)
    return final


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

    # From Epic up the figure is dealt, so no drawing may wear one figure
    # (colourway and eyes) a second time while another it could wear is
    # still unused.
    for tier in R.LOOKS:
        for being in sorted({r["being"] for r in rows if r["tier"] == tier}):
            figs = {}
            for r in rows:
                if r["tier"] == tier and r["being"] == being:
                    f = (r["colourway"], r["Eyes"])
                    figs[f] = figs.get(f, 0) + 1
            cws = R.look_pool(tier)
            eyes = 1 if R.BEINGS[being].get("eye_mode") == "drawn" else len(R.EYE_VALUES)
            if len(figs) < min(sum(figs.values()), len(cws) * eyes):
                bad.append(f"{tier} {being}: {sum(figs.values())} pieces but only "
                           f"{len(figs)} different figures")

    # every God wears a colourway no other being in the collection wears
    gods = [r["colourway"] for r in rows if r["tier"] == "god"]
    if len(set(gods)) != len(gods):
        bad.append("two Gods share a colourway")
    for r in rows:
        if r["tier"] != "god" and r["colourway"] in gods:
            bad.append(f"#{r['id']}: a {r['tier']} in a God's colourway")

    # no being names eyes its picture does not show
    for r in rows:
        drawn = R.BEINGS.get(r["being"], {}).get("eye_mode") == "drawn"
        if drawn != (r["Eyes"] == "Painted") and r["tier"] != "source":
            bad.append(f"#{r['id']}: Eyes is {r['Eyes']} on a {r['being']}")

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
    rows, jobs = R.generate(out, defer=True)
    if jobs:
        # every core at once: one picture is a few seconds, and 1,110 of them
        # one after another was most of an hour
        from multiprocessing import Pool
        n = os.cpu_count() or 1
        print(f"  drawing {len(jobs)} on {n} cores")
        with Pool(n) as pool:
            for k, _ in enumerate(pool.imap_unordered(R.draw, jobs, chunksize=4), 1):
                if k % 100 == 0:
                    print(f"  {k}/{len(jobs)}")

    print("the Source")
    rows.append(make_source(out, TOTAL, np.random.default_rng(1111)))

    json.dump(rows, open(f"{out}/drop.json", "w"), indent=2)
    verify(rows, out)

    h = provenance(rows, out)
    print(f"\nprovenance hash\n  {h}\n"
          "\nPublish this BEFORE the mint opens — in data.js, on X, anywhere\n"
          "time-stamped. It is worth nothing published afterwards.")


if __name__ == "__main__":
    main()
