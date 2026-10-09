/* REALM card battler — rules engine tests.  node --test tcg2/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine"), C = require("./cards"), AI = require("./ai");

/* a match with empty boards and hands, side 0 to act, plenty of essence */
function blank(opts = {}) {
  const S = E.newMatch({ seed: opts.seed || 1, sides: [{ champions: opts.a || [] }, { champions: opts.b || [] }] });
  S.active = 0; S.phase = "main"; S.turn = 5; S.events.length = 0;
  for (const P of S.players) { P.board = []; P.hand = []; P.life = 20; P.ess = P.maxEss = 10; P.attacked = false; }
  return S;
}
/* put a unit straight onto a side's board, ready to fight */
function put(S, i, def, extra = {}) {
  const d = { name: "Test", cost: 2, kw: [], essence: ["magic"], ...def };
  const u = { uid: ++S.uid, owner: i, def: d, name: d.name, power: d.power, health: d.health, kw: d.kw.slice(),
    buffP: 0, buffH: 0, damage: 0, sick: false, exhausted: false, frozen: false, thaw: false, veiledUsed: false, ...extra };
  S.players[i].board.push(u);
  return u;
}
const inHand = (S, i, id) => { const c = { uid: ++S.uid, def: C.sharedById[id] }; S.players[i].hand.push(c); return c; };
const fight = (S, attackers, blocks = {}) => {
  assert.equal(E.act(S, 0, { type: "attack", attackers: attackers.map(u => u.uid) }), null);
  assert.equal(E.act(S, 1, { type: "block", blocks }), null);
};

/* ---------- cards ---------- */
test("every being makes exactly one card, and the same card every time", () => {
  const all = C.all();
  assert.equal(all.length, 1111);
  for (const n of [1, 31, 176, 555, 1111]) assert.deepEqual(C.cardOf(n), C.cardOf(n));
  for (const c of all) {
    assert.equal(c.cost, C.COST[c.tier], "cost follows tier for #" + c.n);
    assert.ok(c.power >= 1 && c.health >= 1, "a body for #" + c.n);
    assert.ok(c.essence.length >= 1 && c.essence.length <= 2);
    assert.ok(typeof c.text === "string");
  }
});

test("the card stats come from the Duels card() function", () => {
  const stats = require("../duels").create({ root: require("path").join(__dirname, ".."), beings: async () => [], envVar: () => "" }).card;
  for (const n of [7, 200, 842, 1111]) {
    const s = stats(n), c = C.cardOf(n);
    for (const k of C.ESSENCES) assert.equal(c.stats[k], s[k]);
    const top = C.ESSENCES.slice().sort((a, b) => s[b] - s[a])[0];
    assert.equal(c.essence[0], top, "the top stat is the essence");
  }
});

test("Gods, Entities and the Source carry hand-written powers", () => {
  for (const c of C.all().filter(c => ["God", "Entity", "Source"].includes(c.tier))) {
    assert.ok(C.NAMED[c.n], "#" + c.n + " has a named power");
    assert.ok(c.legendary);
  }
  assert.equal(C.cardOf(1111).cost, 8);
});

test("the shared deck is 30 cards", () => {
  assert.equal(C.SHARED_DECK.length, 30);
  for (const id of C.SHARED_DECK) assert.ok(C.sharedById[id]);
});

/* ---------- setting up ---------- */
test("a new match: 20 life, 4 cards first and 5 second, one essence", () => {
  const S = E.newMatch({ seed: 42, sides: [{ champions: [1, 2, 3] }, { champions: [4, 5, 6] }] });
  const F = S.players[S.first], N = S.players[1 - S.first];
  assert.equal(F.life, 20); assert.equal(N.life, 20);
  assert.equal(F.hand.length, 4); assert.equal(N.hand.length, 5);
  assert.equal(F.ess, 1); assert.equal(S.turn, 1);
  assert.equal(F.champions.length, 3);
  assert.equal(F.deck.length + F.hand.length, 30);
});

test("the same seed gives the same game, a different seed a different one", () => {
  const run = seed => { const S = E.newMatch({ seed, sides: [{ champions: [10, 500, 900] }, { champions: [20, 600, 1000] }] }); AI.playOut(S); return [S.winner, S.turn, S.players[0].life, S.players[1].life].join(); };
  assert.equal(run(7), run(7));
  const many = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(run));
  assert.ok(many.size > 1);
});

