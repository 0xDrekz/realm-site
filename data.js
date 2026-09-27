/* ============================================================
   REALM — the only file you need to edit.
   Both the homepage and the immersive realm read from here.

   ONE DROP. 1,111 beings, all at once, one price, one pool.

   The realm still has ten sectors — they are what a being belongs
   to and what the story is told in. They are not a release
   schedule any more. Everything mints together.
   ============================================================ */

const CONFIG = {
  // How many of the 1,111 have been minted so far.
  minted: 0,

  // Paste your launchpad mint link here. Leave as "" to show "opens soon".
  mintLink: "",

  /* When the gate shuts whether or not it has sold out — an ISO date,
     "2026-11-30", or "" while it is undecided.

     THIS HAS TO BE DECIDED AND PUBLISHED BEFORE THE MINT OPENS. The pool
     is a share of what was actually taken, so it can be paid on a part
     mint — but only if people were told the closing date going in. While
     this is "" the site says the date is still to be announced rather
     than pretending there is one. */
  mintCloses: "",

  // Social + marketplace links.
  links: {
    x: "https://x.com/dmt_realm",
    telegram: "https://t.me/",
    marketplace: ""
  },

  /* --- LIVE NFT DATA (leave alone until after the mint) ---
     Kept for when the collection exists and the site can read the real
     beings and their owners. Nothing reads these yet. */
  collectionAddress: "",
  heliusApiKey: ""
};

/* ============================================================
   THE SHAPE OF IT
   ============================================================ */

/* Ten sectors of 111, and the tenth holds one more — the Source, the
   1,111th being, of which there is exactly one. */
const SECTOR_COUNT   = 10;
const PER_SECTOR     = 111;
const EXTRA_IN_LAST  = 1;
const TOTAL_BEINGS   = PER_SECTOR * SECTOR_COUNT + EXTRA_IN_LAST;   // 1,111

/* how many beings sector i (1-10) holds */
function sectorSize(i) {
  return PER_SECTOR + (i === SECTOR_COUNT ? EXTRA_IN_LAST : 0);
}

/* One price for everything. No ladder, no rounds. */
const PRICE = 0.25;

/* Nobody may hold more than this many from the mint. */
const MAX_PER_WALLET = 5;

/* Taken on every resale, for ever. */
const ROYALTY_PERCENT = 5;

/* ============================================================
   THE BEINGS

   `perSector` is how many of that tier live in EACH of the ten
   sectors, which is why the counts look like the old per-round
   table — they are. The same 111 beings, ten times over, minted
   in one go instead of ten.

   `total` is the whole collection, and the eight tiers plus the
   Source must add up to TOTAL_BEINGS.
   ============================================================ */
const TIERS = [
  { name: "Common",    key: "common",    perSector: 40, weight:   1, color: "#9ca3af", accent: "#e5e7eb" },
  { name: "Uncommon",  key: "uncommon",  perSector: 28, weight:   2, color: "#34d399", accent: "#a7f3d0" },
  { name: "Rare",      key: "rare",      perSector: 18, weight:   4, color: "#3b82f6", accent: "#67e8f9" },
  { name: "Epic",      key: "epic",      perSector: 11, weight:   7, color: "#a855f7", accent: "#f0abfc" },
  { name: "Legendary", key: "legendary", perSector:  7, weight:  12, color: "#f59e0b", accent: "#fde68a" },
  { name: "Mythic",    key: "mythic",    perSector:  4, weight:  20, color: "#ef4444", accent: "#fb923c" },
  { name: "Entity",    key: "entity",    perSector:  2, weight:  34, color: "#a5f3fc", accent: "#c4b5fd" },
  { name: "God",       key: "god",       perSector:  1, weight:  55, color: "#fde68a", accent: "#ffffff" },

  /* The 1,111th. One in the whole collection, in no sector and every
     sector, and the only being that is not one of ten of its kind. */
  { name: "Source",    key: "source",    perSector:  0, weight: 111, color: "#fff7d6", accent: "#ffffff",
    only: EXTRA_IN_LAST }
];

/* how many of a tier exist in the whole collection */
TIERS.forEach(t => t.count = t.perSector * SECTOR_COUNT + (t.only || 0));

