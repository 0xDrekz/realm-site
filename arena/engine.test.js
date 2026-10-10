/* REALM Arena — engine and server tests.  npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./engine"), C = require("./cards");

const deckA = () => C.deck([4, 31, 14, 1, 57, 80]);
const deckB = () => C.deck([8, 39, 24, 12, 45, 63]);
const run = (S, until) => { while (!S.over && S.tick < until) A.step(S); return S; };

test("a being always makes the same fighter; roles come from its top essence", () => {
  assert.deepEqual(C.fighter(842), C.fighter(842));
  const f = C.fighter(1111);
  assert.equal(f.cost, 9); assert.equal(f.signature, "prime");
  for (const n of [1, 100, 500, 900]) assert.ok(["tank", "striker", "ranged", "caster", "support"].includes(C.fighter(n).role));
  assert.ok(C.fighter(842, 1.15).hp > C.fighter(842).hp, "the $DMT boost makes it stronger");
});

test("a match starts with 5 DMT, a hand of 4 and three towers a side", () => {
  const S = A.createMatch({ seed: 1, sides: [{ deck: deckA() }, { deck: deckB() }] });
  for (const P of S.sides) { assert.equal(P.dmt, 5); assert.equal(P.hand.length, 4); assert.equal(P.queue.length, 4); }
  assert.equal(S.ents.filter(e => e.kind === "tower").length, 6);
});

test("DMT fills over time, faster each minute, and stops at 10", () => {
  const S = A.createMatch({ seed: 2, sides: [{ deck: deckA() }, { deck: deckB() }] });
  S.sides[0].dmt = 0; run(S, A.TICK * 10);
  const calm = S.sides[0].dmt; assert.ok(calm > 3.4 && calm < 3.8, "about one every 2.8s: " + calm);
  run(S, A.TICK * 60); S.sides[0].dmt = 0; run(S, A.TICK * 70);
  assert.ok(S.sides[0].dmt > calm * 1.4, "rising is faster");
  run(S, A.TICK * 100); assert.ok(S.sides[0].dmt <= 10);
});

test("placing a card spends DMT, cycles the card to the back, and only fits your half", () => {
  const S = A.createMatch({ seed: 3, sides: [{ deck: deckA() }, { deck: deckB() }] });
  const P = S.sides[0], slot = P.hand.findIndex(ci => P.deck[ci].kind === "unit" && P.deck[ci].cost <= 5);
  const ci = P.hand[slot], cost = P.deck[ci].cost, next = P.queue[0];
  assert.match(A.place(S, 0, slot, 9, 8), /there/, "not on the rival's half");
  assert.equal(A.place(S, 0, slot, 9, 24), null);
  assert.equal(P.dmt, 5 - cost);
  assert.equal(P.hand[slot], next); assert.equal(P.queue.at(-1), ci);
  P.dmt = 0; assert.match(A.place(S, 0, 0, 9, 24), /DMT/);
});

test("the same seed and the same placements give the same match, every time", () => {
  const sides = [{ deck: deckA() }, { deck: deckB(), ai: true, level: 1 }];
  const play = () => {
    const S = A.createMatch({ seed: 99, sides: JSON.parse(JSON.stringify(sides)) }), inputs = [];
    while (!S.over) {
      if (S.tick % 50 === 0) { const P = S.sides[0]; const slot = P.hand.findIndex(ci => P.deck[ci].cost <= P.dmt); if (slot >= 0) { const d = P.deck[P.hand[slot]]; const x = 3.5, y = d.kind === "spell" ? 7 : 24; if (!A.place(S, 0, slot, x, y)) inputs.push({ t: S.tick, slot, x, y }); } }
      A.step(S);
    }
    return { S, inputs };
  };
  const a = play(), b = play();
  assert.equal(a.S.tick, b.S.tick); assert.deepEqual(a.S.crowns, b.S.crowns); assert.equal(a.S.winner, b.S.winner);
  // and the server's replay, from the placements alone, agrees
  const r = A.replay({ seed: 99, sides: JSON.parse(JSON.stringify(sides)), inputs: a.inputs });
  assert.equal(r.error, undefined);
  assert.equal(r.S.tick, a.S.tick); assert.deepEqual(r.S.crowns, a.S.crowns); assert.equal(r.S.winner, a.S.winner);
});

test("a replay refuses a placement the rules don't allow", () => {
  const sides = [{ deck: deckA() }, { deck: deckB(), ai: true }];
  const r = A.replay({ seed: 5, sides, inputs: [{ t: 0, slot: 0, x: 9, y: 3 }] });
  assert.match(r.error, /not allowed/);
});

test("destroying the Throne wins at once", () => {
  const S = A.createMatch({ seed: 6, sides: [{ deck: deckA() }, { deck: deckB() }] });
  const throne = S.ents.find(e => e.tower === "throne" && e.side === 1);
  throne.hp = 1; S.ents.push({ ...throne, id: 999, side: 0, tower: undefined, kind: "unit", def: C.fighter(4), x: throne.x, y: throne.y + 1.5, r: .4, hp: 500, max: 500, dmg: 50, hit: .5, range: 1, speed: 1, cd: 0, wake: 0, shield: 0, buildings: true });
  run(S, 200);
  assert.ok(S.over); assert.equal(S.winner, 0); assert.equal(S.crowns[0], 3);
});

test("after 3 minutes, more towers wins; level goes to sudden death", () => {
  const S = A.createMatch({ seed: 7, sides: [{ deck: deckA() }, { deck: deckB() }] });
  run(S, A.MATCH_S * A.TICK + 1);
  assert.ok(!S.over, "level at 3:00 means sudden death");
  S.ents.find(e => e.tower === "gate" && e.side === 1).hp = 0;
  A.step(S);
  assert.ok(S.over); assert.equal(S.winner, 0);
});

test("the server replays a finished match and decides it; a match can't be counted twice", async () => {
  const G = require("./game").create();
  const s = await G.start({});
  assert.equal(s.sides[0].deck.length, 8); assert.ok(s.sides[1].ai);
  const S = A.createMatch({ seed: s.seed, sides: s.sides }), inputs = [];
  while (!S.over) {
    if (S.tick % 40 === 0) { const P = S.sides[0]; const slot = P.hand.findIndex(ci => P.deck[ci].cost <= P.dmt); if (slot >= 0) { const d = P.deck[P.hand[slot]]; const x = 14.5, y = d.kind === "spell" ? 6.5 : 23; if (!A.place(S, 0, slot, x, y)) inputs.push({ t: S.tick, slot, x, y }); } }
    A.step(S);
  }
  const early = G.finish({ match: s.match, inputs });
  assert.match(early.error, /faster than it could be played/, "an instant hand-in is refused");
  const s2 = await G.start({});
  const S2 = A.createMatch({ seed: s2.seed, sides: s2.sides });
  while (!S2.over) A.step(S2);
  // pretend the match took as long as it really lasts
  const realNow = Date.now; Date.now = () => realNow() + S2.time * 1000;
  const r = G.finish({ match: s2.match, inputs: [] });
  Date.now = realNow;
  assert.equal(r.result.won, S2.winner === 0);
  assert.deepEqual(r.result.crowns, S2.crowns);
  assert.match(G.finish({ match: s2.match, inputs: [] }).error, /already/);
});
