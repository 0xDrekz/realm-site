/* ============================================================
   BREAKTHROUGH — every being as a card, the same card every time.

   Read from the being's own traits (map-data.json) and the Duels card()
   stats, unchanged:
     CHIPS  from its tier, plus 0-3 from where its card() total sits in that tier
     AURA   its Aura trait (every being has one): the "suit" hands are made of
     GEOMETRY, COLOURWAY, and the rarer traits (Lightning, Trees, Planets,
     Supernova, Mushrooms, Moon Dust, UFOs) do the rest; see bt/engine.js.
   ============================================================ */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

const BASE = { Common: 6, Uncommon: 9, Rare: 13, Epic: 18, Legendary: 25, Mythic: 34, Entity: 45, God: 60, Source: 111 };
const SHORT = { Lightning: "L", Trees: "T", Planets: "P", Supernova: "S", Mushrooms: "M", "Moon Dust": "D", UFOs: "U" };
const on = v => v && v !== "None";

let ALL = null;
function all() {
  if (ALL) return ALL;
  const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
  const STATS = require("../duels").create({ root: ROOT, beings: async () => [], envVar: () => "" }).card;   // the stat function, unchanged
  const low = {};
  MAP.forEach(([t], i) => { const v = STATS(i + 1).total; low[t] = low[t] == null ? v : Math.min(low[t], v); });
  ALL = MAP.map(([tier, name, traits = {}], i) => {
    const n = i + 1, x = {};
    for (const [k, s] of Object.entries(SHORT)) if (on(traits[k])) x[s] = traits[k];
    return { n, name: name || tier + " #" + n, tier, chips: BASE[tier] + Math.min(3, STATS(n).total - low[tier]),
      aura: traits.Aura || "Prime", geo: on(traits.Geometry) ? traits.Geometry : null, col: on(traits.Colourway) ? traits.Colourway : null, x };
  });
  return ALL;
}
const cardOf = n => all()[n - 1];
const byTier = () => { const o = {}; for (const c of all()) (o[c.tier] = o[c.tier] || []).push(c.n); return o; };

module.exports = { all, cardOf, byTier, BASE };
