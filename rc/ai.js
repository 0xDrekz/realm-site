/* ============================================================
   REALM Cards — the computer player.

   One move at a time: move(S, who) returns the next action for that side,
   or null when it isn't their decision. It looks one step ahead by playing
   each option on a copy of the match and scoring the board; it only reads
   what a player could know (its own hand, the table, life totals: the rival's
   hand and both decks count only as numbers).

   level 0..1: lower levels add noise to every judgement and skip the trickier
   plays (casting Rites while defending, holding back blockers).
   ============================================================ */
"use strict";
const C = require("./cards"), E = require("./engine");

const HAND_CARD = 2.0;

function clone(S) { const ev = S.events; S.events = []; const c = JSON.parse(JSON.stringify(S)); S.events = ev; return c; }

/* ---------- scoring a position for one side ---------- */
function lifeScore(l) { return l <= 0 ? -1e4 : l * 0.5 - (l < 8 ? (8 - l) * 0.7 : 0) - (l < 4 ? (4 - l) * 1.2 : 0); }
function unitValue(S, u) {
  const p = Math.max(0, E.powerOf(S, u) - u.tp), h = Math.max(1, E.lifeOf(S, u) - u.th), d = E.defOf(u), kw = E.kwOf(S, u);
  let v = p + 0.8 * h + 0.3;
  if (kw.has("flying")) v += 0.5 * p;
  if (kw.has("elusive")) v += 0.8 * p;
  if (kw.has("doubleStrike")) v += p;
  if (kw.has("lifelink")) v += 0.5 * p;
  if (kw.has("deathtouch")) v += 1.5;
  if (kw.has("firstStrike")) v += 0.6;
  if (kw.has("trample")) v += 0.3;
  if (kw.has("vigilance")) v += 0.4;
  if (kw.has("veiled")) v += 0.6;
  if (kw.has("frost")) v += 0.5;
  if (kw.has("reach")) v += 0.2;
  if (d.turnStart && d.turnStart.length) v += 2.2;
  if (d.turnEnd && d.turnEnd.length) v += 1.8;
  if (d.onAttack && d.onAttack.length) v += 1.5;
  if (d.death && d.death.length) v += 1.5;
  if (d.aura) v += 1 + 0.8 * (S.players[u.owner].board.length - 1);
  if (u.frozen) v -= 0.3 * p;
  return v;
}
/* what the rival could hit me for on their next attack, roughly */
function threat(S, me) {
  const P = S.players[me], F = S.players[1 - me];
  const att = F.board.filter(u => !(u.frozen && u.frozenUntil > S.turn + 1)).map(u => E.powerOf(S, u) - u.tp).sort((a, b) => b - a);
  const ready = S.active === me ? P.board.length : P.board.filter(u => !u.tapped && !u.frozen).length;
  return att.slice(ready).reduce((a, b) => a + b, 0);
}
function evaluate(S, me) {
  // a loss by less is still better: it gives blocking something to aim for
  if (S.phase === "over") return S.winner === me ? 1e5 + S.players[me].life : S.winner == null ? 0 : -1e5 + Math.max(-50, S.players[me].life);
  const P = S.players[me], F = S.players[1 - me];
  let v = 0.6 * lifeScore(P.life) + 0.4 * lifeScore(P.life - threat(S, me)) - lifeScore(F.life);
  for (const u of P.board) v += unitValue(S, u);
  for (const u of F.board) v -= unitValue(S, u);
  v += Math.min(P.hand.length, 8) * HAND_CARD - Math.min(F.hand.length, 8) * HAND_CARD;
  v += (P.relics.length - F.relics.length) * 3;
  v += (P.maxEss - F.maxEss) * 1.2;
  if (P.deck.length < 3) v -= (3 - P.deck.length) * 3;
  return v;
}

/* ---------- the options ---------- */
function targetsFor(S, P, te) {
  const all = [{ player: 1 - P.i }, { player: P.i }, ...S.players.flatMap(Q => Q.board.map(u => ({ uid: u.uid })))];
  return all.filter(t => E.validTarget(S, P, te, t));
}
function plays(S, who, onlyRites) {
  const P = S.players[who], out = [];
  for (const c of P.hand) {
    const card = C.cardOf(c.id);
    if (onlyRites && card.type !== "rite") continue;
    if (E.costOf(S, P, card) > P.ess) continue;
    if (card.type === "being" && P.board.length >= E.MAX_BOARD) continue;
    const te = E.targetOf(card);
    if (!te) { out.push({ type: "play", uid: c.uid }); continue; }
    const ts = targetsFor(S, P, te);
    if (!ts.length) { if (card.type === "being") out.push({ type: "play", uid: c.uid }); continue; }
    for (const t of ts) out.push({ type: "play", uid: c.uid, target: t });
  }
  return out;
}

/* deterministic noise from the position, so the same match plays the same way */
function noise(S, who, salt) {
  let h = (S.seed ^ Math.imul(S.turn + 1, 0x9E3779B1) ^ Math.imul(salt + 7, 0x85EBCA6B) ^ who) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296 - 0.5;
}

