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

  /* ---------- Realm Weather: one rule twist on the day's Daily Trip (from 19 Oct; the server picks it) ---------- */
  const WEATHER = {
    "tide-Cold":    { name: "Cold Tide",     text: "Cold beings score double chips" },
    "tide-Rose":    { name: "Rose Tide",     text: "Rose beings score double chips" },
    "tide-Warm":    { name: "Warm Tide",     text: "Warm beings score double chips" },
    "tide-Acid":    { name: "Acid Tide",     text: "Acid beings score double chips" },
    "tide-Opposed": { name: "Opposed Tide",  text: "Opposed beings score double chips" },
    spores:         { name: "Spore Bloom",   text: "Every Mushroom fires one extra time" },
    ion:            { name: "Ion Storm",     text: "Lightning and Storm add double mult" },
    sacred:         { name: "Sacred Hour",   text: "Sacred Geometry adds triple mult" },
    humble:         { name: "Humble Day",    text: "Commons and Uncommons score triple chips" },
    nova:           { name: "Nova Night",    text: "Every Supernova multiplies harder" },
    moon:           { name: "Moon Rain",     text: "Moon dust counts triple" },
    swift:          { name: "Swift Day",     text: "3 casts a layer, but every cast scores ×1.5 mult" },
  };
  const castsOf = S => S.weather === "swift" ? 3 : CASTS;

  /* ---------- powers: each God, Entity and the Source has one (from 19 Oct; a run says whether it has them) ----------
     A power works when its being is one of the scoring beings in a cast. */
  const POWERS = {
    1111: { name: "All Light",          text: "Counts as every Aura, and doubles the final mult" },
    569:  { name: "Hidden Storm",       text: "Every Storm and Lightning in the cast fires twice" },
    176:  { name: "Crown of the Low",   text: "Commons and Uncommons in the cast get +10 chips each" },
    460:  { name: "Swallow the Moon",   text: "×1.5 mult for every Opposed being in the cast" },
    485:  { name: "Solar Flare",        text: "Every Supernova in the cast multiplies one extra time" },
    649:  { name: "Star Nursery",       text: "Every planet in the cast adds +3 mult" },
    762:  { name: "Spiral Ascent",      text: "×3 mult if the cast is a Quad or Ascension" },
    784:  { name: "Bloom Tide",         text: "Every Mushroom repeat in the cast adds +2 mult" },
    806:  { name: "Deep Sight",         text: "Every UFO in the cast draws one more being" },
    842:  { name: "Root Network",       text: "+4 mult for every Tree in the cast" },
    858:  { name: "Tentacle Grip",      text: "The weakest being in the cast scores 61 chips" },
    29:   { name: "Diamond Light",      text: "+20 chips to every Cold being in the cast" },
    56:   { name: "Ring Sight",         text: "Ringed planets in the cast multiply ×1.5" },
    86:   { name: "High Tide",          text: "Opposed beings in the cast add +4 mult each" },
    189:  { name: "Full Bloom",         text: "+30 chips when the cast has 5 beings" },
    233:  { name: "Herald's Call",      text: "Lightning in the cast adds +4 extra mult" },
    253:  { name: "Rose Halo",          text: "Rose beings in the cast add +3 mult each" },
    329:  { name: "Perfect Form",       text: "Sacred Geometry pairs add +4 more mult" },
    368:  { name: "Lotus Fire",         text: "+15 chips per Mushroom and Supernova in the cast" },
    436:  { name: "Lone Smoke",         text: "×5 mult if it's the only scoring being" },
    438:  { name: "Spore Rule",         text: "Every Mushroom in the cast fires once more" },
    541:  { name: "Dark Star",          text: "×1.5 mult if the cast includes a Supernova" },
    597:  { name: "Mist Breath",        text: "Moon dust in the cast counts double" },
    601:  { name: "Void Pull",          text: "+50 chips for every UFO in the cast" },
    641:  { name: "Planet Throne",      text: "Planets in the cast add double chips" },
    658:  { name: "Many Hands",         text: "+2 mult for every other being in the cast" },
    697:  { name: "Bone Guard",         text: "Commons in the cast get +15 chips each" },
    701:  { name: "Coil of Roots",      text: "Trees in the cast add +3 extra mult" },
    817:  { name: "Sky Spectrum",       text: "+8 mult if the cast is a Spectrum" },
    908:  { name: "Ancient",            text: "+1 mult for every 4 casts made this run" },
    1086: { name: "Petrify",            text: "The strongest being in the cast scores its chips twice" },
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
  // weather: the day's Realm Weather id, or nothing
  function evaluate(cards, castsSoFar, own, boost, weather, powers) {
    const W = weather || "", tide = W.startsWith("tide-") ? W.slice(5) : null, WN = WEATHER[W] ? WEATHER[W].name : "";
    const { id, scoring } = handOf(cards);
    const H = HANDS[id];
    let chips = H.chips, mt = H.mult * 10;
    const steps = [{ k: "hand", id, name: H.name, chips, mult: mt }];
    const sc = scoring.map(i => cards[i]);
    // the powers at work in this cast: scoring beings that have one (only on runs that have powers)
    const PW = {}; if (powers) scoring.forEach(i => { if (POWERS[cards[i].n]) PW[cards[i].n] = i; });
    const has = n => n in PW, pn = n => POWERS[n].name;
    let weak = -1, strong = -1;
    if (has(858)) scoring.forEach(i => { if (cards[i].n !== 858 && (weak < 0 || cards[i].chips < cards[weak].chips)) weak = i; });
    if (has(1086)) scoring.forEach(i => { if (strong < 0 || cards[i].chips > cards[strong].chips) strong = i; });
    // sacred geometry: every pair of scoring beings sharing a Geometry
    const geo = {}; for (const c of sc) if (c.geo) geo[c.geo] = (geo[c.geo] || 0) + 1;
    let pairs = 0; for (const n of Object.values(geo)) pairs += n * (n - 1) / 2;
    const geoAdd = (W === "sacred" ? 6 : 2) * pairs + (has(329) ? 4 * pairs : 0);
    if (pairs) { mt += 10 * geoAdd; steps.push({ k: "geo", label: W === "sacred" ? "Sacred Geometry (Sacred Hour)" : "Sacred Geometry", add: geoAdd, chips, mult: mt }); }
    const addM = (i, n, label) => { mt += n * 10; steps.push({ k: "mult", i, label, add: n, chips, mult: mt }); };
    const xM = (i, t, label) => { mt = Math.floor(mt * t / 10); steps.push({ k: "x", i, label, x: t / 10, chips, mult: mt }); };
    const addC = (i, n, label) => { chips += n; steps.push({ k: "chips", i, label, add: n, chips, mult: mt }); };
    let draws = 0;
    for (const i of scoring) {
      const c = cards[i], x = c.x || {};
      const reps = 1 + ({ Few: 1, Cluster: 2, Grove: 3 }[x.M] || 0) + (W === "spores" && x.M ? 1 : 0) + (has(438) && x.M ? 1 : 0);
      for (let r = 0; r < reps; r++) {
        if (r) steps.push({ k: "again", i, label: "Spores: again!", chips, mult: mt });
        if (r && has(784)) addM(i, 2, pn(784));
        addC(i, i === weak ? 61 : own && own.includes(c.n) ? c.chips + (c.chips >> 1) : c.chips, i === weak ? pn(858) : own && own.includes(c.n) ? "Yours: +50%" : "");
        if (i === strong) addC(i, c.chips, pn(1086));
        if (has(176) && (c.tier === "Common" || c.tier === "Uncommon")) addC(i, 10, pn(176));
        if (has(697) && c.tier === "Common") addC(i, 15, pn(697));
        if (has(29) && c.aura === "Cold") addC(i, 20, pn(29));
        if (has(86) && c.aura === "Opposed") addM(i, 4, pn(86));
        if (has(253) && c.aura === "Rose") addM(i, 3, pn(253));
        if (has(368)) { if (x.M) addC(i, 15, pn(368)); if (x.S) addC(i, 15, pn(368)); }
        if (tide && (c.aura === tide || c.aura === "Prime")) addC(i, c.chips, WN);
        if (W === "humble" && (c.tier === "Common" || c.tier === "Uncommon")) addC(i, 2 * c.chips, WN);
        const pl = has(641) ? 2 : 1;
        if (x.P === "One") addC(i, 20 * pl, "Planet");
        if (x.P === "Two") addC(i, 40 * pl, "Twin planets");
        if (x.P === "Ringed") { addC(i, 30 * pl, "Ringed planet"); addM(i, 2, "Ringed planet"); if (has(56)) xM(i, 15, pn(56)); }
        if (x.P === "Cluster") addC(i, 150 * pl, "Planet cluster");
        if (x.P && has(649)) addM(i, 3, pn(649));
        const dust = { Faint: 4, Drifting: 8, Heavy: 20 }[x.D];
        if (dust && castsSoFar) addC(i, dust * castsSoFar * (W === "moon" ? 3 : 1) * (has(597) ? 2 : 1), W === "moon" ? "Moon dust (Moon Rain)" : has(597) ? "Moon dust (" + pn(597) + ")" : "Moon dust");
        for (let f = 0; f < (has(569) && (x.L === "Strike" || x.L === "Storm") ? 2 : 1); f++) {
          if (x.L === "Strike") addM(i, W === "ion" ? 8 : 4, f ? pn(569) : "Lightning");
          if (x.L === "Storm") addM(i, W === "ion" ? 16 : 8, f ? pn(569) : "Storm");
        }
        if (x.L && has(233)) addM(i, 4, pn(233));
        if (x.L === "Tempest") xM(i, 30, "Tempest");
        if (x.T === "One") addM(i, 3, "Tree");
        if (x.T === "Copse") addM(i, 6, "Copse");
        if (x.T === "Forest") xM(i, 20, "Forest");
        if (x.T && has(842)) addM(i, 4, pn(842));
        if (x.T && has(701)) addM(i, 3, pn(701));
        for (let f = 0; f < (has(485) && x.S ? 2 : 1); f++) {
          if (x.S === "One") xM(i, W === "nova" ? 20 : 15, f ? pn(485) : "Supernova");
          if (x.S === "Two") xM(i, W === "nova" ? 25 : 20, f ? pn(485) : "Twin supernova");
          if (x.S === "Barrage") xM(i, W === "nova" ? 50 : 40, f ? pn(485) : "Supernova barrage");
        }
        if (c.tier === "Entity") addM(i, 10, "Entity");
        if (c.tier === "God") xM(i, 20, "God");
        if (c.tier === "Source") xM(i, 50, "The Prime Source");
      }
      if (x.U === "One") draws += 1;
      if (x.U === "Few") draws += 2;
      if (x.U && has(806)) draws += 1;
      if (x.U && has(601)) addC(i, 50, pn(601));
    }
    // the powers that look at the whole cast
    if (has(189) && cards.length === 5) addC(PW[189], 30, pn(189));
    if (has(658) && cards.length > 1) addM(PW[658], 2 * (cards.length - 1), pn(658));
    if (has(817) && id === "spectrum") addM(PW[817], 8, pn(817));
    if (has(908) && castsSoFar >= 4) addM(PW[908], Math.floor(castsSoFar / 4), pn(908));
    if (has(541) && sc.some(c => (c.x || {}).S)) xM(PW[541], 15, pn(541));
    if (has(460)) for (const c of sc) if (c.aura === "Opposed") xM(PW[460], 15, pn(460));
    if (has(762) && (id === "quad" || id === "ascension")) xM(PW[762], 30, pn(762));
    if (has(436) && sc.length === 1) xM(PW[436], 50, pn(436));
    if (has(1111)) xM(PW[1111], 20, pn(1111));
    if (sc.length >= 3 && sc.every(c => c.col && c.col === sc[0].col)) xM(-1, 20, "Harmony: one Colourway");
    if (W === "swift") xM(-1, 15, WN);
    if (boost > 100) xM(-1, Math.round(boost / 10), "Holder boost");
    if (draws) steps.push({ k: "ufo", label: "Abducted: draw " + draws, draws, chips, mult: mt });
    const score = Math.floor(chips * mt / 10);
    return { id, name: H.name, scoring, chips, mult: mt, score, draws, steps };
  }

  /* ---------- a run ----------
     def: { seed, deck: [n...], own: [n...], cards: lookup n -> card, pool: N beings to draft from } */
  function createRun(def) {
    const S = { rng: def.seed | 0, weather: WEATHER[def.weather] ? def.weather : null, powers: !!def.powers, cards: def.cards, N: def.pool || 1111, own: def.own || [], boost: Math.max(100, Math.min(300, def.boost | 0)), deck: def.deck.slice(),
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
    S.casts = castsOf(S); S.discards = DISCARDS; S.score = 0; S.phase = "play"; S.offer = null;
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
    return evaluate(idx.map(i => card(S, S.hand[i])), S.castsMade, S.own, S.boost, S.weather, S.powers);
  }
  /* the order that scores most (the page always plays cards in their best order; 5 cards is 120 tries) */
  function bestOrder(S, idx) {
    if (checkPick(S, idx)) return null;
    let best = null, bestScore = -1;
    const perm = (a, k) => {
      if (k === a.length) { const sc = evaluate(a.map(i => card(S, S.hand[i])), S.castsMade, S.own, S.boost, S.weather, S.powers).score; if (sc > bestScore) { bestScore = sc; best = a.slice(); } return; }
      for (let j = k; j < a.length; j++) { [a[k], a[j]] = [a[j], a[k]]; perm(a, k + 1); [a[k], a[j]] = [a[j], a[k]]; }
    };
    perm(ordered(idx), 0);
    return best;
  }
  function remove(S, idx) { const o = ordered(idx); const out = o.map(i => S.hand[i]); for (let k = o.length - 1; k >= 0; k--) S.hand.splice(o[k], 1); S.used.push(...out); return out; }

  function cast(S, idx) {
    const err = checkPick(S, idx); if (err) return { error: err };
    if (S.casts <= 0) return { error: "No casts left." };
    const ev = evaluate(idx.map(i => card(S, S.hand[i])), S.castsMade, S.own, S.boost, S.weather, S.powers);
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

  /* the holder boost, in percent: +10 for owning a REALM being, plus the highest $DMT band held */
  const BOOST_BANDS = [[50e3, 10], [250e3, 20], [500e3, 50], [1e6, 60], [5e6, 100], [10e6, 150]], BOOST_BEING = 10, BOOST_MAX = 300;
  const boostFor = (tokens, being) => Math.min(BOOST_MAX, 100 + (being ? BOOST_BEING : 0) + BOOST_BANDS.reduce((b, [t, p]) => tokens >= t ? p : b, 0));

  return { createRun, cast, discard, pick, act, replay, preview, bestOrder, evaluate, handOf, targetOf, cleared, BOOST_BANDS, BOOST_BEING, BOOST_MAX, boostFor, WEATHER, POWERS,
    HANDS, AURAS, TARGETS, LAYERS, LAYER_NAMES, HAND_SIZE, MAX_PICK, CASTS, DISCARDS };
});
