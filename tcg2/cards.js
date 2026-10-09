/* ============================================================
   REALM card battler — the card generator.

   Every one of the 1,111 beings becomes a card, the same card every time.
   Its five stats come from the Duels card() function (unchanged), its
   traits from map-data.json, so:

     ESSENCE   the top stat (and the second, if within 8%): Magic, Spirit,
               Knowledge, Light or Dark.
     COST      by tier: Common 1, Uncommon 2, Rare 2, Epic 3, Legendary 4,
               Mythic 5, Entity 6, God 7, Source 8.
     KEYWORDS  from traits (UFOs, Lightning, Mushrooms, Trees, Planets,
               Supernova, Moon Dust, Aura, Geometry), stronger for rarer values.
     LEGENDARY the one-of trait values, the 20 Entities, the 10 Gods and the
               Source carry a hand-written power.
     POWER / HEALTH  a budget set by cost, less what the keywords are worth,
               split by the being's own stats (Magic + Dark lean to power,
               Spirit + Knowledge to health).

   Pure and deterministic: no randomness, no I/O after load.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ESSENCES = ["magic", "spirit", "knowledge", "light", "dark"];
const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
const COST = { Common: 1, Uncommon: 2, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Entity: 6, God: 7, Source: 8 };
// stat points a card of each tier gets before abilities are paid for
const BUDGET = { Common: 3.4, Uncommon: 6.8, Rare: 7.0, Epic: 9.0, Legendary: 12.0, Mythic: 12.8, Entity: 17.4, God: 17.4, Source: 19 };
// how many trait abilities a tier can carry (the rest of its traits are flavour)
const SLOTS = { Common: 1, Uncommon: 2, Rare: 3, Epic: 3, Legendary: 3, Mythic: 4, Entity: 4, God: 4, Source: 4 };

/* ---------- abilities: what each is worth in stat points ---------- */
const KW = {
  flying:    { cost: 1.2, text: "Flying" },
  haste:     { cost: 0.8, text: "Haste" },
  veiled:    { cost: 0.7, text: "Veiled" },
  unblockable: { cost: 2.2, text: "Unblockable" },
  lifelink:  { cost: 1.5, text: "Lifelink" },
  poison:    { cost: 0.9, text: "Poison" },
  freeze:    { cost: 0.3, text: "Freeze" },
  firstStrike: { cost: 1.4, text: "First strike" },
  doubleStrike: { cost: 2.6, text: "Double strike" },
  tough:     { cost: 0, text: "Tough" },
};
const GEOMETRY = {   // a small passive aura for the other allies
  Rays: "power", Spiral: "power", Gatefold: "power", Weird: "power", Metatron: "power",
  Mandala: "health", Rosette: "health", Flower: "health", Yantra: "health", Lattice: "health",
};

/* the one-of trait values: unique legendary powers */
const UNIQUE = {
  "Lightning:Tempest": { name: "Tempest", cost: 3.6, kw: ["haste"], arrive: [{ k: "dmg", to: "enemyUnits", n: 2 }], text: "Haste. Arrive: deal 2 damage to every enemy unit." },
  "Mushrooms:Grove":   { name: "Grove", cost: 3.4, turnStart: [{ k: "summon", token: "spore", n: 2 }], text: "At the start of your turn, summon two 1/1 Spores." },
  "Trees:Forest":      { name: "Forest", cost: 3.0, turnEnd: [{ k: "healUnits", n: 99 }, { k: "healFace", n: 2 }], text: "At the end of your turn, fully heal your units and gain 2 life." },
  "Moon Dust:Heavy":   { name: "Heavy Dust", cost: 2.2, kw: ["unblockable"], text: "Unblockable." },
  "Supernova:Barrage": { name: "Barrage", cost: 4.8, arrive: [{ k: "dmg", to: "enemyAll", n: 3 }], text: "Arrive: deal 3 damage to every enemy, units and player." },
  "Planets:Cluster":   { name: "Cluster", cost: 2.2, turnStart: [{ k: "draw", n: 1 }], text: "At the start of your turn, draw an extra card." },
};

