/* ============================================================
   REALM Arena — every being as a fighter.

   Worked out on the server and sent to the page as plain data, so the
   same being always fights the same way:
   - ROLE from its strongest essence: Dark tank, Light striker, Knowledge
     ranged, Magic caster (area damage), Spirit support (heals).
   - COST from its tier (Common 2 ... the Source 9).
   - STRENGTH from cost and role, nudged by its other essences.
   - ONE POWER from its traits; Gods, Entities and the Source get a
     signature move instead.
   ============================================================ */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

const COST = { Common: 2, Uncommon: 3, Rare: 4, Epic: 4, Legendary: 5, Mythic: 6, Entity: 7, God: 8, Source: 9 };
const TIER_RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Entity: 6, God: 7, Source: 8 };
const ROLE_OF = { dark: "tank", light: "striker", knowledge: "ranged", magic: "caster", spirit: "support" };

/* per point of DMT: what each role is made of */
const ROLES = {
  tank:    { hp: 470, dmg: 42, hit: 1.5, range: 0.8, speed: 0.75, r: 0.6, buildings: true,  targetsAir: false, label: "Tank",    blurb: "Walks straight at towers and soaks the hits." },
  striker: { hp: 140, dmg: 49, hit: 1.0, range: 0.9, speed: 1.45, r: 0.45, buildings: false, targetsAir: false, label: "Striker", blurb: "Fast and fierce up close." },
  ranged:  { hp: 72,  dmg: 25, hit: 1.1, range: 5.0, speed: 1.0, r: 0.42, buildings: false, targetsAir: true,  label: "Ranged",  blurb: "Shoots from behind your front line. Hits flyers." },
  caster:  { hp: 92,  dmg: 26, hit: 1.4, range: 4.0, speed: 1.0, r: 0.42, buildings: false, targetsAir: true,  label: "Caster",  blurb: "Blasts groups with area damage." , splash: 1.3 },
  support: { hp: 104, dmg: 12, hit: 1.2, range: 3.5, speed: 1.0, r: 0.42, buildings: false, targetsAir: true,  label: "Support", blurb: "Heals the allies around it." },
};

/* each being's way of killing, from its most striking trait */
const STYLES = {
  gas:      { label: "Spore Gas",       text: "Leaves a toxic cloud that keeps hurting everything inside it.", tax: 0.82 },
  chain:    { label: "Chain Lightning", text: "Its lightning leaps to two more enemies.",                     tax: 0.9 },
  beam:     { label: "Tractor Beam",    text: "Flies. Its beam burns hotter the longer it holds a target.",   tax: 0.44 },
  burst:    { label: "Star Burst",      text: "Lands with a blast; every hit explodes.",                       tax: 0.95 },
  roots:    { label: "Roots",           text: "Pins its target in place, and slowly mends itself.",            tax: 0.88 },
  orbit:    { label: "Orbit",           text: "Moons circle it and smash every enemy close by, as well as its own attack.",               tax: 0.98 },
  cloak:    { label: "Phantom",         text: "Can't be seen until it strikes, and its first strike lands hard.", tax: 0.7 },
  frost:    { label: "Frost",           text: "Its hits slow enemies to a crawl.",                             tax: 0.98 },
  acid:     { label: "Acid",            text: "Its hits poison.",                                              tax: 0.84 },
  drain:    { label: "Drain",           text: "Heals itself with every hit.",                                  tax: 1.02 },
  fire:     { label: "Fire",            text: "Its hits set enemies burning.",                                 tax: 1.05 },
  first:    { label: "Ambush",          text: "Its first hit lands two and a half times as hard.",             tax: 1.05 },
  descend:  { label: "Descend",         text: "A God. Falls from the sky striking lightning at three enemies, then keeps calling bolts down.", tax: 0.9 },
  ethereal: { label: "Ethereal",        text: "An Entity. Marches on towers, and only towers can hurt it.",    tax: 1 },
  prime:    { label: "Prime",           text: "The Source. Arrives in a cataclysm of light; allies near it hit harder.", tax: 0.85 },
  // from its sacred geometry, for the beings no other trait claims
  wing:     { label: "Sky Diver",       text: "Flies, and dives on its prey from above.",                      tax: 0.76 },
  bomber:   { label: "Sky Bomber",      text: "Flies straight for towers and drops bombs on them. Explodes when it falls.", tax: 1 },
  charge:   { label: "Charge",          text: "After a short run it charges, and its next hit lands double.",   tax: 0.74 },
  quake:    { label: "Quake",           text: "Slams the ground: hurts and stuns everything around its target.", tax: 0.95 },
  summon:   { label: "Summoner",        text: "Calls two spirit wisps to fight for it every few seconds.",      tax: 0.72 },
  split:    { label: "Splitter",        text: "When it falls, it splits into two smaller copies.",              tax: 0.75 },
};

