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
  assert.equal(s.sides[0].deck.length, 64); assert.ok(s.sides[0].draw); assert.ok(s.sides[1].ai);
  const S = A.createMatch({ seed: s.seed, sides: s.sides, wild: s.wild }), inputs = [];
  while (!S.over) {
    if (S.tick % 40 === 0) { const P = S.sides[0]; const slot = P.hand.findIndex(ci => P.deck[ci].cost <= P.dmt); if (slot >= 0) { const d = P.deck[P.hand[slot]]; const x = 14.5, y = d.kind === "spell" ? 6.5 : 23; if (!A.place(S, 0, slot, x, y)) inputs.push({ t: S.tick, slot, x, y }); } }
    A.step(S);
  }
  const early = await G.finish({ match: s.match, inputs });
  assert.match(early.error, /faster than it could be played/, "an instant hand-in is refused");
  const s2 = await G.start({});
  const S2 = A.createMatch({ seed: s2.seed, sides: s2.sides, wild: s2.wild });
  while (!S2.over) A.step(S2);
  // pretend the match took as long as it really lasts
  const realNow = Date.now; Date.now = () => realNow() + S2.time * 1000;
  const r = await G.finish({ match: s2.match, inputs: [] });
  Date.now = realNow;
  assert.equal(r.result.won, S2.winner === 0);
  assert.deepEqual(r.result.crowns, S2.crowns);
  assert.match((await G.finish({ match: s2.match, inputs: [] })).error, /already/);
});

const blank = () => { const S = A.createMatch({ seed: 11, sides: [{ deck: deckA() }, { deck: deckB() }] }); S.ents = S.ents.filter(e => e.kind === "tower"); return S; };
const drop = (S, side, n, x, y) => { const d = C.fighter(n); A.place; return S.ents[S.ents.push({ ...{ id: ++S.id, side, kind: "unit", def: d, style: d.style, x, y, r: d.r, hp: d.hp, max: d.hp, shield: 0, dmg: d.dmg, hit: d.hit, range: d.range, speed: d.speed, air: d.air, targetsAir: d.targetsAir, buildings: d.buildings, splash: d.splash, cd: 0, wake: 0, target: null, slowUntil: 0, rootUntil: 0, ramp: 1, tick: 0, cloaked: d.style === "cloak", ethereal: d.style === "ethereal" } }) - 1]; };

test("an Entity can only be hurt by towers: units and spells pass through it", () => {
  const S = blank();
  const ent = drop(S, 1, 29, 9, 20);
  const foe = drop(S, 0, 3, 9, 20.8);                 // a striker right beside it
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
  const victim = drop(S, 1, 3, 9, 22.9); victim.hp = victim.max = 5000; victim.speed = 0; victim.dmg = 0;
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
  const foes = [drop(S, 1, 3, 8, 21), drop(S, 1, 31, 10, 21), drop(S, 1, 8, 9, 23)];
  foes.forEach(f => { f.speed = 0; f.dmg = 0; });
  const hps = foes.map(f => f.hp);
  S.sides[0].dmt = 10; S.sides[0].deck[S.sides[0].hand[0]] = C.fighter(842);
  assert.equal(A.place(S, 0, 0, 9, 22), null);
  assert.ok(foes.every((f, i) => f.hp < hps[i] || f.hp <= 0), "all three struck");
});

test("a Supernova flies from your Throne and lands a moment later", () => {
  const S = blank();
  const foe = drop(S, 1, 3, 9, 8); foe.speed = 0; foe.dmg = 0; foe.hp = foe.max = 5000;
  const P = S.sides[0]; P.dmt = 10; P.hand[0] = P.deck.findIndex(c => c.id === "nova");
  assert.equal(A.place(S, 0, 0, 9, 8), null);
  assert.equal(foe.hp, 5000, "not hit yet: it's in the air");
  assert.equal(S.flights.length, 1);
  for (let k = 0; k < 40 && S.flights.length; k++) A.step(S);
  assert.equal(S.flights.length, 0); assert.ok(foe.hp < 5000, "and it lands");
});

