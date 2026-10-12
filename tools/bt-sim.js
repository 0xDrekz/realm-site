/* BREAKTHROUGH balance sim: a greedy player (best cast of the hand, discards weak hands) over many seeds */
const E = require("../bt/engine"), C = require("../bt/cards");
const cards = n => C.cardOf(n);
function combos(n, k, start = 0, cur = [], out = []) { if (cur.length && cur.length <= k) out.push(cur.slice()); if (cur.length === k) return out; for (let i = start; i < n; i++) { cur.push(i); combos(n, k, i + 1, cur, out); cur.pop(); } return out; }
const SUB = {}; for (let n = 1; n <= 9; n++) SUB[n] = combos(n, 5);
function bestCast(S) { let b = null; for (const idx of SUB[S.hand.length] || []) { const ev = E.preview(S, idx); if (ev && (!b || ev.score > b.ev.score)) b = { idx, ev }; } return b; }
function play(seed, skill) {
  const rng = (() => { let s = seed * 7 + 3; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const deck = []; while (deck.length < 20) { const n = 1 + Math.floor(rng() * 1111); if (!deck.includes(n)) deck.push(n); }
  const S = E.createRun({ seed, deck, cards });
  let guard = 0;
  while (!S.over && guard++ < 400) {
    if (S.phase === "draft") {
      if (S.layer >= 11) break;
      // take the offer with the most chips
      let bi = 0; S.offer.forEach((n, i) => { if (cards(n).chips > cards(S.offer[bi]).chips) bi = i; });
      E.pick(S, bi); continue;
    }
    const b = bestCast(S), need = E.targetOf(S.layer) - S.score;
    const perCast = need / S.casts;
    if (skill && S.discards > 0 && b.ev.score < perCast * 0.8) {
      // discard the cards not in the best hand's scoring set (up to 5, lowest chips first)
      const keep = new Set(b.ev.scoring.map(k => b.idx.slice().sort((x, y) => x - y)[k]));
      const throwable = S.hand.map((n, i) => i).filter(i => !keep.has(i)).sort((x, y) => cards(S.hand[x]).chips - cards(S.hand[y]).chips).slice(0, 5);
      if (throwable.length) { E.discard(S, throwable); continue; }
    }
    E.cast(S, b.idx);
  }
  return { layer: E.cleared(S), total: S.total, best: S.best, hands: S.hands };
}
const N = +process.argv[2] || 300;
for (const skill of [0, 1]) {
  const res = []; const hands = {};
  for (let s = 1; s <= N; s++) { const r = play(s, skill); res.push(r); for (const [k, v] of Object.entries(r.hands)) hands[k] = (hands[k] || 0) + v; }
  const dist = {}; res.forEach(r => dist[r.layer] = (dist[r.layer] || 0) + 1);
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  console.log(skill ? "SMART" : "GREEDY", "layers cleared:", JSON.stringify(dist), "median total", med(res.map(r => r.total)), "median best", med(res.map(r => r.best)));
  console.log("  hands", JSON.stringify(hands));
}
