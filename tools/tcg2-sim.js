/* REALM card battler — balance simulation.
   node tools/tcg2-sim.js [games]  (default 12000)

   Each side brings three champions of one tier (the Source tier is the
   Source and two Gods) plus the shared deck; both sides are played by the
   AI. Reports win rate by tier, a tier-vs-tier table, win rate by essence,
   who goes first, and game length. Deterministic: the same count gives the
   same numbers. */
"use strict";
const E = require("../tcg2/engine"), AI = require("../tcg2/ai"), C = require("../tcg2/cards");

const GAMES = Number(process.argv[2]) || 12000;
const cards = C.all(), byTier = {};
cards.forEach(c => (byTier[c.tier] = byTier[c.tier] || []).push(c.n));
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pickN = (arr, k) => { const a = arr.slice(), out = []; while (out.length < k && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; };
function lineup(tier) { return tier === "Source" ? [1111, ...pickN(byTier.God, 2)] : pickN(byTier[tier], 3); }
function domEssence(ns) {
  const c = {}; ns.forEach(n => { const e = C.cardOf(n).essence[0]; c[e] = (c[e] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}
function play(tA, tB, s) {
  const a = lineup(tA), b = lineup(tB);
  const S = E.newMatch({ seed: s, sides: [{ champions: a }, { champions: b }] });
  AI.playOut(S);
  return { winner: S.winner, first: S.first, turns: S.turn, ea: domEssence(a), eb: domEssence(b) };
}

const T = C.TIERS, stat = {}, ess = {}, mat = {};
let firstWins = 0, turns = 0, limit = 0, n = 0;
const bump = (o, k, w) => { o[k] = o[k] || [0, 0]; o[k][0] += w; o[k][1] += 1; };
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const tA = T[Math.floor(rand() * T.length)], tB = T[Math.floor(rand() * T.length)];
  const r = play(tA, tB, 1000 + g);
  n++; turns += r.turns; if (r.turns >= 40) limit++;
  if (r.winner === r.first) firstWins++;
  bump(stat, tA, r.winner === 0 ? 1 : 0); bump(stat, tB, r.winner === 1 ? 1 : 0);
  bump(mat, tA + ">" + tB, r.winner === 0 ? 1 : 0); bump(mat, tB + ">" + tA, r.winner === 1 ? 1 : 0);
  if (r.ea !== r.eb) { bump(ess, r.ea, r.winner === 0 ? 1 : 0); bump(ess, r.eb, r.winner === 1 ? 1 : 0); }
}
// essence, fairly: same-tier matches only, so tier does not hide inside essence
const essFair = {};
for (let g = 0; g < Math.round(GAMES / 2); g++) {
  const t = T[Math.floor(rand() * (T.length - 1))];          // the Source tier is one card: left out
  const r = play(t, t, 900000 + g);
  if (r.ea !== r.eb) { bump(essFair, r.ea, r.winner === 0 ? 1 : 0); bump(essFair, r.eb, r.winner === 1 ? 1 : 0); }
}
const pct = ([w, t]) => (100 * w / t).toFixed(1).padStart(5) + "%";
console.log(`\n${n} AI-vs-AI games in ${((Date.now() - t0) / 1000).toFixed(1)}s · avg ${(turns / n).toFixed(1)} turns (≈${(turns / n / 2).toFixed(1)} each) · going first wins ${(100 * firstWins / n).toFixed(1)}% · ${limit} reached the turn limit\n`);
console.log("WIN RATE BY TIER (vs a random tier)");
for (const t of T) console.log("  " + t.padEnd(10) + pct(stat[t]) + "  (" + stat[t][1] + " games)");
console.log("\nTIER vs TIER (row's win rate)");
console.log("            " + T.map(t => t.slice(0, 5).padStart(7)).join(""));
for (const a of T) console.log("  " + a.padEnd(10) + T.map(b => mat[a + ">" + b] ? pct(mat[a + ">" + b]).padStart(7) : "      -").join(""));
console.log("\nWIN RATE BY ESSENCE (side's main essence; same-tier matches, essences differ)");
for (const e of C.ESSENCES) console.log("  " + e.padEnd(10) + pct(essFair[e]) + "  (" + essFair[e][1] + " games)");
console.log("\n  (all games, tier mixed in: " + C.ESSENCES.map(e => e + " " + pct(ess[e]).trim()).join(", ") + ")");
module.exports = { stat, ess, essFair, mat };
