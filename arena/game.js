/* ============================================================
   REALM Arena — matches on the server.

   The page plays the match itself (it has to, in real time), then sends
   back only where and when you placed each card. The server replays the
   whole match from those placements, with the same seed and the same
   engine, and decides the result. A made-up result can't get through:
   the server never reads one.

   Live matches are kept on disk as well as in memory, so a redeploy in the
   middle of a battle doesn't lose it: the page keeps playing, and the result
   is counted when the server is back.

   Your progress (rank, level, streak, daily quests) and the weekly board
   move only on results the server replayed itself.
   ============================================================ */
"use strict";
const crypto = require("crypto"), path = require("path");
const A = require("./engine"), C = require("./cards"), PROFILE = require("../rc/profile");

const TTL = 20 * 60e3, MAX_MATCHES = 5000, PER_OWNER = 3;
const RIVALS = ["Spore Drifter", "Moth Caller", "Root Wanderer", "Star Scribe", "Lantern Eye", "Dust Walker", "Tide Singer", "Hollow Knight", "Ember Twin", "Veil Weaver"];
// the rival grows with your rank: how sharp it plays, and how strong its beings are
const RIVAL_LEVEL = [0.5, 0.75, 1, 1.25, 1.6, 2];
const RIVAL_BOOST = [0.8, 0.84, 0.88, 0.92, 0.96, 1];
const POINTS_PER_DAY = 25;      // wins that score on the weekly board each day: plenty for a person, a wall for a bot

const QUESTS = [
  { id: "win1",   text: "Win a battle",                 stat: "wins",     n: 1,  xp: 40 },
  { id: "win3",   text: "Win 3 battles",                stat: "wins",     n: 3,  xp: 90 },
  { id: "play3",  text: "Play 3 battles",               stat: "games",    n: 3,  xp: 50 },
  { id: "towers", text: "Destroy 6 towers",             stat: "towers",   n: 6,  xp: 60 },
  { id: "three",  text: "Win with 3 crowns",            stat: "three",    n: 1,  xp: 70 },
  { id: "units",  text: "Summon 25 beings",             stat: "units",    n: 25, xp: 50 },
  { id: "spells", text: "Cast 6 spells",                stat: "spells",   n: 6,  xp: 50 },
  { id: "epics",  text: "Cast 2 epic spells",           stat: "epics",    n: 2,  xp: 60 },
  { id: "legend", text: "Summon a Legendary or rarer",  stat: "legends",  n: 1,  xp: 50 },
  { id: "fast",   text: "Win in under 2 minutes",       stat: "fastWins", n: 1,  xp: 70 },
];

