/* ============================================================
   BREAKTHROUGH — the page. It plays the run with the shared engine
   (bt/engine.js) and sends only the moves to the server, which plays
   them again and decides the score.
   ============================================================ */
(() => {
  "use strict";
  const E = window.RealmBreak;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const store = { get(k, d) { try { const v = localStorage.getItem("realm-bt-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem("realm-bt-" + k) : localStorage.setItem("realm-bt-" + k, JSON.stringify(v)); } catch { /* private mode */ } } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => Math.round(n).toLocaleString("en-GB");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TIER = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#fff7d6" };
  const AURA_C = { Cold: "#5cf0ff", Rose: "#ff7ac8", Warm: "#ffc94a", Acid: "#8dff5c", Opposed: "#b18cff", Prime: "#fff1c2" };
  const GLYPH = { L: "ϟ", T: "♣", P: "◉", S: "✺", M: "✿", D: "☾", U: "◬" };
  // the Mushroom and UFO icons are little pixel pictures (no font has a good one); the rest are characters
  const PIX = {
    M: ["....###....", "..#######..", ".##.###.##.", "###########", "###########", "....###....", "....###....", "...#####..."],
    U: ["....###....", "...#####...", ".#########.", "###########", "#.#.#.#.#.#", ".#########.", "...#...#...", "..#.....#..", ".#.......#."],
  };
  const pixSvg = rows => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rows.map((r, y) => [...r].map((ch, x) => ch === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "").join("")).join("")}</svg>`;
  const icon = k => PIX[k] ? pixSvg(PIX[k]) : GLYPH[k];
  const TRAIT = {
    L: { name: "Lightning", Strike: "+4 mult", Storm: "+8 mult", Tempest: "×3 mult" },
    T: { name: "Trees", One: "+3 mult", Copse: "+6 mult", Forest: "×2 mult" },
    P: { name: "Planets", One: "+20 chips", Two: "+40 chips", Ringed: "+30 chips, +2 mult", Cluster: "+150 chips" },
    S: { name: "Supernova", One: "×1.5 mult", Two: "×2 mult", Barrage: "×4 mult" },
    M: { name: "Mushrooms", Few: "scores twice", Cluster: "scores 3 times", Grove: "scores 4 times" },
    D: { name: "Moon Dust", Faint: "+4 chips for every cast so far", Drifting: "+8 chips for every cast so far", Heavy: "+20 chips for every cast so far" },
    U: { name: "UFOs", One: "abducts: draw 1 extra card", Few: "abducts: draw 2 extra cards" },
  };
  const TIER_POWER = { Entity: "+10 mult", God: "×2 mult", Source: "×5 mult, and counts as any Aura" };

  /* ---------- the cards ---------- */
  let CARDS = null;
  const card = n => CARDS[n - 1];
  async function loadCards() { if (CARDS) return; const r = await fetch("/api/bt/cards"); CARDS = (await r.json()).cards; }
  function cardEl(n, { own = false, big = false } = {}) {
    const c = card(n), el = document.createElement("div");
    el.className = "bt-card" + (big ? " big" : "") + (own ? " own" : "");
    el.style.setProperty("--tc", TIER[c.tier]); el.style.setProperty("--ac", AURA_C[c.aura] || "#fff");
    const tr = Object.keys(c.x || {}).map(k => `<i title="${TRAIT[k].name}">${icon(k)}</i>`).join("");
    el.innerHTML = `<div class="art" style="background-image:url(/thumbs/${n}.webp)"><span class="gem${c.aura === "Prime" ? " prime" : ""}">${c.aura === "Prime" ? "✦" : c.aura[0]}</span><span class="tr">${tr}</span></div>`
      + `<div class="foot"><b>${c.chips}</b><span>${esc(c.geo || c.tier)}</span></div>`;
    el.dataset.n = n;
    return el;
  }
  function powers(n) {
    const c = card(n), out = [];
    out.push(["Aura", c.aura === "Prime" ? "Every Aura (wild)" : c.aura]);
    out.push(["Chips", c.chips + " (" + c.tier + ")"]);
    if (c.geo) out.push(["Geometry", c.geo + ": +2 mult with each other scoring " + c.geo]);
    if (c.col) out.push(["Colourway", c.col + ": 3+ scoring in one Colourway is ×2"]);
    for (const [k, v] of Object.entries(c.x || {})) out.push([TRAIT[k].name, v + ": " + TRAIT[k][v]]);
    if (TIER_POWER[c.tier]) out.push([c.tier, TIER_POWER[c.tier]]);
    // its own power (Gods, Entities and the Source), live on runs from 19 Oct
    const P = E.POWERS && E.POWERS[n];
    if (P) out.unshift(["Power: " + P.name, P.text + (new Date().toISOString().slice(0, 10) < "2026-10-19" ? " (from 19 Oct)" : "")]);
    return out;
  }
  function showCard(n) {
    const c = card(n), box = $("[data-carddetail]");
    box.innerHTML = `<h2 style="font-size:1.4rem">${esc(c.name)}</h2><p class="bt-sub">#${n} · ${c.tier}</p><div class="bt-detail"></div><button class="bt-ghost wide" data-cardclose>Close</button>`;
    const d = box.querySelector(".bt-detail");
    d.appendChild(cardEl(n, { big: true }));
    const ul = document.createElement("ul"); ul.innerHTML = powers(n).map(([k, v]) => `<li><b>${esc(k)}</b><br>${esc(v)}</li>`).join(""); d.appendChild(ul);
    $("[data-cardsheet]").hidden = false; cardOpenAt = Date.now();
    box.querySelector("[data-cardclose]").onclick = () => { $("[data-cardsheet]").hidden = true; };
  }
  // a tap anywhere closes the card (but not the lift of the finger that opened it)
  let cardOpenAt = 0;
  $("[data-cardsheet]").addEventListener("click", e => { if (Date.now() - cardOpenAt > 450) e.currentTarget.hidden = true; });

  /* ---------- sound: little square-wave blips ---------- */
  let AC = null, muted = store.get("mute", false);
  function tone(f, dur = 0.08, type = "square", vol = 0.045, when = 0) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch { /* no audio */ }
  }
  const NOTES = [523, 587, 659, 784, 880, 988, 1047, 1175, 1319, 1568, 1760, 2093];
  const sfx = {
    tap: () => tone(660, 0.04, "square", 0.03),
    step: k => tone(NOTES[Math.min(k, NOTES.length - 1)], 0.07),
    mult: k => tone(NOTES[Math.min(k, NOTES.length - 1)] * 1.5, 0.09, "sawtooth", 0.03),
    x: () => { tone(880, 0.1, "square", 0.05); tone(1320, 0.14, "square", 0.04, 0.06); },
    total: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.05, i * 0.05)); },
    deal: () => tone(330, 0.03, "triangle", 0.05),
    win: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.2, "square", 0.05, i * 0.07)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "triangle", 0.06, i * 0.12)); },
  };
  function paintMute() { $$("[data-mute-label]").forEach(e => { e.textContent = muted ? "✕" : "♪"; }); }
  $$("[data-mute]").forEach(b => b.addEventListener("click", () => { muted = !muted; store.set("mute", muted); paintMute(); sfx.tap(); }));
  paintMute();

  /* ---------- who you are (shared sign-in with the Arena) ---------- */
  const session = () => { try { const s = JSON.parse(localStorage.getItem("realm-tcg-session") || "null"); return s && Date.now() - s.at < 23 * 3600e3 ? s : null; } catch { return null; } };
  const api = async (url, body, token) => {
    const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { headers: token ? { Authorization: "Bearer " + token } : {} });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "The realm didn't answer."); e.status = r.status; e.data = d; throw e; }
    return d;
  };
  let PID = store.get("pid", null), ME = null, BOARD = null;
  /* inside Telegram (the Mini App): Telegram tells us who's playing, signed; the server checks it */
  let TG = null;
  const inTelegram = /tgWebAppData=/.test(location.hash + location.search);
  const tgReady = !inTelegram ? Promise.resolve() : new Promise(ok => {
    const sc = document.createElement("script"); sc.src = "https://telegram.org/js/telegram-web-app.js"; sc.onload = sc.onerror = () => ok(); document.head.appendChild(sc);
  }).then(() => {
    TG = window.Telegram && window.Telegram.WebApp; if (!TG) return;
    try { TG.ready(); TG.expand(); TG.disableVerticalSwipes && TG.disableVerticalSwipes(); TG.setHeaderColor && TG.setHeaderColor("#05020c"); TG.setBackgroundColor && TG.setBackgroundColor("#05020c"); } catch { /* older Telegram */ }
    document.documentElement.classList.add("in-tg");
  });
  const tgData = () => (TG && TG.initData) || undefined;
  const auth = () => { const s = session(); return s ? { token: s.token } : { pid: PID, tg: tgData() }; };
  async function loadMe() {
    await tgReady;
    try { ME = await api("/api/bt/me", auth()); if (ME.pid) { PID = ME.pid; store.set("pid", PID); } }
    catch (e) { if (e.status === 401) { signOut(); return loadMe(); } }
    paintLobby();
  }
  async function loadBoard() {
    const s = session();
    await tgReady;
    const q = [PID ? "pid=" + PID : "", !s && tgData() ? "tg=" + encodeURIComponent(tgData()) : ""].filter(Boolean).join("&");
    try { BOARD = await api("/api/bt/board" + (q ? "?" + q : ""), null, s && s.token); } catch { BOARD = null; }
    paintLobby();
  }
  const STD = [];
  try {
    window.addEventListener("wallet-standard:register-wallet", e => { try { e.detail({ register: (...w) => { STD.push(...w); return () => {}; } }); } catch { /* not a wallet */ } });
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: (...w) => { STD.push(...w); return () => {}; } } }));
  } catch { /* old browser */ }
  const stdWallet = () => STD.find(w => w.features && w.features["standard:connect"] && w.features["solana:signMessage"] && /phantom/i.test(w.name))
    || STD.find(w => w.features && w.features["standard:connect"] && w.features["solana:signMessage"]);
  const injected = () => (window.phantom && window.phantom.solana) || (window.solana && window.solana.signMessage ? window.solana : null) || window.solflare || window.backpack || null;
  async function connectAndSign() {
    const w = stdWallet(), inj = !w && injected();
    if (!w && !inj) throw new Error("No Solana wallet found in this browser.");
    let address, account;
    if (w) { const r = await w.features["standard:connect"].connect(); account = r.accounts.find(a => a.chains ? a.chains.some(c => /solana/.test(c)) : true) || r.accounts[0]; address = account.address; }
    else { const r = await inj.connect(); address = (r && r.publicKey ? r.publicKey : inj.publicKey).toString(); }
    const { nonce, message } = await api("/api/duel/nonce", { wallet: address });
    const bytes = new TextEncoder().encode(message);
    let sig;
    if (w) { const out = await w.features["solana:signMessage"].signMessage({ account, message: bytes }); sig = (Array.isArray(out) ? out[0] : out).signature; }
    else { const out = await inj.signMessage(bytes, "utf8"); sig = out.signature || out; }
    return api("/api/duel/signin", { nonce, signature: btoa(String.fromCharCode(...new Uint8Array(sig))) });
  }
  function signOut() { try { localStorage.removeItem("realm-tcg-session"); } catch { /* fine */ } }
  $("[data-w-connect]").addEventListener("click", async () => {
    const b = $("[data-w-connect]"), er = $("[data-w-err]"); er.hidden = true; b.disabled = true; b.textContent = "Check your wallet…";
    try { const r = await connectAndSign(); localStorage.setItem("realm-tcg-session", JSON.stringify({ wallet: r.wallet, token: r.token, at: Date.now() })); sfx.win(); await loadMe(); loadBoard(); }
    catch (e) { const m = (e && e.message) || ""; er.textContent = /reject|cancel|denied|declin/i.test(m) ? "Cancelled in the wallet." : m || "The wallet didn't connect. Try again."; er.hidden = false; }
    b.disabled = false; b.textContent = "Connect wallet";
  });
  $("[data-w-off]").addEventListener("click", () => {
    const s = session(); if (s) fetch("/api/duel/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: s.token }) }).catch(() => {});
    signOut(); loadMe(); loadBoard();
  });
  setTimeout(() => {
    if (stdWallet() || injected() || session()) return;
    $("[data-w-connect]").hidden = true;
    if (inTelegram) { const ph = $("[data-w-phantom]"); ph.hidden = false; ph.textContent = "Open in browser to connect"; ph.href = "https://dmt-realm.dev/breakthrough"; ph.onclick = e => { if (TG && TG.openLink) { e.preventDefault(); TG.openLink(ph.href); } }; return; }
    const ph = $("[data-w-phantom]"); ph.hidden = false; ph.href = "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin);
  }, 1200);

  /* ---------- the lobby ---------- */
  function show(name) { $$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; }); window.scrollTo(0, 0); }
  function paintFan() {
    const fan = $("[data-fan]"); if (!CARDS || fan.childElementCount) return;
    [29, 193, 1111, 762, 569].forEach((n, i) => { const el = cardEl(n); el.style.transform = `translateX(-50%) rotate(${(i - 2) * 11}deg) translateY(${Math.abs(i - 2) * 8}px)`; el.style.zIndex = i === 2 ? 5 : 5 - Math.abs(i - 2); fan.appendChild(el); });
  }
  function paintLobby() {
    sky(0, 0); try { window.BTFX && BTFX.rest(); } catch (e) { /* effects only */ }
    paintFan();
    const s = session();
    $("[data-w-connect]").hidden = !!s; $("[data-w-off]").hidden = !s;
    if (s) { $("[data-w-phantom]").hidden = true; }
    $("[data-w-who]").innerHTML = s
      ? `Signed in as <b>${esc(s.wallet.slice(0, 4) + "…" + s.wallet.slice(-4))}</b>.${ME && ME.boost > 100 ? ` Your holder boost: <b>×${ME.boost / 100}</b> on every cast.` : ME && ME.boost === 100 ? " Hold $DMT for a boost on every cast: 500k gives +50%." : ""}`
      : ME && ME.telegram ? `Playing as <b>${esc(ME.name)}</b> from Telegram: your scores show on the boards. To enter the SOL competition, open the game in your browser or Phantom and connect a wallet.`
      : "Playing as a guest. Hold $DMT and every cast scores more: 50k +10%, 250k +20%, 500k +50%, 1M +60%, 5M +100%, 10M +150% (up to ×2.5).";
    const d = BOARD && BOARD.daily, wxd = BOARD && BOARD.weather, wxEl = $("[data-daily-weather]");
    wxEl.hidden = !wxd; if (wxd) wxEl.textContent = `Today's weather: ${wxd.name}. ${wxd.text}`;
    $("[data-daily-note]").textContent = d && d.you ? `Your best today: ${fmt(d.you.total)} · #${d.you.rank} of ${d.players}` : d && d.players ? `${d.players} player${d.players === 1 ? "" : "s"} today · best run counts` : "Best run counts";
    $("[data-resume]").hidden = !store.get("run", null);
    paintComp();
  }
  /* the competition: a banner in the lobby while it runs */
  function left(ms) { const h = Math.max(0, Math.floor(ms / 3600e3)); return h >= 48 ? Math.floor(h / 24) + " days left" : h >= 1 ? h + " hours left" : "ends soon"; }
  function paintComp() {
    const c = BOARD && BOARD.comp, el = $("[data-comp]");
    $("[data-comptab]").hidden = !c;
    if (!c || (!c.live && !c.over)) { el.hidden = true; return; }
    el.hidden = false;
    $("[data-comp-k]").textContent = c.over ? "COMPETITION OVER" : "WIN " + c.prize.toUpperCase();
    const pts = c.scoring === "points";
    $("[data-comp-t]").textContent = c.over ? (c.top[0] ? `Winner: ${c.top[0].name} with ${pts ? c.top[0].points + " points" : fmt(c.top[0].total)}` : "No entries")
      : pts ? `Win today's Daily Trip for ${c.points[0]} points · most points this week wins` : "Highest Daily Trip score this week";
    $("[data-comp-s]").textContent = c.over ? "Tap for the final board" : !session() ? `${left(c.endsAt - Date.now())} · connect a wallet below to enter`
      : c.you && c.you.team ? `Team wallet: you can play, but not win · ${left(c.endsAt - Date.now())}`
      : c.you ? `You're #${c.you.rank} of ${c.players} with ${pts ? c.you.points + " pts" : fmt(c.you.total)} · ${left(c.endsAt - Date.now())}` : `${c.players} entered · ${left(c.endsAt - Date.now())} · play the Daily Trip`;
  }
  $("[data-comp]").addEventListener("click", async () => { tab = "comp"; $("[data-boardsheet]").hidden = false; paintBoard(); await loadBoard(); paintBoard(); });

  /* ---------- the run ---------- */
  let R = null;
  const defOf = r => ({ seed: r.seed, deck: r.deck, own: r.own, boost: r.boost || 100, weather: r.weather || null, powers: !!r.powers, cards: card });
  const saveRun = () => store.set("run", R ? { id: R.id, mode: R.mode, seed: R.seed, deck: R.deck, own: R.own, boost: R.boost, weather: R.weather || null, powers: !!R.powers, duel: R.duel || null, moves: R.moves, day: R.day, left: R.left, savedAt: Date.now() } : null);

  /* ---------- the clock: 60 seconds a layer. It stops while a cast scores, between layers, and during the
     layer's opening banner; it keeps running if you look away (menu, card details, another tab). ---------- */
  const LAYER_MS = 60e3;
  let lastTick = performance.now(), lastSave = 0;
  function paintTime() {
    if (!R) return;
    const s = Math.max(0, Math.ceil(R.left / 1000));
    $("[data-time]").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    $("[data-timebox]").classList.toggle("low", s <= 10);
  }
  setInterval(() => {
    const now = performance.now(), dt = now - lastTick; lastTick = now;
    if (!R || R.finishing || R.S.over || R.S.phase !== "play" || R.busy || R.intro || $('[data-screen="game"]').hidden) return;
    const before = Math.ceil(R.left / 1000);
    R.left -= dt; paintTime();
    const after = Math.ceil(R.left / 1000);
    if (after < before && after <= 5 && after > 0) tone(after <= 2 ? 990 : 760, 0.07, "square", 0.05);
    if (now - lastSave > 2000) { lastSave = now; saveRun(); }
    if (R.left <= 0) timeUp();
  }, 200);
  async function timeUp() {
    if (!R || R.finishing) return;
    R.left = 0; R.intro = true; paintTime(); saveRun();
    const me = R; await burst("TIME!"); if (R === me) finishRun();
  }
  async function startRun(mode, summon) {
    sfx.tap();
    const btns = $$("[data-play]"); btns.forEach(b => (b.disabled = true));
    try {
      await loadCards();
      const d = await api("/api/bt/start", { ...auth(), mode, summon: mode === "duel" ? undefined : summon || undefined, duel: mode === "duel" ? (summon || undefined) : undefined });
      R = { id: d.run, mode: d.mode, day: d.day, seed: d.seed, deck: d.deck, own: d.own || [], boost: d.boost || 100, weather: d.weather || null, powers: !!d.powers, moves: [], summoned: d.summoned, bestCast: null, left: LAYER_MS,
        duel: d.duel ? d.duel.id : null };
      R.S = E.createRun(defOf(R)); R.sel = []; R.sort = store.get("sort", "aura"); $("[data-why]").hidden = true;
      saveRun(); show("game"); paint(true); layerIntro();
      if (!store.get("coached", false)) coach(0);
    } catch (e) {
      if (e.status === 401) { signOut(); await loadMe(); }
      alert(e.message || "Couldn't start a run. Try again.");
    }
    btns.forEach(b => (b.disabled = false));
  }
  async function resumeRun() {
    const r = store.get("run", null); if (!r) return;
    await loadCards();
    const out = E.replay(defOf(r), r.moves);
    if (out.error) { store.set("run", null); paintLobby(); return alert("That run couldn't be picked up again. Start a new one."); }
    // the clock kept running while you were away
    const left = r.left == null ? LAYER_MS : r.left - (r.savedAt ? Date.now() - r.savedAt : 0);
    R = { ...r, S: out.S, sel: [], sort: store.get("sort", "aura"), left };
    show("game"); paint(true);
    if (R.S.over || (R.mode === "duel" && R.S.phase === "draft" && R.S.layer >= DUEL_LAYERS - 1)) return finishRun();
    if (R.S.phase === "play" && R.left <= 0) return timeUp();
    if (R.S.phase === "draft") openDraft();
  }

  /* the hand, in the order it's shown (sorting changes only the view; cards always fire in their best order) */
  function viewOrder() {
    const S = R.S, idx = S.hand.map((_, i) => i);
    const auraRank = a => ["Cold", "Rose", "Warm", "Acid", "Opposed", "Prime"].indexOf(a);
    if (R.sort === "aura") idx.sort((a, b) => auraRank(card(S.hand[a]).aura) - auraRank(card(S.hand[b]).aura) || card(S.hand[b]).chips - card(S.hand[a]).chips);
    else idx.sort((a, b) => card(S.hand[b]).chips - card(S.hand[a]).chips);
    return idx;
  }
  /* ---------- big numbers fit: each number box knows how many characters it holds, and CSS sizes the text to suit ---------- */
  const fitLen = el => el.style.setProperty("--len", Math.max(1, el.textContent.length));
  { const t = $("[data-target]"), sp = t && t.closest("span"); if (sp) { const f = () => sp.style.setProperty("--tlen", Math.max(1, t.textContent.length + 2)); f(); new MutationObserver(f).observe(t, { childList: true, characterData: true, subtree: true }); } }
  ["[data-chips]", "[data-mult]", "[data-score]"].forEach(q => { const el = $(q); if (!el) return; fitLen(el); new MutationObserver(() => fitLen(el)).observe(el, { childList: true, characterData: true, subtree: true }); });

  /* ---------- the sky follows the run ---------- */
  function sky(depthLayer, heat) {
    const skyEl = document.querySelector(".bt-sky"); if (!skyEl) return;
    const depth = Math.min(1, Math.max(0, depthLayer) / 12);
    skyEl.style.setProperty("--depth", depth.toFixed(3)); skyEl.style.setProperty("--heat", Math.min(1, Math.max(0, heat)).toFixed(3));
    skyEl.dataset.tier = depth >= .75 ? 3 : depth >= .45 ? 2 : depth >= .2 ? 1 : 0;
    skyEl.classList.toggle("hot", heat >= .75);
    try { window.BTFX && BTFX.level(heat, depth); } catch (e) { /* effects only */ }
  }
  function skyFlash(ratio) {
    const skyEl = document.querySelector(".bt-sky"); if (!skyEl || ratio < .35) return;
    const big = ratio >= 1;
    skyEl.style.setProperty("--fc", big ? "rgba(255,226,140,.85)" : ratio >= .7 ? "rgba(255,120,220,.6)" : "rgba(92,240,255,.5)");
    skyEl.classList.remove("boom", "strobe"); void skyEl.offsetWidth; skyEl.classList.add(big ? "strobe" : "boom");
  }
  function paint(fresh) {
    const S = R.S, target = E.targetOf(S.layer);
    sky(S.layer, S.score / target); try { window.BTFX && BTFX.total(S.total); } catch (e) { /* effects only */ }
    $("[data-layer-n]").textContent = R.mode === "duel" ? `MIRROR DUEL · LAYER ${S.layer + 1} OF ${DUEL_LAYERS}` : S.layer < E.LAYERS ? `LAYER ${S.layer + 1} OF ${E.LAYERS}` : `BEYOND · LAYER ${S.layer + 1}`;
    $("[data-layer-name]").textContent = S.layer < E.LAYERS ? E.LAYER_NAMES[S.layer] : "Past the Source";
    const wx = S.weather && E.WEATHER[S.weather], wEl = $("[data-weather]");
    wEl.hidden = !wx; if (wx) wEl.innerHTML = `<b>${esc(wx.name)}</b> ${esc(wx.text)}`;
    $("[data-score]").textContent = fmt(S.score); $("[data-target]").textContent = fmt(target); $("[data-total]").textContent = fmt(S.total); paintTime();
    const bb = $("[data-boost]"); bb.hidden = !(R.boost > 100); bb.textContent = "×" + (R.boost / 100) + " BOOST";
    const p = Math.min(1, S.score / target); $("[data-bar]").style.width = (p * 100).toFixed(1) + "%"; $(".bt-bar").classList.toggle("full", p >= 1);
    $("[data-casts]").textContent = "●".repeat(S.casts) + "○".repeat(Math.max(0, (S.weather === "swift" ? 3 : E.CASTS) - S.casts));
    $("[data-discards]").textContent = "●".repeat(S.discards) + "○".repeat(Math.max(0, E.DISCARDS - S.discards));
    $("[data-deck]").textContent = S.draw.length + "/" + S.deck.length;
    $("[data-sort]").textContent = "Sort: " + (R.sort === "aura" ? "Aura" : "Power");
    renderHand(fresh);
  }
  function renderHand(fresh, newOnes = []) {
    const S = R.S, box = $("[data-hand]"); box.innerHTML = "";
    const order = viewOrder(), n = order.length;
    const W = box.clientWidth || 340, cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cw")) || 76;
    const step = n > 1 ? Math.min(cw + 6, (W - cw) / (n - 1)) : 0, start = (W - (step * (n - 1) + cw)) / 2;
    order.forEach((hi, k) => {
      const el = cardEl(S.hand[hi], { own: R.own.includes(S.hand[hi]) });
      if (R.fresh && S.hand[hi] === R.fresh) el.classList.add("fresh");
      el.style.left = (start + k * step) + "px"; el.style.zIndex = k + 1;
      if (R.sel.includes(hi)) el.classList.add("sel");
      if (fresh || newOnes.includes(S.hand[hi])) { el.classList.add("new"); el.style.animationDelay = (k * 0.04) + "s"; }
      bindCard(el, hi);
      box.appendChild(el);
    });
    paintPick();
  }
  /* a tap selects; only a deliberate hold (a still finger for 0.7 s) opens the card's details */
  const HOLD_MS = 800, SLOP = 10;
  function press(el, onTap, onHold) {
    let t = null, held = false, x0 = 0, y0 = 0, live = false;
    const cancel = () => { clearTimeout(t); live = false; };
    el.addEventListener("pointerdown", e => { held = false; live = true; x0 = e.clientX; y0 = e.clientY; clearTimeout(t); t = setTimeout(() => { if (live) { held = true; live = false; onHold(); } }, HOLD_MS); });
    el.addEventListener("pointermove", e => { if (live && Math.hypot(e.clientX - x0, e.clientY - y0) > SLOP) cancel(); });
    el.addEventListener("pointerup", e => { const tap = live && !held; cancel(); if (held) { e.preventDefault(); return; } if (tap) onTap(); });
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("contextmenu", e => e.preventDefault());
  }
  function bindCard(el, hi) { press(el, () => toggle(hi, el), () => showCard(R.S.hand[hi])); }
  function toggle(hi, el) {
    if (R.busy || R.S.phase !== "play") return;
    const i = R.sel.indexOf(hi);
    if (i >= 0) R.sel.splice(i, 1);
    else { if (R.sel.length >= E.MAX_PICK) return; R.sel.push(hi); }
    el.classList.toggle("sel", R.sel.includes(hi)); sfx.tap(); paintPick();
  }
  function paintPick() {
    const S = R.S, k = R.sel.length, pv = $("[data-preview]");
    if (!k) pv.innerHTML = "Pick up to 5 cards";
    else {
      const h = E.handOf(R.sel.map(i => card(S.hand[i]))), H = E.HANDS[h.id];
      pv.innerHTML = `${H.name.toUpperCase()} <small>${H.chips} × ${H.mult}</small>`;
    }
    $("[data-cast]").disabled = !k || R.busy || S.phase !== "play" || S.casts <= 0;
    $("[data-discard]").disabled = !k || R.busy || S.phase !== "play" || S.discards <= 0;
    $("[data-discard]").textContent = "Discard" + (S.discards ? " (" + S.discards + ")" : "");
  }
  $("[data-sort]").addEventListener("click", () => { R.sort = R.sort === "aura" ? "power" : "aura"; store.set("sort", R.sort); sfx.tap(); paint(); });

  /* ---------- casting: every step of the score, shown as it happens ---------- */
  function float(text, sub, x, y, color) {
    const st = $("[data-stage]"), f = document.createElement("div");
    f.className = "bt-float"; f.style.left = x + "px"; f.style.top = y + "px"; f.style.color = color;
    f.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : "");
    st.appendChild(f); setTimeout(() => f.remove(), 950);
  }
  const bump = el => { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); };
  const multText = t => (t % 10 ? (t / 10).toFixed(1) : String(t / 10));

  /* how the last cast scored: one line per step, only when asked for (it never interrupts play) */
  function showWhy() {
    if (!R || !R.last) return;
    const { ev, ns } = R.last, who = i => i >= 0 && ns[i] ? card(ns[i]).name : null;
    const line = (cls, name, what, s) => `<div class="${cls}"><span>${name ? `<b>${esc(name)}</b> ` : ""}<em>${esc(what)}</em></span><small>${fmt(s.chips)} × ${multText(s.mult)}</small></div>`;
    const out = ev.steps.map(s => {
      if (s.k === "hand") return line("", null, `${s.name}: starts at ${E.HANDS[s.id].chips} chips × ${E.HANDS[s.id].mult} mult`, s);
      if (s.k === "geo") return line("m", null, `Sacred Geometry: +${s.add} mult`, s);
      if (s.k === "chips") return line("c", who(s.i), `+${fmt(s.add)} chips${s.label ? " (" + s.label + ")" : ""}`, s);
      if (s.k === "mult") return line("m", who(s.i), `+${s.add} mult (${s.label})`, s);
      if (s.k === "x") return line("x", who(s.i), `×${s.x} mult (${s.label})`, s);
      if (s.k === "again") return line("c", who(s.i), "scores again (Spores)", s);
      if (s.k === "ufo") return line("", null, `Abducted: draw ${s.draws} extra`, s);
      return "";
    });
    const skipped = ns.length - ev.scoring.length;
    out.push(`<div class="tot"><span>${fmt(ev.chips)} chips × ${multText(ev.mult)} mult =</span><b>${fmt(ev.score)}</b></div>`);
    if (skipped) out.push(`<p class="bt-sub" style="text-align:left;margin:6px 0 0">${skipped} card${skipped === 1 ? " wasn't" : "s weren't"} part of the ${esc(ev.name)}, so ${skipped === 1 ? "it" : "they"} didn't score.</p>`);
    $("[data-steps]").innerHTML = out.join("");
    $("[data-whysheet]").hidden = false; sfx.tap();
  }
  $("[data-why]").addEventListener("click", showWhy);
  $("[data-why2]").addEventListener("click", showWhy);
  $("[data-why-close]").addEventListener("click", () => { $("[data-whysheet]").hidden = true; });
  async function doCast() {
    const S = R.S; if (R.busy || !R.sel.length) return;
    R.busy = true; paintPick(); coachDone();
    const order = E.bestOrder(S, R.sel), ns = order.map(i => S.hand[i]);
    const ev = E.preview(S, order);
    const st = $("[data-stage]"), played = $("[data-played]"), hname = $("[data-hname]");
    const chipsEl = $("[data-chips]"), multEl = $("[data-mult]");
    played.innerHTML = ""; st.classList.add("hot");
    // the cast cards leave the hand and line up on the hexagram
    $$("[data-hand] .bt-card.sel").forEach(el => { el.style.transition = "transform .25s ease-in, opacity .25s"; el.style.transform = "translateY(-140px) scale(.7)"; el.style.opacity = "0"; });
    const els = ns.map((n, k) => { const el = cardEl(n, { own: R.own.includes(n) }); el.style.animationDelay = (k * 0.05) + "s"; if (!ev.scoring.includes(k)) el.classList.add("dim"); played.appendChild(el); return el; });
    await sleep(320);
    const stRect = st.getBoundingClientRect();
    const at = el => { const r = el.getBoundingClientRect(); return [r.left - stRect.left + r.width / 2, r.top - stRect.top + r.height * 0.3]; };
    const calcAt = () => { const r = $("[data-calc]").getBoundingClientRect(); return [r.left - stRect.left + r.width / 2, r.top - stRect.top - 4]; };
    let k = 0, delay = 380;
    for (const s of ev.steps) {
      chipsEl.textContent = fmt(s.chips); multEl.textContent = multText(s.mult);
      if (s.k === "hand") { hname.innerHTML = esc(s.name.toUpperCase()) + `<small>${E.HANDS[s.id].chips} chips × ${E.HANDS[s.id].mult} mult</small>`; bump(chipsEl); bump(multEl); sfx.step(0); }
      else {
        const target = s.i >= 0 && els[s.i] ? els[s.i] : null;
        $$(".bt-played .bt-card.hit").forEach(e => e.classList.remove("hit"));
        if (target) target.classList.add("hit");
        const [x, y] = target ? at(target) : calcAt();
        if (s.k === "chips") { float("+" + fmt(s.add), s.label, x, y, "#5cf0ff"); try { window.BTFX && BTFX.burst(stRect.left + x, stRect.top + y, "chips"); } catch (e) { /* effects only */ } bump(chipsEl); sfx.step(++k); }
        else if (s.k === "mult" || s.k === "geo") { float("+" + s.add + " mult", s.label, x, y, "#ff9ce0"); try { window.BTFX && BTFX.burst(stRect.left + x, stRect.top + y, "mult"); } catch (e) { /* effects only */ } bump(multEl); sfx.mult(++k); }
        else if (s.k === "x") { float("×" + s.x, s.label, x, y, "#ffd35c"); try { window.BTFX && BTFX.burst(stRect.left + x, stRect.top + y, "x"); } catch (e) { /* effects only */ } bump(multEl); sfx.x(); const f = $("[data-flash]"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
        else if (s.k === "again") { float("AGAIN!", s.label, x, y, "#8dff5c"); try { window.BTFX && BTFX.burst(stRect.left + x, stRect.top + y, "again"); } catch (e) { /* effects only */ } sfx.step(++k); }
        else if (s.k === "ufo") { float("+" + s.draws + " cards", "Abducted", x, y, "#8dff5c"); sfx.step(++k); }
      }
      await sleep(delay); delay = Math.max(120, delay * 0.88);
    }
    $$(".bt-played .bt-card.hit").forEach(e => e.classList.remove("hit"));
    skyFlash(ev.score / E.targetOf(S.layer));
    try { const [cx, cy] = calcAt(); window.BTFX && BTFX.cast(stRect.left + cx, stRect.top + cy + 30, (ev.score + 0) / Math.max(1, E.targetOf(S.layer) - S.score)); } catch (e) { /* effects only */ }
    // chips x mult: the total slams in
    const tot = document.createElement("div"); tot.className = "bt-total"; tot.textContent = fmt(ev.score); tot.style.setProperty("--len", tot.textContent.length); st.appendChild(tot); sfx.total();
    const before = S.score, beforeTotal = S.total;
    const old = S.hand.slice();
    const done = E.cast(S, order);
    if (done.error) { R.busy = false; tot.remove(); played.innerHTML = ""; R.sel = []; paint(false); return; }
    R.moves.push(["c", order]); R.sel = []; saveRun();
    R.last = { ev, ns }; $("[data-why]").hidden = false;
    if (!R.bestCast || ev.score > R.bestCast.score) R.bestCast = { score: ev.score, name: ev.name, ns: ev.scoring.map(k => ns[k]) };
    // the score counts up into the bar
    const t0 = performance.now(), dur = 650, target = E.targetOf(S.layer);
    await new Promise(res => { const tick = () => { const p = Math.min(1, (performance.now() - t0) / dur); const v = before + (S.score - before) * p; $("[data-score]").textContent = fmt(v); $("[data-total]").textContent = fmt(beforeTotal + (S.total - beforeTotal) * p); $("[data-bar]").style.width = Math.min(100, v / target * 100).toFixed(1) + "%"; sky(S.layer, v / target); try { window.BTFX && BTFX.total(beforeTotal + (S.total - beforeTotal) * p); } catch (e) { /* effects only */ } p < 1 ? requestAnimationFrame(tick) : res(); }; tick(); });
    const tEl = $("[data-total]"); tEl.classList.add("up"); setTimeout(() => tEl.classList.remove("up"), 300);
    await sleep(500);
    tot.remove(); played.innerHTML = ""; hname.innerHTML = ""; chipsEl.textContent = "0"; multEl.textContent = "0"; st.classList.remove("hot");
    R.busy = false;
    const fresh = S.hand.filter(n => !old.includes(n));
    paint(false); renderHand(false, fresh); if (fresh.length) sfx.deal();
    if (S.phase === "draft" && R.mode === "duel" && S.layer >= DUEL_LAYERS - 1) { const me = R; await burst("DUEL DONE!"); if (R === me) finishRun(); }
    else if (S.phase === "draft") { const me = R; try { window.BTFX && BTFX.breakthrough(); } catch (e) { /* effects only */ } await burst(S.layer === E.LAYERS - 1 ? "THE SOURCE!" : "BREAKTHROUGH!"); if (R === me && !R.finishing) openDraft(); }
    else if (S.over) finishRun();
  }
  function doDiscard() {
    const S = R.S; if (R.busy || !R.sel.length || S.discards <= 0) return;
    coachDone();
    const old = S.hand.slice(), idx = R.sel.slice();
    if (E.discard(S, idx).error) return;
    R.moves.push(["d", idx]); R.sel = []; saveRun();
    const fresh = S.hand.filter(n => !old.includes(n));
    sfx.deal(); paint(false); renderHand(false, fresh);
    if (S.over) finishRun();
  }
  $("[data-cast]").addEventListener("click", doCast);
  $("[data-discard]").addEventListener("click", doDiscard);

  async function burst(text) {
    const b = document.createElement("div"); b.className = "bt-burst"; b.innerHTML = `<b>${esc(text)}</b>`; document.body.appendChild(b);
    sfx.win(); await sleep(1300); b.remove();
  }
  async function layerIntro() {
    const run = R; run.intro = true;
    const S = R.S, b = document.createElement("div"); b.className = "bt-burst";
    b.innerHTML = `<b style="font-size:clamp(1.6rem,8vw,2.4rem);text-align:center">LAYER ${S.layer + 1}<br><span style="font-size:.6em;color:var(--chips)">${esc(S.layer < E.LAYERS ? E.LAYER_NAMES[S.layer] : "Past the Source")}</span></b>`;
    document.body.appendChild(b); await sleep(1000); b.remove();
    run.intro = false;
  }

  /* ---------- the draft: one new being after each breakthrough ---------- */
  function why(n) { const c = card(n), p = powers(n).filter(([k]) => !["Aura", "Chips", "Colourway"].includes(k)); return p.length ? p[0][1] : c.chips + " chips"; }
  function openDraft() {
    if (!R) return;
    const S = R.S;
    $("[data-draft-kick]").textContent = S.layer < E.LAYERS ? `LAYER ${S.layer + 1} CLEARED` : `LAYER ${S.layer + 1} CLEARED`;
    $("[data-draft-title]").textContent = S.layer === E.LAYERS - 1 ? "THE SOURCE!" : "BREAKTHROUGH!";
    $("[data-draft-sub]").textContent = S.layer === E.LAYERS - 1 ? "You reached the Source. Take a being and go deeper, or end the run from the menu." : "Take one being into your deck";
    const box = $("[data-offer]"); box.innerHTML = "";
    S.offer.forEach((n, i) => {
      const b = document.createElement("button"); b.appendChild(cardEl(n, { big: true }));
      const w = document.createElement("span"); w.className = "why"; w.textContent = card(n).name + " · " + why(n); b.appendChild(w);
      press(b, () => take(i), () => showCard(n));
      box.appendChild(b);
    });
    $("[data-draft]").hidden = false;
  }
  function take(i) {
    if (!R || R.S.phase !== "draft") return;
    const n = i >= 0 ? R.S.offer[i] : 0;
    if (E.pick(R.S, i).error) return;
    R.fresh = n; R.moves.push(["p", i]); R.left = LAYER_MS; saveRun(); sfx.tap();
    $("[data-draft]").hidden = true; paint(true); layerIntro();
  }
  $("[data-skip]").addEventListener("click", () => take(-1));

  /* ---------- the end: the server plays it all again and counts it ---------- */
  async function finishRun() {
    if (!R || R.finishing) return;
    R.finishing = true;
    const S = R.S, run = R;
    $("[data-draft]").hidden = true; $("[data-menusheet]").hidden = true;
    const cleared = E.cleared(S);
    $("[data-end-kick]").textContent = run.mode === "duel" ? "MIRROR DUEL" : S.broke || cleared >= E.LAYERS ? "YOU REACHED THE SOURCE" : "THE TRIP IS OVER";
    $("[data-share]").hidden = run.mode === "duel";
    $("[data-end-title]").textContent = cleared >= E.LAYERS ? `Layer ${cleared}` : cleared ? `${cleared} layer${cleared === 1 ? "" : "s"} cleared` : "Lost at the Threshold";
    $("[data-end-total]").textContent = fmt(S.total);
    $("[data-end-rows]").innerHTML = `<div><span>BEST CAST</span><b>${fmt(S.best)}</b></div><div><span>BEST HAND</span><b>${esc(S.bestHand || "—")}</b></div>`
      + `<div><span>MODE</span><b>${run.mode === "daily" ? "Daily Trip" : run.mode === "duel" ? "Mirror Duel" : "Free Run"}</b></div><div><span>DECK</span><b>${S.deck.length} beings</b></div>`;
    $("[data-end-rank]").textContent = "Counting your run…";
    const text = `I broke through ${cleared} layer${cleared === 1 ? "" : "s"} of the REALM with ${fmt(S.total)} points${run.mode === "daily" ? " on today's Daily Trip" : ""}. Beat that.\n\ndmt-realm.dev/breakthrough`;
    SHARE = { text, total: S.total, cleared, mode: run.mode, best: run.bestCast || null, deck: S.deck.slice(), rank: null };
    $("[data-end]").hidden = false;
    S.over ? sfx.lose() : sfx.win();
    let tries = 0;
    for (;;) {
      try {
        const d = await api("/api/bt/finish", { run: run.id, moves: run.moves });
        if (run.mode === "duel") { duelResult(d.result && d.result.duel); break; }
        const b = d.result && d.result.board, c = d.result && d.result.comp, cp = BOARD && BOARD.comp;
        if (SHARE) SHARE.rank = c && c.entered && !c.team ? (c.points ? `#${c.dayRank} in today's ${cp ? cp.prize : "SOL"} race` : `#${c.rank} in the ${cp ? cp.prize : "SOL"} competition`) : b && run.mode === "daily" ? `#${b.rank} on today's Daily Trip` : null;
        $("[data-end-rank]").textContent = b ? `${b.best ? "New best! " : ""}#${b.rank} of ${b.of} on the ${run.mode === "daily" ? "Daily Trip board" : "Free Run board this week"}.` : "Counted.";
        if (c) {
          const w = document.createElement("p"); w.className = "bt-win";
          w.innerHTML = c.team ? `<b>Team wallet:</b> your score shows on the league table, but the prize goes to the highest community wallet.`
            : c.entered && c.points ? `<b>Today's race:</b> you're <b>#${c.dayRank}</b> of ${c.dayOf}${c.dayPts ? ` (worth ${c.dayPts} points if it holds)` : ""}. <b>The week:</b> #${c.rank} with ${c.pts} points.`
            : c.entered ? `<b>${esc(cp ? cp.prize : "SOL")} competition:</b> you're <b>#${c.rank}</b> of ${c.of}${c.best ? " (your best this week)" : ""}.`
            : `This run isn't in the <b>${esc(cp ? cp.prize : "SOL")} competition</b>: connect a wallet in the menu <i>before</i> you play, and your Daily Trip scores count.`;
          $("[data-end-rank]").after(w);
        }
        break;
      } catch (e) {
        if ((e.data && (e.data.gone || e.data.result)) || e.status === 400) { $("[data-end-rank]").textContent = e.message; break; }
        if (++tries > 4) { $("[data-end-rank]").textContent = "Couldn't reach the realm to count this run."; break; }
        $("[data-end-rank]").textContent = "Reconnecting…"; await sleep(1500 * tries);
      }
    }
    if (run.mode !== "duel") upsell(run, S.total);
    store.set("run", null); R = null; loadBoard();
  }
  /* what the same run would have scored with more $DMT: the boost multiplies every cast's mult, so the
     total scales with it (an estimate: the same moves, the same cards) */
  function upsell(run, total) {
    if (!total) return;
    const being = !!(ME && ME.own && ME.own.length) ? E.BOOST_BEING : 0, cur = run.boost || 100;
    const next = E.BOOST_BANDS.map(([t, p]) => [t, 100 + being + p]).find(([t, b]) => b > cur && t >= 500e3) || E.BOOST_BANDS.map(([t, p]) => [t, 100 + being + p]).find(([, b]) => b > cur);
    if (!next) return;
    const [tokens, b] = next, would = Math.floor(total * b / cur), amt = tokens >= 1e6 ? tokens / 1e6 + "M" : tokens / 1e3 + "k";
    const el = document.createElement("div"); el.className = "bt-upsell bt-win";
    el.innerHTML = `<b>With ${amt} $DMT</b> this run would have scored about <b>${fmt(would)}</b> <i>(+${fmt(would - total)})</i>. Holders score ×${b / 100} on every cast.`
      + `<a href="https://pump.fun/coin/Bn7ga2URqhCaT23HfLRZNHhVBpxxhycVdUSQAVpYpump" target="_blank" rel="noopener">Get $DMT ›</a>`;
    const after = $("[data-end-rows]"); after.after(el);
  }
  /* ---------- share card: a picture of the run, for X ---------- */
  let SHARE = null;
  const loadImg = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  async function shareCard(d) {
    const W = 1600, H = 900, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    try { await Promise.all([document.fonts.load('700 80px "Pixelify Sans"'), document.fonts.load('700 80px "Space Grotesk"')]); } catch { /* system font */ }
    const P = '"Pixelify Sans", sans-serif', N = '"Space Grotesk", sans-serif';
    // the sky
    let gr = g.createRadialGradient(W * .5, H * .45, 40, W * .5, H * .45, W * .8);
    gr.addColorStop(0, "#3a1458"); gr.addColorStop(.55, "#14072a"); gr.addColorStop(1, "#05020c"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H * .45); g.fillStyle = "rgba(197,107,255,.09)";
    for (let i = 0; i < 30; i++) { g.rotate(Math.PI * 2 / 30); g.beginPath(); g.moveTo(0, 0); g.lineTo(-70, -1300); g.lineTo(70, -1300); g.fill(); }
    g.restore();
    const text = (t, x, y, size, color, o = {}) => { g.save(); g.font = `700 ${size}px ${o.f || P}`; g.textAlign = o.a || "center"; g.textBaseline = "middle"; if (o.sp) g.letterSpacing = o.sp + "px";
      const dd = o.d == null ? Math.max(3, size / 14) : o.d; if (dd) { g.fillStyle = "#000"; g.fillText(t, x + dd, y + dd); }
      if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 40; } g.fillStyle = color; g.fillText(t, x, y); g.restore(); };
    const logo = await loadImg("logo-bar.png");
    if (logo) { g.imageSmoothingEnabled = false; g.drawImage(logo, 60, 48, 56, 56); }
    text("REALM · BREAKTHROUGH", 132, 78, 30, "#f4efe4", { a: "left", sp: 6, d: 3 });
    text(d.mode === "daily" ? "DAILY TRIP" : "FREE RUN", W - 60, 78, 30, "#5cf0ff", { a: "right", sp: 6, d: 3 });
    // the score
    text(d.cleared >= 8 ? "I REACHED THE SOURCE" : `I BROKE THROUGH ${d.cleared} LAYER${d.cleared === 1 ? "" : "S"}`, W / 2, 190, 44, "#5cf0ff", { f: N, sp: 6, glow: "rgba(92,240,255,.6)" });
    let size = 200; g.font = `700 ${size}px ${N}`; while (g.measureText(fmt(d.total)).width > W - 160 && size > 80) { size -= 8; g.font = `700 ${size}px ${N}`; }
    text(fmt(d.total), W / 2, 330, size, "#fff1c2", { f: N, d: 12, glow: "rgba(255,200,80,.7)" });
    if (d.rank) text(d.rank.toUpperCase(), W / 2, 450, 34, "#e3ba5c", { f: N, sp: 3 });
    // the best hand and the beings that scored it
    const ns = (d.best && d.best.ns.length ? d.best.ns : d.deck.slice().sort((a, b) => card(b).chips - card(a).chips)).slice(0, 5);
    const cs = 170, gap = 26, x0 = (W - (ns.length * cs + (ns.length - 1) * gap)) / 2, y0 = 520;
    const imgs = await Promise.all(ns.map(n => loadImg(`/thumbs/${n}.webp`)));
    ns.forEach((n, i) => {
      const x = x0 + i * (cs + gap), c = card(n);
      g.fillStyle = "#000"; g.fillRect(x + 10, y0 + 10, cs, cs);
      g.fillStyle = TIER[c.tier]; g.fillRect(x - 5, y0 - 5, cs + 10, cs + 10);
      if (imgs[i]) g.drawImage(imgs[i], x, y0, cs, cs); else { g.fillStyle = "#07040f"; g.fillRect(x, y0, cs, cs); }
      g.beginPath(); g.arc(x + 22, y0 + 22, 16, 0, Math.PI * 2); g.fillStyle = AURA_C[c.aura] || "#fff"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#000"; g.stroke();
    });
    if (d.best) text(`BEST HAND: ${d.best.name.toUpperCase()} · ${fmt(d.best.score)}`, W / 2, y0 + cs + 52, 30, "#f4efe4", { f: N, sp: 2 });
    // the call
    g.fillStyle = "#e3ba5c"; const bw = 760, bx = (W - bw) / 2, by = H - 92; g.fillRect(bx, by, bw, 62);
    text("CAN YOU BEAT IT?  dmt-realm.dev/breakthrough", W / 2, by + 32, 28, "#140a02", { d: 0, sp: 1 });
    return new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.92));
  }
  async function share() {
    if (!SHARE) return;
    const btn = $("[data-share]"), label = btn.textContent; btn.textContent = "Making your card…"; btn.disabled = true;
    try {
      const blob = await shareCard(SHARE), file = new File([blob], "breakthrough.jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: SHARE.text }); }
        catch (e) { if (e && e.name !== "AbortError") showCardSheet(blob); }
      } else showCardSheet(blob);
    } catch { window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(SHARE.text), "_blank", "noopener"); }
    btn.textContent = label; btn.disabled = false;
  }
  // where the phone can't share a picture: show it to save, with the post ready on X
  function showCardSheet(blob) {
    const url = URL.createObjectURL(blob);
    $("[data-cardimg]").src = url; $("[data-cardsave]").href = url;
    $("[data-cardpost]").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(SHARE.text);
    $("[data-sharesheet]").hidden = false;
  }
  $("[data-share]").addEventListener("click", share);
  $("[data-share-close]").addEventListener("click", () => { $("[data-sharesheet]").hidden = true; });

  const clearWin = () => $$(".bt-win").forEach(e => e.remove());
  $("[data-again]").addEventListener("click", () => { clearWin(); const m = $("[data-again]").dataset.mode || "daily"; $("[data-end]").hidden = true; startRun(m); });
  $("[data-lobby]").addEventListener("click", () => { clearWin(); $("[data-end]").hidden = true; show("lobby"); paintLobby(); });

  /* ---------- Mirror Duel: two players, the same deck and luck, three layers each ---------- */
  const DUEL_LAYERS = 3;
  const QS = new URLSearchParams(location.search);
  const DUEL_ID = /^[a-f0-9]{10}$/.test(QS.get("duel") || "") ? QS.get("duel") : null;
  const DUEL_ON = location.pathname === "/mirror" || !!DUEL_ID || QS.has("mirror");
  if (DUEL_ON) $("[data-play=duel]").hidden = false;
  const duelLink = id => location.origin + "/mirror?duel=" + id;
  function vsRows(v) { return '<div class="vs">' + v.players.map(p => `<span>${esc(p.name)}${p.you ? " (you)" : ""}</span><b>${fmt(p.total)}</b>`).join("") + "</div>"; }
  function duelResult(v) {
    $("[data-end-rank]").textContent = "";
    const box = document.createElement("div"); box.className = "bt-duelres bt-win";
    if (!v) { box.textContent = "Counted."; $("[data-end-rank]").after(box); return; }
    if (v.done) {
      const me = v.players.findIndex(p => p.you), won = v.winner === me, tie = v.winner == null;
      box.innerHTML = `<b class="${tie ? "" : won ? "win" : "lose"}">${tie ? "A DRAW!" : won ? "YOU WIN THE DUEL!" : "YOU LOST THIS ONE"}</b>${vsRows(v)}Rematch: start a new duel and send the link back.`;
      won ? sfx.win() : sfx.lose();
    } else {
      box.innerHTML = `<b>Your score is in.</b> Now send this duel to someone: they get the same deck and the same luck, and the higher total wins.
        <button class="bt-btn cast wide" data-duelsend style="margin-top:10px">Send the challenge</button><small style="display:block;margin-top:6px;color:var(--dim);word-break:break-all">${esc(duelLink(v.id))}</small>`;
      box.querySelector("[data-duelsend]").onclick = () => sendDuel(v);
    }
    $("[data-end-rank]").after(box);
    $("[data-again]").dataset.mode = "duel";
  }
  async function sendDuel(v) {
    const me = v.players.find(p => p.you), url = duelLink(v.id);
    const text = `I scored ${fmt(me ? me.total : 0)} in a REALM Mirror Duel. Same deck, same luck. Beat me:`;
    try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text + " " + url); alert("Challenge link copied. Paste it to your opponent."); } catch { prompt("Copy this link and send it:", url); }
  }
  // opened from a challenge link: who sent it, and the score to beat
  async function paintDuelBox() {
    const box = $("[data-duelbox]"); if (!DUEL_ID) return;
    box.hidden = false; box.innerHTML = "<p>Reading the duel…</p>";
    try {
      const s = session(), q = "id=" + DUEL_ID + (PID && !s ? "&pid=" + PID : "");
      const { duel: v } = await api("/api/bt/duel?" + q, null, s && s.token);
      const mine = v.players.find(p => p.you);
      if (v.done || mine) {
        box.innerHTML = `<h3>MIRROR DUEL</h3>${v.done ? vsRows(v) + `<p>${v.winner == null ? "A draw." : esc(v.players[v.winner].name) + " won."}</p>` : `<p>You've played this one: <b>${fmt(mine.total)}</b>. Waiting for your opponent.</p>`}
          <button class="bt-btn cast wide" data-duelnew>Start a new duel</button>`;
        box.querySelector("[data-duelnew]").onclick = () => { $("[data-again]").dataset.mode = "duel"; startRun("duel"); };
        return;
      }
      const opp = v.players[0];
      box.innerHTML = `<h3>YOU'VE BEEN CHALLENGED</h3>${opp ? `<p><b>${esc(opp.name)}</b> scored <b>${fmt(opp.total)}</b>.</p>` : ""}
        <p>Same deck, same luck, ${v.layers} layers. Highest total wins.</p><button class="bt-btn cast wide" data-duelgo>Play the duel</button>`;
      box.querySelector("[data-duelgo]").onclick = () => { $("[data-again]").dataset.mode = "duel"; startRun("duel", DUEL_ID); };
    } catch (e) { box.innerHTML = `<p>${esc(e.message || "That duel couldn't be found.")}</p>`; }
  }

  /* ---------- menu, modes, sheets ---------- */
  $("[data-menu]").addEventListener("click", () => { $("[data-menusheet]").hidden = false; sfx.tap(); });
  $("[data-resume-game]").addEventListener("click", () => { $("[data-menusheet]").hidden = true; });
  $("[data-endrun]").addEventListener("click", () => { if (R && confirm("End this run now? Your score so far is counted.")) finishRun(); });
  $$("[data-play]").forEach(b => b.addEventListener("click", () => {
    $("[data-again]").dataset.mode = b.dataset.play;
    if (b.dataset.play === "daily") startRun("daily"); else if (b.dataset.play === "duel") startRun("duel"); else startRun("free");
  }));
  $("[data-resume]").addEventListener("click", resumeRun);
  async function openSummon() {
    sfx.tap(); $("[data-summonsheet]").hidden = false;
    const box = $("[data-summons]"); box.innerHTML = '<p class="bt-sub">Reading the realm…</p>';
    try {
      await loadCards();
      const d = await api("/api/bt/summons"), mine = (ME && ME.own) || [];
      const list = d.beings.filter(b => !mine.includes(b.n));
      if (!list.length) { box.innerHTML = '<p class="bt-sub">No beings to summon yet.</p>'; return; }
      box.innerHTML = "";
      for (const b of list) {
        const btn = document.createElement("button"); btn.appendChild(cardEl(b.n));
        const s = document.createElement("small"); s.textContent = `${b.owner}${b.count ? " · ×" + b.count : ""}`; btn.appendChild(s);
        btn.addEventListener("click", () => { $("[data-summonsheet]").hidden = true; startRun("free", b.n); });
        box.appendChild(btn);
      }
    } catch { box.innerHTML = '<p class="bt-sub">Couldn\'t read the realm just now. You can still play without one.</p>'; }
  }
  $("[data-summon-skip]").addEventListener("click", () => { $("[data-summonsheet]").hidden = true; startRun("free"); });
  $("[data-summon-close]").addEventListener("click", () => { $("[data-summonsheet]").hidden = true; });

  let tab = "daily";
  function paintBoard() {
    const box = $("[data-board]"), v = BOARD && BOARD[tab];
    if (tab === "comp" && v) {
      $$("[data-btab]").forEach(b => b.classList.toggle("on", b.dataset.btab === tab));
      const info = `<div class="bt-compinfo"><b>${esc(v.title)}: ${esc(v.prize)} to the winner.</b> ${esc(v.rules || "")}</div>`;
      const rows = v.top.length ? `<div class="bt-rows">${v.top.map(r => `<div class="${r.you ? "you" : ""}"${r.team ? ' style="opacity:.6"' : ""}><i>${r.rank || "–"}</i><span>${esc(r.wallet || r.name)}${r.team ? "<small>team · not eligible</small>" : ""}<small>${r.points != null ? "best run " + fmt(r.total) : r.cleared + " layer" + (r.cleared === 1 ? "" : "s")}</small></span><b>${r.points != null ? r.points + " pts" : fmt(r.total)}</b></div>`).join("")}</div>`
        : '<p class="bt-sub">No entries yet. Sign in with a wallet and play the Daily Trip to be first.</p>';
      box.innerHTML = info + rows + (v.you && v.you.rank > 10 ? `<p class="bt-sub">You: #${v.you.rank} with ${fmt(v.you.total)}</p>` : "") + '<a class="bt-ghost wide bt-league" href="/league">Full league table ›</a>';
      return;
    }
    $$("[data-btab]").forEach(b => b.classList.toggle("on", b.dataset.btab === tab));
    if (!v) { box.innerHTML = '<p class="bt-sub">Couldn\'t load the board.</p>'; return; }
    if (!v.top.length) { box.innerHTML = `<p class="bt-sub">Nobody on the board yet ${tab === "daily" ? "today" : "this week"}. Be the first.</p>`; return; }
    box.innerHTML = `<div class="bt-rows">${v.top.map((r, i) => `<div class="${r.you ? "you" : ""}"><i>${i + 1}</i><span>${esc(r.name)}<small>${r.cleared} layer${r.cleared === 1 ? "" : "s"}</small></span><b>${fmt(r.total)}</b></div>`).join("")}</div>`
      + (v.you && v.you.rank > 20 ? `<p class="bt-sub">You: #${v.you.rank} with ${fmt(v.you.total)}</p>` : "");
  }
  $("[data-board-open]").addEventListener("click", async () => { $("[data-boardsheet]").hidden = false; paintBoard(); await loadBoard(); paintBoard(); });
  $$("[data-btab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.btab; paintBoard(); }));
  $("[data-board-close]").addEventListener("click", () => { $("[data-boardsheet]").hidden = true; });

  /* your whole deck: what's still to draw, what's in your hand, what's been played this layer */
  $("[data-deckbtn]").addEventListener("click", () => {
    if (!R) return;
    const S = R.S, box = $("[data-decklist]"); box.innerHTML = "";
    const where = n => S.hand.includes(n) ? "hand" : S.used.includes(n) ? "used" : "draw";
    const order = { hand: 0, draw: 1, used: 2 };
    S.deck.slice().sort((a, b) => order[where(a)] - order[where(b)] || card(b).chips - card(a).chips).forEach(n => {
      const w = where(n), d = document.createElement("div"); d.className = "bt-deckitem " + w;
      const el = cardEl(n, { own: R.own.includes(n) }); if (n === R.fresh) el.classList.add("fresh");
      d.appendChild(el);
      const s = document.createElement("small"); s.textContent = w === "hand" ? "In hand" : w === "used" ? "Played" : "To draw"; d.appendChild(s);
      press(d, () => {}, () => showCard(n));
      box.appendChild(d);
    });
    $("[data-deck-sub]").textContent = `${S.deck.length} beings · ${S.draw.length} still to draw this layer. Every layer starts with your whole deck shuffled.`;
    $("[data-decksheet]").hidden = false; sfx.tap();
  });
  $("[data-deck-close]").addEventListener("click", () => { $("[data-decksheet]").hidden = true; });

  function fillHow() {
    $("[data-hands]").innerHTML = Object.values(E.HANDS).sort((a, b) => a.rank - b.rank).map(h => {
      const ex = { "Spark": "no match: your strongest card", "Twin Auras": "2 of one Aura", "Double Twins": "2 + 2", "Triad": "3 of one Aura", "Spectrum": "all 5 Auras", "Full Vision": "3 + 2", "Quad": "4 of one Aura", "Ascension": "5 of one Aura" }[h.name];
      return `<div><span><b>${h.name}</b><small>${ex}</small></span><em><span class="c">${h.chips}</span> × <span class="m">${h.mult}</span></em></div>`;
    }).join("");
    const rows = [["Geometry", "Each pair sharing a Geometry", "+2 mult", "m"], ["Colourway", "3+ scoring, one Colourway", "×2", "x"]];
    for (const [k, t] of Object.entries(TRAIT)) rows.push([icon(k) + " " + esc(t.name), Object.keys(t).filter(v => v !== "name").map(v => v + ": " + t[v]).join(" · "), "", ""]);
    rows.push(["Entity / God / Source", "+10 mult / ×2 / ×5 (and any Aura)", "", ""]);
    $("[data-traits]").innerHTML = rows.map(([a, b, c, cl]) => `<div><span><b class="ti">${a}</b><small>${esc(b)}</small></span><em class="${cl}">${esc(c)}</em></div>`).join("");
  }
  fillHow();
  const openHow = () => { $("[data-howsheet]").hidden = false; sfx.tap(); };
  $("[data-how]").addEventListener("click", openHow);
  $("[data-how2]").addEventListener("click", () => { $("[data-menusheet]").hidden = true; openHow(); });
  $("[data-howclose]").addEventListener("click", () => { $("[data-howsheet]").hidden = true; });

  /* ---------- first game: a nudge ---------- */
  function coach() {
    const c = $("[data-coach]");
    c.innerHTML = "Tap cards with the <b>same coloured gem</b> (their Aura), then <b>CAST</b>. More of one Aura = a bigger hand. Press and hold a card to read its powers.";
    c.hidden = false;
  }
  function coachDone() { if (!$("[data-coach]").hidden) { $("[data-coach]").hidden = true; store.set("coached", true); } }

  /* no zoom on the game. Double-tap zoom is off through touch-action (bt.css); pinches are stopped here.
     And if the phone zooms anyway, it is put straight back to normal size. */
  // ...but if the phone has zoomed in anyway, a pinch is let through, so it can always be pinched back out
  const zoomed = () => !!(window.visualViewport && visualViewport.scale > 1.01);
  document.addEventListener("gesturestart", e => { if (!zoomed()) e.preventDefault(); });
  document.addEventListener("gesturechange", e => { if (!zoomed()) e.preventDefault(); });
  document.addEventListener("touchmove", e => { if (e.touches.length > 1 && !zoomed()) e.preventDefault(); }, { passive: false });
  document.addEventListener("touchstart", e => { if (e.touches.length > 1 && !zoomed()) e.preventDefault(); }, { passive: false });
  /* Some phone browsers (in-app ones especially) still zoom on a quick second tap. So a tap that comes
     right after another has its default (the zoom) cancelled, and its click is then fired by hand, so
     the button still works: no tap is ever lost. Cards listen to pointer events, which aren't affected. */
  let lastEnd = 0;
  document.addEventListener("touchend", e => {
    const now = Date.now(), quick = now - lastEnd < 500; lastEnd = now;
    if (!quick || e.touches.length || e.changedTouches.length !== 1) return;
    e.preventDefault();
    const t = e.target && e.target.closest ? e.target.closest("button, a, [data-cardsheet]") || e.target : e.target;
    if (t && typeof t.click === "function") t.click();
  }, { passive: false });
  const vp = document.querySelector('meta[name=viewport]'), VP = vp && vp.content;
  // put a zoom straight back: nudge the viewport's scale settings so the browser re-applies them, then restore
  let unzooming = false;
  function unzoom() {
    if (!vp || unzooming || !zoomed()) return;
    unzooming = true;
    vp.content = "width=device-width, initial-scale=1.0001, minimum-scale=1, maximum-scale=1.0001, viewport-fit=cover, user-scalable=no";
    setTimeout(() => { vp.content = VP; window.scrollTo(0, 0); unzooming = false; }, 120);
  }
  if (window.visualViewport && vp) { visualViewport.addEventListener("resize", unzoom); visualViewport.addEventListener("scroll", unzoom); }
  document.addEventListener("touchend", () => setTimeout(unzoom, 350), { passive: true });
  window.addEventListener("resize", () => { if (R && !$("[data-screen=game]").hidden) renderHand(false); });
  loadCards().then(paintLobby).catch(() => {});
  paintLobby(); loadMe().then(paintDuelBox); loadBoard();
  if (new URLSearchParams(location.search).has("debug")) window.__bt = () => R;
})();