/* the hand-written powers of the 20 Entities, the 10 Gods and the Source */
const NAMED = {
  // Gods
  176: { cost: 3.8, static: { power: 1, health: 1 }, arrive: [{ k: "draw", n: 1 }], text: "Your other units have +1/+1. Arrive: draw a card." },
  460: { cost: 3.4, kw: ["veiled"], arrive: [{ k: "freeze", to: "enemyUnits" }], text: "Veiled. Arrive: freeze every enemy unit." },
  485: { cost: 4.0, arrive: [{ k: "dmg", to: "enemyUnits", n: 3 }], text: "Arrive: deal 3 damage to every enemy unit." },
  569: { cost: 3.4, arrive: [{ k: "draw", n: 2 }], static: { ritualDiscount: 1 }, text: "Arrive: draw 2 cards. Your rituals cost 1 less." },
  649: { cost: 1.8, turnStart: [{ k: "summon", token: "seed", n: 1 }], text: "At the start of your turn, summon a 2/2 Nebula Seed." },
  762: { cost: 4.2, kw: ["flying", "lifelink"], arrive: [{ k: "healFace", n: 5 }], text: "Flying, lifelink. Arrive: gain 5 life." },
  784: { cost: 1.4, arrive: [{ k: "summon", token: "jelly", n: 3 }], text: "Arrive: summon three 1/1 Jelly Spores with poison." },
  806: { cost: 3.6, arrive: [{ k: "destroy", to: "enemyUnit", maxCost: 6 }], text: "Arrive: destroy an enemy unit that costs 6 or less." },
  842: { cost: 3.2, static: { health: 2 }, turnEnd: [{ k: "healUnits", n: 2 }], text: "Your other units have +0/+2. At the end of your turn, heal your units 2." },
  858: { cost: 3.6, onAttack: [{ k: "dmg", to: "enemyUnits", n: 2 }], text: "When it attacks, deal 2 damage to every enemy unit." },
  // Entities
  29:  { cost: 2.6, kw: ["tough"], arrive: [{ k: "buffUnits", power: 0, health: 2 }], text: "Arrive: your units get +0/+2 for good." },
  56:  { cost: 2.8, arrive: [{ k: "draw", n: 2 }], text: "Arrive: draw 2 cards." },
  86:  { cost: 4.8, arrive: [{ k: "bounce", to: "enemyUnit" }], text: "Arrive: return an enemy unit to its owner's hand." },
  189: { cost: 2.6, arrive: [{ k: "dmg", to: "enemyUnitsPower3", n: 3 }], text: "Arrive: deal 3 damage to every enemy unit with 3 or more power." },
  233: { cost: 2.8, kw: ["flying"], arrive: [{ k: "summon", token: "feather", n: 2 }], text: "Flying. Arrive: summon two 1/1 flying Feathers." },
  253: { cost: 4.0, kw: ["flying", "lifelink"], arrive: [{ k: "healUnits", n: 99 }], text: "Flying, lifelink. Arrive: fully heal your units." },
  329: { cost: 3.0, static: { power: 1, health: 1 }, text: "Your other units have +1/+1." },
  368: { cost: 3.0, arrive: [{ k: "dmg", to: "enemyAll", n: 1 }], turnStart: [{ k: "dmg", to: "randomEnemy", n: 1 }], text: "Arrive: deal 1 damage to every enemy. At the start of your turn, deal 1 damage to a random enemy." },
  436: { cost: 2.2, kw: ["unblockable"], text: "Unblockable." },
  438: { cost: 3.0, turnStart: [{ k: "summon", token: "spore", n: 1, poison: true }], text: "At the start of your turn, summon a 1/1 Spore with poison." },
  541: { cost: 1.2, arrive: [{ k: "destroy", to: "allPowerMax2" }], text: "Arrive: destroy every other unit with 2 or less power, on both sides." },
  597: { cost: 4.2, kw: ["flying", "haste"], arrive: [{ k: "dmg", to: "enemyFace", n: 3 }], text: "Flying, haste. Arrive: deal 3 damage to the enemy player." },
  601: { cost: 3.4, arrive: [{ k: "destroy", to: "enemyUnit", maxCost: 99 }], text: "Arrive: destroy an enemy unit." },
  641: { cost: 1.6, arrive: [{ k: "essence", n: 2 }, { k: "draw", n: 1 }], text: "Arrive: gain 2 essence this turn and draw a card." },
  658: { cost: 2.6, kw: ["doubleStrike"], text: "Double strike." },
  697: { cost: 1.8, kw: ["firstStrike"], death: [{ k: "summon", token: "husk", n: 1 }], text: "First strike. When it dies, summon a 3/3 Bone Husk." },
  701: { cost: 1.0, arrive: [{ k: "freeze", to: "enemyUnitsCost4" }], text: "Arrive: freeze every enemy unit that costs 4 or less." },
  817: { cost: 2.8, kw: ["flying"], static: { flyingBoost: 1 }, arrive: [{ k: "summon", token: "cloud", n: 1 }], text: "Flying. Your other flying units have +1/+1. Arrive: summon a 2/2 flying Cloudling." },
  908: { cost: 2.8, kw: ["tough"], turnEnd: [{ k: "healFace", n: 2 }, { k: "healUnits", n: 2 }], text: "At the end of your turn, gain 2 life and heal your units 2." },
  1086: { cost: 3.0, kw: ["poison"], arrive: [{ k: "freeze", to: "enemyUnits" }], text: "Poison. Arrive: freeze every enemy unit." },
  // the Source
  1111: { cost: 6.0, kw: ["flying"], arrive: [{ k: "dmg", to: "enemyAll", n: 3 }, { k: "healFace", n: 4 }, { k: "draw", n: 2 }],
    text: "Flying. Arrive: deal 3 damage to every enemy, gain 4 life and draw 2 cards." },
};

