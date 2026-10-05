/* ============================================================
   REALM — the only file you need to edit.
   Both the homepage and the immersive realm read from here.

   ONE DROP. 1,111 beings, all at once, one price, one pool.

   There are no rounds and no sectors. A being is its tier and its
   traits, and that is the whole of it. The ten chapters below are
   the story of the realm — they are writing, not a container, and
   nothing is counted in them.
   ============================================================ */

const CONFIG = {
  // How many of the 1,111 have been minted so far.
  minted: 0,

  // Paste your launchpad mint link here. Leave as "" to show "opens soon".
  mintLink: "",

  /* There is no closing date. The gate stays open until all 1,111 are
     minted, and the holder pool is paid once, when the last one goes. */

  /* The provenance hash, printed by `python3 tools/drop.py` when the
     collection is generated.

     PUBLISH IT BEFORE THE MINT OPENS — here, on X, anywhere time-stamped.
     It is worth nothing published afterwards, because the whole point is
     that it existed before anybody could see what they were buying.

     What it proves: the collection handed out is the collection that was
     hashed, unaltered and unreordered. What it does NOT prove: how mint
     order was assigned to token number — that is the launchpad's shuffle.
     Say only the first thing. */
  provenance: "97ad789cab86faf23c77028ae113d52d814043255d606ec79b0d69a20feee5c6",

  // Social + marketplace links.
  links: {
    x: "https://x.com/dmt_realm",
    telegram: "https://t.me/DMT_REALM",
    marketplace: ""
  },

  /* The collection's on-chain address, once it exists. Public by nature —
     it is on the chain — so it is safe to put here.

     There is deliberately NO API KEY in this file. data.js is downloaded by
     every single visitor, so a key pasted here is a key handed to everybody
     who opens the site. If the wallet panel ever needs a paid RPC, it goes
     behind a small endpoint in server.js reading process.env, and the key
     lives in Railway's variables where nobody can read it. */
  collectionAddress: ""
};

/* ============================================================
   THE SHAPE OF IT
   ============================================================ */

/* One price for everything. */
const PRICE = 0.25;

/* Nobody may hold more than this many from the mint. */
const MAX_PER_WALLET = 5;

/* Taken on every resale, for ever. */
const ROYALTY_PERCENT = 5;

/* ============================================================
   THE BEINGS

   Nine tiers. The counts are the whole collection — there is no
   smaller unit they are divided into — and they must add up to
   TOTAL_BEINGS.
   ============================================================ */
const TIERS = [
  { name: "Common",    key: "common",    count: 400, weight:   1, color: "#9ca3af", accent: "#e5e7eb" },
  { name: "Uncommon",  key: "uncommon",  count: 280, weight:   2, color: "#34d399", accent: "#a7f3d0" },
  { name: "Rare",      key: "rare",      count: 180, weight:   4, color: "#3b82f6", accent: "#67e8f9" },
  { name: "Epic",      key: "epic",      count: 110, weight:   7, color: "#a855f7", accent: "#f0abfc" },
  { name: "Legendary", key: "legendary", count:  70, weight:  12, color: "#f59e0b", accent: "#fde68a" },
  { name: "Mythic",    key: "mythic",    count:  40, weight:  20, color: "#ef4444", accent: "#fb923c" },
  { name: "Entity",    key: "entity",    count:  20, weight:  34, color: "#a5f3fc", accent: "#c4b5fd" },
  { name: "God",       key: "god",       count:  10, weight:  55, color: "#fde68a", accent: "#ffffff" },

  /* The 1,111th. One in the whole collection, and the only being that is
     not one of a set. */
  { name: "Source",    key: "source",    count:   1, weight: 111, color: "#fff7d6", accent: "#ffffff" }
];

const TOTAL_BEINGS = TIERS.reduce((a, t) => a + t.count, 0);   // 1,111

