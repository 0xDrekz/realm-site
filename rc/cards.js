/* ============================================================
   REALM Cards — the card pool.

   Every one of the 1,111 beings is a card, the same card every time:
     ESSENCE  its strongest stat (from the Duels card() stats, unchanged):
              Magic, Spirit, Knowledge, Light or Dark. Like a colour in Magic.
     COST     from its tier (Commons 1-2 ... the Source 9), in essence crystals.
     ABILITIES from its traits (UFOs fly, Lightning is quick, Mushrooms bring
              spores...), more of them on rarer beings. The 20 Entities, the 10
              Gods and the Source have hand-written powers.
     POWER / HEALTH  a budget set by cost, less what the abilities are worth,
              split by the being's own stats.
   Plus the spells: Rites (fast, can be cast in the rival's attack), Rituals
   and Relics (they stay in play), eight to ten for each essence.

   Pure and deterministic: no randomness, no I/O after load.
   ============================================================ */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

const ESSENCES = ["magic", "spirit", "knowledge", "light", "dark"];
const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
const BASE_COST = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6, Entity: 7, God: 8, Source: 9 };
/* small per-essence body adjustments, from the balance sim: each essence's spells are worth a different amount */
const ESS_ADJ = { magic: 0, spirit: 0.1, knowledge: 0.3, light: 0, dark: 0 };
const SLOTS = { Common: 1, Uncommon: 1, Rare: 2, Epic: 2, Legendary: 3, Mythic: 3, Entity: 3, God: 3, Source: 3 };

/* keywords, and what each is worth in stat points */
const KW = {
  flying:      { cost: 1.5, name: "Flying",       rule: "Can only be blocked by beings with Flying or Reach." },
  reach:       { cost: 0.5, name: "Reach",        rule: "Can block beings with Flying." },
  haste:       { cost: 1.0, name: "Haste",        rule: "Can attack the turn it arrives." },
  lifelink:    { cost: 1.0, name: "Lifelink",     rule: "Damage it deals also heals you." },
  deathtouch:  { cost: 1.5, name: "Deathtouch",   rule: "Any damage it deals to a being destroys it." },
  firstStrike: { cost: 1.2, name: "First strike", rule: "Deals its combat damage before the other side." },
  doubleStrike:{ cost: 2.6, name: "Double strike",rule: "Deals combat damage first, then again." },
  trample:     { cost: 0.7, name: "Trample",      rule: "Damage beyond what kills its blocker hits the player." },
  vigilance:   { cost: 0.5, name: "Vigilance",    rule: "Attacking doesn't tire it: it can still block." },
  veiled:      { cost: 0.8, name: "Veiled",       rule: "Your rival's spells and abilities can't target it." },
  frost:       { cost: 0.6, name: "Frost",        rule: "A being it damages is frozen: it skips its next untap." },
  elusive:     { cost: 2.2, name: "Elusive",      rule: "Can't be blocked." },
};

/* tokens that cards can summon */
const TOKENS = {
  spore:   { name: "Spore",       power: 1, health: 1, kw: [],              essence: "spirit" },
  jelly:   { name: "Jelly Spore", power: 1, health: 1, kw: ["deathtouch"],  essence: "dark" },
  seed:    { name: "Nebula Seed", power: 2, health: 2, kw: [],              essence: "spirit" },
  feather: { name: "Feather",     power: 1, health: 1, kw: ["flying"],      essence: "light" },
  husk:    { name: "Bone Husk",   power: 3, health: 3, kw: [],              essence: "dark" },
  cloud:   { name: "Cloudling",   power: 2, health: 2, kw: ["flying"],      essence: "knowledge" },
  wisp:    { name: "Wisp",        power: 2, health: 2, kw: [],              essence: "spirit" },
  angel:   { name: "Light Warden",power: 2, health: 3, kw: ["flying"],      essence: "light" },
  imp:     { name: "Ember Imp",   power: 2, health: 1, kw: ["haste"],       essence: "magic" },
};

