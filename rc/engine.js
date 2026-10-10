/* ============================================================
   REALM Cards — the rules.

   Two players, 20 life, a deck of 30. Each turn: you gain a crystal (up to
   10, refilled every turn), draw a card, play what you can afford, and may
   attack once. The rival blocks with untired beings, one blocker per
   attacker, and may cast Rites (fast spells) before blocking. Damage on
   beings wears off at the end of every turn. Reduce your rival to 0 life,
   or let them try to draw from an empty deck.

   Pure and deterministic: every random draw comes from the match's seed,
   and nothing changes the state except act(). The server owns the state;
   the page only ever sees view().
   ============================================================ */
"use strict";
const C = require("./cards");

const START_LIFE = 20, START_HAND = 5, MAX_CRYSTALS = 10, MAX_BOARD = 7, MAX_HAND = 10, TURN_LIMIT = 60;

function rng(S) {
  let t = (S.seed = (S.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const emit = (S, e) => S.events.push(e);

/* ---------- making a match ----------
   sides: [{ deck: [30 ids], name, scales: { id: 1.06 } (a holder's own beings, boosted), life }] */
function newMatch({ seed = 1, sides, first }) {
  const S = { seed: seed >>> 0, turn: 0, active: 0, first: 0, phase: "main", pending: null, winner: null, events: [], uid: 0, players: [], attacked: false };
  for (let i = 0; i < 2; i++) {
    const sd = sides[i];
    const P = { i, name: sd.name || (i ? "Rival" : "You"), life: sd.life || START_LIFE, maxEss: 0, ess: 0, deck: sd.deck.map(id => ({ uid: ++S.uid, id })),
      hand: [], board: [], relics: [], lost: [], scales: sd.scales || {} };
    // shuffle, then make sure the opening hand has something cheap to play
    for (let k = P.deck.length - 1; k > 0; k--) { const j = Math.floor(rng(S) * (k + 1)); [P.deck[k], P.deck[j]] = [P.deck[j], P.deck[k]]; }
    const cheap = c => C.cardOf(c.id).cost <= 2;
    for (let k = 0; k < START_HAND && P.deck.slice(0, START_HAND).filter(cheap).length < 2; k++) {
      const j = P.deck.findIndex((c, x) => x >= START_HAND && cheap(c)), slot = P.deck.slice(0, START_HAND).findIndex(c => !cheap(c));
      if (j < 0 || slot < 0) break; [P.deck[slot], P.deck[j]] = [P.deck[j], P.deck[slot]];
    }
    P.hand = P.deck.splice(0, START_HAND);
    S.players.push(P);
  }
  S.first = first != null ? first : rng(S) < 0.5 ? 0 : 1;
  const second = S.players[1 - S.first];
  second.hand.push(second.deck.shift()); second.bonus = 1;   // going second: one extra card, and one extra crystal on the first turn
  S.active = S.first;
  startTurn(S);
  return S;
}

/* ---------- reading a being ---------- */
const defOf = u => u.token ? u.def : C.cardOf(u.id);
const others = (S, u) => S.players[u.owner].board.filter(o => o !== u);
function auraSum(S, u, key) {
  let n = 0;
  for (const o of others(S, u)) { const a = defOf(o).aura; if (a && a[key]) n += a[key]; }
  return n;
}
function kwOf(S, u) { const d = defOf(u); return new Set([...(d.kw || []), ...u.pkw, ...u.tkw]); }
const has = (S, u, k) => kwOf(S, u).has(k);
function powerOf(S, u) {
  const d = defOf(u), sc = u.token ? 1 : (S.players[u.owner].scales[u.id] || 1);
  return Math.max(0, Math.ceil(d.power * sc - 1e-9) + u.p + u.tp + auraSum(S, u, "power") + (has(S, u, "flying") ? auraSum(S, u, "flyingBoost") : 0));
}
function healthOf(S, u) {
  const d = defOf(u), sc = u.token ? 1 : (S.players[u.owner].scales[u.id] || 1);
  return Math.ceil(d.health * sc - 1e-9) + u.h + u.th + auraSum(S, u, "health") + (has(S, u, "flying") ? auraSum(S, u, "flyingBoost") : 0);
}
const lifeOf = (S, u) => healthOf(S, u) - u.dmg;
function costOf(S, P, card) {
  let c = card.cost;
  if (card.type !== "being") for (const u of P.board) { const a = defOf(u).aura; if (a && a.spellDiscount) c -= a.spellDiscount; }
  return Math.max(0, c);
}
const findUnit = (S, uid) => { for (const P of S.players) { const u = P.board.find(x => x.uid === uid); if (u) return u; } return null; };
const canAttack = (S, u) => !u.tapped && !u.frozen && (!u.sick || has(S, u, "haste"));
const canBlock = (S, b, a) => !b.tapped && !b.frozen && !has(S, a, "elusive") && (!has(S, a, "flying") || has(S, b, "flying") || has(S, b, "reach"));

/* ---------- putting beings on the board ---------- */
function makeUnit(S, owner, id, token) {
  const u = { uid: ++S.uid, id, owner, dmg: 0, p: 0, h: 0, tp: 0, th: 0, pkw: [], tkw: [], sick: true, tapped: false, frozen: false, frozenUntil: 0 };
  if (token) { const t = C.TOKENS[token]; u.token = token; u.id = "t-" + token; u.def = { ...t, id: "t-" + token, type: "being", cost: 0, token: true }; }
  return u;
}
function summonToken(S, P, token) {
  if (P.board.length >= MAX_BOARD) return;
  const u = makeUnit(S, P.i, null, token); P.board.push(u);
  emit(S, { t: "summon", p: P.i, uid: u.uid, id: u.id, token: true });
}

/* ---------- damage, healing, dying ---------- */
function hurtUnit(S, u, n, src) {
  if (n <= 0 || !u || u.dead) return;
  u.dmg += n; emit(S, { t: "damage", uid: u.uid, n, src: src && src.uid });
  if (src && src.uid && findUnit(S, src.uid)) {
    if (has(S, src, "deathtouch")) u.doomed = true;
    if (has(S, src, "frost")) freeze(S, u);
    if (has(S, src, "lifelink")) heal(S, S.players[src.owner], n);
  }
}
function hurtFace(S, P, n, src) {
  if (n <= 0) return;
  P.life -= n; emit(S, { t: "face", p: P.i, n, src: src && src.uid });
  if (src && src.uid && findUnit(S, src.uid) && has(S, src, "lifelink")) heal(S, S.players[src.owner], n);
}
function heal(S, P, n) { if (n > 0) { P.life += n; emit(S, { t: "heal", p: P.i, n }); } }
function freeze(S, u) {
  u.frozen = true; u.frozenUntil = u.owner === S.active ? S.turn + 2 : S.turn + 1;   // thaws at the end of its owner's next turn
  emit(S, { t: "freeze", uid: u.uid });
}
function kill(S, u) { if (u && !u.dead) u.doomed = true; }
function settle(S) {
  for (let guard = 0; guard < 10; guard++) {
    const dying = [];
    for (const P of S.players) for (const u of P.board) if (!u.dead && (u.doomed || lifeOf(S, u) <= 0)) dying.push(u);
    if (!dying.length) break;
    for (const u of dying) {
      u.dead = true; const P = S.players[u.owner];
      P.board = P.board.filter(x => x !== u);
      if (!u.token) P.lost.push(u.id);
      emit(S, { t: "death", uid: u.uid, p: P.i });
      for (const e of defOf(u).death || []) resolve(S, P, e, null, u);
    }
  }
  checkOver(S);
}
function checkOver(S) {
  if (S.phase === "over") return;
  const dead = S.players.map(P => P.life <= 0);
  if (dead[0] || dead[1]) { S.winner = dead[0] && dead[1] ? null : dead[0] ? 1 : 0; S.phase = "over"; emit(S, { t: "over", winner: S.winner }); }
}

/* ---------- targets ---------- */
const TARGETED = new Set(["any", "being", "enemyBeing", "ownBeing", "attacker"]);
const targetOf = card => (card.type === "being" ? card.arrive : card.fx || []).find(e => TARGETED.has(e.to)) || null;
function validTarget(S, P, e, tgt) {
  if (!tgt) return false;
  const foe = 1 - P.i;
  if (tgt.player != null) return e.to === "any" && (tgt.player === 0 || tgt.player === 1);
  const u = findUnit(S, tgt.uid); if (!u) return false;
  const enemy = u.owner !== P.i;
  if (enemy && has(S, u, "veiled")) return false;
  switch (e.to) {
    case "any": case "being": return true;
    case "enemyBeing": return u.owner === foe && (e.maxPower == null || powerOf(S, u) <= e.maxPower);
    case "ownBeing": return !enemy;
    case "attacker": return !!(S.pending && S.pending.attackers.includes(u.uid));
  }
  return false;
}
function anyTarget(S, P, e) {
  if (e.to === "any") return true;
  for (const Q of S.players) for (const u of Q.board) if (validTarget(S, P, e, { uid: u.uid })) return true;
  return false;
}

/* ---------- effects ---------- */
function spellBonus(S, P, src) { return src && src.spell ? P.relics.reduce((a, r) => a + ((C.cardOf(r.id).static || {}).spellDmg || 0), 0) : 0; }
function resolve(S, P, e, tgt, src) {
  const foe = S.players[1 - P.i];
  const T = tgt && tgt.uid != null ? findUnit(S, tgt.uid) : null;
  switch (e.k) {
    case "dmg": {
      const n = e.n + spellBonus(S, P, src);
      if (e.to === "enemyPlayer") hurtFace(S, foe, n, src);
      else if (e.to === "allEnemyBeings" || e.to === "allEnemy") { for (const u of foe.board.slice()) if (e.minPower == null || powerOf(S, u) >= e.minPower) hurtUnit(S, u, n, src); if (e.to === "allEnemy") hurtFace(S, foe, n, src); }
      else if (e.to === "allBeings") for (const Q of S.players) for (const u of Q.board.slice()) hurtUnit(S, u, n, src);
      else if (tgt && tgt.player != null) hurtFace(S, S.players[tgt.player], n, src);
      else if (T) hurtUnit(S, T, n, src);
      break;
    }
    case "gain": heal(S, P, e.n); break;
    case "draw": for (let k = 0; k < e.n; k++) draw(S, P); break;
    case "crystal": P.ess += e.n; emit(S, { t: "crystal", p: P.i, n: e.n }); break;
    case "ramp": P.maxEss = Math.min(MAX_CRYSTALS, P.maxEss + e.n); P.ess += e.n; emit(S, { t: "crystal", p: P.i, n: e.n, ramp: true }); break;
    case "buff": {
      const list = e.to === "allOwn" ? P.board.slice() : T ? [T] : [];
      for (const u of list) {
        if (e.perm) { u.p += e.p; u.h += e.h; if (e.kw) u.pkw.push(...e.kw); } else { u.tp += e.p; u.th += e.h; if (e.kw) u.tkw.push(...e.kw); }
        emit(S, { t: "buff", uid: u.uid, p: e.p, h: e.h });
      }
      break;
    }
    case "destroy": {
      if (e.to === "allMinPower4") { for (const Q of S.players) for (const u of Q.board) if (powerOf(S, u) >= 4) kill(S, u); }
      else if (e.to === "allOtherMaxPower2") { for (const Q of S.players) for (const u of Q.board) if (u !== src && powerOf(S, u) <= 2) kill(S, u); }
      else if (T) kill(S, T);
      break;
    }
    case "sacrifice": if (T) kill(S, T); break;
    case "bounce": {
      if (!T) break;
      const Q = S.players[T.owner]; Q.board = Q.board.filter(x => x !== T); T.dead = true;
      emit(S, { t: "bounce", uid: T.uid, p: Q.i });
      if (!T.token && Q.hand.length < MAX_HAND) Q.hand.push({ uid: ++S.uid, id: T.id });
      break;
    }
    case "freeze": {
      if (e.to === "allEnemy") { for (const u of foe.board) if (e.maxCost == null || defOf(u).cost <= e.maxCost) freeze(S, u); }
      else if (T) freeze(S, T);
      break;
    }
    case "summon": for (let k = 0; k < e.n; k++) summonToken(S, P, e.token); break;
    case "raise": { const id = P.lost.pop(); if (id && P.hand.length < MAX_HAND) { P.hand.push({ uid: ++S.uid, id }); emit(S, { t: "raise", p: P.i, id }); } break; }
  }
}
function draw(S, P) {
  if (!P.deck.length) { P.life = 0; emit(S, { t: "empty", p: P.i }); checkOver(S); return; }
  const c = P.deck.shift();
  if (P.hand.length >= MAX_HAND) { emit(S, { t: "burn", p: P.i, id: c.id }); return; }
  P.hand.push(c); emit(S, { t: "draw", p: P.i });
}
const triggers = (S, P, when) => {
  for (const u of P.board.slice()) for (const e of defOf(u)[when] || []) resolve(S, P, e, null, u);
  for (const r of P.relics) for (const e of C.cardOf(r.id)[when] || []) resolve(S, P, e, null, { spell: true });
};

/* ---------- turns ---------- */
function startTurn(S) {
  const P = S.players[S.active];
  S.turn++; S.attacked = false; S.phase = "main"; S.pending = null;
  P.maxEss = Math.min(MAX_CRYSTALS, P.maxEss + 1); P.ess = P.maxEss + (P.bonus || 0); P.bonus = 0;
  for (const u of P.board) { u.tapped = false; u.sick = false; }
  emit(S, { t: "turn", p: P.i, turn: S.turn });
  if (S.turn > 1) draw(S, P);
  if (S.phase === "over") return;
  triggers(S, P, "turnStart"); settle(S);
}
function endTurn(S) {
  const P = S.players[S.active];
  triggers(S, P, "turnEnd"); settle(S);
  if (S.phase === "over") return;
  for (const Q of S.players) for (const u of Q.board) { u.dmg = 0; u.tp = 0; u.th = 0; u.tkw = []; if (u.frozen && u.frozenUntil <= S.turn) u.frozen = false; }
  if (S.turn >= TURN_LIMIT) {
    const [a, b] = S.players.map(Q => Q.life);
    S.winner = a === b ? null : a > b ? 0 : 1; S.phase = "over"; emit(S, { t: "over", winner: S.winner, limit: true }); return;
  }
  S.active = 1 - S.active;
  startTurn(S);
}

/* ---------- combat ---------- */
function combat(S) {
  const A = S.players[S.active], D = S.players[1 - S.active];
  const blockerOf = uid => Object.keys(S.pending.blocks).map(Number).find(k => S.pending.blocks[k] === uid);
  const pairs = S.pending.attackers.map(uid => { const b = findUnit(S, blockerOf(uid)); return { a: findUnit(S, uid), b, blocked: !!b }; }).filter(x => x.a);
  const strike = (x, first) => {
    const { a, b } = x;
    const goes = u => u && !u.dead && lifeOf(S, u) > 0 && !u.doomed && (first ? has(S, u, "firstStrike") || has(S, u, "doubleStrike") : !has(S, u, "firstStrike") || has(S, u, "doubleStrike"));
    if (b && !b.dead) {
      const aGo = goes(a), bGo = goes(b);
      const pa = aGo ? powerOf(S, a) : 0, pb = bGo ? powerOf(S, b) : 0;
      if (aGo) {
        const need = has(S, a, "deathtouch") ? Math.min(1, lifeOf(S, b)) : Math.max(0, lifeOf(S, b));
        // trample: just enough to kill the blocker, the rest to the player
        const toB = has(S, a, "trample") ? Math.min(pa, need) : pa;
        hurtUnit(S, b, toB, a);
        if (pa > toB) hurtFace(S, D, pa - toB, a);
      }
      if (bGo) hurtUnit(S, a, pb, b);
    } else if (goes(a)) {
      // a blocked attacker whose blocker is already gone deals no damage, unless it tramples over
      if (!x.blocked) hurtFace(S, D, powerOf(S, a), a);
      else if (has(S, a, "trample")) hurtFace(S, D, powerOf(S, a), a);
    }
  };
  for (const x of pairs) strike(x, true);
  settle(S);
  if (S.phase === "over") return;
  for (const x of pairs) strike(x, false);
  settle(S);
}

/* ---------- moves ---------- */
function act(S, who, a) {
  if (!a || S.phase === "over") return "The match is over.";
  const P = S.players[who], defending = S.phase === "block" && who !== S.active;
  if (a.type === "resign") { S.winner = 1 - who; S.phase = "over"; emit(S, { t: "over", winner: S.winner, resign: true }); return null; }
  if (a.type === "play") {
    const ref = P.hand.find(c => c.uid === a.uid);
    if (!ref) return "That card isn't in your hand.";
    const card = C.cardOf(ref.id);
    const myMain = S.phase === "main" && who === S.active;
    if (!(myMain || (defending && card.type === "rite"))) return defending ? "While blocking you can only cast Rites." : "It's not your turn.";
    const cost = costOf(S, P, card);
    if (cost > P.ess) return "Not enough crystals.";
    if (card.type === "being" && P.board.length >= MAX_BOARD) return "Your side of the table is full.";
    const te = targetOf(card);
    let tgt = null;
    if (te) {
      const need = card.type !== "being" || anyTarget(S, P, te);
      if (need && !validTarget(S, P, te, a.target)) return anyTarget(S, P, te) ? "Pick a valid target." : "There's nothing to target.";
      tgt = need ? a.target : null;
    }
    P.ess -= cost; P.hand = P.hand.filter(c => c !== ref);
    emit(S, { t: "play", p: who, uid: ref.uid, id: ref.id, target: tgt || null });
    if (card.type === "being") {
      const u = makeUnit(S, who, ref.id); u.uid = ref.uid; P.board.push(u);
      emit(S, { t: "summon", p: who, uid: u.uid, id: u.id });
      for (const e of card.arrive) resolve(S, P, e, TARGETED.has(e.to) ? tgt : null, u);
    } else if (card.type === "relic") {
      P.relics.push(ref); emit(S, { t: "relic", p: who, id: ref.id });
    } else {
      for (const e of card.fx) resolve(S, P, e, TARGETED.has(e.to) ? tgt : null, { spell: true });
    }
    settle(S);
    return null;
  }
  if (a.type === "attack") {
    if (S.phase !== "main" || who !== S.active) return "You can attack on your turn.";
    if (S.attacked) return "You've already attacked this turn.";
    const ids = Array.isArray(a.attackers) ? [...new Set(a.attackers)] : [];
    if (!ids.length) return "Choose who attacks.";
    const units = ids.map(id => P.board.find(u => u.uid === id));
    if (units.some(u => !u || !canAttack(S, u))) return "One of those can't attack now.";
    S.attacked = true; S.phase = "block"; S.pending = { attackers: ids, blocks: {} };
    for (const u of units) if (!has(S, u, "vigilance")) u.tapped = true;
    emit(S, { t: "attack", p: who, attackers: ids });
    for (const u of units) for (const e of defOf(u).onAttack || []) resolve(S, P, e, null, u);
    settle(S);
    return null;
  }
  if (a.type === "block") {
    if (!defending) return "Nothing to block.";
    const blocks = {}, used = new Set();
    for (const [k, v] of Object.entries(a.blocks || {})) {
      const b = P.board.find(u => u.uid === Number(k)), at = findUnit(S, Number(v));
      if (!b || !at || !S.pending.attackers.includes(at.uid) || !canBlock(S, b, at)) return "One of those blocks isn't allowed.";
      if (used.has(at.uid)) return "Only one blocker per attacker.";
      used.add(at.uid); blocks[b.uid] = at.uid;
    }
    S.pending.blocks = blocks;
    emit(S, { t: "block", p: who, blocks });
    combat(S);
    if (S.phase !== "over") { S.phase = "main"; S.pending = null; }
    return null;
  }
  if (a.type === "end") {
    if (S.phase !== "main" || who !== S.active) return "It's not your turn.";
    endTurn(S);
    return null;
  }
  return "That move isn't allowed.";
}

/* ---------- what a player may see ---------- */
function unitView(S, u) {
  return { uid: u.uid, id: u.id, owner: u.owner, token: u.token ? { ...u.def } : null, power: powerOf(S, u), health: healthOf(S, u), dmg: u.dmg,
    kw: [...kwOf(S, u)], sick: u.sick, tapped: u.tapped, frozen: u.frozen, canAttack: u.owner === S.active && S.phase === "main" && !S.attacked && canAttack(S, u) };
}
function view(S, me) {
  const side = (P, mine) => ({ name: P.name, life: P.life, ess: P.ess, maxEss: P.maxEss, deck: P.deck.length, board: P.board.map(u => unitView(S, u)), relics: P.relics.map(r => r.id),
    hand: mine ? P.hand.map(c => ({ uid: c.uid, id: c.id, cost: costOf(S, P, C.cardOf(c.id)) })) : P.hand.length, lost: P.lost.length });
  return { turn: S.turn, active: S.active === me ? "you" : "rival", phase: S.phase, attacked: S.attacked, winner: S.winner == null ? null : S.winner === me ? "you" : "rival",
    pending: S.pending ? { attackers: S.pending.attackers, blocks: S.pending.blocks } : null, you: side(S.players[me], true), rival: side(S.players[1 - me], false) };
}

module.exports = { newMatch, act, view, powerOf, healthOf, lifeOf, kwOf, has, canAttack, canBlock, costOf, validTarget, anyTarget, targetOf, findUnit, defOf, rng,
  START_LIFE, MAX_BOARD, MAX_CRYSTALS, TURN_LIMIT };
