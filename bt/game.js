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

function create({ log = () => {}, beings = async () => [], walletOf = () => null, dir = null, comp = loadComp(), announce = null, tgToken = () => "", playUrl = () => "" } = {}) {
  const jf = file => dir ? require("../jsonfile").create(path.join(dir, file), { log: m => log("breakthrough: " + m), fallback: {} }) : null;
  const liveFile = jf("bt-live.json"), boardFile = jf("bt-board.json");
  let saved = {}; try { saved = liveFile ? liveFile.load() || {} : {}; } catch (e) { log("breakthrough: live runs could not be read, starting fresh: " + e.message); }
  const runs = new Map(Object.entries(saved));
  const saveLive = () => { if (liveFile) liveFile.save(() => { tidy(); return Object.fromEntries(runs); }); };
  let B = {}; try { B = boardFile ? boardFile.load() || {} : {}; } catch (e) { log("breakthrough: board could not be read, starting fresh: " + e.message); }
  B.days = B.days || {}; B.weeks = B.weeks || {}; B.summons = B.summons || {}; B.comps = B.comps || {}; B.posted = B.posted || {};
  const trim = (o, k) => Object.fromEntries(Object.keys(o).sort().slice(-k).map(x => [x, o[x]]));
  const saveBoard = () => { if (boardFile) boardFile.save(() => (B = { days: trim(B.days, 10), weeks: trim(B.weeks, 6), summons: trim(B.summons, 10), comps: B.comps, posted: B.posted })); };
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
    return { seed, deck, own: [] };
  }
  const defOf = r => ({ seed: r.seed, deck: r.deck, own: r.own, cards: C.cardOf });

  let CARDS = null;
  function cards() {
    if (!CARDS) { const json = Buffer.from(JSON.stringify({ v: 1, cards: C.all() })); CARDS = { json, gz: require("zlib").gzipSync(json) }; }
    return CARDS;
  }

  async function ownedBy(wallet) { const all = await beings(); return all.filter(b => b.owner === wallet).map(b => b.n); }

  async function start({ token, pid, tg, mode, summon, ip } = {}) {
    tidy();
    const wallet = walletOf(token);
    if (token && !wallet) return { error: "Your sign-in has expired. Sign in again.", status: 401 };
    const me = who(wallet, pid, tg);
    const owner = wallet ? "w:" + wallet : "ip:" + String(ip || "?");
    if (!room(owner)) return { error: "The realm is very busy. Try again in a minute.", status: 503 };
    const day = dayKey();
    let r;
    if (mode === "daily") r = { mode, day, ...dailyDef(day) };
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
    const id = crypto.randomBytes(16).toString("hex");
    Object.assign(r, { id, owner, wallet: wallet || null, pkey: me ? me.key : null, name: me ? me.name : null, at: Date.now(), done: false });
    runs.set(id, r); saveLive();
    return { run: id, mode: r.mode, day, seed: r.seed, deck: r.deck, own: r.own, summoned: r.summoned || null, name: r.name };
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
    const R = E.replay(defOf(r), clean);
    if (R.error) { r.done = true; saveLive(); return { error: "That run didn't add up: " + R.error }; }
    // it takes real time to play: a run can't be handed in faster than its moves could be made
    if ((Date.now() - r.at) / 1000 < clean.length * 0.35 - 2) { r.done = true; saveLive(); return { error: "That run came back faster than it could be played." }; }
    const S = R.S;
    r.done = true;
    const res = { mode: r.mode, cleared: E.cleared(S), total: S.total, best: S.best, bestHand: S.bestHand, broke: S.broke || E.cleared(S) >= E.LAYERS, over: S.over };
    const secs = Math.round((Date.now() - r.at) / 1000);
    if (r.pkey && S.total > 0) res.board = record(r, res);
    if (r.mode === "daily" && S.total > 0) res.comp = enter(r, Object.assign({}, res, { secs, moves: clean }));
    if (S.total > 0) scoreNews(r, res);
    r.result = res; saveLive();
    log(`breakthrough: ${r.mode} ${res.cleared} layers, ${res.total} pts in ${secs}s, ${clean.length} moves${r.wallet ? " (" + r.wallet.slice(0, 4) + ")" : ""}`);
    return { result: res };
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
  /* the competition: a signed-in wallet's best Daily Trip of the competition's days */
  const inComp = day => !!comp && day >= comp.start && day <= comp.end;
  function enter(r, res) {
    if (!inComp(r.day)) return null;
    if (!r.wallet) return { entered: false };
    const book = B.comps[comp.id] = B.comps[comp.id] || {};
    const cur = book[r.wallet], better = !cur || res.total > cur.total;
    if (better) book[r.wallet] = { total: res.total, cleared: res.cleared, day: r.day, at: Date.now(), secs: res.secs, moves: res.moves };
    saveBoard();
    if (isTeam(r.wallet)) return { entered: true, team: true, best: better };
    const rows = ranked(book).filter(x => !isTeam(x.key)), i = rows.findIndex(x => x.key === r.wallet);
    if (i === 0 && better) leaderNews();
    return { entered: true, best: better, rank: i + 1, of: rows.length };
  }
  // the team's own wallets play like anyone, but can't win the prize: they're shown, unranked
  const isTeam = w => !!comp && Array.isArray(comp.team) && comp.team.includes(w);
  function compView(wallet, limit = 10) {
    if (!comp) return null;
    const all = ranked(B.comps[comp.id] || {}), day = dayKey(), over = day > comp.end;
    const rows = all.filter(x => !isTeam(x.key)), i = wallet ? rows.findIndex(x => x.key === wallet) : -1;
    let rank = 0;
    return { title: comp.title, prize: comp.prize, start: comp.start, end: comp.end, rules: comp.rules,
      endsAt: Date.parse(comp.end + "T23:59:59Z"), live: inComp(day), over, players: rows.length,
      // everyone in score order; team wallets have no rank. The winner's full address is shown once it's over.
      top: all.slice(0, limit).map(x => { const team = isTeam(x.key), r = team ? null : ++rank;
        return { name: short(x.key), rank: r, team, wallet: over && r === 1 ? x.key : undefined, total: x.total, cleared: x.cleared, you: x.key === wallet }; }),
      you: wallet && isTeam(wallet) ? { team: true } : i < 0 ? null : { rank: i + 1, total: rows[i].total } };
  }
  /* ---------- Telegram: the league table, as it happens ---------- */
  const fmtN = n => Math.round(n).toLocaleString("en-GB");
  const esc = t => String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // the Play button opens the Telegram Mini App when one is set up (TG_APP_URL), else the website
  const LINKS_OF = () => [["Play BREAKTHROUGH", playUrl() || "https://dmt-realm.dev/breakthrough"], ["League table", "https://dmt-realm.dev/league"]];
  function tableLines(rows) { return rows.slice(0, 3).map((x, k) => `${k + 1}. ${esc(short(x.key))}  <b>${fmtN(x.total)}</b>`).join("\n"); }
  function leftText() {
    const h = Math.max(0, Math.floor((Date.parse(comp.end + "T23:59:59Z") - Date.now()) / 3600e3));
    return h >= 48 ? Math.floor(h / 24) + " days left" : h >= 1 ? h + " hours left" : "under an hour left";
  }
  /* every finished run, as one line in the group. Gathered for a few seconds and sent together,
     so a busy minute is one message, not twenty (Telegram allows about 20 posts a minute). */
  const SCORE_GAP_MS = 6000, MAX_LINES = 12;
  let pending = [], scoreTimer = null;
  function scoreNews(r, res) {
    if (!announce) return;
    const where = r.mode === "daily" ? "Daily Trip" : "Free Run";
    const extra = res.comp && res.comp.entered && !res.comp.team ? ` · <b>#${res.comp.rank}</b> in the ${esc(comp.prize)} comp`
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
    if (!comp || !inComp(dayKey())) return;
    const rows = ranked(B.comps[comp.id] || {}).filter(x => !isTeam(x.key));
    if (!rows.length || (B.posted.leaderKey === rows[0].key && B.posted.leaderTotal === rows[0].total)) return;
    B.posted.leaderAt = Date.now(); B.posted.leaderKey = rows[0].key; B.posted.leaderTotal = rows[0].total; saveBoard();
    const top = rows[0];
    Promise.resolve(announce(`🏆 <b>NEW TOP SCORE in BREAKTHROUGH</b>\n\n<b>${fmtN(top.total)}</b> by ${esc(short(top.key))} (${top.cleared} layers deep)\n\n${tableLines(rows)}\n\n${esc(comp.prize)} to the highest Daily Trip score. ${leftText()}. Free to enter: connect a wallet, then play.`, LINKS_OF()))
      .then(r => { if (r && r.ok === false) log("breakthrough: telegram post failed: " + r.problem); }).catch(() => {});
  }
  // once it's over, post the result (checked every few minutes, and once at start)
  function finalNews() {
    if (!announce || !comp || dayKey() <= comp.end || B.posted["final:" + comp.id]) return;
    const rows = ranked(B.comps[comp.id] || {}).filter(x => !isTeam(x.key));
    B.posted["final:" + comp.id] = Date.now(); saveBoard();
    if (!rows.length) return;
    const w = rows[0];
    Promise.resolve(announce(`🏆 <b>${esc(comp.title)} is over</b>\n\nThe winner of ${esc(comp.prize)}: <b>${esc(short(w.key))}</b> with <b>${fmtN(w.total)}</b>.\n\n${tableLines(rows)}\n\nWinner's wallet: <code>${esc(w.key)}</code>`, LINKS_OF())).catch(() => {});
  }
  if (announce) {
    const t = setInterval(finalNews, 5 * 60e3); if (t.unref) t.unref();
    const s = setTimeout(() => { finalNews(); if (comp && inComp(dayKey()) && !B.posted.leaderKey) leaderNews(); }, 5000); if (s.unref) s.unref();
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
    }
    return out;
  }

  /* the bot's replies to /top and /league in the group */
  function topText() {
    const out = [];
    if (comp && inComp(dayKey())) {
      const rows = ranked(B.comps[comp.id] || {}).filter(x => !isTeam(x.key));
      out.push(`🏆 <b>${esc(comp.title)}</b>: ${esc(comp.prize)} to the winner, ${leftText()}`);
      out.push(rows.length ? tableLines(rows) : "No entries yet. Connect a wallet and play the Daily Trip to take first place.");
    }
    const today = ranked(B.days[dayKey()] || {});
    out.push(`\n🎴 <b>Today's Daily Trip</b>`);
    out.push(today.length ? today.slice(0, 5).map((x, k) => `${k + 1}. ${esc(x.name)}  <b>${fmtN(x.total)}</b>`).join("\n") : "Nobody has played today's yet.");
    return out.join("\n");
  }

  /* the league table page: the whole competition table, plus today's Daily Trip */
  function league({ token } = {}) {
    const wallet = walletOf(token), rows = ranked(B.days[dayKey()] || {});
    return { comp: compView(wallet, 100), today: rows.slice(0, 20).map(x => ({ name: x.name, total: x.total, cleared: x.cleared })), todayPlayers: rows.length };
  }

  return { start, finish, board, league, summonable, me, cards, dailyDef, live: () => runs.size, _news: { sendLeader, finalNews, sendScores }, topText, links: () => LINKS_OF(),
    flush: () => { liveFile && liveFile.flush(); boardFile && boardFile.flush(); } };
}

module.exports = { create, tgUser };
