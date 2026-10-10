/* REALM card battler — the server's match tests.  npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = () => require("./game").create();

test("the map lists the tutorial and realm 1 with its boss", async () => {
  const m = G().map();
  assert.equal(m.tutorial.id, "tutorial");
  assert.equal(m.realms[0].levels.length, 5);
  assert.ok(m.realms[0].levels.at(-1).boss);
});

test("a deal is five borrowed spirits; you must keep exactly three of them", async () => {
  const g = G(), d = g.deal({ level: "1-1" });
  assert.equal(d.cards.length, 5);
  assert.equal(new Set(d.cards.map(c => c.n)).size, 5);
  assert.match((await g.start({ level: "1-1", deal: d.deal, pick: [0, 1] })).error, /three/);
  assert.match((await g.start({ level: "1-1", deal: d.deal, pick: [0, 0, 1] })).error, /three/);
  assert.match((await g.start({ level: "1-1", deal: d.deal, pick: [0, 1, 9] })).error, /three/);
  assert.match((await g.start({ level: "1-2", deal: d.deal, pick: [0, 1, 2] })).error, /expired/, "a deal is for its own level");
  const s = await g.start({ level: "1-1", deal: d.deal, pick: [0, 1, 2] });
  assert.ok(s.match);
  assert.deepEqual(s.defs.you.map(c => c.n), d.cards.slice(0, 3).map(c => c.n));
  assert.match((await g.start({ level: "1-1", deal: d.deal, pick: [0, 1, 2] })).error, /expired/, "a deal is used once");
});

test("unknown levels and made-up deals are refused", async () => {
  const g = G();
  assert.ok(g.deal({ level: "9-9" }).error);
  assert.ok((await g.start({ level: "1-1", deal: "nope", pick: [0, 1, 2] })).error);
  assert.ok(g.act({ match: "nope", move: { type: "end" } }).error);
});

test("illegal moves change nothing; the page only ever sees its own hand", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  assert.equal(s.view.active, 0, "the tutorial lets you go first");
  assert.equal(typeof s.view.rival.hand, "number");
  const before = JSON.stringify(g.view({ match: s.match }).view);
  for (const move of [{ type: "attack", attackers: [999] }, { type: "play", uid: 999 }, { type: "play", champion: 7 }, { type: "block", blocks: {} }, { type: "hack" }, null]) {
    const r = g.act({ match: s.match, move });
    assert.ok(r.error, JSON.stringify(move));
  }
  assert.equal(JSON.stringify(g.view({ match: s.match }).view), before);
});

test("a whole match runs on the server, frame by frame, to a logged result", async () => {
  const logs = [], g = require("./game").create({ log: m => logs.push(m) });
  const s = await g.start({ level: "tutorial" });
  let res = null;
  for (let k = 0; k < 120 && !res; k++) {
    const v = g.view({ match: s.match }).view;
    let r;
    if (v.phase === "block") r = g.act({ match: s.match, move: { type: "block", blocks: {} } });
    else {
      const champ = v.you.champions.find(c => c.home && c.cost <= v.you.ess);
      const ready = v.you.board.filter(u => u.ready).map(u => u.uid);
      if (champ && v.you.board.length < 6) r = g.act({ match: s.match, move: { type: "play", champion: champ.i } });
      else if (ready.length && !v.you.attacked) r = g.act({ match: s.match, move: { type: "attack", attackers: ready } });
      else r = g.act({ match: s.match, move: { type: "end" } });
    }
    assert.ok(!r.error, r.error);
    for (const f of r.frames) assert.equal(typeof f.view.rival.hand, "number");
    res = r.result;
  }
  assert.ok(res, "the match ended");
  assert.equal(typeof res.won, "boolean");
  assert.ok(res.stars >= 0 && res.stars <= 3);
  assert.ok(logs.some(l => l.includes("tutorial")));
  assert.match(g.act({ match: s.match, move: { type: "end" } }).error, /over/);
});

test("resigning is a loss with no stars", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  const r = g.act({ match: s.match, move: { type: "resign" } });
  assert.equal(r.result.won, false); assert.equal(r.result.stars, 0);
});

test("Quick Play deals both sides at random, with 14 life", async () => {
  const g = G(), s = await g.start({ level: "quick" });
  assert.ok(s.match); assert.equal(s.defs.you.length, 3); assert.equal(s.view.you.life, 14);
  assert.ok(!s.defs.you.some(c => s.defs.rival.some(r => r.n === c.n)), "no being on both sides");
});

test("a hint is a move the server would accept", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  const h = g.hint({ match: s.match });
  assert.ok(h.move);
  const r = g.act({ match: s.match, move: h.move });
  assert.ok(!r.error, r.error);
});

test("experience is decided on the server; leaving earns none", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  const r = g.act({ match: s.match, move: { type: "resign" } });
  assert.equal(r.result.xp, 0);
  assert.deepEqual(Object.keys(r.result.stats).sort(), ["champions", "damage", "kills", "rituals", "summons"]);
});

/* a pretend chain: one holder with a God and a Common, and a $DMT boost */
const HOLDER = "Hold1111111111111111111111111111111111111111";
const chain = (extra = {}) => require("./game").create({
  beings: async () => [{ n: 842, owner: HOLDER }, { n: 4, owner: HOLDER }, { n: 1111, owner: "someoneelse" }],
  boostOf: async w => w === HOLDER ? { level: 2, tokens: 300000, boost: 1.06 } : { level: 0, tokens: 0, boost: 1 },
  walletOf: t => t === "tok" ? HOLDER : null, ...extra });

