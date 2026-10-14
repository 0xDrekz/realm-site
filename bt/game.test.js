"use strict";
const test = require("node:test"), assert = require("node:assert");
const E = require("./engine"), C = require("./cards"), G = require("./game");
const W = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const make = () => G.create({ beings: async () => [{ n: 5, owner: W }, { n: 9, owner: W }, { n: 176, owner: "Other111111111111111111111111111111111111111" }], walletOf: t => t === "tok" ? W : null });
const PID = "0123456789abcdef01234567";
// plays a run like a careless player: cast the first five, take the first offer
function playThrough(d) {
  const S = E.createRun({ seed: d.seed, deck: d.deck, own: d.own, cards: C.cardOf }), moves = [];
  for (let k = 0; k < 40 && !S.over; k++) { const m = S.phase === "draft" ? ["p", 0] : ["c", [0, 1, 2, 3, 4].slice(0, Math.min(5, S.hand.length))]; E.act(S, m); moves.push(m); }
  return { S, moves };
}
async function later(fn) { const real = Date.now; Date.now = () => real() + 3600e3; try { return await fn(); } finally { Date.now = real; } }

test("the daily trip is the same deck and seed for everybody", async () => {
  const g = make();
  const a = await g.start({ mode: "daily", pid: PID }), b = await g.start({ mode: "daily", token: "tok" });
  assert.deepEqual(a.deck, b.deck); assert.equal(a.seed, b.seed); assert.equal(a.deck.length, 20);
  assert.deepEqual(g.dailyDef("2026-10-12"), g.dailyDef("2026-10-12"));
  assert.notDeepEqual(g.dailyDef("2026-10-12").deck, g.dailyDef("2026-10-13").deck);
});

test("the server replays the moves and decides the score", async () => {
  const g = make(), d = await g.start({ mode: "daily", pid: PID });
  const { S, moves } = playThrough(d);
  const r = await later(() => g.finish({ run: d.run, moves }));
  assert.ok(r.result, r.error); assert.equal(r.result.total, S.total); assert.equal(r.result.cleared, E.cleared(S));
  assert.ok(r.result.board && r.result.board.rank === 1);
  const again = g.finish({ run: d.run, moves }); assert.ok(again.error);
  const b = g.board({ pid: PID }); assert.equal(b.daily.top[0].total, S.total); assert.ok(b.daily.top[0].you);
});

test("made-up moves are refused, and so is a run handed in too fast", async () => {
  const g = make();
  const d = await g.start({ mode: "daily", pid: PID });
  assert.ok((await later(() => g.finish({ run: d.run, moves: [["c", [0, 0]]] }))).error);
  const d2 = await g.start({ mode: "daily", pid: PID });
  assert.ok(g.finish({ run: d2.run, moves: [["x", 1]] }).error);
  const d3 = await g.start({ mode: "daily", pid: PID });
  const { moves } = playThrough(d3);
  assert.match(g.finish({ run: d3.run, moves }).error || "", /faster/);
  assert.ok(g.finish({ run: "nope", moves: [] }).gone);
});

test("a free run deals your own beings and a summoned one; the summon is counted", async () => {
  const g = make();
  const d = await g.start({ mode: "free", token: "tok", summon: 176 });
  assert.ok(d.deck.includes(5) && d.deck.includes(9) && d.deck.includes(176));
  assert.deepEqual(d.own.sort((a, b) => a - b), [5, 9]); assert.equal(d.summoned, 176);
  const nobody = await g.start({ mode: "free", pid: PID, summon: 300 });   // unowned beings can't be summoned
  assert.equal(nobody.summoned, null);
  assert.equal(g.board({}).summons[0].n, 176);
  const s = await g.summonable(); assert.equal(s.beings[0].n, 176); assert.equal(s.beings[0].count, 1);
  const m = await g.me({ token: "tok" }); assert.deepEqual(m.own, [5, 9]);
  assert.ok((await g.start({ mode: "free", token: "expired" })).status === 401);
});

test("the competition counts a signed-in wallet's best Daily Trip, and not guests", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const g = G.create({ beings: async () => [], walletOf: t => t === "tok" ? W : null, comp: { id: "t", title: "Test", prize: "1 SOL", start: day, end: day } });
  const a = await g.start({ mode: "daily", token: "tok" });
  const ra = await later(() => g.finish({ run: a.run, moves: playThrough(a).moves }));
  assert.ok(ra.result.comp.entered); assert.equal(ra.result.comp.rank, 1);
  const b = await g.start({ mode: "daily", pid: PID });
  const rb = await later(() => g.finish({ run: b.run, moves: playThrough(b).moves }));
  assert.equal(rb.result.comp.entered, false);
  const v = g.board({ token: "tok" }).comp;
  assert.equal(v.players, 1); assert.ok(v.top[0].you); assert.equal(v.top[0].wallet, undefined);   // full address only once it's over
  const free = await g.start({ mode: "free", token: "tok" });
  const rf = await later(() => g.finish({ run: free.run, moves: playThrough(free).moves }));
  assert.equal(rf.result.comp, undefined);   // Free Runs don't count
  const none = G.create({ comp: null }); assert.equal(none.board({}).comp, null);
});

