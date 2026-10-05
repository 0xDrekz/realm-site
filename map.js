/* ============================================================
   REALM — the map.

   Every minted being drifts through one dark field. The beings a wallet
   holds keep together as a herd, so "which others are theirs" can be seen
   before anything is tapped. Bigger holdings sit nearer the middle.

   Tap a being: who holds it, what else they hold, their $DMT and what the
   holding receives once all 1,111 are minted, and a button to make an
   offer on the marketplace.

   Drawn from one sprite sheet (map-atlas.webp) and one small file of who
   each being is (map-data.json), both made by tools/atlas.py. Who holds
   what comes from /api/map. Until the collection exists that answers
   "not ready", and the map deals the beings to made-up wallets instead,
   with a banner saying so.
   ============================================================ */

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const ART = "?v=" + String(CONFIG.provenance || "").slice(0, 8);
  const TIER = Object.fromEntries(TIERS.map(t => [t.name, t]));
  const W = TOTAL_WEIGHT, POOL = POOL_FULL;
  const MAXM = TOKEN_BANDS[TOKEN_BANDS.length - 1].mult;
  const multFor = bal => TOKEN_BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);
  const fmt = n => Math.round(n).toLocaleString();
  const sol = n => n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  /* how big each tier is drawn, in world units: rarer reads larger */
  const SIZE = { Common: 30, Uncommon: 33, Rare: 36, Epic: 41, Legendary: 47,
                 Mythic: 54, Entity: 62, God: 74, Source: 104 };

  const cv = $("#world"), cx = cv.getContext("2d");
  const panel = $("[data-panel]"), body = $("[data-body]");
  let vw = 0, vh = 0, dpr = 1;

  /* ---------- state ---------- */
  let atlas = null, cell = 48, cols = 34, info = [];   // info[n-1] = [tier, being, traits]
  let beings = [], byN = new Map(), herds = new Map(), herdList = [];
  let live = false, worldR = 600;
  const cam = { x: 0, y: 0, z: 1 }, aim = { x: 0, y: 0, z: 1, on: false };
  let selected = null, focusHerd = null;

  /* a seeded random, so the preview deals the same wallets every visit */
  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  /* a stable number from a string, for each herd's phase */
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  /* ---------- the preview: the beings dealt to made-up wallets ---------- */
  function preview() {
    const r = rng(1111), B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const wallet = () => Array.from({ length: 44 }, () => B58[Math.floor(r() * 58)]).join("");
    const pool = Array.from({ length: info.length }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = [], tokens = {};
    let k = 0;
    while (k < 460) {
      const w = wallet(), take = 1 + Math.floor(r() ** 2 * 5);       // most hold one or two, a few hold five
      const bands = [0, 0, 0, 50000, 250000, 1000000, 5000000, 12000000];
      tokens[w] = bands[Math.floor(r() * bands.length)];
      for (let i = 0; i < take && k < pool.length; i++) out.push([pool[k++], w, ""]);
    }
    return { beings: out, tokens };
  }

  /* ---------- arrange: herds placed on a spiral, heaviest in the middle ---------- */
  function arrange(list, tokens) {
    beings = []; byN.clear(); herds.clear();
    for (const [n, owner, mint] of list) {
      const d = info[n - 1]; if (!d) continue;
      const b = { n, owner, mint, tier: d[0], being: d[1], traits: d[2], k: 0, h: null };
      beings.push(b); byN.set(n, b);
      if (!herds.has(owner)) herds.set(owner, { owner, members: [], weight: 0, tokens: tokens ? tokens[owner] : null });
      const h = herds.get(owner);
      h.members.push(b); h.weight += (TIER[b.tier] || {}).weight || 0;
    }
    herdList = [...herds.values()].sort((a, b) => b.weight - a.weight);
    const GOLD = 2.399963;
    herdList.forEach((h, i) => {
      const ph = hash(h.owner);
      const r = 175 * Math.sqrt(i + 0.6);
      h.x = Math.cos(i * GOLD) * r; h.y = Math.sin(i * GOLD) * r;
      h.ph = (ph % 1000) / 1000 * Math.PI * 2;
      h.spin = (ph % 2 ? 1 : -1) * (0.05 + (ph % 7) * 0.01);
      h.rad = h.members.length === 1 ? 0 : 22 + 16 * h.members.length;
      h.members.sort((a, b) => ((TIER[b.tier] || {}).weight || 0) - ((TIER[a.tier] || {}).weight || 0));
      h.members.forEach((b, k) => { b.k = k; b.h = h; b.ph = ((hash(h.owner + k) % 997) / 997) * Math.PI * 2; });
      worldR = Math.max(worldR, r + 120);
    });
  }

  /* where a being is at time t: around its herd's centre, each with its own slow swell */
  function pos(b, t) {
    const h = b.h, m = h.members.length;
    const hx = h.x + Math.sin(t * 0.07 + h.ph) * 26, hy = h.y + Math.cos(t * 0.06 + h.ph * 1.3) * 22;
    const a = (b.k / m) * Math.PI * 2 + t * h.spin + h.ph;
    return {
      x: hx + Math.cos(a) * h.rad + Math.sin(t * 0.43 + b.ph) * 6 + Math.sin(t * 0.17 + b.ph * 2) * 4,
      y: hy + Math.sin(a) * h.rad + Math.cos(t * 0.37 + b.ph) * 6 + Math.cos(t * 0.21 + b.ph * 3) * 4
    };
  }

  /* ---------- the field: stars and a faint sacred geometry ---------- */
  const stars = (() => { const r = rng(7); return Array.from({ length: 900 }, () => ({
    x: (r() - .5) * 6000, y: (r() - .5) * 6000, s: r() < .08 ? 2 : 1, a: .25 + r() * .6, p: r() * 6 })); })();

  const glow = {};
  function glowFor(color) {
    if (glow[color]) return glow[color];
    const g = document.createElement("canvas"); g.width = g.height = 128;
    const c = g.getContext("2d"), gr = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, color + "aa"); gr.addColorStop(.45, color + "33"); gr.addColorStop(1, color + "00");
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    return glow[color] = g;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  }
  addEventListener("resize", resize);

  /* the middle of what can be seen: above the sheet when it covers the bottom of a phone */
  const midY = () => (!panel.hidden && vw <= 640) ? Math.max(90, (vh - panel.offsetHeight) / 2 + 30) : vh / 2;
  /* and left of the column when it stands at the side of a wide screen */
  const midX = () => (!panel.hidden && vw > 640) ? (vw - panel.offsetWidth) / 2 : vw / 2;
  const toScreen = (x, y) => [(x - cam.x) * cam.z + midX(), (y - cam.y) * cam.z + midY()];
  const toWorld = (sx, sy) => [(sx - midX()) / cam.z + cam.x, (sy - midY()) / cam.z + cam.y];

  function draw(now) {
    const t = now / 1000;
    if (aim.on) {                                   // easing toward a chosen being
      cam.x += (aim.x - cam.x) * .09; cam.y += (aim.y - cam.y) * .09; cam.z += (aim.z - cam.z) * .09;
      if (Math.abs(aim.x - cam.x) < .5 && Math.abs(aim.z - cam.z) < .002) aim.on = false;
    }
    if (selected && following && !drag) { const p = pos(selected, t); aim.x = p.x; aim.y = p.y; }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = "#03010a"; cx.fillRect(0, 0, vw, vh);

    // stars, with a little parallax
    for (const s of stars) {
      const sx = (s.x - cam.x * .35) * Math.min(cam.z, 1.2) * .6 + vw / 2;
      const sy = (s.y - cam.y * .35) * Math.min(cam.z, 1.2) * .6 + vh / 2;
      if (sx < -2 || sy < -2 || sx > vw + 2 || sy > vh + 2) continue;
      cx.globalAlpha = s.a * (.7 + .3 * Math.sin(t * 1.3 + s.p));
      cx.fillStyle = s.s > 1 ? "#f4efe4" : "#9d8fc4";
      cx.fillRect(Math.round(sx), Math.round(sy), s.s, s.s);
    }
    cx.globalAlpha = 1;

    // the geometry the realm lives in: rings and rays from the centre
    const [ox, oy] = toScreen(0, 0);
    cx.strokeStyle = "rgba(227,186,92,.07)"; cx.lineWidth = 1;
    for (let r = 160; r < worldR * 1.1; r += 160) { cx.beginPath(); cx.arc(ox, oy, r * cam.z, 0, Math.PI * 2); cx.stroke(); }
    cx.strokeStyle = "rgba(150,90,255,.05)";
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + t * .004;
      cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(ox + Math.cos(a) * worldR * 1.1 * cam.z, oy + Math.sin(a) * worldR * 1.1 * cam.z); cx.stroke();
    }

    // a ring round the chosen wallet's herd
    if (focusHerd && focusHerd.members.length > 1) {
      const c0 = { x: 0, y: 0 };
      focusHerd.members.forEach(b => { const p = pos(b, t); c0.x += p.x; c0.y += p.y; });
      c0.x /= focusHerd.members.length; c0.y /= focusHerd.members.length;
      const [hx, hy] = toScreen(c0.x, c0.y);
      cx.strokeStyle = "rgba(227,186,92,.55)"; cx.setLineDash([4, 6]);
      cx.beginPath(); cx.arc(hx, hy, (focusHerd.rad + 52) * cam.z, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]);
    }

    // the beings
    cx.imageSmoothingEnabled = false;
    hits.length = 0;
    for (const b of beings) {
      const p = pos(b, t), [sx, sy] = toScreen(p.x, p.y);
      const tier = TIER[b.tier] || {}, s = (SIZE[b.tier] || 30) * cam.z;
      if (sx < -s || sy < -s || sx > vw + s || sy > vh + s) continue;
      const dim = focusHerd && b.h !== focusHerd;
      cx.globalAlpha = dim ? .28 : 1;
      if (b.tier === "God" || b.tier === "Source" || b.tier === "Entity") {
        const g = s * (b.tier === "Source" ? 3.2 : 2.4);
        cx.drawImage(glowFor(tier.color || "#ffffff"), sx - g / 2, sy - g / 2, g, g);
      }
      if (s < 5) {                                  // far out: a coloured point is all that reads
        cx.fillStyle = tier.color || "#9d8fc4";
        cx.fillRect(Math.round(sx - 1), Math.round(sy - 1), Math.max(2, s * .6), Math.max(2, s * .6));
      } else {
        const i = b.n - 1, x = Math.round(sx - s / 2), y = Math.round(sy - s / 2), w = Math.round(s);
        cx.drawImage(atlas, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell, x, y, w, w);
        if (s > 14) { cx.strokeStyle = b === selected ? "#e3ba5c" : (tier.color || "#9d8fc4"); cx.lineWidth = b === selected ? 2 : 1; cx.strokeRect(x + .5, y + .5, w - 1, w - 1); }
      }
      hits.push([b, sx, sy, Math.max(s / 2, 10)]);
    }
    cx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  const hits = [];

  /* ---------- moving about: drag, pinch, wheel, tap ---------- */
  const pts = new Map();
  let drag = false, moved = 0, pinch0 = null;
  const clampZ = z => Math.min(6, Math.max(Math.min(vw, vh) / (worldR * 2.6), z));

  cv.addEventListener("pointerdown", e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    moved = 0; drag = true; aim.on = false; cv.classList.add("dragging");
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z }; }
    hint();
  });
  cv.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    const [px, py] = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, [wx, wy] = toWorld(mx, my);
      cam.z = clampZ(pinch0.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d);
      const [wx2, wy2] = toWorld(mx, my); cam.x += wx - wx2; cam.y += wy - wy2;
      moved += 10;
    } else if (pts.size === 1) {
      const dx = e.clientX - px, dy = e.clientY - py;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.x -= dx / cam.z; cam.y -= dy / cam.z;
      if (moved > 6) following = false;
    }
  });
  const up = e => {
    const was = pts.size;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (!pts.size) { drag = false; cv.classList.remove("dragging"); }
    if (was === 1 && moved < 6) tap(e.clientX, e.clientY);
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    e.preventDefault(); aim.on = false;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    cam.z = clampZ(cam.z * Math.exp(-e.deltaY * .0015));
    const [wx2, wy2] = toWorld(e.clientX, e.clientY); cam.x += wx - wx2; cam.y += wy - wy2;
    hint();
  }, { passive: false });

  let following = true;            // the camera keeps the chosen being in view until you drag

  function tap(x, y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const [b, sx, sy, r] = hits[i];
      if (Math.abs(x - sx) <= r && Math.abs(y - sy) <= r) return choose(b);
    }
    close();
  }

  const hintEl = $("[data-hint]");
  const hint = () => hintEl && hintEl.classList.add("gone");

  /* ---------- choosing a being ---------- */
  $(".m-close", panel).addEventListener("click", close);

  function close() {
    selected = null; focusHerd = null; panel.hidden = true; document.body.classList.remove("panel-open");
    history.replaceState(null, "", location.pathname);
  }

  function crop(n, size) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    const i = n - 1;
    g.drawImage(atlas, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell, 0, 0, size, size);
    return c;
  }

  function offerLink(b) {
    if (!live || !b.mint) return null;
    const m = (CONFIG.links && CONFIG.links.marketplace) || "";
    if (m.includes("{mint}")) return m.replace("{mint}", b.mint);
    return "https://magiceden.io/item-details/" + b.mint;
  }

  function choose(b, fly = true) {
    selected = b; focusHerd = b.h; following = true;
    const p = pos(b, performance.now() / 1000);
    aim.x = p.x; aim.y = p.y; aim.z = fly ? Math.max(cam.z, 1.6) : cam.z; aim.on = true;
    history.replaceState(null, "", "?being=" + b.n);
    render(b);
    if (live && b.h.tokens == null) {
      fetch("/api/holdings?address=" + encodeURIComponent(b.owner)).then(r => r.json()).then(d => {
        if (typeof d.tokens === "number") { b.h.tokens = d.tokens; if (selected && selected.h === b.h) render(selected); }
      }).catch(() => {});
    }
  }

  function render(b) {
    const tier = TIER[b.tier] || {}, h = b.h;
    const w = h.weight, tokens = h.tokens, m = tokens == null ? 1 : multFor(tokens);
    const reward = POOL * w / W, mine = w * m, high = POOL * mine / (mine + (W - w));
    const counts = {}; h.members.forEach(x => counts[x.tier] = (counts[x.tier] || 0) + 1);
    const tierLine = TIERS.slice().reverse().filter(t => counts[t.name])
      .map(t => '<b style="color:' + t.color + '">' + counts[t.name] + ' ' + t.name + '</b>').join(" &middot; ");
    const traits = Object.entries(b.traits || {}).filter(([, v]) => v && v !== "None")
      .map(([k, v]) => '<div><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>').join("");
    const offer = offerLink(b);

    body.innerHTML =
        '<div class="m-art" style="--c:' + tier.color + '"><span data-art></span><div>'
        + '<h2 class="m-name">' + esc(b.being) + '</h2>'
        + '<p class="m-num">REALM #' + b.n + '</p>'
        + '<span class="m-chip" style="--c:' + tier.color + '">' + esc(b.tier) + ' &middot; weight ' + (tier.weight || 0) + '</span>'
        + '</div></div>'
      + (traits ? '<div class="m-traits">' + traits + '</div>' : '')
      + '<div class="m-sec"><h3>Held by</h3><div class="m-owner"><code>' + esc(short(b.owner)) + '</code>'
        + '<button type="button" data-copy>Copy</button>'
        + (live ? '<a href="https://solscan.io/account/' + esc(b.owner) + '" target="_blank" rel="noopener">Solscan</a>' : '')
        + '</div>'
        + '<p class="m-tiers">' + h.members.length + ' being' + (h.members.length > 1 ? 's' : '') + ': ' + tierLine + '</p>'
        + (h.members.length > 1 ? '<div class="m-herd" data-herd></div>' : '')
      + '</div>'
      + '<div class="m-sec"><h3>What it receives</h3><div class="m-figs">'
        + '<div class="ty"><span>Reward</span><b class="num">' + sol(reward) + '</b><i>SOL, once all ' + fmt(TOTAL_BEINGS) + ' are minted</i></div>'
        + '<div><span>' + TOKEN_NAME + '</span><b class="num">' + (tokens == null ? '…' : fmt(tokens)) + '</b><i>'
          + (tokens == null ? 'reading' : m.toFixed(1) + '×' + (m > 1 ? ' · boost up to +' + sol(high - reward) + ' SOL' : ' · no boost')) + '</i></div>'
      + '</div><p class="m-note">Reward is for the whole wallet: every being it holds. The ' + TOKEN_NAME
        + ' boost is the most it could add, if nobody else held any.</p></div>'
      + (offer
        ? '<a class="m-offer" href="' + esc(offer) + '" target="_blank" rel="noopener">Make an offer</a>'
        : '<span class="m-offer off">' + (live ? 'Offers open once the marketplace lists it' : 'Offers open after the mint') + '</span>');

    const art = crop(b.n, 192); $("[data-art]", body).replaceWith(art);
    const herd = $("[data-herd]", body);
    if (herd) h.members.forEach(x => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.style.setProperty("--c", (TIER[x.tier] || {}).color);
      btn.title = x.being + " · " + x.tier; btn.setAttribute("aria-label", x.being + ", " + x.tier);
      if (x === b) btn.className = "on";
      btn.appendChild(crop(x.n, 64));
      btn.addEventListener("click", () => choose(x));
      herd.appendChild(btn);
    });
    $("[data-copy]", body).addEventListener("click", e => {
      navigator.clipboard && navigator.clipboard.writeText(b.owner).then(() => { e.target.textContent = "Copied"; });
    });
    panel.hidden = false; document.body.classList.add("panel-open");
  }

  /* ---------- finding a wallet or a number ---------- */
  const msg = $("[data-msg]");
  $("[data-search]").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("input", e.target).value.trim().replace(/^#/, "");
    msg.textContent = "";
    if (/^\d{1,4}$/.test(q)) {
      const n = Number(q);
      if (n < 1 || n > TOTAL_BEINGS) return msg.textContent = "Beings are numbered 1 to " + fmt(TOTAL_BEINGS) + ".";
      const b = byN.get(n);
      return b ? choose(b) : msg.textContent = "#" + n + " has not been minted yet.";
    }
    if (ADDR.test(q)) {
      const h = herds.get(q);
      return h ? choose(h.members[0]) : msg.textContent = "That wallet holds no beings.";
    }
    msg.textContent = "Paste a Solana address, or type a number from 1 to " + fmt(TOTAL_BEINGS) + ".";
  });

  /* ---------- start ---------- */
  async function start() {
    resize();
    const img = new Image(); img.src = "map-atlas.webp" + ART;
    const [data] = await Promise.all([
      fetch("map-data.json" + ART).then(r => r.json()),
      img.decode()
    ]);
    atlas = img; cell = data.cell; cols = data.cols; info = data.beings;

    let list = null, tokens = null;
    try {
      const r = await fetch("/api/map"), d = await r.json();
      if (r.ok && d.ready) { list = d.beings; live = true; }
    } catch { /* fall through to the preview */ }
    if (!list) { const p = preview(); list = p.beings; tokens = p.tokens; $("[data-preview]").hidden = false; }
    arrange(list, tokens);

    $("[data-count]").textContent = fmt(beings.length) + "/" + fmt(TOTAL_BEINGS) + " minted · " + fmt(herdList.length) + " holders";
    // open close enough that the beings read as pictures, on the biggest holders in the middle
    cam.z = aim.z = clampZ(Math.min(vw, vh) / 700);

    const q = new URLSearchParams(location.search);
    const n = Number(q.get("being")), w = q.get("wallet");
    if (n && byN.get(n)) choose(byN.get(n));
    else if (w && herds.get(w)) choose(herds.get(w).members[0]);

    requestAnimationFrame(draw);
  }
  start().catch(() => { $("[data-count]").textContent = "Could not load the map."; });
})();