/* ---------- the hand-written powers: 10 Gods, 20 Entities, the Source ---------- */
const NAMED = {
  // Gods
  176: { cost: 3.5, aura: { power: 1, health: 1 }, arrive: [{ k: "draw", n: 1 }], text: "Your other beings have +1/+1. Arrive: draw a card." },
  460: { cost: 3.0, kw: ["veiled"], arrive: [{ k: "freeze", to: "allEnemy" }], text: "Arrive: freeze every enemy being." },
  485: { cost: 4.0, arrive: [{ k: "dmg", to: "allEnemyBeings", n: 3 }], text: "Arrive: deal 3 damage to every enemy being." },
  569: { cost: 3.0, arrive: [{ k: "draw", n: 2 }], aura: { spellDiscount: 1 }, text: "Arrive: draw 2 cards. Your spells cost 1 less." },
  649: { cost: 2.5, turnStart: [{ k: "summon", token: "seed", n: 1 }], text: "At the start of your turn, summon a 2/2 Nebula Seed." },
  762: { cost: 3.5, kw: ["flying", "lifelink"], arrive: [{ k: "gain", n: 5 }], text: "Arrive: gain 5 life." },
  784: { cost: 2.5, arrive: [{ k: "summon", token: "jelly", n: 3 }], text: "Arrive: summon three 1/1 Jelly Spores with Deathtouch." },
  806: { cost: 3.5, arrive: [{ k: "destroy", to: "enemyBeing" }], text: "Arrive: destroy an enemy being." },
  842: { cost: 3.0, aura: { health: 2 }, turnEnd: [{ k: "gain", n: 2 }], text: "Your other beings have +0/+2. At the end of your turn, gain 2 life." },
  858: { cost: 3.5, onAttack: [{ k: "dmg", to: "allEnemyBeings", n: 2 }], text: "When it attacks, deal 2 damage to every enemy being." },
  // Entities
  29:  { cost: 2.5, arrive: [{ k: "buff", to: "allOwn", p: 0, h: 2, perm: true }], text: "Arrive: your beings get +0/+2 for good." },
  56:  { cost: 2.5, arrive: [{ k: "draw", n: 2 }], text: "Arrive: draw 2 cards." },
  86:  { cost: 2.5, arrive: [{ k: "bounce", to: "enemyBeing" }], text: "Arrive: return an enemy being to its owner's hand." },
  189: { cost: 3.0, arrive: [{ k: "dmg", to: "allEnemyBeings", n: 3, minPower: 3 }], text: "Arrive: deal 3 damage to every enemy being with 3 or more power." },
  233: { cost: 3.0, kw: ["flying"], arrive: [{ k: "summon", token: "feather", n: 2 }], text: "Arrive: summon two 1/1 flying Feathers." },
  253: { cost: 3.0, kw: ["flying", "lifelink"], text: "" },
  329: { cost: 3.0, aura: { power: 1, health: 1 }, text: "Your other beings have +1/+1." },
  368: { cost: 3.0, arrive: [{ k: "dmg", to: "allEnemy", n: 1 }], turnStart: [{ k: "dmg", to: "enemyPlayer", n: 1 }], text: "Arrive: deal 1 damage to every enemy. At the start of your turn, deal 1 damage to your rival." },
  436: { cost: 0, kw: ["elusive"], text: "" },
  438: { cost: 3.0, turnStart: [{ k: "summon", token: "jelly", n: 1 }], text: "At the start of your turn, summon a 1/1 Jelly Spore with Deathtouch." },
  541: { cost: 1.5, arrive: [{ k: "destroy", to: "allOtherMaxPower2" }], text: "Arrive: destroy every other being with 2 or less power, on both sides." },
  597: { cost: 2.0, kw: ["flying", "haste"], arrive: [{ k: "dmg", to: "enemyPlayer", n: 3 }], text: "Arrive: deal 3 damage to your rival." },
  601: { cost: 3.5, arrive: [{ k: "destroy", to: "enemyBeing" }], text: "Arrive: destroy an enemy being." },
  641: { cost: 2.0, arrive: [{ k: "crystal", n: 2 }, { k: "draw", n: 1 }], text: "Arrive: gain 2 crystals this turn and draw a card." },
  658: { cost: 0, kw: ["doubleStrike"], text: "" },
  697: { cost: 1.5, kw: ["firstStrike"], death: [{ k: "summon", token: "husk", n: 1 }], text: "When it dies, summon a 3/3 Bone Husk." },
  701: { cost: 2.0, arrive: [{ k: "freeze", to: "allEnemy", maxCost: 4 }], text: "Arrive: freeze every enemy being that costs 4 or less." },
  817: { cost: 3.0, kw: ["flying"], aura: { flyingBoost: 1 }, arrive: [{ k: "summon", token: "cloud", n: 1 }], text: "Your other flyers have +1/+1. Arrive: summon a 2/2 flying Cloudling." },
  908: { cost: 2.5, turnEnd: [{ k: "gain", n: 2 }], kw: ["vigilance"], text: "At the end of your turn, gain 2 life." },
  1086: { cost: 2.5, kw: ["deathtouch"], arrive: [{ k: "freeze", to: "allEnemy" }], text: "Arrive: freeze every enemy being." },
  // the Source
  1111: { cost: 6.0, kw: ["flying"], arrive: [{ k: "dmg", to: "allEnemy", n: 3 }, { k: "gain", n: 4 }, { k: "draw", n: 2 }], text: "Arrive: deal 3 damage to every enemy, gain 4 life and draw 2 cards." },
};