test("the league table lists the whole competition and today's runs", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const g = G.create({ beings: async () => [], walletOf: t => t === "tok" ? W : null, comp: { id: "L", title: "League", prize: "1 SOL", start: day, end: day } });
  const a = await g.start({ mode: "daily", token: "tok" });
  await later(() => g.finish({ run: a.run, moves: playThrough(a).moves }));
  const L = g.league({ token: "tok" });
  assert.equal(L.comp.top.length, 1); assert.ok(L.comp.top[0].you); assert.equal(L.today.length, 1); assert.equal(L.todayPlayers, 1);
});

test("team wallets play but can't win: unranked, and the next wallet is #1", async () => {
  const day = new Date().toISOString().slice(0, 10), W2 = "Fan2222222222222222222222222222222222222222";
  const g = G.create({ beings: async () => [], walletOf: t => t === "tok" ? W : t === "fan" ? W2 : null, comp: { id: "T", title: "T", prize: "1 SOL", start: day, end: day, team: [W] } });
  const a = await g.start({ mode: "daily", token: "tok" }), ra = await later(() => g.finish({ run: a.run, moves: playThrough(a).moves }));
  assert.ok(ra.result.comp.team);
  const b = await g.start({ mode: "daily", token: "fan" });
  const rb = await later(() => g.finish({ run: b.run, moves: [["c", [0]]] }));   // a weaker run: one card, once
  assert.equal(rb.result.comp.rank, 1);
  const v = g.league({ token: "fan" }).comp;
  assert.equal(v.players, 1); assert.equal(v.top[0].team, true); assert.equal(v.top[0].rank, null); assert.equal(v.top[1].rank, 1); assert.ok(v.top[1].you);
});

