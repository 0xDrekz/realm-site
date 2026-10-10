/* ============================================================
   REALM card battler — matches on the server.

   The page never decides anything. It asks for a deal, picks three of the
   five, and sends moves; the server checks every move with the rules
   engine, plays the rival, and sends back what happened, step by step, so
   the page can animate it. Randomness (the deal, the shuffle) is drawn
   here, from the system's secure generator.
   ============================================================ */
"use strict";
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const E = require("./engine"), AI = require("./ai"), C = require("./cards"), K = require("./campaign");

const MATCH_TTL = 2 * 3600e3, DEAL_TTL = 30 * 60e3, MAX_MATCHES = 5000;
const newId = () => crypto.randomBytes(16).toString("hex");

/* deps (all optional, so tests run without the chain):
   beings()       every minted being and its owner: [{ n, owner }]
   boostOf(w)     the $DMT boost for a wallet: { level, tokens, boost }
   walletOf(t)    the wallet a sign-in token belongs to, or null
   dir            where the boards are kept (a volume that survives deploys) */
function create({ log = () => {}, beings = async () => [], boostOf = async () => ({ level: 0, tokens: 0, boost: 1 }), walletOf = () => null, dir = null } = {}) {
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
  const lite = (v, S) => {
    if (S && S.phase === "block" && S.active === 1 && v.pending) v.pending.suggest = AI.suggestBlocks(S, 0);
    for (const side of [v.you, v.rival]) side.champions = side.champions.map(c => ({ i: c.i, home: c.home, cost: c.cost, n: c.card.n }));
    return v;
  };

  const TIER_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
  const tierOf = n => C.cardOf(n).tier;
  /* a rival of the same tiers as your champions, so a God meets Gods */
  function matchTiers(ns, not) {
    const out = [];
    for (const n of ns) {
      let t = tierOf(n); if (t === "Source") t = "God";
      const list = byTier[t].filter(x => !not.includes(x) && !out.includes(x) && x !== 1111);
      out.push(list[crypto.randomInt(list.length)]);
    }
    return out;
  }

  /* ---------- the boards: a week of points, a day of challenge ---------- */
  const file = dir ? path.join(dir, "tcg2-boards.json") : null;
  let boards = { weeks: {}, days: {} };
  if (file) { try { boards = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first run */ } }
  let saveTimer = null;
  const save = () => {
    if (!file) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const trim = o => Object.fromEntries(Object.keys(o).sort().slice(-14).map(k => [k, o[k]]));
        boards = { weeks: trim(boards.weeks), days: trim(boards.days) };
        fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(boards));
      } catch (e) { log("card battler: could not save the boards: " + e.message); }
    }, 1500);
  };
  const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  const weekKey = (d = new Date()) => { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m.toISOString().slice(0, 10); };
  const POINTS_PER_DAY = 25;      // wins that score each day: plenty for a person, a wall for a bot
  function score(m) {
    const r = m.result; if (!m.wallet || !m.eligible) return;
    if (m.level === "quick" && r.won) {
      const wk = boards.weeks[weekKey()] = boards.weeks[weekKey()] || {};
      const me = wk[m.wallet] = wk[m.wallet] || { points: 0, wins: 0, games: 0, today: dayKey(), todayWins: 0 };
      if (me.today !== dayKey()) { me.today = dayKey(); me.todayWins = 0; }
      me.games++;
      if (me.todayWins < POINTS_PER_DAY) { me.todayWins++; me.wins++; const pts = 10 + Math.max(0, Math.min(10, r.life)); me.points += pts; r.points = pts; me.at = Date.now(); }
      else r.capped = true;
      save();
    }
    if (m.level === "daily") {
      const day = boards.days[m.day] = boards.days[m.day] || {};
      const pts = r.won ? 1000 + r.life * 25 - r.turns * 10 : m.stats.damage * 10;
      r.points = pts;
      if (!day[m.wallet] || pts > day[m.wallet].points) { day[m.wallet] = { points: pts, won: r.won, turns: r.turns, at: Date.now() }; r.best = true; }
      save();
    }
  }
  const short = w => w.slice(0, 4) + "…" + w.slice(-4);
  function board({ token } = {}) {
    const me = walletOf(token);
    const wk = boards.weeks[weekKey()] || {}, dy = boards.days[dayKey()] || {};
    const rows = (o, key) => Object.entries(o).map(([w, r]) => ({ wallet: w, short: short(w), ...r })).sort((a, b) => b.points - a.points || (a.at || 0) - (b.at || 0));
    const week = rows(wk), day = rows(dy);
    const rank = (list) => { const i = list.findIndex(r => r.wallet === me); return i < 0 ? null : { rank: i + 1, ...list[i] }; };
    return { week: weekKey(), day: dayKey(), weekTop: week.slice(0, 20).map(({ wallet, short, points, wins }) => ({ wallet, short, points, wins })),
      dayTop: day.slice(0, 20).map(({ wallet, short, points, won, turns }) => ({ wallet, short, points, won, turns })), you: me ? { week: rank(week), day: rank(day) } : null };
  }

  /* ---------- a signed-in wallet: its beings, its boost ---------- */
  async function holder(token) {
    const wallet = walletOf(token);
    if (!wallet) return null;
    const [all, boost] = await Promise.all([beings().catch(() => []), boostOf(wallet).catch(() => ({ level: 0, tokens: 0, boost: 1 }))]);
    const owned = all.filter(b => b.owner === wallet).map(b => b.n)
      .sort((a, b) => TIER_ORDER.indexOf(tierOf(b)) - TIER_ORDER.indexOf(tierOf(a)) || a - b);
    return { wallet, owned, boost, eligible: owned.length > 0 || boost.level > 0 };
  }
  async function team({ token }) {
    const h = await holder(token);
    if (!h) return { error: "Connect your wallet first." };
    return { wallet: h.wallet, boost: h.boost, eligible: h.eligible, cards: h.owned.map(n => show(n, h.boost.boost)) };
  }

  /* k different beings, drawn by tier weight */
  function draw(pool, k, not = []) {
    const weights = Object.entries(pool), total = weights.reduce((a, [, w]) => a + w, 0), ns = [];
    while (ns.length < k) {
      let r = crypto.randomInt(total), tier = weights[0][0];
      for (const [t, w] of weights) { if (r < w) { tier = t; break; } r -= w; }
      const list = byTier[tier], n = list[crypto.randomInt(list.length)];
      if (!ns.includes(n) && !not.includes(n)) ns.push(n);
    }
    return ns;
  }

  /* ---------- the deal: five borrowed spirits, keep three ---------- */
  function deal({ level }) {
    tidy();
    const L = K.LEVELS.get(String(level || ""));
    if (!L || L.id === "tutorial" || L.id === "quick") return { error: "That level is not open." };
    const ns = draw(K.POOL[L.realm], 5);
    const id = newId();
    deals.set(id, { ns, level: L.id, at: Date.now() });
    return { deal: id, level: L.id, cards: ns.map(n => show(n, K.BORROWED_SCALE)) };
  }

  /* ---------- a match ---------- */
  async function start({ level, deal: dealId, pick, token, team: wanted }) {
    tidy();
    const L = K.LEVELS.get(String(level || ""));
    if (!L) return { error: "That level is not open." };
    const h = L.id === "tutorial" || L.id === "daily" ? null : await holder(token);
    // your own beings: the team you chose, if you hold them; topped up with borrowed spirits
    const mine = h ? [...new Set((Array.isArray(wanted) ? wanted : []).map(Number))].filter(n => h.owned.includes(n)).slice(0, 3) : [];
    if (h && !mine.length) mine.push(...h.owned.slice(0, 3));
    const boost = h ? h.boost.boost : 1;
    let champions, scale = 1, deck, rival = L.rival, scales = null, first = L.first, seed = crypto.randomInt(2 ** 32), day = null;
    if (L.id === "tutorial") { champions = L.you.champions; deck = L.you.deck; }
    else if (L.id === "daily") {
      // the same game for everyone today: the same spirits, the same rival, the same shuffle
      day = dayKey(); const r = K.dailyOf(day, byTier);
      champions = r.you; scale = K.BORROWED_SCALE; seed = r.seed; first = r.first;
      rival = { name: r.rivalName, champions: r.rival, life: L.rivalLife, scale: L.rivalScale };
    }
    else if (L.id === "quick") {
      const fill = mine.length < 3 ? draw(L.pool, 3 - mine.length, mine) : [];
      champions = [...mine, ...fill]; scales = champions.map(n => (mine.includes(n) ? 1 : K.BORROWED_SCALE) * boost);
      rival = { name: L.rivals[crypto.randomInt(L.rivals.length)], champions: matchTiers(champions, champions), life: L.rivalLife, scale: L.rivalScale };
    }
    else if (mine.length) {
      // a campaign level with your own beings: no deal needed
      const fill = mine.length < 3 ? draw(K.POOL[L.realm], 3 - mine.length, mine) : [];
      champions = [...mine, ...fill]; scales = champions.map(n => (mine.includes(n) ? 1 : K.BORROWED_SCALE) * boost);
    }
    else {
      if (h && h.boost.boost > 1) scale = K.BORROWED_SCALE * h.boost.boost;
      const d = deals.get(String(dealId || ""));
      if (!d || d.level !== L.id) return { error: "That deal has expired. Deal again." };
      const p = Array.isArray(pick) ? [...new Set(pick.map(Number))] : [];
      if (p.length !== 3 || p.some(i => !(Number.isInteger(i) && i >= 0 && i < d.ns.length))) return { error: "Keep three of the five." };
      deals.delete(String(dealId));
      champions = p.map(i => d.ns[i]); scale = scale === 1 ? K.BORROWED_SCALE : scale;
    }
    const S = E.newMatch({ seed, first,
      sides: [{ name: "You", champions, scale, scales, deck, life: L.id === "quick" || L.id === "daily" ? L.life : undefined }, { name: rival.name, champions: rival.champions, life: rival.life, scale: rival.scale || 1, deck: rival.deck }] });
    S.events.length = 0;
    const id = newId(), m = { id, S, level: L.id, at: Date.now(), done: false, stats: { summons: 0, champions: 0, kills: 0, rituals: 0, damage: 0 },
      wallet: h ? h.wallet : walletOf(token), eligible: h ? h.eligible : false, day };
    if (L.id === "daily" && m.wallet) { const hh = await holder(token); m.eligible = !!(hh && hh.eligible); }
    matches.set(id, m);
    const v0 = E.view(S, 0);
    const defs = { you: v0.you.champions.map(c => c.card), rival: v0.rival.champions.map(c => c.card) };
    const frames = advance(m);
    return { match: id, level: L.id, name: L.name, boss: !!L.boss, rival: rival.name, tutorial: L.id === "tutorial", boost: h ? h.boost : null, own: mine, defs, shared: C.SHARED, view: lite(v0), frames, result: m.result || null };
  }

  /* what you did, for the daily quests */
  function count(m, evs) {
    for (const e of evs) {
      if (e.t === "summon" && e.p === 0) { m.stats.summons++; if (e.n) m.stats.champions++; }
      else if (e.t === "death" && e.p === 1) m.stats.kills++;
      else if (e.t === "cast" && e.p === 0) m.stats.rituals++;
      else if (e.t === "face" && e.p === 1) m.stats.damage += e.n;
    }
    return evs;
  }
  const frame = (m, who, type) => { const S = m.S; return { who, move: type, ev: count(m, S.events.splice(0)), view: lite(E.view(S, 0), S) }; };

  /* run the rival until it is your move again; every step becomes a frame */
  function advance(m) {
    const S = m.S, frames = [];
    S.onAct = (who, a) => frames.push(frame(m, who, a.type));
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
    const st = K.stars(S, 0, L);
    // no experience for leaving, or for a loss in a handful of turns (no farming)
    const xp = m.resigned || (!won && S.turn < 8) ? 0 : K.xp(won, st, L);
    m.result = { won, stars: st, turns: S.turn, life: S.players[0].life, level: m.level, xp, stats: m.stats };
    score(m);
    results.push({ ...m.result, at: Date.now(), wallet: m.wallet || null }); if (results.length > 2000) results.shift();
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
      S.winner = 1; S.phase = "over"; S.events.push({ t: "over", winner: 1 }); m.resigned = true;
      finish(m);
      return { frames: [{ who: 0, move: "resign", ev: S.events.splice(0), view: lite(E.view(S, 0), S) }], result: m.result };
    }
    const frames = [];
    S.onAct = (who, mv) => frames.push(frame(m, who, mv.type));
    const err = E.act(S, 0, a);
    S.onAct = null;
    if (err) { S.events.length = 0; return { error: err, view: lite(E.view(S, 0), S) }; }
    frames.push(...advance(m));
    return { frames, result: m.result || null };
  }

  /* a suggested move: what the AI would do in your seat */
  function hint({ match }) {
    const m = matches.get(String(match || ""));
    if (!m) return { error: "That match has ended. Start a new one." };
    const S = m.S;
    if (S.phase === "block" && S.active === 1) return { move: { type: "block", blocks: AI.suggestBlocks(S, 0) } };
    if (S.phase !== "main" || S.active !== 0) return { move: null };
    const copy = structuredClone({ ...S, onAct: null });
    const play = AI.bestPlay(copy, 0);
    if (play) return { move: play };
    const go = AI.chooseAttackers(copy, 0);
    return { move: go.length ? { type: "attack", attackers: go } : { type: "end" } };
  }

  function view({ match }) {
    const m = matches.get(String(match || ""));
    if (!m) return { error: "That match has ended. Start a new one." };
    const v = E.view(m.S, 0);
    return { match: m.id, level: m.level, defs: { you: v.you.champions.map(c => c.card), rival: v.rival.champions.map(c => c.card) }, view: lite(v, m.S), result: m.result || null };
  }

  /* the campaign map, as the page shows it */
  const map = () => ({
    tutorial: { id: K.TUTORIAL.id, name: K.TUTORIAL.name },
    realms: K.REALMS.map(r => ({ id: r.id, name: r.name, tier: r.tier, blurb: r.blurb,
      levels: r.levels.map(l => ({ id: l.id, name: l.name, boss: !!l.boss, rival: l.rival.name, life: l.rival.life, face: l.rival.champions[0] })) })),
  });

  return { deal, start, act, view, map, hint, team, board, stats: () => ({ matches: matches.size, results: results.slice(-200) }) };
}

module.exports = { create };
