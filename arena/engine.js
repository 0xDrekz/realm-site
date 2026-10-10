/* ============================================================
   REALM Arena — the battle engine.

   Real time, in fixed steps (20 a second). The same file runs in the
   browser (to play the match smoothly) and on the server (to replay it
   from the placements alone and decide the result), so it must give the
   same answer everywhere: one seeded generator, and no maths that can
   differ between engines (only + - * / and Math.sqrt).

   THE RULES
   - Portrait arena, 18 wide and 32 tall. You hold the bottom half, the
     rival the top. A river crosses the middle; two bridges cross it.
   - Each side has two Gate towers and a Throne. Destroy the Throne and you
     win at once; otherwise, after 3 minutes, more towers destroyed wins.
     Level? One minute of sudden death: the next tower to fall decides it.
   - DMT fills a bar up to 10. Every card costs DMT. Minute 2 ("Rising")
     fills it 1.5x faster and makes new units 15% stronger; minute 3
     ("Peak") 2x and 30%.
   - Your deck is 8 cards: 4 in hand and the next one waiting. A card goes
     to the back of the queue as soon as you play it.
   - Units are placed on your own half (or deeper, in a lane whose enemy
     Gate has fallen). Spells can go anywhere.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RealmArena = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TICK = 20, DT = 1 / TICK;
  const W = 18, H = 32, RIVER = 16;
  const BRIDGES = [3.5, 14.5];
  const MATCH_S = 180, OVERTIME_S = 60, MAX_DMT = 10;
  const SIGHT = 6;

  /* ---------- a small seeded generator (mulberry32) ---------- */
  function rng(S) {
    let t = (S.seed = (S.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const dist = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); };
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  /* the tempo of the match: how fast DMT comes, how strong new units are */
  function phaseOf(time) {
    if (time >= MATCH_S) return { name: "overtime", rate: 2, power: 1.3 };
    if (time >= 120) return { name: "peak", rate: 2, power: 1.3 };
    if (time >= 60) return { name: "rising", rate: 1.5, power: 1.15 };
    return { name: "calm", rate: 1, power: 1 };
  }
  const DMT_PER_S = 1 / 2.8;

  /* ---------- towers ---------- */
  const TOWERS = [
    { kind: "gate", lane: 0, x: 3.5, y: 25.5 }, { kind: "gate", lane: 1, x: 14.5, y: 25.5 }, { kind: "throne", lane: -1, x: 9, y: 29 },
  ];
  const TOWER_STATS = { gate: { hp: 1350, dmg: 75, hit: 0.8, range: 7, r: 1.1 }, throne: { hp: 2400, dmg: 95, hit: 1.0, range: 7.5, r: 1.5 } };

  /* ---------- making a match ----------
     sides: [{ deck: [8 card defs], ai: false }, { deck, ai: true, level: 0..2 }]
     A card def is plain data made on the server (arena/cards.js). */
  function createMatch({ seed, sides }) {
    const S = { seed: seed >>> 0, tick: 0, time: 0, over: false, winner: null, id: 0, ents: [], shots: [], zones: [], flights: [], events: [], crowns: [0, 0], sides: [], log: [] };
    for (let i = 0; i < 2; i++) {
      const sd = sides[i] || {};
      const order = sd.deck.map((_, k) => k);
      for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng(S) * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      S.sides.push({ i, deck: sd.deck, hand: order.slice(0, 4), queue: order.slice(4), dmt: 5, ai: sd.ai ? { level: sd.level || 1, next: 1 + rng(S) * 1.5 } : null, gatesDown: [false, false] });
      for (const t of TOWERS) {
        const st = TOWER_STATS[t.kind], y = i === 0 ? t.y : H - t.y;
        S.ents.push({ id: ++S.id, side: i, kind: "tower", tower: t.kind, lane: t.lane, x: t.x, y, r: st.r, hp: st.hp, max: st.hp, dmg: st.dmg, hit: st.hit, range: st.range, cd: 0, air: false, targetsAir: true });
      }
    }
    return S;
  }

  /* ---------- placing a card ---------- */
  function canPlaceAt(S, side, def, x, y) {
    if (!(x >= 0.5 && x <= W - 0.5 && y >= 0.5 && y <= H - 0.5)) return false;
    if (def.kind === "spell") return true;
    // your own half; or the enemy's, in a lane whose Gate has fallen
    const own = side === 0 ? y >= RIVER + 1 : y <= RIVER - 1;
    if (own) return true;
    const lane = x < W / 2 ? 0 : 1, enemy = S.sides[1 - side];
    if (!enemy.gatesDown[lane]) return false;
    return side === 0 ? y >= 10 : y <= H - 10;
  }
  function place(S, side, slot, x, y) {
    if (S.over) return "The match is over.";
    const P = S.sides[side];
    if (!(slot >= 0 && slot < 4)) return "Pick a card.";
    const ci = P.hand[slot], def = P.deck[ci];
    if (!def) return "Pick a card.";
    if (P.dmt + 1e-9 < def.cost) return "Not enough DMT.";
    if (!canPlaceAt(S, side, def, x, y)) return "You can't place it there.";
    P.dmt -= def.cost;
    P.hand[slot] = P.queue.shift(); P.queue.push(ci);
    S.events.push({ t: "play", side, card: def.id, x, y });
    if (def.kind === "spell") cast(S, side, def, x, y);
    else deploy(S, side, def, x, y, phaseOf(S.time).power);
    return null;
  }

  /* ---------- units ----------
     Every fighter has a STYLE, its own way of killing:
       gas     a toxic cloud that keeps hurting whatever stands in it
       chain   lightning that jumps from enemy to enemy
       beam    a beam that grows hotter the longer it holds one target
       burst   lands with a blast; every hit is an explosion
       roots   pins its target in place
       orbit   moons circle it and smash everything close
       cloak   unseen (can't be targeted) until it strikes
       frost   freezes; acid poisons; drain heals itself; fire burns; first hits double once
       descend a God: falls from the sky striking lightning, and keeps calling bolts down
       ethereal an Entity: marches on towers, and only towers can hurt it
       prime   the Source: a cataclysm on arrival, and allies near it hit harder */
  function spawn(S, side, def, x, y, power, extra = {}) {
    const hp = Math.round(def.hp * power), st = def.style, u = {
      id: ++S.id, side, kind: "unit", def, style: st || null, name: def.name, n: def.n || null, x: clamp(x, 0.5, W - 0.5), y: clamp(y, 0.5, H - 0.5), r: def.r || 0.45,
      hp, max: hp, shield: 0, dmg: Math.round(def.dmg * power), hit: def.hit, range: def.range,
      speed: def.speed, air: !!def.air, targetsAir: !!def.targetsAir, buildings: !!def.buildings, splash: def.splash || 0,
      cd: 0, wake: st === "descend" || st === "prime" ? 1.3 : 1, target: null, slowUntil: 0, rootUntil: 0, poison: null, burn: null, firstHit: st === "first",
      cloaked: st === "cloak", ethereal: st === "ethereal", ramp: 1, rampOn: null, tick: 0, ...extra,
    };
    S.ents.push(u);
    S.events.push({ t: "spawn", id: u.id, side, x: u.x, y: u.y, n: u.n, style: st || null, big: st === "descend" || st === "prime" || st === "ethereal" });
    return u;
  }
  function deploy(S, side, def, x, y, power) {
    const u = spawn(S, side, def, x, y, power);
    if (def.style === "burst") blast(S, side, x, y, 2.5, def.blastDmg * power, "burst");
    if (def.style === "descend") bolts(S, u, 3, def.blastDmg * power);
    if (def.style === "prime") { blast(S, side, x, y, 4, def.blastDmg * power, "prime"); bolts(S, u, 5, def.blastDmg * power * 0.6); }
    return u;
  }

  /* lightning from the sky onto up to k enemies near a God */
  function bolts(S, u, k, dmg) {
    const near = S.ents.filter(e => e.side !== u.side && e.hp > 0 && !e.ethereal && dist(e, u) <= 6.5)
      .sort((a, b) => dist(a, u) - dist(b, u)).slice(0, k);
    S.events.push({ t: "bolts", side: u.side, x: u.x, y: u.y, pts: near.map(e => ({ x: e.x, y: e.y })) });
    for (const e of near) { hurt(S, e, e.kind === "tower" ? dmg * 0.35 : dmg, null); if (e.kind === "unit") { e.slowUntil = S.time + 1; e.frozen = true; } }
  }

  function blast(S, side, x, y, radius, dmg, fx) {
    S.events.push({ t: "blast", side, x, y, r: radius, fx });
    for (const e of S.ents) {
      if (e.side === side || e.hp <= 0) continue;
      if (dist(e, { x, y }) <= radius + e.r) hurt(S, e, e.kind === "tower" ? dmg * 0.35 : dmg, null);
    }
  }
  /* damage spells travel: a Supernova flies from your Throne across the arena, lightning
     takes a breath to fall from the sky. They land where they were aimed, a moment later. */
  function cast(S, side, def, x, y) {
    if (def.effect === "damage") {
      const fx = 9, fy = side === 0 ? H - 3 : 3, d = Math.sqrt((x - fx) * (x - fx) + (y - fy) * (y - fy));
      const land = S.tick + (def.id === "nova" ? Math.max(8, Math.round(d / 16 * TICK)) : 6);
      S.flights.push({ side, def, x, y, land });
      S.events.push({ t: "launch", side, fx: def.id, x, y, fromX: fx, fromY: fy, dur: (land - S.tick) / TICK });
    }
    if (def.effect === "heal") {
      S.events.push({ t: "blast", side, x, y, r: def.radius, fx: def.id });
      for (const e of S.ents) if (e.side === side && e.kind === "unit" && e.hp > 0 && dist(e, { x, y }) <= def.radius + e.r) { e.hp = Math.min(e.max, e.hp + def.amount); e.shield += Math.round(def.amount * 0.3); S.events.push({ t: "heal", id: e.id, n: def.amount }); }
    }
    if (def.effect === "freeze") {
      S.events.push({ t: "blast", side, x, y, r: def.radius, fx: def.id });
      for (const e of S.ents) if (e.side !== side && e.kind === "unit" && e.hp > 0 && !e.ethereal && dist(e, { x, y }) <= def.radius + e.r) e.slowUntil = S.time + def.amount, e.frozen = true;
    }
  }

  function hurt(S, e, n, src) {
    if (e.hp <= 0) return;
    // an Entity is beyond the reach of anything but a tower
    if (e.ethereal && !(src && src.kind === "tower")) { if (n >= 1) S.events.push({ t: "immune", id: e.id, x: e.x, y: e.y }); return; }
    n = Math.round(n);
    if (e.shield > 0) { const s = Math.min(e.shield, n); e.shield -= s; n -= s; }
    e.hp -= n;
    S.events.push({ t: "hit", id: e.id, n, x: e.x, y: e.y, tower: e.kind === "tower" });
    const st = src && src.style;
    if (!st || e.kind !== "unit") { if (st === "drain") src.hp = Math.min(src.max, src.hp + n * 0.35); return; }
    if (st === "drain") src.hp = Math.min(src.max, src.hp + n * 0.35);
    if (st === "frost") { e.slowUntil = S.time + 1.6; e.chilled = true; }
    if (st === "acid") e.poison = { dps: src.dmg * 0.3, until: S.time + 3 };
    if (st === "fire") e.burn = { dps: src.dmg * 0.25, until: S.time + 2.5 };
    if (st === "roots") { e.rootUntil = S.time + 1.3; S.events.push({ t: "roots", id: e.id, x: e.x, y: e.y }); }
  }

  /* what a unit goes for: the nearest enemy it can hit, within sight; else a tower down its lane */
  function canHit(S, a, e) {
    if (e.side === a.side || e.hp <= 0) return false;
    if (e.cloaked) return false;
    if (a.buildings) return e.kind === "tower";
    if (e.air && !a.targetsAir) return false;
    if (e.ethereal && a.kind !== "tower") return false;    // no point: only towers can hurt it
    return true;
  }
  function pickTarget(S, u) {
    let best = null, bd = 1e9;
    for (const e of S.ents) {
      if (!canHit(S, u, e)) continue;
      const d = dist(u, e) - e.r;
      if (d < bd && (d <= SIGHT || e.kind === "tower")) { bd = d; best = e; }
    }
    if (best && (best.kind !== "tower" || bd <= SIGHT)) return best;
    // no one near: march on the nearest standing tower in this lane, then the Throne
    const lane = u.x < W / 2 ? 0 : 1;
    const towers = S.ents.filter(e => e.kind === "tower" && e.side !== u.side && e.hp > 0);
    return towers.find(t => t.lane === lane) || towers.find(t => t.tower === "throne") || towers[0] || null;
  }

  /* where to walk: straight for flyers; ground units cross at a bridge */
  function waypoint(u, tg) {
    if (u.air) return tg;
    const mySideBelow = u.y > RIVER, tgBelow = tg.y > RIVER;
    const onBridge = Math.abs(u.y - RIVER) < 1.4 && BRIDGES.some(b => Math.abs(u.x - b) < 1);
    if (mySideBelow === tgBelow || onBridge) return tg;
    const bx = Math.abs(u.x - BRIDGES[0]) + Math.abs(tg.x - BRIDGES[0]) <= Math.abs(u.x - BRIDGES[1]) + Math.abs(tg.x - BRIDGES[1]) ? BRIDGES[0] : BRIDGES[1];
    return { x: bx, y: mySideBelow ? RIVER + 0.6 : RIVER - 0.6 };
  }

  /* a gas cloud: hurts every enemy on the ground inside it, every tick */
  function gas(S, side, x, y, r, dps, from) {
    S.zones = S.zones.filter(z => z.from !== from);          // one cloud per caster at a time
    S.zones.push({ id: ++S.id, side, x, y, r, dps, until: S.time + 3.2, from, kind: "gas" });
    S.events.push({ t: "gas", side, x, y, r });
  }

  function strike(S, a, t) {
    let dmg = a.dmg;
    if (a.firstHit) { dmg *= 2.5; a.firstHit = false; }
    if (a.aura) dmg *= 1 + a.aura;
    if (a.cloaked) { a.cloaked = false; dmg *= 1.5; S.events.push({ t: "reveal", id: a.id, x: a.x, y: a.y }); }
    if (a.kind === "tower") { S.shots.push({ id: ++S.id, side: a.side, from: a.id, x: a.x, y: a.y, to: t.id, dmg, splash: 0, speed: 11, kind: "tower" }); return; }
    const st = a.style;
    if (st === "chain") {
      // the bolt leaps on to two more enemies near the last one it struck
      const pts = [{ x: a.x, y: a.y }], hit = [t];
      let last = t; hurt(S, t, dmg, a); pts.push({ x: t.x, y: t.y });
      for (let k = 0; k < 2; k++) {
        let nx = null, nd = 2.8;
        for (const e of S.ents) if (canHit(S, a, e) && !hit.includes(e) && e.kind === "unit") { const d = dist(e, last); if (d < nd) { nd = d; nx = e; } }
        if (!nx) break;
        hit.push(nx); dmg *= 0.7; hurt(S, nx, dmg, a); pts.push({ x: nx.x, y: nx.y }); last = nx;
      }
      S.events.push({ t: "chain", side: a.side, pts });
      return;
    }
    if (st === "beam") {
      a.ramp = a.rampOn === t.id ? Math.min(3, a.ramp + 0.4) : 1; a.rampOn = t.id;
      S.events.push({ t: "beam", id: a.id, to: t.id, ramp: a.ramp });
      hurt(S, t, dmg * a.ramp, a);
      return;
    }
    if (st === "descend") {
      S.events.push({ t: "bolt", side: a.side, x: t.x, y: t.y });
      for (const e of S.ents) if (canHit(S, a, e) && dist(e, t) <= 1.2 + e.r) hurt(S, e, dmg, a);
      return;
    }
    if (a.range > 1.6) {
      S.shots.push({ id: ++S.id, side: a.side, from: a.id, x: a.x, y: a.y, to: t.id, dmg, splash: st === "burst" ? 1.2 : a.splash, speed: st === "gas" ? 8 : 11, kind: st || a.def.role, style: st });
    } else {
      S.events.push({ t: "swing", id: a.id, to: t.id, style: st || null });
      if (st === "gas") { hurt(S, t, dmg * 0.5, a); gas(S, a.side, t.x, t.y, a.def.gasR, a.dmg * 0.75, a.id); return; }
      const splash = st === "burst" ? 1.2 : a.splash;
      if (splash) { if (st === "burst") S.events.push({ t: "blast", side: a.side, x: t.x, y: t.y, r: splash, fx: "splash" }); for (const e of S.ents) if (canHit(S, a, e) && dist(e, t) <= splash + e.r) hurt(S, e, dmg, a); }
      else hurt(S, t, dmg, a);
    }
  }

  /* ---------- the AI ---------- */
  function aiThink(S, side) {
    const P = S.sides[side], me = side, sign = side === 0 ? 1 : -1;
    const homeY = y => side === 0 ? y > RIVER : y < RIVER;
    const hand = P.hand.map((ci, slot) => ({ slot, def: P.deck[ci] }));
    const affordable = hand.filter(h => h.def.cost <= P.dmt);
    // Entities are left to the towers: nothing else can touch them
    const threats = S.ents.filter(e => e.kind === "unit" && e.side !== me && e.hp > 0 && homeY(e.y) && !e.ethereal && !e.cloaked);
    const mine = S.ents.filter(e => e.kind === "unit" && e.side === me && e.hp > 0);
    const lvl = P.ai.level;
    if (threats.length) {
      const air = threats.some(t => t.air), weight = threats.reduce((a, t) => a + t.def.cost, 0);
      const cx = threats.reduce((a, t) => a + t.x, 0) / threats.length, cy = threats.reduce((a, t) => a + t.y, 0) / threats.length;
      // a spell on a crowd
      const spell = affordable.find(h => h.def.kind === "spell" && h.def.effect === "damage" && (threats.length >= 3 || weight >= 6) && h.def.cost <= weight);
      if (spell && rng(S) < 0.6 + 0.15 * lvl) return place(S, side, spell.slot, cx, cy);
      if (mine.filter(u => homeY(u.y)).reduce((a, u) => a + u.def.cost, 0) >= weight * 1.2) return null;   // already covered
      const pool = affordable.filter(h => h.def.kind === "unit" && (!air || h.def.targetsAir));
      if (!pool.length) return null;
      pool.sort((a, b) => Math.abs(a.def.cost - weight) - Math.abs(b.def.cost - weight) + (rng(S) - 0.5));
      const pick = pool[0], back = pick.def.range > 2 ? 3.5 : 1.5;
      const y = clamp(cy + sign * back, side === 0 ? RIVER + 1 : 1, side === 0 ? H - 1 : RIVER - 1);
      return place(S, side, pick.slot, clamp(cx + (rng(S) - 0.5), 1, W - 1), y);
    }
    // nothing coming: build a push when the bar is high
    if (P.dmt < 7.5 - lvl * 0.5) return null;
    const lane = (() => {   // the lane whose enemy tower is weaker
      const ts = S.ents.filter(e => e.kind === "tower" && e.side !== me && e.tower === "gate");
      const hp = l => { const t = ts.find(x => x.lane === l); return t ? t.hp : 99999; };
      return hp(0) <= hp(1) ? 0 : 1;
    })();
    const units = affordable.filter(h => h.def.kind === "unit");
    if (!units.length) return null;
    const tank = units.find(h => h.def.role === "tank") || units.sort((a, b) => b.def.hp - a.def.hp)[0];
    const lx = lane === 0 ? 3.5 : 14.5;
    const ahead = mine.find(u => homeY(u.y) && Math.abs(u.x - lx) < 4);
    const y = side === 0 ? (ahead ? Math.min(H - 1.5, ahead.y + 2.5) : 28.5) : (ahead ? Math.max(1.5, ahead.y - 2.5) : 3.5);
    return place(S, side, (ahead ? units.find(h => h.def.role !== "tank") || tank : tank).slot, lx + (rng(S) - 0.5) * 2, y);
  }

  /* ---------- one step of the world ---------- */
  function step(S) {
    if (S.over) return;
    S.events.length = 0;
    S.tick++; S.time = S.tick / TICK;
    const ph = phaseOf(S.time);
    if (S.time === 60 || S.time === 120 || S.time === MATCH_S) S.events.push({ t: "phase", name: ph.name });
    for (const P of S.sides) {
      P.dmt = Math.min(MAX_DMT, P.dmt + DMT_PER_S * ph.rate * DT);
      if (P.ai) { P.ai.next -= DT; if (P.ai.next <= 0) { aiThink(S, P.i); P.ai.next = (P.ai.level >= 2 ? 0.5 : 0.8) + rng(S) * 0.6; } }
    }
    // the Source lifts the allies around it
    for (const u of S.ents) u.aura = 0;
    for (const u of S.ents) if (u.kind === "unit" && u.hp > 0 && u.style === "prime") for (const o of S.ents) if (o !== u && o.side === u.side && o.kind === "unit" && dist(o, u) < 3.5) o.aura = 0.2;
    // spells in flight land
    if (S.flights.length) {
      for (const f of S.flights) if (f.land <= S.tick) blast(S, f.side, f.x, f.y, f.def.radius, f.def.amount, f.def.id);
      S.flights = S.flights.filter(f => f.land > S.tick);
    }
    // gas clouds
    for (const z of S.zones) for (const e of S.ents) if (e.side !== z.side && e.hp > 0 && !e.air && dist(e, z) <= z.r + e.r * 0.5) hurt(S, e, (e.kind === "tower" ? z.dps * 0.3 : z.dps) * DT, null);
    S.zones = S.zones.filter(z => z.until > S.time);
    // units and towers act
    for (const u of S.ents) {
      if (u.hp <= 0) continue;
      if (u.kind === "unit") {
        if (u.wake > 0) { u.wake -= DT; continue; }
        u.tick++;
        if (u.poison && S.time < u.poison.until) hurt(S, u, u.poison.dps * DT, null);
        if (u.burn && S.time < u.burn.until) hurt(S, u, u.burn.dps * DT, null);
        if (u.style === "roots") u.hp = Math.min(u.max, u.hp + u.max * 0.02 * DT);       // the rooted ones mend
        if (u.style === "orbit" && u.tick % TICK === 0) {                               // the moons come round
          let any = false;
          for (const e of S.ents) if (canHit(S, u, e) && e.kind === "unit" && dist(e, u) <= 1.9 + e.r) { hurt(S, e, u.dmg * 0.45, u); any = true; }
          if (any) S.events.push({ t: "orbit", id: u.id, x: u.x, y: u.y });
        }
        if (u.def.role === "support" && u.tick % TICK === 0) {
          for (const o of S.ents) if (o.side === u.side && o.kind === "unit" && o.hp > 0 && o.hp < o.max && !o.ethereal && dist(o, u) <= 3) { const h = Math.min(o.max - o.hp, u.def.heal); o.hp += h; S.events.push({ t: "heal", id: o.id, n: Math.round(h) }); }
        }
        let t = u.target && u.target.hp > 0 && canHit(S, u, u.target) ? u.target : null;
        if (!t || (t.kind === "tower" && u.tick % 10 === 0)) t = pickTarget(S, u);
        u.target = t;
        if (!t) continue;
        const reach = u.range + u.r + t.r, d = dist(u, t);
        if (d > reach) {
          if (S.time >= u.slowUntil) { u.frozen = false; u.chilled = false; }
          const held = S.time < u.rootUntil;
          const wp = waypoint(u, t), dd = dist(u, wp) || 1, sp = held ? 0 : u.speed * (S.time < u.slowUntil ? (u.frozen ? 0 : 0.55) : 1) * DT;
          u.x += (wp.x - u.x) / dd * Math.min(sp, dd); u.y += (wp.y - u.y) / dd * Math.min(sp, dd);
          u.cd = Math.max(u.cd, u.hit * 0.4);
        } else {
          if (S.time >= u.slowUntil) { u.frozen = false; u.chilled = false; }
          if (S.time < u.slowUntil && u.frozen) continue;
          u.cd -= DT;
          if (u.cd <= 0) { strike(S, u, t); u.cd = u.hit * (S.time < u.slowUntil ? 1.4 : 1); }
        }
      } else {
        // a tower shoots the nearest enemy in range
        u.cd -= DT;
        if (u.cd > 0) continue;
        let best = null, bd = 1e9;
        for (const e of S.ents) { if (e.kind !== "unit" || e.side === u.side || e.hp <= 0 || e.wake > 0.5 || e.cloaked) continue; const d = dist(u, e); if (d <= u.range && d < bd) { bd = d; best = e; } }
        if (best) { strike(S, u, best); u.cd = u.hit; }
      }
    }
    // shots fly
    for (const s of S.shots) {
      const t = S.ents.find(e => e.id === s.to);
      if (!t || t.hp <= 0) { s.done = true; continue; }
      const d = dist(s, t), mv = s.speed * DT;
      if (d <= mv + t.r * 0.5) {
        s.done = true;
        const src = S.ents.find(e => e.id === s.from) || { id: s.from, side: s.side, kind: s.kind === "tower" ? "tower" : "unit", style: s.style, dmg: s.dmg, max: 1, hp: 0 };
        if (s.style === "gas") { hurt(S, t, s.dmg * 0.5, src); gas(S, s.side, t.x, t.y, (src.def && src.def.gasR) || 1.6, s.dmg * 0.75, s.from); }
        else if (s.splash) { S.events.push({ t: "blast", side: s.side, x: t.x, y: t.y, r: s.splash, fx: "splash" }); for (const e of S.ents) if (e.side !== s.side && e.hp > 0 && dist(e, t) <= s.splash + e.r && (!e.air || src.targetsAir)) hurt(S, e, s.dmg, src); }
        else hurt(S, t, s.dmg, src);
      } else { s.x += (t.x - s.x) / d * mv; s.y += (t.y - s.y) / d * mv; }
    }
    S.shots = S.shots.filter(s => !s.done);
    // units push apart
    const us = S.ents.filter(e => e.kind === "unit" && e.hp > 0);
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j]; if (a.air !== b.air) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy), min = a.r + b.r;
      if (d > 0 && d < min) { const push = (min - d) / 2 / d; a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push; }
      else if (d === 0) { a.x -= 0.05; b.x += 0.05; }
    }
    for (const u of us) { u.x = clamp(u.x, 0.4, W - 0.4); u.y = clamp(u.y, 0.4, H - 0.4); }
    // the fallen
    for (const e of S.ents) {
      if (e.hp > 0 || e.gone) continue;
      e.gone = true;
      S.events.push({ t: "death", id: e.id, side: e.side, x: e.x, y: e.y, tower: e.tower || null, n: e.n || null, air: !!e.air });
      if (e.kind === "tower") {
        const foe = 1 - e.side;
        if (e.tower === "throne") { S.crowns[foe] = 3; finish(S, foe); }
        else {
          S.crowns[foe]++; S.sides[e.side].gatesDown[e.lane] = true;
          if (S.time >= MATCH_S) finish(S, foe);                    // sudden death: first tower wins
        }
      }
    }
    S.ents = S.ents.filter(e => !e.gone);
    // time
    if (!S.over && S.time >= MATCH_S && S.crowns[0] !== S.crowns[1]) finish(S, S.crowns[0] > S.crowns[1] ? 0 : 1);
    if (!S.over && S.time >= MATCH_S + OVERTIME_S) {
      // still level: the side whose weakest tower stands taller
      const low = side => Math.min(...S.ents.filter(e => e.kind === "tower" && e.side === side).map(e => e.hp / e.max), 1);
      const all = side => S.ents.filter(e => e.kind === "tower" && e.side === side).reduce((a, e) => a + e.hp / e.max, 0);
      const a = low(0) - low(1) || all(0) - all(1);
      finish(S, Math.abs(a) < 1e-9 ? null : a > 0 ? 0 : 1);
    }
  }
  function finish(S, winner) { if (S.over) return; S.over = true; S.winner = winner; S.events.push({ t: "over", winner }); }

  /* ---------- run a match from placements alone (the server's replay) ---------- */
  function replay({ seed, sides, inputs, maxTicks = (MATCH_S + OVERTIME_S) * TICK + 5 }) {
    const S = createMatch({ seed, sides });
    const byTick = new Map();
    for (const inp of inputs || []) { if (!byTick.has(inp.t)) byTick.set(inp.t, []); byTick.get(inp.t).push(inp); }
    for (let k = 0; k < maxTicks && !S.over; k++) {
      for (const inp of byTick.get(S.tick) || []) { const err = place(S, 0, inp.slot, inp.x, inp.y); if (err) return { error: "A placement at " + (S.tick / TICK).toFixed(1) + "s was not allowed: " + err, S }; }
      step(S);
    }
    return { S };
  }

  return { createMatch, place, step, replay, canPlaceAt, phaseOf, TICK, DT, W, H, RIVER, BRIDGES, MATCH_S, OVERTIME_S, MAX_DMT, TOWERS };
});
