"use strict";
const test = require("node:test"), assert = require("node:assert");
const E = require("./engine"), C = require("./cards"), G = require("./game");
const W = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const make = () => G.create({ beings: async () => [{ n: 5, owner: W }, { n: 9, owner: W }, { n: 176, owner: "Other111111111111111111111111111111111111111" }], walletOf: t => t === "tok" ? W : null });
const PID = "0123456789abcdef01234567";
// plays a run like a careless player: cast the first five, take the first offer
function playThrough(d) {
  const S = E.createRun({ seed: d.seed, deck: d.deck, own: d.own, cards: C.cardOf }), moves = [];
  for (let k = 0; k < 40 && !S.over; k++) { const m = S.phase === "draft" ? ["p", 0] : ["c", [0, 1, 2, 3, 4].slice(0, Math.min(5, S.hand.length))]; E.act(S, m); moves.push(m); }
  return { S, moves };
}
async function later(fn) { const real = Date.now; Date.now = () => real() + 3600e3; try { return await fn(); } finally { Date.now = real; } }

test("the daily trip is the same deck and seed for everybody", async () => {
  const g = make();
  const a = await g.start({ mode: "daily", pid: PID }), b = await g.start({ mode: "daily", token: "tok" });
  assert.deepEqual(a.deck, b.deck); assert.equal(a.seed, b.seed); assert.equal(a.deck.length, 20);
  assert.deepEqual(g.dailyDef("2026-10-12"), g.dailyDef("2026-10-12"));
  assert.notDeepEqual(g.dailyDef("2026-10-12").deck, g.dailyDef("2026-10-13").deck);
});

test("the server replays the moves and decides the score", async () => {
  const g = make(), d = await g.start({ mode: "daily", pid: PID });
  const { S, moves } = playThrough(d);
  const r = await later(() => g.finish({ run: d.run, moves }));
  assert.ok(r.result, r.error); assert.equal(r.result.total, S.total); assert.equal(r.result.cleared, E.cleared(S));
  assert.ok(r.result.board && r.result.board.rank === 1);
  const again = g.finish({ run: d.run, moves }); assert.ok(again.error);
  const b = g.board({ pid: PID }); assert.equal(b.daily.top[0].total, S.total); assert.ok(b.daily.top[0].you);
});

test("made-up moves are refused, and so is a run handed in too fast", async () => {
  const g = make();
  const d = await g.start({ mode: "daily", pid: PID });
  assert.ok((await later(() => g.finish({ run: d.run, moves: [["c", [0, 0]]] }))).error);
  const d2 = await g.start({ mode: "daily", pid: PID });
  assert.ok(g.finish({ run: d2.run, moves: [["x", 1]] }).error);
  const d3 = await g.start({ mode: "daily", pid: PID });
  const { moves } = playThrough(d3);
  assert.match(g.finish({ run: d3.run, moves }).error || "", /faster/);
  assert.ok(g.finish({ run: "nope", moves: [] }).gone);
});

test("a free run deals your own beings and a summoned one; the summon is counted", async () => {
  const g = make();
  const d = await g.start({ mode: "free", token: "tok", summon: 176 });
  assert.ok(d.deck.includes(5) && d.deck.includes(9) && d.deck.includes(176));
  assert.deepEqual(d.own.sort((a, b) => a - b), [5, 9]); assert.equal(d.summoned, 176);
  const nobody = await g.start({ mode: "free", pid: PID, summon: 300 });   // unowned beings can't be summoned
  assert.equal(nobody.summoned, null);
  assert.equal(g.board({}).summons[0].n, 176);
  const s = await g.summonable(); assert.equal(s.beings[0].n, 176); assert.equal(s.beings[0].count, 1);
  const m = await g.me({ token: "tok" }); assert.deepEqual(m.own, [5, 9]);
  assert.ok((await g.start({ mode: "free", token: "expired" })).status === 401);
});