test("a new competition leader is posted to Telegram, at most once every 10 minutes", async () => {
  const day = new Date().toISOString().slice(0, 10), posts = [], W2 = "Fan2222222222222222222222222222222222222222";
  const g = G.create({ beings: async () => [], walletOf: t => t === "a" ? W : t === "b" ? W2 : null, announce: html => { posts.push(html); return { ok: true } },
    comp: { id: "TG", title: "T", prize: "1 SOL", start: day, end: day } });
  const a = await g.start({ mode: "daily", token: "a" });
  await later(() => g.finish({ run: a.run, moves: playThrough(a).moves }));
  await new Promise(r => setTimeout(r, 30));
  assert.equal(posts.length, 1); assert.match(posts[0], /NEW TOP SCORE/); assert.match(posts[0], /1 SOL/);
  // a weaker score from someone else: no leader post
  const b = await g.start({ mode: "daily", token: "b" });
  await later(() => g.finish({ run: b.run, moves: [["c", [0]]] }));
  await new Promise(r => setTimeout(r, 30));
  assert.equal(posts.length, 1);
  // ...but every run goes out as a line, gathered into one message
  g._news.sendScores();
  assert.equal(posts.length, 2); assert.match(posts[1], /Latest BREAKTHROUGH runs/); assert.match(posts[1], /#1<\/b> in the 1 SOL comp/); assert.match(posts[1], /#2<\/b> in the 1 SOL comp/);
  posts.splice(1);
  // the result goes out once, when it's over
  const over = G.create({ beings: async () => [], announce: html => { posts.push(html); return { ok: true } }, comp: { id: "TG", title: "T", prize: "1 SOL", start: "2000-01-01", end: "2000-01-02" } });
  over._news.finalNews(); over._news.finalNews();
  assert.equal(posts.length, 1);   // nobody entered that one: nothing to announce, and only checked once
});

test("a Telegram player is recognised only with initData Telegram signed", async () => {
  const crypto = require("crypto"), BOT = "123456:TEST-token";
  const sign = (fields, token) => {
    const check = Object.entries(fields).map(([k, v]) => k + "=" + v).sort().join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
    return new URLSearchParams({ ...fields, hash: crypto.createHmac("sha256", secret).update(check).digest("hex") }).toString();
  };
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAF", user: JSON.stringify({ id: 777, first_name: "Bone", username: "bonedogg" }) };
  const good = sign(fields, BOT), forged = sign(fields, "999:other");
  assert.deepEqual(G.tgUser(good, BOT), { id: 777, name: "@bonedogg" });
  assert.equal(G.tgUser(forged, BOT), null);
  assert.equal(G.tgUser(good.replace("bonedogg", "someoneelse"), BOT), null);
  assert.equal(G.tgUser(sign({ ...fields, auth_date: "1000" }, BOT), BOT), null);   // too old
  const g = G.create({ beings: async () => [], tgToken: () => BOT, comp: null });
  const d = await g.start({ mode: "daily", tg: good });
  assert.equal(d.name, "@bonedogg");
  await later(() => g.finish({ run: d.run, moves: playThrough(d).moves }));
  assert.equal(g.board({ tg: good }).daily.top[0].name, "@bonedogg"); assert.ok(g.board({ tg: good }).daily.top[0].you);
  assert.match(g.topText(), /@bonedogg/);
});

test("every daily deck is dealt purely at random, the same for everyone that day", () => {
  const g = G.create({ comp: null });
  assert.ok(g.dailyDef("2026-10-13").deck.includes(1111));        // the lucky day, unchanged
  assert.deepEqual(g.dailyDef("2026-10-20").deck, G.create({ comp: null }).dailyDef("2026-10-20").deck);
  let rare = 0;
  for (let d = 1; d <= 60; d++) {
    const day = new Date(Date.UTC(2026, 9, 13 + d)).toISOString().slice(0, 10), deck = g.dailyDef(day).deck;
    assert.equal(deck.length, 20); assert.equal(new Set(deck).size, 20);
    if (deck.some(n => ["God", "Entity", "Source"].includes(C.cardOf(n).tier))) rare++;
  }
  assert.ok(rare > 0);                                              // Gods and Entities fall where they fall
});

test("a holder's boost is read at the start, kept with the run, and counted by the server", async () => {
  const g = G.create({ comp: null, beings: async () => [], boostOf: async w => w === W ? 130 : 100, walletOf: t => t === "tok" ? W : null });
  const d = await g.start({ mode: "daily", token: "tok" }), guest = await g.start({ mode: "daily", pid: PID });
  assert.equal(d.boost, 130); assert.equal(guest.boost, 100);
  const play = def => { const S = E.createRun({ ...def, cards: C.cardOf }), moves = []; for (let k = 0; k < 40 && !S.over; k++) { const m = S.phase === "draft" ? ["p", 0] : ["c", [0, 1, 2, 3, 4].slice(0, Math.min(5, S.hand.length))]; E.act(S, m); moves.push(m); } return { S, moves }; };
  const a = play(d), b = play(guest);
  assert.ok(a.S.total > b.S.total);
  const res = await later(() => g.finish({ run: d.run, moves: a.moves }));
  assert.equal(res.result.total, a.S.total);
  assert.equal((await g.me({ token: "tok" })).boost, 130);
});

test("mirror duel: the same deck and seed for both, three layers, the higher total wins", async () => {
  const g = G.create({ comp: null, beings: async () => [], boostOf: async () => 150, walletOf: t => t === "tok" ? W : null });
  const P2 = "fedcba9876543210fedcba98";
  const a = await g.start({ mode: "duel", pid: PID });
  assert.ok(a.duel && a.duel.id); assert.equal(a.boost, 100); assert.equal(a.duel.players.length, 0);
  // play past the third layer: anything after it isn't counted
  const play = def => { const S = E.createRun({ ...def, cards: C.cardOf }), moves = []; for (let k = 0; k < 60 && !S.over; k++) { const m = S.phase === "draft" ? ["p", 0] : ["c", [0, 1, 2, 3, 4].slice(0, Math.min(5, S.hand.length))]; E.act(S, m); moves.push(m); } return moves; };
  const ra = await later(() => g.finish({ run: a.run, moves: play(a) }));
  assert.ok(ra.result.cleared <= 3); assert.equal(ra.result.duel.players.length, 1);
  const again = await g.start({ mode: "duel", duel: a.duel.id, pid: PID });
  assert.match(again.error, /already played/);
  const b = await g.start({ mode: "duel", duel: a.duel.id, token: "tok" });
  assert.deepEqual(b.deck, a.deck); assert.equal(b.seed, a.seed); assert.equal(b.boost, 100);
  const rb = await later(() => g.finish({ run: b.run, moves: [["c", [0]]] }));
  const v = rb.result.duel; assert.ok(v.done); assert.equal(v.players.length, 2);
  assert.equal(v.winner, v.players[0].total > v.players[1].total ? 0 : 1);
  const third = await g.start({ mode: "duel", duel: a.duel.id, pid: P2 }); assert.match(third.error, /both sides/);
  assert.equal(g.duel({ id: a.duel.id, pid: PID }).duel.players[0].you, true);
  // a duel never touches the boards or the competition
  assert.equal(g.board({ pid: PID }).daily.top.length, 0);
});

test("from 14 Oct every daily deck holds at least one God and two Entities; 13 Oct is unchanged", () => {
  const g = G.create({ comp: null });
  assert.ok(g.dailyDef("2026-10-13").deck.includes(1111));
  for (let d = 0; d < 40; d++) {
    const day = new Date(Date.UTC(2026, 9, 14 + d)).toISOString().slice(0, 10), deck = g.dailyDef(day).deck, t = deck.map(n => C.cardOf(n).tier);
    assert.equal(deck.length, 20); assert.equal(new Set(deck).size, 20);
    assert.ok(t.filter(x => x === "God").length >= 1); assert.ok(t.filter(x => x === "Entity").length >= 2);
    assert.deepEqual(deck, G.create({ comp: null }).dailyDef(day).deck);
  }
});