let MAP = null, STATS = null;
function load() {
  if (MAP) return;
  MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
  STATS = require("../duels").create({ root: ROOT, beings: async () => [], envVar: () => "" }).card;
}
const on = v => v && v !== "None";

function styleOf(tier, n, traits) {
  if (n === 1111) return "prime";
  if (tier === "God") return "descend";
  if (tier === "Entity") return "ethereal";
  if (on(traits.Mushrooms)) return "gas";
  if (on(traits.UFOs)) return "beam";
  const geo = { Rays: "wing", Metatron: "bomber", Gatefold: "charge", Lattice: "quake", Spiral: "summon", Weird: "split" }[traits.Geometry];
  if (geo) return geo;
  if (on(traits.Lightning)) return "chain";
  if (on(traits.Supernova)) return "burst";
  if (on(traits.Trees)) return "roots";
  if (on(traits.Planets)) return "orbit";
  if (on(traits["Moon Dust"])) return "cloak";
  return { Cold: "frost", Acid: "acid", Rose: "drain", Warm: "fire", Opposed: "first" }[traits.Aura] || "first";
}

/* one being, one fighter. boost: the $DMT boost (1..1.15) */
function fighter(n, boost = 1) {
  load();
  const [tier, being, traits = {}] = MAP[n - 1];
  const s = STATS(n), ES = ["magic", "spirit", "knowledge", "light", "dark"];
  const top = ES.slice().sort((a, b) => s[b] - s[a])[0];
  const style = styleOf(tier, n, traits), ST = STYLES[style];
  // Entities are siege spirits: they always go for towers
  const role = style === "ethereal" ? "tank" : ROLE_OF[top], R = ROLES[role], cost = COST[tier];
  // cheap cards are better value per DMT (they die to towers fast); rarer beings a touch stronger
  const eff = Math.pow(cost / 4, -0.15) * (1 + 0.012 * TIER_RANK[tier]) * boost;
  // the other essences lean it: sturdier (spirit, dark) or sharper (magic, light)
  const sum = ES.reduce((a, k) => a + s[k], 0);
  const lean = ((s.spirit + s.dark) - (s.magic + s.light)) / sum;          // about -0.2 .. 0.2
  let hp = R.hp * cost * eff * (1 + lean * 0.6), dmg = R.dmg * cost * eff * (1 - lean * 0.6) * ST.tax;
  let hit = R.hit, speed = R.speed, range = R.range;
  if (style === "chain") { hit *= 0.9; speed *= 1.1; }

  if (style === "beam") { range = Math.max(range, 3); hit = 0.5; dmg *= 0.5; }      // a steady beam: quick, small hits that grow
  if (style === "descend") range = Math.max(range, 4.5);
  if (style === "ethereal") { hp *= 0.55; dmg *= 1.25; speed = 0.9; }            // only towers can hurt it, so it carries less
  let air = style === "beam", targetsAirX = false, buildings = R.buildings;
  if (style === "wing") { const B = ROLES.striker; hp = B.hp * cost * eff * 0.85; dmg = B.dmg * cost * eff * ST.tax; range = 0.8; speed = 1.55; hit = 0.95; air = true; targetsAirX = true; buildings = false; }
  if (style === "bomber") { const B = ROLES.tank; hp = B.hp * cost * eff * 0.6; dmg = B.dmg * cost * eff * 1.9; range = 0.6; speed = 0.8; hit = 2; air = true; buildings = true; }
  // the bruisers fight up close whatever their essence: built from the striker, sturdier
  if (style === "quake") { const B = ROLES.striker; hp = B.hp * cost * eff * 1.7; dmg = B.dmg * cost * eff * 0.75 * ST.tax; range = 0.9; hit = 1.4; speed = 0.95; buildings = false; }
  if (style === "charge") { const B = ROLES.striker; hp = B.hp * cost * eff * 1.05; dmg = B.dmg * cost * eff * ST.tax; range = 0.9; hit = 1.15; speed = 1.15; buildings = false; }
  const card = {
    id: "b" + n, n, kind: "unit", name: being || tier + " #" + n, tier, cost, role, essence: top, style,
    hp: Math.round(hp), dmg: Math.round(dmg), hit: +hit.toFixed(2), range, speed: +speed.toFixed(2), r: R.r + (cost >= 7 ? 0.1 : 0),
    buildings, targetsAir: !buildings && (R.targetsAir || targetsAirX || style === "chain" || style === "descend" || style === "beam"), air,
    splash: role === "caster" ? R.splash : 0,
    gasR: style === "gas" ? +(1.4 + cost * 0.12).toFixed(2) : 0,
    heal: role === "support" ? Math.round(11 * cost * eff) : 0,
    blastDmg: Math.round(60 * cost * eff * (style === "prime" ? 2.2 : style === "descend" ? 1.2 : 1)),
  };
  card.power = { label: ST.label, text: ST.text };
  card.roleLabel = role === "tank" && style === "ethereal" ? "Siege" : R.label;
  return card;
}

