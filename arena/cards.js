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
  beam:     { label: "Tractor Beam",    text: "Flies. Its beam burns hotter the longer it holds a target.",   tax: 0.5 },
  burst:    { label: "Star Burst",      text: "Lands with a blast; every hit explodes.",                       tax: 0.95 },
  roots:    { label: "Roots",           text: "Pins its target in place, and slowly mends itself.",            tax: 0.88 },
  orbit:    { label: "Orbit",           text: "Moons circle it and smash every enemy close by, as well as its own attack.",               tax: 0.9 },
  cloak:    { label: "Phantom",         text: "Can't be seen until it strikes, and its first strike lands hard.", tax: 0.64 },
  frost:    { label: "Frost",           text: "Its hits slow enemies to a crawl.",                             tax: 0.98 },
  acid:     { label: "Acid",            text: "Its hits poison.",                                              tax: 0.88 },
  drain:    { label: "Drain",           text: "Heals itself with every hit.",                                  tax: 0.98 },
  fire:     { label: "Fire",            text: "Its hits set enemies burning.",                                 tax: 0.88 },
  first:    { label: "Ambush",          text: "Its first hit lands two and a half times as hard.",             tax: 1.05 },
  descend:  { label: "Descend",         text: "A God. Falls from the sky striking lightning at three enemies, then keeps calling bolts down.", tax: 0.9 },
  ethereal: { label: "Ethereal",        text: "An Entity. Marches on towers, and only towers can hurt it.",    tax: 1 },
  prime:    { label: "Prime",           text: "The Source. Arrives in a cataclysm of light; allies near it hit harder.", tax: 0.85 },
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
  if (on(traits.Lightning)) return "chain";
  if (on(traits.UFOs)) return "beam";
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
  const card = {
    id: "b" + n, n, kind: "unit", name: being || tier + " #" + n, tier, cost, role, essence: top, style,
    hp: Math.round(hp), dmg: Math.round(dmg), hit: +hit.toFixed(2), range, speed: +speed.toFixed(2), r: R.r + (cost >= 7 ? 0.1 : 0),
    buildings: R.buildings, targetsAir: R.targetsAir || style === "chain" || style === "descend" || style === "beam", air: style === "beam",
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
};

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

module.exports = { fighter, deck, SPELLS, ROLES, STYLES, COST, byTier };
