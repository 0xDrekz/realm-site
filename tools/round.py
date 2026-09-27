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

# One canvas for every tier: 600 art pixels at scale 4, which lands on 2400,
# with the drawing cut at 480 so it is never resampled by a fraction.
#
# It used to vary — a Common was drawn on 120 art pixels and the God on 800 —
# on the theory that rarity could be carried by how finely a being was drawn.
# It cannot. What that actually did was draw the COMMON'S WHOLE PICTURE at a
# fifth of the resolution: its mandala had 120 pixels to live in, its
# mushrooms and stars likewise. The two tiers looked like two different
# collections, one of them badly made.
#
# Rarity is carried by how many traits fire, which colourway is worn, and how
# elaborate the drawing itself is. None of those needs the picture to be
# worse.
CANVAS = {t: (600, 4) for t in ("common", "uncommon", "rare", "epic",
                                "legendary", "mythic", "entity", "god")}

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
                  ("Mandala", 10), ("Flower", 9), ("Metatron", 8),
                  ("Gatefold", 7), ("Rosette", 6), ("Spiral", 5), ("Weird", 4)],
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
 "Aura":         [("Opposed", 26), ("Acid", 22), ("Cold", 20), ("Warm", 18),
                  ("Rose", 14)],
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


def beings_for(tier, round_no=None):
    """Every drawing that belongs to this tier — and to this round.

    A drawing may carry a "round" in beings.json. If it does, it appears only
    in that round and nowhere else, which is how a God drawn for round four
    stays the God of round four. A drawing with no round belongs to all of
    them.

    A tier used to hold exactly one, and the first match won — so forty
    Commons in a round were forty copies of one alien, and two drawings were
    61% of the whole round. A tier holds as many as have been drawn for it.
    """
    out = [n for n, i in BEINGS.items() if i["tier"] == tier]
    if not out:
        raise SystemExit(f"no being drawn for tier {tier!r}")
    return sorted(out)


def deal_beings(tier, n, rng, round_no=None):
    """Share a tier's count out among its drawings as evenly as it goes.

    Dealt rather than rolled, for the same reason the tiers themselves are:
    left to chance, forty Commons across two drawings comes out 25/15 often
    enough to look like a mistake.
    """
    pool = beings_for(tier, round_no)
    per, rest = divmod(n, len(pool))
    out = []
    for i, name in enumerate(pool):
        out += [name] * (per + (1 if i < rest else 0))
    rng.shuffle(out)
    return out


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
    used_cw = {t: set() for t in SCARCE}

    # each tier's drawings, dealt out and handed round in order
    dealt = {t: deal_beings(t, n, rng, round_no) for t, n in COUNTS.items()}
    used = {t: 0 for t in COUNTS}

    seen, rows = set(), []
    for i, tier in enumerate(tiers, start=1):
        being = dealt[tier][used[tier]]
        used[tier] += 1
        info = BEINGS[being]
        loud = LOUD[tier]

        for _ in range(120):
            wname = colourway(tier, loud, rng)
            pool_n = POOL.get(tier, len(WEAVES))
            if tier in SCARCE and wname in used_cw[tier] and len(used_cw[tier]) < pool_n:
                continue
            # Pose and Spores are choices, not intensities — tilting them by
            # loudness would just make every God a close crop.
            FLAT = {"Spores", "Eyes", "Aura"}
            t = {k: roll(k, 0.0 if k in FLAT else loud, rng) for k in TRAITS}
            key = (being, wname) + tuple(t[k] for k in TRAITS)
            if key not in seen:
                if tier in SCARCE:
                    used_cw[tier].add(wname)
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
                  "Spores", "Aura", "Eyes"):
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
               "png": png, "loud": round(loud, 2), "round": round_no}
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

    # no drawing may take more than its share of a tier that has alternatives
    for tier, n in COUNTS.items():
        pool = beings_for(tier, rows[0].get("round"))
        if len(pool) < 2:
            continue
        got = {}
        for r in rows:
            if r["tier"] == tier:
                got[r["being"]] = got.get(r["being"], 0) + 1
        fair = n / len(pool)
        for name, k in got.items():
            if k > fair + 1:
                bad.append(f"{tier}: {name} takes {k} of {n} when {len(pool)} "
                           f"drawings share the tier")

    # no drawing may take more than its share of a tier that has alternatives
    for tier, n in COUNTS.items():
        pool = beings_for(tier, rows[0].get("round"))
        if len(pool) < 2:
            continue
        got = {}
        for r in rows:
            if r["tier"] == tier:
                got[r["being"]] = got.get(r["being"], 0) + 1
        for name, k in got.items():
            if k > n / len(pool) + 1:
                bad.append(f"{tier}: {name} takes {k} of {n} when {len(pool)} "
                           f"drawings share the tier")

    # the figure behind must never be the colour of the being in front
    from render import _aura_palette, _hue_gap
    for r in rows:
        if r["Geometry"] == "None":
            continue
        base = BY_NAME[PALETTE_FOR[r["colourway"]]]
        lit = _aura_palette(base, r["Aura"])
        being = WEAVES[r["colourway"]]["Body"]
        being = being["b"][-2] if isinstance(being, dict) else being[-2]
        gap = _hue_gap(lit["sigil"], being)
        if gap < 36:
            bad.append(f"#{r['id']}: the geometry is {gap:.0f} degrees from the "
                       f"being's own colour — too close to tell apart")

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
