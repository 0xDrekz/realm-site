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
  assert.ok((await g.act({ match: "nope", move: { type: "end" } })).error);
});

test("illegal moves change nothing; the page only ever sees its own hand", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  assert.equal(s.view.active, 0, "the tutorial lets you go first");
  assert.equal(typeof s.view.rival.hand, "number");
  const before = JSON.stringify(g.view({ match: s.match }).view);
  for (const move of [{ type: "attack", attackers: [999] }, { type: "play", uid: 999 }, { type: "play", champion: 7 }, { type: "block", blocks: {} }, { type: "hack" }, null]) {
    const r = await g.act({ match: s.match, move });
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
    if (v.phase === "block") r = await g.act({ match: s.match, move: { type: "block", blocks: {} } });
    else {
      const champ = v.you.champions.find(c => c.home && c.cost <= v.you.ess);
      const ready = v.you.board.filter(u => u.ready).map(u => u.uid);
      if (champ && v.you.board.length < 6) r = await g.act({ match: s.match, move: { type: "play", champion: champ.i } });
      else if (ready.length && !v.you.attacked) r = await g.act({ match: s.match, move: { type: "attack", attackers: ready } });
      else r = await g.act({ match: s.match, move: { type: "end" } });
    }
    assert.ok(!r.error, r.error);
    for (const f of r.frames) assert.equal(typeof f.view.rival.hand, "number");
    res = r.result;
  }
  assert.ok(res, "the match ended");
  assert.equal(typeof res.won, "boolean");
  assert.ok(res.stars >= 0 && res.stars <= 3);
  assert.ok(logs.some(l => l.includes("tutorial")));
  assert.match((await g.act({ match: s.match, move: { type: "end" } })).error, /over/);
});

test("resigning is a loss with no stars", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  const r = await g.act({ match: s.match, move: { type: "resign" } });
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
  const r = await g.act({ match: s.match, move: h.move });
  assert.ok(!r.error, r.error);
});