function create({ log = () => {}, beings = async () => [], boostOf = async () => ({ level: 0, boost: 1 }), walletOf = () => null, dir = null } = {}) {
  const PROF = PROFILE.create({ dir, log, file: "arena-profiles.json", quests: QUESTS, levels: RIVAL_LEVEL });
  const jf = file => dir ? require("../jsonfile").create(path.join(dir, file), { log: m => log("arena: " + m), fallback: {} }) : null;
  const liveFile = jf("arena-live.json"), boardFile = jf("arena-board.json");

  /* live matches: restored from disk at start, so a redeploy doesn't end them */
  // a damaged file of live matches is not worth refusing to start over: those matches are simply gone
  let saved = {}; try { saved = liveFile ? liveFile.load() || {} : {}; } catch (e) { log("arena: live matches could not be read, starting fresh: " + e.message); }
  const matches = new Map(Object.entries(saved));
  const saveLive = () => { if (liveFile) liveFile.save(() => { tidy(); return Object.fromEntries(matches); }); };
  if (matches.size) log(`arena: ${matches.size} live match${matches.size === 1 ? "" : "es"} restored`);

  let boards = boardFile ? boardFile.load() || {} : {};
  boards.weeks = boards.weeks || {}; boards.seen = boards.seen || {};
  const trim = o => Object.fromEntries(Object.keys(o).sort().slice(-8).map(k => [k, o[k]]));
  const saveBoard = () => { if (boardFile) boardFile.save(() => (boards = { weeks: trim(boards.weeks), seen: trim(boards.seen) })); };
  const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  const weekKey = (d = new Date()) => { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m.toISOString().slice(0, 10); };

  const BT = C.byTier();
  const TIER_OF = {}; for (const [t, l] of Object.entries(BT)) for (const n of l) TIER_OF[n] = t;
  const pick = (list, not) => { for (;;) { const n = list[crypto.randomInt(list.length)]; if (!not.includes(n)) return n; } };
  function tidy() { const now = Date.now(); for (const [k, m] of matches) if (now - m.at > TTL) matches.delete(k); }
  /* each caller keeps at most three open matches; their own oldest makes way. A full server turns
     new callers away rather than throwing out other people's matches. */
  function room(owner) {
    const mine = [...matches.entries()].filter(([, m]) => m.owner === owner).sort((a, b) => a[1].at - b[1].at);
    while (mine.length >= PER_OWNER) matches.delete(mine.shift()[0]);
    return matches.size < MAX_MATCHES;
  }
  const profileKey = (wallet, pid) => wallet ? "w:" + wallet : PROF.isGuest(pid) ? "g:" + pid : null;

  /* the draw: every card is a random being from all 1,111, with spells and epics mixed in.
     A played card is gone for good and the next one comes in, so no two matches are alike.
     Gods, Entities and the Source are as rare in the draw as they are in the collection.
     A holder's own beings are always in the deck: one in the opening hand, then about one card in three. */
  const DRAW = 64;
  function dealSpecs({ own = [], ownBoost = 1, otherBoost = 1 }) {
    const out = [];
    for (let i = 0; i < DRAW; i++) {
      const r = crypto.randomInt(100);
      if (own.length && (i === 0 || (i > 3 && crypto.randomInt(100) < 33))) out.push({ n: own[crypto.randomInt(own.length)], b: ownBoost, o: 1 });
      else if (r < 11) out.push({ s: C.SMALL[crypto.randomInt(C.SMALL.length)] });
      else if (r < 18) out.push({ s: C.EPIC[crypto.randomInt(C.EPIC.length)] });
      else out.push({ n: 1 + crypto.randomInt(1111), b: otherBoost });
    }
    return out;
  }
  /* the guided first match: your hand is all cheap, sturdy fighters; the rival is an apprentice */
  function tutorialSpecs(own, ownBoost) {
    const cheap = ["Common", "Uncommon", "Rare"].flatMap(t => BT[t]).filter(n => { const f = C.fighter(n); return !f.air && (f.role === "tank" || f.role === "striker") && f.style !== "split"; });
    const out = [];
    if (own.length) out.push({ n: own[crypto.randomInt(own.length)], b: ownBoost, o: 1 });
    while (out.length < DRAW) out.push(out.length % 7 === 6 ? { s: "strike" } : { n: pick(cheap, out.map(c => c.n)), b: 1.1 });
    return out;
  }
  const build = specs => specs.map(c => c.s ? { ...C.SPELLS[c.s] } : c.o ? { ...C.fighter(c.n, c.b), own: true } : C.fighter(c.n, c.b));
  function sidesOf(m) {
    return [{ deck: build(m.specs[0]), draw: true, ai: false },
      { deck: build(m.specs[1]), draw: true, ai: true, level: m.level, towerScale: m.tutorial ? 0.3 : 1 }];
  }
  const wildOf = ns => ns ? ns.map(([a, b]) => [C.fighter(a, 0.9), C.fighter(b, 0.9)]) : null;

  async function holdings(wallet) {
    const [all, b] = await Promise.all([beings(), boostOf(wallet)]);
    return { owned: all.filter(x => x.owner === wallet).map(x => x.n), boost: b || { level: 0, boost: 1 } };
  }

  /* who you are and how you're doing; a guest gets a profile id to keep on the device */
  function me({ token, pid } = {}) {
    let wallet = null;
    if (token) { wallet = walletOf(token); if (!wallet) return { error: "Your sign-in has expired. Sign in again.", status: 401 }; }
    if (!wallet && !PROF.isGuest(pid)) pid = PROF.newGuest();
    return { pid: wallet ? null : pid, wallet, profile: PROF.view(profileKey(wallet, pid)) };
  }

  async function start({ token, pid, tutorial, ip } = {}) {
    tidy();
    const wallet = walletOf(token);
    if (token && !wallet) return { error: "Your sign-in has expired. Sign in again.", status: 401 };
    let mine = [], boost = { level: 0, boost: 1 };
    if (wallet) {
      // a chain read that fails is said out loud, never turned into "you hold nothing"
      try { ({ owned: mine, boost } = await holdings(wallet)); }
      catch { return { error: "Couldn't read your wallet just now. Retry in a moment.", status: 503 }; }
    }
    const owner = wallet ? "w:" + wallet : "ip:" + String(ip || "?");
    if (!room(owner)) return { error: "The realm is very busy. Try again in a minute.", status: 503 };
    const pkey = profileKey(wallet, pid), prof = pkey ? PROF.view(pkey) : null;
    // the guided match is only for a first battle
    const guided = !!tutorial && (!prof || prof.games === 0);
    const tier = prof ? prof.tierIndex : 0;
    const specs = guided
      ? [tutorialSpecs(mine, boost.boost), BT.Common.slice(0, DRAW).map(() => ({ n: pick(BT.Common, []), b: 0.45 }))]
      : [dealSpecs({ own: mine, ownBoost: boost.boost, otherBoost: 0.92 * boost.boost }), dealSpecs({ otherBoost: RIVAL_BOOST[tier] })];
    // the wild spirits the arena sends to both sides in its Realm Surges: two different beings of each rarity
    const wildNs = guided ? null : ["Uncommon", "Rare", "Epic", "Rare", "Epic", "Legendary", "Mythic"].map(t => { const a = pick(BT[t], []); return [a, pick(BT[t], [a])]; });
    const seed = crypto.randomInt(2 ** 32), id = crypto.randomBytes(16).toString("hex");
    const m = { id, seed, specs, wildNs, wallet, pkey, owner, at: Date.now(), done: false, tutorial: guided, level: guided ? 0 : RIVAL_LEVEL[tier],
      eligible: !!wallet && (mine.length > 0 || boost.level > 0), rival: guided ? "Apprentice Wisp" : RIVALS[crypto.randomInt(RIVALS.length)] };
    matches.set(id, m); saveLive();
    const sides = sidesOf(m);
    return { match: id, seed, sides, wild: wildOf(wildNs), rival: m.rival, tutorial: guided, own: mine.length, boost: boost.level ? boost : null,
      rank: prof ? { tier: prof.tier, tierIndex: tier } : null };
  }

  /* the match is over on the page: replay it here from the placements and decide */
  async function finish({ match, inputs } = {}) {
    const m = matches.get(String(match || ""));
    if (!m) return { error: "That match has ended. Start a new one.", gone: true };
    if (m.done) return { error: "That match has already been counted.", result: m.result };
    if (!Array.isArray(inputs) || inputs.length > 400) return { error: "Bad placements." };
    const clean = [];
    for (const i of inputs) {
      const t = Math.floor(Number(i && i.t)), slot = Math.floor(Number(i && i.slot)), x = Number(i && i.x), y = Number(i && i.y);
      if (!(t >= 0 && t < 100000 && slot >= 0 && slot < 4 && isFinite(x) && isFinite(y))) return { error: "Bad placements." };
      clean.push({ t, slot, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    }
    clean.sort((a, b) => a.t - b.t);
    // the replay, counting what you did as it goes (for the daily quests)
    const S = A.createMatch({ seed: m.seed, sides: sidesOf(m), wild: wildOf(m.wildNs) });
    const stats = { units: 0, spells: 0, epics: 0, legends: 0, own: 0 };
    const byTick = new Map(); for (const c of clean) { if (!byTick.has(c.t)) byTick.set(c.t, []); byTick.get(c.t).push(c); }
    const maxTicks = (A.MATCH_S + A.OVERTIME_S) * A.TICK + 5;
    for (let k = 0; k < maxTicks && !S.over; k++) {
      for (const inp of byTick.get(S.tick) || []) {
        const P = S.sides[0], def = P.deck[P.hand[inp.slot]];
        const err = A.place(S, 0, inp.slot, inp.x, inp.y);
        if (err) { m.done = true; saveLive(); return { error: "A placement at " + (S.tick / A.TICK).toFixed(1) + "s was not allowed: " + err }; }
        if (def.kind === "spell") { stats.spells++; if (def.epic) stats.epics++; }
        else { stats.units++; if (["Legendary", "Mythic", "Entity", "God", "Source"].includes(def.tier)) stats.legends++; if (def.own) stats.own++; }
      }
      A.step(S);
    }
    // it takes real time to play: a match can't be handed in faster than it could be played
    const playedFor = (Date.now() - m.at) / 1000;
    if (playedFor < S.time * 0.85 - 3) { m.done = true; saveLive(); return { error: "That match came back faster than it could be played." }; }
    m.done = true;
    const won = S.winner === 0, draw = S.winner == null;
    stats.towers = S.crowns[0]; stats.three = won && S.crowns[0] === 3 ? 1 : 0; stats.fastWins = won && S.time < 120 ? 1 : 0;
    const r = { won, draw, crowns: S.crowns.slice(), time: Math.round(S.time), tutorial: !!m.tutorial, wallet: m.wallet || null };
    // progress: the guided match pays xp but no stars; it can't be farmed, as only a first battle gets one
    if (m.pkey) r.progress = PROF.record(m.pkey, { won, draw, hinted: m.tutorial, stats });
    // the weekly board: signed-in holders only, still holding at the end, never the guided match
    if (won && m.wallet && m.eligible && !m.tutorial) {
      try {
        const h = await holdings(m.wallet);
        if (h.owned.length || h.boost.level > 0) r.board = score(m, S, h);
        else r.unscored = "moved";
      } catch { r.unscored = "chain"; }
    } else if (won && m.wallet && !m.eligible) r.unscored = "guest";
    m.result = r; saveLive();
    log(`arena: ${won ? "won" : draw ? "drew" : "lost"} ${S.crowns[0]}-${S.crowns[1]} in ${Math.round(S.time)}s${m.tutorial ? " (guided)" : ""}${m.wallet ? " (" + m.wallet.slice(0, 4) + ")" : ""}`);
    return { result: r };
  }

  function score(m, S, h) {
    const wk = weekKey(), day = dayKey();
    const week = boards.weeks[wk] = boards.weeks[wk] || {};
    const me = week[m.wallet] = week[m.wallet] || { points: 0, wins: 0, today: day, todayWins: 0 };
    // every being seen with each wallet this week, so a being passed round wallets shows up before any payout
    const seen = boards.seen[wk] = boards.seen[wk] || {};
    for (const n of h.owned.slice(0, 50)) { const l = seen[n] = seen[n] || []; if (!l.includes(m.wallet)) l.push(m.wallet); }
    if (me.today !== day) { me.today = day; me.todayWins = 0; }
    let pts = 0;
    if (me.todayWins < POINTS_PER_DAY) { pts = 10 + 5 * S.crowns[0]; me.todayWins++; me.wins++; me.points += pts; me.at = Date.now(); }
    saveBoard();
    return { points: pts, total: me.points, capped: !pts };
  }

  const short = w => w.slice(0, 4) + "…" + w.slice(-4);
  function board({ token } = {}) {
    const mine = walletOf(token), wk = weekKey();
    const rows = Object.entries(boards.weeks[wk] || {}).map(([w, r]) => ({ wallet: w, short: short(w), points: r.points, wins: r.wins, at: r.at || 0 }))
      .sort((a, b) => b.points - a.points || a.at - b.at);
    const i = rows.findIndex(r => r.wallet === mine);
    return { week: wk, top: rows.slice(0, 20).map(({ short, points, wins, wallet }) => ({ short, points, wins, you: wallet === mine })), you: i < 0 ? null : { rank: i + 1, points: rows[i].points } };
  }
  /* before any payout: wallets that played the same being this week */
  function audit(week = weekKey()) {
    const flagged = {};
    for (const [n, ws] of Object.entries(boards.seen[week] || {})) if (ws.length > 1) for (const w of ws) (flagged[w] = flagged[w] || []).push(`being #${n} also with ${ws.filter(x => x !== w).map(short).join(", ")}`);
    return flagged;
  }

  return { start, finish, me, board, audit, live: () => matches.size, flush: () => { liveFile && liveFile.flush(); boardFile && boardFile.flush(); PROF.flush(); } };
}

module.exports = { create, QUESTS, RIVAL_LEVEL };
