/* dmt-realm.dev/cards: the page around the card game in tcg.js. Nothing is decided here. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const TIER = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#fff7d6" };
  const EL = { light: "#ffd76a", dark: "#be4678", spirit: "#4fe0b0", magic: "#c06bff", knowledge: "#59a8ff" };
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let ART = [];
  fetch("art-ids.json").then(r => r.json()).then(a => { ART = a; }).catch(() => {});
  const artOf = n => ART[n - 1] ? "/img/" + ART[n - 1] : "";

  const show = name => document.querySelectorAll("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; });
  const err = m => { const e = $("[data-err]"); e.textContent = m || ""; e.hidden = !m; };
  async function api(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({ error: "The realm did not answer. Try again." }));
    if (!r.ok || j.error) throw new Error(j.error || "Something went wrong.");
    return j;
  }
  const nameOf = c => c.being && !/\d$/.test(c.being) ? c.being : c.tier;

  /* ---------- the board ---------- */
  async function board() {
    try {
      const b = await api("/api/tcg/board");
      $("[data-board]").innerHTML = b.top.length
        ? '<ol class="c-board">' + b.top.map((r, i) => '<li><span>' + (i + 1) + '</span><a href="/wallet?a=' + esc(r.wallet) + '">' + esc(short(r.wallet)) + (r.level ? ' <em>blessed</em>' : '') + '</a><b>' + r.wins + ' wins</b><i>best streak ' + r.best + '</i></li>').join("") + '</ol>'
          + '<p class="h-note">Week starting ' + esc(b.week) + ' (resets Monday 00:00 UTC).</p>'
        : '<p class="h-note">No wins on the board yet this week. Be the first.</p>';
    } catch { $("[data-board]").innerHTML = '<p class="h-note">The board could not be read just now.</p>'; }
  }

  /* ---------- choosing champions ---------- */
  let wallet = null, picked = [];
  function pickCard(c) {
    return '<div class="c-pick" style="--c:' + TIER[c.tier] + '" data-n="' + c.n + '" role="button" tabindex="0">'
      + '<img src="' + esc(c.img) + '" alt="" loading="lazy"><b>' + esc(nameOf(c)) + '</b><i>' + esc(c.tier) + ' · #' + c.n + '</i></div>';
  }
  async function load(a) {
    err(""); $("[data-pick]").hidden = true;
    try {
      const p = await api("/api/tcg/profile?address=" + encodeURIComponent(a));
      wallet = a; store.set("realm-duel-wallet", a);
      if (!p.cards.length) return err("This wallet holds no beings yet. Play with borrowed spirits below, or mint one at dmt-realm.dev/mint.");
      const lv = p.bless.level;
      $("[data-blessed]").innerHTML = lv
        ? "<b>Blessed: +" + Math.round((p.bless.boost - 1) * 100) + "% HP and Attack</b> for holding " + Number(p.bless.tokens).toLocaleString("en-GB") + " $DMT."
        : "<b>Not blessed yet.</b> Hold 50,000 $DMT or more with your beings and your champions get stronger.";
      document.querySelectorAll(".c-bless tr[data-lv]").forEach(tr => tr.classList.toggle("on", Number(tr.dataset.lv) === lv));
      picked = p.cards.slice(0, 3).map(c => c.n);
      $("[data-mine]").innerHTML = p.cards.map(pickCard).join("");
      $("[data-pick-note]").textContent = p.cards.length > 3 ? "Choose three champions. Your strongest three are picked to start."
        : p.cards.length === 3 ? "Your three champions." : "You hold " + p.cards.length + ". The rest of your team will be borrowed spirits.";
      paintPick(); $("[data-pick]").hidden = false;
    } catch (e) { err(e.message); }
  }
  function paintPick() {
    const all = document.querySelectorAll("[data-mine] [data-n]");
    all.forEach(el => el.classList.toggle("on", picked.includes(Number(el.dataset.n))));
    const need = Math.min(3, all.length);
    $("[data-go]").disabled = picked.length !== need;
    $("[data-go]").textContent = picked.length === need ? "Enter the match" : "Pick " + (need - picked.length) + " more";
  }
  $("[data-mine]").addEventListener("click", e => {
    const el = e.target.closest("[data-n]"); if (!el) return;
    const n = Number(el.dataset.n);
    if (picked.includes(n)) picked = picked.filter(x => x !== n); else if (picked.length < 3) picked.push(n);
    paintPick();
  });
  $("[data-find]").addEventListener("submit", e => { e.preventDefault(); const a = e.target.a.value.trim(); if (a) load(a); });
  const saved = store.get("realm-duel-wallet"); if (saved) $("[data-find]").a.value = saved;

  /* ---------- the match: one move a turn ---------- */
  let M = null, mode = null, busy = false;    // mode: {kind:"spell", hi, s} | {kind:"attack", ai}

  function champHTML(c, side, i) {
    const pct = Math.max(0, Math.round(100 * c.hp / c.maxHp));
    let cls = "c-champ" + (c.hp <= 0 ? " out" : "");
    if (c.hp > 0 && M && !M.over) {
      if (mode && mode.kind === "spell") { if ((mode.s.target === "enemy" && side === "rival") || (mode.s.target === "ally" && side === "you")) cls += " target"; }
      else if (mode && mode.kind === "attack") { if (side === "you" && i === mode.ai) cls += " chosen"; if (side === "rival") cls += " target"; }
      else if (side === "you") cls += " ready";
    }
    return '<div class="' + cls + '" style="--c:' + TIER[c.tier] + '" data-side="' + side + '" data-i="' + i + '" role="button" tabindex="0">'
      + '<div class="c-pic"><img src="' + esc(c.img) + '" alt=""><em class="c-atk" title="Attack">' + c.atk + '</em>' + (c.block ? '<em class="c-blk" title="Blocks the next attack">&#9670;</em>' : "") + '</div>'
      + '<div class="c-name"><b>' + esc(nameOf(c)) + '</b><i>' + esc(c.tier) + (c.borrowed ? " · borrowed" : "") + '</i></div>'
      + '<div class="c-hp"><i style="width:' + pct + '%"></i><span>' + c.hp + ' HP</span></div>'
      + '</div>';
  }
  function spellHTML(s, hi) {
    return '<div class="c-rite' + (mode && mode.kind === "spell" && mode.hi === hi ? " chosen" : "") + '" style="--e:' + EL[s.element] + '" data-hi="' + hi + '" role="button" tabindex="0">'
      + '<b>' + esc(s.name) + '</b>'
      + '<div class="c-rart">' + (artOf(s.art) ? '<img src="' + artOf(s.art) + '" alt="" loading="lazy">' : "") + '</div>'
      + '<p>' + esc(s.text) + '</p></div>';
  }

  function paint() {
    const S = M;
    $("[data-rival]").innerHTML = S.rival.champs.map((c, i) => champHTML(c, "rival", i)).join("");
    $("[data-you]").innerHTML = S.you.champs.map((c, i) => champHTML(c, "you", i)).join("");
    $("[data-meta]").textContent = S.you.bless.level ? "Blessed +" + Math.round((S.you.bless.boost - 1) * 100) + "%" : "";
    $("[data-log]").innerHTML = S.log.slice(-5).map(l => "<p>" + esc(l) + "</p>").join("");
    $("[data-log]").scrollTop = 1e6;
    $("[data-hand]").innerHTML = S.you.hand.map(spellHTML).join("");
    $("[data-prompt]").textContent = busy ? "The rival is moving…"
      : !mode ? "Your move: tap one of your champions to attack, or tap a spell."
      : mode.kind === "spell" ? (mode.s.target === "enemy" ? "Tap an enemy for " : "Tap one of your champions for ") + mode.s.name + "."
      : "Now tap the enemy to attack.";
    $("[data-cancel]").hidden = !mode;
  }

  async function send(body) {
    if (busy) return; busy = true; mode = null; paint();
    try {
      const d = await api("/api/tcg/act", { match: M.match, ...body });
      M = d;
      if (d.over) { busy = false; paint(); return setTimeout(() => over(d), 1400); }
    } catch (e) { flash(e.message); }
    busy = false; paint();
  }
  function flash(m) { const p = $("[data-prompt]"); p.textContent = m; p.classList.add("bad"); setTimeout(() => { p.classList.remove("bad"); paint(); }, 1800); }

  $("[data-hand]").addEventListener("click", e => {
    const el = e.target.closest("[data-hi]"); if (!el || busy || M.over) return;
    const hi = Number(el.dataset.hi), s = M.you.hand[hi];
    if (s.target === "none") return send({ type: "spell", card: hi });
    mode = { kind: "spell", hi, s }; paint();
    $(s.target === "enemy" ? "[data-rival]" : "[data-you]").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  document.querySelector("[data-screen=match]").addEventListener("click", e => {
    const el = e.target.closest(".c-champ"); if (!el || busy || !M || M.over) return;
    const side = el.dataset.side, i = Number(el.dataset.i);
    if (M[side].champs[i].hp <= 0) return;
    if (mode && mode.kind === "spell") {
      if (!el.classList.contains("target")) return flash(mode.s.target === "enemy" ? "Tap an enemy for " + mode.s.name + "." : "Tap one of your own champions for " + mode.s.name + ".");
      return send({ type: "spell", card: mode.hi, target: { i } });
    }
    if (side === "you") { mode = { kind: "attack", ai: i }; paint(); return $("[data-rival]").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    if (side === "rival") {
      if (mode && mode.kind === "attack") return send({ type: "attack", attacker: mode.ai, target: { i } });
      flash("First tap one of your champions, then the enemy to attack.");
    }
  });
  $("[data-cancel]").addEventListener("click", () => { mode = null; paint(); });

  function over(d) {
    busy = false; show("over"); window.scrollTo({ top: 0 });
    const won = d.winner === "you";
    $("[data-over-title]").textContent = won ? "Victory in the realm" : "The realm turned you back";
    $("[data-over-note]").textContent = (won ? "All three rival champions knocked out." : "Your champions fell.") + (d.wallet ? " This week's wins are on the board." : " Borrowed spirits stay off the board. Hold a being to climb it.");
    const text = (won ? "Won a match" : "Fought a match") + " in REALM: The Card Game" + (d.you.bless.level ? ", blessed +" + Math.round((d.you.bless.boost - 1) * 100) + "% by $DMT" : "") + ". The beings are the car, $DMT is the fuel.\n\ndmt-realm.dev/cards";
    $("[data-share]").href = "https://x.com/intent/post?text=" + encodeURIComponent(text);
    board();
  }

  async function begin(body) {
    err(""); try { M = await api("/api/tcg/start", body); mode = null; busy = false; show("match"); paint(); window.scrollTo({ top: 0 }); }
    catch (e) { err(e.message); }
  }
  $("[data-go]").addEventListener("click", () => begin({ wallet, champions: picked }));
  $("[data-guest]").addEventListener("click", () => begin({}));
  $("[data-again]").addEventListener("click", () => { show("intro"); window.scrollTo({ top: 0 }); });

  board();
})();