test("the $DMT boost raises life and champion stats, by at most 15%", () => {
  const S = E.newMatch({ seed: 3, sides: [{ champions: [1111], boost: 1.15 }, { champions: [1111] }] });
  assert.equal(S.players[0].life, 23);
  assert.ok(S.players[0].champions[0].def.power >= S.players[1].champions[0].def.power);
});

test("the second player gets one extra essence on their first two turns only", () => {
  const S = E.newMatch({ seed: 9, sides: [{}, {}] });
  const second = 1 - S.first, turn = () => E.act(S, S.active, { type: "end" });
  turn();
  assert.equal(S.active, second); assert.equal(S.players[second].ess, 2);
  turn(); turn(); assert.equal(S.players[second].ess, 3);
  turn(); turn(); assert.equal(S.players[second].ess, 3);
});

test("a fixed deck, starting life and first player can be set (tutorial and campaign)", () => {
  const deck = ["r-strike", "s-wisp", "s-hound", "s-root", "s-halo"];
  const S = E.newMatch({ seed: 1, first: 0, sides: [{ deck }, { life: 12 }] });
  assert.equal(S.first, 0);
  assert.deepEqual(S.players[0].hand.map(c => c.def.id), deck.slice(0, 4));
  assert.equal(S.players[1].life, 12);
});

test("every allowed move is reported to the onAct hook", () => {
  const S = E.newMatch({ seed: 4, sides: [{}, {}] }); const seen = [];
  S.onAct = (who, a) => seen.push(a.type);
  E.act(S, 1 - S.active, { type: "end" });
  E.act(S, S.active, { type: "end" });
  assert.deepEqual(seen, ["end"]);
});

/* ---------- moves ---------- */
test("moves out of turn, without essence, or from nowhere are refused and change nothing", () => {
  const S = blank();
  const c = inHand(S, 0, "s-lurker");
  assert.equal(E.act(S, 1, { type: "end" }), "Not your turn.");
  S.players[0].ess = 4;
  assert.equal(E.act(S, 0, { type: "play", uid: c.uid }), "Not enough essence.");
  assert.equal(E.act(S, 0, { type: "play", uid: 99999 }), "That card is not in your hand.");
  assert.equal(S.players[0].board.length, 0); assert.equal(S.players[0].ess, 4);
});

test("summoning pays essence; a fresh unit can't attack unless it has haste", () => {
  const S = blank();
  const wisp = inHand(S, 0, "s-wisp"), hound = inHand(S, 0, "s-hound");
  assert.equal(E.act(S, 0, { type: "play", uid: wisp.uid }), null);
  assert.equal(E.act(S, 0, { type: "play", uid: hound.uid }), null);
  assert.equal(S.players[0].ess, 6);
  const [w, h] = S.players[0].board;
  assert.equal(E.canAttack(S, w), false);
  assert.equal(E.canAttack(S, h), true);
});

test("the board holds six units at most", () => {
  const S = blank();
  for (let k = 0; k < 6; k++) put(S, 0, { power: 1, health: 1 });
  const c = inHand(S, 0, "s-wisp");
  assert.equal(E.act(S, 0, { type: "play", uid: c.uid }), "Your side is full.");
});

test("a champion dies back to its zone and costs 2 more each time", () => {
  const n = C.all().find(c => c.tier === "Common" && !c.arrive.length).n;
  const S = blank({ a: [n] });
  assert.equal(E.act(S, 0, { type: "play", champion: 0 }), null);
  assert.equal(S.players[0].champions[0].home, false);
  assert.equal(E.act(S, 0, { type: "play", champion: 0 }), "That champion is not ready.");
  S.players[0].board[0].damage = 99;
  E.act(S, 0, { type: "play", uid: inHand(S, 0, "r-strike").uid, target: { face: 1 } });   // any move clears the dead
  assert.equal(S.players[0].champions[0].home, true);
  assert.equal(S.players[0].champions[0].tax, 2);
  assert.equal(E.costOf(S, S.players[0], { def: S.players[0].champions[0].def, champion: 0 }), C.COST.Common + 2);
});

/* ---------- combat ---------- */
test("unblocked attackers hit the player; attacking exhausts", () => {
  const S = blank();
  const a = put(S, 0, { power: 3, health: 3 });
  fight(S, [a]);
  assert.equal(S.players[1].life, 17);
  assert.equal(a.exhausted, true);
  assert.equal(E.act(S, 0, { type: "attack", attackers: [a.uid] }), "You have already attacked this turn.");
});

