/* REALM Cards balance sim: the computer plays itself.
   node tools/rc-sim.js [games]  */
"use strict";
const C = require("../rc/cards"), E = require("../rc/engine"), AI = require("../rc/ai");
const N = Number(process.argv[2]) || 200;
let seed = 12345; const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function play(d1, d2, s, lv = [1, 1]) {
  const S = E.newMatch({ seed: s, sides: [{ deck: d1 }, { deck: d2 }] });
  let guard = 0;
  while (S.phase !== "over" && guard++ < 3000) {
    const who = S.phase === "block" ? 1 - S.active : S.active;
    const m = AI.move(S, who, { level: lv[who] });
    const err = E.act(S, who, m);
    if (err) throw new Error(err + " " + JSON.stringify(m));
  }
  return S;
}
const t0 = Date.now();
const ess = C.ESSENCES, res = {}, firstWins = [0, 0];
let turns = 0, games = 0, limit = 0;
for (let g = 0; g < N; g++) {
  const a = ess[g % 5], b = ess[Math.floor(g / 5) % 5];
  const d1 = C.buildDeck([a], { pick: n => Math.floor(r() * n) }), d2 = C.buildDeck([b], { pick: n => Math.floor(r() * n) });
  const S = play(d1, d2, g + 1);
  games++; turns += S.turn; if (S.turn >= E.TURN_LIMIT) limit++;
  if (S.winner != null) { firstWins[S.winner === S.first ? 0 : 1]++; for (const [e, w] of [[a, S.winner === 0], [b, S.winner === 1]]) { res[e] = res[e] || [0, 0]; res[e][w ? 0 : 1]++; } }
}
console.log("games", games, "avg turns", (turns / games).toFixed(1), "hit turn limit", limit, "ms/game", ((Date.now() - t0) / games).toFixed(0));
console.log("first player wins", firstWins[0], "second", firstWins[1]);
for (const [e, [w, l]] of Object.entries(res)) console.log(e.padEnd(10), (100 * w / (w + l)).toFixed(0) + "%", w + l);
// a strong computer against a weak one
let strong = 0;
for (let g = 0; g < Math.min(N, 60); g++) { const e = ess[g % 5]; const d = C.buildDeck([e], { pick: n => Math.floor(r() * n) }), d2 = C.buildDeck([ess[(g + 2) % 5]], { pick: n => Math.floor(r() * n) }); const S = play(d, d2, 900 + g, [1, 0.1]); if (S.winner === 0) strong++; }
console.log("level 1 beats level 0.1:", strong, "/", Math.min(N, 60));