test("a signed-in holder plays their own beings, boosted, and never someone else's", async () => {
  const g = chain(), t = await g.team({ token: "tok" });
  assert.deepEqual(t.cards.map(c => c.n), [842, 4], "rarest first");
  const s = await g.start({ level: "quick", token: "tok", team: [842, 1111] });
  assert.equal(s.defs.you[0].n, 842);
  assert.ok(!s.defs.you.some(c => c.n === 1111), "a being you don't hold is refused");
  assert.equal(s.defs.you.length, 3, "topped up with borrowed spirits");
  assert.equal(s.boost.level, 2);
  const god = require("./cards").cardOf(842);
  assert.ok(s.defs.you[0].health >= god.health, "the boost never weakens your own being");
  assert.ok(["God", "Entity"].includes(s.defs.rival[0].tier) || s.defs.rival[0].tier === "God", "a God meets a God");
});

test("the daily challenge is the same game for everyone today", async () => {
  const g = G(), a = await g.start({ level: "daily" }), b = await g.start({ level: "daily" });
  assert.deepEqual(a.defs.you.map(c => c.n), b.defs.you.map(c => c.n));
  assert.deepEqual(a.defs.rival.map(c => c.n), b.defs.rival.map(c => c.n));
  assert.deepEqual(a.view.you.hand.map(c => c.id), b.view.you.hand.map(c => c.id), "the same shuffle");
});

test("quick wins score weekly points for holders, capped each day", async () => {
  const g = chain();
  let scored = 0;
  for (let k = 0; k < 40 && scored < 2; k++) {
    const s = await g.start({ level: "quick", token: "tok" });
    // play the AI's own suggestions until the match ends
    let res = s.result;
    for (let i = 0; i < 300 && !res; i++) { const h = g.hint({ match: s.match }); const r = g.act({ match: s.match, move: h.move || { type: "end" } }); res = r.result; }
    if (res && res.won) { assert.ok(res.points >= 10); scored++; }
  }
  assert.ok(scored >= 1);
  const b = g.board({ token: "tok" });
  assert.equal(b.weekTop[0].wallet, HOLDER);
  assert.ok(b.you.week.rank === 1);
});
