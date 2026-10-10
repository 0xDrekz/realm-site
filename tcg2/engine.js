/* ============================================================
   REALM card battler — the rules engine.

   Pure and deterministic: a match is a plain object, every change goes
   through act(), and the only randomness comes from the match's own seeded
   generator, so the same seed and the same moves always give the same game.
   The server keeps the match; the page only ever sees view().

   THE RULES
   - 20 life each. You go first or second at random; second draws 5, first 4,
     and the second player gets 1 extra essence on each of their first two turns.
   - Your turn: gain 1 essence (up to 10) and refill it, ready your units,
     start-of-turn powers fire, draw a card. Then, in any order: summon units
     from your hand or your champion zone, cast rituals, and attack once.
     End the turn: end-of-turn powers fire, frozen units thaw.
   - CHAMPIONS are your own beings. They wait in the champion zone and can be
     summoned at any time. When one dies it goes back there, and costs 2 more
     each time after (the commander tax).
   - Units can't attack the turn they arrive (Haste can). Attacking exhausts a
     unit: it can't block until your next turn.
   - Attacking: choose any of your ready units; they all attack the player.
     The defender then assigns blockers, one per attacker. Unblocked attackers
     hit the player. Damage on units stays until healed.
   - Keywords: Flying (only flying units can block it), Haste, Veiled (its first
     attack can't be blocked), Unblockable, Lifelink (damage it deals heals
     you), Poison (destroys any unit it damages), Freeze (a unit it damages
     can't attack next turn), First strike, Double strike, Tough (extra health).
   - Up to 6 units a side; up to 9 cards in hand (more are burned). An empty
     deck deals 1, 2, 3… damage per draw. After turn 40 the higher life wins.
   ============================================================ */
"use strict";
const C = require("./cards");

const MAX_BOARD = 6, MAX_HAND = 9, START_LIFE = 20, MAX_ESS = 10, TURN_LIMIT = 40;