test("blocking trades damage, and damage stays on survivors", () => {
  const S = blank();
  const a = put(S, 0, { power: 2, health: 5 }), b = put(S, 1, { power: 3, health: 4 });
  fight(S, [a], { [b.uid]: a.uid });
  assert.equal(S.players[1].life, 20);
  assert.equal(E.lifeOf(S, a), 2); assert.equal(E.lifeOf(S, b), 2);
});

test("a unit that takes its health in damage dies", () => {
  const S = blank();
  const a = put(S, 0, { power: 4, health: 4 }), b = put(S, 1, { power: 1, health: 4 });
  fight(S, [a], { [b.uid]: a.uid });
  assert.equal(S.players[1].board.length, 0);
  assert.equal(S.players[0].board.length, 1);
});

test("flying can only be blocked by flying", () => {
  const S = blank();
  const f = put(S, 0, { power: 2, health: 2, kw: ["flying"] });
  const g = put(S, 1, { power: 5, health: 5 }), h = put(S, 1, { power: 1, health: 1, kw: ["flying"] });
  assert.equal(E.canBlock(S, g, f), false);
  assert.equal(E.canBlock(S, h, f), true);
  fight(S, [f], { [g.uid]: f.uid });
  assert.equal(S.players[1].life, 18, "a ground block is ignored");
});

test("veiled can't be blocked on its first attack only; unblockable never", () => {
  const S = blank();
  const v = put(S, 0, { power: 2, health: 2, kw: ["veiled"] }), x = put(S, 0, { power: 1, health: 1, kw: ["unblockable"] });
  const g = put(S, 1, { power: 1, health: 9 });
  assert.equal(E.canBlock(S, g, v), false);
  fight(S, [v, x], { [g.uid]: v.uid });
  assert.equal(S.players[1].life, 17);
  assert.equal(E.canBlock(S, g, v), true);
  assert.equal(E.canBlock(S, g, x), false);
});

test("an exhausted unit can't block", () => {
  const S = blank();
  const a = put(S, 0, { power: 2, health: 2 }), g = put(S, 1, { power: 1, health: 9 }, { exhausted: true });
  assert.equal(E.canBlock(S, g, a), false);
});

test("first strike kills before the blocker hits back", () => {
  const S = blank();
  const a = put(S, 0, { power: 3, health: 1, kw: ["firstStrike"] }), b = put(S, 1, { power: 5, health: 3 });
  fight(S, [a], { [b.uid]: a.uid });
  assert.equal(S.players[1].board.length, 0);
  assert.equal(S.players[0].board.length, 1);
});

test("double strike hits twice", () => {
  const S = blank();
  const a = put(S, 0, { power: 3, health: 3, kw: ["doubleStrike"] });
  fight(S, [a]);
  assert.equal(S.players[1].life, 14);
});

test("poison destroys whatever it damages", () => {
  const S = blank();
  const a = put(S, 0, { power: 1, health: 3, kw: ["poison"] }), b = put(S, 1, { power: 1, health: 9 });
  fight(S, [a], { [b.uid]: a.uid });
  assert.equal(S.players[1].board.length, 0);
});

test("lifelink heals its owner by the damage dealt", () => {
  const S = blank();
  S.players[0].life = 10;
  const a = put(S, 0, { power: 4, health: 2, kw: ["lifelink"] });
  fight(S, [a]);
  assert.equal(S.players[0].life, 14); assert.equal(S.players[1].life, 16);
});

test("freeze: a damaged unit can't attack on its next turn, then thaws", () => {
  const S = blank();
  const a = put(S, 0, { power: 1, health: 5, kw: ["freeze"] }), b = put(S, 1, { power: 1, health: 5 });
  fight(S, [a], { [b.uid]: a.uid });
  assert.equal(b.frozen, true);
  E.act(S, 0, { type: "end" });
  assert.equal(S.active, 1);
  assert.equal(E.canAttack(S, b), false);
  E.act(S, 1, { type: "end" });
  assert.equal(b.frozen, false);
});

test("a player at 0 life loses and the match stops taking moves", () => {
  const S = blank();
  S.players[1].life = 3;
  const a = put(S, 0, { power: 3, health: 1 });
  fight(S, [a]);
  assert.equal(S.winner, 0); assert.equal(S.phase, "over");
  assert.equal(E.act(S, 0, { type: "end" }), "The match is over.");
});

