#!/usr/bin/env python3
"""
REALM — the snapshot, and the payout list.

    python3 tools/snapshot.py --demo            # prove the arithmetic
    python3 tools/snapshot.py --out payout      # the real thing

Reads the chain at one moment, works out what every wallet holds, and writes
the list of who gets how much. Holders do not connect anything and do not
claim anything: if they held a being at the snapshot, they are on the list.

NEEDS, from the environment, never from a file the site serves:

    HELIUS_KEY        an RPC key with the DAS API
    COLLECTION        the collection's on-chain address
    TOKEN_MINT        the $DMT mint address (omit and everyone is 1.0x)

The RPC half cannot be tested from here — no collection exists yet and this
machine cannot reach Helius. The arithmetic half is tested, by --demo, which
builds a synthetic set of holders and checks the payouts against the rules
and against the pool. Run --demo after changing anything in here.
"""
import argparse, csv, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LAMPORTS = 1_000_000_000


# ---------------------------------------------------------------- the rules
def rules():
    """Weights, bands and the pool, read out of data.js so there is one
    source for them and this cannot drift from the site."""
    src = open(f"{ROOT}/data.js").read()
    import re

    tiers = {}
    for m in re.finditer(r'name:\s*"(\w+)",\s*key:\s*"(\w+)",\s*count:\s*(\d+),\s*weight:\s*(\d+)', src):
        tiers[m.group(1)] = {"key": m.group(2), "count": int(m.group(3)),
                             "weight": int(m.group(4))}

    bands = [(int(h), float(x)) for h, x in
             re.findall(r'hold:\s*([\d_]+),\s*mult:\s*([\d.]+)', src.replace("_", ""))]
    bands.sort()

    pct   = int(re.search(r'POOL_PERCENT\s*=\s*(\d+)', src).group(1))
    price = float(re.search(r'const PRICE\s*=\s*([\d.]+)', src).group(1))
    total = sum(t["count"] for t in tiers.values())
    weight = sum(t["count"] * t["weight"] for t in tiers.values())
    return tiers, bands, pct, price, total, weight


def multiplier(balance, bands):
    m = 1.0
    for hold, mult in bands:
        if balance >= hold:
            m = mult
    return m


# ------------------------------------------------------------- the payout
def payouts(holders, tiers, bands, pool_lamports):
    """holders: {wallet: {"beings": [tier names], "tokens": int}}

    Returns a list of rows, and the arithmetic is done in whole lamports so
    the total paid is EXACTLY the pool. Dividing a pool by weight in floating
    point leaves dust — a few thousand lamports that belong to nobody — so
    each wallet gets its floor and the remainder goes to the wallets with the
    largest fractions left over. Nothing is invented and nothing is lost.
    """
    rows = []
    for wallet, h in holders.items():
        w = sum(tiers[t]["weight"] for t in h["beings"])
        mult = multiplier(h.get("tokens", 0), bands)
        rows.append({"wallet": wallet, "beings": len(h["beings"]),
                     "tiers": ",".join(sorted(h["beings"])),
                     "weight": w, "tokens": h.get("tokens", 0),
                     "multiplier": mult, "effective": w * mult})

    total_eff = sum(r["effective"] for r in rows)
    if total_eff <= 0:
        return rows

    for r in rows:
        exact = pool_lamports * r["effective"] / total_eff
        r["_floor"] = int(exact)
        r["_frac"] = exact - r["_floor"]

    short = pool_lamports - sum(r["_floor"] for r in rows)
    # deterministic: biggest fraction first, wallet address to break a tie,
    # so the same snapshot always produces the same list
    for r in sorted(rows, key=lambda r: (-r["_frac"], r["wallet"]))[:short]:
        r["_floor"] += 1

    for r in rows:
        r["lamports"] = r.pop("_floor")
        r["sol"] = r["lamports"] / LAMPORTS
        r.pop("_frac")
    rows.sort(key=lambda r: -r["lamports"])
    return rows