/* the one-of trait values */
const UNIQUE = {
  "Lightning:Tempest": { cost: 3.0, kw: ["haste"], arrive: [{ k: "dmg", to: "allEnemyBeings", n: 2 }], text: "Arrive: deal 2 damage to every enemy being." },
  "Mushrooms:Grove":   { cost: 3.0, turnStart: [{ k: "summon", token: "spore", n: 1 }], text: "At the start of your turn, summon a 1/1 Spore." },
  "Trees:Forest":      { cost: 2.5, aura: { health: 1 }, text: "Your other beings have +0/+1." },
  "Moon Dust:Heavy":   { cost: 0, kw: ["elusive"], text: "" },
  "Supernova:Barrage": { cost: 4.0, arrive: [{ k: "dmg", to: "allEnemy", n: 3 }], text: "Arrive: deal 3 damage to every enemy." },
  "Planets:Cluster":   { cost: 2.0, turnStart: [{ k: "draw", n: 1 }], text: "At the start of your turn, draw an extra card." },
};

let MAP = null, STATS = null, TOTALS = null;
function load() {
  if (MAP) return;
  MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
  STATS = require("../duels").create({ root: ROOT, beings: async () => [], envVar: () => "" }).card;   // the stat function, unchanged
  // within its tier, a being in the stronger half costs one more (Commons 1 or 2, Uncommons 2 or 3)
  TOTALS = {};
  MAP.forEach(([t], i) => (TOTALS[t] = TOTALS[t] || []).push(STATS(i + 1).total));
  for (const t of Object.keys(TOTALS)) TOTALS[t].sort((a, b) => a - b);
}
const on = v => v && v !== "None";

