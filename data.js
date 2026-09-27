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

  /* When the gate shuts whether or not it has sold out — an ISO date,
     "2026-11-30", or "" while it is undecided.

     THIS HAS TO BE DECIDED AND PUBLISHED BEFORE THE MINT OPENS. The pool
     is a share of what was actually taken, so it can be paid on a part
     mint — but only if people were told the closing date going in. While
     this is "" the site says the date is still to be announced rather
     than pretending there is one. */
  mintCloses: "",

  /* The provenance hash, printed by `python3 tools/drop.py` when the
     collection is generated.

     PUBLISH IT BEFORE THE MINT OPENS — here, on X, anywhere time-stamped.
     It is worth nothing published afterwards, because the whole point is
     that it existed before anybody could see what they were buying.

     What it proves: the collection handed out is the collection that was
     hashed, unaltered and unreordered. What it does NOT prove: how mint
     order was assigned to token number — that is the launchpad's shuffle.
     Say only the first thing. */
  provenance: "",

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

   When the mint closes, POOL_PERCENT of what it took is shared
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

   Ten chapters of the realm. They are lore and nothing else: no
   being belongs to one, nothing is counted in them, and holding
   a particular being does not get you a particular chapter.
   ============================================================ */
const CHAPTERS = [
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

   A chapter opens for every tenth of the mint that goes. Nothing is
   gated behind a wallet — it opens for everybody at once, as the drop
   fills.
   ============================================================ */
function chaptersOpen() {
  const gone = Math.min(Math.max(CONFIG.minted, 0), TOTAL_BEINGS);
  return Math.min(CHAPTERS.length,
                  Math.max(1, Math.ceil(gone / TOTAL_BEINGS * CHAPTERS.length)));
}
