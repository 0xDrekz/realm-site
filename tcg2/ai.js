/* ============================================================
   REALM card battler — the AI.

   A plain greedy player: it spends its essence on whatever is worth most
   right now, attacks when an attack is safe or a race it wins, and blocks
   to survive or to trade up. Good enough to be a fair rival and to play
   both sides of the balance simulation; it reads only what any player
   could see on the table.
   ============================================================ */
"use strict";
const E = require("./engine");

const kwValue = { flying: 1.2, haste: 0.4, veiled: 0.5, unblockable: 1.5, lifelink: 0.8, poison: 1.4, freeze: 0.6, firstStrike: 0.9, doubleStrike: 2 };
function value(S, u) {
  return E.powerOf(S, u) * 1.1 + E.lifeOf(S, u) * 0.8 + u.kw.reduce((a, k) => a + (kwValue[k] || 0), 0)
    + (u.def.static || u.def.aura ? 1.2 : 0) + ((u.def.turnStart || []).length ? 1.5 : 0) + ((u.def.turnEnd || []).length ? 0.8 : 0);
}

/* how good is it to play this card now, and at what? */
function judge(S, P, ref) {
  const def = ref.def, Op = S.players[1 - P.i];
  if (def.kind !== "ritual") {
    if (P.board.length >= E.MAX_BOARD) return null;
    let v = def.power * 1.1 + def.health * 0.8 + (def.kw || []).length * 0.7 + (def.cost || 0) * 0.6 + (def.legendary ? 2 : 0);
    for (const e of def.arrive || []) {
      if (e.k === "dmg" && e.to === "enemyUnits") v += Op.board.filter(u => E.lifeOf(S, u) <= e.n).reduce((a, u) => a + value(S, u), 0) + Op.board.length * 0.3;
      if (e.k === "dmg" && e.to === "enemyAll") v += Op.board.filter(u => E.lifeOf(S, u) <= e.n).reduce((a, u) => a + value(S, u), 0) + e.n;
      if (e.k === "destroy" && Op.board.length) v += 3;
      if (e.k === "freeze") v += Op.board.length * 0.6;
    }
    return { v, target: null };
  }
  const e = E.attuned(P, def) && def.attuned ? def.attuned : def.effect;
  switch (e.k) {
    case "dmg":
      if (e.to === "anyTarget") {
        if (Op.life <= e.n) return { v: 100, target: { face: Op.i } };
        const kill = Op.board.filter(u => E.lifeOf(S, u) <= e.n).sort((a, b) => value(S, b) - value(S, a))[0];
        if (kill) return { v: value(S, kill) + 0.5, target: { uid: kill.uid } };
        return Op.life <= 8 ? { v: e.n * 0.7, target: { face: Op.i } } : null;
      }
      if (e.to === "enemyUnits") { const v = Op.board.filter(u => E.lifeOf(S, u) <= e.n).reduce((a, u) => a + value(S, u), 0); return v >= 3 ? { v, target: null } : null; }
      return null;
    case "destroy": {
      const t = Op.board.filter(u => E.validTarget(S, P, e, { uid: u.uid })).sort((a, b) => value(S, b) - value(S, a))[0];
      return t && value(S, t) >= 3 ? { v: value(S, t), target: { uid: t.uid } } : null;
    }
    case "healFace": return P.life <= 12 ? { v: e.n * 0.7, target: null } : null;
    case "draw": return P.hand.length <= 4 ? { v: e.n * 1.6, target: null } : null;
    case "buffUnit": { const t = P.board.slice().sort((a, b) => value(S, b) - value(S, a))[0]; return t ? { v: (e.power + e.health) * 0.9, target: { uid: t.uid } } : null; }
    case "freezeDraw": { const t = Op.board.filter(u => !u.frozen).sort((a, b) => E.powerOf(S, b) - E.powerOf(S, a))[0]; return t ? { v: 1.5 + E.powerOf(S, t) * 0.4, target: { uid: t.uid } } : { v: 0.8, target: null }; }
  }
  return null;
}

/* spend essence: the best play per essence, again and again */
function mainPhase(S, me) {
  for (let guard = 0; guard < 20 && S.phase === "main" && S.active === me; guard++) {
    const P = S.players[me];
    const refs = [...P.hand.map(c => ({ ...c, kindOf: "hand" })),
      ...P.champions.map((c, i) => c.home ? { def: c.def, champion: i, kindOf: "champ" } : null).filter(Boolean)];
    let best = null;
    for (const r of refs) {
      const cost = E.costOf(S, P, r);
      if (cost > P.ess) continue;
      const j = judge(S, P, r);
      if (!j || j.v <= 0.5) continue;
      // spend well: prefer plays that use more of what is left
      const score = j.v + cost * 0.9;
      if (!best || score > best.score) best = { score, r, j };
    }
    if (!best) return;
    const err = E.act(S, me, best.r.champion != null ? { type: "play", champion: best.r.champion, target: best.j.target } : { type: "play", uid: best.r.uid, target: best.j.target });
    if (err) return;
  }
}