const cast = (S, id, x, y) => { const P = S.sides[0]; P.dmt = 10; P.deck.push({ ...C.SPELLS[id] }); P.hand[0] = P.deck.length - 1; return A.place(S, 0, 0, x, y); };
test("Meteor Shower drops six meteors, one after another", () => {
  const S = blank();
  assert.equal(cast(S, "meteor", 9, 8), null);
  assert.equal(S.flights.length, 6);
  const lands = S.flights.map(f => f.land); assert.ok(lands.every((t, i) => !i || t > lands[i - 1]), "staggered");
  for (let k = 0; k < 60; k++) A.step(S);
  assert.equal(S.flights.length, 0);
});
test("a Black Hole drags enemies in, then implodes", () => {
  const S = blank();
  const foe = drop(S, 1, 3, 11, 8); foe.speed = 0; foe.dmg = 0; foe.hp = foe.max = 5000; foe.style = null;
  const d0 = Math.hypot(foe.x - 9, foe.y - 8);
  assert.equal(cast(S, "hole", 9, 8), null);
  for (let k = 0; k < 20; k++) A.step(S);
  assert.ok(Math.hypot(foe.x - 9, foe.y - 8) < d0 - 0.5, "pulled toward the middle");
  const mid = foe.hp; for (let k = 0; k < 25; k++) A.step(S);
  assert.equal(S.holes.length, 0); assert.ok(mid - foe.hp > 400, "and crushed when it implodes");
});
test("the Mothership arrives, then burns what's under it", () => {
  const S = blank();
  const foe = drop(S, 1, 3, 9, 8); foe.speed = 0; foe.dmg = 0; foe.hp = foe.max = 5000; foe.style = null;   // no self-mending
  assert.equal(cast(S, "mother", 9, 8), null);
  for (let k = 0; k < 12; k++) A.step(S);
  assert.equal(foe.hp, 5000, "still arriving");
  for (let k = 0; k < 70; k++) A.step(S);
  assert.ok(5000 - foe.hp > 700, "the beam burned it"); assert.equal(S.ships.length, 0);
});

test("a Realm Surge sends each side its own wild being, at its own random spot", () => {
  const wild = [[3, 9], [31, 33], [14, 18], [57, 59], [80, 84], [63, 66], [8, 12]].map(([a, b]) => [C.fighter(a, 0.9), C.fighter(b, 0.9)]);
  const S = A.createMatch({ seed: 21, sides: [{ deck: deckA() }, { deck: deckB() }], wild });
  run(S, 25 * A.TICK);
  const w = S.ents.filter(e => e.wild), mine = w.find(e => e.side === 0), theirs = w.find(e => e.side === 1);
  assert.equal(w.length, 2); assert.ok(mine && theirs);
  assert.notEqual(mine.def.n, theirs.def.n, "different beings");
  assert.ok(mine.y > A.RIVER && theirs.y < A.RIVER, "each on its own half");
  assert.ok(Math.abs(mine.x - theirs.x) > 1e-6 || Math.abs((mine.y + theirs.y) - A.H) > 1e-6, "not mirrored");
});
test("towers come down sooner than before", () => {
  const S = A.createMatch({ seed: 1, sides: [{ deck: deckA() }, { deck: deckB() }] });
  const g = S.ents.find(e => e.tower === "gate"), t = S.ents.find(e => e.tower === "throne");
  assert.equal(g.max, 1000); assert.equal(t.max, 1800);
});

test("in a draw, a played card is gone for good and a new one comes in", () => {
  const deck = [...Array(20).keys()].map(i => C.fighter(1 + i * 7));
  const S = A.createMatch({ seed: 3, sides: [{ deck, draw: true }, { deck: deckB() }] });
  const P = S.sides[0];
  assert.deepEqual(P.hand, [0, 1, 2, 3], "dealt in the server's order");
  P.dmt = 10; const slot = P.hand.findIndex(ci => P.deck[ci].cost <= 5), ci = P.hand[slot];
  assert.equal(A.place(S, 0, slot, 9, 24), null);
  assert.equal(P.hand[slot], 4, "the next card in the stream comes in");
  assert.ok(!P.queue.includes(ci) && !P.hand.includes(ci), "and the played one is spent");
});

test("the engine uses only exact arithmetic, so every browser and the server agree", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "engine.js"), "utf8");
  for (const f of ["sin", "cos", "tan", "atan", "atan2", "pow", "exp", "log", "hypot", "cbrt"]) assert.ok(!new RegExp("Math\\." + f + "\\(").test(src), "Math." + f + " is not exact across engines");
});