/* ---------- one being, one card ---------- */
function being(n) {
  load();
  const [tier, name, traits = {}] = MAP[n - 1];
  const s = STATS(n);
  const essence = ESSENCES.slice().sort((a, b) => s[b] - s[a])[0];
  const list = TOTALS[tier], median = list[Math.floor(list.length / 2)];
  const cost = BASE_COST[tier] + ((tier === "Common" || tier === "Uncommon") && s.total >= median ? 1 : 0);
  const card = { id: "b" + n, n, type: "being", name: name || tier + " #" + n, tier, cost, essence, kw: [], arrive: [], turnStart: [], turnEnd: [], death: [], onAttack: [], aura: null, text: "", named: false };
  const kw = new Set(), lines = [];
  let spent = 0, plusP = 0, plusH = 0;
  const add = k => { if (!kw.has(k)) { kw.add(k); spent += KW[k].cost; } };
  const power = p => { (p.kw || []).forEach(add); for (const w of ["arrive", "turnStart", "turnEnd", "death", "onAttack"]) if (p[w]) card[w].push(...p[w]); if (p.aura) card.aura = p.aura; spent += p.cost; if (p.text) lines.push(p.text); };

  if (NAMED[n]) { power(NAMED[n]); card.named = true; }
  const abil = [];
  const T = (prio, c, fn) => abil.push({ prio, c, fn });
  const uq = Object.keys(UNIQUE).find(k => { const [t, v] = k.split(":"); return traits[t] === v; });
  if (uq) T(0, 0, () => { power(UNIQUE[uq]); card.named = true; });
  const big = cost >= 4;
  if (on(traits.UFOs)) T(2, 1.5, () => add("flying"));
  if (traits.Lightning === "Strike") T(2, 1.0, () => add("haste"));
  if (traits.Lightning === "Storm") T(2, 1.6, () => { add("haste"); card.arrive.push({ k: "dmg", to: "enemyPlayer", n: 1 }); spent += 0.6; lines.push("Arrive: deal 1 damage to your rival."); });
  if (traits.Mushrooms === "Few") T(2, 1.6, () => { card.arrive.push({ k: "summon", token: "spore", n: 1 }); spent += 1.6; lines.push("Arrive: summon a 1/1 Spore."); });
  if (traits.Mushrooms === "Cluster") T(2, 3.0, () => { card.arrive.push({ k: "summon", token: "spore", n: 2 }); spent += 3.0; lines.push("Arrive: summon two 1/1 Spores."); });
  if (traits.Trees === "One") T(3, 1.5, () => { add("reach"); plusH += 1; spent += 1; });
  if (traits.Trees === "Copse") T(3, 1.0, () => { add("vigilance"); add("reach"); });
  if (traits.Planets === "One") T(2, 1.2, () => { card.arrive.push({ k: "draw", n: 1 }); spent += 1.2; lines.push("Arrive: draw a card."); });
  if (traits.Planets === "Two") T(2, 2.6, () => { card.arrive.push({ k: "draw", n: 2 }); spent += 2.6; lines.push("Arrive: draw 2 cards."); });
  if (traits.Planets === "Ringed") T(2, 1.8, () => { card.arrive.push({ k: "draw", n: 1 }, { k: "gain", n: 2 }); spent += 1.8; lines.push("Arrive: draw a card and gain 2 life."); });
  if (traits.Supernova === "One") T(2, big ? 2.5 : 1.2, () => big
    ? (card.arrive.push({ k: "dmg", to: "allEnemyBeings", n: 1 }), spent += 2.5, lines.push("Arrive: deal 1 damage to every enemy being."))
    : (card.arrive.push({ k: "dmg", to: "enemyPlayer", n: 2 }), spent += 1.2, lines.push("Arrive: deal 2 damage to your rival.")));
  if (traits.Supernova === "Two") T(2, big ? 5.0 : 2.5, () => big
    ? (card.arrive.push({ k: "dmg", to: "allEnemyBeings", n: 2 }), spent += 5.0, lines.push("Arrive: deal 2 damage to every enemy being."))
    : (card.arrive.push({ k: "dmg", to: "allEnemyBeings", n: 1 }), spent += 2.5, lines.push("Arrive: deal 1 damage to every enemy being.")));
  if (traits["Moon Dust"] === "Faint") T(3, 0.8, () => add("veiled"));
  if (traits["Moon Dust"] === "Drifting") T(2, 1.8, () => { add("veiled"); add("haste"); });
  const AURA = { Rose: "lifelink", Acid: "deathtouch", Cold: "frost", Opposed: "firstStrike" };
  if (AURA[traits.Aura]) T(4, KW[AURA[traits.Aura]].cost, () => add(AURA[traits.Aura]));
  if (traits.Aura === "Warm") T(4, 1.0, () => { plusP += 1; spent += 1; });
  if (["Rays", "Spiral", "Gatefold", "Weird", "Metatron"].includes(traits.Geometry)) T(5, 0.7, () => add("trample"));
  if (["Mandala", "Rosette", "Flower", "Yantra", "Lattice"].includes(traits.Geometry)) T(5, 0.5, () => add("vigilance"));
  // the body: 2 points of power and health per crystal, plus one, less the abilities; split by the being's stats
  const budget = 2 * cost + 1.5 + (tier === "Entity" || tier === "God" ? 1.5 : tier === "Source" ? 2 : 0) + ESS_ADJ[essence];
  // a named being is its power alone; otherwise abilities in order, while they fit and leave a body of at least 2
  let slots = NAMED[n] ? 0 : SLOTS[tier];
  for (const a of abil.sort((a, b) => a.prio - b.prio)) {
    if (!slots) break;
    if (a.c && spent + a.c > budget - 2) continue;
    a.fn(); slots--;
  }
  const left = Math.max(2, budget * 0.4, budget - spent);
  const lean = 0.5 + ((s.magic + s.dark) / (s.magic + s.dark + s.spirit + s.knowledge) - 0.5) * 0.4;
  let p = Math.round(left * lean), h = Math.round(left - left * lean);
  card.power = Math.max(1, p + plusP - (kw.has("doubleStrike") ? 1 : 0)); card.health = Math.max(1, h + plusH);
  card.kw = [...kw];
  card.text = lines.join(" ");
  card.traits = Object.fromEntries(Object.entries(traits).filter(([, v]) => on(v)));
  return card;
}

