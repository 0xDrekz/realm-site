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
  caster:  { hp: 88,  dmg: 23, hit: 1.4, range: 4.0, speed: 1.0, r: 0.42, buildings: false, targetsAir: true,  label: "Caster",  blurb: "Blasts groups with area damage." , splash: 1.3 },
  support: { hp: 104, dmg: 12, hit: 1.2, range: 3.5, speed: 1.0, r: 0.42, buildings: false, targetsAir: true,  label: "Support", blurb: "Heals the allies around it." },
};

const POWERS = {
  flying:    { label: "Flying",      text: "Flies over the river; only ranged units, casters and supports can hit it." },
  blast:     { label: "Supernova",   text: "Lands with a blast that hurts every enemy nearby." },
  spores:    { label: "Spores",      text: "Brings two spores with it." },
  fast:      { label: "Lightning",   text: "Moves and strikes faster." },
  regen:     { label: "Rooted",      text: "Heals itself over time." },
  shield:    { label: "Moon Dust",   text: "Arrives with a shield." },
  slow:      { label: "Cold",        text: "Its hits slow the enemy." },
  poison:    { label: "Acid",        text: "Its hits poison." },
  lifesteal: { label: "Rose",        text: "Heals itself as it hits." },
  first:     { label: "Opposed",     text: "Its first hit lands double." },
  aura:      { label: "Geometry",    text: "Nearby allies hit harder." },
  warm:      { label: "Warm",        text: "Hits harder." },
};
const SIGNATURES = {
  quake:   { label: "Quake",   text: "Lands with a huge blast." },
  brood:   { label: "Brood",   text: "Spawns a spore every few seconds." },
  sanctum: { label: "Sanctum", text: "Heals every ally around it, every second." },
  wrath:   { label: "Wrath",   text: "Every hit lands as an area blast." },
  prime:   { label: "Prime",   text: "Lands with a vast blast; allies near it hit harder." },
};

let MAP = null, STATS = null;
function load() {
  if (MAP) return;
  MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
  STATS = require("../duels").create({ root: ROOT, beings: async () => [], envVar: () => "" }).card;
}
const on = v => v && v !== "None";

function powerOf(traits) {
  if (on(traits.UFOs)) return "flying";
  if (on(traits.Supernova)) return "blast";
  if (on(traits.Mushrooms)) return "spores";
  if (on(traits.Lightning)) return "fast";
  if (on(traits.Trees)) return "regen";
  if (on(traits["Moon Dust"])) return "shield";
  if (traits.Aura === "Cold") return "slow";
  if (traits.Aura === "Acid") return "poison";
  if (traits.Aura === "Rose") return "lifesteal";
  if (traits.Aura === "Opposed") return "first";
  if (on(traits.Geometry) && ["Mandala", "Rosette", "Flower", "Yantra", "Lattice", "Metatron"].includes(traits.Geometry)) return "aura";
  if (traits.Aura === "Warm") return "warm";
  return null;
}

/* one being, one fighter. boost: the $DMT boost (1..1.15) */
function fighter(n, boost = 1) {
  load();
  const [tier, being, traits = {}] = MAP[n - 1];
  const s = STATS(n), ES = ["magic", "spirit", "knowledge", "light", "dark"];
  const top = ES.slice().sort((a, b) => s[b] - s[a])[0];
  const role = ROLE_OF[top], R = ROLES[role], cost = COST[tier];
  // cheap cards are better value per DMT (they die to towers fast); rarer beings a touch stronger
  const eff = Math.pow(cost / 4, -0.15) * (1 + 0.012 * TIER_RANK[tier]) * boost;
  // the other essences lean it: sturdier (spirit, dark) or sharper (magic, light)
  const sum = ES.reduce((a, k) => a + s[k], 0);
  const lean = ((s.spirit + s.dark) - (s.magic + s.light)) / sum;          // about -0.2 .. 0.2
  const sig = tier === "God" || tier === "Entity" || tier === "Source"
    ? (n === 1111 ? "prime" : ["quake", "brood", "sanctum", "wrath"][n % 4]) : null;
  const power = sig ? null : powerOf(traits);
  const tax = power || sig ? 0.9 : 1;
  let hp = R.hp * cost * eff * (1 + lean * 0.6) * tax, dmg = R.dmg * cost * eff * (1 - lean * 0.6) * tax;
  let hit = R.hit, speed = R.speed;
  if (power === "fast") { speed *= 1.35; hit *= 0.85; }
  if (power === "warm") dmg *= 1.15;
  const card = {
    id: "b" + n, n, kind: "unit", name: being || tier + " #" + n, tier, cost, role, essence: top,
    hp: Math.round(hp), dmg: Math.round(dmg), hit: +hit.toFixed(2), range: R.range, speed: +speed.toFixed(2), r: R.r + (cost >= 7 ? 0.1 : 0),
    buildings: R.buildings, targetsAir: R.targetsAir, air: power === "flying", splash: sig === "wrath" ? 1.6 : R.splash || 0,
    heal: role === "support" || sig === "sanctum" ? Math.round(11 * cost * eff) : 0,
    ability: power, signature: sig, blastDmg: Math.round(60 * cost * eff * (sig === "prime" ? 2.2 : sig === "quake" ? 1.6 : 1)),
  };
  card.power = sig ? SIGNATURES[sig] : power ? POWERS[power] : null;
  card.roleLabel = R.label;
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

module.exports = { fighter, deck, SPELLS, ROLES, POWERS, SIGNATURES, COST, byTier };