/* attack with what is safe, or with everything when the race is won */
function attackPhase(S, me) {
  if (S.phase !== "main" || S.active !== me) return;
  const P = S.players[me], Op = S.players[1 - me];
  const ready = P.board.filter(u => E.canAttack(S, u));
  if (!ready.length) return;
  const blockers = Op.board.filter(b => !b.exhausted);
  const unblockable = a => !blockers.some(b => E.canBlock(S, b, a));
  const dmg = a => E.powerOf(S, a) * (a.kw.includes("doubleStrike") ? 2 : 1);
  const evasive = ready.filter(unblockable).reduce((s, a) => s + dmg(a), 0);
  const all = ready.reduce((s, a) => s + dmg(a), 0);
  let go;
  if (evasive >= Op.life || (blockers.length === 0 && all >= 1)) go = ready;
  else if (all - blockers.reduce((s, b) => s + 0, 0) >= Op.life + blockers.length * 3) go = ready;   // swarm through
  else {
    // keep back enough to survive their counter-attack
    const theirs = Op.board.reduce((s, u) => s + E.powerOf(S, u), 0);
    const mustGuard = theirs >= P.life - 2;
    go = ready.filter(a => {
      if (unblockable(a)) return true;
      const killers = blockers.filter(b => E.canBlock(S, b, a) && E.powerOf(S, b) >= E.lifeOf(S, a) && E.lifeOf(S, b) > E.powerOf(S, a) && !a.kw.includes("poison"));
      if (killers.length) return false;
      if (mustGuard && !a.kw.includes("flying")) return false;
      return true;
    });
  }
  if (go.length) E.act(S, me, { type: "attack", attackers: go.map(u => u.uid) });
}

/* blocks: survive first, then trade up. suggestBlocks only works them out
   (the page offers them to you); blockPhase plays them. */
function blockPhase(S, me) {
  if (S.phase !== "block" || S.active === me) return;
  E.act(S, me, { type: "block", blocks: suggestBlocks(S, me) });
}
function suggestBlocks(S, me) {
  if (S.phase !== "block" || S.active === me) return {};
  const P = S.players[me], Op = S.players[1 - me];
  const atk = S.pending.attackers.map(uid => Op.board.find(u => u.uid === uid)).filter(Boolean)
    .sort((a, b) => E.powerOf(S, b) - E.powerOf(S, a));
  const free = P.board.filter(b => !b.exhausted);
  const blocks = {};
  const dmg = a => E.powerOf(S, a) * (a.kw.includes("doubleStrike") ? 2 : 1);
  let incoming = atk.reduce((s, a) => s + dmg(a), 0);
  for (const a of atk) {
    const can = free.filter(b => !blocks[b.uid] && E.canBlock(S, b, a));
    if (!can.length) continue;
    const kills = b => E.powerOf(S, b) >= E.lifeOf(S, a) || b.kw.includes("poison");
    const survives = b => E.lifeOf(S, b) > E.powerOf(S, a) && !a.kw.includes("poison");
    let choice = can.filter(b => kills(b) && survives(b)).sort((x, y) => value(S, x) - value(S, y))[0];
    if (!choice) choice = can.filter(b => kills(b) && value(S, b) <= value(S, a) + 0.5).sort((x, y) => value(S, x) - value(S, y))[0];
    if (!choice && incoming >= P.life) choice = can.sort((x, y) => value(S, x) - value(S, y))[0];   // chump to live
    if (!choice && survives(can[0]) ) choice = can.filter(survives).sort((x, y) => value(S, x) - value(S, y))[0];
    if (choice) { blocks[choice.uid] = a.uid; incoming -= dmg(a); }
  }
  return blocks;
}

/* one whole AI turn (or its blocks, if it is defending) */
function step(S, me) {
  if (S.phase === "block" && S.active !== me) return blockPhase(S, me);
  if (S.active !== me || S.phase !== "main") return;
  mainPhase(S, me);
  attackPhase(S, me);
  if (S.phase === "block") return;          // the other side must block first
  if (S.phase === "main" && S.active === me) { mainPhase(S, me); E.act(S, me, { type: "end" }); }
}

/* after combat on the AI's own turn, finish the turn */
function finish(S, me) {
  if (S.phase === "main" && S.active === me) { mainPhase(S, me); E.act(S, me, { type: "end" }); }
}

/* an AI-vs-AI match to the end */
function playOut(S, maxSteps = 4000) {
  for (let k = 0; k < maxSteps && S.phase !== "over"; k++) {
    if (S.phase === "block") { blockPhase(S, 1 - S.active); finish(S, S.active); }
    else step(S, S.active);
    S.events.length = 0;
  }
  return S.winner;
}

module.exports = { step, finish, blockPhase, suggestBlocks, mainPhase, attackPhase, playOut, value };
