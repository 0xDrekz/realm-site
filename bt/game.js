/* ============================================================
   BREAKTHROUGH — runs on the server.

   The page plays the run itself and sends back only its moves (which cards
   it cast, discarded, or took). The server plays every move again from the
   same seed with the same engine and decides the score. A made-up score
   can't get through: the server never reads one.

   Two ways to play:
     DAILY TRIP  one deck and one seed for everybody, all day. Same luck for
                 all, so the daily board is pure skill. Best run counts.
     FREE RUN    a fresh seed every time. Your own beings are always in your
                 deck (and score +50%), and anyone can summon one being a
                 holder owns; its owner is credited on the summon board.
   Free to play, always. No entry fee, nothing at stake.
   ============================================================ */
"use strict";
const crypto = require("crypto"), path = require("path");
const E = require("./engine"), C = require("./cards");

const TTL = 3 * 3600e3, MAX_RUNS = 20000, PER_OWNER = 3, DECK = 20, OWN_IN_DECK = 8, MAX_MOVES = 800;
/* MIRROR DUEL: two players, the same deck and the same seed, three layers each, played when each likes.
   The higher run total wins. No holder boost here: the same cards and the same luck, so it's skill alone. */
const POWER_FROM = "2026-10-14";
const DUEL_LAYERS = 3, DUEL_TTL = 7 * 86400e3, MAX_DUELS = 20000;

/* a competition, when one is on (bt/comp.json): the best Daily Trip score of a signed-in wallet
   between two dates wins a prize from the team's own funds. Free to enter, always. */
function loadComp() { try { return JSON.parse(require("fs").readFileSync(path.join(__dirname, "comp.json"), "utf8")); } catch { return null; } }

/* announce(html, links): posts to the Telegram group (bot.js postHtml). A new leader in the competition is
   posted at most once every POST_GAP_MS (the latest leader goes out when the gap is up), and the final
   result once, when the competition is over. */
const POST_GAP_MS = 10 * 60e3;

