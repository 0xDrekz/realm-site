/* ============================================================
   REALM: The Card Game — a match against the realm, decided on the server.

   Each side has three champions (beings) and a deck of fifteen rituals
   drawn from the First Rites (tcg-cards.json). A champion's HP is 40% of
   its five stats; its element is its highest stat. On your turn you get
   Essence (one more each turn, up to eight), play any rituals you can pay
   for, and attack once with one champion: pick a stat, pick a target, and
   hit for a quarter of that stat. Elements beat the next one round the
   circle (light > dark > spirit > magic > knowledge > light) for 1.5x,
   and land for 0.75x the other way. Knock out all three rival champions
   to win.

   A wallet that holds beings and $DMT is blessed, by the holder pool's
   $DMT bands: +5% champion HP and damage a level, +1 starting Essence
   from level 3, an extra card in the opening hand at level 5.

   A wallet's wins this week are its place on the board. Anyone without
   beings plays with three borrowed spirits, weaker, and off the board.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATS = ["magic", "spirit", "knowledge", "light", "dark"];
const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
const MAX_TURNS = 40;

function create({ root, card, beings, tokensOf, bands, envVar, log = console.log }) {
  const SET = JSON.parse(fs.readFileSync(path.join(root, "tcg-cards.json")));
  const RIT = Object.fromEntries(SET.rituals.map(r => [r.id, r]));
  const MAP = JSON.parse(fs.readFileSync(path.join(root, "map-data.json"))).beings;
  const byTier = {}; MAP.forEach((m, i) => (byTier[m[0]] = byTier[m[0]] || []).push(i + 1));
  const R = SET.champion, BEATS = SET.beats, BL = SET.blessing;
  const rnd = n => crypto.randomInt(n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- the blessing ---------- */
  async function blessing(wallet) {
    if (!wallet) return { level: 0, tokens: 0 };
    const tokens = await tokensOf(wallet).catch(() => 0);
    const level = bands.filter(b => b.hold > 0 && tokens >= b.hold).length;
    return { level, tokens, hp: 1 + BL.perLevel * level, essence: level >= BL.essenceFromLevel ? 1 : 0, cards: level >= BL.extraCardFromLevel ? 1 : 0 };
  }

  /* ---------- champions ---------- */
  function champ(n, scale, bonus) {
    const c = card(n, scale);
    const hp = Math.round(c.total * R.hpOfTotal * bonus);
    return { ...c, hp, maxHp: hp, shield: 0, block: false, hidden: false, buff: {}, cut: {} };
  }
  const stat = (c, s) => Math.max(1, c[s] + (c.buff[s] || 0) - (c.cut[s] || 0));
  const elementOf = c => STATS.reduce((a, b) => stat(c, b) > stat(c, a) ? b : a);
  const mult = (e, target) => !e ? 1 : BEATS[e] === elementOf(target) ? R.strong : BEATS[elementOf(target)] === e ? R.weak : 1;
  const alive = side => side.champs.filter(c => c.hp > 0);

  /* ---------- matches ---------- */
  const matches = new Map();
  const sweep = () => { const now = Date.now(); for (const [k, m] of matches) if (now - m.touched > 45 * 60_000) matches.delete(k); };

  function side(champs, bless, isYou) {
    const deck = shuffle(SET.rituals.map(r => r.id)).slice(0, SET.deck.rituals);
    const s = { champs, bless, deck, hand: [], essence: 0, maxEssence: 0, attacked: false, warm: false, isYou };
    for (let i = 0; i < SET.deck.hand + (bless.cards || 0); i++) draw(s);
    return s;
  }
  function draw(s) { if (s.deck.length && s.hand.length < 7) s.hand.push(s.deck.shift()); }

  async function start({ wallet, champions }) {
    sweep();
    let mine = [], bless = { level: 0, tokens: 0, hp: 1, essence: 0, cards: 0 }, scale = 1;
    if (wallet) {
      const own = (await beings()).filter(b => b.owner === wallet).map(b => b.n);
      if (!own.length) return { error: "This wallet holds no beings yet. Play with borrowed spirits, or mint at dmt-realm.dev/mint." };
      const pick = [...new Set((champions || []).map(Number).filter(n => own.includes(n)))].slice(0, 3);
      mine = pick.length ? pick : own.map(n => card(n)).sort((a, b) => b.total - a.total).slice(0, 3).map(c => c.n);
      bless = await blessing(wallet);
    }
    const you = mine.map(n => champ(n, 1, bless.hp));
    while (you.length < 3) { const n = 1 + rnd(MAP.length); if (!you.some(c => c.n === n)) you.push(champ(n, 0.8, bless.hp)); }
    // the rival: near your team's strength, a tier either side
    const avg = Math.round(you.reduce((a, c) => a + TIERS.indexOf(c.tier), 0) / 3);
    const foe = [];
    while (foe.length < 3) {
      const t = TIERS[Math.max(0, Math.min(7, avg - 1 + rnd(3)))], pool = byTier[t], n = pool[rnd(pool.length)];
      if (!foe.some(c => c.n === n) && !you.some(c => c.n === n)) foe.push(champ(n, 1, 1));
    }
    const m = { id: crypto.randomBytes(12).toString("hex"), wallet: wallet || null, turn: 0, over: false, winner: null, log: [], touched: Date.now(), seen: false,
      you: side(you, bless, true), rival: side(foe, { level: 0, hp: 1, essence: 0, cards: 0 }, false) };
    beginTurn(m, m.you);
    matches.set(m.id, m);
    return view(m);
  }

  function beginTurn(m, s) {
    m.turn += 1; m.seen = false;
    s.maxEssence = Math.min(SET.essence.max, s.maxEssence + SET.essence.perTurn);
    s.essence = s.maxEssence + (s.bless.essence || 0);
    s.attacked = false; s.warm = false;
    s.champs.forEach(c => { c.buff = {}; c.hidden = false; });        // "until your next turn" ends now
    if (m.turn > 1) draw(s);
  }

  /* damage to one champion: element, blessing, block, shield */
  function hit(m, from, target, base, element, isAttack, label) {
    if (target.hp <= 0) return 0;
    let dmg = Math.round(base * mult(element, target) * from.bless.hp);
    if (isAttack && target.block) { target.block = false; m.log.push(`${label}: ${name(target)} blocks it.`); return 0; }
    if (target.shield) { const a = Math.min(target.shield, dmg); target.shield -= a; dmg -= a; }
    target.hp = Math.max(0, target.hp - dmg);
    const m2 = mult(element, target);
    m.log.push(`${label}: ${dmg} to ${name(target)}${m2 > 1 ? " (strong!)" : m2 < 1 ? " (resisted)" : ""}${target.hp === 0 ? ". Knocked out." : "."}`);
    return dmg;
  }
  const name = c => (c.being && !/\d$/.test(c.being) ? c.being : c.tier) + " #" + c.n;
  const heal = (c, v) => { if (c.hp > 0) c.hp = Math.min(c.maxHp, c.hp + v); };

  function pick(sideObj, i) { const c = sideObj.champs[i]; return c && c.hp > 0 ? c : null; }

  /* ---------- one ritual ---------- */
  function cast(m, me, foe, hi, target) {
    const id = me.hand[hi], r = RIT[id];
    if (!r) return "Pick a card in your hand.";
    if (r.cost > me.essence) return "Not enough Essence.";
    let t = null;
    if (r.target === "enemy" || r.target === "ally" || r.target === "any") {
      const sideObj = r.target === "enemy" ? foe : r.target === "ally" ? me : (target && target.side === "rival") === me.isYou ? foe : me;
      t = target ? pick(sideObj, Number(target.i)) : null;
      if (!t) return "Pick a champion for " + r.name + ".";
      if (sideObj === foe && t.hidden) return name(t) + " is shrouded and cannot be targeted.";
    }
    me.essence -= r.cost; me.hand.splice(hi, 1);
    const who = me.isYou ? "You" : "The rival";
    const L = `${who} cast ${r.name}`;
    switch (id) {
      case "supernova": hit(m, me, t, 30, "light", false, L); break;
      case "rays": t.buff.light = (t.buff.light || 0) + 15; m.log.push(`${L}: ${name(t)} +15 Light.`); break;
      case "solar-flare": m.log.push(L + "."); alive(foe).forEach(c => hit(m, me, c, 20, "light", false, "  Solar Flare")); break;
      case "halo": heal(t, 25); m.log.push(`${L}: ${name(t)} heals 25.`); break;
      case "eclipse": { const l = t.light, d = t.dark; t.light = d; t.dark = l; m.log.push(`${L}: ${name(t)}'s Light and Dark swap.`); break; }
      case "abyss": hit(m, me, t, 40, "dark", false, L); alive(me).forEach(c => { c.hp = Math.max(1, c.hp - 10); }); m.log.push("  The Abyss takes 10 from each of " + (me.isYou ? "your" : "its") + " champions."); break;
      case "blood-moon": { t.hp = Math.max(0, t.hp - 20); const w = alive(me).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]; if (w) heal(w, 20); m.log.push(`${L}: ${name(t)} loses 20${t.hp === 0 ? " and is knocked out" : ""}; ${w ? name(w) + " heals 20" : ""}.`); break; }
      case "shroud": t.hidden = true; m.log.push(`${L}: ${name(t)} is shrouded.`); break;
      case "lightning": hit(m, me, t, 25, "magic", false, L); break;
      case "storm": m.log.push(L + "."); alive(foe).forEach(c => hit(m, me, c, 15, "magic", false, "  Lightning Storm")); break;
      case "mushroom-ring": alive(me).forEach(c => heal(c, 15)); m.log.push(`${L}: every champion heals 15.`); break;
      case "moon-dust": heal(t, 10); draw(me); m.log.push(`${L}: ${name(t)} heals 10, and a card is drawn.`); break;
      case "warm-aura": me.warm = true; m.log.push(`${L}: the next attack hits 50% harder.`); break;
      case "verdant": t.maxHp += 30; heal(t, 30); m.log.push(`${L}: ${name(t)} grows by 30.`); break;
      case "ancestral-trees": t.shield += 30; m.log.push(`${L}: ${name(t)} gains a 30 shield.`); break;
      case "mandala": t.block = true; m.log.push(`${L}: ${name(t)} will block the next attack.`); break;
      case "alignment": alive(me).forEach(c => STATS.forEach(s => { c.buff[s] = (c.buff[s] || 0) + 10; })); m.log.push(`${L}: every stat +10.`); break;
      case "abduction": { const s = elementOf(t); t.cut[s] = (t.cut[s] || 0) + 25; m.log.push(`${L}: ${name(t)} loses 25 ${s}.`); break; }
      case "geometry": draw(me); draw(me); m.log.push(`${L}: two cards drawn.`); break;
      case "third-eye": if (me.isYou) m.seen = true; draw(me); m.log.push(`${L}: ${me.isYou ? "the rival's hand is revealed" : "it sees your hand"}, and a card is drawn.`); break;
      case "essence-surge": me.essence += 2; m.log.push(`${L}: +2 Essence.`); break;
    }
    return null;
  }

  function attack(m, me, foe, ai, s, ti) {
    if (me.attacked) return "You have already attacked this turn.";
    const a = pick(me, ai), t = pick(foe, ti);
    if (!a) return "Pick one of your champions to attack with.";
    if (!STATS.includes(s)) return "Pick a stat to attack with.";
    if (!t) return "Pick an enemy champion to attack.";
    if (t.hidden) return name(t) + " is shrouded and cannot be attacked.";
    me.attacked = true;
    const base = stat(a, s) * R.attackOfStat * (me.warm ? 1.5 : 1); me.warm = false;
    hit(m, me, t, base, s, true, `${me.isYou ? "Your" : "The rival's"} ${name(a)} attacks with ${s[0].toUpperCase() + s.slice(1)}`);
    return null;
  }

  function checkEnd(m) {
    if (!alive(m.rival).length) { m.over = true; m.winner = "you"; }
    else if (!alive(m.you).length) { m.over = true; m.winner = "rival"; }
    else if (m.turn >= MAX_TURNS) {
      const hp = s => alive(s).reduce((a, c) => a + c.hp, 0);
      m.over = true; m.winner = hp(m.you) >= hp(m.rival) ? "you" : "rival";
      m.log.push("The realm grows quiet: the match is decided on HP left.");
    }
    if (m.over) record(m);
    return m.over;
  }

  /* ---------- the rival's turn ---------- */
  function rivalTurn(m) {
    const me = m.rival, foe = m.you;
    beginTurn(m, me);
    const wounded = () => alive(me).filter(c => c.hp < c.maxHp * 0.6);
    const weakestFoe = () => alive(foe).filter(c => !c.hidden).sort((a, b) => a.hp - b.hp)[0];
    for (let guard = 0; guard < 12; guard++) {
      if (checkEnd(m)) return;
      // the most useful card it can pay for, most expensive first
      const opts = me.hand.map((id, i) => ({ id, i, r: RIT[id] })).filter(o => o.r.cost <= me.essence).sort((a, b) => b.r.cost - a.r.cost);
      let done = false;
      for (const o of opts) {
        const r = o.r, w = wounded(), foeT = weakestFoe();
        let target = null, use = false;
        if (["supernova", "lightning", "abyss", "blood-moon"].includes(o.id)) { if (foeT) { use = true; target = { side: "you", i: foe.champs.indexOf(foeT) }; } }
        else if (o.id === "abduction") { const s = alive(foe).filter(c => !c.hidden).sort((a, b) => b.total - a.total)[0]; if (s) { use = true; target = { side: "you", i: foe.champs.indexOf(s) }; } }
        else if (["solar-flare", "storm"].includes(o.id)) use = alive(foe).length >= 2;
        else if (["halo", "moon-dust", "verdant", "ancestral-trees", "mandala", "shroud"].includes(o.id)) { if (w.length) { use = true; target = { side: "rival", i: me.champs.indexOf(w[0]) }; } }
        else if (o.id === "mushroom-ring") use = w.length >= 2;
        else if (["rays", "alignment", "warm-aura"].includes(o.id)) { use = !me.attacked; if (o.id === "rays") target = { side: "rival", i: me.champs.indexOf(alive(me)[0]) }; }
        else if (["geometry", "third-eye"].includes(o.id)) use = me.hand.length <= 3;
        else if (o.id === "essence-surge") use = me.hand.some((id, j) => j !== o.i && RIT[id].cost > me.essence && RIT[id].cost <= me.essence + 2);
        if (use && !cast(m, me, foe, o.i, target)) { done = true; break; }
      }
      if (!done) break;
    }
    if (checkEnd(m)) return;
    // the attack that does the most, a knockout first
    let best = null;
    for (const a of alive(me)) for (const s of STATS) for (const t of alive(foe)) {
      if (t.hidden) continue;
      const dmg = stat(a, s) * R.attackOfStat * (me.warm ? 1.5 : 1) * mult(s, t) * me.bless.hp;
      const score = (dmg >= t.hp + t.shield ? 1000 : 0) + dmg - (t.block ? 500 : 0);
      if (!best || score > best.score) best = { a: me.champs.indexOf(a), s, t: foe.champs.indexOf(t), score };
    }
    if (best) attack(m, me, foe, best.a, best.s, best.t);
    checkEnd(m);
  }

  /* ---------- the player's actions ---------- */
  function act({ match: id, type, card: hi, target, attacker, stat: s }) {
    const m = matches.get(id);
    if (!m) return { error: "That match has ended. Start a new one." };
    if (m.over) return { error: "This match is over." };
    m.touched = Date.now();
    const from = m.log.length;
    let problem = null;
    if (type === "ritual") problem = cast(m, m.you, m.rival, Number(hi), target);
    else if (type === "attack") problem = attack(m, m.you, m.rival, Number(attacker), s, Number(target && target.i));
    else if (type === "end") {
      m.log.push("— The rival's turn —");
      rivalTurn(m);
      if (!m.over) { beginTurn(m, m.you); m.log.push("— Your turn —"); }
    } else problem = "Unknown move.";
    if (problem) return { error: problem };
    checkEnd(m);
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

  /* ---------- what the page sees ---------- */
  function view(m, extra = {}) {
    const pub = c => ({ n: c.n, tier: c.tier, being: c.being, img: c.img, borrowed: c.borrowed, hp: c.hp, maxHp: c.maxHp, shield: c.shield, block: c.block, hidden: c.hidden,
      element: elementOf(c), stats: Object.fromEntries(STATS.map(s => [s, stat(c, s)])), buffed: Object.keys(c.buff).length > 0 });
    return { match: m.id, wallet: m.wallet, turn: m.turn, over: m.over, winner: m.winner,
      you: { champs: m.you.champs.map(pub), hand: m.you.hand.map(id => RIT[id]), essence: m.you.essence, maxEssence: m.you.maxEssence, deck: m.you.deck.length, attacked: m.you.attacked, warm: m.you.warm, bless: m.you.bless },
      rival: { champs: m.rival.champs.map(pub), hand: m.seen ? m.rival.hand.map(id => RIT[id]) : m.rival.hand.length, deck: m.rival.deck.length },
      log: m.log.slice(-14), ...extra };
  }

  return { start, act, top, week, blessing, set: SET };
}

module.exports = { create };
