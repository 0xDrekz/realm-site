/* ============================================================
   SHOWDOWN — heads-up hold'em with beings, decided on the server.

   Each hand: two secret beings each, five shared beings turned over in
   three stages (3, 1, 1). Your hand is the best five of your seven,
   scored exactly as BREAKTHROUGH scores a cast (bt/engine.js evaluate:
   Auras make the hand, the traits fire, chips × mult). Between stages you
   bet Essence: fold, check, call or raise.

   Essence is play money for one match only. Both players start every
   match on the same stack; it can't be bought, kept, sent or cashed, and
   it's gone when the match ends. What's kept is a ranking (wins, losses
   and a rating). Free to play, always: no entry fee, nothing at stake.

   The server holds the deck and everyone's secret beings; a player only
   ever sees their own until the showdown. No real player waiting? After
   BOT_WAIT you play The Realm, a bot, and it says so.
   ============================================================ */
"use strict";
const crypto = require("crypto"), path = require("path");
const E = require("../bt/engine"), C = require("../bt/cards");
const { tgUser } = require("../bt/game");

const START = 1000, HANDS = 12, ACT_MS = 30e3, PAUSE_MS = 5000, BOT_WAIT = 15e3, QUEUE_STALE = 8e3, MATCH_TTL = 30 * 60e3;
const BLINDS = h => h <= 6 ? [10, 20] : [25, 50];
const BOT = { key: "bot:realm", name: "The Realm (bot)", bot: true };

/* the best five of seven beings, scored as a BREAKTHROUGH cast.
   exact: every order of every five (the page plays cards in their best order, and so does this);
   quick: one sensible order (adds before multiplies), for the bot's thinking only. */
const combos5 = n => { const out = []; const rec = (s, c) => { if (c.length === 5) { out.push(c.slice()); return; } for (let i = s; i < n; i++) { c.push(i); rec(i + 1, c); c.pop(); } }; rec(0, []); return out; };
const C57 = combos5(7);
function permsBest(cards) {
  let best = null; const a = cards.slice();
  const rec = k => {
    if (k === a.length) { const ev = E.evaluate(a, 0); if (!best || ev.score > best.score) best = { ...ev, cards: a.slice() }; return; }
    for (let j = k; j < a.length; j++) { [a[k], a[j]] = [a[j], a[k]]; rec(k + 1); [a[k], a[j]] = [a[j], a[k]]; }
  };
  rec(0); return best;
}
const xWeight = c => { const x = c.x || {}; return (x.L === "Tempest") + (x.T === "Forest") + (x.S ? 1 : 0) + (c.tier === "God" || c.tier === "Source" ? 2 : 0) + (x.M ? .5 : 0); };
function best5(ns, exact) {
  const cs = ns.map(n => C.cardOf(n)); let best = null;
  const list = cs.length <= 5 ? [cs.map((_, i) => i)] : (cs.length === 7 ? C57 : combos5(cs.length));
  for (const idx of list) {
    const five = idx.map(i => cs[i]);
    const ev = exact ? permsBest(five) : (() => { const o = five.slice().sort((p, q) => xWeight(p) - xWeight(q)); return { ...E.evaluate(o, 0), cards: o }; })();
    if (!best || ev.score > best.score) best = ev;
  }
  return { score: best.score, name: best.name, ns: best.cards.map(c => c.n), scoring: best.scoring.map(i => best.cards[i].n) };
}

