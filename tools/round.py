#!/usr/bin/env python3
"""
REALM — generating one round.

111 beings, the tier counts exact rather than random, every combination
unique, and the same seed always gives the same round.

    python3 tools/round.py <round-number> [out-dir]

Writes a PNG and a Metaplex JSON per being, then checks its own work and
refuses to finish if anything is off.
"""
import json, os, sys, hashlib
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
from compose import build_on

BEINGS = json.load(open(f"{ROOT}/art/beings.json"))

# how many of each tier in a round — must total 111
COUNTS = {"common":40, "uncommon":28, "rare":18, "epic":11,
          "legendary":7, "mythic":4, "entity":2, "god":1}

# canvas in art pixels, and how many screen pixels each becomes.
# every pair multiplies to 1200 so the scale is always a whole number.
CANVAS = {"common":(80,15), "uncommon":(100,12), "rare":(150,8), "epic":(240,5),
          "legendary":(300,4), "mythic":(400,3), "entity":(600,2), "god":(600,2)}

# ---- the traits ----------------------------------------------------------
# a field is a whole colourway: the sky, the being, and the eye together, so
# nothing ever clashes
FIELDS = [
 ("Void",      18, dict(sky_top=(18,9,42),   sky_bottom=(3,1,10),
                        being_top=(238,228,255), being_bottom=(126,84,210),
                        shadow=(26,12,52),  mid=(132,92,196), light_col=(246,236,255),
                        eye=(255,200,90))),
 ("Ember",     18, dict(sky_top=(52,10,28),  sky_bottom=(12,4,16),
                        being_top=(255,226,180), being_bottom=(214,86,48),
                        shadow=(46,18,34),  mid=(196,96,64),  light_col=(255,232,190),
                        eye=(120,255,230))),
 ("Deep",      18, dict(sky_top=(8,14,54),   sky_bottom=(2,3,14),
                        being_top=(226,236,255), being_bottom=(70,92,220),
                        shadow=(14,20,58),  mid=(80,104,200), light_col=(236,242,255),
                        eye=(255,214,120))),
 ("Verdigris", 16, dict(sky_top=(6,34,38),   sky_bottom=(3,10,18),
                        being_top=(198,255,236), being_bottom=(46,178,150),
                        shadow=(8,34,38),   mid=(56,158,138), light_col=(214,255,242),
                        eye=(255,150,200))),
 ("Bone",      10, dict(sky_top=(30,28,34),  sky_bottom=(6,6,9),
                        being_top=(255,255,255), being_bottom=(168,166,178),
                        shadow=(32,30,38),  mid=(150,148,162), light_col=(255,255,255),
                        eye=(230,60,60))),
 ("Aurum",      6, dict(sky_top=(34,24,6),   sky_bottom=(8,5,3),
                        being_top=(255,246,214), being_bottom=(227,186,92),
                        shadow=(40,28,10),  mid=(196,154,72),  light_col=(255,250,228),
                        eye=(255,255,255))),
]

GEOMETRIES = [("None",30,None), ("Diamond",20,0), ("Circle",18,1),
              ("Square",14,2), ("Halo",12,3), ("Star",6,4)]

LIGHTS = [("Zenith",30,dict(cy=0.35,power=0.8)), ("Dawn",26,dict(cy=0.18,power=0.9)),
          ("Underlight",20,dict(cy=0.78,power=0.7)), ("Eclipse",16,dict(cy=0.35,power=0.35)),
          ("Blaze",8,dict(cy=0.42,power=1.3))]

FRAMES = [("None",40,None), ("Hairline",32,dict(inset=2,thick=1)),
          ("Double",20,dict(inset=4,thick=1)), ("Heavy",8,dict(inset=2,thick=2))]