test("no sort in the engine rolls dice inside its comparisons", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "engine.js"), "utf8");
  for (const m of src.matchAll(/\.sort\(([^;]*)\)/g)) assert.ok(!/rng\(/.test(m[1]), "a sort comparator calls rng: " + m[1]);
});

test("the arena refuses a dead session with a 401 instead of a guest match", async () => {
  const G = require("./game").create({ walletOf: t => t === "good" ? "W" : null });
  const r = await G.start({ token: "dead" }); assert.equal(r.status, 401); assert.match(r.error, /sign in again/i);
  assert.ok((await G.start({})).match);
});

test("the arena says when it can't read a wallet, and one caller can't evict another", async () => {
  const bad = require("./game").create({ walletOf: () => "W", beings: async () => { throw new Error("rpc down"); } });
  assert.match((await bad.start({ token: "t" })).error, /Couldn't read your wallet/);
  const G = require("./game").create();
  const mine = await G.start({ ip: "1.1.1.1" });
  for (let k = 0; k < 20; k++) await G.start({ ip: "6.6.6.6" });
  const r = await G.finish({ match: mine.match, inputs: [] });
  assert.ok(!/ended/.test(r.error || ""), "my match is still there: " + r.error);
});

/* ---------- a fair hand ---------- */
const handOk = P => {
  const keys = P.hand.map(ci => { const d = P.deck[ci]; return d.kind === "spell" ? "s" + d.id : "b" + (d.n || d.id); });
  const huge = P.hand.filter(ci => P.deck[ci].kind === "spell" && P.deck[ci].cost >= 6).length;
  return new Set(keys).size === keys.length && huge <= 1;
};
test("the hand is always fair: two cheap units to open, never two of a card, at most one 6+ spell", async () => {
  const G = require("./game").create();
  for (let g = 0; g < 25; g++) {
    const s = await G.start({ ip: "f" + g });
    const S = A.createMatch({ seed: s.seed, sides: s.sides, wild: s.wild }), P = S.sides[0];
    const cheap = P.hand.filter(ci => P.deck[ci].kind === "unit" && P.deck[ci].cost >= 2 && P.deck[ci].cost <= 4).length;
    assert.ok(cheap >= 2, "opening hand has two cheap units");
    assert.ok(handOk(P), "opening hand fair");
    // play through, always checking the hand
    for (let k = 0; k < 4000 && !S.over; k++) {
      if (k % 23 === 0) { P.dmt = 10; const slot = k % 4, d = P.deck[P.hand[slot]]; A.place(S, 0, slot, 9, d.kind === "spell" ? 6 : 24); assert.ok(handOk(P), "hand fair after a play"); }
      A.step(S);
    }
  }
});

test("a holder's own beings are always in the deck: one in the opening hand, then often", async () => {
  const mine = [176, 823, 41];
  const G = require("./game").create({ walletOf: () => "W", beings: async () => mine.map(n => ({ n, owner: "W" })), boostOf: async () => ({ level: 1, boost: 1.05 }) });
  for (let g = 0; g < 10; g++) {
    const s = await G.start({ token: "t" });
    const S = A.createMatch({ seed: s.seed, sides: s.sides, wild: s.wild }), P = S.sides[0];
    assert.ok(P.hand.some(ci => P.deck[ci].own), "one of yours in the opening hand");
    const own = s.sides[0].deck.filter(c => c.own);
    assert.ok(own.length >= 12, "about a third of the draw is yours: " + own.length);
    assert.ok(own.every(c => mine.includes(c.n)));
  }
});

/* ---------- the guided first match ---------- */
test("the first, guided match is an easy win; only a first battle gets one", async () => {
  const G = require("./game").create();
  const pid = "ab".repeat(16);
  let wins = 0;
  for (let g = 0; g < 12; g++) {
    const s = await G.start({ tutorial: true, pid: g === 0 ? pid : "cd".repeat(15) + String(g).padStart(2, "0") });
    assert.ok(s.tutorial);
    const S = A.createMatch({ seed: s.seed, sides: s.sides, wild: s.wild }), inputs = [];
    // a newcomer: plays a card whenever one is affordable, straight up the middle
    while (!S.over) {
      const P = S.sides[0];
      if (S.tick % 30 === 0) { const slot = P.hand.findIndex(ci => P.deck[ci].cost <= P.dmt); if (slot >= 0) { const d = P.deck[P.hand[slot]]; const x = 9, y = d.kind === "spell" ? 4 : 22; if (!A.place(S, 0, slot, x, y)) inputs.push({ t: S.tick, slot, x, y }); } }
      A.step(S);
    }
    if (S.winner === 0) wins++;
    if (g === 0) {
      const realNow = Date.now; Date.now = () => realNow() + S.time * 1000;
      const r = await G.finish({ match: s.match, inputs });
      Date.now = realNow;
      assert.ok(r.result.won); assert.ok(r.result.tutorial);
      assert.equal(r.result.progress.starsMoved, 0, "no stars for the guided match");
      assert.ok(r.result.progress.xp > 0);
    }
  }
  assert.equal(wins, 12, "the guided match is won every time");
  const again = await G.start({ tutorial: true, pid });
  assert.ok(!again.tutorial, "a second guided match is refused once you've played");
});

/* ---------- live matches survive a restart ---------- */
test("a live match survives a restart: the new server counts it", async () => {
  const dir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "arena-"));
  const G1 = require("./game").create({ dir });
  const s = await G1.start({ ip: "r" });
  G1.flush();
  const G2 = require("./game").create({ dir });
  assert.equal(G2.live(), 1);
  const S = A.createMatch({ seed: s.seed, sides: s.sides, wild: s.wild });
  while (!S.over) A.step(S);
  const realNow = Date.now; Date.now = () => realNow() + S.time * 1000;
  const r = await G2.finish({ match: s.match, inputs: [] });
  Date.now = realNow;
  assert.ok(r.result, r.error);
  assert.deepEqual(r.result.crowns, S.crowns);
});

