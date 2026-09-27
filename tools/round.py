#!/usr/bin/env python3
"""
REALM — generating one round.

111 beings, the tier counts exact rather than random, every combination
unique, and the same seed always gives the same round.

    python3 tools/round.py <round-number> [out-dir]

Writes a PNG and a Metaplex JSON per being, then checks its own work and
refuses to finish if anything is off.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
from render import render
from palettes import BY_NAME
from weaves import WEAVES

BEINGS = json.load(open(f"{ROOT}/art/beings.json"))

# which sky palette goes with which colour scheme
PALETTE_FOR = {"Regalia": "Void", "Verdant": "Verdigris", "Furnace": "Ember",
               "Abyss": "Deep", "Ossuary": "Bone", "Auric": "Aurum",
               "Bloom": "Bloom", "Eclipse": "Eclipse"}

# how many of each tier in a round — must total 111
COUNTS = {"common": 40, "uncommon": 28, "rare": 18, "epic": 11,
          "legendary": 7, "mythic": 4, "entity": 2, "god": 1}

# Canvas in art pixels, and how many screen pixels each becomes. Every pair
# multiplies to 2400, so the scale is always a whole number; and each canvas
# is the tier's rung divided by how much of the frame that tier should fill,
# so the drawing is never resampled by a fraction either.
#
# A rarer being sits on a canvas closer to its own size, so it looms larger:
# a Common fills 70% of its frame, the God 85%.
CANVAS = {"common": (120, 20), "uncommon": (160, 15), "rare": (200, 12),
          "epic": (240, 10), "legendary": (300, 8), "mythic": (400, 6),
          "entity": (600, 4), "god": (800, 3)}

# How loud a tier's picture is allowed to be, 0 to 1. It tilts the trait rolls
# toward their louder values, pushes the colour harder, and makes the rarer
# colourways likelier.
LOUD = {"common": 0.00, "uncommon": 0.14, "rare": 0.28, "epic": 0.42,
        "legendary": 0.56, "mythic": 0.70, "entity": 0.85, "god": 1.00}

# Each trait's values, quiet first and loud last, with how common each is at
# loudness zero.
TRAITS = {
 "Stars":        [("None", 8), ("Sparse", 34), ("Field", 40), ("Dense", 18)],
 "Geometry":     [("None", 30), ("Lattice", 8), ("Rays", 9), ("Yantra", 9),
                  ("Mandala", 10), ("Flower", 9), ("Metatron", 8), ("Tree", 7),
                  ("Gatefold", 6), ("Rosette", 5), ("Spiral", 5), ("Weird", 4)],
 "GeometryUnder":[("None", 70), ("Flower", 10), ("Mandala", 8), ("Rosette", 7),
                  ("Lattice", 5)],
 "Smoke":        [("None", 42), ("Wisp", 30), ("Rising", 20), ("Shroud", 8)],
 "Dust":         [("None", 44), ("Faint", 28), ("Drifting", 20), ("Heavy", 8)],
 "UFOs":         [("None", 70), ("One", 16), ("Few", 10), ("Fleet", 4)],
 "Planets":      [("None", 58), ("One", 22), ("Two", 12), ("Ringed", 6),
                  ("Cluster", 2)],
 "Explosions":   [("None", 78), ("One", 13), ("Two", 7), ("Barrage", 2)],
 "Lightning":    [("None", 76), ("Strike", 14), ("Storm", 7), ("Tempest", 3)],
 # halved from the first run, where 80 of 111 had something growing and it
 # stopped feeling found
 "Trees":        [("None", 80), ("One", 11), ("Copse", 6), ("Forest", 3)],
 "Mushrooms":    [("None", 76), ("Few", 13), ("Cluster", 8), ("Grove", 3)],
 "Spores":       [("Matching", 40), ("Golden", 20), ("Complementary", 18),
                  ("Opposed", 14), ("Cold", 8)],
 "Pose":         [("Centred", 58), ("Left", 16), ("Right", 16), ("Close", 10)],
 "Eyes":         [("Plain", 40), ("Ringed", 20), ("Slit", 16),
                  ("Starburst", 12), ("Spiral", 8), ("Void", 4)],
}


def roll(trait, loud, rng):
    """Pick a value, with loudness tilting the odds toward the far end.

    At loudness 0 the printed weights stand. At 1 each value's weight is
    multiplied by how far down the list it sits, so a God lands on Barrage
    and Tempest often and a Common almost never does.
    """
    vals = TRAITS[trait]
    n = len(vals)
    w = np.array([v[1] for v in vals], float)
    w = w * np.array([(1.0 + 3.0 * loud) ** (i / max(n - 1, 1) * 3.0)
                      for i in range(n)])
    return vals[rng.choice(n, p=w / w.sum())][0]


# The rarest tiers do not draw from the whole set. Weighting the odds was
# tried twice and both times a God came out in a common colourway — at 72%
# odds of a rare one, a miss is not unlikely, it is expected. Whether a God
# wears a rare colour is a rule, not a probability.
POOL = {"god": 3, "entity": 3, "mythic": 4, "legendary": 5}


def colourway(tier, loud, rng):
    """Rarer beings wear rarer colourways."""
    names = list(WEAVES)                       # common first, rarest last
    if tier in POOL:
        names = names[-POOL[tier]:]
    w = np.array([WEAVES[k]["weight"] for k in names], float)
    w = w * np.array([(1.0 + 3.0 * loud) ** (i / max(len(names) - 1, 1) * 3.0)
                      for i in range(len(names))])
    return names[rng.choice(len(names), p=w / w.sum())]


def tier_list():
    """The exact deal — counts, not chance."""
    out = []
    for tier, n in COUNTS.items():
        out += [tier] * n
    return out


def being_for(tier):
    for name, info in BEINGS.items():
        if info["tier"] == tier:
            return name
    raise SystemExit(f"no being drawn for tier {tier!r}")


def generate(round_no, out_dir):
    tiers = tier_list()
    if len(tiers) != 111:
        raise SystemExit(f"the tier counts add up to {len(tiers)}, not 111")

    rng = np.random.default_rng(1110 + round_no)
    rng.shuffle(tiers)
    os.makedirs(f"{out_dir}/images", exist_ok=True)
    os.makedirs(f"{out_dir}/metadata", exist_ok=True)

    # At the top of the collection a unique combination is not enough — two
    # Entities that differ only by a trait read as the same picture. For any
    # tier with seven or fewer in a round the colourway is dealt without
    # replacement.
    SCARCE = {t for t, n in COUNTS.items() if n <= 7}
    used = {t: set() for t in SCARCE}

    seen, rows = set(), []
    for i, tier in enumerate(tiers, start=1):
        being = being_for(tier)
        info = BEINGS[being]
        loud = LOUD[tier]

        for _ in range(120):
            wname = colourway(tier, loud, rng)
            pool_n = POOL.get(tier, len(WEAVES))
            if tier in SCARCE and wname in used[tier] and len(used[tier]) < pool_n:
                continue
            # Pose and Spores are choices, not intensities — tilting them by
            # loudness would just make every God a close crop.
            FLAT = {"Pose", "Spores", "Eyes"}
            t = {k: roll(k, 0.0 if k in FLAT else loud, rng) for k in TRAITS}
            key = (being, wname) + tuple(t[k] for k in TRAITS)
            if key not in seen:
                if tier in SCARCE:
                    used[tier].add(wname)
                break
        else:
            raise SystemExit(f"#{i}: could not find an unused combination")
        seen.add(key)

        canvas, scale = CANVAS[tier]
        pal = dict(BY_NAME[PALETTE_FOR[wname]])
        pal["weave"] = dict(WEAVES[wname])
        pal["weave"]["vivid"] = pal["weave"].get("vivid", 1.0) + loud * 0.30

        img = render(f"{ROOT}/art/beings/{being}.png", pal, t, canvas, scale,
                     seed=int(rng.integers(0, 1 << 30)),
                     mode=info["mode"], eye_mode=info.get("eye_mode", "holes"),
                     fill=info["rung"] / canvas)
        png = f"{out_dir}/images/{i}.png"
        img.save(png, optimize=True)

        attrs = [{"trait_type": "Tier", "value": tier.capitalize()},
                 {"trait_type": "Being", "value": being},
                 {"trait_type": "Colourway", "value": wname}]
        for k in ("Geometry", "Stars", "Planets", "UFOs", "Explosions",
                  "Lightning", "Smoke", "Dust", "Trees", "Mushrooms",
                  "Spores", "Pose", "Eyes"):
            attrs.append({"trait_type": k, "value": t[k]})
        attrs.append({"trait_type": "Round", "value": str(round_no)})

        json.dump({"name": f"REALM #{i}", "symbol": "REALM",
                   "description": "One of 1,111 beings of the realm. "
                                  f"Round {round_no} of 10.",
                   "image": f"{i}.png", "attributes": attrs,
                   "properties": {"files": [{"uri": f"{i}.png",
                                             "type": "image/png"}],
                                  "category": "image"}},
                  open(f"{out_dir}/metadata/{i}.json", "w"), indent=2)

        row = {"id": i, "tier": tier, "being": being, "colourway": wname,
               "png": png, "loud": round(loud, 2)}
        row.update({k: t[k] for k in TRAITS})
        rows.append(row)
        if i % 20 == 0:
            print(f"  {i}/111")

    json.dump(rows, open(f"{out_dir}/round.json", "w"), indent=2)
    return rows


def verify(rows, out_dir):
    """Check the round rather than trust it."""
    bad = []

    if len(rows) != 111:
        bad.append(f"{len(rows)} beings, not 111")

    got = {}
    for r in rows:
        got[r["tier"]] = got.get(r["tier"], 0) + 1
    for tier, want in COUNTS.items():
        if got.get(tier, 0) != want:
            bad.append(f"{tier}: {got.get(tier,0)}, wanted {want}")

    keys = {(r["being"], r["colourway"]) + tuple(r[k] for k in TRAITS) for r in rows}
    if len(keys) != len(rows):
        bad.append(f"only {len(keys)} unique combinations for {len(rows)} beings")

    for tier, n in COUNTS.items():
        if n > 7:
            continue
        cs = [r["colourway"] for r in rows if r["tier"] == tier]
        dupes = len(cs) - len(set(cs))
        # against the pool that tier actually draws from, not all eight:
        # seven Legendaries out of a pool of five must repeat twice
        allowed = max(0, len(cs) - POOL.get(tier, len(WEAVES)))
        if dupes > allowed:
            bad.append(f"{tier}: {dupes} repeated colourways, "
                       f"only {allowed} unavoidable")

    for r in rows:
        if not os.path.exists(r["png"]):
            bad.append(f"#{r['id']}: no image"); continue
        im = Image.open(r["png"])
        if im.size != (2400, 2400):
            bad.append(f"#{r['id']}: {im.size[0]}x{im.size[1]}, not 2400x2400")
        a = np.asarray(im.convert("L")).astype(float)
        if a.std() < 4:
            bad.append(f"#{r['id']}: the picture is nearly blank")
        if BEINGS[r["being"]]["tier"] != r["tier"]:
            bad.append(f"#{r['id']}: {r['being']} is not a {r['tier']}")

    # the very top must wear a rare colour, not just a random one
    RARE_CW = set(list(WEAVES)[-3:])
    for r in rows:
        if r["tier"] in ("god", "entity") and r["colourway"] not in RARE_CW:
            bad.append(f"#{r['id']}: a {r['tier']} in {r['colourway']}, "
                       f"which is not one of the three rarest colourways")

    # loudness must actually rise with rarity, or the whole idea is decorative
    def loudscore(r):
        return sum(1 for k in ("Explosions", "Lightning", "UFOs", "Planets")
                   if r[k] != "None")
    commons = [loudscore(r) for r in rows if r["tier"] == "common"]
    rare_up = [loudscore(r) for r in rows
               if r["tier"] in ("mythic", "entity", "god")]
    if commons and rare_up and np.mean(rare_up) <= np.mean(commons):
        bad.append(f"the rare end is not louder than the common end "
                   f"({np.mean(rare_up):.2f} vs {np.mean(commons):.2f})")
    return bad


if __name__ == "__main__":
    rn = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    out = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/../round{rn}"
    print(f"generating round {rn} into {out}")
    rows = generate(rn, out)
    problems = verify(rows, out)
    if problems:
        print("\nPROBLEMS:")
        for b in problems:
            print("  ⚠ ", b)
        raise SystemExit(1)
    print("\nall checks pass: 111 beings, counts exact, every combination "
          "unique, and the rare end is louder than the common end")
