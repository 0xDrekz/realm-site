/* REALM card battler — how hard is each campaign level?
   node tools/tcg2-campaign-sim.js [games per level]  (default 2000)

   The AI plays you: dealt five borrowed spirits from the realm's pool, it
   keeps the three with the most body, then plays the level's rival. A real
   player should do better than this greedy AI, so these are a floor. */
"use strict";
const E = require("../tcg2/engine"), AI = require("../tcg2/ai"), C = require("../tcg2/cards"), K = require("../tcg2/campaign");

const N = Number(process.argv[2]) || 2000;
const byTier = {};
C.all().forEach(c => (byTier[c.tier] = byTier[c.tier] || []).push(c.n));
let seed = 99;
const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };

function dealt(realm) {
  const w = Object.entries(K.POOL[realm]), total = w.reduce((a, [, x]) => a + x, 0), ns = [];
  while (ns.length < 5) {
    let r = rand() * total, tier = w[0][0];
    for (const [t, x] of w) { if (r < x) { tier = t; break; } r -= x; }
    const n = byTier[tier][Math.floor(rand() * byTier[tier].length)];
    if (!ns.includes(n)) ns.push(n);
  }
  const worth = n => { const c = C.cardOf(n); return c.power + c.health + c.cost * 1.5 + c.kw.length; };
  return ns.sort((a, b) => worth(b) - worth(a)).slice(0, 3);
}

function play(L, g) {
  const tut = L.id === "tutorial";
  const S = E.newMatch({ seed: 7000 + g, first: L.first,
    sides: [tut ? { champions: L.you.champions, deck: L.you.deck } : { champions: dealt(L.realm), scale: K.BORROWED_SCALE },
      { champions: L.rival.champions, life: L.rival.life, scale: L.rival.scale || 1, deck: L.rival.deck }] });
  AI.playOut(S);
  return { won: S.winner === 0, stars: K.stars(S, 0, L), turns: S.turn };
}

const levels = [K.LEVELS.get("tutorial"), ...K.REALMS.flatMap(r => r.levels.map(l => K.LEVELS.get(l.id)))];
console.log(`\n${N} games per level, the AI playing you\n`);
console.log("  level  name               win rate   avg stars (of 3, when won)   avg turns");
for (const L of levels) {
  let w = 0, st = 0, t = 0;
  for (let g = 0; g < N; g++) { const r = play(L, g); w += r.won; st += r.stars; t += r.turns; }
  console.log("  " + L.id.padEnd(9) + L.name.padEnd(19) + (100 * w / N).toFixed(1).padStart(6) + "%" + (w ? (st / w).toFixed(2) : "-").padStart(16) + (t / N).toFixed(1).padStart(26));
}
