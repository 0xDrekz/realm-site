#!/usr/bin/env python3
"""
REALM — the whole collection, from the new art.

    python3 tools/build.py [out-dir]

Every tier dealt by tools/gods.py, shuffled into token order with a fixed
seed, the Prime Source as #1,111, every picture drawn on every core, a
Metaplex JSON for each, checks run over all of it, and the provenance hash.
Resumable: a picture already on disk at the right size is kept.
"""
import hashlib, json, os, sys
from multiprocessing import Pool
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
import gods

TIERS = [("common", gods.deal_commons), ("uncommon", gods.deal_uncommons),
         ("rare", gods.deal_rares), ("epic", gods.deal_epics),
         ("legendary", gods.deal_legendaries), ("mythic", gods.deal_mythics),
         ("entity", gods.deal_entities), ("god", gods.deal)]
COUNTS = {"common": 400, "uncommon": 280, "rare": 180, "epic": 110,
          "legendary": 70, "mythic": 40, "entity": 20, "god": 10}
ORDER = ("Geometry", "Aura", "Planets", "UFOs", "Supernova", "Lightning",
         "Mushrooms", "Trees", "Moon Dust")
SOURCE = f"{ROOT}/art/source-prime.png"


def _ok(png):
    try:
        im = Image.open(png); im.verify()
        return Image.open(png).size == (2400, 2400)
    except Exception:
        return False


def _draw(job):
    t, seed, png = job
    if not _ok(png):
        gods.render_god(t, seed).save(png, optimize=True)
    return png


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/out/realm"
    os.makedirs(f"{out}/images", exist_ok=True)
    os.makedirs(f"{out}/metadata", exist_ok=True)

    rows = []
    for tier, deal in TIERS:
        for t in deal():
            rows.append(dict(t, Tier=tier.capitalize()))
    rng = np.random.default_rng(1111)
    rng.shuffle(rows)

    jobs = []
    for n, t in enumerate(rows, 1):
        t["id"] = n
        t["seed"] = 100000 + n
        jobs.append(({k: v for k, v in t.items() if k not in ("id", "seed", "Tier")},
                     t["seed"], f"{out}/images/{n}.png"))

    print(f"drawing {len(jobs)} on {os.cpu_count()} cores")
    with Pool(os.cpu_count()) as pool:
        for k, _ in enumerate(pool.imap_unordered(_draw, jobs, chunksize=2), 1):
            if k % 50 == 0:
                print(f"  {k}/{len(jobs)}", flush=True)

    # the Prime Source, #1,111
    n = len(rows) + 1
    Image.open(SOURCE).convert("RGB").save(f"{out}/images/{n}.png", optimize=True)
    rows.append({"id": n, "Tier": "Source", "Being": "The Prime Source",
                 "Colourway": "Prime Gold"})

    for t in rows:
        n = t["id"]
        attrs = [{"trait_type": "Tier", "value": t["Tier"]},
                 {"trait_type": "Being", "value": t["Being"]},
                 {"trait_type": "Colourway", "value": t["Colourway"]}]
        for k in ORDER:
            if k in t:
                attrs.append({"trait_type": k, "value": t[k]})
        src = t["Tier"] == "Source"
        json.dump({
            "name": f"REALM #{n}" + (" — The Prime Source" if src else ""),
            "symbol": "REALM",
            "description": ("Origin of all creation. The singular spark containing "
                            "infinite knowledge. The 1,111th being of the realm: there "
                            "is one, and there will never be another.") if src
                           else "One of 1,111 beings of the realm.",
            "image": f"{n}.png", "attributes": attrs,
            "properties": {"files": [{"uri": f"{n}.png", "type": "image/png"}],
                           "category": "image"}},
            open(f"{out}/metadata/{n}.json", "w"), indent=2)

    # ---- checks
    bad = []
    got = {}
    for t in rows:
        got[t["Tier"]] = got.get(t["Tier"], 0) + 1
    for tier, c in COUNTS.items():
        if got.get(tier.capitalize()) != c:
            bad.append(f"{got.get(tier.capitalize())} {tier}, not {c}")
    if got.get("Source") != 1:
        bad.append("not exactly one Source")
    keys = [tuple((k, t.get(k)) for k in ("Being", "Colourway") + ORDER) for t in rows]
    if len(set(keys)) != len(keys):
        bad.append(f"{len(keys) - len(set(keys))} repeated combinations")
    gods_cw = [t["Colourway"] for t in rows if t["Tier"] == "God"]
    if len(set(gods_cw)) != 10:
        bad.append("two Gods share a colourway")
    if any(t["Colourway"] in gods_cw for t in rows if t["Tier"] != "God"):
        bad.append("a God's colourway on a lesser being")
    for t in rows:
        p = f"{out}/images/{t['id']}.png"
        if not _ok(p):
            bad.append(f"#{t['id']}: image missing or wrong size")
        elif np.asarray(Image.open(p).convert("L").resize((200, 200))).std() < 4:
            bad.append(f"#{t['id']}: blank")
    if bad:
        print(f"\n{len(bad)} problem(s):"); [print("  - " + b) for b in bad[:40]]
        raise SystemExit(1)
    print(f"\nall checks pass: {len(rows)} beings, tier counts exact, every "
          "combination unique, God colourways one-of-one, every image present.")

    json.dump(rows, open(f"{out}/drop.json", "w"), indent=2)
    each = [{"id": t["id"], "sha256": hashlib.sha256(open(f"{out}/images/{t['id']}.png", "rb").read()).hexdigest()}
            for t in sorted(rows, key=lambda t: t["id"])]
    final = hashlib.sha256("".join(e["sha256"] for e in each).encode()).hexdigest()
    json.dump({"hash": final, "count": len(each),
               "how": "sha256 of each image, concatenated in token order, sha256 of the result",
               "proves": ("that the collection was not altered after this hash was published. "
                          "It does not prove how mint order was assigned to token number."),
               "images": each}, open(f"{out}/provenance.json", "w"), indent=2)
    print(f"\nprovenance hash\n  {final}")


if __name__ == "__main__":
    main()