/* the spells every deck can carry */
const SPELLS = {
  strike: { id: "strike", kind: "spell", name: "Lightning Strike", cost: 2, effect: "damage", radius: 1.4, amount: 260, text: "Hits a small spot hard. Towers take a third." },
  nova:   { id: "nova",   kind: "spell", name: "Supernova",        cost: 4, effect: "damage", radius: 2.8, amount: 380, text: "A big blast over a wide area. Towers take a third." },
  halo:   { id: "halo",   kind: "spell", name: "Halo",             cost: 3, effect: "heal",   radius: 3,   amount: 450, text: "Heals and shields your units in an area." },
  dust:   { id: "dust",   kind: "spell", name: "Moon Dust",        cost: 3, effect: "freeze", radius: 2.5, amount: 3,   text: "Freezes enemy units in an area for 3 seconds." },
  // the epic ones: dear, slow to land, and ruinous
  meteor: { id: "meteor", kind: "spell", name: "Meteor Shower",    cost: 5, effect: "damage", radius: 3.0, amount: 185, count: 6, epic: true, text: "Six burning meteors rain down across a wide area." },
  hole:   { id: "hole",   kind: "spell", name: "Black Hole",       cost: 6, effect: "damage", radius: 3.2, amount: 620, epic: true, text: "Drags every enemy near it into a vortex for two seconds, then implodes." },
  mother: { id: "mother", kind: "spell", name: "Mothership",       cost: 7, effect: "damage", radius: 2.3, amount: 300, epic: true, text: "A colossal ship descends and burns the ground under it with a death beam for three seconds." },
};
const SMALL = ["strike", "nova"], EPIC = ["meteor", "hole", "mother"];

/* a deck: six beings and two spells */
function deck(beings, boost = 1, spells = ["strike", "nova"]) {
  return [...beings.slice(0, 6).map(n => fighter(n, boost)), ...spells.map(id => ({ ...SPELLS[id] }))];
}

let BY_TIER = null;
function byTier() {
  load();
  if (!BY_TIER) { BY_TIER = {}; MAP.forEach(([t], i) => (BY_TIER[t] = BY_TIER[t] || []).push(i + 1)); }
  return BY_TIER;
}

module.exports = { fighter, deck, SPELLS, SMALL, EPIC, ROLES, STYLES, COST, byTier };
