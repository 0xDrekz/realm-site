/* REALM Cards: rules, computer player and server module.  node --test rc/engine.test.js */
"use strict";
const test = require("node:test"), assert = require("node:assert");
const C = require("./cards"), E = require("./engine"), AI = require("./ai"), G = require("./game");

const deckOf = ess => C.buildDeck(ess, { pick: n => 0 });
/* a quiet table: a fresh match with hands and boards cleared, player 0 to act in their main phase */
function table({ life = [20, 20], ess = 10 } = {}) {
  const S = E.newMatch({ seed: 9, sides: [{ deck: deckOf(["magic"]) }, { deck: deckOf(["dark"]) }], first: 0 });
  for (const P of S.players) { P.hand = []; P.board = []; P.maxEss = ess; P.ess = ess; P.life = life[P.i]; }
  S.events = [];
  return S;
}
let UID = 1000;
function put(S, owner, token, { kw = [], p = 0, h = 0, sick = false } = {}) {
  const t = C.TOKENS[token];
  const u = { uid: ++UID, id: "t-" + token, owner, dmg: 0, p, h, tp: 0, th: 0, pkw: kw.slice(), tkw: [], sick, tapped: false, frozen: false, frozenUntil: 0,
    token, def: { ...t, id: "t-" + token, type: "being", cost: 0, token: true } };
  S.players[owner].board.push(u);
  return u;
}
function give(S, who, id) { const c = { uid: ++UID, id }; S.players[who].hand.push(c); return c; }
const attackBlock = (S, attackers, blocks = {}) => {
  assert.strictEqual(E.act(S, 0, { type: "attack", attackers: attackers.map(u => u.uid) }), null);
  assert.strictEqual(E.act(S, 1, { type: "block", blocks: Object.fromEntries(Object.entries(blocks).map(([b, a]) => [b, a])) }), null);
};

/* ---------- the cards ---------- */
test("every being is a card, the same every time, with a sane body", () => {
  const all = C.allBeings();
  assert.strictEqual(all.length, 1111);
  for (const c of all) {
    assert.ok(c.cost >= 1 && c.cost <= 9, c.id);
    assert.ok(c.power >= 1 && c.health >= 1, c.id);
    assert.ok(C.ESSENCES.includes(c.essence));
  }
  assert.deepStrictEqual(C.being(176), C.being(176));
  assert.strictEqual(C.cardOf("b1111").tier, "Source");
  assert.strictEqual(C.cardOf("b0"), null);
  assert.strictEqual(C.cardOf("s-nope"), null);
});

