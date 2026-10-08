/* ============================================================
   REALM: The Card Game — kept simple, decided on the server.

   Three champions a side. A champion has two numbers: HP (40% of its
   five stats added up) and Attack (10%), so rarer beings have more of
   both. Each turn you do one thing: attack with one of your champions,
   or play one of the three spells in your hand (a played spell is
   replaced at once). Then the rival does one thing. Knock out all three
   rival champions to win.

   A wallet that holds beings and $DMT is blessed, by the holder pool's
   $DMT bands: +3% champion HP and Attack a level, up to +15%.

   A wallet's wins this week are its place on the board. Anyone without
   beings plays with three borrowed spirits, weaker, and off the board.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
const MAX_TURNS = 60;

function create({ root, card, beings, tokensOf, bands, envVar, log = console.log }) {
  const SET = JSON.parse(fs.readFileSync(path.join(root, "tcg-cards.json")));
  const SP = Object.fromEntries(SET.spells.map(s => [s.id, s]));
  const MAP = JSON.parse(fs.readFileSync(path.join(root, "map-data.json"))).beings;
  const byTier = {}; MAP.forEach((m, i) => (byTier[m[0]] = byTier[m[0]] || []).push(i + 1));
  const rnd = n => crypto.randomInt(n);
  const deal = () => SET.spells[rnd(SET.spells.length)].id;

  async function blessing(wallet) {
    if (!wallet) return { level: 0, tokens: 0, boost: 1 };
    const tokens = await tokensOf(wallet).catch(() => 0);
    const level = bands.filter(b => b.hold > 0 && tokens >= b.hold).length;
    return { level, tokens, boost: 1 + SET.blessing.perLevel * level };
  }

  function champ(n, scale, boost) {
    const c = card(n, scale);
    const hp = Math.round(c.total * SET.champion.hpOfTotal * boost);
    return { n, tier: c.tier, being: c.being, img: c.img, borrowed: c.borrowed, hp, maxHp: hp, atk: Math.round(c.total * SET.champion.attackOfTotal * boost), block: false };
  }
  const alive = s => s.champs.filter(c => c.hp > 0);
  const name = c => (c.being && !/\d$/.test(c.being) ? c.being : c.tier) + " #" + c.n;

  const matches = new Map();
  const sweep = () => { const now = Date.now(); for (const [k, m] of matches) if (now - m.touched > 45 * 60_000) matches.delete(k); };

  async function start({ wallet, champions }) {
    sweep();
    let mine = [], bless = { level: 0, tokens: 0, boost: 1 };
    if (wallet) {
      const own = (await beings()).filter(b => b.owner === wallet).map(b => b.n);
      if (!own.length) return { error: "This wallet holds no beings yet. Play with borrowed spirits, or mint at dmt-realm.dev/mint." };
      const pick = [...new Set((champions || []).map(Number).filter(n => own.includes(n)))].slice(0, 3);
      mine = pick.length ? pick : own.map(n => card(n)).sort((a, b) => b.total - a.total).slice(0, 3).map(c => c.n);
      bless = await blessing(wallet);
    }
    const you = mine.map(n => champ(n, 1, bless.boost));
    while (you.length < 3) { const n = 1 + rnd(MAP.length); if (!you.some(c => c.n === n)) you.push(champ(n, 0.8, bless.boost)); }
    // the rival: near your team's strength, a tier either side
    const avg = Math.round(you.reduce((a, c) => a + TIERS.indexOf(c.tier), 0) / 3);
    const foe = [];
    while (foe.length < 3) {
      const t = TIERS[Math.max(0, Math.min(7, avg - 1 + rnd(3)))], pool = byTier[t], n = pool[rnd(pool.length)];
      // borrowed spirits face rivals as faint as they are, so a first game is still winnable
      if (!foe.some(c => c.n === n) && !you.some(c => c.n === n)) foe.push(champ(n, wallet ? 1 : 0.8, 1));
    }
    const m = { id: crypto.randomBytes(12).toString("hex"), wallet: wallet || null, turn: 1, over: false, winner: null, touched: Date.now(), log: ["Your move."],
      you: { champs: you, hand: [deal(), deal(), deal()], bless }, rival: { champs: foe, hand: [deal(), deal(), deal()], bless: { level: 0, boost: 1 } } };
    matches.set(m.id, m);
    return view(m);
  }

  /* ---------- the two kinds of move ---------- */
  function hit(m, target, dmg, by) {
    if (target.block) { target.block = false; m.log.push(`${by}: ${name(target)} blocks it.`); return; }
    target.hp = Math.max(0, target.hp - dmg);
    m.log.push(`${by}: ${dmg} damage to ${name(target)}${target.hp === 0 ? ". Knocked out!" : "."}`);
  }
  function attack(m, me, foe, ai, ti, who) {
    const a = me.champs[ai], t = foe.champs[ti];
    if (!a || a.hp <= 0) return "Pick one of your champions to attack with.";
    if (!t || t.hp <= 0) return "Pick an enemy to attack.";
    hit(m, t, a.atk, `${who} ${name(a)} attacks`);
    return null;
  }
  function cast(m, me, foe, hi, ti, who) {
    const s = SP[me.hand[hi]];
    if (!s) return "Pick a spell from your hand.";
    let t = null;
    if (s.target !== "none") {
      t = (s.target === "enemy" ? foe : me).champs[ti];
      if (!t || t.hp <= 0) return "Pick a champion for " + s.name + ".";
    }
    me.hand[hi] = deal();                                  // a played spell is replaced at once
    const by = `${who} cast ${s.name}`;
    if (s.id === "supernova") hit(m, t, 30, by);
    else if (s.id === "storm") { m.log.push(by + ": 15 damage to every enemy."); alive(foe).forEach(c => { if (c.block) { c.block = false; } else c.hp = Math.max(0, c.hp - 15); }); }
    else if (s.id === "halo") { t.hp = Math.min(t.maxHp, t.hp + 40); m.log.push(`${by}: ${name(t)} heals 40.`); }
    else if (s.id === "mandala") { t.block = true; m.log.push(`${by}: ${name(t)} will block the next attack.`); }
    else if (s.id === "aura") { t.atk += 15; m.log.push(`${by}: ${name(t)} now hits for ${t.atk}.`); }
    else if (s.id === "eclipse") { t.atk = Math.max(5, t.atk - 15); m.log.push(`${by}: ${name(t)} now hits for ${t.atk}.`); }
    return null;
  }

  function checkEnd(m) {
    if (m.over) return true;
    if (!alive(m.rival).length) { m.over = true; m.winner = "you"; }
    else if (!alive(m.you).length) { m.over = true; m.winner = "rival"; }
    else if (m.turn > MAX_TURNS) { const hp = s => alive(s).reduce((a, c) => a + c.hp, 0); m.over = true; m.winner = hp(m.you) >= hp(m.rival) ? "you" : "rival"; m.log.push("The realm grows quiet: the match goes to whoever has more HP left."); }
    if (m.over) record(m);
    return m.over;
  }

  /* ---------- the rival's one move: a knockout if it has one, else the most useful thing ---------- */
  function rivalMove(m) {
    const me = m.rival, foe = m.you, who = "The rival's";
    const A = alive(me), F = alive(foe);
    const idx = (s, c) => s.champs.indexOf(c);
    const strongest = A.slice().sort((a, b) => b.atk - a.atk)[0];
    // 1. knock something out with an attack
    const kill = F.filter(t => !t.block && t.hp <= strongest.atk).sort((a, b) => b.atk - a.atk)[0];
    if (kill) return attack(m, me, foe, idx(me, strongest), idx(foe, kill), who);
    const has = id => me.hand.indexOf(id);
    // 2. save a champion about to fall
    const low = A.filter(c => c.hp < c.maxHp * 0.35).sort((a, b) => a.hp - b.hp)[0];
    if (low && has("halo") >= 0) return cast(m, me, foe, has("halo"), idx(me, low), "The rival");
    // 3. spells worth more than an attack
    if (has("storm") >= 0 && F.filter(c => !c.block).length >= 2 && strongest.atk < 30) return cast(m, me, foe, has("storm"), 0, "The rival");
    const target = F.slice().sort((a, b) => a.hp - b.hp)[0];
    if (has("supernova") >= 0 && strongest.atk < 30 && !target.block) return cast(m, me, foe, has("supernova"), idx(foe, target), "The rival");
    if (has("eclipse") >= 0 && rnd(3) === 0) { const big = F.slice().sort((a, b) => b.atk - a.atk)[0]; return cast(m, me, foe, has("eclipse"), idx(foe, big), "The rival"); }
    if (has("aura") >= 0 && rnd(3) === 0) return cast(m, me, foe, has("aura"), idx(me, strongest), "The rival");
    if (has("mandala") >= 0 && low && !low.block) return cast(m, me, foe, has("mandala"), idx(me, low), "The rival");
    // 4. otherwise hit the weakest with the strongest (a blocker only takes the cheapest hit)
    const blocked = target.block ? F.find(c => !c.block) || target : target;
    const by = target.block && blocked === target ? A.slice().sort((a, b) => a.atk - b.atk)[0] : strongest;
    return attack(m, me, foe, idx(me, by), idx(foe, blocked), who);
  }

  /* ---------- your move, then the rival's ---------- */
  function act({ match: id, type, card: hi, attacker, target }) {
    const m = matches.get(id);
    if (!m) return { error: "That match has ended. Start a new one." };
    if (m.over) return { error: "This match is over." };
    m.touched = Date.now();
    const from = m.log.length, ti = Number(target && target.i);
    const problem = type === "attack" ? attack(m, m.you, m.rival, Number(attacker), ti, "Your")
      : type === "spell" ? cast(m, m.you, m.rival, Number(hi), ti, "You")
      : "Unknown move.";
    if (problem) return { error: problem };
    if (!checkEnd(m)) { rivalMove(m); m.turn += 1; checkEnd(m); }
    if (!m.over) m.log.push("Your move.");
    return view(m, { fresh: m.log.slice(from) });
  }

  /* ---------- the board ---------- */
  const dir = envVar("SNAPSHOT_DIR") || path.join(root, "snapshot-data");
  const file = path.join(dir, "tcg.json");
  let board = {}; try { board = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const week = (d = new Date()) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  let saveT = null;
  function record(m) {
    if (!m.wallet || m.recorded) return; m.recorded = true;
    const b = board[week()] = board[week()] || {}, r = b[m.wallet] = b[m.wallet] || { wins: 0, losses: 0, streak: 0, best: 0 };
    if (m.winner === "you") { r.wins++; r.streak++; r.best = Math.max(r.best, r.streak); } else { r.losses++; r.streak = 0; }
    r.level = m.you.bless.level; r.at = Date.now();
    clearTimeout(saveT); saveT = setTimeout(() => { try { const k = Object.keys(board).sort().slice(-6), o = {}; k.forEach(x => o[x] = board[x]); board = o; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(board)); } catch (e) { log("tcg: could not save the board: " + e.message); } }, 2000);
  }
  const top = () => Object.entries(board[week()] || {}).map(([wallet, r]) => ({ wallet, ...r }))
    .sort((a, b) => b.wins - a.wins || b.best - a.best || a.losses - b.losses).slice(0, 25);

  function view(m, extra = {}) {
    return { match: m.id, wallet: m.wallet, turn: m.turn, over: m.over, winner: m.winner,
      you: { champs: m.you.champs, hand: m.you.hand.map(id => SP[id]), bless: m.you.bless },
      rival: { champs: m.rival.champs }, log: m.log.slice(-8), ...extra };
  }

  return { start, act, top, week, blessing, set: SET };
}

module.exports = { create };