def pick(table, rng):
    names = [t[0] for t in table]
    w = np.array([t[1] for t in table], float)
    i = rng.choice(len(table), p=w/w.sum())
    return names[i], table[i][2]


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
    total = len(tiers)
    if total != 111:
        raise SystemExit(f"the tier counts add up to {total}, not 111")

    rng = np.random.default_rng(1110 + round_no)
    rng.shuffle(tiers)

    os.makedirs(f"{out_dir}/images", exist_ok=True)
    os.makedirs(f"{out_dir}/metadata", exist_ok=True)

    # At the top of the collection a unique COMBINATION is not enough. Two
    # Entities that differ only by their frame read as the same picture, and
    # these are the pieces that are meant to feel singular. So for any tier
    # with seven or fewer in a round, the colourway is dealt without
    # replacement: no two share a field until the fields run out.
    SCARCE = {t for t, n in COUNTS.items() if n <= 7}
    used_field = {t: set() for t in SCARCE}

    seen, rows = set(), []
    for i, tier in enumerate(tiers, start=1):
        being = being_for(tier)
        info = BEINGS[being]

        for _ in range(64):                       # redraw on a collision
            fname, f = pick(FIELDS, rng)
            if tier in SCARCE and fname in used_field[tier] \
               and len(used_field[tier]) < len(FIELDS):
                continue
            gname, gkind = pick(GEOMETRIES, rng)
            lname, lset = pick(LIGHTS, rng)
            frname, frset = pick(FRAMES, rng)
            key = (being, fname, gname, lname, frname)
            if key not in seen:
                if tier in SCARCE:
                    used_field[tier].add(fname)
                break
        else:
            raise SystemExit(f"#{i}: could not find an unused combination")
        seen.add(key)

        canvas, scale = CANVAS[tier]
        rec = dict(f)
        rec["seed"] = int(rng.integers(0, 1 << 30))
        rec["mode"] = info["mode"]
        rec["eye_mode"] = info.get("eye_mode", "holes")
        rec["geometry"] = None if gkind is None else tuple(
            int(c*0.55) for c in f["being_bottom"])
        rec["geo_kind"] = gkind or 0
        rec["light"] = f["light_col"] if lset else None
        rec["light_power"] = lset["power"]
        rec["frame"] = tuple(f["being_bottom"]) if frset else None
        if frset:
            rec["frame_inset"], rec["frame_thick"] = frset["inset"], frset["thick"]

        img = build_on(f"{ROOT}/art/beings/{being}.png", rec, canvas, scale)
        png = f"{out_dir}/images/{i}.png"
        img.save(png, optimize=True)

        meta = {
            "name": f"REALM #{i}",
            "symbol": "REALM",
            "description": "One of 1,111 beings of the realm. "
                           f"Round {round_no} of 10.",
            "image": f"{i}.png",
            "attributes": [
                {"trait_type": "Tier",     "value": tier.capitalize()},
                {"trait_type": "Being",    "value": being},
                {"trait_type": "Field",    "value": fname},
                {"trait_type": "Geometry", "value": gname},
                {"trait_type": "Light",    "value": lname},
                {"trait_type": "Frame",    "value": frname},
                {"trait_type": "Round",    "value": str(round_no)},
            ],
            "properties": {"files": [{"uri": f"{i}.png", "type": "image/png"}],
                           "category": "image"},
        }
        json.dump(meta, open(f"{out_dir}/metadata/{i}.json", "w"), indent=2)
        rows.append({"id": i, "tier": tier, "being": being, "field": fname,
                     "geometry": gname, "light": lname, "frame": frname,
                     "png": png})

        if i % 20 == 0:
            print(f"  {i}/111")

    json.dump(rows, open(f"{out_dir}/round.json", "w"), indent=2)
    return rows


def verify(rows, out_dir):
    """Check the round rather than trust it."""
    problems = []

    if len(rows) != 111:
        problems.append(f"{len(rows)} beings, not 111")

    got = {}
    for r in rows:
        got[r["tier"]] = got.get(r["tier"], 0) + 1
    for tier, want in COUNTS.items():
        if got.get(tier, 0) != want:
            problems.append(f"{tier}: {got.get(tier,0)}, wanted {want}")

    combos = {(r["being"], r["field"], r["geometry"], r["light"], r["frame"])
              for r in rows}
    if len(combos) != len(rows):
        problems.append(f"only {len(combos)} unique combinations for {len(rows)} beings")

    # every picture must exist, be the right size, and not be flat
    for r in rows:
        if not os.path.exists(r["png"]):
            problems.append(f"#{r['id']}: no image"); continue
        im = Image.open(r["png"])
        if im.size != (1200, 1200):
            problems.append(f"#{r['id']}: {im.size[0]}x{im.size[1]}, not 1200x1200")
        a = np.asarray(im.convert("L")).astype(float)
        if a.std() < 4:
            problems.append(f"#{r['id']}: the picture is nearly blank")

    # no two of a scarce tier may share a colourway while others are free
    for tier, n in COUNTS.items():
        if n > 7:
            continue
        fs = [r["field"] for r in rows if r["tier"] == tier]
        dupes = len(fs) - len(set(fs))
        allowed = max(0, len(fs) - len(FIELDS))
        if dupes > allowed:
            problems.append(f"{tier}: {dupes} repeated colourways, only "
                            f"{allowed} unavoidable")

    # every tier's being must be the one assigned to it
    for r in rows:
        if BEINGS[r["being"]]["tier"] != r["tier"]:
            problems.append(f"#{r['id']}: {r['being']} is not a {r['tier']}")

    return problems


if __name__ == "__main__":
    rn = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    out = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/../round{rn}"
    print(f"generating round {rn} into {out}")
    rows = generate(rn, out)
    bad = verify(rows, out)
    if bad:
        print("\nPROBLEMS:")
        for b in bad: print("  ⚠ ", b)
        raise SystemExit(1)
    print("\nall checks pass: 111 beings, tier counts exact, every combination unique")
