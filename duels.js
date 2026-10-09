/* ============================================================
   REALM Duels — the game, decided on the server.

   Every being is a card with five stats: MAGIC, SPIRIT, KNOWLEDGE, LIGHT
   and DARK. Its tier sets how many points it has in all; its number and
   its traits set how they are split (mushrooms, moon dust and lightning
   lean to Magic; trees and warm or rose auras to Spirit; geometry, planets
   and UFOs to Knowledge; supernovas and bright colourways to Light; dark
   colourways and opposed auras to Dark). The same being always has the
   same stats.

   A duel: three cards a side, three rounds. Each round both sides commit
   a card unseen, then the caller names the stat and the higher number
   takes the round (a tie goes to the higher total). The player calls in
   rounds 1 and 3, the rival in round 2. Most rounds wins the duel.

   A run: duel after duel against rival teams that grow rarer each stage,
   until the first loss. A wallet holding $DMT plays stronger: +3% to every
   stat a $DMT band (50K, 250K, 1M, 5M, 10M), up to +15%, on its own beings
   and on borrowed spirits alike. A wallet with $DMT but no beings plays
   boosted borrowed spirits and goes on the board. Every round the player is dealt a fresh hand of
   three and plays one. A wallet's best run of the week is its place on
   the board. A wallet is dealt from the beings it holds; anyone else is
   dealt borrowed spirits drawn from all 1,111 at random, weaker, and off
   the board.

   The rival's card is chosen before it knows the player's, so nothing is
   rigged; every number is decided here, so no score can be typed in.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
const TOTAL = { Common: 250, Uncommon: 287, Rare: 325, Epic: 363, Legendary: 403, Mythic: 443, Entity: 487, God: 533, Source: 617 };
const STATS = ["magic", "spirit", "knowledge", "light", "dark"];
const M = 0, S = 1, K = 2, L = 3, D = 4;
// which stat each trait leans a being towards
const LEAN = { Mushrooms: M, "Moon Dust": M, Lightning: M, Trees: S, Geometry: K, Planets: K, UFOs: K, Supernova: L };
const AURA = { Rose: S, Warm: S, Cold: K, Acid: M, Opposed: D };
const COLOUR = { Auric: L, Regalia: L, Bloom: L, Coral: L, Solar: L, "Prime Gold": L, Celestial: L, Prism: L, Glacier: L, "Rose Quartz": L,
  Abyss: D, Ossuary: D, Eclipse: D, Obsidian: D, "Blood Moon": D, Ichor: D, Ultraviolet: D, Nebula: D,
  Verdant: S, Moss: S, Jade: S, Amethyst: S, Furnace: M, Molten: M, Sapphire: K };
const BORROWED = 0.8;                       // a borrowed spirit has 80% of a real being's stats
const BOOST_PER_LEVEL = 0.03;               // +3% a $DMT band, up to +15% at 10M

function rand(seed) {                      // a small seeded generator, so a being's stats never change
  let h = crypto.createHash("sha256").update(String(seed)).digest(), i = 0;
  return () => { if (i > 28) { h = crypto.createHash("sha256").update(h).digest(); i = 0; } const v = h.readUInt32LE(i); i += 4; return v / 2 ** 32; };
}

function create({ root, beings, envVar, tokensOf = async () => 0, bands = [], log = console.log }) {
  const MAP = JSON.parse(fs.readFileSync(path.join(root, "map-data.json"))).beings;     // [tier, being, traits]
  const ART = JSON.parse(fs.readFileSync(path.join(root, "art-ids.json")));            // image id for each number
  const RANK = JSON.parse(fs.readFileSync(path.join(root, "rarity.json")));
  const byTier = {}; MAP.forEach((m, i) => (byTier[m[0]] = byTier[m[0]] || []).push(i + 1));

  function card(n, scale = 1) {
    const [tier, being, traits = {}] = MAP[n - 1];
    const r = rand("realm-duel-" + n), w = STATS.map(() => 0.7 + 0.6 * r());
    for (const [k, v] of Object.entries(traits)) if (v && v !== "None" && LEAN[k] != null) w[LEAN[k]] += 0.3;
    if (AURA[traits.Aura] != null) w[AURA[traits.Aura]] += 0.3;
    if (COLOUR[traits.Colourway] != null) w[COLOUR[traits.Colourway]] += 0.4;
    const sum = w.reduce((a, b) => a + b, 0), t = TOTAL[tier] * scale;
    const c = { n, tier, being, rank: RANK[String(n)] || null, img: "/img/" + ART[n - 1], borrowed: scale < 1 };
    STATS.forEach((k, i) => { c[k] = Math.max(8, Math.round(t * w[i] / sum)); });
    c.total = STATS.reduce((a, k) => a + c[k], 0);
    return c;
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
      b[run.wallet] = { stage: run.stage, score: run.score, team: run.team.map(c => c.n), level: run.level || 0, at: Date.now() };
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

  /* a fresh hand every round: three of the wallet's own beings at random
     (topped up with borrowed spirits if it holds fewer), or for a guest any
     three of all 1,111 */
  function deal(run) {
    const pickFrom = (pool, k, avoid = []) => { const out = [], left = pool.filter(n => !avoid.includes(n));
      while (out.length < k && left.length) out.push(left.splice(crypto.randomInt(left.length), 1)[0]); return out; };
    const prev = (run.team || []).map(c => c.n);
    let own = [];
    if (run.deck) {
      // with more than three to choose from, never the same three twice running
      own = pickFrom(run.deck, Math.min(3, run.deck.length));
      for (let t = 0; t < 5 && run.deck.length > 3 && own.every(n => prev.includes(n)); t++) own = pickFrom(run.deck, 3);
    }
    const hand = own.map(n => blessed(card(n, run.boost || 1), run));
    // borrowed spirits fill the rest; $DMT boosts them too, so the token counts even without a being
    while (hand.length < 3) { const n = 1 + crypto.randomInt(MAP.length); if (!hand.some(c => c.n === n)) hand.push(blessed(card(n, BORROWED * (run.boost || 1)), run)); }
    run.team = hand;
  }

  function newDuel(run) {
    run.stage += 1;
    deal(run);
    run.rival = rivalTeam(run.stage, run.id + ":" + run.stage);
    run.round = 1; run.wins = 0; run.losses = 0; run.used = []; run.rivalUsed = []; run.log = [];
  }

  /* the $DMT boost: a wallet holding beings and $DMT plays them stronger, by the holder pool's bands */
  async function boostOf(wallet) {
    if (!wallet) return { level: 0, tokens: 0, boost: 1 };
    const tokens = await tokensOf(wallet).catch(() => 0);
    const level = bands.filter(b => b.hold > 0 && tokens >= b.hold).length;
    return { level, tokens, boost: 1 + BOOST_PER_LEVEL * level };
  }
  const blessed = (c, run) => run.boost > 1 ? { ...c, boost: Math.round((run.boost - 1) * 100) } : c;

  async function start({ wallet }) {
    sweep();
    let deck = null;
    const b = await boostOf(wallet);
    if (wallet) {
      deck = (await beings()).filter(b => b.owner === wallet).map(b => b.n);
      // no beings: a wallet holding $DMT still plays, with boosted borrowed spirits, and goes on the board
      if (!deck.length && !b.level) return { error: "This wallet holds no beings and no $DMT yet. Play with borrowed spirits, mint a being, or hold 50K $DMT for the boost." };
      if (!deck.length) deck = null;
    }
    const run = { id: crypto.randomBytes(12).toString("hex"), wallet: wallet || null, deck, team: null, stage: 0, score: 0, over: false, touched: Date.now(), boost: b.boost, level: b.level };
    newDuel(run); runs.set(run.id, run);
    return view(run);
  }

  function view(run, extra = {}) {
    return { run: run.id, wallet: run.wallet, level: run.level || 0, boostPct: Math.round(((run.boost || 1) - 1) * 100), team: run.team, stage: run.stage, score: run.score, over: run.over,
      round: run.round, wins: run.wins, losses: run.losses, used: run.used, caller: run.round === 2 ? "rival" : "you",
      rival: run.rival.map((c, i) => run.rivalUsed.includes(i) ? c : { hidden: true, tier: c.tier }), log: run.log, ...extra };
  }

  function play({ run: id, card: ci, stat }) {
    const run = runs.get(id);
    if (!run) return { error: "That duel has ended. Start a new run." };
    if (run.over) return { error: "This run is over." };
    run.touched = Date.now();
    ci = Number(ci);
    if (!(ci >= 0 && ci < 3)) return { error: "Pick one of the three cards in your hand." };
    const youCall = run.round !== 2;
    if (youCall && !STATS.includes(stat)) return { error: "Name a stat: magic, spirit, knowledge, light or dark." };
    const mine = run.team[ci];

    // the rival commits its card without seeing yours: its strongest left, more often than not
    const r = rand(run.id + ":" + run.stage + ":" + run.round);
    const left = [0, 1, 2].filter(i => !run.rivalUsed.includes(i));
    let ri = left[Math.floor(r() * left.length)];
    if (r() < 0.6) ri = left.reduce((a, b) => run.rival[b].total > run.rival[a].total ? b : a);
    const theirs = run.rival[ri];
    if (!youCall) stat = STATS.reduce((a, b) => theirs[b] > theirs[a] ? b : a);    // the rival calls its best

    let won = mine[stat] > theirs[stat] || (mine[stat] === theirs[stat] && mine.total >= theirs.total);
    run.rivalUsed.push(ri);
    if (won) run.wins++; else run.losses++;
    const margin = Math.abs(mine[stat] - theirs[stat]);
    run.log.push({ round: run.round, caller: youCall ? "you" : "rival", stat, you: mine.n, rival: theirs.n, yours: mine[stat], theirs: theirs[stat], won });
    if (won) run.score += 10 + Math.min(20, margin);

    let result = null;
    if (run.wins === 2 || run.losses === 2 || run.round === 3) {
      if (run.wins > run.losses) {
        result = "won"; run.score += 50 * run.stage;
        record(run);
        const out = view(run, { result, last: run.log[run.log.length - 1], played: mine });
        newDuel(run);
        out.next = view(run);
        return out;
      }
      result = "lost"; run.over = true; run.stage -= 1;   // the stage reached is the last one won
      record(run);
      return view(run, { result, last: run.log[run.log.length - 1], played: mine, best: run.wallet ? (board[week()] || {})[run.wallet] : null });
    }
    run.round += 1;
    const played = mine;
    deal(run);                                   // a fresh hand for the next round
    return view(run, { last: run.log[run.log.length - 1], played });
  }

  return { start, play, card, top, week, boostOf, runs: () => runs.size };
}

module.exports = { create, TOTAL };