/* tokens a card can summon */
const TOKENS = {
  spore:   { name: "Spore", power: 1, health: 1, kw: [], essence: ["magic"] },
  jelly:   { name: "Jelly Spore", power: 1, health: 1, kw: ["poison"], essence: ["magic"] },
  seed:    { name: "Nebula Seed", power: 2, health: 2, kw: [], essence: ["spirit"] },
  feather: { name: "Feather", power: 1, health: 1, kw: ["flying"], essence: ["light"] },
  husk:    { name: "Bone Husk", power: 3, health: 3, kw: [], essence: ["dark"] },
  cloud:   { name: "Cloudling", power: 2, health: 2, kw: ["flying"], essence: ["knowledge"] },
};

let MAP = null, STATS = null;
function load() {
  if (MAP) return;
  MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
  // the existing Duels stat function, unchanged
  STATS = require("../duels").create({ root: ROOT, beings: async () => [], envVar: () => "" }).card;
}

const on = v => v && v !== "None";
const r1 = x => Math.round(x * 10) / 10;

/* ---------- one being, one card ---------- */
function cardOf(n) {
  load();
  const [tier, being, traits = {}] = MAP[n - 1];
  const s = STATS(n);
  const sorted = ESSENCES.slice().sort((a, b) => s[b] - s[a]);
  const essence = s[sorted[1]] >= s[sorted[0]] * 0.92 ? [sorted[0], sorted[1]] : [sorted[0]];

  const kw = new Set(), abilities = [], text = [];
  let spent = 0, extraHealth = 0, extraPower = 0;
  const card = { n, id: "b" + n, kind: "unit", name: being || tier + " #" + n, being, tier,
    cost: COST[tier], essence, traits, stats: { magic: s.magic, spirit: s.spirit, knowledge: s.knowledge, light: s.light, dark: s.dark },
    kw: [], arrive: [], turnStart: [], turnEnd: [], death: [], onAttack: [], static: null, legendary: false, power: 0, health: 0, text: "" };
  const shownKw = new Set();     // keywords already spelled out in a power's own text
  const add = (k) => { if (!kw.has(k)) { kw.add(k); spent += KW[k].cost; } };
  const power = (p) => { if (p.kw) p.kw.forEach(k => { add(k); shownKw.add(k); }); ["arrive", "turnStart", "turnEnd", "death", "onAttack"].forEach(w => p[w] && card[w].push(...p[w])); if (p.static) card.static = p.static; spent += p.cost; };

  // named powers first: Gods, Entities, the Source
  const lead = [];   // named and unique powers, each read as its own sentence
  if (NAMED[n]) { power(NAMED[n]); card.legendary = true; lead.push(NAMED[n].text); }

  // trait abilities, rarest first, up to the tier's slots
  const traitAbilities = [];
  const pushT = (prio, fn) => traitAbilities.push({ prio, fn });
  // a one-of trait value is a unique power; a being with several keeps the rarest
  const ORDER = ["Supernova:Barrage", "Lightning:Tempest", "Mushrooms:Grove", "Trees:Forest", "Planets:Cluster", "Moon Dust:Heavy"];
  const uq = ORDER.find(k => { const [t, v] = k.split(":"); return traits[t] === v; });
  if (uq) pushT(0, () => { const u = UNIQUE[uq]; power(u); card.legendary = true; card.uniqueName = u.name; lead.push(u.text); });
  if (on(traits.UFOs)) pushT(2, () => { add("flying"); if (traits.UFOs === "Few") { extraPower += 1; spent += 1; } });
  if (traits.Lightning === "Strike") pushT(2, () => add("haste"));
  if (traits.Lightning === "Storm") pushT(2, () => { add("haste"); card.arrive.push({ k: "dmg", to: "randomEnemy", n: 1 }); spent += 0.8; text.push("Arrive: deal 1 damage to a random enemy."); });
  if (traits.Mushrooms === "Few") pushT(2, () => { card.arrive.push({ k: "summon", token: "spore", n: 1 }); spent += 1.4; text.push("Arrive: summon a 1/1 Spore."); });
  if (traits.Mushrooms === "Cluster") pushT(2, () => { card.arrive.push({ k: "summon", token: "spore", n: 2 }); spent += 2.6; text.push("Arrive: summon two 1/1 Spores."); });
  if (traits.Trees === "One") pushT(3, () => { add("tough"); extraHealth += 2; spent += 2; });
  if (traits.Trees === "Copse") pushT(2, () => { card.turnEnd.push({ k: "healUnits", n: 1 }); spent += 0.9; text.push("At the end of your turn, heal your units 1."); });
  if (traits.Planets === "One") pushT(2, () => { card.arrive.push({ k: "draw", n: 1 }); spent += 0.5; text.push("Arrive: draw a card."); });
  if (traits.Planets === "Two") pushT(2, () => { card.arrive.push({ k: "draw", n: 2 }); spent += 1.2; text.push("Arrive: draw 2 cards."); });
  if (traits.Planets === "Ringed") pushT(2, () => { card.arrive.push({ k: "draw", n: 1 }); card.arrive.push({ k: "drawNext", n: 1 }); spent += 0.9; text.push("Arrive: draw a card, and another at the start of your next turn."); });
  // a blast scales with the card: on a cheap being it is a smaller one
  const cheap = COST[tier] <= 2;
  if (traits.Supernova === "One") pushT(2, () => cheap
    ? (card.arrive.push({ k: "dmg", to: "randomEnemy", n: 2 }), spent += 2.0, text.push("Arrive: deal 2 damage to a random enemy."))
    : (card.arrive.push({ k: "dmg", to: "enemyUnits", n: 1 }), spent += 4.0, text.push("Arrive: deal 1 damage to every enemy unit.")));
  if (traits.Supernova === "Two") pushT(2, () => cheap
    ? (card.arrive.push({ k: "dmg", to: "enemyUnits", n: 1 }), spent += 4.0, text.push("Arrive: deal 1 damage to every enemy unit."))
    : (card.arrive.push({ k: "dmg", to: "enemyUnits", n: 2 }), spent += 9.0, text.push("Arrive: deal 2 damage to every enemy unit.")));
  if (traits["Moon Dust"] === "Faint") pushT(3, () => add("veiled"));
  if (traits["Moon Dust"] === "Drifting") pushT(2, () => { add("veiled"); add("haste"); });
  const AURA = { Rose: "lifelink", Acid: "poison", Cold: "freeze", Opposed: "firstStrike" };
  if (AURA[traits.Aura]) pushT(4, () => add(AURA[traits.Aura]));
  if (traits.Aura === "Warm") pushT(4, () => { extraPower += 1; spent += 1; });
  if (GEOMETRY[traits.Geometry]) pushT(5, () => {
    const stat = GEOMETRY[traits.Geometry];
    card.aura = { [stat]: 1, from: traits.Geometry }; spent += 1.5;
    text.push(traits.Geometry + ": your other units have " + (stat === "power" ? "+1/+0." : "+0/+1."));
  });
  traitAbilities.sort((a, b) => a.prio - b.prio)
    // a named being is its power (and a unique, if it has one); its other traits are flavour
    .filter(t => !NAMED[n] || t.prio === 0)
    .slice(0, SLOTS[tier]).forEach(t => t.fn());

  // what is left of the budget becomes power and health, split by the being's stats
  const left = Math.max(1.5, BUDGET[tier] * 0.35, BUDGET[tier] - spent);
  const lean = 0.5 + ((s.magic + s.dark) / (s.magic + s.dark + s.spirit + s.knowledge) - 0.5) * 0.5;   // ~0.42..0.58
  let p = Math.round(left * lean), h = Math.round(left - p);
  p = Math.max(1, p + extraPower); h = Math.max(1, h + extraHealth);
  if (kw.has("doubleStrike")) p = Math.max(1, Math.round(p * 0.8));
  card.power = p; card.health = h;
  card.kw = [...kw].filter(k => k !== "tough");
  if (kw.has("tough")) card.tough = true;
  // the rules text: keywords first, then one "Arrive:" line, then the rest
  const KWNAME = new Set(Object.values(KW).map(k => k.text.toLowerCase()));
  const sentences = [...lead, ...text].join(" ").split(/(?<=\.)\s+/).filter(Boolean);
  const kwWords = [], arrive = [], rest = [];
  for (const t of sentences) {
    const parts = t.replace(/\.$/, "").split(/,\s*/);
    if (parts.every(w => KWNAME.has(w.toLowerCase()))) parts.forEach(w => kwWords.push(w.toLowerCase()));
    else if (t.startsWith("Arrive: ")) arrive.push(t.slice(8).replace(/\.$/, ""));
    else rest.push(t);
  }
  card.kw.forEach(k => kwWords.push(KW[k].text.toLowerCase()));
  const kwList = [...new Set(kwWords)].map((w, i) => i ? w : w[0].toUpperCase() + w.slice(1));
  const arriveLine = arrive.length ? "Arrive: " + arrive.map((a, i) => i ? a[0].toLowerCase() + a.slice(1) : a).join(", then ") + "." : "";
  card.text = [kwList.length ? kwList.join(", ") + "." : "", arriveLine, ...rest].filter(Boolean).join(" ");
  card.budgetUsed = r1(spent);
  return card;
}