/* ---------- the spells, by essence ----------
   rite: fast (your turn, or while the rival attacks)   ritual: your turn only   relic: stays in play */
const SPELLS = [
  // MAGIC: fire and tricks
  { id: "s-spark",   name: "Spark",          essence: "magic", type: "rite",   cost: 1, fx: [{ k: "dmg", to: "any", n: 2 }], text: "Deal 2 damage to any being or player." },
  { id: "s-frenzy",  name: "Frenzy",         essence: "magic", type: "rite",   cost: 1, fx: [{ k: "buff", to: "ownBeing", p: 3, h: 0, kw: ["firstStrike"] }], text: "Your being gets +3/+0 and First strike this turn." },
  { id: "s-blaze",   name: "Blaze",          essence: "magic", type: "ritual", cost: 3, fx: [{ k: "dmg", to: "being", n: 4 }], text: "Deal 4 damage to a being." },
  { id: "s-imps",    name: "Ember Imps",     essence: "magic", type: "ritual", cost: 3, fx: [{ k: "summon", token: "imp", n: 2 }], text: "Summon two 2/1 Ember Imps with Haste." },
  { id: "s-fireball",name: "Fireball",       essence: "magic", type: "ritual", cost: 5, fx: [{ k: "dmg", to: "any", n: 5 }], text: "Deal 5 damage to any being or player." },
  { id: "s-storm",   name: "Chain Storm",    essence: "magic", type: "ritual", cost: 5, fx: [{ k: "dmg", to: "allEnemyBeings", n: 3 }], text: "Deal 3 damage to every enemy being." },
  { id: "s-overload",name: "Overload",       essence: "magic", type: "relic",  cost: 3, static: { spellDmg: 1 }, text: "Your spells deal 1 more damage." },
  { id: "s-meteor",  name: "Meteor",         essence: "magic", type: "ritual", cost: 6, fx: [{ k: "dmg", to: "being", n: 7 }, { k: "dmg", to: "enemyPlayer", n: 3 }], text: "Deal 7 damage to a being and 3 to your rival." },
  // SPIRIT: growth and life
  { id: "s-growth",  name: "Wild Growth",    essence: "spirit", type: "rite",  cost: 1, fx: [{ k: "buff", to: "ownBeing", p: 2, h: 2 }], text: "Your being gets +2/+2 this turn." },
  { id: "s-mend",    name: "Mend",           essence: "spirit", type: "rite",  cost: 2, fx: [{ k: "gain", n: 5 }], text: "Gain 5 life." },
  { id: "s-bloom",   name: "Ancient Bloom",  essence: "spirit", type: "ritual",cost: 2, fx: [{ k: "ramp", n: 1 }], text: "Gain an extra crystal, for good." },
  { id: "s-wisps",   name: "Call the Wisps", essence: "spirit", type: "ritual",cost: 3, fx: [{ k: "summon", token: "wisp", n: 2 }], text: "Summon two 2/2 Wisps." },
  { id: "s-roar",    name: "Wild Roar",      essence: "spirit", type: "ritual",cost: 4, fx: [{ k: "buff", to: "allOwn", p: 1, h: 1, perm: true }], text: "Your beings get +1/+1 for good." },
  { id: "s-grove",   name: "Spore Grove",    essence: "spirit", type: "relic", cost: 3, turnEnd: [{ k: "summon", token: "spore", n: 1 }], text: "At the end of your turn, summon a 1/1 Spore." },
  { id: "s-titan",   name: "Rite of the Old Wood", essence: "spirit", type: "ritual", cost: 6, fx: [{ k: "buff", to: "ownBeing", p: 4, h: 4, perm: true, kw: ["trample"] }], text: "Your being gets +4/+4 and Trample for good." },
  { id: "s-renewal", name: "Renewal",        essence: "spirit", type: "ritual",cost: 3, fx: [{ k: "gain", n: 4 }, { k: "draw", n: 1 }], text: "Gain 4 life and draw a card." },
  // KNOWLEDGE: cards and control
  { id: "s-insight", name: "Insight",        essence: "knowledge", type: "ritual", cost: 2, fx: [{ k: "draw", n: 2 }], text: "Draw 2 cards." },
  { id: "s-freeze",  name: "Deep Freeze",    essence: "knowledge", type: "rite",   cost: 2, fx: [{ k: "freeze", to: "enemyBeing" }, { k: "draw", n: 1 }], text: "Freeze an enemy being and draw a card." },
  { id: "s-recall",  name: "Recall",         essence: "knowledge", type: "rite",   cost: 2, fx: [{ k: "bounce", to: "enemyBeing" }], text: "Return an enemy being to its owner's hand." },
  { id: "s-cloud",   name: "Cloud Weaving",  essence: "knowledge", type: "ritual", cost: 3, fx: [{ k: "summon", token: "cloud", n: 1 }, { k: "draw", n: 1 }], text: "Summon a 2/2 flying Cloudling and draw a card." },
  { id: "s-study",   name: "The Long Study", essence: "knowledge", type: "relic",  cost: 4, turnStart: [{ k: "draw", n: 1 }], text: "At the start of your turn, draw an extra card." },
  { id: "s-tide",    name: "Still Tide",     essence: "knowledge", type: "ritual", cost: 4, fx: [{ k: "freeze", to: "allEnemy" }, { k: "draw", n: 2 }], text: "Freeze every enemy being and draw 2 cards." },
  { id: "s-lance",   name: "Mind Lance",     essence: "knowledge", type: "ritual", cost: 4, fx: [{ k: "dmg", to: "being", n: 4 }, { k: "draw", n: 1 }], text: "Deal 4 damage to a being and draw a card." },
  { id: "s-ward",    name: "Mandala Ward",   essence: "knowledge", type: "rite",   cost: 1, fx: [{ k: "buff", to: "ownBeing", p: 0, h: 3, kw: ["veiled"] }], text: "Your being gets +0/+3 and Veiled this turn." },
  // LIGHT: flyers and protection
  { id: "s-shield",  name: "Halo Shield",    essence: "light", type: "rite",   cost: 1, fx: [{ k: "buff", to: "ownBeing", p: 1, h: 3 }], text: "Your being gets +1/+3 this turn." },
  { id: "s-smite",   name: "Smite",          essence: "light", type: "rite",   cost: 2, fx: [{ k: "destroy", to: "attacker" }], text: "Destroy an attacking being." },
  { id: "s-rally",   name: "Rally",          essence: "light", type: "rite",   cost: 3, fx: [{ k: "buff", to: "allOwn", p: 1, h: 1, kw: ["vigilance"] }], text: "Your beings get +1/+1 and Vigilance this turn." },
  { id: "s-sanct",   name: "Sanctuary",      essence: "light", type: "relic",  cost: 2, turnStart: [{ k: "gain", n: 2 }], text: "At the start of your turn, gain 2 life." },
  { id: "s-host",    name: "Angelic Host",   essence: "light", type: "ritual", cost: 5, fx: [{ k: "summon", token: "angel", n: 2 }], text: "Summon two 2/3 flying Light Wardens." },
  { id: "s-judge",   name: "Judgement",      essence: "light", type: "ritual", cost: 6, fx: [{ k: "destroy", to: "allMinPower4" }], text: "Destroy every being with 4 or more power." },
  { id: "s-feathers",name: "Falling Feathers", essence: "light", type: "ritual", cost: 2, fx: [{ k: "summon", token: "feather", n: 2 }], text: "Summon two 1/1 flying Feathers." },
  { id: "s-dawn",    name: "Dawn",           essence: "light", type: "ritual", cost: 4, fx: [{ k: "gain", n: 4 }, { k: "buff", to: "allOwn", p: 0, h: 2, perm: true }], text: "Gain 4 life. Your beings get +0/+2 for good." },
  // DARK: removal and sacrifice
  { id: "s-drain",   name: "Life Drain",     essence: "dark", type: "rite",   cost: 2, fx: [{ k: "dmg", to: "being", n: 2 }, { k: "gain", n: 2 }], text: "Deal 2 damage to a being and gain 2 life." },
  { id: "s-doom",    name: "Doom",           essence: "dark", type: "ritual", cost: 3, fx: [{ k: "destroy", to: "enemyBeing" }], text: "Destroy an enemy being." },
  { id: "s-plague",  name: "Plague",         essence: "dark", type: "ritual", cost: 4, fx: [{ k: "dmg", to: "allBeings", n: 2 }], text: "Deal 2 damage to every being, yours too." },
  { id: "s-offer",   name: "Dark Offering",  essence: "dark", type: "ritual", cost: 1, fx: [{ k: "sacrifice", to: "ownBeing" }, { k: "draw", n: 2 }], text: "Destroy one of your beings and draw 2 cards." },
  { id: "s-raise",   name: "Raise the Dead", essence: "dark", type: "ritual", cost: 3, fx: [{ k: "raise" }], text: "Return the last being you lost to your hand." },
  { id: "s-curse",   name: "Curse of Ash",   essence: "dark", type: "relic",  cost: 3, turnStart: [{ k: "dmg", to: "enemyPlayer", n: 1 }], text: "At the start of your turn, your rival loses 1 life." },
  { id: "s-husks",   name: "Bone Husks",     essence: "dark", type: "ritual", cost: 4, fx: [{ k: "summon", token: "husk", n: 1 }, { k: "dmg", to: "enemyPlayer", n: 2 }], text: "Summon a 3/3 Bone Husk. Your rival loses 2 life." },
  { id: "s-eclipse", name: "Eclipse",        essence: "dark", type: "rite",   cost: 2, fx: [{ k: "destroy", to: "enemyBeing", maxPower: 3 }], text: "Destroy an enemy being with 3 or less power." },
];
const SPELL = Object.fromEntries(SPELLS.map(s => [s.id, s]));