/* ---------- blocking ---------- */
/* quick guess at how a side will block, used when planning an attack */
function guessBlocks(S, def) {
  const D = S.players[def], blocks = {}, used = new Set();
  const atts = S.pending.attackers.map(id => E.findUnit(S, id)).filter(Boolean).sort((a, b) => E.powerOf(S, b) - E.powerOf(S, a));
  let incoming = atts.reduce((a, u) => a + E.powerOf(S, u), 0);
  for (const a of atts) {
    const pa = E.powerOf(S, a), la = E.lifeOf(S, a), dtA = E.has(S, a, "deathtouch");
    let best = null, bestScore = 0;
    for (const b of D.board) {
      if (used.has(b.uid) || !E.canBlock(S, b, a)) continue;
      const pb = E.powerOf(S, b), lb = E.lifeOf(S, b);
      const kills = pb >= la || (E.has(S, b, "deathtouch") && pb > 0), dies = pa >= lb || (dtA && pa > 0);
      let sc = (kills ? unitValue(S, a) : 0) - (dies ? unitValue(S, b) : 0) + (kills && !dies ? 2 : 0);
      if (D.life - incoming <= 0 || D.life - incoming < 4) sc += pa;   // chump when it's life or death
      if (sc > bestScore) { bestScore = sc; best = b; }
    }
    if (best) { used.add(best.uid); blocks[best.uid] = a.uid; incoming -= pa; }
  }
  return blocks;
}
function afterBlocks(S, def, blocks) { const c = clone(S); E.act(c, def, { type: "block", blocks }); return c; }
/* the real decision: try each blocker on each attacker on a copy */
function chooseBlocks(S, def, level) {
  const D = S.players[def];
  const atts = S.pending.attackers.map(id => E.findUnit(S, id)).filter(Boolean).sort((a, b) => E.powerOf(S, b) - E.powerOf(S, a));
  const blocks = {}, used = new Set();
  let base = evaluate(afterBlocks(S, def, blocks), def);
  for (const a of atts) {
    let best = null, bestV = base;
    for (const b of D.board) {
      if (used.has(b.uid) || !E.canBlock(S, b, a)) continue;
      const v = evaluate(afterBlocks(S, def, { ...blocks, [b.uid]: a.uid }), def) + noise(S, def, b.uid * 31 + a.uid) * (1 - level) * 4;
      if (v > bestV) { bestV = v; best = b; }
    }
    if (best) { blocks[best.uid] = a.uid; used.add(best.uid); base = bestV; }
  }
  return { blocks, value: base };
}

/* ---------- attacking ---------- */
function attackValue(S, who, ids) {
  const c = clone(S);
  if (E.act(c, who, { type: "attack", attackers: ids })) return -Infinity;
  if (c.phase === "block") E.act(c, 1 - who, { type: "block", blocks: guessBlocks(c, 1 - who) });
  return evaluate(c, who);
}
function chooseAttack(S, who, level) {
  const P = S.players[who];
  const ready = P.board.filter(u => E.canAttack(S, u));
  if (!ready.length) return null;
  const all = ready.map(u => u.uid);
  let chosen = [], bestV = evaluate(S, who);
  const allV = attackValue(S, who, all);
  if (allV >= 1e4) return all;   // it's lethal
  for (;;) {
    let pick = null, pv = bestV;
    for (const u of ready) {
      if (chosen.includes(u.uid)) continue;
      const v = attackValue(S, who, [...chosen, u.uid]) + noise(S, who, u.uid) * (1 - level) * 4;
      if (v > pv) { pv = v; pick = u.uid; }
    }
    if (pick == null) break;
    chosen.push(pick); bestV = pv;
  }
  if (allV > bestV) chosen = all;
  return chosen.length ? chosen : null;
}

/* ---------- the next move ---------- */
function move(S, who, { level = 1 } = {}) {
  if (S.phase === "over") return null;
  if (S.phase === "block") {
    if (who === S.active) return null;
    // a Rite first, if one makes the fight go better
    // weaker computers sometimes just forget to block
    if (noise(S, who, 11 + S.pending.attackers.length) + 0.5 < (1 - level) * 0.4) return { type: "block", blocks: {} };
    let { blocks, value } = chooseBlocks(S, who, level);
    if (level >= 0.4) {
      let best = null;
      for (const m of plays(S, who, true)) {
        const c = clone(S); if (E.act(c, who, m)) continue;
        if (c.phase !== "block") { const v = evaluate(c, who); if (v > value + 0.5) { value = v; best = m; } continue; }
        const r = chooseBlocks(c, who, level);
        if (r.value > value + 0.5) { value = r.value; best = m; }
      }
      if (best) return best;
    }
    return { type: "block", blocks };
  }
  if (who !== S.active) return null;
  // play the card that helps most, while one helps at all
  const P = S.players[who], now = evaluate(S, who), step = P.hand.length * 13 + P.ess;
  let best = null, bestV = now + 0.25;
  const good = [];
  for (const m of plays(S, who, false)) {
    const c = clone(S); if (E.act(c, who, m)) continue;
    const raw = evaluate(c, who);
    if (raw > now) good.push(m);
    const v = raw + noise(S, who, m.uid * 7 + (m.target ? (m.target.uid || 0) + (m.target.player != null ? 99 : 0) : 0)) * (1 - level) * 5;
    if (v > bestV) { bestV = v; best = m; }
  }
  // weaker computers sometimes play whatever looks fine rather than the best card
  if (good.length > 1 && noise(S, who, 21 + step) + 0.5 < (1 - level) * 0.5) return good[Math.floor((noise(S, who, 22 + step) + 0.5) * good.length)];
  if (best) return best;
  if (!S.attacked) {
    const ready = P.board.filter(u => E.canAttack(S, u)).map(u => u.uid);
    // ...and sometimes charge in with everything
    if (ready.length && noise(S, who, 31) + 0.5 < (1 - level) * 0.45) return { type: "attack", attackers: ready };
    const ids = chooseAttack(S, who, level);
    if (ids) return { type: "attack", attackers: ids };
  }
  return { type: "end" };
}

module.exports = { move, evaluate, chooseBlocks, chooseAttack, clone };
