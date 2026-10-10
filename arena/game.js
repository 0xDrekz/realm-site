/* ============================================================
   REALM Arena — matches on the server.

   The page plays the match itself (it has to, in real time), then sends
   back only where and when you placed each card. The server replays the
   whole match from those placements, with the same seed and the same
   engine, and decides the result. A made-up result can't get through:
   the server never reads one.
   ============================================================ */
"use strict";
const crypto = require("crypto");
const A = require("./engine"), C = require("./cards");

const TTL = 20 * 60e3;
const RIVALS = ["Spore Drifter", "Moth Caller", "Root Wanderer", "Star Scribe", "Lantern Eye", "Dust Walker", "Tide Singer", "Hollow Knight", "Ember Twin", "Veil Weaver"];

function create({ log = () => {}, beings = async () => [], boostOf = async () => ({ level: 0, boost: 1 }), walletOf = () => null } = {}) {
  const matches = new Map();
  const BT = C.byTier();
  const tierOf = n => BT.__of ? BT.__of[n] : (BT.__of = Object.fromEntries(Object.entries(BT).flatMap(([t, l]) => l.map(n => [n, t]))))[n];
  const pick = (list, not) => { for (;;) { const n = list[crypto.randomInt(list.length)]; if (!not.includes(n)) return n; } };
  function tidy() { const now = Date.now(); for (const [k, m] of matches) if (now - m.at > TTL) matches.delete(k); while (matches.size > 5000) matches.delete(matches.keys().next().value); }

  /* the draw: every card is a random being from all 1,111, with spells and epics mixed in.
     A played card is gone for good and the next one comes in, so no two matches are alike.
     Gods, Entities and the Source are as rare in the draw as they are in the collection.
     Signed in, your own beings turn up more often, and hit harder with your $DMT boost. */
  const DRAW = 64;
  function dealSpecs({ own = [], ownBoost = 1, otherBoost = 1 }) {
    const out = [];
    for (let i = 0; i < DRAW; i++) {
      const r = crypto.randomInt(100);
      if (r < 11) out.push({ s: C.SMALL[crypto.randomInt(C.SMALL.length)] });
      else if (r < 16) out.push({ s: C.EPIC[crypto.randomInt(C.EPIC.length)] });
      else if (own.length && crypto.randomInt(100) < 30) out.push({ n: own[crypto.randomInt(own.length)], b: ownBoost });
      else out.push({ n: 1 + crypto.randomInt(1111), b: otherBoost });
    }
    // an opening hand of at least three beings and nothing dearer than 6
    const ok = c => c.n && C.COST[tierOf(c.n)] <= 6;
    for (let k = 0; k < 4; k++) if (!ok(out[k]) && (k < 3 || !out[k].s)) { const j = out.findIndex((c, i) => i >= 4 && ok(c)); if (j > 0) [out[k], out[j]] = [out[j], out[k]]; }
    return out;
  }
  const build = specs => specs.map(c => c.s ? { ...C.SPELLS[c.s] } : C.fighter(c.n, c.b));

  async function start({ token } = {}) {
    tidy();
    const wallet = walletOf(token);
    let mine = [], boost = { level: 0, boost: 1 };
    if (wallet) {
      const [all, b] = await Promise.all([beings().catch(() => []), boostOf(wallet).catch(() => boost)]);
      boost = b;
      mine = all.filter(x => x.owner === wallet).map(x => x.n);
    }
    // yours (your beings boosted; borrowed spirits a touch weaker), and the rival's, a touch weaker again
    const mySpecs = dealSpecs({ own: mine, ownBoost: boost.boost, otherBoost: 0.92 * boost.boost });
    const rivalSpecs = dealSpecs({ otherBoost: 0.88 });
    const specs = [mySpecs, rivalSpecs];
    const seed = crypto.randomInt(2 ** 32), id = crypto.randomBytes(16).toString("hex");
    const sides = [{ deck: build(mySpecs), draw: true, ai: false }, { deck: build(rivalSpecs), draw: true, ai: true, level: 1 }];
    // the wild spirits the arena sends to both sides in its Realm Surges, growing as the match goes on
    // two different beings of each rarity: one for you, one for the rival
    const wildNs = ["Uncommon", "Rare", "Epic", "Rare", "Epic", "Legendary", "Mythic"].map(t => { const a = pick(BT[t], []); return [a, pick(BT[t], [a])]; });
    const wildOf = ns => ns.map(([a, b]) => [C.fighter(a, 0.9), C.fighter(b, 0.9)]);
    const wild = wildOf(wildNs);
    // kept small: the cards are rebuilt from these when the match comes back
    matches.set(id, { id, seed, specs, wildNs, wallet, at: Date.now(), done: false, rival: RIVALS[crypto.randomInt(RIVALS.length)] });
    return { match: id, seed, sides, wild, rival: matches.get(id).rival, own: mine.length, boost: boost.level ? boost : null };
  }

  /* the match is over on the page: replay it here from the placements and decide */
  function finish({ match, inputs }) {
    const m = matches.get(String(match || ""));
    if (!m) return { error: "That match has ended. Start a new one." };
    if (m.done) return { error: "That match has already been counted.", result: m.result };
    if (!Array.isArray(inputs) || inputs.length > 400) return { error: "Bad placements." };
    const clean = [];
    for (const i of inputs) {
      const t = Math.floor(Number(i && i.t)), slot = Math.floor(Number(i && i.slot)), x = Number(i && i.x), y = Number(i && i.y);
      if (!(t >= 0 && t < 100000 && slot >= 0 && slot < 4 && isFinite(x) && isFinite(y))) return { error: "Bad placements." };
      clean.push({ t, slot, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    }
    clean.sort((a, b) => a.t - b.t);
    const sides = [{ deck: build(m.specs[0]), draw: true, ai: false }, { deck: build(m.specs[1]), draw: true, ai: true, level: 1 }];
    const r = A.replay({ seed: m.seed, sides, wild: m.wildNs.map(([a, b]) => [C.fighter(a, 0.9), C.fighter(b, 0.9)]), inputs: clean });
    if (r.error) { m.done = true; return { error: r.error }; }
    const S = r.S;
    // it takes real time to play: a match can't be handed in faster than it could be played
    const playedFor = (Date.now() - m.at) / 1000;
    if (playedFor < S.time * 0.85 - 3) { m.done = true; return { error: "That match came back faster than it could be played." }; }
    m.done = true;
    const won = S.winner === 0, draw = S.winner == null;
    const xp = won ? 100 + S.crowns[0] * 15 : draw ? 50 : (S.time > 60 ? 35 : 0);
    m.result = { won, draw, crowns: S.crowns.slice(), time: Math.round(S.time), xp, wallet: m.wallet || null };
    log(`arena: ${won ? "won" : draw ? "drew" : "lost"} ${S.crowns[0]}-${S.crowns[1]} in ${Math.round(S.time)}s${m.wallet ? " (" + m.wallet.slice(0, 4) + ")" : ""}`);
    return { result: m.result };
  }

  return { start, finish, live: () => matches.size };
}

module.exports = { create };
