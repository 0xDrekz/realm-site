"use strict";
const test = require("node:test"), assert = require("node:assert");
const E = require("./engine"), C = require("./cards");
const mk = (aura, o = {}) => Object.assign({ n: 0, tier: "Common", chips: 6, aura, geo: null, col: null, x: {} }, o);

test("hands come from matching Auras", () => {
  const h = a => E.handOf(a.map(x => mk(x))).id;
  assert.equal(h(["Cold"]), "spark");
  assert.equal(h(["Cold", "Cold"]), "pair");
  assert.equal(h(["Cold", "Cold", "Rose", "Rose"]), "twopair");
  assert.equal(h(["Cold", "Cold", "Cold", "Rose"]), "triad");
  assert.equal(h(["Cold", "Rose", "Warm", "Acid", "Opposed"]), "spectrum");
  assert.equal(h(["Cold", "Cold", "Cold", "Rose", "Rose"]), "vision");
  assert.equal(h(["Acid", "Acid", "Acid", "Acid", "Rose"]), "quad");
  assert.equal(h(["Warm", "Warm", "Warm", "Warm", "Warm"]), "ascension");
});

test("only the beings in the hand score; a Spark is the strongest single card", () => {
  const r = E.handOf([mk("Cold"), mk("Rose", { chips: 30 }), mk("Warm")]);
  assert.deepEqual(r, { id: "spark", scoring: [1] });
  assert.deepEqual(E.handOf([mk("Cold"), mk("Rose"), mk("Cold")]).scoring, [0, 2]);
});

test("the Prime Source counts as any Aura", () => {
  const src = mk("Prime", { tier: "Source", chips: 111 });
  assert.equal(E.handOf([mk("Cold"), mk("Cold"), mk("Cold"), mk("Cold"), src]).id, "ascension");
  assert.equal(E.handOf([mk("Cold"), mk("Rose"), mk("Warm"), mk("Acid"), src]).id, "spectrum");
});

test("score: chips x mult, traits left to right, order matters for multipliers", () => {
  // pair (10 x 2) + two 6-chip commons = 22 x 2 = 44
  assert.equal(E.evaluate([mk("Cold"), mk("Cold")], 0).score, 44);
  // a +4 mult before a x2 is worth more than after it
  const strike = mk("Cold", { x: { L: "Strike" } }), nova = mk("Cold", { x: { S: "Two" } });
  const a = E.evaluate([strike, nova], 0).score, b = E.evaluate([nova, strike], 0).score;
  assert.equal(a, 22 * 12);      // (2 + 4) x 2 = 12
  assert.equal(b, 22 * 8);       // 2 x 2 + 4 = 8
});

test("geometry pairs, harmony, spores, moon dust, your own beings", () => {
  const g = E.evaluate([mk("Cold", { geo: "Spiral" }), mk("Cold", { geo: "Spiral" })], 0);
  assert.equal(g.mult, 40);       // 2 + 2 for the pair
  const h = E.evaluate([mk("Cold", { col: "Abyss" }), mk("Cold", { col: "Abyss" }), mk("Cold", { col: "Abyss" })], 0);
  assert.equal(h.mult, 60);       // triad 3, harmony x2
  const s = E.evaluate([mk("Cold", { x: { M: "Cluster" } }), mk("Cold")], 0);
  assert.equal(s.chips, 10 + 6 * 3 + 6);   // scored three times
  const d = E.evaluate([mk("Cold", { x: { D: "Faint" } }), mk("Cold")], 5);
  assert.equal(d.chips, 10 + 6 + 20 + 6);
  const o = E.evaluate([mk("Cold", { n: 7 }), mk("Cold", { n: 8 })], 0, [7]);
  assert.equal(o.chips, 10 + 9 + 6);
});

test("every being has an Aura (or is the Source) and a whole number of chips", () => {
  for (const c of C.all()) {
    assert.ok(E.AURAS.includes(c.aura) || c.tier === "Source", "aura of #" + c.n);
    assert.ok(Number.isInteger(c.chips) && c.chips >= 6, "chips of #" + c.n);
  }
  assert.ok(C.cardOf(1111).chips > C.cardOf(1).chips);
});