/* ---------- a small seeded generator (mulberry32) ---------- */
function rng(state) {
  let t = (state.seed = (state.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (S, arr) => arr[Math.floor(rng(S) * arr.length)];
function shuffle(S, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng(S) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- making a match ----------
   champions: up to 3 being numbers per side. boost: the $DMT boost (1..1.15).
   scale: below 1 for borrowed spirits. life: a starting life other than 20
   (campaign rivals). deck: a fixed deck order, top first (the tutorial).
   first: who goes first, when it must not be random (the tutorial). */
function scaled(def, k) { return k === 1 ? def : { ...def, power: Math.max(1, Math.round(def.power * k)), health: Math.max(1, Math.round(def.health * k)) }; }
function newMatch({ seed, sides, first }) {
  const S = { seed: seed >>> 0, turn: 0, active: 0, phase: "main", winner: null, uid: 0, events: [], log: [], pending: null, players: [] };
  for (let i = 0; i < 2; i++) {
    const sd = sides[i] || {};
    const k = (sd.scale || 1) * (sd.boost || 1);
    S.players.push({
      i, name: sd.name || (i ? "Rival" : "You"), life: Math.round((sd.life || START_LIFE) * (sd.boost || 1)), maxEss: 0, ess: 0,
      startLife: Math.round((sd.life || START_LIFE) * (sd.boost || 1)),
      deck: sd.deck ? sd.deck.slice() : shuffle(S, C.SHARED_DECK.slice()), hand: [], fatigue: 0, drawNext: 0, attacked: false,
      champions: (sd.champions || []).slice(0, 3).map(n => ({ def: scaled(C.cardOf(n), k), tax: 0, home: true })),
      board: [], ai: !!sd.ai,
    });
  }
  S.active = first === 0 || first === 1 ? first : (rng(S) < 0.5 ? 0 : 1);
  S.first = S.active;
  S.players[1 - S.first].spark = true;      // going second: one extra essence on your first two turns
  for (const P of S.players) for (let k = 0; k < (P.i === S.first ? 4 : 5); k++) draw(S, P, true);
  beginTurn(S);
  return S;
}

/* ---------- reading the board ---------- */
const other = (S, P) => S.players[1 - P.i];
const has = (u, k) => u.kw.includes(k);
function auraFor(S, u) {
  // geometry auras and named statics from the other allies
  let p = 0, h = 0;
  for (const o of S.players[u.owner].board) {
    if (o === u) continue;
    if (o.def.aura) { p += o.def.aura.power || 0; h += o.def.aura.health || 0; }
    const st = o.def.static;
    if (st) { p += st.power || 0; h += st.health || 0; if (st.flyingBoost && has(u, "flying")) { p += st.flyingBoost; h += st.flyingBoost; } }
  }
  return { p, h };
}
const powerOf = (S, u) => Math.max(0, u.power + u.buffP + auraFor(S, u).p);
const maxHealthOf = (S, u) => u.health + u.buffH + auraFor(S, u).h;
const lifeOf = (S, u) => maxHealthOf(S, u) - u.damage;
function costOf(S, P, ref) {
  const def = ref.def;
  if (ref.champion != null) return def.cost + P.champions[ref.champion].tax;
  if (def.kind === "ritual") {
    const off = P.board.reduce((a, u) => a + ((u.def.static && u.def.static.ritualDiscount) || 0), 0);
    return Math.max(0, def.cost - off);
  }
  return def.cost;
}
const attuned = (P, def) => P.board.some(u => (u.def.essence || []).some(e => def.essence.includes(e)));
const canAttack = (S, u) => !u.exhausted && !u.frozen && (!u.sick || has(u, "haste")) && powerOf(S, u) > 0;

function emit(S, e) { S.events.push(e); }
function say(S, text) { S.log.push(text); if (S.log.length > 60) S.log.shift(); }

/* ---------- cards in and out ---------- */
function draw(S, P, quiet) {
  if (!P.deck.length) { P.fatigue += 1; hurtFace(S, P, P.fatigue, null); say(S, P.name + " has no cards left and takes " + P.fatigue + "."); return; }
  const id = P.deck.shift(), card = { uid: ++S.uid, def: C.sharedById[id] };
  if (P.hand.length >= MAX_HAND) { emit(S, { t: "burn", p: P.i, card: id }); return; }
  P.hand.push(card);
  if (!quiet) emit(S, { t: "draw", p: P.i, uid: card.uid });
}
function summon(S, P, def, extra = {}) {
  if (P.board.length >= MAX_BOARD) return null;
  const u = { uid: ++S.uid, owner: P.i, def, name: def.name, power: def.power, health: def.health, kw: (def.kw || []).slice(),
    buffP: 0, buffH: 0, damage: 0, sick: true, exhausted: false, frozen: false, thaw: false, veiledUsed: false, ...extra };
  P.board.push(u);
  emit(S, { t: "summon", p: P.i, uid: u.uid, n: def.n || null, name: def.name });
  return u;
}
function token(S, P, kind, poison) {
  const t = C.TOKENS[kind];
  const def = { id: "t-" + kind, kind: "token", name: t.name, cost: 0, power: t.power, health: t.health, kw: t.kw.concat(poison ? ["poison"] : []), essence: t.essence };
  return summon(S, P, def, { token: true });
}

/* ---------- damage, healing, death ---------- */
function hurtFace(S, P, n, src) {
  if (n <= 0) return;
  P.life -= n; emit(S, { t: "face", p: P.i, n, src: src && src.uid });
  if (src && has(src, "lifelink")) heal(S, S.players[src.owner], n);
}
function heal(S, P, n) { if (n > 0) { P.life += n; emit(S, { t: "heal", p: P.i, n }); } }
function hurtUnit(S, u, n, src) {
  if (n <= 0 || u.dead) return;
  u.damage += n; emit(S, { t: "damage", uid: u.uid, n });
  if (src && has(src, "poison")) u.poisoned = true;
  if (src && has(src, "freeze")) u.frozen = true;
  if (src && has(src, "lifelink")) heal(S, S.players[src.owner], n);
}
function destroy(S, u) { u.damage = 1e6; }
function sweep(S) {
  // deaths, over and over until nothing more dies (a death can cause another)
  for (let guard = 0; guard < 20; guard++) {
    const dying = [];
    for (const P of S.players) for (const u of P.board) if (!u.dead && (lifeOf(S, u) <= 0 || u.poisoned)) dying.push(u);
    if (!dying.length) break;
    for (const u of dying) {
      u.dead = true;
      const P = S.players[u.owner];
      P.board = P.board.filter(x => x !== u);
      emit(S, { t: "death", uid: u.uid, p: u.owner, name: u.name });
      if (u.champion != null) { const c = P.champions[u.champion]; c.home = true; c.tax += 2; }
      for (const e of u.def.death || []) run(S, P, e, u, null);
    }
  }
  for (const P of S.players) if (P.life <= 0 && S.winner == null) { S.winner = 1 - P.i; S.phase = "over"; emit(S, { t: "over", winner: S.winner }); }
  if (S.players[0].life <= 0 && S.players[1].life <= 0) S.winner = S.active;   // both fall: the attacker wins
}

/* ---------- effects ---------- */
function targetUnit(S, tgt) {
  if (!tgt || tgt.uid == null) return null;
  for (const P of S.players) { const u = P.board.find(x => x.uid === tgt.uid); if (u) return u; }
  return null;
}
// does an effect need a target, and which?
function needs(e) {
  if (e.to === "anyTarget") return "any";
  if (e.to === "enemyUnit") return "enemyUnit";
  if (e.k === "buffUnit") return "ownUnit";
  return null;
}
function validTarget(S, P, e, tgt) {
  const kind = needs(e);
  if (!kind) return true;
  if (kind === "any" && tgt && tgt.face != null) return true;
  const u = targetUnit(S, tgt);
  if (!u) return false;
  if (kind === "enemyUnit" && u.owner === P.i) return false;
  if (kind === "ownUnit" && u.owner !== P.i) return false;
  if (e.maxCost != null && (u.def.cost || 0) > e.maxCost) return false;
  if (e.maxPower != null && powerOf(S, u) > e.maxPower) return false;
  return true;
}
function run(S, P, e, src, tgt) {
  const E = other(S, P);
  const units = side => side.board.slice();
  switch (e.k) {
    case "dmg": {
      if (e.to === "enemyUnits") units(E).forEach(u => hurtUnit(S, u, e.n, null));
      else if (e.to === "enemyUnitsPower3") units(E).filter(u => powerOf(S, u) >= 3).forEach(u => hurtUnit(S, u, e.n, null));
      else if (e.to === "enemyAll") { units(E).forEach(u => hurtUnit(S, u, e.n, null)); hurtFace(S, E, e.n, null); }
      else if (e.to === "enemyFace") hurtFace(S, E, e.n, null);
      else if (e.to === "randomEnemy") { const opts = [...E.board.map(u => ({ uid: u.uid })), { face: E.i }]; const t = pick(S, opts); if (t.face != null) hurtFace(S, E, e.n, null); else hurtUnit(S, targetUnit(S, t), e.n, null); }
      else if (e.to === "anyTarget") { if (tgt && tgt.face != null) hurtFace(S, S.players[tgt.face], e.n, null); else { const u = targetUnit(S, tgt); if (u) hurtUnit(S, u, e.n, null); } }
      break;
    }
    case "destroy": {
      if (e.to === "allPowerMax2") for (const Q of S.players) units(Q).filter(u => u !== src && powerOf(S, u) <= 2).forEach(u => destroy(S, u));
      else { const u = targetUnit(S, tgt); if (u && validTarget(S, P, e, tgt)) destroy(S, u); }
      break;
    }
    case "freeze": {
      const list = e.to === "enemyUnitsCost4" ? units(E).filter(u => (u.def.cost || 0) <= 4) : units(E);
      list.forEach(u => { u.frozen = true; emit(S, { t: "freeze", uid: u.uid }); });
      break;
    }
    case "freezeDraw": { const u = targetUnit(S, tgt); if (u) { u.frozen = true; emit(S, { t: "freeze", uid: u.uid }); } for (let k = 0; k < (e.n || 1); k++) draw(S, P); break; }
    case "summon": for (let k = 0; k < e.n; k++) token(S, P, e.token, e.poison); break;
    case "draw": for (let k = 0; k < e.n; k++) draw(S, P); break;
    case "drawNext": P.drawNext += e.n; break;
    case "healFace": heal(S, P, e.n); break;
    case "healUnits": P.board.forEach(u => { const h = Math.min(u.damage, e.n); if (h > 0) { u.damage -= h; emit(S, { t: "mend", uid: u.uid, n: h }); } }); break;
    case "buffUnits": P.board.forEach(u => { u.buffP += e.power; u.buffH += e.health; }); break;
    case "buffUnit": { const u = targetUnit(S, tgt); if (u && u.owner === P.i) { u.buffP += e.power; u.buffH += e.health; emit(S, { t: "buff", uid: u.uid }); } break; }
    case "bounce": {
      const u = targetUnit(S, tgt); if (!u || u.owner === P.i) break;
      const Q = S.players[u.owner];
      Q.board = Q.board.filter(x => x !== u); u.dead = true; emit(S, { t: "bounce", uid: u.uid });
      if (u.champion != null) Q.champions[u.champion].home = true;
      else if (!u.token && Q.hand.length < MAX_HAND && u.def.id && C.sharedById[u.def.id]) Q.hand.push({ uid: ++S.uid, def: u.def });
      break;
    }
    case "essence": P.ess += e.n; break;
  }
}

/* ---------- turns ---------- */
function beginTurn(S) {
  S.turn += 1;
  const P = S.players[S.active];
  P.maxEss = Math.min(MAX_ESS, P.maxEss + 1); P.ess = P.maxEss; P.attacked = false;
  if (P.spark) { P.ess += 1; if (S.turn > 2) P.spark = false; }
  for (const u of P.board) { u.sick = false; u.exhausted = false; u.thaw = u.frozen; }
  emit(S, { t: "turn", p: P.i, turn: S.turn });
  for (const u of P.board.slice()) for (const e of u.def.turnStart || []) run(S, P, e, u, null);
  sweep(S); if (S.phase === "over") return;
  if (!(S.turn === 1)) draw(S, P);
  for (; P.drawNext > 0; P.drawNext--) draw(S, P);
  sweep(S);
}
function endTurn(S) {
  const P = S.players[S.active];
  for (const u of P.board.slice()) for (const e of u.def.turnEnd || []) run(S, P, e, u, null);
  for (const u of P.board) if (u.thaw) { u.frozen = false; u.thaw = false; }
  sweep(S); if (S.phase === "over") return;
  if (S.turn >= TURN_LIMIT) {
    const [a, b] = S.players; S.winner = a.life === b.life ? S.first : (a.life > b.life ? 0 : 1); S.phase = "over";
    emit(S, { t: "over", winner: S.winner, limit: true }); return;
  }
  S.active = 1 - S.active;
  beginTurn(S);
}

/* ---------- combat ---------- */
function canBlock(S, b, a) {
  if (b.exhausted) return false;
  if (has(a, "unblockable")) return false;
  if (has(a, "veiled") && !a.veiledUsed) return false;
  if (has(a, "flying") && !has(b, "flying")) return false;
  return true;
}
function strike(S, from, to) {
  // one unit's damage to another, or to the player when `to` is null
  const n = powerOf(S, from);
  if (to) hurtUnit(S, to, n, from); else hurtFace(S, other(S, S.players[from.owner]), n, from);
}
function resolveCombat(S, blocks) {
  const { attackers } = S.pending;
  const A = S.players[S.active], D = other(S, A);
  const used = new Set();
  const pairs = attackers.map(uid => {
    const a = A.board.find(u => u.uid === uid);
    const buid = Object.keys(blocks || {}).find(b => blocks[b] === uid && !used.has(b));
    const b = buid ? D.board.find(u => u.uid === Number(buid)) : null;
    if (b && a && canBlock(S, b, a)) { used.add(buid); return { a, b }; }
    return { a, b: null };
  }).filter(p => p.a);
  emit(S, { t: "clash", pairs: pairs.map(p => ({ a: p.a.uid, b: p.b ? p.b.uid : null })) });
  // first strike step, then the rest
  for (const step of ["first", "normal"]) {
    for (const { a, b } of pairs) {
      const strikes = u => step === "first" ? (has(u, "firstStrike") || has(u, "doubleStrike")) : (!has(u, "firstStrike") || has(u, "doubleStrike"));
      if (a.dead || lifeOf(S, a) <= 0 || a.poisoned) continue;
      if (!b) { if (strikes(a)) strike(S, a, null); continue; }
      const aGo = strikes(a) && !b.dead, bGo = strikes(b) && !a.dead && !b.dead && lifeOf(S, b) > 0 && !b.poisoned;
      if (aGo) strike(S, a, b);
      if (bGo) strike(S, b, a);
    }
    sweep(S);
    if (S.phase === "over") break;
  }
  for (const { a } of pairs) a.veiledUsed = true;
  S.pending = null; S.phase = S.winner == null ? "main" : "over";
}

/* ---------- the one way in: act() ----------
   a: { type: "play", uid | champion, target }    a card from hand, or a champion by index
      { type: "attack", attackers: [uid,…] }       declares; the defender must block next
      { type: "block", blocks: { blockerUid: attackerUid } }
      { type: "end" }
   Returns null, or a reason the move is not allowed (state unchanged). */
function act(S, who, a) {
  const err = act0(S, who, a);
  if (!err && S.onAct) S.onAct(who, a);     // the server records each step, to replay it as animation
  return err;
}
function act0(S, who, a) {
  if (S.phase === "over") return "The match is over.";
  if (S.phase === "block") {
    if (a.type !== "block" || who === S.active) return "Waiting for blocks.";
    resolveCombat(S, a.blocks || {}); return null;
  }
  if (who !== S.active) return "Not your turn.";
  const P = S.players[who];
  if (a.type === "end") { endTurn(S); return null; }
  if (a.type === "attack") {
    if (P.attacked) return "You have already attacked this turn.";
    const list = [...new Set(a.attackers || [])].map(uid => P.board.find(u => u.uid === uid));
    if (!list.length || list.some(u => !u || !canAttack(S, u))) return "Pick ready units to attack with.";
    P.attacked = true;
    list.forEach(u => { u.exhausted = true; });
    S.pending = { attackers: list.map(u => u.uid) }; S.phase = "block";
    emit(S, { t: "attack", p: who, attackers: S.pending.attackers });
    for (const u of list) for (const e of u.def.onAttack || []) run(S, P, e, u, null);
    sweep(S);
    if (S.phase === "over") return null;
    S.pending.attackers = S.pending.attackers.filter(uid => P.board.some(u => u.uid === uid));
    return null;
  }
  if (a.type === "play") {
    let ref, champ = null;
    if (a.champion != null) { const c = P.champions[a.champion]; if (!c || !c.home) return "That champion is not ready."; ref = { def: c.def, champion: a.champion }; champ = a.champion; }
    else { ref = P.hand.find(c => c.uid === a.uid); if (!ref) return "That card is not in your hand."; }
    const cost = costOf(S, P, ref);
    if (cost > P.ess) return "Not enough essence.";
    const def = ref.def;
    if (def.kind === "ritual") {
      const e = attuned(P, def) && def.attuned ? def.attuned : def.effect;
      if (needs(e) && !validTarget(S, P, e, a.target)) return "Pick a valid target.";
      P.ess -= cost; P.hand = P.hand.filter(c => c !== ref);
      emit(S, { t: "cast", p: who, id: def.id, target: a.target || null });
      run(S, P, e, null, a.target); sweep(S); return null;
    }
    if (P.board.length >= MAX_BOARD) return "Your side is full.";
    P.ess -= cost;
    if (champ != null) P.champions[champ].home = false; else P.hand = P.hand.filter(c => c !== ref);
    const u = summon(S, P, def, { champion: champ });
    for (const e of def.arrive || []) {
      const t = needs(e) ? (validTarget(S, P, e, a.target) ? a.target : autoTarget(S, P, e)) : null;
      if (needs(e) && !t) continue;   // nothing to aim at: the power fizzles
      run(S, P, e, u, t);
    }
    sweep(S); return null;
  }
  return "Unknown move.";
}

/* the most valuable target an arrival power can take, if the player named none */
function unitValue(S, u) { return powerOf(S, u) * 1.1 + lifeOf(S, u) * 0.8 + u.kw.length * 0.6 + (u.def.cost || 0) * 0.4 + (u.def.static || u.def.aura ? 1 : 0); }
function autoTarget(S, P, e) {
  const E = other(S, P), kind = needs(e);
  let opts = [];
  if (kind === "enemyUnit" || kind === "any") opts = E.board.filter(u => validTarget(S, P, e, { uid: u.uid })).map(u => ({ uid: u.uid, v: unitValue(S, u) }));
  if (kind === "ownUnit") opts = P.board.map(u => ({ uid: u.uid, v: unitValue(S, u) }));
  if (kind === "any" && !opts.length) return { face: E.i };
  if (!opts.length) return null;
  opts.sort((x, y) => y.v - x.v);
  return { uid: opts[0].uid };
}

/* ---------- what a player is allowed to see ---------- */
function view(S, who) {
  const unit = u => ({ uid: u.uid, n: u.def.n || null, id: u.def.id || null, name: u.def.name, tier: u.def.tier || null, essence: u.def.essence, cost: u.def.cost || 0,
    power: powerOf(S, u), health: lifeOf(S, u), maxHealth: maxHealthOf(S, u), kw: u.kw, text: u.def.text || "", token: !!u.token,
    champion: u.champion != null, sick: u.sick && !has(u, "haste"), exhausted: u.exhausted, frozen: u.frozen, ready: S.active === u.owner && canAttack(S, u) });
  const side = (P, mine) => ({ life: P.life, ess: P.ess, maxEss: P.maxEss, deck: P.deck.length, board: P.board.map(unit), attacked: P.attacked,
    hand: mine ? P.hand.map(c => ({ uid: c.uid, ...c.def, cost: costOf(S, P, c) })) : P.hand.length,
    champions: P.champions.map((c, i) => ({ i, home: c.home, cost: c.def.cost + c.tax, card: c.def })) });
  // while blocking: which of the defender's units may block each attacker
  const pending = S.pending && {
    attackers: S.pending.attackers.slice(),
    can: Object.fromEntries(S.pending.attackers.map(uid => {
      const a = S.players[S.active].board.find(u => u.uid === uid);
      return [uid, a ? S.players[1 - S.active].board.filter(b => canBlock(S, b, a)).map(b => b.uid) : []];
    })),
  };
  return { turn: S.turn, active: S.active, phase: S.phase, winner: S.winner, pending,
    you: side(S.players[who], true), rival: side(S.players[1 - who], false), log: S.log.slice(-12) };
}

module.exports = { newMatch, act, view, scaled, powerOf, lifeOf, maxHealthOf, costOf, canAttack, canBlock, unitValue, autoTarget, needs, validTarget, attuned, rng, MAX_BOARD };
