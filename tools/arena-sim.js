/* REALM Arena — balance simulation.  node tools/arena-sim.js [games]  (default 3000)

   AI against AI. Each side gets six beings and two spells. Reports how
   each tier does against a random tier, how each role and power does
   (per card, across all games), how matches end and how long they last. */
"use strict";
const A = require("../arena/engine"), C = require("../arena/cards");

const GAMES = Number(process.argv[2]) || 3000;
const T = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God"];
const BT = C.byTier();
let seed = 4242;
const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pickN = (arr, k) => { const a = arr.slice(), o = []; while (o.length < k) o.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return o; };
const deckOf = tier => C.deck(pickN(BT[tier].concat(tier === "God" ? BT.Entity : []), 6));

const tierW = {}, cardW = {}, fairW = {}, end = { throne: 0, crowns: 0, overtime: 0, draw: 0 };
let ticks = 0, side0 = 0;
const bump = (o, k, w) => { o[k] = o[k] || [0, 0]; o[k][0] += w; o[k][1]++; };
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const ta = T[Math.floor(rand() * T.length)], tb = g % 2 ? ta : T[Math.floor(rand() * T.length)];
  const da = deckOf(ta), db = deckOf(tb);
  const S = A.createMatch({ seed: 777 + g, sides: [{ deck: da, ai: true, level: 1 }, { deck: db, ai: true, level: 1 }] });
  while (!S.over && S.tick < (A.MATCH_S + A.OVERTIME_S) * A.TICK + 2) A.step(S);
  ticks += S.tick;
  const w = S.winner;
  if (w == null) end.draw++; else if (S.crowns[w] === 3) end.throne++; else if (S.time > A.MATCH_S) end.overtime++; else end.crowns++;
  if (w === 0) side0++;
  if (w != null) {
    bump(tierW, ta, w === 0 ? 1 : 0); bump(tierW, tb, w === 1 ? 1 : 0);
    for (const [d, me] of [[da, 0], [db, 1]]) for (const c of d) if (c.kind === "unit") {
      if (ta === tb) { bump(fairW, "role:" + c.role, w === me ? 1 : 0); bump(fairW, "style:" + c.style, w === me ? 1 : 0); }
      bump(cardW, "role:" + c.role, w === me ? 1 : 0);
      bump(cardW, "style:" + c.style, w === me ? 1 : 0);
    }
  }
}
const pct = ([w, n]) => (100 * w / n).toFixed(1).padStart(5) + "%";
console.log(`\n${GAMES} AI-vs-AI matches in ${((Date.now() - t0) / 1000).toFixed(1)}s · average ${(ticks / GAMES / A.TICK).toFixed(0)}s each`);
console.log(`ends: ${end.throne} by Throne, ${end.crowns} on towers at 3:00, ${end.overtime} in sudden death, ${end.draw} draws · bottom side wins ${(100 * side0 / GAMES).toFixed(1)}%\n`);
console.log("WIN RATE BY TIER (vs a random tier)");
for (const t of T) if (tierW[t]) console.log("  " + t.padEnd(10) + pct(tierW[t]) + "  (" + tierW[t][1] + ")");
console.log("\nWIN RATE BY ROLE AND POWER (each card in a deck, across games)");
Object.entries(cardW).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]).forEach(([k, v]) => console.log("  " + k.padEnd(18) + pct(v) + "  (" + v[1] + ")"));
console.log("\nSAME TIER ONLY (fair test of roles and powers)");
Object.entries(fairW).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]).forEach(([k, v]) => console.log("  " + k.padEnd(18) + pct(v) + "  (" + v[1] + ")"));
