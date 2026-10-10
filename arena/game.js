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
const POOL = [["Common", 22], ["Uncommon", 24], ["Rare", 22], ["Epic", 16], ["Legendary", 10], ["Mythic", 6]];
const RIVALS = ["Spore Drifter", "Moth Caller", "Root Wanderer", "Star Scribe", "Lantern Eye", "Dust Walker", "Tide Singer", "Hollow Knight", "Ember Twin", "Veil Weaver"];

function create({ log = () => {}, beings = async () => [], boostOf = async () => ({ level: 0, boost: 1 }), walletOf = () => null } = {}) {
  const matches = new Map();
  const BT = C.byTier();
  const tierOf = n => BT.__of ? BT.__of[n] : (BT.__of = Object.fromEntries(Object.entries(BT).flatMap(([t, l]) => l.map(n => [n, t]))))[n];
  const pick = (list, not) => { for (;;) { const n = list[crypto.randomInt(list.length)]; if (!not.includes(n)) return n; } };
  function borrowed(k, not = []) {
    const out = [];
    while (out.length < k) {
      let r = crypto.randomInt(100), t = POOL[0][0];
      for (const [tier, w] of POOL) { if (r < w) { t = tier; break; } r -= w; }
      out.push(pick(BT[t], [...not, ...out]));
    }
    return out;
  }
  function tidy() { const now = Date.now(); for (const [k, m] of matches) if (now - m.at > TTL) matches.delete(k); while (matches.size > 5000) matches.delete(matches.keys().next().value); }

  /* a new match: your deck (your beings, if signed in), and a rival of the same tiers */
  async function start({ token } = {}) {
    tidy();
    const wallet = walletOf(token);
    let mine = [], boost = { level: 0, boost: 1 };
    if (wallet) {
      const [all, b] = await Promise.all([beings().catch(() => []), boostOf(wallet).catch(() => boost)]);
      boost = b;
      mine = all.filter(x => x.owner === wallet).map(x => x.n).sort((a, b) => C.COST[tierOf(b)] - C.COST[tierOf(a)] || a - b).slice(0, 6);
    }
    const yours = [...mine, ...borrowed(6 - mine.length, mine)];
    // every deck carries one small spell and one epic (5 to 7 DMT); the rival gets the same kinds
    const spells = () => [C.SMALL[crypto.randomInt(C.SMALL.length)], C.EPIC[crypto.randomInt(C.EPIC.length)]];
    const deck = [...yours.map(n => C.fighter(n, mine.includes(n) ? boost.boost : 0.92 * boost.boost)), ...spells().map(id => ({ ...C.SPELLS[id] }))];
    // the rival: the same tiers, other beings, a touch weaker so a good player wins more than they lose
    const rivalNs = yours.map(n => { let t = tierOf(n); if (t === "Source") t = "God"; return pick(BT[t].filter(x => x !== 1111), [...yours]); });
    const rivalDeck = [...rivalNs.map(n => C.fighter(n, 0.88)), ...spells().map(id => ({ ...C.SPELLS[id] }))];
    const seed = crypto.randomInt(2 ** 32), id = crypto.randomBytes(16).toString("hex");
    const sides = [{ deck, ai: false }, { deck: rivalDeck, ai: true, level: 1 }];
    matches.set(id, { id, seed, sides, wallet, at: Date.now(), done: false, rival: RIVALS[crypto.randomInt(RIVALS.length)] });
    return { match: id, seed, sides, rival: matches.get(id).rival, own: mine, boost: boost.level ? boost : null };
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
    const r = A.replay({ seed: m.seed, sides: m.sides, inputs: clean });
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
