"""Rarity rank for every being, written to rarity.json as {number: rank}.

Rank 1 is the rarest. Tier decides first (a Mythic always outranks a
Legendary), because tier is what the weight and the payout follow. Within a
tier, beings are ordered by how rare their traits are across all 1,111:
each trait value scores -log(share of beings that have it), summed.
Ties go to the lower number. Run: python3 tools/rarity.py
"""
import json, math, os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
beings = json.load(open(os.path.join(ROOT, "map-data.json")))["beings"]
ORDER = ["Source", "God", "Entity", "Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"]
N = len(beings)

counts = Counter()
for tier, being, traits in beings:
    counts[("Being", being)] += 1
    for k, v in traits.items():
        counts[(k, v)] += 1

def score(b):
    tier, being, traits = b
    s = -math.log(counts[("Being", being)] / N)
    s += sum(-math.log(counts[(k, v)] / N) for k, v in traits.items())
    return s

ranked = sorted(range(N), key=lambda i: (ORDER.index(beings[i][0]), -score(beings[i]), i))
rank = {str(i + 1): r + 1 for r, i in enumerate(ranked)}
json.dump(rank, open(os.path.join(ROOT, "rarity.json"), "w"), separators=(",", ":"))
print("ranked", N, "| #1 is REALM #%d (%s)" % (ranked[0] + 1, beings[ranked[0]][0]))
for n in (1111, 91, 823, 366, 918):
    print("  REALM #%d %s -> rank %d" % (n, beings[n - 1][0], rank[str(n)]))