/* ============================================================
   WHAT HOLDERS GET

   When the last being is minted, POOL_PERCENT of the mint is shared
   among everybody holding a being.

   Your slice of it:
     (your beings' weights added up)
       x your token multiplier

   It used to be three things multiplied, the third being a bonus
   for holding across sectors. Sectors are gone, and there is no
   honest way to rebase that bonus on anything a holder actually
   chooses — which tier a mint gives you is luck, so a bonus for
   holding a spread of them would only be a bonus for being lucky
   twice. Two things multiplied is also simply easier to explain,
   and this mechanism has to be explainable.
   ============================================================ */

const POOL_PERCENT = 75;
const TOKEN_NAME   = "$DMT";

/* every weight point in the collection, added up */
const TOTAL_WEIGHT = TIERS.reduce((a, t) => a + t.count * t.weight, 0);

/* what the pool comes to, in SOL, for a given number minted */
function poolFrom(n) {
  return Math.round(n * PRICE * POOL_PERCENT) / 100;
}
const POOL_FULL = poolFrom(TOTAL_BEINGS);

/* how much the token multiplies your beings by */
const TOKEN_BANDS = [
  { hold:         0, mult: 1.0 },
  { hold:     50000, mult: 1.2 },
  { hold:    250000, mult: 1.5 },
  { hold:   1000000, mult: 2.0 },
  { hold:   5000000, mult: 3.0 },
  { hold:  10000000, mult: 4.0 }    // the ceiling; it stops climbing here
];

/* ============================================================
   THE STORY

   One story, open from the first visit. It was ten chapters that
   unsealed as the mint filled — which was the staged release wearing
   its last disguise, and it rationed the only thing on the site that
   costs nothing to give away.

   It is about the beings that were actually drawn, rather than the
   standard tour. Edit the text between the quotes; the site takes it
   as written.
   ============================================================ */
const LORE = [
  "They are not visions. That is the first thing to be wrong about.",

  "A vision is something your own head made and handed back to you wearing "
  + "a costume. These have been here the whole time, going about an existence "
  + "that has nothing to do with you, and the only thing the medicine does is "
  + "thin the wall enough that you notice. They look up when you arrive the "
  + "way people look up when a door opens. Some of them are pleased. Some of "
  + "them were in the middle of something.",

  "The first thing you meet is the mushrooms, because they were here before "
  + "anything that could walk. Hundreds of them, spotted, spiralled, some with "
  + "an eye set into the cap that follows you without the rest of the mushroom "
  + "turning. They are the most common thing in the realm and the most patient. "
  + "Nothing grows here that did not grow out of them first.",

  "Among them live the small folk: elves in robes stitched with the same "
  + "patterns as the walls, gnomes with staffs and lanterns and mushroom hats, "
  + "goblins carrying things they will not explain. They are busy. They have "
  + "seen visitors before. Some of them will wave.",

  "Past the woods the realm turns to water that is not water, and the shoals "
  + "begin: jellyfish that are mostly eye, octopi that coil around nothing, "
  + "moths with constellations on their wings. Further down, in the deep, they "
  + "get stranger and fewer, and older, and you start to feel that you are the "
  + "one being looked at.",

  "Then the ones that have names. A jester who laughs at something just "
  + "behind you. A lotus with a child inside it. A citadel that is also an eye. "
  + "And above them the Mythics, forty, each the only one of its kind; and the "
  + "Entities, twenty, each the only one of its kind; and the Gods, ten — a "
  + "sun-crowned wraith, a sovereign jellyfish, a serpent with a moon in its "
  + "teeth — each the only one of its kind, and each wearing a colour that "
  + "nothing else in the realm is allowed to wear.",

  "And then there is the Source, which is one, and which is not a being at "
  + "all. It is a star of gold light with a single eye at its heart, hanging in "
  + "violet cloud. Everything else in the realm came out of it. It does not "
  + "look up when you arrive. It has been looking the whole time.",

  "Every one of them is in the geometry. Not standing in front of it — in it, "
  + "the way a fish is in water, the way a word is in a sentence. The patterns "
  + "behind them are not decoration and not a background. They are the room, "
  + "and the beings are what the room does."
];