test("deck rules: 30 cards, beings once, spells twice, two essences", () => {
  for (const e of C.ESSENCES) assert.strictEqual(C.checkDeck(deckOf([e])), null);
  assert.strictEqual(C.checkDeck(deckOf(["magic", "dark"])), null);
  const d = deckOf(["magic"]);
  assert.match(C.checkDeck(d.slice(1)), /30/);
  const b = d.find(x => x[0] === "b"); assert.match(C.checkDeck([...d.slice(0, 29), b].sort(x => x === b ? -1 : 1)), /once/);
  const three = [...d.filter(x => x !== "s-spark").slice(0, 27), "s-spark", "s-spark", "s-spark"];
  assert.match(C.checkDeck(three), /twice/);
  const mixed = [...deckOf(["magic"]).slice(0, 10), ...deckOf(["dark"]).slice(0, 10), ...deckOf(["light"]).slice(0, 10)];
  assert.match(C.checkDeck(mixed), /two essences/);
  assert.match(C.checkDeck([...d.slice(0, 29), "b99999"]), /doesn't exist/);
  assert.match(C.checkDeck("nope"), /30/);
});

/* ---------- the rules ---------- */
test("a match is the same from the same seed", () => {
  const run = () => {
    const S = E.newMatch({ seed: 42, sides: [{ deck: deckOf(["light"]) }, { deck: deckOf(["spirit"]) }] });
    while (S.phase !== "over") { const who = S.phase === "block" ? 1 - S.active : S.active; E.act(S, who, AI.move(S, who)); }
    return [S.winner, S.turn, S.players.map(p => p.life)];
  };
  assert.deepStrictEqual(run(), run());
});

test("opening: five cards, two of them cheap; going second gets a card and a crystal", () => {
  for (let seed = 1; seed < 30; seed++) {
    const S = E.newMatch({ seed, sides: [{ deck: deckOf(["knowledge"]) }, { deck: deckOf(["dark"]) }] });
    const P = S.players[S.first], Q = S.players[1 - S.first];
    assert.strictEqual(P.hand.length, 5);
    assert.strictEqual(Q.hand.length, 6);
    assert.ok(P.hand.filter(c => C.cardOf(c.id).cost <= 2).length >= 2);
    assert.strictEqual(P.ess, 1);
    E.act(S, S.first, { type: "end" });
    assert.strictEqual(Q.ess, 2);       // one crystal, plus the one-off extra
    assert.strictEqual(Q.hand.length, 7);
  }
});

test("you can't act out of turn, overspend, or play what isn't in your hand", () => {
  const S = table({ ess: 1 });
  const big = give(S, 0, "s-meteor");
  assert.match(E.act(S, 0, { type: "play", uid: big.uid, target: null }), /crystals/);
  assert.match(E.act(S, 0, { type: "play", uid: 123456 }), /hand/);
  assert.match(E.act(S, 1, { type: "end" }), /turn/);
  const r = give(S, 1, "s-spark");
  assert.match(E.act(S, 1, { type: "play", uid: r.uid, target: { player: 0 } }), /turn/);
});

test("combat: unblocked damage hits the player; a blocked attacker deals none to the player", () => {
  const S = table();
  const a = put(S, 0, "husk"), b = put(S, 0, "wisp"), d = put(S, 1, "wisp");
  attackBlock(S, [a, b], { [d.uid]: b.uid });
  assert.strictEqual(S.players[1].life, 17);
  assert.ok(!S.players[0].board.includes(b) && !S.players[1].board.includes(d));   // 2/2 trades with 2/2
});

test("flying can only be blocked by flying or reach", () => {
  const S = table();
  const f = put(S, 0, "feather"), g = put(S, 1, "wisp"), r = put(S, 1, "wisp", { kw: ["reach"] });
  E.act(S, 0, { type: "attack", attackers: [f.uid] });
  assert.match(E.act(S, 1, { type: "block", blocks: { [g.uid]: f.uid } }), /isn't allowed/);
  assert.strictEqual(E.act(S, 1, { type: "block", blocks: { [r.uid]: f.uid } }), null);
});

test("first strike kills before the blocker hits back; double strike hits twice", () => {
  const S = table();
  const a = put(S, 0, "wisp", { kw: ["firstStrike"] }), d = put(S, 1, "wisp");
  attackBlock(S, [a], { [d.uid]: a.uid });
  assert.ok(S.players[0].board.includes(a)); assert.ok(!S.players[1].board.includes(d));
  E.act(S, 0, { type: "end" }); E.act(S, 1, { type: "end" });
  const ds = put(S, 0, "wisp", { kw: ["doubleStrike"] });
  attackBlock(S, [ds]);
  assert.strictEqual(S.players[1].life, 16);
});

test("a blocked attacker whose blocker died first deals nothing, unless it tramples", () => {
  const S = table();
  const a = put(S, 0, "wisp"), d = put(S, 1, "wisp");
  const fs = put(S, 1, "spore", { kw: ["firstStrike"] });
  fs.p = 5;
  attackBlock(S, [a], { [fs.uid]: a.uid });
  assert.strictEqual(S.players[1].life, 20);
  assert.ok(!S.players[0].board.includes(a));
  assert.ok(S.players[1].board.includes(d));
});

test("trample, deathtouch and lifelink", () => {
  const S = table();
  const t = put(S, 0, "husk", { kw: ["trample", "lifelink"], p: 2 }), chump = put(S, 1, "spore");
  S.players[0].life = 10;
  attackBlock(S, [t], { [chump.uid]: t.uid });
  assert.strictEqual(S.players[1].life, 16);   // 5 power, 1 to the spore, 4 through
  assert.strictEqual(S.players[0].life, 15);   // lifelink on all 5
  E.act(S, 0, { type: "end" });
  const big = put(S, 1, "husk", { p: 5 }), dt = put(S, 0, "jelly");
  assert.strictEqual(E.act(S, 1, { type: "attack", attackers: [big.uid] }), null);
  assert.strictEqual(E.act(S, 0, { type: "block", blocks: { [dt.uid]: big.uid } }), null);
  assert.ok(!S.players[1].board.includes(big), "deathtouch kills the 8/3");
});

test("damage wears off at the end of the turn", () => {
  const S = table();
  const a = put(S, 0, "wisp"), d = put(S, 1, "husk");
  attackBlock(S, [a], { [d.uid]: a.uid });
  assert.strictEqual(d.dmg, 2);
  E.act(S, 0, { type: "end" });
  assert.strictEqual(d.dmg, 0);
});

test("one attack a turn; tired beings can't block; vigilance stays ready", () => {
  const S = table();
  const a = put(S, 0, "wisp"), v = put(S, 0, "wisp", { kw: ["vigilance"] });
  attackBlock(S, [a, v]);
  assert.match(E.act(S, 0, { type: "attack", attackers: [a.uid] }), /already/);
  assert.ok(a.tapped && !v.tapped);
  E.act(S, 0, { type: "end" });
  // newly arrived beings can't attack, unless they have haste
  const s = put(S, 1, "wisp", { sick: true }), h = put(S, 1, "imp", { sick: true });
  assert.match(E.act(S, 1, { type: "attack", attackers: [s.uid] }), /can't attack/);
  assert.strictEqual(E.act(S, 1, { type: "attack", attackers: [h.uid] }), null);
});

test("Rites can be cast while blocking; nothing else can", () => {
  const S = table();
  const a = put(S, 0, "husk");
  const smite = give(S, 1, "s-smite"), doom = give(S, 1, "s-doom");
  E.act(S, 0, { type: "attack", attackers: [a.uid] });
  assert.match(E.act(S, 1, { type: "play", uid: doom.uid, target: { uid: a.uid } }), /Rites/);
  assert.strictEqual(E.act(S, 1, { type: "play", uid: smite.uid, target: { uid: a.uid } }), null);
  assert.ok(!S.players[0].board.includes(a));
  assert.strictEqual(E.act(S, 1, { type: "block", blocks: {} }), null);
  assert.strictEqual(S.players[1].life, 20);
  assert.strictEqual(S.phase, "main");
});

test("Veiled beings can't be targeted by the rival", () => {
  const S = table();
  const v = put(S, 1, "wisp", { kw: ["veiled"] }), mineV = put(S, 0, "wisp", { kw: ["veiled"] });
  const blaze = give(S, 0, "s-blaze");
  assert.match(E.act(S, 0, { type: "play", uid: blaze.uid, target: { uid: v.uid } }), /valid target|nothing to target/);
  const growth = give(S, 0, "s-shield");
  assert.strictEqual(E.act(S, 0, { type: "play", uid: growth.uid, target: { uid: mineV.uid } }), null);
});

test("burn to the face", () => {
  const S = table();
  E.act(S, 0, { type: "play", uid: give(S, 0, "s-spark").uid, target: { player: 1 } });
  assert.strictEqual(S.players[1].life, 18);
});

test("a sweeper kills what it should", () => {
  const S = table();
  put(S, 1, "wisp"); put(S, 1, "spore"); const h = put(S, 1, "husk", { h: 1 });
  E.act(S, 0, { type: "play", uid: give(S, 0, "s-storm").uid });
  assert.deepStrictEqual(S.players[1].board, [h]);
  const before = S.players[0].hand.length;
  S.players[0].ess = 10;
  E.act(S, 0, { type: "play", uid: give(S, 0, "s-insight").uid });
  assert.strictEqual(S.players[0].hand.length, before + 2);
  S.players[0].maxEss = 5;
  E.act(S, 0, { type: "play", uid: give(S, 0, "s-bloom").uid });
  assert.strictEqual(S.players[0].maxEss, 6);
  E.act(S, 0, { type: "play", uid: give(S, 0, "s-wisps").uid });
  assert.strictEqual(S.players[0].board.length, 2);
});

test("frozen beings skip their next attack and thaw after their owner's turn", () => {
  const S = table();
  const w = put(S, 1, "wisp");
  E.act(S, 0, { type: "play", uid: give(S, 0, "s-freeze").uid, target: { uid: w.uid } });
  assert.ok(w.frozen);
  E.act(S, 0, { type: "end" });
  assert.match(E.act(S, 1, { type: "attack", attackers: [w.uid] }), /can't attack/);
  E.act(S, 1, { type: "end" });
  assert.ok(!w.frozen);
});

test("drawing from an empty deck loses; the turn limit ends the game on life", () => {
  const S = table();
  S.players[1].deck = [];
  E.act(S, 0, { type: "end" });
  assert.strictEqual(S.phase, "over"); assert.strictEqual(S.winner, 0);
  const T = table(); T.turn = E.TURN_LIMIT; T.players[1].life = 5;
  E.act(T, 0, { type: "end" });
  assert.strictEqual(T.phase, "over"); assert.strictEqual(T.winner, 0);
});

test("view hides the rival's hand and both decks", () => {
  const S = E.newMatch({ seed: 3, sides: [{ deck: deckOf(["light"]) }, { deck: deckOf(["dark"]) }] });
  const v = E.view(S, 0);
  assert.strictEqual(typeof v.rival.hand, "number");
  assert.ok(Array.isArray(v.you.hand));
  assert.strictEqual(typeof v.you.deck, "number");
  const mine = new Set(S.players[0].hand.map(c => c.id)), theirs = S.players[1].hand.map(c => c.id).filter(id => !mine.has(id));
  for (const id of theirs) assert.ok(!JSON.stringify(v).includes('"' + id + '"'), id);
});

/* ---------- the computer ---------- */
test("the computer only ever makes legal moves, and finishes games", () => {
  for (let g = 0; g < 12; g++) {
    const e = C.ESSENCES[g % 5], f = C.ESSENCES[(g + 2) % 5];
    const S = E.newMatch({ seed: g + 100, sides: [{ deck: C.buildDeck([e, f], { pick: n => (g * 7) % n }) }, { deck: deckOf([f]) }] });
    let steps = 0;
    while (S.phase !== "over") {
      const who = S.phase === "block" ? 1 - S.active : S.active;
      const m = AI.move(S, who, { level: g % 3 ? 1 : 0 });
      assert.strictEqual(E.act(S, who, m), null, JSON.stringify(m));
      assert.ok(++steps < 3000);
    }
  }
});

test("the computer blocks to survive when it can", () => {
  const S = table({ life: [20, 3] });
  const a = put(S, 0, "husk"), b = put(S, 1, "wisp");
  E.act(S, 0, { type: "attack", attackers: [a.uid] });
  const m = AI.move(S, 1);
  assert.deepStrictEqual(m, { type: "block", blocks: { [b.uid]: a.uid } });
});

test("the computer takes lethal", () => {
  const S = table({ life: [20, 4] });
  put(S, 0, "husk"); put(S, 0, "wisp");
  const m = AI.move(S, 0);
  assert.strictEqual(m.type, "attack"); assert.strictEqual(m.attackers.length, 2);
});

/* ---------- the server module ---------- */
test("game: a match plays to the end through hints, and a hinted match is marked", async () => {
  const g = G.create({ testHooks: true });
  const r = await g.start({ starter: "magic+dark", ip: "1.1.1.1" });
  assert.ok(r.match && r.frames.length >= 1);
  let res = r, n = 0;
  while (!res.result && n++ < 400) { const h = g.hint({ match: r.match }); res = await g.act({ match: r.match, move: h.move }); assert.ok(!res.error, res.error); }
  assert.ok(res.result); assert.strictEqual(res.result.hinted, true);
  assert.match((await g.act({ match: r.match, move: { type: "end" } })).error, /over/);
});

test("game: bad decks, bad moves and unknown matches are refused", async () => {
  const g = G.create({ testHooks: true });
  assert.match((await g.start({ deck: ["b1", "b2"], ip: "x" })).error, /30/);
  assert.match((await g.start({ starter: "nope", ip: "x" })).error, /doesn't exist/);
  assert.match((await g.start({ ip: "x" })).error, /deck/);
  const r = await g.start({ deck: deckOf(["light"]), ip: "x" });
  assert.match((await g.act({ match: r.match, move: { type: "fly" } })).error, /allowed/);
  assert.match((await g.act({ match: r.match, move: null })).error, /allowed/);
  assert.match((await g.act({ match: r.match, move: { type: "play", uid: "1; drop" } })).error, /allowed/);
  assert.match((await g.act({ match: "nope", move: { type: "end" } })).error, /ended/);
  assert.match(g.view({ match: "nope" }).error, /ended/);
});

test("game: the page never sees the rival's cards in hand", async () => {
  const g = G.create({ testHooks: true });
  const r = await g.start({ starter: "spirit", ip: "y" });
  const S = g._match(r.match).S;
  const v = g.view({ match: r.match }).view;
  assert.strictEqual(typeof v.rival.hand, "number");
  for (const f of r.frames) for (const e of f.ev) if (e.t === "draw") assert.ok(!("id" in e));
  void S;
});

test("game: an expired sign-in is a 401, and each caller keeps a few matches at most", async () => {
  const g = G.create({ walletOf: t => t === "good" ? "W" : null, testHooks: true });
  const d = await g.start({ starter: "light", token: "dead", ip: "z" });
  assert.strictEqual(d.status, 401);
  for (let i = 0; i < 12; i++) await g.start({ starter: "light", ip: "same" });
  assert.ok(g.size() <= 8);
  const signed = await g.start({ starter: "light", token: "good", ip: "z" });
  assert.ok(signed.match);
});

test("game: a holder's own beings play stronger with $DMT", async () => {
  const deck = deckOf(["dark"]), n = Number(deck.find(x => x[0] === "b").slice(1));
  const g = G.create({ walletOf: () => "W", beings: async () => [{ n, owner: "W" }], boostOf: async () => ({ level: 2, tokens: 1, boost: 1.5 }), testHooks: true });
  const r = await g.start({ deck, token: "t", ip: "q" });
  assert.strictEqual(r.boosted, 1);
  assert.strictEqual(g._match(r.match).S.players[0].scales["b" + n], 1.5);
});

test("game: built decks and starters are legal", async () => {
  const g = G.create();
  for (const s of G.starters()) assert.strictEqual(C.checkDeck(s.deck), null, s.key);
  const b = await g.build({ essences: ["spirit", "light"] });
  assert.strictEqual(C.checkDeck(b.deck), null);
  assert.match((await g.build({ essences: ["nope"] })).error, /essences/);
});
