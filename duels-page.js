/* dmt-realm.dev/duels: the page around the game in duels.js. Nothing is decided here. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const COL = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#fff7d6" };
  const STATS = ["magic", "spirit", "knowledge", "light", "dark"];
  const NAME = { magic: "Magic", spirit: "Spirit", knowledge: "Knowledge", light: "Light", dark: "Dark" };
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const show = name => document.querySelectorAll("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; });
  const err = m => { const e = $("[data-err]"); e.textContent = m || ""; e.hidden = !m; };
  async function api(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: "The realm did not answer. Try again." }));
    if (!r.ok || j.error) throw new Error(j.error || "Something went wrong.");
    return j;
  }

  function cardHTML(c, opts = {}) {
    if (c.hidden) return '<div class="d-card back" style="--c:' + COL[c.tier] + '"><span>' + esc(c.tier) + '</span></div>';
    const name = c.being && !/\d$/.test(c.being) ? c.being : c.tier;
    const hi = s => opts.stat === s ? " hi" : "";
    return '<div class="d-card' + (opts.cls ? " " + opts.cls : "") + '" style="--c:' + COL[c.tier] + '" ' + (opts.attr || "") + '>'
      + '<div class="d-top"><b>' + esc(name) + '</b><i>#' + c.n + '</i></div>'
      + '<div class="d-pic"><img src="' + esc(c.img) + '" alt=""' + (opts.stat ? "" : ' loading="lazy"') + '></div>'
      + '<div class="d-tier">' + esc(c.tier) + (c.borrowed ? " · borrowed" : "") + '</div>'
      + '<ul class="d-s">'
      + STATS.map(s => '<li class="' + s + hi(s) + '"><span>' + NAME[s] + '</span><b>' + c[s] + '</b><em style="width:' + Math.min(100, c[s] / 1.8) + '%"></em></li>').join("")
      + '</ul></div>';
  }

  /* ---------- the board ---------- */
  async function board() {
    try {
      const b = await api("/api/duel/board");
      $("[data-board]").innerHTML = b.top.length
        ? '<ol class="d-board">' + b.top.map((r, i) => '<li><span>' + (i + 1) + '</span><a href="/wallet?a=' + esc(r.wallet) + '">' + esc(short(r.wallet)) + '</a><b>Stage ' + r.stage + '</b><i>' + r.score + '</i></li>').join("") + '</ol>'
          + '<p class="h-note">Week starting ' + esc(b.week) + ' (resets Monday 00:00 UTC).</p>'
        : '<p class="h-note">Nobody on the board yet this week. Be the first.</p>';
    } catch { $("[data-board]").innerHTML = '<p class="h-note">The board could not be read just now.</p>'; }
  }

  /* ---------- the deck: every being the wallet holds ---------- */
  let wallet = null;
  async function load(a) {
    err(""); $("[data-pick]").hidden = true;
    try {
      const { cards } = await api("/api/duel/cards?address=" + encodeURIComponent(a));
      wallet = a; store.set("realm-duel-wallet", a);
      if (!cards.length) return err("This wallet holds no beings yet. Play with borrowed spirits below, or mint one at dmt-realm.dev/mint.");
      $("[data-mine]").innerHTML = cards.map(c => cardHTML(c)).join("");
      $("[data-pick-note]").textContent = cards.length > 3
        ? "Your deck: all " + cards.length + " of your beings. Every stage you are dealt three of them at random."
        : cards.length === 3 ? "Your deck: your three beings, dealt every stage."
        : "Your deck: your " + (cards.length === 1 ? "being" : cards.length + " beings") + ", topped up with borrowed spirits from all 1,111 each stage.";
      $("[data-go]").disabled = false; $("[data-go]").textContent = "Enter the realm";
      $("[data-pick]").hidden = false;
    } catch (e) { err(e.message); }
  }
  $("[data-find]").addEventListener("submit", e => { e.preventDefault(); const a = e.target.a.value.trim(); if (a) load(a); });
  const saved = store.get("realm-duel-wallet"); if (saved) { $("[data-find]").a.value = saved; }

  /* ---------- the duel ---------- */
  let S = null, chosen = null, busy = false;
  function paint() {
    $("[data-stage]").textContent = S.stage;
    $("[data-score]").textContent = S.score;
    $("[data-rounds]").textContent = S.wins + " – " + S.losses;
    $("[data-rival]").innerHTML = S.rival.map((c, i) => '<div class="d-slot' + (c.hidden ? "" : " used") + '">' + cardHTML(c) + '</div>').join("");
    $("[data-hand]").innerHTML = S.team.map((c, i) => '<div class="d-slot' + (S.used.includes(i) ? " used" : "") + (chosen === i ? " chosen" : "") + '" data-i="' + i + '">' + cardHTML(c) + '</div>').join("");
    const youCall = S.caller === "you";
    $("[data-call]").innerHTML = '<b>Round ' + S.round + ' of 3</b>' + (youCall ? "You call the stat. Pick a card, then name the stat." : "The rival calls the stat this round. Pick the card you think can stand up to it.");
    $("[data-stats]").hidden = !(youCall && chosen != null);
    $("[data-play]").hidden = !(!youCall && chosen != null);
  }
  $("[data-hand]").addEventListener("click", e => {
    const el = e.target.closest("[data-i]"); if (!el || busy || !$("[data-arena]").hidden) return;
    const i = Number(el.dataset.i); if (S.used.includes(i)) return;
    chosen = i; paint();
    if (window.innerWidth < 700) $(S.caller === "you" ? "[data-stats]" : "[data-play]").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  async function send(stat) {
    if (busy || chosen == null) return; busy = true;
    try {
      const d = await api("/api/duel/play", { run: S.run, card: chosen, stat });
      reveal(d);
    } catch (e) { alert(e.message); }
    busy = false;
  }
  document.querySelectorAll("[data-stat]").forEach(b => b.addEventListener("click", () => send(b.dataset.stat)));
  $("[data-play]").addEventListener("click", () => send(null));

  let after = null;
  function reveal(d) {
    const L = d.last, mine = S.team.find(c => c.n === L.you), theirs = d.rival.find(c => !c.hidden && c.n === L.rival);
    $("[data-stats]").hidden = true; $("[data-play]").hidden = true;
    const a = $("[data-arena]");
    a.innerHTML = '<p class="d-said">' + (L.caller === "you" ? "You call" : "The rival calls") + ' <b>' + NAME[L.stat] + '</b></p>'
      + '<div class="d-face">' + cardHTML(mine, { stat: L.stat, cls: L.won ? "win" : "lose" }) + '<span class="d-vs">' + L.yours + '<i>vs</i>' + L.theirs + '</span>' + cardHTML(theirs, { stat: L.stat, cls: L.won ? "lose" : "win" }) + '</div>'
      + '<p class="d-verdict ' + (L.won ? "good" : "bad") + '">' + (L.won ? "You take the round" : "The rival takes the round") + '</p>';
    a.hidden = false; a.scrollIntoView({ behavior: "smooth", block: "center" });
    S = { ...S, ...d, team: S.team }; chosen = null;
    $("[data-rounds]").textContent = d.wins + " – " + d.losses; $("[data-score]").textContent = d.score;
    const nx = $("[data-next]");
    if (d.result === "won") { nx.textContent = "Stage " + d.stage + " cleared. Deal stage " + d.next.stage; after = () => { S = d.next; }; }
    else if (d.result === "lost") { nx.textContent = "See your run"; after = () => over(d); }
    else { nx.textContent = "Next round"; after = () => {}; }
    nx.hidden = false;
  }
  $("[data-next]").addEventListener("click", () => {
    $("[data-next]").hidden = true; $("[data-arena]").hidden = true;
    const f = after; after = null; f && f();
    if (S && !S.over) { paint(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });

  function over(d) {
    show("over");
    $("[data-over-stage]").textContent = d.stage; $("[data-over-score]").textContent = d.score;
    $("[data-over-title]").textContent = d.stage >= 8 ? "A legend of the realm" : d.stage >= 4 ? "Deep into the realm" : d.stage >= 1 ? "You crossed the threshold" : "The realm turned you back";
    $("[data-over-note]").textContent = d.wallet
      ? (d.best ? "Your best this week: stage " + d.best.stage + ", score " + d.best.score + "." : "")
      : "Borrowed spirits stay off the board. Hold a being to climb it.";
    const text = "I cleared " + d.stage + " stage" + (d.stage === 1 ? "" : "s") + " in REALM Duels with a score of " + d.score + ". How deep can your beings go?\n\ndmt-realm.dev/duels";
    $("[data-share]").href = "https://x.com/intent/post?text=" + encodeURIComponent(text);
    window.scrollTo({ top: 0 });
    board();
  }

  async function begin(body) {
    err(""); try {
      S = await api("/api/duel/start", body); chosen = null;
      show("duel"); paint(); window.scrollTo({ top: 0 });
    } catch (e) { err(e.message); }
  }
  $("[data-go]").addEventListener("click", () => begin({ wallet }));
  $("[data-guest]").addEventListener("click", () => begin({}));
  $("[data-again]").addEventListener("click", () => { show("intro"); window.scrollTo({ top: 0 }); });

  board();
})();