/* ============================================================
   WHAT HOLDERS GET

   When the mint closes, POOL_PERCENT of what it took is shared
   among everybody holding a being.

   Your slice of it:
     (your beings' weights added up)
       x your token multiplier
       x your pilgrim multiplier
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

/* Holding across sectors. Five beings is the most anyone may hold, so
   five sectors is the most anyone can spread across — and the ceiling is
   set to land exactly there. A ceiling nobody can reach is a lie told in
   a table. */
const PILGRIM_STEP = 0.1;
const PILGRIM_MAX  = 1 + (MAX_PER_WALLET - 1) * PILGRIM_STEP;   // 1.4

/* what holding beings across `n` different sectors multiplies by */
function pilgrimFor(n) {
  return Math.min(PILGRIM_MAX, 1 + (Math.max(1, n) - 1) * PILGRIM_STEP);
}

/* The ten sectors, in the order they open.
   `hue` tints that sector's sky in the immersive realm (0-360). */
const SECTORS = [
  { name: "The Threshold", hue: 270,
    lore: "You do not arrive here. You are delivered. The Threshold is the held breath between the room you left and everything after it — a curtain of moving light that recognises you before you recognise yourself. The first beings wait at the edge, and they have been expecting you for longer than you have existed." },
  { name: "The Chrysanthemum", hue: 320,
    lore: "The gate is a flower and the flower is opening, petal folding out of petal without end. Every petal is a door and every door is the same door seen from further in. The beings of the Chrysanthemum are gardeners. They do not grow the flower. They keep it from closing." },
  { name: "The Dome", hue: 45,
    lore: "A vaulted chamber with no visible ceiling, ribbed in gold and breathing slowly. The walls are not walls; they are rows of watchers, packed shoulder to shoulder, leaning in. They have waited the entire time. When you enter, the whole dome turns to look, and something enormous is pleased." },
  { name: "The Elf Workshop", hue: 150,
    lore: "Machine elves, working at impossible speed, making objects that sing themselves into being and then insist you take them. They hand you gifts made of language. They are hysterical with delight that you came, and the gifts keep arriving faster than you can hold them." },
  { name: "The Jester's Court", hue: 15,
    lore: "A checkered floor tilting under a court of tricksters, where the joke is structural and the punchline is you. Nothing here lies, but nothing here is straight either. The Court teaches by laughter, and the lesson only lands once you have stopped defending yourself." },
  { name: "The Hyperspace Corridor", hue: 195,
    lore: "Not a place but a passage, screaming past at a speed with no number. Walls of braided colour, information travelling the other way. The corridor beings are ferrymen. They are indifferent to you. They have carried everything that has ever crossed, and they will carry what comes after." },
  { name: "The Fractal Sea", hue: 220,
    lore: "An ocean that is made of its own reflection, each wave containing the whole sea, each drop containing every wave. To look closely is to fall in. The beings here have no edges. They are patterns wearing the idea of a body, and they rise when the depth decides to speak." },
  { name: "The Temple of Geometry", hue: 258,
    lore: "Architecture that is alive and knows it is being observed. Columns solve themselves. Arches rearrange to stay beautiful from wherever you stand. The temple guardians are laws rather than creatures — the rules that keep the realm from spilling, given faces so you can bear them." },
  { name: "The Loom", hue: 292,
    lore: "Here the realm is woven. Threads of every colour that does not exist run through hands too fast to see, and each thread is a life, a timeline, a version of the room you left behind. The weavers do not look up. They are building the thing you are standing inside." },
  { name: "The Source", hue: 50,
    lore: "The centre. Light without a lamp, love without a condition, understanding without a question left to ask. There is nothing here to collect and nothing here to own. Everything you were carrying is set down at the door, and the realm finally shows you why it opened at all." }
];

/* ============================================================
   HOW MUCH OF THE STORY IS OPEN

   The ten rounds used to unseal the lore one chapter at a time, and
   that was the best thing about them. It survives: a chapter opens for
   every tenth of the mint that goes. Nothing is gated behind a wallet
   — it opens for everybody at once, as the drop fills.
   ============================================================ */
function chaptersOpen() {
  const gone = Math.min(CONFIG.minted, TOTAL_BEINGS);
  return Math.min(SECTOR_COUNT, Math.max(1, Math.ceil(gone / TOTAL_BEINGS * SECTOR_COUNT)));
}