test("a damaged file of live matches doesn't stop the server", () => {
  const dir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "arena-"));
  require("fs").writeFileSync(require("path").join(dir, "arena-live.json"), "{nope");
  const G = require("./game").create({ dir });
  assert.equal(G.live(), 0);
});

/* ---------- the weekly board and progress ---------- */
async function winFor(G, opts) {
  const s = await G.start(opts);
  const S = A.createMatch({ seed: s.seed, sides: s.sides, wild: s.wild }), inputs = [];
  while (!S.over) {
    const P = S.sides[0];
    if (S.tick % 20 === 0) { const slot = P.hand.findIndex(ci => P.deck[ci].kind === "unit" && P.deck[ci].cost <= P.dmt); if (slot >= 0) { if (!A.place(S, 0, slot, 9, 17)) inputs.push({ t: S.tick, slot, x: 9, y: 17 }); } }
    A.step(S);
  }
  const realNow = Date.now; Date.now = () => realNow() + 400 * 1000;
  const r = await G.finish({ match: s.match, inputs });
  Date.now = realNow;
  return r;
}
test("wins by signed-in holders score on the weekly board; guests and borrowed beings don't", async () => {
  const owners = { A: [5], B: [] };
  const G = require("./game").create({ walletOf: t => t, beings: async () => Object.entries(owners).flatMap(([w, ns]) => ns.map(n => ({ n, owner: w }))), boostOf: async () => ({ level: 0, boost: 1 }) });
  let scored = 0, tries = 0;
  while (!scored && tries++ < 12) { const r = await winFor(G, { token: "A" }); if (r.result && r.result.won) { assert.ok(r.result.board.points >= 10); scored++; } }
  assert.ok(scored, "a holder's win scored");
  const b = G.board({ token: "A" });
  assert.equal(b.you.rank, 1); assert.equal(b.top[0].you, true);
  for (let k = 0; k < 3; k++) { const r = await winFor(G, { token: "B" }); if (r.result && r.result.won) assert.equal(r.result.unscored, "guest"); }
  assert.equal(G.board({}).top.length, 1);
});

test("progress: a guest's battles move their level, quests and stars", async () => {
  const G = require("./game").create();
  const { pid, profile } = G.me({});
  assert.equal(profile.games, 0); assert.equal(profile.quests.length, 3);
  const r = await winFor(G, { pid });
  assert.ok(r.result.progress);
  assert.equal(G.me({ pid }).profile.games, 1);
  if (r.result.won) assert.equal(r.result.progress.starsMoved, 1);
});