/* ---------- powers ---------- */
test("rituals: Lightning Strike hits a unit or the player and needs a valid target", () => {
  const S = blank();
  const t = put(S, 1, { power: 2, health: 3 });
  const c = inHand(S, 0, "r-strike");
  assert.equal(E.act(S, 0, { type: "play", uid: c.uid, target: null }), "Pick a valid target.");
  assert.equal(E.act(S, 0, { type: "play", uid: c.uid, target: { uid: t.uid } }), null);
  assert.equal(S.players[1].board.length, 0);
  E.act(S, 0, { type: "play", uid: inHand(S, 0, "r-strike").uid, target: { face: 1 } });
  assert.equal(S.players[1].life, 17);
});

test("attunement: a ritual is stronger with a unit of its essence in play", () => {
  const S = blank();
  E.act(S, 0, { type: "play", uid: inHand(S, 0, "r-strike").uid, target: { face: 1 } });
  assert.equal(S.players[1].life, 17);
  put(S, 0, { power: 1, health: 1, essence: ["magic"] });
  E.act(S, 0, { type: "play", uid: inHand(S, 0, "r-strike").uid, target: { face: 1 } });
  assert.equal(S.players[1].life, 13);
});

test("Eclipse only destroys a unit small enough", () => {
  const S = blank();
  const big = put(S, 1, { power: 5, health: 5 }), small = put(S, 1, { power: 2, health: 5 });
  const c = inHand(S, 0, "r-eclipse");
  assert.equal(E.act(S, 0, { type: "play", uid: c.uid, target: { uid: big.uid } }), "Pick a valid target.");
  assert.equal(E.act(S, 0, { type: "play", uid: c.uid, target: { uid: small.uid } }), null);
  assert.deepEqual(S.players[1].board.map(u => u.uid), [big.uid]);
});

test("geometry auras and statics buff the other allies only", () => {
  const S = blank();
  const g = put(S, 0, { power: 1, health: 1, aura: { power: 1 } }), o = put(S, 0, { power: 2, health: 2 });
  assert.equal(E.powerOf(S, o), 3); assert.equal(E.powerOf(S, g), 1);
  put(S, 0, { power: 1, health: 1, static: { power: 1, health: 1 } });
  assert.equal(E.powerOf(S, o), 4); assert.equal(E.maxHealthOf(S, o), 3);
});

test("arrival AoE hits every enemy unit (the Source's Barrage hits the player too)", () => {
  const S = blank({ a: [1111] });
  put(S, 1, { power: 1, health: 2 }); put(S, 1, { power: 1, health: 5 });
  const life = S.players[1].life;
  assert.equal(E.act(S, 0, { type: "play", champion: 0 }), null);
  assert.equal(S.players[1].board.length, 1);
  assert.equal(S.players[1].life, life - 3);
});

test("spores, tokens and death powers summon onto the board", () => {
  const n = C.all().find(c => c.arrive.some(e => e.k === "summon" && e.n === 2) && !c.legendary).n;
  const S = blank({ a: [n] });
  E.act(S, 0, { type: "play", champion: 0 });
  assert.equal(S.players[0].board.length, 3);
  assert.ok(S.players[0].board.slice(1).every(u => u.token));
});

test("an empty deck burns: 1, then 2, then 3", () => {
  const S = blank();
  S.players[1].deck = [];
  E.act(S, 0, { type: "end" }); assert.equal(S.players[1].life, 19);
  E.act(S, 1, { type: "end" }); E.act(S, 0, { type: "end" }); assert.equal(S.players[1].life, 17);
});

test("after turn 40 the higher life wins", () => {
  const S = blank();
  S.turn = 40; S.players[0].life = 5; S.players[1].life = 9;
  E.act(S, 0, { type: "end" });
  assert.equal(S.phase, "over"); assert.equal(S.winner, 1);
});

test("the rival's hand stays hidden in the view", () => {
  const S = E.newMatch({ seed: 11, sides: [{ champions: [5] }, { champions: [6] }] });
  const v = E.view(S, 0);
  assert.ok(Array.isArray(v.you.hand));
  assert.equal(typeof v.rival.hand, "number");
  assert.ok(!JSON.stringify(v).includes('"deck":['));
});

/* ---------- whole games ---------- */
test("AI-vs-AI games always finish with a winner, within the turn limit", () => {
  for (let s = 1; s <= 200; s++) {
    const pick = k => 1 + ((s * 7919 + k * 104729) % 1111);
    const S = E.newMatch({ seed: s, sides: [{ champions: [pick(1), pick(2), pick(3)] }, { champions: [pick(4), pick(5), pick(6)] }] });
    AI.playOut(S);
    assert.equal(S.phase, "over", "game " + s);
    assert.ok(S.winner === 0 || S.winner === 1);
    assert.ok(S.turn <= 40);
  }
});
