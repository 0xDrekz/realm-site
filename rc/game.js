/* ============================================================
   REALM Cards — matches on the server.

   The page sends a deck and then moves; the server checks every move with
   the rules engine, plays the computer, and sends back what happened, one
   step at a time, so the page can animate it. The shuffle is seeded here
   from the system's secure generator. Free to play: nothing is ever sold.
   ============================================================ */
"use strict";
const crypto = require("crypto");
const C = require("./cards"), E = require("./engine"), AI = require("./ai"), PROFILE = require("./profile");

const MATCH_TTL = 2 * 3600e3, MAX_MATCHES = 5000, PER_OWNER = 8, MAX_AI_STEPS = 300;
const LEVELS = { easy: 0.15, normal: 0.6, hard: 1 };
const newId = () => crypto.randomBytes(16).toString("hex");

/* the starter decks: one per essence and one per pair, the same cards every time */
function seeded(name) { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return n => { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return h % n; }; }
const STARTER_NAMES = {
  magic: "Wildfire", spirit: "Overgrowth", knowledge: "Deep Archive", light: "Dawn Host", dark: "Bone Choir",
  "magic+spirit": "Ember Grove", "magic+knowledge": "Storm Scholars", "magic+light": "Sunfire", "magic+dark": "Ash and Ember",
  "spirit+knowledge": "Tide Garden", "spirit+light": "Sacred Wood", "spirit+dark": "Rot and Root",
  "knowledge+light": "Star Charts", "knowledge+dark": "Void Library", "light+dark": "Twilight" };
let STARTERS = null;
function starters() {
  if (STARTERS) return STARTERS;
  STARTERS = Object.entries(STARTER_NAMES).map(([key, name]) => ({ key, name, essences: key.split("+"), deck: C.buildDeck(key.split("+"), { pick: seeded(key) }) }));
  return STARTERS;
}

/* every card as the page shows it; sent once and cached */
function pool() {
  // tgt: what the card asks you to pick, so the page can light up the right targets
  const tgt = c => { const t = E.targetOf(c); return t ? { to: t.to, maxPower: t.maxPower == null ? null : t.maxPower } : null; };
  const beings = C.allBeings().map(c => ({ id: c.id, n: c.n, type: "being", name: c.name, tier: c.tier, cost: c.cost, essence: c.essence,
    power: c.power, health: c.health, kw: c.kw, text: c.text, named: c.named, tgt: tgt(c) }));
  const spells = C.SPELLS.map(s => ({ id: s.id, type: s.type, name: s.name, cost: s.cost, essence: s.essence, text: s.text, tgt: tgt(s), fx: (s.fx || s.turnStart || s.turnEnd || [{ k: "relic" }])[0].k }));
  const tokens = Object.fromEntries(Object.entries(C.TOKENS).map(([k, t]) => [k, { ...t }]));
  const kw = Object.fromEntries(Object.entries(C.KW).map(([k, v]) => [k, { name: v.name, rule: v.rule }]));
  return { v: 1, cards: [...beings, ...spells], tokens, kw, starters: starters().map(s => ({ key: s.key, name: s.name, essences: s.essences, deck: s.deck })) };
}

/* deps (all optional, so tests run without the chain):
   beings()     every minted being and its owner: [{ n, owner }]
   boostOf(w)   the $DMT boost for a wallet: { level, tokens, boost }
   walletOf(t)  the wallet a sign-in token belongs to, or null */
