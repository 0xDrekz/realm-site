"use strict";
const test = require("node:test"), assert = require("node:assert");
const G = require("./game");
const A = { pid: "aaaaaaaaaaaaaaaaaaaaaaaa" }, Bp = { pid: "bbbbbbbbbbbbbbbbbbbbbbbb" };
function world() {
  let t = 1e12; const clock = { now: () => t, add: ms => { t += ms; } };
  const g = G.create({ now: clock.now, tickMs: 0, botThink: [10, 20] });
  return { g, clock };
}
const sum = v => v.seats[0].stack + v.seats[1].stack + v.seats[0].bet + v.seats[1].bet + v.pot;
function pair() {
  const w = world(); w.g.queue(A); const m = w.g.queue(Bp).match; assert.ok(m);
  return { ...w, m, st: q => w.g.state({ ...q, match: m }), mv: (q, action, amount) => w.g.move({ ...q, match: m, action, amount }) };
}
const seatQ = (x, s) => [A, Bp].find(q => x.st(q).you === s);

test("best five of seven is scored like a BREAKTHROUGH cast", () => {
  const r = G.best5([1111, 569, 253, 40, 56, 9, 89], true);
  assert.equal(r.ns.length, 5); assert.ok(r.score > 0); assert.ok(r.name);
  assert.ok(G.best5([1111, 569, 253, 40, 56, 9, 89], true).score >= G.best5([1111, 569, 253, 40, 56, 9, 89], false).score);
});

test("two players waiting are paired; each sees only their own secret beings", () => {
  const x = pair(), a = x.st(A), b = x.st(Bp);
  assert.equal(a.hole.length, 2); assert.equal(b.hole.length, 2); assert.notDeepEqual(a.hole, b.hole);
  assert.equal(a.oppHole, null); assert.equal(JSON.stringify(a).includes(JSON.stringify(b.hole)), false);
  assert.equal(sum(a), 2 * G.create({ tickMs: 0 }).START);
});

test("blinds, a call and a check bring the flop; a fold hands over the pot", () => {
  const x = pair(); let v = x.st(A);
  const d = v.dealer, Dq = seatQ(x, d), Oq = seatQ(x, 1 - d);
  assert.equal(v.toAct, d);
  assert.ok(x.mv(Oq, "check").error);                       // not their turn
  x.mv(Dq, "call"); v = x.mv(Oq, "check");
  assert.equal(v.board.length, 3); assert.equal(v.toAct, 1 - d); assert.equal(v.pot, 40);
  x.mv(Oq, "raise", 60); v = x.mv(Dq, "fold");
  assert.equal(v.result.winner, 1 - d); assert.equal(v.result.pot, 100); assert.equal(v.result.hands, null);
  assert.equal(sum(v), 2000);
});

test("all in and called: the board runs out, the best score takes it, nothing is lost", () => {
  const x = pair(); let v = x.st(A); const d = v.dealer, Dq = seatQ(x, d), Oq = seatQ(x, 1 - d);
  x.mv(Dq, "raise", 99999); v = x.mv(Oq, "call");
  assert.equal(v.board.length, 5); assert.ok(v.result.hands); assert.ok(v.oppHole);
  const [h0, h1] = v.result.hands; const w = h0.score === h1.score ? null : h0.score > h1.score ? 0 : 1;
  assert.equal(v.result.winner, w); assert.equal(sum(v), 2000);
  if (w != null) { assert.equal(v.stage, "done"); assert.equal(v.winner, w); }
});

test("a turn that runs out checks if it can, else folds", () => {
  const x = pair(); let v = x.st(A); const d = v.dealer;
  x.clock.add(31e3); x.g.tick(); v = x.st(A);
  assert.equal(v.result.winner, 1 - d);                      // the dealer faced the big blind and didn't act
});

test("nobody else waiting: The Realm bot steps in, and a whole match plays to the end", () => {
  const w = world(); assert.ok(w.g.queue(A).waiting);
  let r = {}; for (let i = 0; i < 20 && !r.match; i++) { w.clock.add(1000); r = w.g.queue(A); }   // the page asks every second
  assert.ok(r.match);
  let v = w.g.state({ ...A, match: r.match }); assert.equal(v.seats.some(s => s.bot), true);
  for (let i = 0; i < 4000 && v.stage !== "done"; i++) {
    if (v.legal) { const L = v.legal; w.g.move({ ...A, match: r.match, action: L.check ? "check" : "call" }); }
    w.clock.add(400); w.g.tick();
    v = w.g.state({ ...A, match: r.match }); if (v.error) break;
    assert.equal(sum(v), 2000);
  }
  assert.equal(v.stage, "done");
  const me = w.g.board(A).you; assert.equal(me.bw + me.bl + (v.winner == null ? 1 : 0), 1);
});

test("leaving a match forfeits it; a real game moves the rating", () => {
  const x = pair(); x.g.leave(A);
  const a = x.g.board(A).you, b = x.g.board(Bp).you;
  assert.equal(a.l, 1); assert.equal(b.w, 1); assert.ok(b.rating > 1000 && a.rating < 1000);
  assert.equal(x.g.board(A).top[0].name.startsWith("Wanderer"), true);
});