/* ---------- lookups ---------- */
const CACHE = new Map();
function cardOf(id) {
  if (CACHE.has(id)) return CACHE.get(id);
  let c = null;
  if (typeof id === "string" && id[0] === "b") { const n = Number(id.slice(1)); if (Number.isInteger(n) && n >= 1 && n <= 1111) c = being(n); }
  else if (SPELL[id]) c = SPELL[id];
  if (c) CACHE.set(id, c);
  return c;
}
let ALL = null;
const allBeings = () => (load(), ALL || (ALL = MAP.map((_, i) => being(i + 1))));

/* ---------- decks ---------- */
const DECK_SIZE = 30, MAX_SPELL_COPIES = 2, MAX_ESSENCES = 2;
/* a deck is a list of card ids: beings once each, spells up to twice, one or two essences */
function checkDeck(ids) {
  if (!Array.isArray(ids) || ids.length !== DECK_SIZE) return "A deck is exactly 30 cards.";
  const count = {}, ess = new Set();
  for (const id of ids) {
    const c = cardOf(String(id));
    if (!c) return "That deck has a card that doesn't exist.";
    count[id] = (count[id] || 0) + 1;
    if (c.type === "being" && count[id] > 1) return `${c.name} can only be in a deck once.`;
    if (c.type !== "being" && count[id] > MAX_SPELL_COPIES) return `${c.name} can be in a deck at most twice.`;
    ess.add(c.essence);
  }
  if (ess.size > MAX_ESSENCES) return "A deck can use at most two essences.";
  return null;
}

