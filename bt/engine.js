/* ============================================================
   BREAKTHROUGH — the card engine.

   A run is a climb through eight layers of the realm to the Source. Each
   layer has a target score. You hold 7 beings; pick up to 5 and CAST them,
   or throw up to 5 away and draw fresh. Four casts and three discards a
   layer. Reach the target and you break through: take one new being into
   your deck and climb on. Run out of casts and the trip is over.

   THE ONE RULE: matching Auras make the hand (like poker, with five suits
   of light): two of an Aura is Twin Auras, three a Triad, all five Auras at
   once a Spectrum... The beings in the hand then score their chips, and
   their traits fire, in the order they are cast (the page always finds the
   best order for you):
     Geometry   two scoring beings that share a Geometry: +2 mult a pair
     Colourway  three or more scoring, all one Colourway: Harmony, x2 mult
     Lightning  Strike +4 mult · Storm +8 mult · Tempest x3 mult
     Trees      One +3 mult · Copse +6 mult · Forest x2 mult
     Planets    One +20 chips · Two +40 · Ringed +30 and +2 mult · Cluster +150
     Supernova  One x1.5 mult · Two x2 · Barrage x4
     Mushrooms  the being scores again: Few once · Cluster twice · Grove 3 times
     Moon Dust  chips that grow: Faint +4, Drifting +8, Heavy +20 for every cast so far
     UFOs       abduct: draw 1 (One) or 2 (Few) extra cards after the cast
     Entities +10 mult · Gods x2 mult · the Prime Source x5 mult, and counts as any Aura
   Score = chips x mult.

   The same file runs in the page (to play) and on the server (to replay a
   run from its moves and decide the score), so all the maths is whole
   numbers (mult is kept in tenths) and the only randomness is one seeded
   generator.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RealmBreak = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HAND_SIZE = 7, MAX_HAND = 9, MAX_PICK = 5, CASTS = 4, DISCARDS = 3, LAYERS = 8;
  const AURAS = ["Cold", "Rose", "Warm", "Acid", "Opposed"];
  const TARGETS = [400, 1500, 4500, 12000, 30000, 70000, 150000, 300000];
  const LAYER_NAMES = ["The Threshold", "The Veil", "The Waiting Room", "Hall of Machines", "Hyperspace", "The Elf Choir", "The Throne", "The Source"];
  const targetOf = L => L < LAYERS ? TARGETS[L] : TARGETS[LAYERS - 1] * Math.pow(8, L - LAYERS + 1);

  // best first; chips and mult (mult in whole numbers here)
  const HANDS = {
    ascension: { name: "Ascension",    chips: 100, mult: 8, rank: 7 },
    quad:      { name: "Quad",         chips: 60,  mult: 7, rank: 6 },
    vision:    { name: "Full Vision",  chips: 40,  mult: 4, rank: 5 },
    spectrum:  { name: "Spectrum",     chips: 35,  mult: 4, rank: 4 },
    triad:     { name: "Triad",        chips: 30,  mult: 3, rank: 3 },
    twopair:   { name: "Double Twins", chips: 20,  mult: 2, rank: 2 },
    pair:      { name: "Twin Auras",   chips: 10,  mult: 2, rank: 1 },
    spark:     { name: "Spark",        chips: 5,   mult: 1, rank: 0 },
  };

  /* ---------- one seeded generator (mulberry32: integer maths only) ---------- */
  function next(S) {
    let t = (S.rng = (S.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }
  const randInt = (S, n) => next(S) % n;
  function shuffle(S, a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(S, i + 1); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  /* ---------- which hand a set of beings makes ---------- */
  // the Prime Source is every Aura at once: it takes whichever makes the best hand
  function handOf(cards) {
    const w = cards.findIndex(c => !AURAS.includes(c.aura));
    if (w < 0) return handOfFixed(cards);
    let best = null;
    for (const a of AURAS) {
      const h = handOfFixed(cards.map((c, i) => i === w ? Object.assign({}, c, { aura: a }) : c));
      if (!best || HANDS[h.id].rank > HANDS[best.id].rank) best = h;
    }
    return best;
  }
  function handOfFixed(cards) {
    const groups = {};
    cards.forEach((c, i) => (groups[c.aura] = groups[c.aura] || []).push(i));
    const g = Object.values(groups).sort((a, b) => b.length - a.length);
    const k = cards.length;
    let id, scoring;
    if (g[0].length === 5) { id = "ascension"; scoring = g[0]; }
    else if (g[0].length === 4) { id = "quad"; scoring = g[0]; }
    else if (g[0].length === 3 && g[1] && g[1].length === 2) { id = "vision"; scoring = g[0].concat(g[1]); }
    else if (k === 5 && g.length === 5) { id = "spectrum"; scoring = g.flat(); }
    else if (g[0].length === 3) { id = "triad"; scoring = g[0]; }
    else if (g[0].length === 2 && g[1] && g[1].length === 2) { id = "twopair"; scoring = g[0].concat(g[1]); }
    else if (g[0].length === 2) { id = "pair"; scoring = g[0]; }
    else { id = "spark"; let best = 0; cards.forEach((c, i) => { if (c.chips > cards[best].chips) best = i; }); scoring = [best]; }
    return { id, scoring: scoring.sort((a, b) => a - b) };
  }

  /* ---------- the score of a cast, step by step (the page animates these steps) ---------- */
  // boost: a holder's boost in percent (100 = none, 130 = ×1.3), applied to the mult last
  function evaluate(cards, castsSoFar, own, boost) {
    const { id, scoring } = handOf(cards);
    const H = HANDS[id];
    let chips = H.chips, mt = H.mult * 10;
    const steps = [{ k: "hand", id, name: H.name, chips, mult: mt }];
    const sc = scoring.map(i => cards[i]);
    // sacred geometry: every pair of scoring beings sharing a Geometry
    const geo = {}; for (const c of sc) if (c.geo) geo[c.geo] = (geo[c.geo] || 0) + 1;
    let pairs = 0; for (const n of Object.values(geo)) pairs += n * (n - 1) / 2;
    if (pairs) { mt += 20 * pairs; steps.push({ k: "geo", label: "Sacred Geometry", add: 2 * pairs, chips, mult: mt }); }
    const addM = (i, n, label) => { mt += n * 10; steps.push({ k: "mult", i, label, add: n, chips, mult: mt }); };
    const xM = (i, t, label) => { mt = Math.floor(mt * t / 10); steps.push({ k: "x", i, label, x: t / 10, chips, mult: mt }); };
    const addC = (i, n, label) => { chips += n; steps.push({ k: "chips", i, label, add: n, chips, mult: mt }); };
    let draws = 0;
    for (const i of scoring) {
      const c = cards[i], x = c.x || {};
      const reps = 1 + ({ Few: 1, Cluster: 2, Grove: 3 }[x.M] || 0);
      for (let r = 0; r < reps; r++) {
        if (r) steps.push({ k: "again", i, label: "Spores: again!", chips, mult: mt });
        addC(i, own && own.includes(c.n) ? c.chips + (c.chips >> 1) : c.chips, own && own.includes(c.n) ? "Yours: +50%" : "");
        if (x.P === "One") addC(i, 20, "Planet");
        if (x.P === "Two") addC(i, 40, "Twin planets");
        if (x.P === "Ringed") { addC(i, 30, "Ringed planet"); addM(i, 2, "Ringed planet"); }
        if (x.P === "Cluster") addC(i, 150, "Planet cluster");
        const dust = { Faint: 4, Drifting: 8, Heavy: 20 }[x.D];
        if (dust && castsSoFar) addC(i, dust * castsSoFar, "Moon dust");
        if (x.L === "Strike") addM(i, 4, "Lightning");
        if (x.L === "Storm") addM(i, 8, "Storm");
        if (x.L === "Tempest") xM(i, 30, "Tempest");
        if (x.T === "One") addM(i, 3, "Tree");
        if (x.T === "Copse") addM(i, 6, "Copse");
        if (x.T === "Forest") xM(i, 20, "Forest");
        if (x.S === "One") xM(i, 15, "Supernova");
        if (x.S === "Two") xM(i, 20, "Twin supernova");
        if (x.S === "Barrage") xM(i, 40, "Supernova barrage");
        if (c.tier === "Entity") addM(i, 10, "Entity");
        if (c.tier === "God") xM(i, 20, "God");
        if (c.tier === "Source") xM(i, 50, "The Prime Source");
      }
      if (x.U === "One") draws += 1;
      if (x.U === "Few") draws += 2;
    }
    if (sc.length >= 3 && sc.every(c => c.col && c.col === sc[0].col)) xM(-1, 20, "Harmony: one Colourway");
    if (boost > 100) xM(-1, Math.round(boost / 10), "Holder boost");
    if (draws) steps.push({ k: "ufo", label: "Abducted: draw " + draws, draws, chips, mult: mt });
    const score = Math.floor(chips * mt / 10);
    return { id, name: H.name, scoring, chips, mult: mt, score, draws, steps };
  }

  /* ---------- a run ----------
     def: { seed, deck: [n...], own: [n...], cards: lookup n -> card, pool: N beings to draft from } */
  function createRun(def) {
    const S = { rng: def.seed | 0, cards: def.cards, N: def.pool || 1111, own: def.own || [], boost: Math.max(100, Math.min(200, def.boost | 0)), deck: def.deck.slice(),
      layer: 0, draw: [], hand: [], used: [], casts: 0, discards: 0, score: 0, total: 0, castsMade: 0, best: 0, bestHand: null,
      phase: "play", offer: null, over: false, broke: false, last: null, moves: 0, hands: {} };
    startLayer(S);
    return S;
  }
  const card = (S, n) => S.cards(n);
  function draw(S, upto) { while (S.hand.length < upto && S.draw.length) S.hand.push(S.draw.pop()); }
  // the being you just took is always in your opening hand of the next layer
  function startLayer(S, fresh) {
    S.draw = shuffle(S, S.deck.slice()); S.hand = []; S.used = [];
    if (fresh) { S.draw.splice(S.draw.indexOf(fresh), 1); S.draw.push(fresh); }
    S.casts = CASTS; S.discards = DISCARDS; S.score = 0; S.phase = "play"; S.offer = null;
    draw(S, HAND_SIZE);
  }
  function checkPick(S, idx) {
    if (S.over) return "The run is over.";
    if (S.phase !== "play") return "Choose a being first.";
    if (!Array.isArray(idx) || !idx.length || idx.length > MAX_PICK) return "Pick 1 to 5 cards.";
    const seen = new Set();
    for (const i of idx) { if (!(Number.isInteger(i) && i >= 0 && i < S.hand.length) || seen.has(i)) return "Those cards aren't in your hand."; seen.add(i); }
    return null;
  }
  // the cards in a cast fire in the order the move lists them
  const ordered = idx => idx.slice().sort((a, b) => a - b);
  function preview(S, idx) {
    if (checkPick(S, idx)) return null;
    return evaluate(idx.map(i => card(S, S.hand[i])), S.castsMade, S.own, S.boost);
  }
  /* the order that scores most (the page always plays cards in their best order; 5 cards is 120 tries) */
  function bestOrder(S, idx) {
    if (checkPick(S, idx)) return null;
    let best = null, bestScore = -1;
    const perm = (a, k) => {
      if (k === a.length) { const sc = evaluate(a.map(i => card(S, S.hand[i])), S.castsMade, S.own, S.boost).score; if (sc > bestScore) { bestScore = sc; best = a.slice(); } return; }
      for (let j = k; j < a.length; j++) { [a[k], a[j]] = [a[j], a[k]]; perm(a, k + 1); [a[k], a[j]] = [a[j], a[k]]; }
    };
    perm(ordered(idx), 0);
    return best;
  }
  function remove(S, idx) { const o = ordered(idx); const out = o.map(i => S.hand[i]); for (let k = o.length - 1; k >= 0; k--) S.hand.splice(o[k], 1); S.used.push(...out); return out; }

  function cast(S, idx) {
    const err = checkPick(S, idx); if (err) return { error: err };
    if (S.casts <= 0) return { error: "No casts left." };
    const ev = evaluate(idx.map(i => card(S, S.hand[i])), S.castsMade, S.own, S.boost);
    remove(S, idx);
    S.casts--; S.castsMade++; S.moves++; S.score += ev.score; S.total += ev.score;
    S.hands[ev.id] = (S.hands[ev.id] || 0) + 1;
    if (ev.score > S.best) { S.best = ev.score; S.bestHand = ev.name; }
    draw(S, HAND_SIZE); if (ev.draws) draw(S, Math.min(MAX_HAND, S.hand.length + ev.draws));
    S.last = ev;
    if (S.score >= targetOf(S.layer)) {
      if (S.layer === LAYERS - 1) S.broke = true;
      S.phase = "draft"; S.offer = offer(S);
    } else if (S.casts <= 0 || !S.hand.length) { S.over = true; S.phase = "over"; }
    return { ev };
  }
  function discard(S, idx) {
    const err = checkPick(S, idx); if (err) return { error: err };
    if (S.discards <= 0) return { error: "No discards left." };
    remove(S, idx); S.discards--; S.moves++;
    draw(S, HAND_SIZE);
    if (!S.hand.length) { S.over = true; S.phase = "over"; }
    return {};
  }
  /* three beings to choose from; deeper layers look harder for rare ones (best tier of several draws) */
  const RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Entity: 6, God: 7, Source: 8 };
  function offer(S) {
    const out = [], tries = 1 + Math.floor((S.layer + 1) / 2);
    while (out.length < 3) {
      let best = 0;
      for (let t = 0; t < tries; t++) { const n = 1 + randInt(S, S.N); if (!best || RANK[card(S, n).tier] > RANK[card(S, best).tier]) best = n; }
      if (!out.includes(best) && !S.deck.includes(best)) out.push(best);
    }
    return out;
  }
  function pick(S, choice) {
    if (S.over) return { error: "The run is over." };
    if (S.phase !== "draft") return { error: "Nothing to choose." };
    if (!(Number.isInteger(choice) && choice >= -1 && choice < 3)) return { error: "Choose one of the three, or skip." };
    const taken = choice >= 0 ? S.offer[choice] : 0;
    if (taken) S.deck.push(taken);
    S.layer++; S.moves++;
    startLayer(S, taken);
    return {};
  }
  function act(S, a) {
    if (!Array.isArray(a)) return { error: "Bad move." };
    if (a[0] === "c") return cast(S, a[1]);
    if (a[0] === "d") return discard(S, a[1]);
    if (a[0] === "p") return pick(S, a[1]);
    return { error: "Bad move." };
  }
  /* the server's view: play every move again from the seed */
  function replay(def, moves) {
    const S = createRun(def);
    for (let k = 0; k < moves.length; k++) { const r = act(S, moves[k]); if (r.error) return { error: "Move " + (k + 1) + ": " + r.error, S }; if (S.over) break; }
    return { S };
  }
  // how far a run got: layers cleared (8 = broke through to the Source)
  const cleared = S => S.layer + (S.phase === "draft" ? 1 : 0);

  return { createRun, cast, discard, pick, act, replay, preview, bestOrder, evaluate, handOf, targetOf, cleared,
    HANDS, AURAS, TARGETS, LAYERS, LAYER_NAMES, HAND_SIZE, MAX_PICK, CASTS, DISCARDS };
});