function create({ log = () => {}, walletOf = () => null, dir = null, tgToken = () => "", now = () => Date.now(), botThink = [1200, 2600], tickMs = 1000 } = {}) {
  const jf = dir ? require("../jsonfile").create(path.join(dir, "sd-board.json"), { log: m => log("showdown: " + m), fallback: {} }) : null;
  let B = {}; try { B = jf ? jf.load() || {} : {}; } catch (e) { log("showdown: board could not be read, starting fresh: " + e.message); }
  B.players = B.players || {};
  const saveBoard = () => { if (jf) jf.save(() => B); };
  const matches = new Map(), byKey = new Map(), waiting = new Map();
  const rnd = n => crypto.randomInt(n);

  const isGuest = pid => typeof pid === "string" && /^[a-f0-9]{24}$/.test(pid);
  const short = w => w.slice(0, 4) + "…" + w.slice(-4);
  function who({ token, pid, tg } = {}) {
    const wallet = token ? walletOf(token) : null;
    if (token && !wallet) return { error: "Your sign-in has expired. Sign in again.", status: 401 };
    if (wallet) return { key: "w:" + wallet, name: short(wallet) };
    const t = tg ? tgUser(tg, tgToken()) : null;
    if (t) return { key: "t:" + t.id, name: t.name };
    return isGuest(pid) ? { key: "g:" + pid, name: "Wanderer " + pid.slice(0, 4).toUpperCase() } : { error: "Open the game again to play." };
  }

  /* ---------- a match ---------- */
  function newMatch(a, b) {
    const id = crypto.randomBytes(8).toString("hex");
    const m = { id, seats: [a, b], stacks: [START, START], hand: 0, dealer: rnd(2), status: "play", log: [], seq: 0, born: now(), touched: now() };
    matches.set(id, m); byKey.set(a.key, id); if (!b.bot) byKey.set(b.key, id);
    startHand(m);
    log(`showdown: ${a.name} v ${b.name}`);
    return m;
  }
  function deal(m, k) { const out = []; while (out.length < k) { const n = 1 + rnd(1111); if (!m.used.has(n)) { m.used.add(n); out.push(n); } } return out; }
  function startHand(m) {
    m.hand++; m.dealer = 1 - m.dealer; m.used = new Set(); m.board = []; m.street = 0; m.result = null;
    m.hole = [deal(m, 2), deal(m, 2)];
    const [sb, bb] = BLINDS(m.hand), d = m.dealer, o = 1 - d;
    m.bets = [0, 0]; m.pot = 0;
    const post = (s, x) => { const v = Math.min(x, m.stacks[s]); m.stacks[s] -= v; m.bets[s] += v; };
    post(d, sb); post(o, bb);
    m.bb = bb; m.minRaise = bb; m.acted = [false, false]; m.toAct = d;     // heads-up: the dealer posts the small blind and acts first before the flop
    if (m.stacks[0] === 0 || m.stacks[1] === 0) return settleStreet(m);
    arm(m); m.seq++;
  }
  function arm(m) { m.deadline = now() + ACT_MS; m.botAt = m.seats[m.toAct].bot ? now() + botThink[0] + rnd(botThink[1] - botThink[0]) : 0; }
  const toCall = (m, s) => Math.max(0, m.bets[1 - s] - m.bets[s]);
  function legal(m, s) {
    if (m.status !== "play" || m.result || m.toAct !== s) return null;
    const call = Math.min(toCall(m, s), m.stacks[s]), maxTo = m.bets[s] + m.stacks[s];
    const minTo = Math.min(maxTo, m.bets[1 - s] + m.minRaise);
    return { fold: call > 0, check: call === 0, call, minTo, maxTo, canRaise: maxTo > m.bets[1 - s] && m.stacks[1 - s] > 0 };
  }
  function act(m, s, action, amount) {
    const L = legal(m, s); if (!L) return { error: "It isn't your turn." };
    const o = 1 - s;
    if (action === "fold") { if (!L.fold) return { error: "Nothing to fold to: check instead." }; m.log.push([s, "fold"]); return endHand(m, o, null); }
    if (action === "check") { if (!L.check) return { error: "You need to call or fold." }; m.log.push([s, "check"]); m.acted[s] = true; }
    else if (action === "call") { if (L.call <= 0) return { error: "Nothing to call: check instead." }; m.stacks[s] -= L.call; m.bets[s] += L.call; m.acted[s] = true; m.log.push([s, "call", L.call]); }
    else if (action === "raise") {
      if (!L.canRaise) return { error: "You can't raise now." };
      let to = Math.floor(Number(amount)); if (!Number.isFinite(to)) return { error: "Raise to how much?" };
      to = Math.max(L.minTo, Math.min(L.maxTo, to));
      const add = to - m.bets[s], size = to - m.bets[o];
      m.stacks[s] -= add; m.bets[s] = to; if (size > m.minRaise) m.minRaise = size;
      m.acted[s] = true; m.acted[o] = false; m.log.push([s, "raise", to]);
    } else return { error: "Fold, check, call or raise." };
    m.seq++;
    const done = m.acted[0] && m.acted[1] && (m.bets[0] === m.bets[1] || m.stacks[0] === 0 || m.stacks[1] === 0);
    if (done || (m.stacks[o] === 0 && m.bets[s] >= m.bets[o])) return settleStreet(m);
    m.toAct = o; arm(m);
    return {};
  }
  // the betting round is over: an uncalled part of a bet goes back, the bets join the pot, the next beings turn over
  function settleStreet(m) {
    const hi = m.bets[0] > m.bets[1] ? 0 : 1, lo = 1 - hi;
    if (m.bets[hi] > m.bets[lo]) { const back = m.bets[hi] - m.bets[lo]; m.stacks[hi] += back; m.bets[hi] -= back; }
    m.pot += m.bets[0] + m.bets[1]; m.bets = [0, 0];
    const allIn = m.stacks[0] === 0 || m.stacks[1] === 0;
    if (m.street === 3) return showdown(m);                 // the river's betting is done
    if (allIn) { while (m.street < 3) { m.street++; m.board.push(...deal(m, m.street === 1 ? 3 : 1)); } return showdown(m); }
    m.street++; m.board.push(...deal(m, m.street === 1 ? 3 : 1));
    m.acted = [false, false]; m.minRaise = m.bb; m.toAct = 1 - m.dealer; arm(m); m.seq++;
    return {};
  }
  function showdown(m) {
    const h = [0, 1].map(s => best5(m.hole[s].concat(m.board), true));
    const w = h[0].score === h[1].score ? null : h[0].score > h[1].score ? 0 : 1;
    return endHand(m, w, h);
  }
  function endHand(m, w, hands) {
    const pot = m.pot + m.bets[0] + m.bets[1]; m.bets = [0, 0]; m.pot = 0;
    const won = [0, 0];
    if (w == null) { const half = Math.floor(pot / 2); won[0] = half; won[1] = half; won[1 - m.dealer] += pot - 2 * half; }
    else won[w] = pot;
    m.stacks[0] += won[0]; m.stacks[1] += won[1];
    m.result = { winner: w, pot, won, hands: hands ? hands.map(x => ({ name: x.name, score: x.score, ns: x.ns, scoring: x.scoring })) : null,
      hole: hands ? m.hole.map(x => x.slice()) : null, board: m.board.slice(), folded: !hands };
    m.toAct = -1; m.nextAt = now() + PAUSE_MS; m.seq++;
    if (m.stacks[0] === 0 || m.stacks[1] === 0 || m.hand >= HANDS) finish(m);
    return {};
  }
  function finish(m, forfeit) {
    m.status = "done";
    const w = forfeit != null ? 1 - forfeit : m.stacks[0] === m.stacks[1] ? null : m.stacks[0] > m.stacks[1] ? 0 : 1;
    m.winner = w; m.forfeit = forfeit != null ? forfeit : null;
    // the ranking: a rating from games between real players; games against the bot are counted on their own
    const P = m.seats.map(s => s.bot ? null : (B.players[s.key] = B.players[s.key] || { name: s.name, rating: 1000, w: 0, l: 0, d: 0, bw: 0, bl: 0 }));
    m.seats.forEach((s, i) => { if (P[i]) P[i].name = s.name; });
    if (P[0] && P[1]) {
      const ea = 1 / (1 + Math.pow(10, (P[1].rating - P[0].rating) / 400)), sa = w == null ? .5 : w === 0 ? 1 : 0;
      P[0].rating = Math.round(P[0].rating + 32 * (sa - ea)); P[1].rating = Math.round(P[1].rating + 32 * ((1 - sa) - (1 - ea)));
      if (w == null) { P[0].d++; P[1].d++; } else { P[w].w++; P[1 - w].l++; }
    } else {
      const i = P[0] ? 0 : 1; if (P[i]) { if (w === i) P[i].bw++; else if (w === 1 - i) P[i].bl++; }
    }
    saveBoard();
    m.seats.forEach(s => { if (byKey.get(s.key) === m.id) byKey.delete(s.key); });
    m.endedAt = now();
    log(`showdown: ${m.seats[0].name} ${m.stacks[0]} - ${m.stacks[1]} ${m.seats[1].name}${m.forfeit != null ? " (forfeit)" : ""}`);
  }

  /* ---------- The Realm: a bot that weighs its chances by playing the hand out many times ---------- */
  function equity(m, s, sims = 140) {
    const known = new Set([...m.hole[s], ...m.board]);
    let win = 0;
    for (let k = 0; k < sims; k++) {
      const used = new Set(known), pick = () => { for (;;) { const n = 1 + rnd(1111); if (!used.has(n)) { used.add(n); return n; } } };
      const opp = [pick(), pick()], board = m.board.slice(); while (board.length < 5) board.push(pick());
      const a = best5(m.hole[s].concat(board), false).score, b = best5(opp.concat(board), false).score;
      win += a > b ? 1 : a === b ? .5 : 0;
    }
    return win / sims;
  }
  function botMove(m) {
    const s = m.toAct, L = legal(m, s); if (!L) return;
    const p = equity(m, s), pot = m.pot + m.bets[0] + m.bets[1], r = Math.random();
    const raiseTo = f => m.bets[1 - s] + Math.max(m.minRaise, Math.round(pot * f));
    if (L.check) {
      if (L.canRaise && (p > .78 || (p > .6 && r < .5) || r < .08)) return act(m, s, "raise", raiseTo(p > .78 ? 1 : .5));
      return act(m, s, "check");
    }
    const odds = L.call / (pot + L.call);
    if (L.canRaise && p > .82 && r < .7) return act(m, s, "raise", raiseTo(1));
    if (p > odds + .04 || r < .05) return act(m, s, "call");
    return act(m, s, "fold");
  }

  /* ---------- time: turns that run out, the bot's moves, the next hand ---------- */
  function tick() {
    const t = now();
    for (const m of matches.values()) {
      if (m.status === "done") { if (t - m.endedAt > 10 * 60e3) matches.delete(m.id); continue; }
      if (t - m.touched > MATCH_TTL) { finish(m, null); continue; }
      if (m.result) { if (t >= m.nextAt) startHand(m); continue; }
      const s = m.toAct; if (s < 0) continue;
      if (m.seats[s].bot) { if (t >= m.botAt) botMove(m); continue; }
      if (t >= m.deadline) { const L = legal(m, s); act(m, s, L && L.check ? "check" : "fold"); m.timeouts = (m.timeouts || 0) + 1; m.log.push([s, "timeout"]); }
    }
    for (const [k, w] of waiting) {
      if (t - w.seen > QUEUE_STALE) { waiting.delete(k); continue; }
      if (t - w.at >= BOT_WAIT) { waiting.delete(k); newMatch(w.me, BOT); }
    }
  }
  const timer = tickMs ? setInterval(tick, tickMs) : null; if (timer && timer.unref) timer.unref();

  /* ---------- what each player can ask ---------- */
  function queue(q = {}) {
    tick();
    const me = who(q); if (me.error) return me;
    const cur = byKey.get(me.key); if (cur && matches.has(cur)) return { match: cur };
    // someone else is waiting: a real match
    for (const [k, w] of waiting) if (k !== me.key) { waiting.delete(k); return { match: newMatch(w.me, me).id }; }
    const w = waiting.get(me.key) || { me, at: now() }; w.seen = now(); waiting.set(me.key, w);
    return { waiting: true, waited: now() - w.at, botIn: Math.max(0, BOT_WAIT - (now() - w.at)) };
  }
  function seatOf(m, me) { return m.seats.findIndex(s => s.key === me.key); }
  function view(m, s) {
    const o = 1 - s, R = m.result;
    return { id: m.id, seq: m.seq, you: s, hand: m.hand, hands: HANDS, blinds: BLINDS(m.hand), stage: m.status, winner: m.status === "done" ? m.winner : undefined,
      forfeit: m.forfeit, dealer: m.dealer,
      seats: m.seats.map((x, i) => ({ name: x.name, bot: !!x.bot, stack: m.stacks[i], bet: m.bets[i] })),
      board: m.board, hole: m.hole[s], oppHole: R && R.hole ? R.hole[o] : null, pot: m.pot, toAct: m.toAct,
      legal: legal(m, s), ms: m.toAct >= 0 && !m.result ? Math.max(0, m.deadline - now()) : 0,
      result: R ? { winner: R.winner, pot: R.pot, won: R.won, hands: R.hands, folded: R.folded, nextIn: Math.max(0, m.nextAt - now()) } : null,
      last: m.log.slice(-1)[0] || null };
  }
  function state(q = {}) {
    tick();
    const me = who(q); if (me.error) return me;
    const m = matches.get(String(q.match || "")); if (!m) return { error: "That match has ended.", gone: true };
    const s = seatOf(m, me); if (s < 0) return { error: "That isn't your match." };
    m.touched = now();
    return view(m, s);
  }
  function move(q = {}) {
    tick();
    const me = who(q); if (me.error) return me;
    const m = matches.get(String(q.match || "")); if (!m) return { error: "That match has ended.", gone: true };
    const s = seatOf(m, me); if (s < 0) return { error: "That isn't your match." };
    m.touched = now();
    const r = act(m, s, String(q.action || ""), q.amount); if (r.error) return r;
    return view(m, s);
  }
  function leave(q = {}) {
    const me = who(q); if (me.error) return me;
    waiting.delete(me.key);
    const id = byKey.get(me.key), m = id && matches.get(id);
    if (m && m.status === "play") { const s = seatOf(m, me); if (s >= 0) finish(m, s); }
    return { ok: true };
  }
  function board({ token, pid, tg } = {}) {
    const me = who({ token, pid, tg });
    const rows = Object.entries(B.players).filter(([, p]) => p.w + p.l + p.d > 0).sort((a, b) => b[1].rating - a[1].rating || b[1].w - a[1].w).slice(0, 20)
      .map(([k, p], i) => ({ rank: i + 1, name: p.name, rating: p.rating, w: p.w, l: p.l, d: p.d, you: !me.error && k === me.key }));
    const mine = !me.error && B.players[me.key] ? { ...B.players[me.key] } : null;
    return { top: rows, you: mine, waiting: waiting.size, live: [...matches.values()].filter(m => m.status === "play").length };
  }
  return { queue, state, move, leave, board, tick, flush: () => jf && jf.flush(), stop: () => timer && clearInterval(timer), _matches: matches, _best5: best5, START, HANDS };
}

module.exports = { create, best5 };
