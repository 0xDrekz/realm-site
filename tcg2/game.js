/* ============================================================
   REALM card battler — matches on the server.

   The page never decides anything. It asks for a deal, picks three of the
   five, and sends moves; the server checks every move with the rules
   engine, plays the rival, and sends back what happened, step by step, so
   the page can animate it. Randomness (the deal, the shuffle) is drawn
   here, from the system's secure generator.
   ============================================================ */
"use strict";
const crypto = require("crypto");
const E = require("./engine"), AI = require("./ai"), C = require("./cards"), K = require("./campaign");

const MATCH_TTL = 2 * 3600e3, DEAL_TTL = 30 * 60e3, MAX_MATCHES = 5000;
const token = () => crypto.randomBytes(16).toString("hex");

function create({ log = () => {} } = {}) {
  const matches = new Map(), deals = new Map(), results = [];
  const byTier = {};
  C.all().forEach(c => (byTier[c.tier] = byTier[c.tier] || []).push(c.n));

  function tidy() {
    const now = Date.now();
    for (const [k, m] of matches) if (now - m.at > MATCH_TTL) matches.delete(k);
    for (const [k, d] of deals) if (now - d.at > DEAL_TTL) deals.delete(k);
    while (matches.size > MAX_MATCHES) matches.delete(matches.keys().next().value);
    while (deals.size > MAX_MATCHES) deals.delete(deals.keys().next().value);
  }

  /* a card as the page shows it, at the strength it will play */
  const show = (n, scale = 1) => {
    const c = E.scaled(C.cardOf(n), scale);
    return { n: c.n, name: c.name, tier: c.tier, cost: c.cost, essence: c.essence, power: c.power, health: c.health, kw: c.kw,
      text: c.text, legendary: c.legendary, unique: c.uniqueName || null, kind: "unit" };
  };
  /* champions travel as numbers after the start; the page keeps the cards */
  const lite = v => {
    for (const side of [v.you, v.rival]) side.champions = side.champions.map(c => ({ i: c.i, home: c.home, cost: c.cost, n: c.card.n }));
    return v;
  };

  /* ---------- the deal: five borrowed spirits, keep three ---------- */
  function deal({ level }) {
    tidy();
    const L = K.LEVELS.get(String(level || ""));
    if (!L || L.id === "tutorial") return { error: "That level is not open." };
    const pool = K.POOL[L.realm], weights = Object.entries(pool), total = weights.reduce((a, [, w]) => a + w, 0);
    const ns = [];
    while (ns.length < 5) {
      let r = crypto.randomInt(total), tier = weights[0][0];
      for (const [t, w] of weights) { if (r < w) { tier = t; break; } r -= w; }
      const list = byTier[tier], n = list[crypto.randomInt(list.length)];
      if (!ns.includes(n)) ns.push(n);
    }
    const id = token();
    deals.set(id, { ns, level: L.id, at: Date.now() });
    return { deal: id, level: L.id, cards: ns.map(n => show(n, K.BORROWED_SCALE)) };
  }

  /* ---------- a match ---------- */
  function start({ level, deal: dealId, pick }) {
    tidy();
    const L = K.LEVELS.get(String(level || ""));
    if (!L) return { error: "That level is not open." };
    let champions, scale = 1, deck;
    if (L.id === "tutorial") { champions = L.you.champions; deck = L.you.deck; }
    else {
      const d = deals.get(String(dealId || ""));
      if (!d || d.level !== L.id) return { error: "That deal has expired. Deal again." };
      const p = Array.isArray(pick) ? [...new Set(pick.map(Number))] : [];
      if (p.length !== 3 || p.some(i => !(Number.isInteger(i) && i >= 0 && i < d.ns.length))) return { error: "Keep three of the five." };
      deals.delete(String(dealId));
      champions = p.map(i => d.ns[i]); scale = K.BORROWED_SCALE;
    }
    const S = E.newMatch({ seed: crypto.randomInt(2 ** 32), first: L.first,
      sides: [{ name: "You", champions, scale, deck }, { name: L.rival.name, champions: L.rival.champions, life: L.rival.life, scale: L.rival.scale || 1, deck: L.rival.deck }] });
    S.events.length = 0;
    const id = token(), m = { id, S, level: L.id, at: Date.now(), done: false };
    matches.set(id, m);
    const first = E.view(S, 0);
    const defs = { you: first.you.champions.map(c => c.card), rival: first.rival.champions.map(c => c.card) };
    const frames = advance(m);
    return { match: id, level: L.id, name: L.name, boss: !!L.boss, rival: L.rival.name, tutorial: L.id === "tutorial", defs, shared: C.SHARED, view: lite(first), frames, result: m.result || null };
  }

  /* run the rival until it is your move again; every step becomes a frame */
  function advance(m) {
    const S = m.S, frames = [];
    S.onAct = (who, a) => frames.push({ who, move: a.type, ev: S.events.splice(0), view: lite(E.view(S, 0)) });
    try {
      for (let g = 0; g < 80 && S.phase !== "over"; g++) {
        if (S.phase === "block") {
          if (S.active === 0) { AI.blockPhase(S, 1); continue; }
          const me = S.players[0], atk = S.pending.attackers.map(uid => S.players[1].board.find(u => u.uid === uid)).filter(Boolean);
          if (me.board.some(b => atk.some(a => E.canBlock(S, b, a)))) break;    // your blocks
          E.act(S, 0, { type: "block", blocks: {} });                            // nothing can block: it goes through
          continue;
        }
        if (S.active === 0) break;
        if (S.players[1].attacked) AI.finish(S, 1); else AI.step(S, 1);
      }
    } finally { S.onAct = null; }
    if (S.phase === "over" && !m.done) finish(m);
    return frames;
  }

  function finish(m) {
    const S = m.S;
    m.done = true;
    const L = K.LEVELS.get(m.level), won = S.winner === 0;
    m.result = { won, stars: K.stars(S, 0, L), turns: S.turn, life: S.players[0].life, level: m.level };
    results.push({ ...m.result, at: Date.now() }); if (results.length > 2000) results.shift();
    log(`card battler: ${m.level} ${won ? "won" : "lost"} in ${S.turn} turns (${m.result.stars} stars)`);
  }

  /* ---------- your move ---------- */
  const int = x => (Number.isInteger(Number(x)) ? Number(x) : null);
  function clean(a) {
    if (!a || typeof a !== "object") return null;
    const target = a.target && typeof a.target === "object"
      ? (a.target.face != null ? { face: int(a.target.face) === 1 ? 1 : 0 } : a.target.uid != null ? { uid: int(a.target.uid) } : null) : null;
    switch (a.type) {
      case "play": return a.champion != null ? { type: "play", champion: int(a.champion), target } : { type: "play", uid: int(a.uid), target };
      case "attack": return Array.isArray(a.attackers) && a.attackers.length <= 6 ? { type: "attack", attackers: a.attackers.map(int) } : null;
      case "block": {
        const out = {}, b = a.blocks && typeof a.blocks === "object" ? a.blocks : {};
        for (const [k, v] of Object.entries(b).slice(0, 6)) if (int(k) != null && int(v) != null) out[int(k)] = int(v);
        return { type: "block", blocks: out };
      }
      case "end": return { type: "end" };
      case "resign": return { type: "resign" };
    }
    return null;
  }
  function act({ match, move }) {
    const m = matches.get(String(match || ""));
    if (!m) return { error: "That match has ended. Start a new one." };
    m.at = Date.now();
    const S = m.S;
    if (S.phase === "over") return { error: "The match is over.", result: m.result };
    const a = clean(move);
    if (!a) return { error: "That move is not allowed." };
    if (a.type === "resign") {
      S.winner = 1; S.phase = "over"; S.events.push({ t: "over", winner: 1 });
      finish(m);
      return { frames: [{ who: 0, move: "resign", ev: S.events.splice(0), view: lite(E.view(S, 0)) }], result: m.result };
    }
    const frames = [];
    S.onAct = (who, mv) => frames.push({ who, move: mv.type, ev: S.events.splice(0), view: lite(E.view(S, 0)) });
    const err = E.act(S, 0, a);
    S.onAct = null;
    if (err) { S.events.length = 0; return { error: err, view: lite(E.view(S, 0)) }; }
    frames.push(...advance(m));
    return { frames, result: m.result || null };
  }

  function view({ match }) {
    const m = matches.get(String(match || ""));
    if (!m) return { error: "That match has ended. Start a new one." };
    const v = E.view(m.S, 0);
    return { match: m.id, level: m.level, defs: { you: v.you.champions.map(c => c.card), rival: v.rival.champions.map(c => c.card) }, view: lite(v), result: m.result || null };
  }

  /* the campaign map, as the page shows it */
  const map = () => ({
    tutorial: { id: K.TUTORIAL.id, name: K.TUTORIAL.name },
    realms: K.REALMS.map(r => ({ id: r.id, name: r.name, tier: r.tier, blurb: r.blurb,
      levels: r.levels.map(l => ({ id: l.id, name: l.name, boss: !!l.boss, rival: l.rival.name, life: l.rival.life, face: l.rival.champions[0] })) })),
  });

  return { deal, start, act, view, map, stats: () => ({ matches: matches.size, results: results.slice(-200) }) };
}

module.exports = { create };
