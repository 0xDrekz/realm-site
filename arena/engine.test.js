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
  assert.equal(f.cost, 9); assert.equal(f.style, "prime");
  assert.equal(C.fighter(842).style, "descend", "Gods descend"); assert.equal(C.fighter(29).style, "ethereal", "Entities are ethereal");
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

const blank = () => { const S = A.createMatch({ seed: 11, sides: [{ deck: deckA() }, { deck: deckB() }] }); S.ents = S.ents.filter(e => e.kind === "tower"); return S; };
const drop = (S, side, n, x, y) => { const d = C.fighter(n); A.place; return S.ents[S.ents.push({ ...{ id: ++S.id, side, kind: "unit", def: d, style: d.style, x, y, r: d.r, hp: d.hp, max: d.hp, shield: 0, dmg: d.dmg, hit: d.hit, range: d.range, speed: d.speed, air: d.air, targetsAir: d.targetsAir, buildings: d.buildings, splash: d.splash, cd: 0, wake: 0, target: null, slowUntil: 0, rootUntil: 0, ramp: 1, tick: 0, cloaked: d.style === "cloak", ethereal: d.style === "ethereal" } }) - 1]; };

test("an Entity can only be hurt by towers: units and spells pass through it", () => {
  const S = blank();
  const ent = drop(S, 1, 29, 9, 20);
  const foe = drop(S, 0, 4, 9, 20.8);                 // a striker right beside it
  const hp = ent.hp;
  for (let k = 0; k < 40; k++) A.step(S);
  assert.equal(ent.hp, hp, "the striker can't touch it");
  // a spell can't either
  S.sides[0].dmt = 10; const slot = S.sides[0].hand.findIndex(ci => S.sides[0].deck[ci].kind === "spell");
  if (slot >= 0) { A.place(S, 0, slot, ent.x, ent.y); A.step(S); assert.equal(ent.hp, hp, "spells pass through"); }
  // walk it into a tower's range and it starts to break
  ent.x = 3.5; ent.y = 21.5;
  for (let k = 0; k < 60; k++) A.step(S);
  assert.ok(ent.hp < hp, "towers hurt it");
});

test("Spore Gas leaves a cloud that keeps hurting enemies standing in it", () => {
  const S = blank();
  const g = drop(S, 0, [...Array(1100).keys()].map(i => i + 1).find(n => C.fighter(n).style === "gas" && C.fighter(n).range < 1.6 && !C.fighter(n).buildings), 9, 22);
  const victim = drop(S, 1, 4, 9, 22.9); victim.hp = victim.max = 5000; victim.speed = 0; victim.dmg = 0;
  for (let k = 0; k < 30 && !S.zones.length; k++) A.step(S);
  assert.ok(S.zones.length, "a cloud appears");
  const z = S.zones[0]; g.hp = 0; A.step(S);                 // the caster gone, the cloud lingers
  const before = victim.hp; for (let k = 0; k < 20; k++) A.step(S);
  assert.ok(victim.hp < before, "the cloud still hurts");
  for (let k = 0; k < 80; k++) A.step(S);
  assert.ok(!S.zones.includes(z), "and then it fades");
});

test("a God descends with lightning on the enemies around it", () => {
  const S = blank();
  const foes = [drop(S, 1, 4, 8, 21), drop(S, 1, 31, 10, 21), drop(S, 1, 8, 9, 23)];
  foes.forEach(f => { f.speed = 0; f.dmg = 0; });
  const hps = foes.map(f => f.hp);
  S.sides[0].dmt = 10; S.sides[0].deck[S.sides[0].hand[0]] = C.fighter(842);
  assert.equal(A.place(S, 0, 0, 9, 22), null);
  assert.ok(foes.every((f, i) => f.hp < hps[i] || f.hp <= 0), "all three struck");
});