function create({ log = () => {}, beings = async () => [], boostOf = async () => ({ level: 0, tokens: 0, boost: 1 }), walletOf = () => null, dir = null, testHooks = false } = {}) {
  const matches = new Map();
  const PROF = PROFILE.create({ dir, log });
  const BUSY = { error: "The realm is very busy. Try again in a minute.", status: 503 };
  const EXPIRED = { error: "Your sign-in has expired. Sign in again.", status: 401 };
  const GONE = { error: "That match has ended. Start a new one." };
  const ownerOf = (wallet, ip) => wallet ? "w:" + wallet : "ip:" + String(ip || "?");

  function tidy() { const now = Date.now(); for (const [k, m] of matches) if (now - m.born > MATCH_TTL) matches.delete(k); }
  /* room for one more of this caller's matches: their own oldest makes way, never anyone else's */
  function room(owner) {
    const mine = [...matches.entries()].filter(([, v]) => v.owner === owner).sort((a, b) => a[1].born - b[1].born);
    while (mine.length >= PER_OWNER) matches.delete(mine.shift()[0]);
    return matches.size < MAX_MATCHES;
  }

  /* a signed-in wallet's beings and boost; null when the chain can't be read */
  async function holdingsOf(wallet) {
    try {
      const [all, boost] = await Promise.all([beings(), boostOf(wallet)]);
      return { owned: all.filter(b => b.owner === wallet).map(b => b.n), boost: boost || { level: 0, tokens: 0, boost: 1 } };
    } catch { return null; }
  }

  /* what the player may see of the events: the rival's raised card stays hidden */
  const seen = evs => evs.map(e => e.t === "raise" && e.p === 1 ? { t: "raise", p: 1 } : e);
  /* what you did, for the daily quests */
  function tally(m, evs) {
    const t = m.stats;
    for (const e of evs) {
      if (e.t === "play" && e.p === 0) {
        const c = C.cardOf(e.id); if (!c) continue;
        if (c.type === "being") { t.beings++; if (c.kw.includes("flying")) t.flyers++; } else t.spells++;
        if (c.cost >= 6) t.big++;
      }
      if (e.t === "face" && e.p === 1) t.face += e.n;
      if (e.t === "death" && e.p === 1) t.kills++;
    }
  }
  const frame = (m, who, move) => { const evs = m.S.events.splice(0); tally(m, evs); return { who: who === 0 ? "you" : "rival", move, ev: seen(evs), view: E.view(m.S, 0) }; };
  /* the last frame carries the computer's suggestion for your attack or your blocks, filled in for you */
  function suggest(frames, m) {
    const f = frames[frames.length - 1], S = m.S;
    if (!f || S.phase === "over") return frames;
    if (S.phase === "block" && S.active === 1) f.view.suggest = { blocks: AI.chooseBlocks(AI.clone(S), 0, 1).blocks };
    else if (S.phase === "main" && S.active === 0 && !S.attacked) f.view.suggest = { attackers: AI.chooseAttack(AI.clone(S), 0, 1) || [] };
    return frames;
  }

  /* the computer plays until it's your decision (or the match ends) */
  function advance(m) {
    const S = m.S, frames = [];
    for (let k = 0; k < MAX_AI_STEPS && S.phase !== "over"; k++) {
      const yours = S.phase === "block" ? S.active === 1 : S.active === 0;
      if (yours) break;
      const mv = AI.move(S, 1, { level: m.level });
      const err = mv ? E.act(S, 1, mv) : "no move";
      if (err) { log("rc: the computer made a bad move (" + err + "), ending its turn"); S.events.length = 0; if (E.act(S, 1, S.phase === "block" ? { type: "block", blocks: {} } : { type: "end" })) break; }
      frames.push(frame(m, 1, mv ? mv.type : "end"));
    }
    if (S.phase === "over") finish(m);
    return frames;
  }
  function finish(m) {
    if (m.result) return;
    const S = m.S;
    m.result = { won: S.winner === 0, draw: S.winner == null, turns: S.turn, life: S.players[0].life, hinted: !!m.hinted };
    if (m.pkey) m.result.progress = PROF.record(m.pkey, { won: m.result.won, draw: m.result.draw, turns: S.turn, hinted: m.hinted, stats: m.stats });
  }

  /* a move from the page, cleaned down to the fields the engine reads */
  function clean(a) {
    if (!a || typeof a !== "object") return null;
    const uid = v => Number.isInteger(v) ? v : null;
    switch (a.type) {
      case "end": case "resign": return { type: a.type };
      case "play": {
        const t = a.target && typeof a.target === "object" ? (a.target.player === 0 || a.target.player === 1 ? { player: a.target.player } : uid(a.target.uid) != null ? { uid: a.target.uid } : null) : null;
        return uid(a.uid) == null ? null : { type: "play", uid: a.uid, target: t };
      }
      case "attack": return Array.isArray(a.attackers) && a.attackers.length <= E.MAX_BOARD && a.attackers.every(x => uid(x) != null) ? { type: "attack", attackers: a.attackers } : null;
      case "block": {
        const b = a.blocks && typeof a.blocks === "object" && !Array.isArray(a.blocks) ? a.blocks : {};
        const ent = Object.entries(b);
        if (ent.length > E.MAX_BOARD || ent.some(([k, v]) => !/^\d{1,6}$/.test(k) || uid(v) == null)) return null;
        return { type: "block", blocks: Object.fromEntries(ent) };
      }
    }
    return null;
  }

  /* ---------- the endpoints ---------- */
  /* whose progress a match counts toward: a signed-in wallet, or a guest's profile id */
  function profileKey(wallet, pid) { return wallet ? "w:" + wallet : PROF.isGuest(pid) ? "g:" + pid : null; }
  function me({ token, pid } = {}) {
    let wallet = null;
    if (token) { wallet = walletOf(token); if (!wallet) return EXPIRED; }
    if (!wallet && !PROF.isGuest(pid)) pid = PROF.newGuest();
    return { pid: wallet ? null : pid, wallet, profile: PROF.view(profileKey(wallet, pid)) };
  }

  async function start({ deck, starter, level, token, pid, ip } = {}) {
    tidy();
    let wallet = null;
    if (token) { wallet = walletOf(token); if (!wallet) return EXPIRED; }
    const owner = ownerOf(wallet, ip);
    if (!room(owner)) return BUSY;
    // your deck: a starter, or one you built
    let mine = null;
    if (starter != null) { const s = starters().find(x => x.key === String(starter)); if (!s) return { error: "That starter deck doesn't exist." }; mine = s.deck.slice(); }
    else { if (!Array.isArray(deck)) return { error: "Pick a deck first." }; mine = deck.map(String); const bad = C.checkDeck(mine); if (bad) return { error: bad }; }
    // the computer plays as well as your rank: an apprentice in Bronze, its best in Mythic
    const pkey = profileKey(wallet, pid);
    const lv = LEVELS[level] != null ? level : null;
    const strength = lv ? LEVELS[lv] : pkey ? PROF.levelOf(PROF.get(pkey)) : LEVELS.normal;
    // the computer's deck: one or two essences, built at random from the whole pool
    const ess = C.ESSENCES;
    const e1 = ess[crypto.randomInt(5)], e2 = crypto.randomInt(3) ? ess[crypto.randomInt(5)] : e1;
    const theirs = C.buildDeck(e1 === e2 ? [e1] : [e1, e2], { pick: n => crypto.randomInt(n) });
    // a holder's own beings play a little stronger with $DMT
    let scales = {};
    if (wallet) {
      const h = await holdingsOf(wallet);
      if (h && h.boost && h.boost.boost > 1) for (const n of h.owned) if (mine.includes("b" + n)) scales["b" + n] = h.boost.boost;
    }
    const S = E.newMatch({ seed: crypto.randomInt(2 ** 31), sides: [{ deck: mine, name: "You", scales }, { deck: theirs, name: rivalName(e1, e2) }] });
    const id = newId(), m = { id, S, owner, wallet, pkey: lv ? null : pkey, born: Date.now(), level: strength, hinted: false, result: null,
      stats: { beings: 0, spells: 0, face: 0, kills: 0, big: 0, flyers: 0 } };
    matches.set(id, m);
    const first = frame(m, S.first, "start");
    const frames = suggest([first, ...advance(m)], m);
    return { match: id, rival: S.players[1].name, rivalEssences: e1 === e2 ? [e1] : [e1, e2], ranked: !!m.pkey, first: S.first === 0 ? "you" : "rival", boosted: Object.keys(scales).length, frames, result: m.result };
  }
  const RIVALS = { magic: "the Ember Court", spirit: "the Green Choir", knowledge: "the Archivists", light: "the Dawn Wardens", dark: "the Hollow Kings" };
  const rivalName = (a, b) => a === b ? RIVALS[a] : RIVALS[a] + " & " + RIVALS[b].replace(/^the /, "");

  async function act({ match, move } = {}) {
    const m = matches.get(String(match || ""));
    if (!m) return GONE;
    const S = m.S;
    if (S.phase === "over") return { error: "The match is over.", result: m.result };
    const a = clean(move);
    if (!a) return { error: "That move isn't allowed." };
    const err = E.act(S, 0, a);
    if (err) { S.events.length = 0; return { error: err, view: E.view(S, 0) }; }
    if (a.type === "resign") m.resigned = true;
    const frames = suggest([frame(m, 0, a.type), ...advance(m)], m);
    if (S.phase === "over") finish(m);
    return { frames, result: m.result };
  }

  /* what the computer would do in your seat; always a move the server accepts */
  function hint({ match } = {}) {
    const m = matches.get(String(match || ""));
    if (!m) return GONE;
    const S = m.S;
    const yours = S.phase === "block" ? S.active === 1 : S.active === 0;
    if (S.phase === "over" || !yours) return { move: null };
    m.hinted = true;                       // a match you were helped with doesn't count for the ladder
    const mv = AI.move(AI.clone(S), 0, { level: 1 });
    const c = AI.clone(S);
    return { move: mv && !E.act(c, 0, mv) ? mv : { type: S.phase === "block" ? "block" : "end", ...(S.phase === "block" ? { blocks: {} } : {}) } };
  }

  function view({ match } = {}) {
    const m = matches.get(String(match || ""));
    if (!m) return GONE;
    return { view: E.view(m.S, 0), result: m.result };
  }

  /* a deck built for you: your essences, your own beings first when you're signed in */
  async function build({ essences, token } = {}) {
    const ess = (Array.isArray(essences) ? essences : []).map(String).filter(e => C.ESSENCES.includes(e));
    const uniq = [...new Set(ess)].slice(0, 2);
    if (!uniq.length) return { error: "Pick one or two essences." };
    let prefer = [];
    if (token) {
      const wallet = walletOf(token);
      if (!wallet) return EXPIRED;
      const h = await holdingsOf(wallet);
      if (h) prefer = h.owned;
    }
    return { deck: C.buildDeck(uniq, { prefer, pick: n => crypto.randomInt(n) }) };
  }

  const hooks = testHooks ? { _match: id => matches.get(id) } : {};
  return { start, act, hint, view, build, me, pool, flush: () => PROF.flush(), size: () => matches.size, ...hooks };
}

module.exports = { create, pool, starters, LEVELS };