/* A player inside the Telegram Mini App: Telegram signs who they are (initData) with the bot's token.
   Checked here, never trusted from the page. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
function tgUser(initData, botToken) {
  if (typeof initData !== "string" || !initData || initData.length > 4096 || !botToken) return null;
  try {
    const q = new URLSearchParams(initData), hash = q.get("hash");
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
    q.delete("hash");
    const check = [...q.entries()].map(([k, v]) => k + "=" + v).sort().join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const want = crypto.createHmac("sha256", secret).update(check).digest();
    if (!crypto.timingSafeEqual(want, Buffer.from(hash, "hex"))) return null;
    if (Date.now() / 1000 - Number(q.get("auth_date") || 0) > 7 * 86400) return null;     // older than a week: sign in again
    const u = JSON.parse(q.get("user") || "null");
    if (!u || !Number.isInteger(u.id)) return null;
    const name = u.username ? "@" + String(u.username).slice(0, 32) : String(u.first_name || "Player").slice(0, 32);
    return { id: u.id, name };
  } catch { return null; }
}

function create({ log = () => {}, beings = async () => [], boostOf = async () => 100, walletOf = () => null, dir = null, comp = loadComp(), announce = null, tgToken = () => "", playUrl = () => "" } = {}) {
  const jf = file => dir ? require("../jsonfile").create(path.join(dir, file), { log: m => log("breakthrough: " + m), fallback: {} }) : null;
  const liveFile = jf("bt-live.json"), boardFile = jf("bt-board.json"), duelFile = jf("bt-duels.json");
  let D = {}; try { D = duelFile ? duelFile.load() || {} : {}; } catch (e) { log("breakthrough: duels could not be read, starting fresh: " + e.message); }
  const saveDuels = () => { if (duelFile) duelFile.save(() => { const now = Date.now(); for (const k of Object.keys(D)) if (now - D[k].at > DUEL_TTL) delete D[k]; return D; }); };
  let saved = {}; try { saved = liveFile ? liveFile.load() || {} : {}; } catch (e) { log("breakthrough: live runs could not be read, starting fresh: " + e.message); }
  const runs = new Map(Object.entries(saved));
  const saveLive = () => { if (liveFile) liveFile.save(() => { tidy(); return Object.fromEntries(runs); }); };
  let B = {}; try { B = boardFile ? boardFile.load() || {} : {}; } catch (e) { log("breakthrough: board could not be read, starting fresh: " + e.message); }
  B.days = B.days || {}; B.weeks = B.weeks || {}; B.summons = B.summons || {}; B.comps = B.comps || {}; B.compDays = B.compDays || {}; B.posted = B.posted || {};
  const trim = (o, k) => Object.fromEntries(Object.keys(o).sort().slice(-k).map(x => [x, o[x]]));
  const saveBoard = () => { if (boardFile) boardFile.save(() => (B = { days: trim(B.days, 10), weeks: trim(B.weeks, 6), summons: trim(B.summons, 10), comps: B.comps, compDays: B.compDays, posted: B.posted })); };
  const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  const weekKey = (d = new Date()) => { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m.toISOString().slice(0, 10); };
  function tidy() { const now = Date.now(); for (const [k, r] of runs) if (now - r.at > TTL) runs.delete(k); }
  function room(owner) {
    const mine = [...runs.entries()].filter(([, r]) => r.owner === owner).sort((a, b) => a[1].at - b[1].at);
    while (mine.length >= PER_OWNER) runs.delete(mine.shift()[0]);
    return runs.size < MAX_RUNS;
  }
  const isGuest = pid => typeof pid === "string" && /^[a-f0-9]{24}$/.test(pid);
  const short = w => w.slice(0, 4) + "…" + w.slice(-4);
  // who's playing: a signed-in wallet, else a Telegram player (checked), else a guest on this device
  const who = (wallet, pid, tg) => {
    if (wallet) return { key: "w:" + wallet, name: short(wallet) };
    const t = tg ? tgUser(tg, tgToken()) : null;
    if (t) return { key: "t:" + t.id, name: t.name };
    return isGuest(pid) ? { key: "g:" + pid, name: "Wanderer " + pid.slice(0, 4).toUpperCase() } : null;
  };

  /* the daily deck: the same 20 beings for everyone, from the day alone */
  function dailyDef(day) {
    const h = d => crypto.createHash("sha256").update("breakthrough|" + day + "|" + d).digest();
    const seed = h("seed").readInt32LE(0), deck = [];
    // purely random, and the same for everyone that day: Gods, Entities and the Source fall where they fall
    for (let i = 0; deck.length < DECK; i++) {
      const n = 1 + (h("card" + i).readUInt32LE(0) % 1111); if (!deck.includes(n)) deck.push(n);
    }
    // From 14 Oct every deck holds at least one God and two Entities, taking the places of its weakest
    // beings, so no day is a grind. (Days before stay exactly as they were, so their runs still replay.)
    if (day >= POWER_FROM) {
      const T = C.byTier(), want = [["God", 1], ["Entity", 2]], keep = new Set();
      for (const [tier, k] of want) {
        const have = deck.filter(n => C.cardOf(n).tier === tier); have.slice(0, k).forEach(n => keep.add(n));
        for (let i = 0, got = have.length; got < k; i++) {
          const n = T[tier][h(tier + i).readUInt32LE(0) % T[tier].length]; if (deck.includes(n)) continue;
          const out = deck.filter(x => !keep.has(x) && !["God", "Entity", "Source"].includes(C.cardOf(x).tier))
            .sort((a, b) => C.cardOf(a).chips - C.cardOf(b).chips || a - b)[0];
          deck[deck.indexOf(out)] = n; keep.add(n); got++;
        }
      }
    }
    return { seed, deck, own: [] };
  }
  const defOf = r => ({ seed: r.seed, deck: r.deck, own: r.own, boost: r.boost || 100, cards: C.cardOf });

  let CARDS = null;
  function cards() {
    if (!CARDS) { const json = Buffer.from(JSON.stringify({ v: 1, cards: C.all() })); CARDS = { json, gz: require("zlib").gzipSync(json) }; }
    return CARDS;
  }

  async function ownedBy(wallet) { const all = await beings(); return all.filter(b => b.owner === wallet).map(b => b.n); }

  async function start({ token, pid, tg, mode, summon, duel, ip } = {}) {
    tidy();
    const wallet = walletOf(token);
    if (token && !wallet) return { error: "Your sign-in has expired. Sign in again.", status: 401 };
    const me = who(wallet, pid, tg);
    const owner = wallet ? "w:" + wallet : "ip:" + String(ip || "?");
    if (!room(owner)) return { error: "The realm is very busy. Try again in a minute.", status: 503 };
    const day = dayKey();
    let r;
    if (mode === "daily") r = { mode, day, ...dailyDef(day) };
    else if (mode === "duel") {
      if (!me) return { error: "Open the game again to play a duel." };
      let d = duel && D[String(duel)];
      if (duel && !d) return { error: "That duel has ended. Start one of your own.", gone: true };
      if (d) {
        if (d.players.some(p => p.key === me.key)) return { error: "You've already played this duel. Send the link to someone else, or start a new one." };
        if (d.players.length >= 2) return { error: "This duel has been played by both sides. Start one of your own.", gone: true };
      } else {
        if (Object.keys(D).length >= MAX_DUELS) return { error: "The realm is very busy. Try again in a minute.", status: 503 };
        const deck = []; while (deck.length < DECK) { const n = 1 + crypto.randomInt(1111); if (!deck.includes(n)) deck.push(n); }
        d = D[crypto.randomBytes(5).toString("hex")] = { seed: crypto.randomInt(2 ** 31), deck, at: Date.now(), players: [] };
        d.id = Object.keys(D).find(k => D[k] === d); saveDuels();
      }
      r = { mode: "duel", day, duel: d.id, seed: d.seed, deck: d.deck.slice(), own: [] };
    }
    else {
      let mine = [];
      if (wallet) { try { mine = await ownedBy(wallet); } catch { return { error: "Couldn't read your wallet just now. Retry in a moment.", status: 503 }; } }
      const own = mine.slice(); for (let i = own.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [own[i], own[j]] = [own[j], own[i]]; }
      const deck = own.slice(0, OWN_IN_DECK);
      // a summoned being: any being a holder owns, one per run
      let summoned = null;
      const sn = Math.floor(Number(summon));
      if (sn >= 1 && sn <= 1111 && !deck.includes(sn)) {
        try { const b = (await beings()).find(x => x.n === sn); if (b && b.owner) { summoned = sn; deck.push(sn); } } catch { /* the chain is slow: no summon this time */ }
      }
      while (deck.length < DECK) { const n = 1 + crypto.randomInt(1111); if (!deck.includes(n)) deck.push(n); }
      r = { mode: "free", day, seed: crypto.randomInt(2 ** 31), deck, own: deck.filter(n => mine.includes(n)), summoned };
      if (summoned) { const d = B.summons[day] = B.summons[day] || {}; d[summoned] = (d[summoned] || 0) + 1; saveBoard(); }
    }
    // a holder's boost ($DMT bands and owning a being), read once when the run starts
    r.boost = 100;
    if (wallet && r.mode !== "duel") { try { r.boost = Math.max(100, Math.min(300, Math.round(Number(await boostOf(wallet)) || 100))); } catch { /* the chain is slow: no boost this time */ } }
    const id = crypto.randomBytes(16).toString("hex");
    Object.assign(r, { id, owner, wallet: wallet || null, pkey: me ? me.key : null, name: me ? me.name : null, at: Date.now(), done: false });
    runs.set(id, r); saveLive();
    return { run: id, mode: r.mode, day, seed: r.seed, deck: r.deck, own: r.own, boost: r.boost, summoned: r.summoned || null, name: r.name,
      duel: r.duel ? duelView(D[r.duel], r.pkey) : undefined };
  }

  /* the run is over on the page: play it again here from the moves, and decide */
  function finish({ run, moves } = {}) {
    const r = runs.get(String(run || ""));
    if (!r) return { error: "That run has ended. Start a new one.", gone: true };
    if (r.done) return { error: "That run has already been counted.", result: r.result };
    if (!Array.isArray(moves) || moves.length > MAX_MOVES) return { error: "Bad moves." };
    const clean = [];
    for (const m of moves) {
      if (!Array.isArray(m)) return { error: "Bad moves." };
      if (m[0] === "p") { const c = m[1]; if (!Number.isInteger(c)) return { error: "Bad moves." }; clean.push(["p", c]); continue; }
      if ((m[0] !== "c" && m[0] !== "d") || !Array.isArray(m[1]) || m[1].length > 5 || !m[1].every(Number.isInteger)) return { error: "Bad moves." };
      clean.push([m[0], m[1].slice()]);
    }
    // a duel stops when its third layer is cleared: nothing after that counts
    const R = r.mode === "duel" ? duelReplay(defOf(r), clean) : E.replay(defOf(r), clean);
    if (R.error) { r.done = true; saveLive(); return { error: "That run didn't add up: " + R.error }; }
    // it takes real time to play: a run can't be handed in faster than its moves could be made
    if ((Date.now() - r.at) / 1000 < clean.length * 0.35 - 2) { r.done = true; saveLive(); return { error: "That run came back faster than it could be played." }; }
    const S = R.S;
    r.done = true;
    const res = { mode: r.mode, cleared: E.cleared(S), total: S.total, best: S.best, bestHand: S.bestHand, broke: S.broke || E.cleared(S) >= E.LAYERS, over: S.over };
    const secs = Math.round((Date.now() - r.at) / 1000);
    if (r.mode === "duel") {
      const d = D[r.duel];
      if (d && r.pkey && !d.players.some(p => p.key === r.pkey) && d.players.length < 2) {
        d.players.push({ key: r.pkey, name: r.name, total: S.total, cleared: Math.min(DUEL_LAYERS, E.cleared(S)), at: Date.now(), secs }); saveDuels();
      }
      res.cleared = Math.min(DUEL_LAYERS, res.cleared); res.duel = d ? duelView(d, r.pkey) : null;
      r.result = res; saveLive();
      log(`breakthrough: duel ${r.duel} ${res.total} pts in ${secs}s`);
      return { result: res };
    }
    if (r.pkey && S.total > 0) res.board = record(r, res);
    if (r.mode === "daily" && S.total > 0) res.comp = enter(r, Object.assign({}, res, { secs, moves: clean }));
    if (S.total > 0) scoreNews(r, res);
    r.result = res; saveLive();
    log(`breakthrough: ${r.mode} ${res.cleared} layers, ${res.total} pts in ${secs}s, ${clean.length} moves${r.wallet ? " (" + r.wallet.slice(0, 4) + ")" : ""}`);
    return { result: res };
  }

  function duelReplay(def, moves) {
    const S = E.createRun(def);
    for (let k = 0; k < moves.length; k++) {
      if (S.over || (S.phase === "draft" && S.layer >= DUEL_LAYERS - 1)) break;
      const x = E.act(S, moves[k]); if (x.error) return { error: "Move " + (k + 1) + ": " + x.error, S };
    }
    return { S };
  }
  // a duel as either player sees it: the other side's score shows once you've played (or if you're about to)
  function duelView(d, key) {
    if (!d) return null;
    const ps = d.players.map(p => ({ name: p.name, total: p.total, cleared: p.cleared, you: !!key && p.key === key }));
    const done = ps.length >= 2, win = done ? (ps[0].total === ps[1].total ? null : ps[0].total > ps[1].total ? 0 : 1) : null;
    return { id: d.id, layers: DUEL_LAYERS, players: ps, done, winner: win, at: d.at };
  }
  function duelGet({ id, token, pid, tg } = {}) {
    const d = D[String(id || "")]; if (!d) return { error: "That duel has ended. Start one of your own.", gone: true };
    const me = who(walletOf(token), pid, tg);
    return { duel: duelView(d, me ? me.key : null) };
  }

  function record(r, res) {
    const day = r.day, wk = weekKey(new Date(r.at));
    const book = r.mode === "daily" ? (B.days[day] = B.days[day] || {}) : (B.weeks[wk] = B.weeks[wk] || {});
    const cur = book[r.pkey];
    const better = !cur || res.total > cur.total;
    if (better) book[r.pkey] = { name: r.name, total: res.total, cleared: res.cleared, holder: !!r.wallet, at: Date.now() };
    saveBoard();
    const rows = ranked(book), i = rows.findIndex(x => x.key === r.pkey);
    return { best: better, rank: i + 1, of: rows.length, top: book[r.pkey].total };
  }
  /* ---------- the competitions (bt/comp.json: one, or a list in date order) ----------
     Two ways to score one:
       highest score   the best single Daily Trip run of the dates wins
       daily points    every day is its own race on that day's deck: 1st 10 points, 2nd 6, 3rd 4, 4th 2,
                       5th 1 (a competition can set its own "points"). Most points at the end wins; a tie
                       goes to more days won, then the higher single run, then whoever scored first.
     A signed-in wallet's runs count; the team's own wallets can play, but can't win. */
  const COMPS = (Array.isArray(comp) ? comp : comp ? [comp] : []).filter(c => c && c.id && c.start && c.end);
  const compOf = day => COMPS.find(c => day >= c.start && day <= c.end) || null;
  // the one to show: the one running today, else the one that finished last (until the next begins)
  const showing = () => compOf(dayKey()) || COMPS.filter(c => c.end < dayKey()).sort((a, b) => (a.end < b.end ? -1 : 1)).pop() || null;
  const isPoints = c => !!c && c.scoring === "daily-points";
  const PTS = c => (Array.isArray(c.points) && c.points.length ? c.points : [10, 6, 4, 2, 1]);
  const isTeam = (c, w) => !!c && Array.isArray(c.team) && c.team.includes(w);
  const dayRows = (c, day) => ranked(((B.compDays[c.id] || {})[day]) || {}).filter(x => !isTeam(c, x.key));
  function standings(c) {
    if (!isPoints(c)) return ranked(B.comps[c.id] || {}).filter(x => !isTeam(c, x.key));
    const P = PTS(c), acc = {};
    for (const day of Object.keys(B.compDays[c.id] || {})) {
      dayRows(c, day).forEach((x, i) => {
        const a = acc[x.key] = acc[x.key] || { key: x.key, points: 0, wins: 0, days: 0, total: 0, cleared: 0, at: x.at };
        a.points += P[i] || 0; a.days++; if (i === 0) a.wins++;
        if (x.total > a.total) { a.total = x.total; a.cleared = x.cleared; }
        a.at = Math.min(a.at, x.at);
      });
    }
    return Object.values(acc).sort((a, b) => b.points - a.points || b.wins - a.wins || b.total - a.total || a.at - b.at);
  }
  function enter(r, res) {
    const c = compOf(r.day); if (!c) return null;
    if (!r.wallet) return { entered: false };
    const book = B.comps[c.id] = B.comps[c.id] || {};
    const cur = book[r.wallet], better = !cur || res.total > cur.total;
    if (better) book[r.wallet] = { total: res.total, cleared: res.cleared, day: r.day, at: Date.now(), secs: res.secs, moves: res.moves };
    let dayBetter = false;
    if (isPoints(c)) {
      const days = B.compDays[c.id] = B.compDays[c.id] || {}, db = days[r.day] = days[r.day] || {}, dc = db[r.wallet];
      dayBetter = !dc || res.total > dc.total;
      if (dayBetter) db[r.wallet] = { total: res.total, cleared: res.cleared, at: Date.now(), secs: res.secs, moves: res.moves };
    }
    saveBoard();
    if (isTeam(c, r.wallet)) return { entered: true, team: true, best: isPoints(c) ? dayBetter : better };
    const st = standings(c), i = st.findIndex(x => x.key === r.wallet);
    if (isPoints(c)) {
      const today = dayRows(c, r.day), j = today.findIndex(x => x.key === r.wallet);
      if (j === 0 && dayBetter) leaderNews();
      return { entered: true, points: true, best: dayBetter, dayRank: j + 1, dayOf: today.length, dayPts: PTS(c)[j] || 0, rank: i + 1, of: st.length, pts: i < 0 ? 0 : st[i].points };
    }
    if (i === 0 && better) leaderNews();
    return { entered: true, best: better, rank: i + 1, of: st.length };
  }
  function compView(wallet, limit = 10) {
    const c = showing(); if (!c) return null;
    const day = dayKey(), over = day > c.end, live = !!compOf(day) && compOf(day).id === c.id, pts = isPoints(c);
    const rows = standings(c), i = wallet ? rows.findIndex(x => x.key === wallet) : -1;
    // the team's wallets are shown too, unranked: at the end on a points table, in score order otherwise
    const team = Object.entries(B.comps[c.id] || {}).filter(([k]) => isTeam(c, k)).map(([key, v]) => ({ key, ...v, team: true }));
    const all = pts ? rows.concat(team) : rows.concat(team).sort((a, b) => b.total - a.total || a.at - b.at);
    let rank = 0;
    return { id: c.id, title: c.title, prize: c.prize, start: c.start, end: c.end, rules: c.rules, scoring: pts ? "points" : "score", points: pts ? PTS(c) : undefined,
      endsAt: Date.parse(c.end + "T23:59:59Z"), live, over, players: rows.length,
      // everyone in order; the winner's full address is shown once it's over
      top: all.slice(0, limit).map(x => { const r = x.team ? null : ++rank;
        return { name: short(x.key), rank: r, team: !!x.team, wallet: over && r === 1 ? x.key : undefined, total: x.total, cleared: x.cleared,
          points: pts && !x.team ? x.points : undefined, wins: pts && !x.team ? x.wins : undefined, you: x.key === wallet }; }),
      today: pts && live ? dayRows(c, day).slice(0, 10).map((x, k) => ({ name: short(x.key), total: x.total, cleared: x.cleared, pts: PTS(c)[k] || 0, you: x.key === wallet })) : undefined,
      you: wallet && isTeam(c, wallet) ? { team: true } : i < 0 ? null : { rank: i + 1, total: rows[i].total, points: pts ? rows[i].points : undefined } };
  }
  /* ---------- Telegram: the league table, as it happens ---------- */
  const fmtN = n => Math.round(n).toLocaleString("en-GB");
  const esc = t => String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // the Play button opens the Telegram Mini App when one is set up (TG_APP_URL), else the website
  const LINKS_OF = () => [["Play BREAKTHROUGH", playUrl() || "https://dmt-realm.dev/breakthrough"], ["League table", "https://dmt-realm.dev/league"]];
  function tableLines(rows, c) { return rows.slice(0, 3).map((x, k) => `${k + 1}. ${esc(short(x.key))}  <b>${isPoints(c) ? x.points + " pts" : fmtN(x.total)}</b>`).join("\n"); }
  function leftText(c) {
    const h = Math.max(0, Math.floor((Date.parse(c.end + "T23:59:59Z") - Date.now()) / 3600e3));
    return h >= 48 ? Math.floor(h / 24) + " days left" : h >= 1 ? h + " hours left" : "under an hour left";
  }
  /* every finished run, as one line in the group. Gathered for a few seconds and sent together,
     so a busy minute is one message, not twenty (Telegram allows about 20 posts a minute). */
  const SCORE_GAP_MS = 6000, MAX_LINES = 12;
  let pending = [], scoreTimer = null;
  function scoreNews(r, res) {
    if (!announce) return;
    const where = r.mode === "daily" ? "Daily Trip" : "Free Run", c = compOf(r.day), x = res.comp;
    const extra = x && x.entered && !x.team && c ? (x.points ? ` · <b>#${x.dayRank}</b> today in the ${esc(c.prize)} comp` : ` · <b>#${x.rank}</b> in the ${esc(c.prize)} comp`)
      : res.board && r.mode === "daily" ? ` · #${res.board.rank} today` : "";
    pending.push(`${esc(r.name || "A player")} scored <b>${fmtN(res.total)}</b> on the ${where} (${res.cleared} layer${res.cleared === 1 ? "" : "s"})${extra}`);
    if (pending.length > 200) pending = pending.slice(-200);
    if (!scoreTimer) { scoreTimer = setTimeout(sendScores, SCORE_GAP_MS); if (scoreTimer.unref) scoreTimer.unref(); }
  }
  function sendScores() {
    scoreTimer = null;
    if (!pending.length) return;
    const lines = pending.splice(0, MAX_LINES), more = pending.length;
    const text = lines.length === 1 ? `🎴 ${lines[0]}` : `🎴 <b>Latest BREAKTHROUGH runs</b>\n\n${lines.join("\n")}`;
    Promise.resolve(announce(text, LINKS_OF())).then(r => { if (r && r.ok === false) log("breakthrough: telegram post failed: " + r.problem); }).catch(() => {});
    if (more) { scoreTimer = setTimeout(sendScores, SCORE_GAP_MS); if (scoreTimer.unref) scoreTimer.unref(); }
  }

  let postTimer = null;
  function leaderNews() {
    if (!announce) return;
    if (postTimer) return;                                   // one is already waiting: it will carry the latest leader
    const wait = Math.max(0, (B.posted.leaderAt || 0) + POST_GAP_MS - Date.now());
    postTimer = setTimeout(sendLeader, wait); if (postTimer.unref) postTimer.unref();
  }
  function sendLeader() {
    postTimer = null;
    const day = dayKey(), c = compOf(day); if (!c) return;
    const lead = isPoints(c) ? dayRows(c, day) : standings(c);
    if (!lead.length) return;
    const tag = (isPoints(c) ? day + ":" : "") + lead[0].key;
    if (B.posted.leaderKey === tag && B.posted.leaderTotal === lead[0].total) return;
    B.posted.leaderAt = Date.now(); B.posted.leaderKey = tag; B.posted.leaderTotal = lead[0].total; saveBoard();
    const top = lead[0];
    const text = isPoints(c)
      ? `🏆 <b>NEW LEADER OF TODAY'S DAILY TRIP</b>\n\n<b>${fmtN(top.total)}</b> by ${esc(short(top.key))} (${top.cleared} layers deep)\n\n<b>Today</b>\n${lead.slice(0, 3).map((x, k) => `${k + 1}. ${esc(short(x.key))}  <b>${fmtN(x.total)}</b>`).join("\n")}\n\n<b>The week, in points</b>\n${tableLines(standings(c), c)}\n\nToday's winner takes ${PTS(c)[0]} points. Most points by the end wins ${esc(c.prize)}. ${leftText(c)}. Free to enter: connect a wallet, then play.`
      : `🏆 <b>NEW TOP SCORE in BREAKTHROUGH</b>\n\n<b>${fmtN(top.total)}</b> by ${esc(short(top.key))} (${top.cleared} layers deep)\n\n${tableLines(lead, c)}\n\n${esc(c.prize)} to the highest Daily Trip score. ${leftText(c)}. Free to enter: connect a wallet, then play.`;
    Promise.resolve(announce(text, LINKS_OF())).then(r => { if (r && r.ok === false) log("breakthrough: telegram post failed: " + r.problem); }).catch(() => {});
  }
  // once one is over, post the result (checked every few minutes, and once at start)
  function finalNews() {
    if (!announce) return;
    for (const c of COMPS) {
      if (dayKey() <= c.end || B.posted["final:" + c.id]) continue;
      const rows = standings(c);
      B.posted["final:" + c.id] = Date.now(); saveBoard();
      if (!rows.length) continue;
      const w = rows[0];
      Promise.resolve(announce(`🏆 <b>${esc(c.title)} is over</b>\n\nThe winner of ${esc(c.prize)}: <b>${esc(short(w.key))}</b> with <b>${isPoints(c) ? w.points + " points" : fmtN(w.total)}</b>.\n\n${tableLines(rows, c)}\n\nWinner's wallet: <code>${esc(w.key)}</code>`, LINKS_OF())).catch(() => {});
    }
  }
  if (announce) {
    const t = setInterval(finalNews, 5 * 60e3); if (t.unref) t.unref();
    const s = setTimeout(() => { finalNews(); if (compOf(dayKey()) && !B.posted.leaderKey) leaderNews(); }, 5000); if (s.unref) s.unref();
  }

  const ranked = book => Object.entries(book).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total || a.at - b.at);

  function board({ token, pid, tg } = {}) {
    const wallet = walletOf(token), me = who(wallet, pid, tg), day = dayKey(), wk = weekKey();
    const view = book => {
      const rows = ranked(book || {});
      const i = me ? rows.findIndex(x => x.key === me.key) : -1;
      return { top: rows.slice(0, 20).map(x => ({ name: x.name, total: x.total, cleared: x.cleared, holder: x.holder, you: !!me && x.key === me.key })),
        you: i < 0 ? null : { rank: i + 1, total: rows[i].total }, players: rows.length };
    };
    const s = B.summons[day] || {};
    const summons = Object.entries(s).map(([n, c]) => ({ n: +n, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
    return { day, week: wk, daily: view(B.days[day]), free: view(B.weeks[wk]), summons, comp: compView(wallet) };
  }

  /* beings anyone can summon: every being a holder owns, with today's summon count */
  async function summonable() {
    const all = await beings(), s = B.summons[dayKey()] || {};
    return { beings: all.filter(b => b.owner).map(b => ({ n: b.n, owner: short(b.owner), count: s[b.n] || 0 })).sort((a, b) => b.count - a.count || a.n - b.n) };
  }

  async function me({ token, pid, tg } = {}) {
    let wallet = null;
    if (token) { wallet = walletOf(token); if (!wallet) return { error: "Your sign-in has expired. Sign in again.", status: 401 }; }
    if (!wallet && !isGuest(pid)) pid = crypto.randomBytes(12).toString("hex");
    const out = { pid: wallet ? null : pid, wallet, name: who(wallet, pid, tg).name, telegram: !wallet && !!(tg && tgUser(tg, tgToken())), own: [], summonedToday: 0 };
    if (wallet) {
      try { out.own = await ownedBy(wallet); } catch { out.own = null; }
      const s = B.summons[dayKey()] || {};
      if (out.own) out.summonedToday = out.own.reduce((a, n) => a + (s[n] || 0), 0);
      try { out.boost = Math.max(100, Math.min(300, Math.round(Number(await boostOf(wallet)) || 100))); } catch { out.boost = 100; }
    }
    return out;
  }

  /* the bot's replies to /top and /league in the group */
  function topText() {
    const out = [], day = dayKey(), c = compOf(day);
    if (c) {
      out.push(`🏆 <b>${esc(c.title)}</b>: ${esc(c.prize)} to the winner, ${leftText(c)}`);
      const rows = standings(c);
      if (isPoints(c)) {
        const t = dayRows(c, day);
        out.push(`<b>Today's race</b> (the winner takes ${PTS(c)[0]} points)`);
        out.push(t.length ? t.slice(0, 3).map((x, k) => `${k + 1}. ${esc(short(x.key))}  <b>${fmtN(x.total)}</b>`).join("\n") : "Nobody has entered today yet.");
        out.push(`<b>The week, in points</b>`);
      }
      out.push(rows.length ? tableLines(rows, c) : "No entries yet. Connect a wallet and play the Daily Trip to take first place.");
    }
    const today = ranked(B.days[day] || {});
    out.push(`\n🎴 <b>Today's Daily Trip</b>`);
    out.push(today.length ? today.slice(0, 5).map((x, k) => `${k + 1}. ${esc(x.name)}  <b>${fmtN(x.total)}</b>`).join("\n") : "Nobody has played today's yet.");
    return out.join("\n");
  }

  /* the league table page: the whole competition table, plus today's Daily Trip */
  function league({ token } = {}) {
    const wallet = walletOf(token), rows = ranked(B.days[dayKey()] || {});
    return { comp: compView(wallet, 100), today: rows.slice(0, 20).map(x => ({ name: x.name, total: x.total, cleared: x.cleared })), todayPlayers: rows.length };
  }

  return { start, finish, duel: duelGet, DUEL_LAYERS, board, league, summonable, me, cards, dailyDef, live: () => runs.size, _news: { sendLeader, finalNews, sendScores }, topText, links: () => LINKS_OF(),
    flush: () => { liveFile && liveFile.flush(); boardFile && boardFile.flush(); duelFile && duelFile.flush(); } };
}

module.exports = { create, tgUser };
