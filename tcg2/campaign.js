/* ============================================================
   REALM card battler — the campaign.

   Nine realms, one per tier, each a few levels and a boss. Gods are the
   bosses; the Source waits at the end. Only realm 1 is open in this beta.
   Every rival is fixed, so a level plays the same for everyone; only the
   shuffle and your borrowed spirits change.
   ============================================================ */
"use strict";

/* the tutorial: you go first with a hand that teaches, the rival is small */
// a gentle deck: small spirits, a little healing, nothing that wipes your side
const GENTLE = ["s-wisp", "s-root", "s-wisp", "r-halo", "s-moth", "s-root", "s-wisp", "s-scribe", "r-ward", "s-moth", "s-wisp", "s-root", "r-halo", "s-scribe", "s-wisp", "s-root", "s-moth", "r-ward", "s-wisp", "s-scribe", "s-root", "s-wisp", "r-halo", "s-moth", "s-wisp", "s-root", "s-scribe", "s-wisp", "s-root", "s-moth"];

const TUTORIAL = {
  id: "tutorial", name: "First Steps", realm: 0,
  you: { deck: ["s-wisp", "r-strike", "s-hound", "s-root", "s-moth", "r-halo", "s-scribe", "s-halo", "r-ward", "s-lurker", "r-aura", "s-hound", "r-nova", "s-wisp", "r-geo", "s-root", "r-eclipse", "s-moth", "r-strike", "s-lurker", "r-dust", "s-scribe", "s-halo", "r-halo", "r-ward", "r-aura", "r-nova", "r-geo", "r-eclipse", "r-dust"],
         champions: [36, 16, 2] },
  rival: { name: "Spore Sprite", champions: [4], life: 8, deck: GENTLE },
  first: 0,
};

/* Quick Play: one tap, about three minutes. Both sides get three borrowed
   spirits at random and a little less life, so it moves fast. */
const QUICK = {
  // the rival is a touch weaker, so a good player wins about two in three
  id: "quick", name: "Quick Play", realm: 0, life: 14, rivalLife: 12, rivalScale: 0.8,
  pool: { Common: 40, Uncommon: 30, Rare: 20, Epic: 10 },
  rivals: ["Spore Drifter", "Moth Caller", "Root Wanderer", "Star Scribe", "Lantern Eye", "Dust Walker", "Tide Singer", "Hollow Knight", "Ember Twin", "Veil Weaver"],
};

/* The daily challenge: the same game for everyone each day. The day picks
   your three spirits, the rival's three and the shuffle; best score counts. */
const DAILY = { id: "daily", name: "Daily Challenge", realm: 0, life: 14, rivalLife: 14, rivalScale: 0.9 };
const DAILY_POOL = ["Common", "Uncommon", "Uncommon", "Rare", "Rare", "Epic"];
function dailyOf(day, byTier) {
  let h = 2166136261;
  for (const ch of "realm-daily-" + day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const next = () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h / 4294967296; };
  const pick = (taken) => { for (;;) { const t = DAILY_POOL[Math.floor(next() * DAILY_POOL.length)], l = byTier[t], n = l[Math.floor(next() * l.length)]; if (!taken.includes(n)) return n; } };
  const you = [], rival = [];
  while (you.length < 3) you.push(pick(you));
  while (rival.length < 3) rival.push(pick([...you, ...rival]));
  const names = ["The Gatekeeper", "The Lantern", "The Weaver", "The Tide", "The Hollow", "The Ember", "The Veil"];
  return { you, rival, seed: h >>> 0, first: next() < 0.5 ? 0 : 1, rivalName: names[Math.floor(next() * names.length)] };
}

const REALMS = [
  { id: 1, name: "The Spore Fields", tier: "Common", blurb: "Where every being starts: a field of small, strange mushrooms that do not like visitors.",
    levels: [
      { id: "1-1", name: "First Spores",   rival: { name: "Spore Sprite",  champions: [4], life: 10, deck: GENTLE } },
      { id: "1-2", name: "The Ring",       rival: { name: "Ring Keeper",   champions: [33, 36], life: 11 } },
      { id: "1-3", name: "Mycelium",       rival: { name: "Thread Weaver", champions: [16, 61, 76], life: 11 } },
      { id: "1-4", name: "Rot Garden",     rival: { name: "Rot Gardener",  champions: [39, 107, 3], life: 23 } },
      { id: "1-5", name: "The Root Crown", boss: true, rival: { name: "Root Crown", champions: [842, 25, 2], life: 20, scale: 0.75 } },
    ] },
  // realms 2 to 9 open in the next phase
];

/* who you can be dealt, for each realm: borrowed spirits, mostly of its tier */
const POOL = { 1: { Common: 60, Uncommon: 30, Rare: 10 } };
const BORROWED_SCALE = 0.9;

const LEVELS = new Map([[TUTORIAL.id, TUTORIAL], [QUICK.id, QUICK], [DAILY.id, DAILY], ...REALMS.flatMap(r => r.levels.map(l => [l.id, { ...l, realm: r.id }]))]);

/* stars: win; win with half your life or more; win quickly */
function stars(S, me, level) {
  if (S.winner !== me || !level || !level.levels && ["quick", "tutorial", "daily"].includes(level.id)) return S.winner === me ? 1 : 0;
  const P = S.players[me];
  let n = 1;
  if (P.life * 2 >= P.startLife) n++;
  if (S.turn <= 16) n++;
  return n;
}

/* experience for a match: decided here, so it can't be made up on the page */
function xp(won, starsWon, level) {
  if (level.id === "tutorial") return won ? 150 : 50;
  let n = won ? 100 : 35;
  if (won && !["quick", "daily"].includes(level.id)) n += starsWon * 20;
  if (level.id === "daily") n += won ? 50 : 0;
  if (won && level.boss) n += 100;
  return n;
}

module.exports = { TUTORIAL, QUICK, DAILY, dailyOf, REALMS, LEVELS, POOL, BORROWED_SCALE, stars, xp };
