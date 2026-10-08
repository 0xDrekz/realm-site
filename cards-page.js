/* dmt-realm.dev/cards: the page around the card game in tcg.js. Nothing is decided here. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const TIER = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#fff7d6" };
  const EL = { light: "#ffd76a", dark: "#be4678", spirit: "#4fe0b0", magic: "#c06bff", knowledge: "#59a8ff" };
  const STATS = ["light", "dark", "spirit", "magic", "knowledge"];
  const BEATS = { light: "dark", dark: "spirit", spirit: "magic", magic: "knowledge", knowledge: "light" };
  const cap = s => s[0].toUpperCase() + s.slice(1);
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
        ? '<ol class="c-board">' + b.top.map((r, i) => '<li><span>' + (i + 1) + '</span><a href="/wallet?a=' + esc(r.wallet) + '">' + esc(short(r.wallet)) + (r.level ? ' <em>Lv ' + r.level + '</em>' : '') + '</a><b>' + r.wins + ' wins</b><i>best streak ' + r.best + '</i></li>').join("") + '</ol>'
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
        ? "<b>Blessed · Lv " + lv + "</b> " + Number(p.bless.tokens).toLocaleString("en-GB") + " $DMT: +" + (lv * 5) + "% HP and damage" + (lv >= 3 ? ", +1 Essence" : "") + (lv >= 5 ? ", an extra card" : "") + "."
        : "<b>Not blessed yet.</b> Hold 50,000 $DMT or more with your beings to bless your champions.";
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

  /* ---------- the match ---------- */
  let M = null, mode = null, busy = false;    // mode: {kind:"ritual", hi, r} | {kind:"attack", ai} | {kind:"aim", ai, stat}
  const multFor = (e, target) => BEATS[e] === target.element ? 1.5 : BEATS[target.element] === e ? 0.75 : 1;

  function champHTML(c, side, i) {
    const pct = Math.max(0, Math.round(100 * c.hp / c.maxHp));
    let cls = "c-champ" + (c.hp <= 0 ? " out" : "");
    let tag = "";
    if (mode && c.hp > 0) {
      if (mode.kind === "ritual") {
        const t = mode.r.target;
        if ((t === "enemy" && side === "rival" && !c.hidden) || (t === "ally" && side === "you") || (t === "any" && !(side === "rival" && c.hidden))) cls += " target";
      } else if (mode.kind === "attack" && side === "you" && i === mode.ai) cls += " chosen";
      else if (mode.kind === "aim") {
        if (side === "you" && i === mode.ai) cls += " chosen";
        if (side === "rival" && !c.hidden) {
          cls += " target";
          const m = multFor(mode.stat, c);
          tag = m > 1 ? '<span class="c-tag good">Strong</span>' : m < 1 ? '<span class="c-tag bad">Resisted</span>' : "";
        }
      }
    } else if (!mode && side === "you" && c.hp > 0 && M && !M.you.attacked && !M.over) cls += " ready";
    const flags = (c.shield ? '<span title="Shield">&#9711; ' + c.shield + '</span>' : "") + (c.block ? '<span title="Blocks the next attack">&#9670; block</span>' : "")
      + (c.hidden ? '<span title="Shrouded">&#9673; shrouded</span>' : "") + (c.buffed ? '<span title="Buffed until its next turn">&#9650; buffed</span>' : "") + (c.borrowed ? '<span>borrowed</span>' : "");
    return '<div class="' + cls + '" style="--c:' + TIER[c.tier] + ';--e:' + EL[c.element] + '" data-side="' + side + '" data-i="' + i + '" role="button" tabindex="0">'
      + tag
      + '<div class="c-pic"><img src="' + esc(c.img) + '" alt=""><em class="c-el">' + esc(c.element) + '</em></div>'
      + '<div class="c-name"><b>' + esc(nameOf(c)) + '</b><i>' + esc(c.tier) + '</i></div>'
      + '<div class="c-hp"><i style="width:' + pct + '%"></i><span>' + c.hp + ' / ' + c.maxHp + '</span></div>'
      + (flags ? '<div class="c-flags">' + flags + '</div>' : "")
      + '</div>';
  }
  function ritualHTML(r, hi, can) {
    const col = r.element ? EL[r.element] : "#e3ba5c";
    return '<div class="c-rite' + (can ? "" : " dim") + (mode && mode.kind === "ritual" && mode.hi === hi ? " chosen" : "") + '" style="--e:' + col + '" data-hi="' + hi + '" role="button" tabindex="0">'
      + '<span class="c-cost">' + r.cost + '</span><b>' + esc(r.name) + '</b>'
      + '<div class="c-rart">' + (artOf(r.art) ? '<img src="' + artOf(r.art) + '" alt="" loading="lazy">' : "") + '</div>'
      + '<em>' + esc(r.element ? r.element : "neutral") + ' · ' + esc(r.rarity) + '</em><p>' + esc(r.text) + '</p></div>';
  }

  function paint() {
    const S = M;
    $("[data-rival]").innerHTML = S.rival.champs.map((c, i) => champHTML(c, "rival", i)).join("");
    $("[data-you]").innerHTML = S.you.champs.map((c, i) => champHTML(c, "you", i)).join("");
    $("[data-rhand]").innerHTML = Array.isArray(S.rival.hand) ? "Hand: " + S.rival.hand.map(r => esc(r.name)).join(", ") : S.rival.hand + " cards in hand · " + S.rival.deck + " in deck";
    const gems = Array.from({ length: Math.max(S.you.maxEssence, S.you.essence) }, (_, i) => '<i class="' + (i < S.you.essence ? "on" : "") + '"></i>').join("");
    $("[data-ess]").innerHTML = "Essence <b>" + S.you.essence + "</b> " + gems;
    $("[data-meta]").textContent = "Turn " + Math.ceil(S.turn / 2) + " · deck " + S.you.deck + (S.you.bless.level ? " · Blessed Lv " + S.you.bless.level : "");
    $("[data-log]").innerHTML = S.log.slice(-6).map(l => "<p>" + esc(l) + "</p>").join("");
    $("[data-log]").scrollTop = 1e6;
    $("[data-hand]").innerHTML = S.you.hand.length ? S.you.hand.map((r, i) => ritualHTML(r, i, r.cost <= S.you.essence)).join("") : '<p class="h-note">No cards in hand.</p>';
    // the prompt and the stat buttons
    const st = $("[data-stats]");
    if (mode && mode.kind === "attack") {
      const a = S.you.champs[mode.ai];
      st.innerHTML = STATS.map(s => '<button type="button" data-stat="' + s + '" style="--e:' + EL[s] + '"><span>' + cap(s) + '</span><b>' + a.stats[s] + '</b><i>hits ' + Math.round(a.stats[s] * 0.25 * (S.you.warm ? 1.5 : 1)) + '</i></button>').join("");
      st.hidden = false;
    } else st.hidden = true;
    $("[data-prompt]").textContent = !mode ? (S.you.attacked ? "You have attacked this turn. Cast rituals or end your turn." : "Cast rituals from your hand, or tap one of your champions to attack.")
      : mode.kind === "ritual" ? "Pick a champion for " + mode.r.name + "."
      : mode.kind === "attack" ? "Attack with which stat? Higher stat, harder hit. Match the element circle for 1.5x."
      : "Pick an enemy to hit with " + cap(mode.stat) + ".";
    $("[data-cancel]").hidden = !mode;
    $("[data-end]").disabled = busy;
  }

  async function send(body) {
    if (busy) return; busy = true; paint();
    try {
      const d = await api("/api/tcg/act", { match: M.match, ...body });
      M = d; mode = null;
      if (d.over) return over(d);
    } catch (e) { flash(e.message); mode = null; }
    busy = false; paint();
  }
  function flash(m) { const p = $("[data-prompt]"); p.textContent = m; p.classList.add("bad"); setTimeout(() => p.classList.remove("bad"), 1800); }

  $("[data-hand]").addEventListener("click", e => {
    const el = e.target.closest("[data-hi]"); if (!el || busy) return;
    const hi = Number(el.dataset.hi), r = M.you.hand[hi];
    if (r.cost > M.you.essence) return flash("Not enough Essence for " + r.name + ".");
    if (r.target === "none") return send({ type: "ritual", card: hi });
    mode = { kind: "ritual", hi, r }; paint();
    $("[data-rival]").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  document.querySelector("[data-screen=match]").addEventListener("click", e => {
    const el = e.target.closest(".c-champ"); if (!el || busy || !M || M.over) return;
    const side = el.dataset.side, i = Number(el.dataset.i), c = M[side].champs[i];
    if (c.hp <= 0) return;
    if (mode && mode.kind === "ritual") {
      if (!el.classList.contains("target")) return flash("That champion cannot be picked for " + mode.r.name + ".");
      return send({ type: "ritual", card: mode.hi, target: { side, i } });
    }
    if (mode && mode.kind === "aim") {
      if (side === "rival") return send({ type: "attack", attacker: mode.ai, stat: mode.stat, target: { i } });
      if (side === "you") { mode = { kind: "attack", ai: i }; return paint(); }
    }
    if (side === "you") {
      if (M.you.attacked) return flash("You have already attacked this turn.");
      mode = { kind: "attack", ai: i }; paint();
      $("[data-stats]").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  $("[data-stats]").addEventListener("click", e => {
    const b = e.target.closest("[data-stat]"); if (!b || !mode) return;
    mode = { kind: "aim", ai: mode.ai, stat: b.dataset.stat }; paint();
    $("[data-rival]").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("[data-cancel]").addEventListener("click", () => { mode = null; paint(); });
  $("[data-end]").addEventListener("click", () => { mode = null; send({ type: "end" }); });

  function over(d) {
    busy = false; show("over"); window.scrollTo({ top: 0 });
    const won = d.winner === "you";
    $("[data-over-title]").textContent = won ? "Victory in the realm" : "The realm turned you back";
    $("[data-over-note]").textContent = (won ? "All three rival champions knocked out." : "Your champions fell.") + (d.wallet ? " This week's wins are on the board." : " Borrowed spirits stay off the board. Hold a being to climb it.");
    const text = (won ? "Won a match" : "Fought a match") + " in REALM: The Card Game" + (d.you.bless.level ? ", blessed at Lv " + d.you.bless.level : "") + ". Your beings are your champions.\n\ndmt-realm.dev/cards";
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
