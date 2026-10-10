/* ============================================================
   REALM Cards — the page.
   The server decides everything; this page shows the table, sends your
   moves and animates what comes back. Decks live on this device.
   ============================================================ */
(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("realm-rc-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("realm-rc-" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const ESS = ["magic", "spirit", "knowledge", "light", "dark"];
  const ESS_NAME = { magic: "Magic", spirit: "Spirit", knowledge: "Knowledge", light: "Light", dark: "Dark" };
  const TYPE_NAME = { rite: "Rite", ritual: "Ritual", relic: "Relic" };
  const dot = e => `<i class="rc-dot" style="--c:var(--${e})"></i>`;
  const api = async (url, body) => {
    const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    let d = {}; try { d = await r.json(); } catch { /* not json */ }
    if (!r.ok || d.error) { const e = new Error(d.error || "The realm didn't answer. Check your connection."); e.status = r.status; e.data = d; throw e; }
    return d;
  };

  /* ---------- sound: small blips, made here ---------- */
  let muted = store.get("muted", false), AC = null;
  function sfx(kind) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const T = { tap: [520, .04, "square", .03], play: [330, .12, "triangle", .07], hit: [140, .12, "sawtooth", .06], die: [90, .25, "square", .05], win: [660, .4, "triangle", .08], lose: [110, .5, "triangle", .07], turn: [440, .1, "sine", .05] }[kind] || [440, .05, "sine", .03];
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = T[2]; o.frequency.setValueAtTime(T[0], AC.currentTime);
      if (kind === "win") o.frequency.linearRampToValueAtTime(T[0] * 1.5, AC.currentTime + T[1]);
      if (kind === "hit" || kind === "die" || kind === "lose") o.frequency.exponentialRampToValueAtTime(T[0] * .5, AC.currentTime + T[1]);
      g.gain.setValueAtTime(T[3], AC.currentTime); g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + T[1]);
      o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + T[1] + .02);
    } catch { /* no audio */ }
  }
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* none */ } };
  function paintMute() { $$("[data-mute] use").forEach(u => u.setAttribute("href", muted ? "#i-mute" : "#i-sound")); }
  $$("[data-mute]").forEach(b => b.addEventListener("click", () => { muted = !muted; store.set("muted", muted); paintMute(); sfx("tap"); }));
  paintMute();

  /* ---------- the cards ---------- */
  let POOL = null, BYID = {};
  async function loadPool() {
    if (POOL) return POOL;
    POOL = await api("/api/rc/cards");
    for (const c of POOL.cards) BYID[c.id] = c;
    return POOL;
  }
  const GLYPH = {
    dmg: '<path d="M58 8 28 54h20L38 92l36-48H54z"/>',
    buff: '<path d="M50 14 80 46H62v38H38V46H20z"/>',
    gain: '<path d="M50 86 16 52a18 18 0 0 1 34-24 18 18 0 0 1 34 24z"/>',
    draw: '<path d="M18 24h28c4 0 4 4 4 4v56s0-4-4-4H18zM82 24H54c-4 0-4 4-4 4v56s0-4 4-4h28z"/>',
    summon: '<circle cx="50" cy="34" r="14"/><path d="M24 86c0-20 12-32 26-32s26 12 26 32z"/>',
    destroy: '<path d="M50 12a30 30 0 0 0-30 30c0 12 6 18 10 22v16h40V64c4-4 10-10 10-22a30 30 0 0 0-30-30zM38 38a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm24 0a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/>',
    freeze: '<path d="M46 8h8v20l12-12 6 6-18 18v8h8l18-18 6 6-12 12h20v8H74l12 12-6 6-18-18h-8v8l18 18-6 6-12-12v20h-8V72L34 84l-6-6 18-18v-8h-8L20 70l-6-6 12-12H8v-8h18L14 32l6-6 18 18h8v-8L28 18l6-6 12 12z"/>',
    bounce: '<path d="M50 16a34 34 0 1 1-30 18l10 6a22 22 0 1 0 20-12v12L30 22l20-18z"/>',
    ramp: '<path d="M30 14h40l14 22-34 52-34-52z"/>',
    crystal: '<path d="M30 14h40l14 22-34 52-34-52z"/>',
    raise: '<path d="M30 88V40a20 20 0 0 1 40 0v48z"/><path d="M50 30v28M40 42h20" stroke="#000" stroke-width="6"/>',
    relic: '<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="50" cy="50" r="10"/>',
    sacrifice: '<path d="M50 10c10 18 26 26 26 48a26 26 0 0 1-52 0c0-12 8-20 12-26 2 10 6 14 12 14-2-14 0-26 2-36z"/>',
  };
  const TOKEN_GLYPH = { spore: "summon", jelly: "destroy", seed: "buff", feather: "dmg", husk: "destroy", cloud: "freeze", wisp: "summon", angel: "gain", imp: "sacrifice" };
  function glyphArt(key, essence) {
    const col = `var(--${essence || "light"})`;
    return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true" style="color:${col}"><defs><radialGradient id="g-${key}-${essence}" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset=".65" stop-color="#1a0d33"/><stop offset="1" stop-color="#07040f"/></radialGradient></defs>
<rect width="100" height="100" fill="url(#g-${key}-${essence})"/><g fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width=".8"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="30"/></g>
<g fill="#fffaf0" transform="translate(20 20) scale(.6)" style="filter:drop-shadow(0 0 4px currentColor)">${GLYPH[key] || GLYPH.relic}</g></svg>`;
  }
  const artOf = (c, tokenKey) => c.n ? `<img src="/thumbs/${c.n}.webp" alt="" loading="lazy" decoding="async">` : tokenKey ? glyphArt(TOKEN_GLYPH[tokenKey] || "summon", c.essence) : glyphArt(c.fx || "relic", c.essence);
  const KW_ORDER = ["flying", "elusive", "doubleStrike", "firstStrike", "deathtouch", "lifelink", "trample", "haste", "vigilance", "veiled", "frost", "reach"];
  const kwName = k => (POOL && POOL.kw[k] ? POOL.kw[k].name : k);
  function rulesHtml(c) {
    const kws = (c.kw || []).slice().sort((a, b) => KW_ORDER.indexOf(a) - KW_ORDER.indexOf(b)).map(k => `<b>${esc(kwName(k))}</b>`).join(", ");
    let t = esc(c.text || "");
    t = t.replace(/\b(Arrive|When it attacks|When it dies|At the start of your turn|At the end of your turn)(:|,)/g, "<b>$1</b>$2");
    return [kws, t].filter(Boolean).join(kws && t ? ". " : "");
  }
  /* the full card */
  function cardHtml(c, { cost, cls = "", now } = {}) {
    if (!c) return "";
    const spell = c.type !== "being";
    const cc = cost == null ? c.cost : cost;
    const type = spell ? TYPE_NAME[c.type] : c.tier;
    const pw = now ? now.power : c.power, hp = now ? now.health - (now.dmg || 0) : c.health;
    const tone = (v, base) => v > base ? " up" : v < base ? " down" : "";
    return `<div class="cd${spell ? " spell" : ""} t-${esc(c.tier || "")} ${cls}" style="--c:var(--${c.essence})">
<div class="cd-art">${artOf(c)}<span class="cd-cost${cc < c.cost ? " cheap" : cc > c.cost ? " dear" : ""}"><svg><use href="#i-gem"/></svg><b>${cc}</b></span></div>
<div class="cd-name">${esc(c.name)}</div><div class="cd-type">${esc(type)} · ${ESS_NAME[c.essence]}</div>
<div class="cd-text">${rulesHtml(c)}</div>
${spell ? "" : `<div class="cd-pt"><span class="p${tone(pw, c.power)}">${pw}</span>/<span class="h${tone(hp, c.health)}">${hp}</span></div>`}</div>`;
  }

  /* ---------- your wallet (optional) ---------- */
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
  // one sign-in for the games: the same session the card battler page keeps
  const readSess = () => { try { const s = JSON.parse(localStorage.getItem("realm-tcg-session") || "null"); return s && Date.now() - s.at < 23 * 3600e3 ? s : null; } catch { return null; } };
  const writeSess = s => { try { localStorage.setItem("realm-tcg-session", JSON.stringify(s)); } catch { /* private mode */ } };
  let SESS = readSess(), HOLD = null;
  const shortW = w => w.slice(0, 4) + "…" + w.slice(-4);
  async function loadHolder() {
    HOLD = null;
    if (SESS) {
      try { const d = await api("/api/tcg/team", { token: SESS.token }); HOLD = { boost: d.boost, owned: d.cards.map(c => c.n) }; }
      catch (e) { if (e.status === 401) { SESS = null; writeSess(null); } else HOLD = { error: e.message, owned: [] }; }
    }
    paintWallet();
  }
  function paintWallet() {
    $("[data-w-out]").hidden = !!SESS; $("[data-w-in]").hidden = !SESS;
    if (!SESS) return;
    const lv = HOLD && HOLD.boost ? HOLD.boost.level : 0, n = HOLD ? HOLD.owned.length : 0;
    $("[data-w-who]").innerHTML = `Connected <b>${esc(shortW(SESS.wallet))}</b>` + (!HOLD ? " · reading your beings…" : HOLD.error ? `<br><span class="rc-err">${esc(HOLD.error)}</span>`
      : ` · ${n} being${n === 1 ? "" : "s"}` + (lv && n ? ` · they play <b>+${Math.round((HOLD.boost.boost - 1) * 100)}%</b> stronger with your $DMT` : n ? " · hold 50K $DMT and they play stronger" : ""));
  }
  $("[data-w-connect]").addEventListener("click", async () => {
    const b = $("[data-w-connect]"), er = $("[data-w-err]"); er.hidden = true; b.disabled = true; b.textContent = "Check your wallet…";
    try { const s = await connectAndSign(); SESS = { wallet: s.wallet, token: s.token, at: Date.now() }; writeSess(SESS); sfx("win"); await loadHolder(); loadProfile(); }
    catch (e) { const m = (e && e.message) || ""; er.textContent = /reject|cancel|denied|declin/i.test(m) ? "Cancelled in the wallet." : m || "The wallet didn't connect. Try again."; er.hidden = false; }
    b.disabled = false; b.textContent = "Connect wallet";
  });
  $("[data-w-off]").addEventListener("click", () => {
    if (SESS) fetch("/api/duel/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: SESS.token }) }).catch(() => {});
    SESS = null; HOLD = null; writeSess(null); paintWallet(); loadProfile();
  });
  setTimeout(() => {
    if (stdWallet() || injected() || SESS) return;
    $("[data-w-connect]").hidden = true;
    const ph = $("[data-w-phantom]"); ph.hidden = false; ph.href = "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin);
  }, 1200);

  /* ---------- screens and sheets ---------- */
  function show(name) { $$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; }); window.scrollTo(0, 0); }
  function openSheet(sel) { $(sel).hidden = false; }
  document.addEventListener("click", e => { const c = e.target.closest("[data-close]"); if (c) { c.closest(".rc-sheet").hidden = true; } });
  $("[data-how]").addEventListener("click", () => { sfx("tap"); openSheet("[data-howsheet]"); });

  /* ---------- decks ---------- */
  let decks = store.get("decks", []);       // [{ id, name, cards }]
  let selKey = store.get("sel", "s:magic");
  let PROF = null, pid = store.get("pid", null);
  const RIVAL_TITLE = ["an apprentice", "a guardian", "a warden", "an elder", "an archon", "a sovereign"];
  async function loadProfile() {
    try {
      const d = await api("/api/rc/me", SESS ? { token: SESS.token } : { pid });
      if (d.pid) { pid = d.pid; store.set("pid", pid); }
      PROF = d.profile;
    } catch (e) { if (e.status === 401) { SESS = null; writeSess(null); paintWallet(); return loadProfile(); } }
    paintProfile();
  }
  const starsHtml = (n, max, pop = -1, lost = -1) => `<span class="rc-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}${i === pop ? " pop" : ""}${i === lost ? " lost" : ""}"></i>`).join("")}</span>`;
  const badge = p => `<span class="rc-badge t${p.tierIndex}"><svg width="18" height="20"><use href="#i-gem"/></svg></span>`;
  function paintProfile() {
    if (!PROF) return;
    const p = PROF;
    $("[data-rank]").innerHTML = `${badge(p)}<span class="rc-rinfo"><b>${p.tier}</b>${p.tier === "Mythic" ? "<i class='rc-fine' style='margin:0'>The top of the realm</i>" : starsHtml(p.stars, p.maxStars)}
<span class="rc-lvl">Lv ${p.level}<span class="rc-bar"><i style="width:${Math.round(100 * p.xp / p.next)}%"></i></span></span></span>
${p.streak ? `<span class="rc-streak"><b>${p.streak}</b>streak</span>` : ""}`;
    const left = (() => { const n = new Date(), m = new Date(n); m.setUTCHours(24, 0, 0, 0); const h = Math.ceil((m - n) / 3600e3); return h + "h"; })();
    $("[data-quests]").innerHTML = `<h3>Daily quests <span>new in ${left}</span></h3>` + p.quests.map(q => `<div class="rc-q${q.done ? " done" : ""}"><span>${esc(q.text)}</span><em>${q.done ? "Done" : "+" + q.xp + " xp"}</em><span class="rc-bar"><i style="width:${Math.round(100 * q.at / q.n)}%"></i></span></div>`).join("")
      + (p.firstWinReady ? `<p class="rc-bonus">First win today: +40 xp bonus</p>` : "");
    paintLobby();
  }
  const allDecks = () => [...(POOL ? POOL.starters.map(s => ({ key: "s:" + s.key, name: s.name, cards: s.deck, starter: s.key })) : []), ...decks.map(d => ({ key: "c:" + d.id, name: d.name, cards: d.cards, custom: d }))];
  const deckEss = cards => [...new Set(cards.map(id => BYID[id]).filter(Boolean).map(c => c.essence))];
  const deckArt = cards => { const b = cards.map(id => BYID[id]).filter(c => c && c.n).sort((a, b) => b.cost - a.cost)[0]; return b ? `url(/thumbs/${b.n}.webp)` : "none"; };
  const deckError = cards => {
    if (cards.length !== 30) return `A deck needs 30 cards (this one has ${cards.length}).`;
    if (deckEss(cards).length > 2) return "A deck can use at most two essences.";
    return null;
  };
  function selected() { const all = allDecks(); return all.find(d => d.key === selKey) || all[0]; }
  function paintLobby() {
    const d = selected(); if (!d) return;
    $("[data-deck-name]").textContent = d.name;
    $("[data-deck-ess]").innerHTML = deckEss(d.cards).map(e => dot(e) + ESS_NAME[e]).join(" ") + (d.starter ? " · starter" : "");
    $("[data-deck-art]").style.backgroundImage = deckArt(d.cards);
    const bad = deckError(d.cards);
    $("[data-play]").disabled = !!bad;
    $("[data-play-sub]").textContent = bad || `vs ${RIVAL_TITLE[PROF ? PROF.tierIndex : 0]} of the realm`;
  }
  function paintDeckList() {
    const all = allDecks();
    const row = d => `<button type="button" class="rc-deckrow" data-pick="${esc(d.key)}" aria-pressed="${d.key === selKey}"><span class="rc-deckart" style="background-image:${deckArt(d.cards)}"></span><span><b>${esc(d.name)}</b><span class="rc-ess">${deckEss(d.cards).map(e => dot(e) + ESS_NAME[e]).join(" ")}${deckError(d.cards) ? ` · <span class="rc-err">${d.cards.length}/30</span>` : ""}</span></span>${d.custom ? `<span class="rc-edit" data-edit="${esc(d.custom.id)}">Edit</span>` : ""}</button>`;
    const mine = all.filter(d => d.custom), st = all.filter(d => d.starter);
    $("[data-decklist]").innerHTML = (mine.length ? `<p class="rc-dhead">Your decks</p>` + mine.map(row).join("") : "") + `<p class="rc-dhead">Starter decks</p>` + st.map(row).join("");
  }
  $("[data-open-decks]").addEventListener("click", () => { sfx("tap"); paintDeckList(); openSheet("[data-decks]"); });
  $("[data-decklist]").addEventListener("click", e => {
    const ed = e.target.closest("[data-edit]");
    if (ed) { $("[data-decks]").hidden = true; openBuilder(decks.find(d => d.id === ed.dataset.edit)); return; }
    const p = e.target.closest("[data-pick]"); if (!p) return;
    selKey = p.dataset.pick; store.set("sel", selKey); sfx("tap"); $("[data-decks]").hidden = true; paintLobby();
  });

  /* ---------- the deck builder ---------- */
  let B = null;                                   // { id, name, cards }
  const F = { ess: new Set(), cost: null, type: null, q: "" };
  let LIST = [], shown = 0;
  function openBuilder(deck) {
    B = deck ? { id: deck.id, name: deck.name, cards: deck.cards.slice() } : { id: Date.now().toString(36), name: "My deck " + (decks.length + 1), cards: [] };
    F.ess = new Set(deckEss(B.cards)); F.cost = null; F.type = null; F.q = "";
    $("[data-f-q]").value = ""; $("[data-dname]").value = B.name;
    show("builder"); paintFilters(); filter(); paintBar();
  }
  $("[data-build]").addEventListener("click", () => { sfx("tap"); openBuilder(null); });
  function paintFilters() {
    $("[data-f-ess]").innerHTML = ESS.map(e => `<button type="button" data-fe="${e}" aria-pressed="${F.ess.has(e)}">${dot(e)}${ESS_NAME[e]}</button>`).join("");
    $("[data-f-cost]").innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n => `<button type="button" class="num" data-fc="${n}" aria-pressed="${F.cost === n}">${n}${n === 7 ? "+" : ""}</button>`).join("")
      + (HOLD && HOLD.owned.length ? `<button type="button" data-fm aria-pressed="${F.type === "mine"}">Mine</button>` : "");
    $("[data-f-type]").innerHTML = [["being", "Beings"], ["spell", "Spells"], ["rite", "Rites"], ["ability", "With abilities"]].map(([k, n]) => `<button type="button" data-ft="${k}" aria-pressed="${F.type === k}">${n}</button>`).join("");
  }
  $(".rc-filters").addEventListener("click", e => {
    const fe = e.target.closest("[data-fe]"), fc = e.target.closest("[data-fc]"), ft = e.target.closest("[data-ft]"), fm = e.target.closest("[data-fm]");
    if (fe) { const k = fe.dataset.fe; F.ess.has(k) ? F.ess.delete(k) : F.ess.add(k); }
    else if (fc) { const n = Number(fc.dataset.fc); F.cost = F.cost === n ? null : n; }
    else if (ft) { F.type = F.type === ft.dataset.ft ? null : ft.dataset.ft; }
    else if (fm) { F.type = F.type === "mine" ? null : "mine"; }
    else return;
    sfx("tap"); paintFilters(); filter();
  });
  let qTimer = null;
  $("[data-f-q]").addEventListener("input", e => { clearTimeout(qTimer); qTimer = setTimeout(() => { F.q = e.target.value.trim().toLowerCase(); filter(); }, 180); });
  function filter() {
    const mine = new Set(HOLD ? HOLD.owned : []);
    LIST = POOL.cards.filter(c => {
      if (F.ess.size && !F.ess.has(c.essence)) return false;
      if (F.cost && (F.cost === 7 ? c.cost < 7 : c.cost !== F.cost)) return false;
      if (F.type === "being" && c.type !== "being") return false;
      if (F.type === "spell" && c.type === "being") return false;
      if (F.type === "rite" && c.type !== "rite") return false;
      if (F.type === "ability" && !(c.text || (c.kw && c.kw.length))) return false;
      if (F.type === "mine" && !mine.has(c.n)) return false;
      if (F.q && !(c.name.toLowerCase().includes(F.q) || (c.text || "").toLowerCase().includes(F.q) || (c.kw || []).some(k => kwName(k).toLowerCase().includes(F.q)) || String(c.n) === F.q)) return false;
      return true;
    }).sort((a, b) => (mine.has(b.n) - mine.has(a.n)) || a.cost - b.cost || (a.type === "being") - (b.type === "being") || a.name.localeCompare(b.name));
    shown = 0; $("[data-grid]").innerHTML = ""; more();
  }
  const countIn = id => B.cards.filter(x => x === id).length;
  const maxOf = c => c.type === "being" ? 1 : 2;
  const blocked = c => { const ess = deckEss(B.cards); return ess.length >= 2 && !ess.includes(c.essence); };
  const cellHtml = c => { const n = countIn(c.id); return `<button type="button" class="rc-cell${blocked(c) ? " off" : ""}" data-cell="${esc(c.id)}" data-in="${n}">${cardHtml(c)}${n ? `<span class="rc-n">${n}</span>` : ""}</button>`; };
  function more() {
    const next = LIST.slice(shown, shown + 45); shown += next.length;
    $("[data-grid]").insertAdjacentHTML("beforeend", next.map(cellHtml).join(""));
    $("[data-more]").textContent = LIST.length ? "" : "Nothing matches.";
  }
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && B && shown < LIST.length) more(); }, { rootMargin: "600px" }).observe($("[data-more]"));
  function repaintCell(id) { const el = document.querySelector(`[data-cell="${CSS.escape(id)}"]`); if (el) el.outerHTML = cellHtml(BYID[id]); }
  function addCard(id) {
    const c = BYID[id];
    if (B.cards.length >= 30) return toastB("Your deck is full: 30 cards.");
    if (countIn(id) >= maxOf(c)) return toastB(c.type === "being" ? "Each being can be in a deck once." : "Each spell can be in a deck twice.");
    if (blocked(c)) return toastB("A deck can use at most two essences.");
    B.cards.push(id); sfx("play"); buzz(6);
    const ess = deckEss(B.cards);
    if (ess.length === 2) $$("[data-cell]").forEach(el => el.classList.toggle("off", !ess.includes(BYID[el.dataset.cell].essence)));
    repaintCell(id); paintBar();
  }
  function removeCard(id) {
    const i = B.cards.lastIndexOf(id); if (i < 0) return;
    B.cards.splice(i, 1); sfx("tap");
    const ess = deckEss(B.cards);
    $$("[data-cell]").forEach(el => el.classList.toggle("off", ess.length >= 2 && !ess.includes(BYID[el.dataset.cell].essence)));
    repaintCell(id); paintBar();
  }
  function toastB(m) { const e = $("[data-dsheet-err]"); toast(m); e.textContent = m; }
  $("[data-grid]").addEventListener("click", e => {
    const cell = e.target.closest("[data-cell]"); if (!cell) return;
    const c = BYID[cell.dataset.cell], n = countIn(c.id);
    zoom(c, { go: n < maxOf(c) && !blocked(c) && B.cards.length < 30 ? "Add to deck" : null, alt: n ? "Remove one" : null,
      onGo: () => addCard(c.id), onAlt: () => removeCard(c.id) });
  });
  function paintBar() {
    const n = B.cards.length;
    $("[data-dn]").textContent = n; $("[data-dlist]").classList.toggle("full", n === 30);
    const cv = [1, 2, 3, 4, 5, 6, 7].map(k => B.cards.filter(id => { const c = BYID[id]; return k === 7 ? c.cost >= 7 : c.cost === k; }).length);
    const top = Math.max(4, ...cv);
    $("[data-curve]").innerHTML = cv.map((v, i) => `<span style="height:${Math.round(100 * v / top)}%"><i>${i + 1}${i === 6 ? "+" : ""}</i></span>`).join("");
  }
  function paintDeckSheet() {
    const counts = {}; for (const id of B.cards) counts[id] = (counts[id] || 0) + 1;
    const ids = Object.keys(counts).sort((a, b) => BYID[a].cost - BYID[b].cost || BYID[a].name.localeCompare(BYID[b].name));
    $("[data-dsheet-title]").textContent = `${B.name} · ${B.cards.length}/30`;
    $("[data-dl]").innerHTML = ids.length ? ids.map(id => { const c = BYID[id]; return `<button type="button" data-dlrm="${esc(id)}"><span class="cst">${c.cost}</span>${dot(c.essence)}<span class="nm">${esc(c.name)}</span><span class="x">${counts[id] > 1 ? "×" + counts[id] : ""} &minus;</span></button>`; }).join("") : `<p class="rc-fine">Empty. Tap cards to add them, or press Auto-fill.</p>`;
    $("[data-ddelete]").hidden = !decks.some(d => d.id === B.id);
    $("[data-dsheet-err]").hidden = true;
  }
  $("[data-dlist]").addEventListener("click", () => { paintDeckSheet(); openSheet("[data-dsheet]"); });
  $("[data-dl]").addEventListener("click", e => { const b = e.target.closest("[data-dlrm]"); if (!b) return; removeCard(b.dataset.dlrm); paintDeckSheet(); });
  $("[data-dclear]").addEventListener("click", () => { B.cards = []; filter(); paintBar(); paintDeckSheet(); });
  $("[data-ddelete]").addEventListener("click", () => {
    decks = decks.filter(d => d.id !== B.id); store.set("decks", decks);
    if (selKey === "c:" + B.id) { selKey = "s:magic"; store.set("sel", selKey); }
    $("[data-dsheet]").hidden = true; B = null; show("lobby"); paintLobby();
  });
  $("[data-dname]").addEventListener("input", e => { B.name = e.target.value.slice(0, 24) || "My deck"; });
  $("[data-auto]").addEventListener("click", async () => {
    let ess = deckEss(B.cards);
    if (!ess.length) ess = [...F.ess].slice(0, 2);
    if (!ess.length) return toast("Pick one or two essences first.");
    const btn = $("[data-auto]"); btn.disabled = true;
    try {
      const d = await api("/api/rc/build", { essences: ess, ...(SESS ? { token: SESS.token } : {}) });
      for (const id of d.deck) { if (B.cards.length >= 30) break; if (countIn(id) < maxOf(BYID[id]) && !blocked(BYID[id])) B.cards.push(id); }
      sfx("win"); filter(); paintBar();
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  });
  function saveDeck() {
    B.name = ($("[data-dname]").value || "My deck").slice(0, 24);
    const i = decks.findIndex(d => d.id === B.id);
    const d = { id: B.id, name: B.name, cards: B.cards.slice() };
    if (i >= 0) decks[i] = d; else decks.push(d);
    store.set("decks", decks);
  }
  $("[data-dsave]").addEventListener("click", () => {
    const bad = deckError(B.cards);
    saveDeck();
    if (bad) { toast("Saved. " + bad); return; }
    selKey = "c:" + B.id; store.set("sel", selKey); sfx("win");
    B = null; show("lobby"); paintLobby();
  });
  $("[data-builder-back]").addEventListener("click", () => { if (B && B.cards.length) saveDeck(); B = null; show("lobby"); paintLobby(); });

  /* ---------- a card up close ---------- */
  let zoomCb = null;
  function zoom(c, { go = null, alt = null, onGo = null, onAlt = null, now = null, cost = null } = {}) {
    $("[data-zoom-card]").innerHTML = cardHtml(c, { cls: "zoomed", now, cost });
    const kws = [...new Set([...(c.kw || []), ...(now ? now.kw || [] : [])])];
    $("[data-zoom-kw]").innerHTML = kws.map(k => POOL.kw[k] ? `<b>${esc(POOL.kw[k].name)}:</b> ${esc(POOL.kw[k].rule)}` : "").filter(Boolean).join("<br>")
      + (now && now.sick && !(now.kw || []).includes("haste") ? (kws.length ? "<br>" : "") + "Just arrived: it can attack next turn." : "")
      + (now && now.frozen ? "<br>Frozen: it can't attack or block this turn." : "");
    const g = $("[data-zoom-go]"); g.hidden = !go && !alt; g.querySelector("span").textContent = go || alt || "";
    zoomCb = go ? onGo : onAlt;
    // two choices: the second rides on the close button
    const closeBtn = $(".rc-zoom-body .rc-ghost");
    closeBtn.textContent = go && alt ? alt : "Close";
    closeBtn.onclick = go && alt ? () => { $("[data-zoom]").hidden = true; onAlt && onAlt(); } : null;
    $("[data-zoom]").hidden = false;
  }
  $$("[data-zoom-close]").forEach(b => b.addEventListener("click", e => { if (b.onclick && e.currentTarget === b) return; $("[data-zoom]").hidden = true; }));
  $("[data-zoom-go]").addEventListener("click", () => { $("[data-zoom]").hidden = true; const f = zoomCb; zoomCb = null; f && f(); });

  let toastT = null;
  function toast(msg, ms = 1800) { const t = $("[data-toast]"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

  /* ================= the match ================= */
  let M = null;    // { id, v, busy, mode, sel, blocks, picked, play, deck, rival }
  const RIVAL_ART = { magic: 485, spirit: 649, knowledge: 569, light: 762, dark: 806 };
  async function startMatch() {
    const d = selected(); if (!d || deckError(d.cards)) return;
    const err = $("[data-lobby-err]"); err.hidden = true;
    const btn = $("[data-play]"); btn.disabled = true;
    try {
      const body = { ...(SESS ? {} : { pid }), ...(d.starter ? { starter: d.starter } : { deck: d.cards }), ...(SESS ? { token: SESS.token } : {}) };
      const r = await api("/api/rc/start", body);
      M = { id: r.match, me: 0, v: null, busy: true, mode: "idle", sel: new Set(), blocks: {}, picked: null, play: null, rival: r.rival, rivalEss: r.rivalEssences, hinted: false };
      $("[data-rname]").textContent = r.rival;
      $("[data-rival-emblem]").style.backgroundImage = `url(/thumbs/${RIVAL_ART[r.rivalEssences[0]]}.webp)`;
      $("[data-end]").hidden = true;
      show("match"); sfx("turn");
      if (r.boosted) toast(`${r.boosted} of your own beings play stronger with your $DMT`, 2200);
      await playFrames(r.frames, r.result);
    } catch (e) {
      if (e.status === 401) { SESS = null; writeSess(null); paintWallet(); }
      err.textContent = e.message; err.hidden = false;
    }
    btn.disabled = false;
  }
  $("[data-play]").addEventListener("click", () => { sfx("tap"); buzz(10); startMatch(); });
  $("[data-again]").addEventListener("click", () => { $("[data-end]").hidden = true; startMatch(); });
  $("[data-to-lobby]").addEventListener("click", () => { $("[data-end]").hidden = true; M = null; show("lobby"); paintLobby(); });

  /* ---------- reading the table ---------- */
  const defOf = u => u.token ? { ...u.token, type: "being", cost: 0, tier: "Token", text: "", n: null } : BYID[u.id];
  const units = () => [...M.v.you.board, ...M.v.rival.board];
  const unitBy = uid => units().find(u => u.uid === uid);
  const myMain = () => M.v.active === "you" && M.v.phase === "main" && !M.v.winner;
  const defending = () => M.v.phase === "block" && M.v.active === "rival";
  function playable(h) {
    const c = BYID[h.id]; if (!c || M.busy || M.v.winner) return false;
    if (h.cost > M.v.you.ess) return false;
    if (defending()) return c.type === "rite";
    if (!myMain()) return false;
    if (c.type === "being" && M.v.you.board.length >= 7) return false;
    if (c.type !== "being" && c.tgt && !targets(c.tgt).length) return false;
    return true;
  }
  /* what a card may target: { uid } or { player } */
  function targets(t) {
    const out = [];
    for (const u of units()) {
      const enemy = u.owner !== M.me;
      if (enemy && u.kw.includes("veiled")) continue;
      if (t.to === "enemyBeing" && (!enemy || (t.maxPower != null && u.power > t.maxPower))) continue;
      if (t.to === "ownBeing" && enemy) continue;
      if (t.to === "attacker" && !(M.v.pending && M.v.pending.attackers.includes(u.uid))) continue;
      out.push({ uid: u.uid });
    }
    if (t.to === "any") out.push({ player: 1 - M.me }, { player: M.me });
    return out;
  }
  const canBlockClient = (b, a) => !b.tapped && !b.frozen && !a.kw.includes("elusive") && (!a.kw.includes("flying") || b.kw.includes("flying") || b.kw.includes("reach"));

  /* ---------- drawing the table ---------- */
  let lastUids = new Set();
  function unitHtml(u) {
    const d = defOf(u) || { name: "?", power: 0, health: 0, essence: "light" };
    const hp = u.health - u.dmg, cls = ["u"];
    if (u.sick && !u.kw.includes("haste")) cls.push("sick");
    if (u.tapped) cls.push("tapped");
    if (u.frozen) cls.push("frozen");
    if (!lastUids.has(u.uid)) cls.push("new");
    const mine = u.owner === M.me, pend = M.v.pending;
    if (mine && M.sel.has(u.uid) && myMain() && !M.v.attacked) cls.push("sel");
    else if (M.mode === "idle" && mine && u.canAttack && myMain() && !M.v.attacked) cls.push("ready");
    if (pend && pend.attackers.includes(u.uid)) cls.push("attacking");
    if (M.mode === "block" && mine && Object.values(M.blocks).length && M.blocks[u.uid] != null) cls.push("blocker");
    if (M.mode === "block" && M.picked === u.uid) cls.push("picked");
    if (M.mode === "target" && M.play && M.play.valid.some(t => t.uid === u.uid)) cls.push("target");
    const tone = (v, b) => v > b ? " up" : v < b ? " down" : "";
    const kws = u.kw.slice().sort((a, b) => KW_ORDER.indexOf(a) - KW_ORDER.indexOf(b)).slice(0, 3);
    let tag = "";
    if (M.mode === "block") {
      const order = pend ? pend.attackers : [];
      if (mine && M.blocks[u.uid] != null) tag = `<span class="tag">${order.indexOf(M.blocks[u.uid]) + 1}</span>`;
      if (!mine && order.includes(u.uid)) tag = `<span class="tag foe">${order.indexOf(u.uid) + 1}</span>`;
    }
    return `<button type="button" class="${cls.join(" ")}" data-u="${u.uid}" style="--c:var(--${d.essence})">${artOf(d, u.token ? u.id.replace(/^t-/, "") : null)}
<span class="kws">${kws.map(k => `<svg><use href="#k-${k}"/></svg>`).join("")}</span>${tag}
<span class="pt"><span class="p${tone(u.power, d.power)}">${u.power}</span><span class="h${tone(hp, d.health)}">${hp}</span></span></button>`;
  }
  function sizeBoard(el, n) {
    const W = el.clientWidth || 360, gap = 6, max = 92;
    const uw = Math.max(40, Math.min(max, Math.floor((W - gap * (Math.max(n, 1) - 1)) / Math.max(n, 3.6))));
    el.style.setProperty("--uw", uw + "px");
  }
  function render() {
    const v = M.v;
    $("[data-r-life]").textContent = Math.max(0, v.rival.life); $("[data-y-life]").textContent = Math.max(0, v.you.life);
    $("[data-r-life]").classList.toggle("low", v.rival.life <= 5); $("[data-y-life]").classList.toggle("low", v.you.life <= 5);
    $("[data-r-hand]").textContent = v.rival.hand; $("[data-r-deck]").textContent = v.rival.deck; $("[data-y-deck]").textContent = v.you.deck;
    $("[data-r-ess]").textContent = v.rival.maxEss;
    const used = Math.max(0, v.you.maxEss - v.you.ess);
    $("[data-y-gems]").innerHTML = Array.from({ length: Math.max(v.you.maxEss, v.you.ess) }, (_, i) => `<i class="${i >= v.you.ess ? "used" : ""}"></i>`).join("") + `<b>${v.you.ess}/${v.you.maxEss}</b>`;
    void used;
    const rel = list => list.map(id => { const c = BYID[id]; return c ? `<button type="button" class="rc-relic" data-relic="${esc(id)}" style="--c:var(--${c.essence})">${esc(c.name)}</button>` : ""; }).join("");
    $("[data-r-relics]").innerHTML = rel(v.rival.relics); $("[data-y-relics]").innerHTML = rel(v.you.relics);
    const rb = $("[data-r-board]"), yb = $("[data-y-board]");
    sizeBoard(rb, v.rival.board.length); sizeBoard(yb, v.you.board.length);
    rb.innerHTML = v.rival.board.map(unitHtml).join(""); yb.innerHTML = v.you.board.map(unitHtml).join("");
    lastUids = new Set(units().map(u => u.uid));
    // faces as targets
    const faceT = M.mode === "target" && M.play ? M.play.valid.filter(t => t.player != null).map(t => t.player) : [];
    $$("[data-face]").forEach(p => p.classList.toggle("target", faceT.includes(Number(p.dataset.face) === 0 ? M.me : 1 - M.me)));
    paintHand(); paintActions();
  }
  function paintHand() {
    const hand = M.v.you.hand, el = $("[data-hand]");
    const W = el.clientWidth || 260, cw = window.innerHeight < 700 ? 70 : 84, n = hand.length;
    el.style.setProperty("--hw", cw + "px");
    const step = n > 1 ? Math.min(cw + 4, (W - cw - 16) / (n - 1)) : 0;
    const total = step * (n - 1) + cw, x0 = Math.max(8, (W - total) / 2);
    el.innerHTML = hand.map((h, i) => {
      const c = BYID[h.id], mid = i - (n - 1) / 2, rot = mid * (n > 6 ? 1.5 : 2.5), dy = Math.round(mid * mid * (n > 6 ? .5 : 1));
      const ok = playable(h), lift = M.play && M.play.uid === h.uid;
      return `<button type="button" class="hc ${ok ? "can" : "no"}${lift ? " lift" : ""}" data-h="${h.uid}" style="left:${Math.round(x0 + i * step)}px;transform:translateY(${dy}px) rotate(${rot}deg);z-index:${i + 1}">${cardHtml(c, { cost: h.cost })}</button>`;
    }).join("");
  }
  function paintActions() {
    const a = $("[data-act]"), b = $("[data-act2]"), v = M.v;
    a.className = "rc-act"; a.disabled = false; b.hidden = true;
    if (v.winner) { a.disabled = true; a.textContent = "Game over"; return; }
    if (M.busy) { a.disabled = true; a.textContent = v.active === "you" && !defending() ? "…" : "Rival's turn"; return; }
    if (M.mode === "target") { a.disabled = true; a.textContent = "Pick a target"; b.hidden = false; b.textContent = "Cancel"; return; }
    if (defending()) {
      a.classList.add("block"); const n = Object.keys(M.blocks).length;
      a.textContent = n ? `Block (${n})` : "No blocks"; return;
    }
    if (!myMain()) { a.disabled = true; a.textContent = "Rival's turn"; return; }
    const ready = v.you.board.filter(u => u.canAttack);
    if (!v.attacked && M.sel.size) { a.classList.add("attack"); a.textContent = `Attack (${M.sel.size})`; b.hidden = false; b.textContent = "End turn"; return; }
    a.textContent = "End turn";
    // nothing left worth doing: the button says so
    if (!v.you.hand.some(playable) && (v.attacked || !ready.length)) a.classList.add("go");
    if (!v.attacked && ready.length) { b.hidden = true; }
  }

  /* ---------- your taps ---------- */
  /* tap a card to play it; hold it to read it */
  function whyNot(h) {
    const c = BYID[h.id];
    if (M.busy || M.v.winner) return "";
    if (h.cost > M.v.you.ess) return `Needs ${h.cost} crystals. You have ${M.v.you.ess}.`;
    if (defending()) return "While you're being attacked, only Rites can be cast.";
    if (!myMain()) return "Wait for your turn.";
    return c.type === "being" ? "Your side of the table is full." : "There's nothing to target.";
  }
  function readCard(h) { const c = BYID[h.id], why = playable(h) ? "" : whyNot(h); zoom(c, { cost: h.cost, go: playable(h) ? (c.type === "being" ? "Play" : "Cast") : null, onGo: () => beginPlay(h) }); if (why) $("[data-zoom-kw]").insertAdjacentHTML("afterbegin", `<span class="rc-err">${esc(why)}</span><br>`); }
  let holdT = null, held = false;
  const handCard = e => { const el = e.target.closest("[data-h]"); return el && M && M.v ? { el, h: M.v.you.hand.find(x => x.uid === Number(el.dataset.h)) } : null; };
  $("[data-hand]").addEventListener("pointerdown", e => { const x = handCard(e); if (!x) return; held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; buzz(8); readCard(x.h); }, 420); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(t => $("[data-hand]").addEventListener(t, () => clearTimeout(holdT)));
  $("[data-hand]").addEventListener("contextmenu", e => e.preventDefault());
  $("[data-hand]").addEventListener("click", e => {
    const x = handCard(e); if (!x) return;
    if (held) { held = false; return; }
    if (M.mode === "target" && M.play && M.play.uid === x.h.uid) { cancelMode(); return; }
    if (!playable(x.h)) { nudge(x.el); const why = whyNot(x.h); if (why) toast(why); return; }
    sfx("tap"); beginPlay(x.h);
  });
  function beginPlay(h) {
    const c = BYID[h.id];
    const valid = c.tgt ? targets(c.tgt) : [];
    if (c.tgt && valid.length) {
      M.mode = "target"; M.play = { uid: h.uid, valid };
      banner(c.tgt.to === "ownBeing" ? "Choose one of your beings" : c.tgt.to === "attacker" ? "Choose an attacker" : c.tgt.to === "enemyBeing" ? "Choose an enemy being" : "Choose a target", false, 0);
      render(); return;
    }
    send({ type: "play", uid: h.uid });
  }
  function cancelMode() { M.mode = defending() ? "block" : "idle"; M.play = null; M.sel.clear(); banner(""); render(); }
  document.querySelector(".rc-match").addEventListener("click", e => {
    if (!M || !M.v) return;
    const face = e.target.closest("[data-face]"), ue = e.target.closest("[data-u]"), relic = e.target.closest("[data-relic]");
    if (relic) { zoom(BYID[relic.dataset.relic]); return; }
    if (M.mode === "target" && M.play) {
      let t = null;
      if (ue) t = M.play.valid.find(x => x.uid === Number(ue.dataset.u));
      else if (face && e.target.closest(".rc-life")) { const p = Number(face.dataset.face) === 0 ? M.me : 1 - M.me; t = M.play.valid.find(x => x.player === p); }
      if (t) { const uid = M.play.uid; M.mode = "idle"; M.play = null; banner(""); send({ type: "play", uid, target: t }); }
      return;
    }
    if (!ue) return;
    const u = unitBy(Number(ue.dataset.u)); if (!u) return;
    const mine = u.owner === M.me;
    if (M.mode === "idle" && mine && myMain() && !M.v.attacked && u.canAttack) {
      M.sel.has(u.uid) ? M.sel.delete(u.uid) : M.sel.add(u.uid); sfx("tap"); buzz(5); render(); return;
    }
    if (M.mode === "block") {
      const pend = M.v.pending;
      if (mine) {
        if (M.blocks[u.uid] != null) { delete M.blocks[u.uid]; M.picked = null; sfx("tap"); render(); return; }
        if (u.tapped || u.frozen) { nudge(ue); toast(u.frozen ? "Frozen beings can't block." : "Tired beings can't block."); return; }
        M.picked = M.picked === u.uid ? null : u.uid; sfx("tap"); render();
        if (M.picked && pend.attackers.length === 1) assignBlock(pend.attackers[0]);
        return;
      }
      if (pend.attackers.includes(u.uid) && M.picked != null) { assignBlock(u.uid); return; }
    }
    zoom(defOf(u), { now: u });
  });
  function assignBlock(attUid) {
    const b = unitBy(M.picked), a = unitBy(attUid);
    if (!b || !a) return;
    if (!canBlockClient(b, a)) { toast(a.kw.includes("elusive") ? "That one can't be blocked." : "Only beings with Flying or Reach can block a flyer."); return; }
    for (const [k, v] of Object.entries(M.blocks)) if (v === attUid) delete M.blocks[k];
    M.blocks[M.picked] = attUid; M.picked = null; sfx("play"); buzz(6); render();
  }
  function nudge(el) { el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge"); setTimeout(() => el.classList.remove("nudge"), 320); }
  $("[data-act]").addEventListener("click", () => {
    if (!M || M.busy) return;
    sfx("tap");
    if (defending()) { const blocks = M.blocks; M.blocks = {}; M.picked = null; send({ type: "block", blocks }); return; }
    if (!myMain()) return;
    if (!M.v.attacked && M.sel.size) { const ids = [...M.sel]; M.sel.clear(); send({ type: "attack", attackers: ids }); return; }
    send({ type: "end" });
  });
  $("[data-act2]").addEventListener("click", () => {
    if (!M || M.busy) return;
    sfx("tap");
    if (M.mode === "target") { cancelMode(); return; }
    if (myMain()) send({ type: "end" });
  });
  $("[data-hint]").addEventListener("click", async () => {
    if (!M || M.busy || M.v.winner) return;
    if (!M.hinted && !confirm("Ask for a suggestion? (A match with hints won't count toward ranks later on.)")) return;
    M.hinted = true;
    try {
      const { move } = await api("/api/rc/hint", { match: M.id });
      if (!move) return;
      if (move.type === "play") { const h = M.v.you.hand.find(x => x.uid === move.uid); const c = h && BYID[h.id]; M.play = { uid: move.uid, valid: [] }; paintHand(); M.play = null; toast(`Try: ${c ? (c.type === "being" ? "play " : "cast ") + c.name : "that card"}` + (move.target && move.target.uid ? " on " + defOf(unitBy(move.target.uid)).name : move.target ? (move.target.player === M.me ? " on yourself" : " at your rival") : ""), 2600); }
      else if (move.type === "attack") { M.sel = new Set(move.attackers); render(); toast("Try attacking with these.", 2200); }
      else if (move.type === "block") { M.blocks = { ...move.blocks }; render(); toast(Object.keys(move.blocks).length ? "Try these blocks." : "Try taking it: no blocks.", 2200); }
      else toast("Nothing more to do: end your turn.", 2200);
    } catch (e) { toast(e.message); }
  });
  $("[data-menu]").addEventListener("click", () => openSheet("[data-msheet]"));
  $("[data-how2]").addEventListener("click", () => { $("[data-msheet]").hidden = true; openSheet("[data-howsheet]"); });
  $("[data-resign]").addEventListener("click", () => { $("[data-msheet]").hidden = true; if (M && !M.busy && !M.v.winner) send({ type: "resign" }); });

  /* ---------- talking to the server ---------- */
  async function send(move) {
    if (!M || M.busy) return;
    M.busy = true; paintActions(); paintHand(); $("[data-coach]").hidden = true;
    try {
      const r = await api("/api/rc/act", { match: M.id, move });
      await playFrames(r.frames, r.result);
    } catch (e) {
      M.busy = false;
      if (e.data && e.data.view) M.v = e.data.view;
      M.mode = defending() ? "block" : "idle";
      if (M.v) render();
      toast(e.message, 2400);
      if (/ended/.test(e.message)) setTimeout(() => { show("lobby"); paintLobby(); }, 1500);
    }
  }

  /* ---------- playing back what happened ---------- */
  function banner(text, foe = false, ms = 900) {
    const b = $("[data-banner]"); b.textContent = text; b.classList.toggle("foe", foe); b.classList.toggle("on", !!text);
    clearTimeout(banner.t); if (text && ms) banner.t = setTimeout(() => b.classList.remove("on"), ms);
  }
  function floatNum(el, text, heal) {
    if (!el) return;
    const r = el.getBoundingClientRect(), n = document.createElement("span");
    n.className = "fx-num" + (heal ? " heal" : ""); n.textContent = text;
    n.style.position = "fixed"; n.style.left = r.left + r.width / 2 + "px"; n.style.top = r.top + r.height * .25 + "px";
    document.body.appendChild(n); setTimeout(() => n.remove(), 850);
  }
  const uEl = uid => document.querySelector(`[data-u="${uid}"]`);
  const lifeEl = p => p === M.me ? $("[data-y-life]") : $("[data-r-life]");
  function pulse(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  async function animate(ev) {
    let hits = 0;
    for (const e of ev) {
      switch (e.t) {
        case "turn": banner(e.p === M.me ? "Your turn" : "Rival's turn", e.p !== M.me, 900); sfx("turn"); await wait(300); break;
        case "play":
          if (e.p !== M.me) { const c = BYID[e.id]; if (c) { const el = document.createElement("div"); el.className = "rc-cast"; el.innerHTML = cardHtml(c); document.body.appendChild(el); sfx("play"); await wait(850); el.remove(); } }
          else sfx("play");
          break;
        case "attack": for (const id of e.attackers) uEl(id) && uEl(id).classList.add("attacking"); sfx("hit"); await wait(380); break;
        case "block": for (const b of Object.keys(e.blocks)) uEl(b) && uEl(b).classList.add("blocker"); if (Object.keys(e.blocks).length) await wait(380); break;
        case "damage": pulse(uEl(e.uid), "hit"); floatNum(uEl(e.uid), "-" + e.n); hits++; sfx("hit"); await wait(110); break;
        case "face": pulse(lifeEl(e.p), "hit"); floatNum(lifeEl(e.p), "-" + e.n); buzz(e.p === M.me ? 25 : 8); sfx("hit"); await wait(220); break;
        case "heal": floatNum(lifeEl(e.p), "+" + e.n, true); await wait(150); break;
        case "death": { const el = uEl(e.uid); if (el) { el.classList.add("dying"); sfx("die"); await wait(300); } break; }
        case "buff": case "freeze": pulse(uEl(e.uid), "glow"); break;
        case "bounce": { const el = uEl(e.uid); if (el) { el.classList.add("dying"); await wait(250); } break; }
        case "empty": toast(e.p === M.me ? "Your deck is empty!" : "Your rival's deck is empty!"); await wait(600); break;
      }
    }
    if (hits) await wait(260);
  }
  async function playFrames(frames, result) {
    M.busy = true;
    for (const f of frames || []) {
      await animate(f.ev);
      M.v = f.view;
      if (f !== frames[frames.length - 1]) render();
      if (f.who === "rival" && f !== frames[frames.length - 1]) await wait(240);
    }
    M.busy = false;
    M.mode = defending() ? "block" : "idle";
    M.play = null;
    const sg = M.v.suggest || {};
    M.sel = new Set(myMain() && !M.v.attacked ? sg.attackers || [] : []);
    if (defending()) { M.blocks = { ...(sg.blocks || {}) }; M.picked = null; banner("You're attacked", true, 1400); }
    render();
    coachNow();
    if (result) setTimeout(() => endScreen(result), 600);
  }
  function endScreen(r) {
    const won = r.won, el = $("[data-end]"), pr = r.progress;
    el.classList.toggle("lost", !won && !r.draw);
    $("[data-end-title]").textContent = r.draw ? "Draw" : won ? "Victory" : "Defeat";
    $("[data-end-sub]").textContent = won ? `You beat ${M.rival} in ${r.turns} turns.` : r.draw ? "Neither side broke." : `${M.rival} won this time.`;
    $("[data-end-rank]").innerHTML = ""; $("[data-end-xp]").innerHTML = ""; $("[data-end-lines]").innerHTML = "";
    el.hidden = false; sfx(won ? "win" : "lose");
    store.set("coached", store.get("coached", 0) + 1);
    $("[data-coach]").hidden = true;
    if (!pr) return;
    const a = pr.after, b = pr.before;
    // the stars: the old row first, then the change
    const rankRow = (p, pop, lost) => `${badge(p)}<b>${p.tier}</b>${p.tier === "Mythic" ? "" : starsHtml(p.stars, p.maxStars, pop, lost)}`;
    $("[data-end-rank]").innerHTML = rankRow(b);
    setTimeout(() => {
      if (pr.rankUp) { $("[data-end-rank]").innerHTML = rankRow(a) + `<span class="up">Up to ${a.tier}!</span>`; sfx("win"); buzz([30, 40, 30]); }
      else if (pr.starsMoved > 0) $("[data-end-rank]").innerHTML = rankRow(a, a.stars - 1);
      else if (pr.starsMoved < 0) $("[data-end-rank]").innerHTML = rankRow(b, -1, b.stars - 1);
      else if (r.hinted) $("[data-end-rank]").insertAdjacentHTML("beforeend", `<span class="rc-fine">Matches with hints don't move your stars.</span>`);
    }, 500);
    // xp
    const pct = p => Math.round(100 * p.xp / p.next);
    $("[data-end-xp]").innerHTML = `<span>Lv <b data-lv>${b.level}</b></span><span class="rc-bar"><i style="width:${pct(b)}%"></i></span><span>+${pr.xp} xp</span>`;
    setTimeout(() => {
      const bar = $("[data-end-xp] .rc-bar i");
      if (pr.levelUps) { bar.style.width = "100%"; setTimeout(() => { bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth; bar.style.transition = ""; bar.style.width = pct(a) + "%"; $("[data-lv]").textContent = a.level; sfx("win"); toast(`Level ${a.level}!`); }, 950); }
      else bar.style.width = pct(a) + "%";
    }, 700);
    const lines = [...pr.bonus.map(x => `<p><span>${esc(x.what)}</span><em>+${x.xp} xp</em></p>`), ...pr.completed.map(q => `<p class="q"><span>Quest done: ${esc(q.text)}</span><em>+${q.xp} xp</em></p>`)];
    if (!won && a.streak === 0 && b.streak >= 3) lines.push(`<p><span>Your ${b.streak}-win streak ended</span><em></em></p>`);
    $("[data-end-lines]").innerHTML = lines.map((l, i) => l.replace("<p", `<p style="animation-delay:${0.9 + i * 0.25}s"`)).join("");
    PROF = a; paintProfile();
  }
  /* ---------- the coach: a tip the first few times ---------- */
  const COACH = {
    play: "Tap a card to play it. Hold any card to read it.",
    attack: "Your best attackers are lit up red. Tap a being to hold it back, then tap Attack.",
    block: "You're being attacked! Your blockers are already picked. Tap Block, or tap your beings to change them.",
    end: "Nothing left to do: tap End turn.",
  };
  function coachNow() {
    const box = $("[data-coach]"); box.hidden = true;
    if (!M || !M.v || M.v.winner || store.get("coached", 0) >= 3) return;
    const seen = store.get("coach", {});
    const key = defending() ? "block" : !myMain() ? null : (!M.v.attacked && M.sel.size) ? "attack" : M.v.you.hand.some(playable) ? "play" : "end";
    if (!key || (seen[key] || 0) >= 2) return;
    seen[key] = (seen[key] || 0) + 1; store.set("coach", seen);
    box.textContent = COACH[key]; box.hidden = false;
  }
  window.addEventListener("resize", () => { if (M && M.v && !$("[data-screen=match]").hidden) render(); });

  /* ---------- start ---------- */
  (async () => {
    try { await loadPool(); } catch (e) { $("[data-lobby-err]").textContent = e.message; $("[data-lobby-err]").hidden = false; return; }
    paintLobby(); paintWallet();
    if (SESS) loadHolder();
    loadProfile();
    if (location.search.includes("debug")) window.__rc = () => ({ M, BYID, POOL });
  })();
})();
