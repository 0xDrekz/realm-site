/* REALM card battler — the server's match tests.  npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = () => require("./game").create();

test("the map lists the tutorial and realm 1 with its boss", () => {
  const m = G().map();
  assert.equal(m.tutorial.id, "tutorial");
  assert.equal(m.realms[0].levels.length, 5);
  assert.ok(m.realms[0].levels.at(-1).boss);
});

test("a deal is five borrowed spirits; you must keep exactly three of them", () => {
  const g = G(), d = g.deal({ level: "1-1" });
  assert.equal(d.cards.length, 5);
  assert.equal(new Set(d.cards.map(c => c.n)).size, 5);
  assert.match(g.start({ level: "1-1", deal: d.deal, pick: [0, 1] }).error, /three/);
  assert.match(g.start({ level: "1-1", deal: d.deal, pick: [0, 0, 1] }).error, /three/);
  assert.match(g.start({ level: "1-1", deal: d.deal, pick: [0, 1, 9] }).error, /three/);
  assert.match(g.start({ level: "1-2", deal: d.deal, pick: [0, 1, 2] }).error, /expired/, "a deal is for its own level");
  const s = g.start({ level: "1-1", deal: d.deal, pick: [0, 1, 2] });
  assert.ok(s.match);
  assert.deepEqual(s.defs.you.map(c => c.n), d.cards.slice(0, 3).map(c => c.n));
  assert.match(g.start({ level: "1-1", deal: d.deal, pick: [0, 1, 2] }).error, /expired/, "a deal is used once");
});

test("unknown levels and made-up deals are refused", () => {
  const g = G();
  assert.ok(g.deal({ level: "9-9" }).error);
  assert.ok(g.start({ level: "1-1", deal: "nope", pick: [0, 1, 2] }).error);
  assert.ok(g.act({ match: "nope", move: { type: "end" } }).error);
});

test("illegal moves change nothing; the page only ever sees its own hand", () => {
  const g = G(), s = g.start({ level: "tutorial" });
  assert.equal(s.view.active, 0, "the tutorial lets you go first");
  assert.equal(typeof s.view.rival.hand, "number");
  const before = JSON.stringify(g.view({ match: s.match }).view);
  for (const move of [{ type: "attack", attackers: [999] }, { type: "play", uid: 999 }, { type: "play", champion: 7 }, { type: "block", blocks: {} }, { type: "hack" }, null]) {
    const r = g.act({ match: s.match, move });
    assert.ok(r.error, JSON.stringify(move));
  }
  assert.equal(JSON.stringify(g.view({ match: s.match }).view), before);
});

test("a whole match runs on the server, frame by frame, to a logged result", () => {
  const logs = [], g = require("./game").create({ log: m => logs.push(m) });
  const s = g.start({ level: "tutorial" });
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

test("resigning is a loss with no stars", () => {
  const g = G(), s = g.start({ level: "tutorial" });
  const r = g.act({ match: s.match, move: { type: "resign" } });
  assert.equal(r.result.won, false); assert.equal(r.result.stars, 0);
});

test("Quick Play deals both sides at random, with 14 life", () => {
  const g = G(), s = g.start({ level: "quick" });
  assert.ok(s.match); assert.equal(s.defs.you.length, 3); assert.equal(s.view.you.life, 14);
  assert.ok(!s.defs.you.some(c => s.defs.rival.some(r => r.n === c.n)), "no being on both sides");
});

test("a hint is a move the server would accept", () => {
  const g = G(), s = g.start({ level: "tutorial" });
  const h = g.hint({ match: s.match });
  assert.ok(h.move);
  const r = g.act({ match: s.match, move: h.move });
  assert.ok(!r.error, r.error);
});

test("experience is decided on the server; leaving earns none", () => {
  const g = G(), s = g.start({ level: "tutorial" });
  const r = g.act({ match: s.match, move: { type: "resign" } });
  assert.equal(r.result.xp, 0);
  assert.deepEqual(Object.keys(r.result.stats).sort(), ["champions", "damage", "kills", "rituals", "summons"]);
});
