/* ============================================================
   REALM Duels — the game, decided on the server.

   Every being is a card with three stats, POWER, SPIRIT and SPEED. Its
   tier sets how many points it has in all; its number and its traits set
   how they are split (Supernova and Geometry lean to Power, Aura, Planets
   and Mushrooms to Spirit, Lightning and UFOs to Speed). The same being
   always has the same stats.

   A duel: three cards a side, three rounds. Each round both sides commit
   a card unseen, then the caller names the stat and the higher number
   takes the round (a tie goes to the higher total). The player calls in
   rounds 1 and 3, the rival in round 2. Most rounds wins the duel.

   A run: duel after duel against rival teams that grow rarer each stage,
   until the first loss. A wallet's best run of the week is its place on
   the board. A wallet plays with beings it holds; anyone else plays with
   three borrowed spirits, weaker, and off the board.

   The rival's card is chosen before it knows the player's, so nothing is
   rigged; every number is decided here, so no score can be typed in.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
const TOTAL = { Common: 150, Uncommon: 172, Rare: 195, Epic: 218, Legendary: 242, Mythic: 266, Entity: 292, God: 320, Source: 370 };
const LEAN = { Supernova: 0, Geometry: 0, Aura: 1, Planets: 1, Mushrooms: 1, "Moon Dust": 1, Lightning: 2, UFOs: 2, Trees: 1 };
const STATS = ["power", "spirit", "speed"];
const BORROWED = 0.8;                      // a borrowed spirit has 80% of a real being's stats

function rand(seed) {                      // a small seeded generator, so a being's stats never change
  let h = crypto.createHash("sha256").update(String(seed)).digest(), i = 0;
  return () => { if (i > 28) { h = crypto.createHash("sha256").update(h).digest(); i = 0; } const v = h.readUInt32LE(i); i += 4; return v / 2 ** 32; };
}

function create({ root, beings, envVar, log = console.log }) {
  const MAP = JSON.parse(fs.readFileSync(path.join(root, "map-data.json"))).beings;     // [tier, being, traits]
  const ART = JSON.parse(fs.readFileSync(path.join(root, "art-ids.json")));            // image id for each number
  const RANK = JSON.parse(fs.readFileSync(path.join(root, "rarity.json")));
  const byTier = {}; MAP.forEach((m, i) => (byTier[m[0]] = byTier[m[0]] || []).push(i + 1));

  function card(n, scale = 1) {
    const [tier, being, traits = {}] = MAP[n - 1];
    const r = rand("realm-duel-" + n), w = [0.7 + 0.6 * r(), 0.7 + 0.6 * r(), 0.7 + 0.6 * r()];
    for (const [k, v] of Object.entries(traits)) if (v && v !== "None" && LEAN[k] != null) w[LEAN[k]] += 0.22;
    const sum = w[0] + w[1] + w[2], t = TOTAL[tier] * scale;
    const s = w.map(x => Math.max(8, Math.round(t * x / sum)));
    return { n, tier, being, rank: RANK[String(n)] || null, img: "/img/" + ART[n - 1], power: s[0], spirit: s[1], speed: s[2], total: s[0] + s[1] + s[2], borrowed: scale < 1 };
  }

  /* ---------- the board, a week at a time ---------- */
  const dir = envVar("SNAPSHOT_DIR") || path.join(root, "snapshot-data");
  const file = path.join(dir, "duels.json");
  let board = {};
  try { board = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const week = (d = new Date()) => {                                // the Monday 00:00 UTC that starts this week
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m.toISOString().slice(0, 10);
  };
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => {
    try { const keep = Object.keys(board).sort().slice(-6); const b = {}; keep.forEach(k => b[k] = board[k]); board = b;
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(board)); } catch (e) { log("duels: could not save the board: " + e.message); }
  }, 2000); };
  function record(run) {
    if (!run.wallet || run.stage < 1) return;
    const wk = week(), b = board[wk] = board[wk] || {};
    const prev = b[run.wallet];
    if (!prev || run.stage > prev.stage || (run.stage === prev.stage && run.score > prev.score))
      b[run.wallet] = { stage: run.stage, score: run.score, team: run.team.map(c => c.n), at: Date.now() };
    b[run.wallet].runs = ((prev && prev.runs) || 0) + 1;
    save();
  }
  function top(wk = week(), limit = 25) {
    const b = board[wk] || {};
    return Object.entries(b).map(([wallet, r]) => ({ wallet, ...r }))
      .sort((x, y) => y.stage - x.stage || y.score - x.score || x.at - y.at).slice(0, limit);
  }

  /* ---------- runs ---------- */
  const runs = new Map();
  const sweep = () => { const now = Date.now(); for (const [k, r] of runs) if (now - r.touched > 30 * 60_000) runs.delete(k); };

  function rivalTeam(stage, seed) {
    // the rival's tier climbs with the stage; one card in three may be a step rarer
    const r = rand(seed), base = Math.min(TIERS.length - 2, Math.floor((stage - 1) / 2));
    const team = [];
    while (team.length < 3) {
      const t = TIERS[Math.min(TIERS.length - 2, base + (r() < 0.33 ? 1 : 0))];
      const pool = byTier[t], n = pool[Math.floor(r() * pool.length)];
      if (!team.includes(n)) team.push(n);
    }
    return team.map(n => card(n));
  }

  function newDuel(run) {
    run.stage += 1;
    run.rival = rivalTeam(run.stage, run.id + ":" + run.stage);
    run.round = 1; run.wins = 0; run.losses = 0; run.used = []; run.rivalUsed = []; run.log = [];
  }

  async function start({ wallet, team }) {
    sweep();
    let cards;
    if (wallet) {
      const mine = (await beings()).filter(b => b.owner === wallet).map(b => b.n);
      if (!mine.length) return { error: "This wallet holds no beings yet. Play with borrowed spirits, or mint at dmt-realm.dev/mint." };
      const pick = (team || []).map(Number).filter(n => mine.includes(n));
      if (new Set(pick).size !== 3 && mine.length >= 3) return { error: "Pick three of your own beings." };
      cards = (mine.length < 3 ? [...new Set([...pick, ...mine])] : [...new Set(pick)]).slice(0, 3).map(n => card(n));
      // fewer than three beings: the rest of the team is borrowed
      const r = rand(wallet + Date.now());
      while (cards.length < 3) { const n = byTier.Common[Math.floor(r() * byTier.Common.length)]; if (!cards.some(c => c.n === n)) cards.push(card(n, BORROWED)); }
    } else {
      const r = rand("guest" + Date.now() + Math.random());
      const pool = [...byTier.Common, ...byTier.Uncommon]; cards = [];
      while (cards.length < 3) { const n = pool[Math.floor(r() * pool.length)]; if (!cards.some(c => c.n === n)) cards.push(card(n, BORROWED)); }
    }
    const run = { id: crypto.randomBytes(12).toString("hex"), wallet: wallet || null, team: cards, stage: 0, score: 0, over: false, touched: Date.now() };
    newDuel(run); runs.set(run.id, run);
    return view(run);
  }

  function view(run, extra = {}) {
    return { run: run.id, wallet: run.wallet, team: run.team, stage: run.stage, score: run.score, over: run.over,
      round: run.round, wins: run.wins, losses: run.losses, used: run.used, caller: run.round === 2 ? "rival" : "you",
      rival: run.rival.map((c, i) => run.rivalUsed.includes(i) ? c : { hidden: true, tier: c.tier }), log: run.log, ...extra };
  }

  function play({ run: id, card: ci, stat }) {
    const run = runs.get(id);
    if (!run) return { error: "That duel has ended. Start a new run." };
    if (run.over) return { error: "This run is over." };
    run.touched = Date.now();
    ci = Number(ci);
    if (!(ci >= 0 && ci < 3) || run.used.includes(ci)) return { error: "Pick a card you have not played yet." };
    const youCall = run.round !== 2;
    if (youCall && !STATS.includes(stat)) return { error: "Name a stat: power, spirit or speed." };
    const mine = run.team[ci];

    // the rival commits its card without seeing yours: its strongest left, more often than not
    const r = rand(run.id + ":" + run.stage + ":" + run.round);
    const left = [0, 1, 2].filter(i => !run.rivalUsed.includes(i));
    let ri = left[Math.floor(r() * left.length)];
    if (r() < 0.6) ri = left.reduce((a, b) => run.rival[b].total > run.rival[a].total ? b : a);
    const theirs = run.rival[ri];
    if (!youCall) stat = STATS.reduce((a, b) => theirs[b] > theirs[a] ? b : a);    // the rival calls its best

    let won = mine[stat] > theirs[stat] || (mine[stat] === theirs[stat] && mine.total >= theirs.total);
    run.used.push(ci); run.rivalUsed.push(ri);
    if (won) run.wins++; else run.losses++;
    const margin = Math.abs(mine[stat] - theirs[stat]);
    run.log.push({ round: run.round, caller: youCall ? "you" : "rival", stat, you: mine.n, rival: theirs.n, yours: mine[stat], theirs: theirs[stat], won });
    if (won) run.score += 10 + Math.min(20, margin);

    let result = null;
    if (run.wins === 2 || run.losses === 2 || run.round === 3) {
      if (run.wins > run.losses) {
        result = "won"; run.score += 50 * run.stage;
        record(run);
        const out = view(run, { result, last: run.log[run.log.length - 1] });
        newDuel(run);
        out.next = view(run);
        return out;
      }
      result = "lost"; run.over = true; run.stage -= 1;   // the stage reached is the last one won
      record(run);
      return view(run, { result, last: run.log[run.log.length - 1], best: run.wallet ? (board[week()] || {})[run.wallet] : null });
    }
    run.round += 1;
    return view(run, { last: run.log[run.log.length - 1] });
  }

  return { start, play, card, top, week, runs: () => runs.size };
}

module.exports = { create, TOTAL };