function sampleRun(seed) {
  const deck = []; for (let i = 0; deck.length < 20; i++) { const n = 1 + ((seed * 131 + i * 977) % 1111); if (!deck.includes(n)) deck.push(n); }
  return { seed, deck, cards: C.cardOf };
}
test("a run replays exactly from its moves", () => {
  const def = sampleRun(42), S = E.createRun(def), moves = [];
  for (let k = 0; k < 60 && !S.over; k++) {
    const m = S.phase === "draft" ? ["p", 0] : k % 3 === 2 && S.discards ? ["d", [0, 1]] : ["c", [0, 1, 2, 3, 4].slice(0, Math.min(5, S.hand.length))];
    const r = E.act(S, m); assert.ok(!r.error, r.error); moves.push(m);
  }
  const R = E.replay(def, moves);
  assert.ok(!R.error);
  assert.equal(R.S.total, S.total); assert.equal(R.S.layer, S.layer); assert.deepEqual(R.S.hand, S.hand);
});

test("bad moves are refused", () => {
  const S = E.createRun(sampleRun(7));
  assert.ok(E.cast(S, []).error); assert.ok(E.cast(S, [0, 0]).error); assert.ok(E.cast(S, [0, 1, 2, 3, 4, 5]).error); assert.ok(E.cast(S, [9]).error);
  assert.ok(E.pick(S, 0).error);
  for (let i = 0; i < 3; i++) assert.ok(!E.discard(S, [0]).error);
  assert.ok(E.discard(S, [0]).error);
});

test("four casts a layer; reaching the target opens a draft and the next layer", () => {
  const S = E.createRun(sampleRun(3));
  S.score = E.targetOf(0) - 1;
  E.cast(S, [0]);
  assert.equal(S.phase, "draft"); assert.equal(S.offer.length, 3);
  const before = S.deck.length; E.pick(S, 1);
  assert.equal(S.deck.length, before + 1); assert.equal(S.layer, 1); assert.equal(S.casts, E.CASTS); assert.equal(S.hand.length, E.HAND_SIZE);
  const T = E.createRun(sampleRun(4)); T.score = -1e9;
  for (let i = 0; i < E.CASTS; i++) E.cast(T, [0]);
  assert.ok(T.over);
});

test("the best order puts +mult before x mult", () => {
  const strike = { n: 1, tier: "Common", chips: 6, aura: "Cold", geo: null, col: null, x: { L: "Strike" } };
  const nova = { n: 2, tier: "Common", chips: 6, aura: "Cold", geo: null, col: null, x: { S: "Two" } };
  const S = E.createRun({ seed: 1, deck: [1, 2, 3, 4, 5, 6, 7, 8], cards: n => n === 1 ? strike : n === 2 ? nova : { n, tier: "Common", chips: 6, aura: "Rose", geo: null, col: null, x: {} } });
  const i1 = S.hand.indexOf(1), i2 = S.hand.indexOf(2);
  assert.deepEqual(E.bestOrder(S, [i2, i1]), [i1, i2]);
  assert.equal(E.preview(S, [i1, i2]).score, 22 * 12);
});

test("the being you take is in your next opening hand", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const S = E.createRun(sampleRun(seed));
    S.score = E.targetOf(0); E.cast(S, [0]);
    const n = S.offer[2]; E.pick(S, 2);
    assert.ok(S.hand.includes(n), "seed " + seed);
  }
});

test("a holder boost multiplies the mult last, and only above 100%", () => {
  const c = { n: 1, tier: "Common", chips: 6, aura: "Cold", geo: null, col: null, x: { L: "Strike" } };
  const plain = E.evaluate([c, { ...c, n: 2 }], 0), boosted = E.evaluate([c, { ...c, n: 2 }], 0, [], 130);
  assert.equal(boosted.mult, Math.floor(plain.mult * 13 / 10));
  assert.equal(boosted.steps.filter(s => s.label === "Holder boost").length, 1);
  assert.equal(E.evaluate([c], 0, [], 100).steps.some(s => s.label === "Holder boost"), false);
  const S = E.createRun({ seed: 7, deck: [1, 2, 3, 4, 5, 6, 7, 8], boost: 999, cards: n => ({ ...c, n }) });
  assert.equal(S.boost, 300);                                            // capped
});