/* ---------- the shared deck: 15 kinds, two of each ---------- */
const SHARED = [
  { id: "s-wisp",   kind: "unit", name: "Spore Wisp",     cost: 1, power: 1, health: 2, kw: [], essence: ["magic"] },
  { id: "s-moth",   kind: "unit", name: "Moth of Dusk",   cost: 2, power: 2, health: 1, kw: ["flying"], essence: ["dark"] },
  { id: "s-root",   kind: "unit", name: "Root Guard",     cost: 2, power: 1, health: 4, kw: [], essence: ["spirit"] },
  { id: "s-scribe", kind: "unit", name: "Star Scribe",    cost: 3, power: 2, health: 3, kw: [], essence: ["knowledge"], arrive: [{ k: "draw", n: 1 }], text: "Arrive: draw a card." },
  { id: "s-hound",  kind: "unit", name: "Storm Hound",    cost: 3, power: 3, health: 2, kw: ["haste"], essence: ["magic"] },
  { id: "s-halo",   kind: "unit", name: "Halo Sentinel",  cost: 4, power: 3, health: 4, kw: ["lifelink"], essence: ["light"] },
  { id: "s-lurker", kind: "unit", name: "Abyss Lurker",   cost: 5, power: 5, health: 4, kw: [], essence: ["dark"] },
  { id: "r-strike", kind: "ritual", name: "Lightning Strike", cost: 1, essence: ["magic"], effect: { k: "dmg", to: "anyTarget", n: 3 }, attuned: { k: "dmg", to: "anyTarget", n: 4 }, text: "Deal 3 damage to a unit or player. Attuned: 4." },
  { id: "r-nova",   kind: "ritual", name: "Supernova",      cost: 4, essence: ["light"], effect: { k: "dmg", to: "enemyUnits", n: 2 }, attuned: { k: "dmg", to: "enemyUnits", n: 3 }, text: "Deal 2 damage to every enemy unit. Attuned: 3." },
  { id: "r-halo",   kind: "ritual", name: "Halo",           cost: 1, essence: ["spirit"], effect: { k: "healFace", n: 5 }, attuned: { k: "healFace", n: 7 }, text: "Gain 5 life. Attuned: 7." },
  { id: "r-geo",    kind: "ritual", name: "Sacred Geometry", cost: 2, essence: ["knowledge"], effect: { k: "draw", n: 2 }, attuned: { k: "draw", n: 3 }, text: "Draw 2 cards. Attuned: 3." },
  { id: "r-eclipse",kind: "ritual", name: "Eclipse",        cost: 3, essence: ["dark"], effect: { k: "destroy", to: "enemyUnit", maxPower: 3 }, attuned: { k: "destroy", to: "enemyUnit", maxPower: 4 }, text: "Destroy an enemy unit with 3 or less power. Attuned: 4 or less." },
  { id: "r-ward",   kind: "ritual", name: "Mandala Ward",   cost: 1, essence: ["knowledge"], effect: { k: "buffUnit", power: 0, health: 3 }, attuned: { k: "buffUnit", power: 1, health: 3 }, text: "Give your unit +0/+3. Attuned: +1/+3." },
  { id: "r-aura",   kind: "ritual", name: "Warm Aura",      cost: 2, essence: ["spirit"], effect: { k: "buffUnit", power: 2, health: 1 }, attuned: { k: "buffUnit", power: 3, health: 2 }, text: "Give your unit +2/+1. Attuned: +3/+2." },
  { id: "r-dust",   kind: "ritual", name: "Moon Dust",      cost: 2, essence: ["magic"], effect: { k: "freezeDraw", to: "enemyUnit", n: 1 }, attuned: { k: "freezeDraw", to: "enemyUnit", n: 2 }, text: "Freeze an enemy unit and draw a card. Attuned: draw 2." },
];
const SHARED_DECK = SHARED.flatMap(c => [c.id, c.id]);   // 30 cards
const sharedById = Object.fromEntries(SHARED.map(c => [c.id, c]));

let ALL = null;
const all = () => (load(), ALL || (ALL = MAP.map((_, i) => cardOf(i + 1))));

module.exports = { cardOf, all, SHARED, SHARED_DECK, sharedById, TOKENS, TIERS, COST, ESSENCES, KW, NAMED, UNIQUE };