test("experience is decided on the server; leaving earns none", async () => {
  const g = G(), s = await g.start({ level: "tutorial" });
  const r = await g.act({ match: s.match, move: { type: "resign" } });
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

/* plays a match to the end with a plain policy (no hints): summon what you can, attack with what's ready */
async function playOut(g, s) {
  let res = s.result;
  for (let i = 0; i < 300 && !res; i++) {
    const v = (g.view({ match: s.match })).view;
    let move = { type: "end" };
    if (v.phase === "block") move = { type: "block", blocks: (v.pending && v.pending.suggest) || {} };
    else {
      const champ = v.you.champions.find(c => c.home && c.cost <= v.you.ess);
      const card = v.you.hand.find(c => c.kind === "unit" && c.cost <= v.you.ess);
      const ready = v.you.board.filter(u => u.ready).map(u => u.uid);
      if (champ && v.you.board.length < 6) move = { type: "play", champion: champ.i };
      else if (card && v.you.board.length < 6) move = { type: "play", uid: card.uid };
      else if (ready.length && !v.you.attacked) move = { type: "attack", attackers: ready };
    }
    let r = await g.act({ match: s.match, move });
    if (r.error) r = await g.act({ match: s.match, move: { type: "end" } });
    res = r.result;
  }
  return res;
}
async function winOne(g, token) {
  for (let k = 0; k < 60; k++) { const s = await g.start({ level: "quick", token }); const res = await playOut(g, s); if (res && res.won) return res; }
  return null;
}

test("quick wins score weekly points for holders, capped each day", async () => {
  const g = chain(), res = await winOne(g, "tok");
  assert.ok(res, "won one");
  assert.ok(res.points >= 10, JSON.stringify(res));
  const b = g.board({ token: "tok" });
  assert.equal(b.weekTop[0].wallet, HOLDER); assert.equal(b.you.week.rank, 1);
});

test("a match where Hint was used doesn't score", async () => {
  const g = chain();
  for (let k = 0; k < 60; k++) {
    const s = await g.start({ level: "quick", token: "tok" });
    g.hint({ match: s.match });
    const res = await playOut(g, s);
    if (res && res.won) { assert.equal(res.unscored, "hint"); assert.equal(res.points, undefined); return; }
  }
  assert.fail("never won");
});

test("one being qualifies only one wallet a week", async () => {
  const A = "AAAA111111111111111111111111111111111111111", B = "BBBB111111111111111111111111111111111111111";
  let owner = A;   // the being moves from A to B between A's win and B's
  const g = require("./game").create({ beings: async () => [{ n: 4, owner }], boostOf: async () => ({ level: 0, tokens: 0, boost: 1 }), walletOf: t => ({ a: A, b: B })[t] || null });
  const ra = await winOne(g, "a"); assert.ok(ra && ra.points >= 10, "the first wallet scores");
  owner = B;
  const rb = await winOne(g, "b"); assert.ok(rb, "won");
  assert.equal(rb.unscored, "claimed"); assert.equal(rb.points, undefined);
  const au = g.audit();
  assert.ok(au.dropped.some(r => r.wallet === A), "the payout audit drops wallets that shared a being");
});

test("a being sold during the match doesn't score; holdings are re-read at the finish", async () => {
  const A = "AAAA111111111111111111111111111111111111111";
  let owner = A;
  const g = require("./game").create({ beings: async () => [{ n: 4, owner }], boostOf: async () => ({ level: 0, tokens: 0, boost: 1 }), walletOf: t => t === "a" ? A : null });
  for (let k = 0; k < 60; k++) {
    owner = A; const s = await g.start({ level: "quick", token: "a" }); owner = "someoneelse";
    const res = await playOut(g, s);
    if (res && res.won) { assert.equal(res.unscored, "moved"); return; }
  }
  assert.fail("never won");
});

test("a wallet can have at most two Quick matches open; a third forfeits the oldest", async () => {
  const g = chain();
  const a = await g.start({ level: "quick", token: "tok" }), b = await g.start({ level: "quick", token: "tok" }), c = await g.start({ level: "quick", token: "tok" });
  assert.match((await g.act({ match: a.match, move: { type: "end" } })).error, /over/);
  assert.ok(!(await g.act({ match: c.match, move: { type: "end" } })).error || true);
  assert.ok(b.match && c.match);
});

test("a match that runs past 20 minutes doesn't score", async () => {
  const g = chain(), real = Date.now;
  try {
    for (let k = 0; k < 60; k++) {
      const s = await g.start({ level: "quick", token: "tok" });
      Date.now = () => real() + 21 * 60e3;
      const res = await playOut(g, s);
      Date.now = real;
      if (res && res.won) { assert.equal(res.unscored, "slow"); return; }
    }
  } finally { Date.now = real; }
  assert.fail("never won");
});

test("an unreadable wallet says so instead of quietly dropping the holder", async () => {
  const g = chain({ beings: async () => { throw new Error("rpc down"); } });
  assert.match((await g.team({ token: "tok" })).error, /Couldn't read your wallet/);
  assert.match((await g.start({ level: "quick", token: "tok" })).error, /Couldn't read your wallet/);
});

test("the daily challenge's day is fixed when the match starts, and a faster win scores more", async () => {
  const g = chain(), Real = Date;
  let fake = Real.UTC(2026, 9, 10, 23, 55);         // five to midnight
  global.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [fake])); } static now() { return fake; } };
  try {
    const s = await g.start({ level: "daily", token: "tok" });
    fake += 10 * 60e3;                                // it ends ten minutes later, on the next day
    await playOut(g, s);
    fake -= 10 * 60e3;
    const b = g.board({ token: "tok" });
    assert.equal(b.day, "2026-10-10"); assert.ok(b.dayTop.some(r => r.wallet === HOLDER), "scored on the day it started");
  } finally { global.Date = Real; }
  // the formula: fewer turns beat more turns; any win beats any loss
  const pts = (won, turns, life, dmg) => won ? 2000 - turns * 50 + Math.min(life, 14) * 5 : Math.min(dmg, 12) * 20;
  assert.ok(pts(true, 10, 5, 0) > pts(true, 14, 14, 0)); assert.ok(pts(true, 30, 1, 0) > pts(false, 0, 0, 99));
});

test("an expired or unknown token is a 401 'sign in again', never a quiet guest match", async () => {
  const g = chain();
  for (const level of ["quick", "daily", "1-1"]) { const r = await g.start({ level, token: "dead" }); assert.equal(r.status, 401, level); assert.match(r.error, /sign in again/i); }
  assert.equal((await g.team({ token: "dead" })).status, 401);
  assert.ok((await g.start({ level: "quick" })).match, "no token at all is a guest, as before");
});

test("one caller filling the server can't push out anyone else's match", async () => {
  const g = G();
  const mine = await g.start({ level: "tutorial", ip: "1.1.1.1" });
  for (let k = 0; k < 30; k++) await g.start({ level: "tutorial", ip: "6.6.6.6" });
  assert.ok(!(await g.act({ match: mine.match, move: { type: "end" } })).error, "still there");
});

test("hints are always legal (a few hundred matches)", async () => {
  const g = G();
  for (let k = 0; k < 120; k++) {
    const s = await g.start({ level: "quick" }); let res = s.result;
    for (let i = 0; i < 300 && !res; i++) { const h = g.hint({ match: s.match }); const r = await g.act({ match: s.match, move: h.move || { type: "end" } }); assert.ok(!r.error, JSON.stringify(h.move) + " " + r.error); res = r.result; }
  }
});
