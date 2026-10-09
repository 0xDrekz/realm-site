/* ============================================================
   REALM — the Card Codex page.
   Reads every card once from /api/codex (worked out on the server by the
   same generator the game uses), then searches, filters and draws them
   here. Pictures are the small /thumbs, never the full-size art.
   ============================================================ */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
  const ESS = ["magic", "spirit", "knowledge", "light", "dark"];
  const { ESS_COL, TIER_COL, FOIL, cap, esc } = window.RealmCard;
  let CARDS = [], BY = new Map(), shown = [], drawn = 0, open = null;
  const state = { q: "", tiers: new Set(), ess: new Set(), sort: "n" };

  const cardHtml = c => window.RealmCard.html(c);

  /* ---------- finding ---------- */
  function hay(c) {
    return [c.name, "#" + c.n, String(c.n), c.tier, c.unique || "", c.essence.join(" "), c.kw.join(" "), c.text,
      ...Object.entries(c.traits).map(([k, v]) => k + " " + v)].join(" ").toLowerCase();
  }
  function filter() {
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    shown = CARDS.filter(c => (!state.tiers.size || state.tiers.has(c.tier)) && (!state.ess.size || c.essence.some(e => state.ess.has(e)))
      && words.every(w => /^#?\d+$/.test(w) ? c.n === Number(w.replace("#", "")) : c._h.includes(w)));
    const rank = c => TIERS.indexOf(c.tier);
    if (state.sort === "rare") shown.sort((a, b) => rank(b) - rank(a) || a.n - b.n);
    else if (state.sort === "power") shown.sort((a, b) => b.power - a.power || b.health - a.health || a.n - b.n);
    else if (state.sort === "health") shown.sort((a, b) => b.health - a.health || b.power - a.power || a.n - b.n);
    else shown.sort((a, b) => a.n - b.n);
    $("[data-count]").textContent = shown.length === CARDS.length ? `All ${CARDS.length.toLocaleString()} cards` : `${shown.length.toLocaleString()} of ${CARDS.length.toLocaleString()} cards`;
    $("[data-grid]").innerHTML = shown.length ? "" : '<p class="cx-empty">No card matches that. Try a name, a number like 842, or a power like flying.</p>';
    drawn = 0; more();
  }
  const PAGE = 36;
  function more() {
    if (drawn >= shown.length) return;
    const html = shown.slice(drawn, drawn + PAGE).map(c => `<button class="cx-slot" type="button" data-n="${c.n}" aria-label="${esc(c.name)}, ${c.tier}, cost ${c.cost}, ${c.power} power, ${c.health} health">${cardHtml(c)}</button>`).join("");
    $("[data-grid]").insertAdjacentHTML("beforeend", html);
    drawn += PAGE;
  }

  /* ---------- the sheet ---------- */
  function info(c) {
    const max = Math.max(160, ...ESS.map(e => c.stats[e]));
    const traits = Object.entries(c.traits).map(([k, v]) => `<span><i>${esc(k)}</i>${esc(v)}</span>`).join("");
    return `<h2>${esc(c.name)}</h2>
<p class="cx-sub">#${c.n} · ${c.tier} · ${c.essence.map(cap).join(" / ")}</p>
<p class="cx-power">Costs <b>${c.cost}</b> essence. <b>${c.power}</b> power, <b>${c.health}</b> health.${c.unique ? ` Carries the unique power <b>${esc(c.unique)}</b>.` : ""}</p>
<div class="cx-bars">${ESS.map(e => `<div class="cx-bar"><span>${cap(e)}</span><i style="--w:${(100 * c.stats[e] / max).toFixed(1)}%;--c:${ESS_COL[e]}"></i><b>${c.stats[e]}</b></div>`).join("")}</div>
<div class="cx-traits">${traits}</div>`;
  }
  function show(n, push = true) {
    const c = BY.get(n); if (!c) return;
    open = c;
    $("[data-big]").innerHTML = cardHtml(c);
    $("[data-info]").innerHTML = info(c);
    $("[data-shared]").hidden = true;
    const url = location.origin + "/codex#" + c.n;
    $("[data-x]").href = "https://x.com/intent/post?text=" + encodeURIComponent(`${c.name}: a ${c.tier} card in the REALM Codex. ${c.power} power, ${c.health} health.`) + "&url=" + encodeURIComponent(url);
    const sh = $("[data-sheet]"); sh.hidden = false; document.body.style.overflow = "hidden";
    if (push && location.hash !== "#" + n) history.replaceState(null, "", "#" + n);
    tilt($("[data-big] .cc"));
  }
  function close() {
    $("[data-sheet]").hidden = true; document.body.style.overflow = ""; open = null;
    history.replaceState(null, "", location.pathname + location.search);
  }
  function step(d) {
    if (!open) return;
    const list = shown.length ? shown : CARDS, i = list.findIndex(c => c.n === open.n);
    const next = list[(i + d + list.length) % list.length]; if (next) show(next.n);
  }

  /* the big card leans toward your finger and its foil slides */
  function tilt(el) {
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.parentElement;
    const move = (x, y) => {
      const r = el.getBoundingClientRect(), px = (x - r.left) / r.width - .5, py = (y - r.top) / r.height - .5;
      el.style.transform = `rotateY(${(px * 16).toFixed(2)}deg) rotateX(${(-py * 16).toFixed(2)}deg)`;
      el.style.setProperty("--fx", (50 + px * 90).toFixed(1) + "%"); el.style.setProperty("--fy", (50 + py * 90).toFixed(1) + "%");
    };
    const reset = () => { el.style.transform = ""; el.style.removeProperty("--fx"); el.style.removeProperty("--fy"); };
    box.onpointermove = e => move(e.clientX, e.clientY);
    box.onpointerleave = reset;
  }

  /* ---------- a picture of the card, to save or share ---------- */
  const loadImg = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  function rr(x, ctx, X, Y, W, H, R) { ctx.beginPath(); ctx.moveTo(X + R, Y); ctx.arcTo(X + W, Y, X + W, Y + H, R); ctx.arcTo(X + W, Y + H, X, Y + H, R); ctx.arcTo(X, Y + H, X, Y, R); ctx.arcTo(X, Y, X + W, Y, R); ctx.closePath(); }
  function wrap(ctx, text, maxW) {
    const out = []; let line = "";
    for (const w of text.split(" ")) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); return out;
  }
  async function picture(c) {
    await document.fonts.ready;
    const W = 750, H = 1050, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d"), tc = TIER_COL[c.tier], e1 = ESS_COL[c.essence[0]], e2 = ESS_COL[c.essence[1] || c.essence[0]];
    x.fillStyle = "#03010a"; x.fillRect(0, 0, W, H);
    // frame
    let g;
    if (c.tier === "Source" && x.createConicGradient) { g = x.createConicGradient(3.6, W / 2, H / 2); ["#ff5cc8", "#ffd65c", "#5cffb0", "#4fa8ff", "#d65cff", "#ff5cc8"].forEach((col, i) => g.addColorStop(i / 5, col)); }
    else { g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#fff"); g.addColorStop(.18, tc); g.addColorStop(.6, "#1a0f2a"); g.addColorStop(1, tc); }
    x.save(); x.shadowColor = tc; x.shadowBlur = FOIL.has(c.tier) ? 40 : 14; rr(0, x, 20, 20, W - 40, H - 40, 40); x.fillStyle = g; x.fill(); x.restore();
    // panel
    const P = 38; const pg = x.createLinearGradient(0, P, 0, H - P);
    pg.addColorStop(0, mix(e1, "#0b0616", .22)); pg.addColorStop(.46, "#0b0616"); pg.addColorStop(1, mix(e2, "#0b0616", .16));
    rr(0, x, P, P, W - 2 * P, H - 2 * P, 26); x.fillStyle = pg; x.fill();
    // cost
    const cx0 = 100, cy0 = 102, cr = 44;
    const cg = x.createRadialGradient(cx0 - 14, cy0 - 16, 2, cx0, cy0, cr); cg.addColorStop(0, "#fff"); cg.addColorStop(.4, e1); cg.addColorStop(1, mix(e2, "#000000", .7));
    x.beginPath(); x.arc(cx0, cy0, cr + 9, 0, 7); x.fillStyle = tc; x.fill();
    x.beginPath(); x.arc(cx0, cy0, cr, 0, 7); x.fillStyle = cg; x.fill();
    x.fillStyle = "#0b0616"; x.font = "700 54px 'Space Grotesk', sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(c.cost, cx0, cy0 + 3);
    // name
    x.textAlign = "left"; x.fillStyle = "#f6f1ff"; let fs = 50; x.font = `700 ${fs}px 'Pixelify Sans', sans-serif`;
    while (x.measureText(c.name).width > W - 2 * P - 150 && fs > 26) { fs -= 2; x.font = `700 ${fs}px 'Pixelify Sans', sans-serif`; }
    x.fillText(c.name, 166, cy0 + 2);
    // art
    const ax = P + 18, ay = 166, aw = W - 2 * P - 36, ah = Math.round(aw * .82);
    x.save(); rr(0, x, ax - 6, ay - 6, aw + 12, ah + 12, 18); x.fillStyle = tc; x.fill(); rr(0, x, ax, ay, aw, ah, 14); x.clip();
    try { const im = await loadImg("/thumbs/" + c.n + ".webp"); x.imageSmoothingQuality = "high"; const s = Math.max(aw / im.width, ah / im.height); x.drawImage(im, ax + (aw - im.width * s) / 2, ay + (ah - im.height * s) / 2, im.width * s, im.height * s); }
    catch { x.fillStyle = "#05020c"; x.fillRect(ax, ay, aw, ah); }
    x.restore();
    // type line
    const ty = ay + ah + 40; x.font = "700 26px 'Space Grotesk', sans-serif"; x.fillStyle = mix(tc, "#ffffff", .6);
    x.fillText((c.unique || c.tier).toUpperCase(), ax, ty);
    c.essence.forEach((e, i) => { x.beginPath(); x.arc(W - P - 34 - i * 30, ty, 11, 0, 7); x.fillStyle = ESS_COL[e]; x.shadowColor = ESS_COL[e]; x.shadowBlur = 12; x.fill(); x.shadowBlur = 0; });
    // rules
    const tx = ax, tyy = ty + 30, tw = aw, th = 220;
    rr(0, x, tx, tyy, tw, th, 14); x.fillStyle = "rgba(0,0,0,.35)"; x.fill();
    let ts = c.text.length > 150 ? 24 : c.text.length > 92 ? 27 : 31; x.font = `500 ${ts}px 'Space Grotesk', sans-serif`;
    let lines = wrap(x, c.text || "A plain being. Its strength is its body.", tw - 36);
    while (lines.length * ts * 1.3 > th - 24 && ts > 18) { ts -= 1; x.font = `500 ${ts}px 'Space Grotesk', sans-serif`; lines = wrap(x, c.text, tw - 36); }
    x.fillStyle = "#ece6fb"; x.textBaseline = "top"; lines.forEach((l, i) => x.fillText(l, tx + 18, tyy + 16 + i * ts * 1.3));
    // power, health
    const py = H - P - 52; x.textBaseline = "middle";
    const pill = (X, label, col, alignRight) => { x.font = "700 50px 'Space Grotesk', sans-serif"; const w = x.measureText(label).width + 60; const X0 = alignRight ? X - w : X;
      rr(0, x, X0, py - 34, w, 68, 34); x.fillStyle = "rgba(0,0,0,.6)"; x.fill(); x.lineWidth = 4; x.strokeStyle = col; x.stroke();
      x.fillStyle = col; x.textAlign = "center"; x.fillText(label, X0 + w / 2, py + 2); x.textAlign = "left"; };
    pill(ax, "⚔ " + c.power, "#ff9a5c", false); pill(W - ax, "♥ " + c.health, "#5cffb0", true);
    x.font = "600 22px 'Space Grotesk', sans-serif"; x.fillStyle = "rgba(246,241,255,.5)"; x.textAlign = "center"; x.fillText("#" + c.n + " · dmt-realm.dev/codex", W / 2, py + 2);
    // foil sheen
    if (FOIL.has(c.tier)) { const fg = x.createLinearGradient(0, 0, W, H); fg.addColorStop(.25, "rgba(255,80,200,0)"); fg.addColorStop(.4, "rgba(255,80,200,.18)"); fg.addColorStop(.5, "rgba(80,255,230,.16)"); fg.addColorStop(.6, "rgba(255,240,90,.14)"); fg.addColorStop(.75, "rgba(255,240,90,0)"); x.globalCompositeOperation = "screen"; rr(0, x, 20, 20, W - 40, H - 40, 40); x.fillStyle = fg; x.fill(); x.globalCompositeOperation = "source-over"; }
    return new Promise(ok => cv.toBlob(ok, "image/png"));
  }
  function mix(a, b, t) {   // t of a, the rest b
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
    return "rgb(" + A.map((v, i) => Math.round(v * t + B[i] * (1 - t))).join(",") + ")";
  }
  async function save() {
    if (!open) return;
    const blob = await picture(open), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "realm-card-" + open.n + ".png"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function share() {
    if (!open) return;
    const url = location.origin + "/codex#" + open.n;
    try {
      const blob = await picture(open), file = new File([blob], "realm-card-" + open.n + ".png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title: open.name, text: open.name + " · REALM Codex", url });
      if (navigator.share) return await navigator.share({ title: open.name, url });
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); $("[data-shared]").hidden = false; } catch { prompt("Copy this link", url); }
  }

  /* ---------- the card back, drawn ---------- */
  let flipped = false;
  function drawOne() {
    const f = $("[data-flip]");
    const go = () => {
      const c = CARDS[Math.floor(Math.random() * CARDS.length)];
      $("[data-drawn]").innerHTML = cardHtml(c); $("[data-drawn]").dataset.n = c.n;
      requestAnimationFrame(() => { f.classList.add("on"); flipped = true; if (navigator.vibrate) navigator.vibrate(12); });
      $(".cx-draw-label").textContent = "Tap to see it · draw again below";
    };
    if (!flipped) return go();
    show(Number($("[data-drawn]").dataset.n));
    f.classList.remove("on"); flipped = false; $(".cx-draw-label").textContent = "Tap to draw a card";
  }

  /* ---------- wiring ---------- */
  function chips() {
    $("[data-tiers]").innerHTML = TIERS.map(t => `<button type="button" class="cx-chip" style="--c:${TIER_COL[t]}" data-t="${t}" aria-pressed="false">${t}</button>`).join("");
    $("[data-ess]").innerHTML = ESS.map(e => `<button type="button" class="cx-chip" style="--c:${ESS_COL[e]}" data-e="${e}" aria-pressed="false">${cap(e)}</button>`).join("");
    const toggle = (set, v, b) => { set.has(v) ? set.delete(v) : set.add(v); b.setAttribute("aria-pressed", set.has(v)); filter(); };
    $("[data-tiers]").onclick = e => { const b = e.target.closest("[data-t]"); if (b) toggle(state.tiers, b.dataset.t, b); };
    $("[data-ess]").onclick = e => { const b = e.target.closest("[data-e]"); if (b) toggle(state.ess, b.dataset.e, b); };
  }
  let qt;
  $("[data-q]").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); filter(); }, 120); });
  $("[data-sort]").addEventListener("change", e => { state.sort = e.target.value; filter(); });
  $("[data-grid]").addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (b) show(Number(b.dataset.n)); });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  $("[data-prev]").onclick = () => step(-1); $("[data-next]").onclick = () => step(1);
  $("[data-save]").onclick = save; $("[data-share]").onclick = share;
  $("[data-draw]").onclick = drawOne;
  document.addEventListener("keydown", e => { if (!open) return; if (e.key === "Escape") close(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  // swipe between cards on the sheet
  let sx = null;
  $("[data-big]").addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  $("[data-big]").addEventListener("touchend", e => { if (sx == null) return; const d = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(d) > 60) step(d < 0 ? 1 : -1); }, { passive: true });
  new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) more(); }, { rootMargin: "900px" }).observe($("[data-more]"));
  window.addEventListener("hashchange", () => { const n = Number(location.hash.slice(1)); if (n) show(n, false); });

  chips();
  fetch("/api/codex").then(r => r.json()).then(d => {
    CARDS = d.cards; CARDS.forEach(c => { c._h = hay(c); BY.set(c.n, c); });
    filter();
    const n = Number(location.hash.slice(1)); if (n) show(n, false);
  }).catch(() => { $("[data-count]").textContent = "The cards could not be read just now. Try again in a moment."; });
})();
