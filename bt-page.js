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
    const tr = Object.keys(c.x || {}).map(k => `<i title="${TRAIT[k].name}">${GLYPH[k]}</i>`).join("");
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
  const auth = () => { const s = session(); return s ? { token: s.token } : { pid: PID }; };
  async function loadMe() {
    try { ME = await api("/api/bt/me", auth()); if (ME.pid) { PID = ME.pid; store.set("pid", PID); } }
    catch (e) { if (e.status === 401) { signOut(); return loadMe(); } }
    paintLobby();
  }
  async function loadBoard() {
    const s = session();
    try { BOARD = await api("/api/bt/board" + (PID ? "?pid=" + PID : ""), null, s && s.token); } catch { BOARD = null; }
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
    const ph = $("[data-w-phantom]"); ph.hidden = false; ph.href = "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin);
  }, 1200);

  /* ---------- the lobby ---------- */
  function show(name) { $$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; }); window.scrollTo(0, 0); }
  function paintFan() {
    const fan = $("[data-fan]"); if (!CARDS || fan.childElementCount) return;
    [29, 193, 1111, 762, 569].forEach((n, i) => { const el = cardEl(n); el.style.transform = `translateX(-50%) rotate(${(i - 2) * 11}deg) translateY(${Math.abs(i - 2) * 8}px)`; el.style.zIndex = i === 2 ? 5 : 5 - Math.abs(i - 2); fan.appendChild(el); });
  }
  function paintLobby() {
    paintFan();
    const s = session();
    $("[data-w-connect]").hidden = !!s; $("[data-w-off]").hidden = !s;
    if (s) { $("[data-w-phantom]").hidden = true; }
    const own = ME && ME.own;
    $("[data-w-who]").innerHTML = s
      ? `Signed in as <b>${esc(s.wallet.slice(0, 4) + "…" + s.wallet.slice(-4))}</b>. ${own && own.length ? `<b>${own.length}</b> of your beings join every Free Run and score +50%.` : "No beings in this wallet yet: you'll play with borrowed ones."}${ME && ME.summonedToday ? ` Your beings were summoned <b>${ME.summonedToday}</b> times today.` : ""}`
      : "Playing as a guest. Holders: your beings join your Free Run deck and score +50%.";
    $("[data-free-note]").textContent = own && own.length ? `Your ${own.length} being${own.length === 1 ? "" : "s"} + a fresh deck` : "A fresh deck every time";
    const d = BOARD && BOARD.daily;
    $("[data-daily-note]").textContent = d && d.you ? `Your best today: ${fmt(d.you.total)} · #${d.you.rank} of ${d.players}` : d && d.players ? `${d.players} player${d.players === 1 ? "" : "s"} today · best run counts` : "Best run counts";
    $("[data-resume]").hidden = !store.get("run", null);
  }

  /* ---------- the run ---------- */
  let R = null;
  const defOf = r => ({ seed: r.seed, deck: r.deck, own: r.own, cards: card });
  const saveRun = () => store.set("run", R ? { id: R.id, mode: R.mode, seed: R.seed, deck: R.deck, own: R.own, moves: R.moves, day: R.day } : null);
  async function startRun(mode, summon) {
    sfx.tap();
    const btns = $$("[data-play]"); btns.forEach(b => (b.disabled = true));
    try {
      await loadCards();
      const d = await api("/api/bt/start", { ...auth(), mode, summon: summon || undefined });
      R = { id: d.run, mode: d.mode, day: d.day, seed: d.seed, deck: d.deck, own: d.own || [], moves: [], summoned: d.summoned };
      R.S = E.createRun(defOf(R)); R.sel = []; R.sort = store.get("sort", "aura");
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
    R = { ...r, S: out.S, sel: [], sort: store.get("sort", "aura") };
    show("game"); paint(true);
    if (R.S.over) return finishRun();
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
  function paint(fresh) {
    const S = R.S, target = E.targetOf(S.layer);
    $("[data-layer-n]").textContent = S.layer < E.LAYERS ? `LAYER ${S.layer + 1} OF ${E.LAYERS}` : `BEYOND · LAYER ${S.layer + 1}`;
    $("[data-layer-name]").textContent = S.layer < E.LAYERS ? E.LAYER_NAMES[S.layer] : "Past the Source";
    $("[data-score]").textContent = fmt(S.score); $("[data-target]").textContent = fmt(target);
    const p = Math.min(1, S.score / target); $("[data-bar]").style.width = (p * 100).toFixed(1) + "%"; $(".bt-bar").classList.toggle("full", p >= 1);
    $("[data-casts]").textContent = "●".repeat(S.casts) + "○".repeat(Math.max(0, E.CASTS - S.casts));
    $("[data-discards]").textContent = "●".repeat(S.discards) + "○".repeat(Math.max(0, E.DISCARDS - S.discards));
    $("[data-deck]").textContent = S.draw.length;
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
        if (s.k === "chips") { float("+" + fmt(s.add), s.label, x, y, "#5cf0ff"); bump(chipsEl); sfx.step(++k); }
        else if (s.k === "mult" || s.k === "geo") { float("+" + s.add + " mult", s.label, x, y, "#ff9ce0"); bump(multEl); sfx.mult(++k); }
        else if (s.k === "x") { float("×" + s.x, s.label, x, y, "#ffd35c"); bump(multEl); sfx.x(); const f = $("[data-flash]"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
        else if (s.k === "again") { float("AGAIN!", s.label, x, y, "#8dff5c"); sfx.step(++k); }
        else if (s.k === "ufo") { float("+" + s.draws + " cards", "Abducted", x, y, "#8dff5c"); sfx.step(++k); }
      }
      await sleep(delay); delay = Math.max(120, delay * 0.88);
    }
    $$(".bt-played .bt-card.hit").forEach(e => e.classList.remove("hit"));
    // chips x mult: the total slams in
    const tot = document.createElement("div"); tot.className = "bt-total"; tot.textContent = fmt(ev.score); st.appendChild(tot); sfx.total();
    const before = S.score;
    const old = S.hand.slice();
    const done = E.cast(S, order);
    if (done.error) { R.busy = false; tot.remove(); played.innerHTML = ""; R.sel = []; paint(false); return; }
    R.moves.push(["c", order]); R.sel = []; saveRun();
    // the score counts up into the bar
    const t0 = performance.now(), dur = 650, target = E.targetOf(S.layer);
    await new Promise(res => { const tick = () => { const p = Math.min(1, (performance.now() - t0) / dur); const v = before + (S.score - before) * p; $("[data-score]").textContent = fmt(v); $("[data-bar]").style.width = Math.min(100, v / target * 100).toFixed(1) + "%"; p < 1 ? requestAnimationFrame(tick) : res(); }; tick(); });
    await sleep(500);
    tot.remove(); played.innerHTML = ""; hname.innerHTML = ""; chipsEl.textContent = "0"; multEl.textContent = "0"; st.classList.remove("hot");
    R.busy = false;
    const fresh = S.hand.filter(n => !old.includes(n));
    paint(false); renderHand(false, fresh); if (fresh.length) sfx.deal();
    if (S.phase === "draft") { await burst(S.layer === E.LAYERS - 1 ? "THE SOURCE!" : "BREAKTHROUGH!"); openDraft(); }
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
    const S = R.S, b = document.createElement("div"); b.className = "bt-burst";
    b.innerHTML = `<b style="font-size:clamp(1.6rem,8vw,2.4rem);text-align:center">LAYER ${S.layer + 1}<br><span style="font-size:.6em;color:var(--chips)">${esc(S.layer < E.LAYERS ? E.LAYER_NAMES[S.layer] : "Past the Source")}</span></b>`;
    document.body.appendChild(b); await sleep(1000); b.remove();
  }

  /* ---------- the draft: one new being after each breakthrough ---------- */
  function why(n) { const c = card(n), p = powers(n).filter(([k]) => !["Aura", "Chips", "Colourway"].includes(k)); return p.length ? p[0][1] : c.chips + " chips"; }
  function openDraft() {
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
    if (!R || R.S.phase !== "draft" || E.pick(R.S, i).error) return;
    R.moves.push(["p", i]); saveRun(); sfx.tap();
    $("[data-draft]").hidden = true; paint(true); layerIntro();
  }
  $("[data-skip]").addEventListener("click", () => take(-1));

  /* ---------- the end: the server plays it all again and counts it ---------- */
  async function finishRun() {
    const S = R.S, run = R;
    $("[data-draft]").hidden = true; $("[data-menusheet]").hidden = true;
    const cleared = E.cleared(S);
    $("[data-end-kick]").textContent = S.broke || cleared >= E.LAYERS ? "YOU REACHED THE SOURCE" : "THE TRIP IS OVER";
    $("[data-end-title]").textContent = cleared >= E.LAYERS ? `Layer ${cleared}` : cleared ? `${cleared} layer${cleared === 1 ? "" : "s"} cleared` : "Lost at the Threshold";
    $("[data-end-total]").textContent = fmt(S.total);
    $("[data-end-rows]").innerHTML = `<div><span>BEST CAST</span><b>${fmt(S.best)}</b></div><div><span>BEST HAND</span><b>${esc(S.bestHand || "—")}</b></div>`
      + `<div><span>MODE</span><b>${run.mode === "daily" ? "Daily Trip" : "Free Run"}</b></div><div><span>DECK</span><b>${S.deck.length} beings</b></div>`;
    $("[data-end-rank]").textContent = "Counting your run…";
    const text = `I broke through ${cleared} layer${cleared === 1 ? "" : "s"} of the REALM with ${fmt(S.total)} points${run.mode === "daily" ? " on today's Daily Trip" : ""}. Beat that.\n\ndmt-realm.dev/breakthrough`;
    $("[data-share]").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
    $("[data-end]").hidden = false;
    S.over ? sfx.lose() : sfx.win();
    let tries = 0;
    for (;;) {
      try {
        const d = await api("/api/bt/finish", { run: run.id, moves: run.moves });
        const b = d.result && d.result.board;
        $("[data-end-rank]").textContent = b ? `${b.best ? "New best! " : ""}#${b.rank} of ${b.of} on the ${run.mode === "daily" ? "Daily Trip board" : "Free Run board this week"}.` : "Counted.";
        break;
      } catch (e) {
        if ((e.data && (e.data.gone || e.data.result)) || e.status === 400) { $("[data-end-rank]").textContent = e.message; break; }
        if (++tries > 4) { $("[data-end-rank]").textContent = "Couldn't reach the realm to count this run."; break; }
        $("[data-end-rank]").textContent = "Reconnecting…"; await sleep(1500 * tries);
      }
    }
    store.set("run", null); R = null; loadBoard();
  }
  $("[data-again]").addEventListener("click", () => { const m = $("[data-again]").dataset.mode || "daily"; $("[data-end]").hidden = true; startRun(m); });
  $("[data-lobby]").addEventListener("click", () => { $("[data-end]").hidden = true; show("lobby"); paintLobby(); });

  /* ---------- menu, modes, sheets ---------- */
  $("[data-menu]").addEventListener("click", () => { $("[data-menusheet]").hidden = false; sfx.tap(); });
  $("[data-resume-game]").addEventListener("click", () => { $("[data-menusheet]").hidden = true; });
  $("[data-endrun]").addEventListener("click", () => { if (R && confirm("End this run now? Your score so far is counted.")) finishRun(); });
  $$("[data-play]").forEach(b => b.addEventListener("click", () => {
    $("[data-again]").dataset.mode = b.dataset.play;
    if (b.dataset.play === "daily") startRun("daily"); else openSummon();
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
    $$("[data-btab]").forEach(b => b.classList.toggle("on", b.dataset.btab === tab));
    if (!v) { box.innerHTML = '<p class="bt-sub">Couldn\'t load the board.</p>'; return; }
    if (!v.top.length) { box.innerHTML = `<p class="bt-sub">Nobody on the board yet ${tab === "daily" ? "today" : "this week"}. Be the first.</p>`; return; }
    box.innerHTML = `<div class="bt-rows">${v.top.map((r, i) => `<div class="${r.you ? "you" : ""}"><i>${i + 1}</i><span>${esc(r.name)}${r.holder ? ' <small>holder</small>' : ""}<small>${r.cleared} layer${r.cleared === 1 ? "" : "s"}</small></span><b>${fmt(r.total)}</b></div>`).join("")}</div>`
      + (v.you && v.you.rank > 20 ? `<p class="bt-sub">You: #${v.you.rank} with ${fmt(v.you.total)}</p>` : "");
  }
  $("[data-board-open]").addEventListener("click", async () => { $("[data-boardsheet]").hidden = false; paintBoard(); await loadBoard(); paintBoard(); });
  $$("[data-btab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.btab; paintBoard(); }));
  $("[data-board-close]").addEventListener("click", () => { $("[data-boardsheet]").hidden = true; });

  function fillHow() {
    $("[data-hands]").innerHTML = Object.values(E.HANDS).sort((a, b) => a.rank - b.rank).map(h => {
      const ex = { "Spark": "no match: your strongest card", "Twin Auras": "2 of one Aura", "Double Twins": "2 + 2", "Triad": "3 of one Aura", "Spectrum": "all 5 Auras", "Full Vision": "3 + 2", "Quad": "4 of one Aura", "Ascension": "5 of one Aura" }[h.name];
      return `<div><span><b>${h.name}</b><small>${ex}</small></span><em><span class="c">${h.chips}</span> × <span class="m">${h.mult}</span></em></div>`;
    }).join("");
    const rows = [["Geometry", "Each pair sharing a Geometry", "+2 mult", "m"], ["Colourway", "3+ scoring, one Colourway", "×2", "x"]];
    for (const [k, t] of Object.entries(TRAIT)) rows.push([GLYPH[k] + " " + t.name, Object.keys(t).filter(v => v !== "name").map(v => v + ": " + t[v]).join(" · "), "", ""]);
    rows.push(["Entity / God / Source", "+10 mult / ×2 / ×5 (and any Aura)", "", ""]);
    $("[data-traits]").innerHTML = rows.map(([a, b, c, cl]) => `<div><span><b>${esc(a)}</b><small>${esc(b)}</small></span><em class="${cl}">${esc(c)}</em></div>`).join("");
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
  document.addEventListener("gesturestart", e => e.preventDefault());
  document.addEventListener("gesturechange", e => e.preventDefault());
  document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener("touchstart", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  /* Some phone browsers (in-app ones especially) still zoom on a quick second tap. So a tap that comes
     right after another has its default (the zoom) cancelled, and its click is then fired by hand, so
     the button still works: no tap is ever lost. Cards listen to pointer events, which aren't affected. */
  let lastEnd = 0;
  document.addEventListener("touchend", e => {
    const now = Date.now(), quick = now - lastEnd < 400; lastEnd = now;
    if (!quick || e.touches.length || e.changedTouches.length !== 1) return;
    e.preventDefault();
    const t = e.target && e.target.closest ? e.target.closest("button, a, [data-cardsheet]") || e.target : e.target;
    if (t && typeof t.click === "function") t.click();
  }, { passive: false });
  const vp = document.querySelector('meta[name=viewport]'), VP = vp && vp.content;
  if (window.visualViewport && vp) visualViewport.addEventListener("resize", () => {
    if (visualViewport.scale > 1.01) { vp.content = VP.replace("maximum-scale=1", "maximum-scale=1.01"); setTimeout(() => { vp.content = VP; window.scrollTo(0, 0); }, 60); }
  });
  window.addEventListener("resize", () => { if (R && !$("[data-screen=game]").hidden) renderHand(false); });
  loadCards().then(paintLobby).catch(() => {});
  paintLobby(); loadMe(); loadBoard();
  if (new URLSearchParams(location.search).has("debug")) window.__bt = () => R;
})();