# ----------------------------------------------------------------- the chain
def rpc(key, method, params):
    req = urllib.request.Request(
        f"https://mainnet.helius-rpc.com/?api-key={key}",
        data=json.dumps({"jsonrpc": "2.0", "id": "realm",
                         "method": method, "params": params}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.load(r)
    if "error" in out:
        raise SystemExit(f"RPC error: {out['error']}")
    return out["result"]


# A being listed for sale is not held by its owner — it sits in the
# marketplace's escrow, and a naive snapshot pays the marketplace instead of
# the person. These are the programs whose "ownership" has to be looked
# through. ADD TO THIS LIST if you see a whale wallet in the payout that
# turns out to be an exchange.
ESCROW = {
    "1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix",    # Magic Eden v2
    "M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K",    # Magic Eden v3
    "TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN",    # Tensor swap
    "TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp",    # Tensor cNFT
}


def from_chain(key, collection, token_mint):
    print("reading the collection…")
    holders, page = {}, 1
    while True:
        res = rpc(key, "getAssetsByGroup", {
            "groupKey": "collection", "groupValue": collection,
            "page": page, "limit": 1000})
        items = res.get("items", [])
        if not items:
            break
        for a in items:
            owner = a["ownership"]["owner"]
            tier = next((t["value"] for t in
                         a.get("content", {}).get("metadata", {}).get("attributes", [])
                         if t.get("trait_type") == "Tier"), None)
            if tier is None:
                print(f"  ! {a['id']} has no Tier attribute — skipped")
                continue
            if owner in ESCROW:
                print(f"  ! {a['id']} is in marketplace escrow — see the note below")
            holders.setdefault(owner, {"beings": [], "tokens": 0})["beings"].append(tier)
        print(f"  page {page}: {len(items)}")
        page += 1

    if token_mint:
        print("reading token balances…")
        for w in holders:
            res = rpc(key, "getTokenAccountsByOwner",
                      [w, {"mint": token_mint}, {"encoding": "jsonParsed"}])
            bal = 0
            for acc in res.get("value", []):
                info = acc["account"]["data"]["parsed"]["info"]["tokenAmount"]
                bal += int(info["amount"]) // (10 ** int(info["decimals"]))
            holders[w]["tokens"] = bal
    return holders


# ------------------------------------------------------------------- demo
def demo(tiers, bands, total_beings):
    """A synthetic drop, to check the arithmetic rather than assume it."""
    import random
    rng = random.Random(1111)
    pool_all = []
    for name, t in tiers.items():
        pool_all += [name] * t["count"]
    rng.shuffle(pool_all)

    holders, i = {}, 0
    n = 0
    while i < len(pool_all):
        take = min(rng.randint(1, 5), len(pool_all) - i)
        n += 1
        holders[f"Wallet{n:04d}"] = {
            "beings": pool_all[i:i + take],
            "tokens": rng.choice([0, 0, 0, 60_000, 300_000, 2_000_000, 12_000_000])
        }
        i += take
    return holders


# ------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="synthetic holders, no chain")
    ap.add_argument("--out", default="payout")
    ap.add_argument("--minted", type=int, default=None,
                    help="how many were minted (default: all of them)")
    a = ap.parse_args()

    tiers, bands, pct, price, total_beings, total_weight = rules()
    minted = a.minted if a.minted is not None else total_beings
    pool = minted * price * pct / 100
    pool_lamports = round(pool * LAMPORTS)

    print(f"{minted} minted at {price} SOL — the pool is {pool:.4f} SOL "
          f"({pct}% of {minted * price:.2f})\n")

    if a.demo:
        holders = demo(tiers, bands, total_beings)
    else:
        key = os.environ.get("HELIUS_KEY")
        col = os.environ.get("COLLECTION")
        if not key or not col:
            raise SystemExit("set HELIUS_KEY and COLLECTION in the environment "
                             "(never in data.js — the site serves that file)")
        holders = from_chain(key, col, os.environ.get("TOKEN_MINT"))

    rows = payouts(holders, tiers, bands, pool_lamports)

    # ---- check the list before trusting it ----
    bad = []
    paid = sum(r["lamports"] for r in rows)
    if paid != pool_lamports:
        bad.append(f"the payouts total {paid} lamports, the pool is {pool_lamports}")
    held = sum(r["beings"] for r in rows)
    if not a.demo and held != minted:
        bad.append(f"{held} beings held across the list, {minted} were minted")
    if any(r["lamports"] < 0 for r in rows):
        bad.append("a negative payout")
    for r in rows:
        if r["multiplier"] != multiplier(r["tokens"], bands):
            bad.append(f"{r['wallet']} has the wrong multiplier")
    # more weight must never pay less
    for x, y in zip(rows, rows[1:]):
        if x["effective"] < y["effective"] - 1e-9 and x["lamports"] > y["lamports"]:
            bad.append(f"{x['wallet']} outearns {y['wallet']} on less weight")
    if bad:
        print("PROBLEMS:")
        for b in bad:
            print("  -", b)
        raise SystemExit(1)

    with open(f"{a.out}.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["wallet", "beings", "tiers", "weight",
                                          "tokens", "multiplier", "effective",
                                          "lamports", "sol"])
        w.writeheader()
        w.writerows(rows)
    json.dump({"pool_sol": pool, "pool_lamports": pool_lamports,
               "wallets": len(rows), "rows": rows},
              open(f"{a.out}.json", "w"), indent=2)

    print(f"{len(rows)} wallets, {paid / LAMPORTS:.9f} SOL, exactly the pool.")
    print(f"biggest  {rows[0]['sol']:.4f} SOL  ({rows[0]['weight']} weight "
          f"x {rows[0]['multiplier']})")
    print(f"smallest {rows[-1]['sol']:.4f} SOL")
    print(f"\nwritten: {a.out}.csv and {a.out}.json")
    print("\nBefore you send anything:")
    print("  - check no wallet in the list is a marketplace escrow account")
    print("  - a listed being pays its escrow, not its owner. Decide that policy")
    print("    and publish it BEFORE the snapshot, not after somebody complains")


if __name__ == "__main__":
    main()