/* a good deck for one or two essences: about 18 beings on a curve and 12 spells.
   pick(n) returns 0..n-1 (the caller's own randomness, so starter decks can be fixed) */
function buildDeck(essences, { prefer = [], pick = n => 0 } = {}) {
  const ess = essences.slice(0, 2);
  const beings = allBeings().filter(c => ess.includes(c.essence));
  const preferred = beings.filter(c => prefer.includes(c.n));
  const curve = { 1: 3, 2: 4, 3: 4, 4: 3, 5: 2, 6: 1, 7: 1 };   // 18 beings
  const deck = [], used = new Set();
  for (const c of preferred.sort((a, b) => b.cost - a.cost).slice(0, 8)) { deck.push(c.id); used.add(c.id); const k = Math.min(7, c.cost); if (curve[k]) curve[k]--; }
  for (const [k, want] of Object.entries(curve)) {
    const pool = beings.filter(c => (Number(k) === 7 ? c.cost >= 7 : c.cost === Number(k)) && !used.has(c.id));
    for (let i = 0; i < want && pool.length; i++) { const c = pool.splice(pick(pool.length), 1)[0]; deck.push(c.id); used.add(c.id); }
  }
  const spells = SPELLS.filter(s => ess.includes(s.essence)).map(s => s.id);
  let i = 0;
  while (deck.length < DECK_SIZE && spells.length) { const id = spells[(i++ + pick(spells.length)) % spells.length]; if (deck.filter(x => x === id).length < MAX_SPELL_COPIES) deck.push(id); if (i > 400) break; }
  while (deck.length < DECK_SIZE) { const c = beings.find(b => !used.has(b.id)); used.add(c.id); deck.push(c.id); }
  return deck;
}

module.exports = { cardOf, allBeings, being, SPELLS, SPELL, TOKENS, KW, NAMED, ESSENCES, TIERS, checkDeck, buildDeck, DECK_SIZE };