test("the holder boost: a being +10%, then the highest $DMT band held, up to x2.6", () => {
  assert.equal(E.boostFor(0, false), 100); assert.equal(E.boostFor(0, true), 110);
  assert.equal(E.boostFor(49999, false), 100); assert.equal(E.boostFor(50e3, false), 110);
  assert.equal(E.boostFor(499999, true), 130); assert.equal(E.boostFor(500e3, false), 150); assert.equal(E.boostFor(500e3, true), 160);
  assert.equal(E.boostFor(5e6, false), 200); assert.equal(E.boostFor(10e6, true), 260); assert.equal(E.boostFor(1e12, true), 260);
});

test("Realm Weather twists the score, and no weather changes nothing", () => {
  const five = [mk("Cold", { n: 1 }), mk("Cold", { n: 2 }), mk("Cold", { n: 3 }), mk("Rose", { n: 4 }), mk("Rose", { n: 5 })];
  const base = E.evaluate(five, 0, [], 100).score;
  assert.equal(E.evaluate(five, 0, [], 100, null).score, base);
  assert.equal(E.evaluate(five, 0, [], 100, "nonsense").score, base);
  assert.ok(E.evaluate(five, 0, [], 100, "tide-Cold").score > base);
  assert.equal(E.evaluate(five, 0, [], 100, "tide-Warm").score, base);
  assert.equal(E.evaluate(five, 0, [], 100, "humble").chips, E.evaluate(five, 0, [], 100).chips + 2 * 5 * 6);
  const myco = [mk("Cold", { x: { M: "Few" } }), mk("Cold")];
  assert.ok(E.evaluate(myco, 0, [], 100, "spores").score > E.evaluate(myco, 0, [], 100).score);
  const stormy = [mk("Cold", { x: { L: "Storm" } }), mk("Cold")];
  assert.equal(E.evaluate(stormy, 0, [], 100, "ion").mult - E.evaluate(stormy, 0, [], 100).mult, 80);
  for (const id of Object.keys(E.WEATHER)) assert.ok(E.WEATHER[id].name && E.WEATHER[id].text);
});

test("Swift Day: three casts a layer", () => {
  const deck = C.all().slice(0, 20).map(c => c.n);
  assert.equal(E.createRun({ seed: 7, deck, cards: C.cardOf, weather: "swift" }).casts, 3);
  assert.equal(E.createRun({ seed: 7, deck, cards: C.cardOf }).casts, E.CASTS);
});

test("powers: every God, Entity and the Source has one, and they only work on runs that have powers", () => {
  const rare = C.all().filter(c => ["God", "Entity", "Source"].includes(c.tier));
  assert.equal(rare.length, 31);
  for (const c of rare) assert.ok(E.POWERS[c.n] && E.POWERS[c.n].name && E.POWERS[c.n].text, c.n + " has no power");
  const sage = C.cardOf(569), mate = mk("Rose", { n: 2, x: { L: "Storm" } });
  const off = E.evaluate([sage, mate], 0, [], 100, null, false), on = E.evaluate([sage, mate], 0, [], 100, null, true);
  assert.equal(E.evaluate([sage, mate], 0, [], 100).score, off.score);
  assert.ok(on.score > off.score);
  assert.equal(on.steps.filter(s => s.label === "Hidden Storm").length, 5);  // the Sage fires 4 times (its Grove of Mushrooms) and its mate once: each Storm once more
  // a power only works when its being scores
  const lone = [mk("Cold", { n: 1 }), mk("Cold", { n: 3 }), C.cardOf(569)];
  assert.equal(E.evaluate(lone, 0, [], 100, null, true).score, E.evaluate(lone, 0, [], 100, null, false).score);
  // the Source doubles the final mult
  const src = [C.cardOf(1111), mk("Cold", { n: 4 })];
  assert.equal(E.evaluate(src, 0, [], 100, null, true).mult, E.evaluate(src, 0, [], 100, null, false).mult * 2);
});

test("a run with powers replays the same way", () => {
  const deck = [569, 1111, 842, 29, 86, ...C.all().slice(0, 15).map(c => c.n)];
  const S = E.createRun({ seed: 99, deck, cards: C.cardOf, powers: true }), moves = [];
  for (let k = 0; k < 40 && !S.over; k++) { const m = S.phase === "draft" ? ["p", 0] : ["c", [0, 1, 2, 3, 4].slice(0, Math.min(5, S.hand.length))]; E.act(S, m); moves.push(m); }
  const R = E.replay({ seed: 99, deck, cards: C.cardOf, powers: true }, moves);
  assert.equal(R.S.total, S.total);
});
