/* ============================================================
   REALM Cards — your progress: rank, level, streak, daily quests.

   Kept on the server and changed only by matches the server itself played
   to the end, so none of it can be faked from a page. A signed-in wallet is
   its own profile; a guest gets a random profile id kept on their device.
   ============================================================ */
"use strict";
const crypto = require("crypto"), path = require("path");

const TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Mythic"];
const STARS = 5;                                   // stars to climb out of each tier
// how well the computer plays at each tier (0 = makes mistakes, 1 = its best)
const LEVEL_AT = [0.1, 0.3, 0.5, 0.7, 0.88, 1];
const XP_WIN = 30, XP_LOSS = 12, XP_FIRST_WIN = 40, MAX_PROFILES = 200000;
const xpForLevel = l => 60 + l * 20;               // xp from level l to l+1

/* the daily quests: three a day, the same three for you all day */
const QUESTS = [
  { id: "win1",    text: "Win a game",                       stat: "wins",     n: 1,  xp: 40 },
  { id: "win3",    text: "Win 3 games",                      stat: "wins",     n: 3,  xp: 90 },
  { id: "play3",   text: "Play 3 games",                     stat: "games",    n: 3,  xp: 50 },
  { id: "beings",  text: "Summon 12 beings",                 stat: "beings",   n: 12, xp: 50 },
  { id: "spells",  text: "Cast 8 spells",                    stat: "spells",   n: 8,  xp: 50 },
  { id: "face",    text: "Deal 50 damage to your rivals",    stat: "face",     n: 50, xp: 60 },
  { id: "kills",   text: "Destroy 10 enemy beings",          stat: "kills",    n: 10, xp: 60 },
  { id: "big",     text: "Play 3 cards that cost 6 or more", stat: "big",      n: 3,  xp: 60 },
  { id: "flyers",  text: "Summon 5 beings with Flying",      stat: "flyers",   n: 5,  xp: 50 },
  { id: "fast",    text: "Win a game in 14 turns or fewer",  stat: "fastWins", n: 1,  xp: 70 },
];
const QUEST = Object.fromEntries(QUESTS.map(q => [q.id, q]));
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
function questsFor(key, day) {
  const h = crypto.createHash("sha256").update(key + "|" + day).digest();
  const pool = QUESTS.slice(), out = [];
  for (let i = 0; out.length < 3; i++) out.push(pool.splice(h[i] % pool.length, 1)[0].id);
  return out;
}

function create({ dir = null, log = () => {} } = {}) {
  const jf = dir ? require("../jsonfile").create(path.join(dir, "rc-profiles.json"), { log: m => log("rc profiles: " + m), fallback: {} }) : null;
  let all = jf ? jf.load() || {} : {};
  const save = () => {
    if (!jf) return;
    jf.save(() => {
      const keys = Object.keys(all);
      if (keys.length > MAX_PROFILES) keys.sort((a, b) => (all[a].seen || 0) - (all[b].seen || 0)).slice(0, keys.length - MAX_PROFILES).forEach(k => delete all[k]);
      return all;
    });
  };
  const fresh = () => ({ xp: 0, level: 1, tier: 0, stars: 0, streak: 0, best: 0, wins: 0, games: 0, day: null, dayStats: {}, quests: [], done: [], firstWin: null, seen: Date.now() });
  function get(key) {
    let p = all[key];
    if (!p) p = all[key] = fresh();
    const today = dayKey();
    if (p.day !== today) { p.day = today; p.dayStats = {}; p.quests = questsFor(key, today); p.done = []; }
    return p;
  }
  const isGuest = id => typeof id === "string" && /^[0-9a-f]{32}$/.test(id);
  const newGuest = () => crypto.randomBytes(16).toString("hex");
  const levelOf = p => LEVEL_AT[Math.min(p.tier, TIERS.length - 1)];

  /* what the page shows */
  function view(key) {
    // looking never creates a profile: only a finished match does
    const p = key && all[key] ? get(key) : { ...fresh(), day: dayKey(), quests: questsFor(String(key), dayKey()) };
    return { level: p.level, xp: p.xp, next: xpForLevel(p.level), tier: TIERS[p.tier], tierIndex: p.tier, stars: p.stars, maxStars: STARS, streak: p.streak, best: p.best,
      wins: p.wins, games: p.games, firstWinReady: p.firstWin !== p.day,
      quests: p.quests.map(id => ({ id, text: QUEST[id].text, n: QUEST[id].n, at: Math.min(QUEST[id].n, p.dayStats[QUEST[id].stat] || 0), xp: QUEST[id].xp, done: p.done.includes(id) })) };
  }

  /* a finished match: { won, draw, turns, hinted, stats: { beings, spells, face, kills, big, flyers } } */
  function record(key, r) {
    const p = get(key), before = view(key);
    p.seen = Date.now(); p.games++;
    const won = !!r.won;
    let xp = won ? XP_WIN : XP_LOSS;
    const bonus = [];
    if (won) {
      p.wins++; p.streak++; p.best = Math.max(p.best, p.streak);
      if (p.firstWin !== p.day) { p.firstWin = p.day; xp += XP_FIRST_WIN; bonus.push({ what: "First win of the day", xp: XP_FIRST_WIN }); }
      if (p.streak >= 3) { const s = Math.min(30, 5 * p.streak); xp += s; bonus.push({ what: `${p.streak} wins in a row`, xp: s }); }
    } else if (!r.draw) p.streak = 0;
    // rank: a win climbs a star (two on a streak of 3+). From Gold up a loss drops one; you never fall out of a tier you've reached
    let starsMoved = 0;
    if (!r.hinted && !r.draw && p.tier < TIERS.length - 1) {
      if (won) starsMoved = p.streak >= 3 ? 2 : 1;
      else if (p.tier >= 2 && p.stars > 0) starsMoved = -1;
      p.stars += starsMoved;
      while (p.stars >= STARS && p.tier < TIERS.length - 1) { p.stars -= STARS; p.tier++; }
      if (p.tier === TIERS.length - 1) p.stars = 0;
    }
    // the day's quests
    const st = p.dayStats, add = (k, n) => { if (n > 0) st[k] = (st[k] || 0) + n; };
    add("games", 1); if (won) add("wins", 1); if (won && r.turns <= 14) add("fastWins", 1);
    for (const k of ["beings", "spells", "face", "kills", "big", "flyers"]) add(k, Math.max(0, Math.floor((r.stats || {})[k] || 0)));
    const completed = [];
    for (const id of p.quests) { const q = QUEST[id]; if (!p.done.includes(id) && (st[q.stat] || 0) >= q.n) { p.done.push(id); xp += q.xp; completed.push({ id, text: q.text, xp: q.xp }); } }
    // xp and levels
    p.xp += xp;
    let levelUps = 0;
    while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; levelUps++; }
    save();
    const after = view(key);
    return { xp, bonus, completed, levelUps, starsMoved, rankUp: after.tierIndex > before.tierIndex, before, after };
  }

  return { get, view, record, levelOf, isGuest, newGuest, flush: () => jf && jf.flush(), _all: () => all };
}

module.exports = { create, TIERS, STARS, LEVEL_AT, QUESTS, questsFor, xpForLevel };
