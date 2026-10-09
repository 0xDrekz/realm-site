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

  /* ---------- sound: a tiny synth, nothing to download; muted choice remembered ---------- */
  let AC = null, muted = store.get("realm-duel-mute") === "1";
  function tone(freq, dur, type = "square", vol = 0.05, when = 0, slide = 0) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  }
  const SFX = {
    deal: i => tone(520 + i * 90, 0.07, "square", 0.03, i * 0.09),
    pick: () => tone(880, 0.05, "square", 0.035),
    flip: () => { tone(300, 0.18, "sawtooth", 0.03, 0, 900); },
    tick: () => tone(1200, 0.025, "square", 0.012),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.045, i * 0.08)),
    lose: () => { tone(220, 0.35, "triangle", 0.07, 0, 110); tone(165, 0.4, "triangle", 0.05, 0.12, 82); },
    stage: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, "square", 0.045, i * 0.07)),
    over: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, "triangle", 0.06, i * 0.16)),
  };
  function paintMute() { const b = $("[data-mute]"); if (b) { b.textContent = muted ? "Sound off" : "Sound on"; b.setAttribute("aria-pressed", String(!muted)); } }
  document.addEventListener("click", e => { if (e.target.closest("[data-mute]")) { muted = !muted; store.set("realm-duel-mute", muted ? "1" : "0"); paintMute(); if (!muted) SFX.pick(); } });

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
      + '<div class="d-tier">' + esc(c.tier) + (c.borrowed ? " · borrowed" : "") + (c.boost ? '<em class="d-boost">+' + c.boost + '%</em>' : "") + '</div>'
      + '<ul class="d-s">'
      + STATS.map(s => '<li class="' + s + hi(s) + '"><span>' + NAME[s] + '</span><b>' + c[s] + '</b><em style="width:' + Math.min(100, c[s] / 1.8) + '%"></em></li>').join("")
      + '</ul></div>';
  }

  /* ---------- the board ---------- */
  async function board() {
    try {
      const b = await api("/api/duel/board");
      $("[data-board]").innerHTML = b.top.length
        ? '<ol class="d-board">' + b.top.map((r, i) => '<li><span>' + (i + 1) + '</span><a href="/wallet?a=' + esc(r.wallet) + '">' + esc(short(r.wallet)) + '</a><b>Stage ' + r.stage + (r.level ? ' <em class="d-boost">+' + (r.level * 3) + '%</em>' : '') + '</b><i>' + r.score + '</i></li>').join("") + '</ol>'
          + '<p class="h-note">Week starting ' + esc(b.week) + ' (resets Monday 00:00 UTC).</p>'
        : '<p class="h-note">Nobody on the board yet this week. Be the first.</p>';
    } catch { $("[data-board]").innerHTML = '<p class="h-note">The board could not be read just now.</p>'; }
  }

  /* ---------- the deck: every being the wallet holds ---------- */
  let wallet = null;
  async function load(a) {
    err(""); $("[data-pick]").hidden = true;
    try {
      const { cards, boost } = await api("/api/duel/cards?address=" + encodeURIComponent(a));
      const lv = boost ? boost.level : 0;
      $("[data-boosted]").innerHTML = lv
        ? "<b>$DMT boost: +" + (lv * 3) + "% to every stat</b> for holding " + Number(boost.tokens).toLocaleString("en-GB") + " $DMT." + (lv < 5 ? " Hold " + ["", "250K", "1M", "5M", "10M"][lv] + " for +" + (lv * 3 + 3) + "%." : " The full boost.")
        : "<b>No $DMT boost yet.</b> Hold 50K $DMT with your beings for +3% to every stat, up to +15% at 10M.";
      $("[data-boosted]").classList.toggle("on", !!lv);
      document.querySelectorAll(".d-btable tr[data-lv]").forEach(tr => tr.classList.toggle("on", Number(tr.dataset.lv) === lv));
      wallet = a; store.set("realm-duel-wallet", a);
      if (!cards.length) return err("This wallet holds no beings yet. Play with borrowed spirits below, or mint one at dmt-realm.dev/mint.");
      $("[data-mine]").innerHTML = cards.map(c => cardHTML(c)).join("");
      $("[data-pick-note]").textContent = cards.length > 3
        ? "Your deck: all " + cards.length + " of your beings. Every round you are dealt three of them at random."
        : cards.length === 3 ? "Your deck: your three beings, dealt every round."
        : "Your deck: your " + (cards.length === 1 ? "being" : cards.length + " beings") + ", topped up with borrowed spirits from all 1,111 each round.";
      $("[data-go]").disabled = false; $("[data-go]").textContent = "Enter the realm";
      $("[data-pick]").hidden = false;
    } catch (e) { err(e.message); }
  }
  $("[data-find]").addEventListener("submit", e => { e.preventDefault(); const a = e.target.a.value.trim(); if (a) load(a); });
  const saved = store.get("realm-duel-wallet"); if (saved) { $("[data-find]").a.value = saved; }

  /* ---------- the duel ---------- */
  let S = null, chosen = null, busy = false, handKey = "", played = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function paint() {
    $("[data-stage]").textContent = S.stage;
    const bt = $("[data-boosttag]"); bt.hidden = !S.boostPct; bt.textContent = "$DMT boost +" + S.boostPct + "%";
    $("[data-score]").textContent = S.score;
    $("[data-rounds]").textContent = S.wins + " – " + S.losses;
    $("[data-rival]").innerHTML = S.rival.map((c, i) => '<div class="d-slot' + (c.hidden ? "" : " used") + '">' + cardHTML(c) + '</div>').join("");
    const key = S.team.map(c => c.n).join(","), fresh = key !== handKey; handKey = key;
    $("[data-hand]").innerHTML = S.team.map((c, i) => '<div class="d-slot' + (chosen === i ? " chosen" : "") + (fresh ? " deal" : "") + '" style="--d:' + (i * 90) + 'ms" data-i="' + i + '">' + cardHTML(c) + '</div>').join("");
    if (fresh) S.team.forEach((_, i) => SFX.deal(i));
    $("[data-pips]").innerHTML = [1, 2, 3].map(r => { const L = (S.log || [])[r - 1]; return '<i class="' + (L ? (L.won ? "w" : "l") : r === S.round ? "now" : "") + '"></i>'; }).join("");
    const youCall = S.caller === "you";
    $("[data-call]").innerHTML = '<b>Round ' + S.round + ' of 3</b>' + (youCall ? "A fresh hand. You call the stat: pick a card, then name the stat." : "A fresh hand. The rival calls the stat this round: pick the card you think can stand up to it.");
    $("[data-stats]").hidden = !(youCall && chosen != null);
    $("[data-play]").hidden = !(!youCall && chosen != null);
  }
  $("[data-hand]").addEventListener("click", e => {
    const el = e.target.closest("[data-i]"); if (!el || busy || !$("[data-arena]").hidden) return;
    const i = Number(el.dataset.i);
    chosen = i; SFX.pick(); paint();
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
  async function reveal(d) {
    const L = d.last, mine = d.played || S.team.find(c => c.n === L.you), theirs = d.rival.find(c => !c.hidden && c.n === L.rival);
    played.push({ c: mine, won: L.won });
    $("[data-stats]").hidden = true; $("[data-play]").hidden = true;
    const a = $("[data-arena]");
    a.innerHTML = '<p class="d-said">' + (L.caller === "you" ? "You call" : "The rival calls") + ' <b>' + NAME[L.stat] + '</b></p>'
      + '<div class="d-face"><div class="d-mine">' + cardHTML(mine, { stat: L.stat }) + '</div>'
      + '<span class="d-vs"><b data-y>0</b><i>vs</i><b data-t>?</b></span>'
      + '<div class="d-flip"><div class="d-flip-in"><div class="d-flip-front">' + cardHTML(theirs, { stat: L.stat }) + '</div>'
      + '<div class="d-flip-back">' + cardHTML({ hidden: true, tier: theirs.tier }) + '</div></div></div></div>'
      + '<p class="d-verdict" data-verdict>&nbsp;</p>';
    a.hidden = false; a.scrollIntoView({ behavior: "smooth", block: "center" });
    S = { ...S, ...d, team: S.team }; chosen = null;
    const nx = $("[data-next]"); nx.hidden = true;
    // the rival's picture is ready before its card turns over
    await Promise.all([sleep(450), Promise.race([loadImg(theirs.img), sleep(1500)])]);
    SFX.flip(); a.querySelector(".d-flip").classList.add("go");
    await sleep(520);
    // both numbers climb together, then settle
    const yEl = a.querySelector("[data-y]"), tEl = a.querySelector("[data-t]"), steps = 18;
    for (let k = 1; k <= steps; k++) { yEl.textContent = Math.round(L.yours * k / steps); tEl.textContent = Math.round(L.theirs * k / steps); if (k % 3 === 0) SFX.tick(); await sleep(28); }
    const win = a.querySelector(L.won ? ".d-mine .d-card" : ".d-flip-front .d-card"), lose = a.querySelector(L.won ? ".d-flip-front .d-card" : ".d-mine .d-card");
    win.classList.add("win"); lose.classList.add("lose");
    (L.won ? yEl : tEl).classList.add("big");
    const v = a.querySelector("[data-verdict]"); v.className = "d-verdict show " + (L.won ? "good" : "bad");
    v.textContent = L.won ? "You take the round" : "The rival takes the round";
    if (L.won) { SFX.win(); sparks(win); } else SFX.lose();
    $("[data-rounds]").textContent = d.wins + " – " + d.losses; $("[data-score]").textContent = d.score;
    $("[data-pips]").innerHTML = [1, 2, 3].map(r => { const x = d.log[r - 1]; return '<i class="' + (x ? (x.won ? "w" : "l") : "") + '"></i>'; }).join("");
    await sleep(500);
    if (d.result === "won") { banner("Stage " + d.stage + " cleared", "+" + (50 * d.stage) + " bonus"); SFX.stage(); nx.textContent = "Deal stage " + d.next.stage; after = () => { S = d.next; }; }
    else if (d.result === "lost") { SFX.over(); nx.textContent = "See your run"; after = () => over(d); }
    else { const fresh = d.team; nx.textContent = "Deal round " + d.round; after = () => { S.team = fresh; }; }
    nx.hidden = false;
  }
  /* little pixel sparks off the winning card */
  function sparks(el) {
    const r = el.getBoundingClientRect(), box = document.createElement("div"); box.className = "d-sparks";
    box.style.left = (r.left + r.width / 2) + "px"; box.style.top = (r.top + r.height / 2) + "px";
    const cols = ["#e3ba5c", "#9ff5d2", "#ff9ae6", "#fff3c4"];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("i"), ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 110;
      s.style.setProperty("--x", Math.cos(ang) * dist + "px"); s.style.setProperty("--y", Math.sin(ang) * dist + "px");
      s.style.background = cols[i % cols.length]; s.style.animationDelay = (Math.random() * 120) + "ms"; box.appendChild(s);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 1200);
  }
  function banner(big, small) {
    const b = document.createElement("div"); b.className = "d-banner";
    b.innerHTML = "<b>" + esc(big) + "</b><span>" + esc(small) + "</span>";
    document.body.appendChild(b); setTimeout(() => b.remove(), 1900);
  }
  $("[data-next]").addEventListener("click", () => {
    $("[data-next]").hidden = true; $("[data-arena]").hidden = true;
    const f = after; after = null; f && f();
    if (S && !S.over) { paint(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });

  function over(d) {
    show("over");
    $("[data-over-stage]").textContent = d.stage; $("[data-over-score]").textContent = d.score;
    const title = d.stage >= 8 ? "A legend of the realm" : d.stage >= 4 ? "Deep into the realm" : d.stage >= 1 ? "You crossed the threshold" : "The realm turned you back";
    $("[data-over-title]").textContent = title;
    $("[data-over-note]").textContent = d.wallet
      ? (d.best ? "Your best this week: stage " + d.best.stage + ", score " + d.best.score + "." : "")
      : "Borrowed spirits stay off the board. Hold a being to climb it.";
    const text = "I cleared " + d.stage + " stage" + (d.stage === 1 ? "" : "s") + " in REALM Duels with a score of " + d.score + ". How deep can your beings go?\n\ndmt-realm.dev/duels";
    $("[data-share]").href = "https://x.com/intent/post?text=" + encodeURIComponent(text);
    window.scrollTo({ top: 0 });
    shareCard(d, title, text);
    board();
  }

  /* the run as a picture: the stage, the score and the three strongest beings that won rounds */
  const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
  const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  async function shareCard(d, title, text) {
    const wrap = $("[data-pic]"); wrap.hidden = true;
    try {
      await (document.fonts && document.fonts.ready);
      const seen = new Set(), heroes = played.filter(p => p.won).concat(played).map(p => p.c)
        .filter(c => !seen.has(c.n) && seen.add(c.n))
        .sort((x, y) => TIERS.indexOf(y.tier) - TIERS.indexOf(x.tier) || y.total - x.total).slice(0, 3);
      const W = 1200, H = 675, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
      const bg = g.createRadialGradient(W / 2, 120, 40, W / 2, 300, 760); bg.addColorStop(0, "#3a1f5c"); bg.addColorStop(1, "#07040f");
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) { g.fillStyle = ["#e3ba5c", "#9ff5d2", "#ff9ae6"][i % 3] + "88"; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
      g.strokeStyle = "#e3ba5c"; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
      g.textAlign = "center"; g.fillStyle = "#e3ba5c"; g.font = "700 64px 'Pixelify Sans', monospace"; g.fillText("REALM DUELS", W / 2, 96);
      g.fillStyle = "#f4efe4"; g.font = "700 38px 'Space Grotesk', sans-serif"; g.fillText(title, W / 2, 150);
      const cw = 230, gap = 40, x0 = W / 2 - (heroes.length * cw + (heroes.length - 1) * gap) / 2;
      const imgs = await Promise.all(heroes.map(c => loadImg(c.img)));
      heroes.forEach((c, i) => {
        const x = x0 + i * (cw + gap), y = 190, col = COL[c.tier];
        g.shadowColor = col; g.shadowBlur = 30; g.fillStyle = col; g.fillRect(x - 6, y - 6, cw + 12, cw + 12); g.shadowBlur = 0;
        if (imgs[i]) g.drawImage(imgs[i], x, y, cw, cw); else { g.fillStyle = "#120a1f"; g.fillRect(x, y, cw, cw); }
        g.fillStyle = col; g.fillRect(x - 6, y + cw + 6, cw + 12, 34);
        g.fillStyle = "#120a1f"; g.font = "700 20px 'Space Grotesk', sans-serif"; g.fillText(c.tier.toUpperCase() + "  #" + c.n, x + cw / 2, y + cw + 30);
      });
      g.fillStyle = "#f4efe4"; g.font = "700 46px 'Space Grotesk', sans-serif";
      g.fillText("Stage " + d.stage + "   ·   Score " + d.score, W / 2, 545);
      g.fillStyle = "#b9aedb"; g.font = "500 26px 'Space Grotesk', sans-serif";
      g.fillText((d.wallet ? short(d.wallet) + "  ·  " : "") + (d.boostPct ? "$DMT boost +" + d.boostPct + "%  ·  " : "") + "How deep can your beings go?", W / 2, 590);
      g.fillStyle = "#e3ba5c"; g.font = "700 30px 'Space Grotesk', sans-serif"; g.fillText("dmt-realm.dev/duels", W / 2, 638);
      const url = cv.toDataURL("image/png");
      $("[data-pic-img]").src = url;
      const dl = $("[data-pic-save]"); dl.href = url; dl.download = "realm-duels-stage-" + d.stage + ".png";
      const sh = $("[data-pic-share]"); sh.hidden = true;
      const blob = await (await fetch(url)).blob(), file = new File([blob], dl.download, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        sh.hidden = false; sh.onclick = () => navigator.share({ files: [file], text }).catch(() => {});
      }
      wrap.hidden = false;
    } catch { wrap.hidden = true; }
  }

  async function begin(body) {
    err(""); try {
      S = await api("/api/duel/start", body); chosen = null; handKey = ""; played = [];
      show("duel"); paint(); window.scrollTo({ top: 0 });
    } catch (e) { err(e.message); }
  }
  $("[data-go]").addEventListener("click", () => begin({ wallet }));
  $("[data-guest]").addEventListener("click", () => begin({}));
  $("[data-again]").addEventListener("click", () => { show("intro"); window.scrollTo({ top: 0 }); });

  paintMute();
  board();
})();
