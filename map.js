/* ============================================================
   REALM — the map.

   The realm laid out as the lore tells it: the mushroom woods on the
   outside, then the folk, the shoals, the deep, the named, the Mythic
   heights, the Entities, a ring of ten thrones, and the Source at the
   centre. Every being has its own place in its tier's region and floats
   there as a lit orb; the regions turn slowly. A being not yet minted is
   a faint spark where it will appear.

   Tap a being and gold lines draw between everything its wallet holds,
   wherever it sits in the realm: a constellation of one holder.

   The page opens on the Source and drifts out. While the mint runs, new
   beings fly out of the centre to their places and are named in the
   ticker. Until the collection exists the map deals beings to made-up
   wallets instead, says so, and plays the arrivals as a preview.

   Drawn from one sprite sheet (map-atlas.webp) and one small file of who
   each being is (map-data.json), both made by tools/atlas.py. Who holds
   what comes from /api/map.
   ============================================================ */

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const ART = "?v=" + String(CONFIG.provenance || "").slice(0, 8);
  const TIER = Object.fromEntries(TIERS.map(t => [t.name, t]));
  const W = TOTAL_WEIGHT, POOL = POOL_FULL;
  const multFor = bal => TOKEN_BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);
  const fmt = n => Math.round(n).toLocaleString();
  const sol = n => n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const plural = name => name === "Entity" ? "Entities" : name === "Legendary" ? "Legendaries" : name === "Source" ? "Source" : name + "s";
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- the regions, from the centre out ----------
     r0..r1 is the band a tier lives in, in world units. A single ring
     (r0 == r1) spaces its beings evenly, like the thrones. */
  const REGION = {
    Source:    { r0: 0,    r1: 0,    size: 112, name: "The Source" },
    God:       { r0: 200,  r1: 200,  size: 76,  name: "The Thrones" },
    Entity:    { r0: 345,  r1: 345,  size: 62,  name: "The Entities" },
    Mythic:    { r0: 490,  r1: 490,  size: 54,  name: "The Mythic Heights" },
    Legendary: { r0: 600,  r1: 710,  size: 46,  name: "The Named" },
    Epic:      { r0: 790,  r1: 940,  size: 40,  name: "The Deep" },
    Rare:      { r0: 1020, r1: 1200, size: 36,  name: "The Shoals" },
    Uncommon:  { r0: 1290, r1: 1500, size: 33,  name: "The Folk" },
    Common:    { r0: 1590, r1: 1900, size: 30,  name: "The Mushroom Woods" }
  };
  const ORDER = ["Source", "God", "Entity", "Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];
  const WORLD_R = 1960;

  const cv = $("#world"), cx = cv.getContext("2d");
  const panel = $("[data-panel]"), body = $("[data-body]");
  let vw = 0, vh = 0, dpr = 1;

  /* ---------- state ---------- */
  let atlas = null, cell = 48, cols = 34, info = [];
  const slots = [];                         // slots[n] = { tier, a, r, spin, ph }
  let beings = [], byN = new Map(), owners = new Map();
  let live = false, preview = null;
  const cam = { x: 0, y: 0, z: 1 }, aim = { x: 0, y: 0, z: 1, on: false };
  let selected = null, focusOwner = null, lineT = 0, following = true;
  const filter = new Set();
  const arrivals = [];                      // beings flying out of the centre
  let intro = null;

  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* ---------- every being's place ---------- */
  function place() {
    const byTier = {};
    info.forEach((d, i) => (byTier[d[0]] = byTier[d[0]] || []).push(i + 1));
    ORDER.forEach((tier, ti) => {
      const list = byTier[tier] || [], R = REGION[tier], c = list.length;
      const spin = (ti % 2 ? -1 : 1) * (0.006 + 0.0025 * (8 - ti) / 8);
      list.forEach((n, k) => {
        let a, r;
        if (R.r1 === R.r0) { a = (k / Math.max(c, 1)) * Math.PI * 2 - Math.PI / 2; r = R.r0; }
        else { a = k * 2.399963 + ti; r = Math.sqrt(R.r0 * R.r0 + ((k + .5) / c) * (R.r1 * R.r1 - R.r0 * R.r0)); }
        slots[n] = { tier, a, r, spin, ph: (n * 0.618) % 1 * Math.PI * 2 };
      });
    });
  }

  /* where a being is at time t: its place, turned with its ring, and a slow float */
  function pos(n, t) {
    const s = slots[n], a = s.a + t * s.spin;
    return { x: Math.cos(a) * s.r + Math.sin(t * .5 + s.ph) * 5, y: Math.sin(a) * s.r + Math.cos(t * .41 + s.ph) * 5 };
  }

  /* ---------- the preview: beings dealt to made-up wallets ---------- */
  function makePreview() {
    const r = rng(1111), B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const wallet = () => Array.from({ length: 44 }, () => B58[Math.floor(r() * 58)]).join("");
    const pool = Array.from({ length: info.length - 1 }, (_, i) => i + 1);     // the Source stays unminted
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const list = [], tokens = {}, wallets = [];
    let k = 0;
    const bands = [0, 0, 0, 50000, 250000, 1000000, 5000000, 12000000];
    while (k < 460) {
      const w = wallet(), take = 1 + Math.floor(r() ** 2 * 5);
      tokens[w] = bands[Math.floor(r() * bands.length)]; wallets.push(w);
      for (let i = 0; i < take; i++) list.push([pool[k++], w, ""]);
    }
    return { list, tokens, wallets, rest: pool.slice(k), r };
  }

  function add(n, owner, mint, tokens) {
    const d = info[n - 1]; if (!d || byN.has(n)) return null;
    const b = { n, owner, mint, tier: d[0], being: d[1], traits: d[2] };
    beings.push(b); byN.set(n, b);
    if (!owners.has(owner)) owners.set(owner, { owner, members: [], weight: 0, tokens: tokens == null ? null : tokens });
    const o = owners.get(owner);
    o.members.push(b); o.weight += (TIER[b.tier] || {}).weight || 0;
    o.members.sort((x, y) => ((TIER[y.tier] || {}).weight || 0) - ((TIER[x.tier] || {}).weight || 0));
    b.o = o;
    return b;
  }

  /* ---------- pictures, made once ---------- */
  const orbs = new Map();
  function orb(n) {                          // the being cut into a lit circle
    if (orbs.has(n)) return orbs.get(n);
    const S = 96, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"), i = n - 1, col = (TIER[info[i][0]] || {}).color || "#9d8fc4";
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.clip();
    g.imageSmoothingEnabled = false;
    g.drawImage(atlas, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell, 0, 0, S, S);
    const v = g.createRadialGradient(S / 2, S / 2, S * .28, S / 2, S / 2, S / 2);
    v.addColorStop(0, "rgba(3,1,10,0)"); v.addColorStop(1, "rgba(3,1,10,.55)");
    g.fillStyle = v; g.fillRect(0, 0, S, S);
    g.restore();
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    orbs.set(n, c); return c;
  }
  function crop(n, size) {                    // square, for the panel
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    const i = n - 1;
    g.drawImage(atlas, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell, 0, 0, size, size);
    return c;
  }
  const glows = {};
  function glow(color) {
    if (glows[color]) return glows[color];
    const g = document.createElement("canvas"); g.width = g.height = 128;
    const c = g.getContext("2d"), gr = c.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, color + "cc"); gr.addColorStop(.35, color + "44"); gr.addColorStop(1, color + "00");
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    return glows[color] = g;
  }

  /* ---------- the painted realm: nebula bands for each region, made once ---------- */
  let ground = null;
  const GS = 2048, GK = GS / (WORLD_R * 2);   // ground pixels per world unit
  function paint() {
    ground = document.createElement("canvas"); ground.width = ground.height = GS;
    const g = ground.getContext("2d"), c = GS / 2, r = rng(42);
    g.fillStyle = "#03010a"; g.fillRect(0, 0, GS, GS);
    g.globalCompositeOperation = "lighter";
    ORDER.slice(1).forEach(tier => {
      const R = REGION[tier], col = (TIER[tier] || {}).color || "#9d8fc4";
      const mid = (R.r0 + R.r1) / 2, wide = Math.max(70, R.r1 - R.r0 + 90);
      for (let k = 0; k < 140; k++) {        // clouds strewn round the band
        const a = r() * Math.PI * 2, rr = mid + (r() - .5) * wide;
        const x = c + Math.cos(a) * rr * GK, y = c + Math.sin(a) * rr * GK, s = (24 + r() * 60) * GK * 2.2;
        const gr = g.createRadialGradient(x, y, 0, x, y, s);
        gr.addColorStop(0, col + "08"); gr.addColorStop(1, col + "00");
        g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
      }
    });
    const core = g.createRadialGradient(c, c, 0, c, c, 420 * GK);   // the light of the Source
    core.addColorStop(0, "rgba(255,226,150,.16)"); core.addColorStop(.4, "rgba(227,186,92,.05)"); core.addColorStop(1, "rgba(227,186,92,0)");
    g.fillStyle = core; g.fillRect(0, 0, GS, GS);
    g.globalCompositeOperation = "source-over";
    // flower of life, faint, across the middle of the realm
    g.strokeStyle = "rgba(227,186,92,.07)"; g.lineWidth = 1;
    const fr = 100 * GK;
    for (let q = -6; q <= 6; q++) for (let p = -6; p <= 6; p++) {
      const x = c + (p + q / 2) * fr, y = c + q * fr * Math.sqrt(3) / 2;
      if (Math.hypot(x - c, y - c) > 560 * GK) continue;
      g.beginPath(); g.arc(x, y, fr, 0, Math.PI * 2); g.stroke();
    }
    for (let k = 0; k < 2400; k++) {          // dust
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * WORLD_R * GK;
      g.fillStyle = `rgba(244,239,228,${.08 + r() * .25})`;
      g.fillRect(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 1, 1);
    }
  }

  const stars = (() => { const r = rng(7); return Array.from({ length: 700 }, () => ({
    x: r(), y: r(), s: r() < .1 ? 2 : 1, a: .2 + r() * .6, p: r() * 6 })); })();

  /* ---------- the view ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  }
  addEventListener("resize", resize);
  const midY = () => (!panel.hidden && vw <= 640) ? Math.max(90, (vh - panel.offsetHeight) / 2 + 30) : vh / 2;
  const sideW = () => (!panel.hidden || !$("[data-tops]").hidden) && vw > 640 ? 380 : 0;
  const midX = () => (vw - sideW()) / 2;
  const toScreen = (x, y) => [(x - cam.x) * cam.z + midX(), (y - cam.y) * cam.z + midY()];
  const toWorld = (sx, sy) => [(sx - midX()) / cam.z + cam.x, (sy - midY()) / cam.z + cam.y];
  const fitZ = () => Math.min(vw, vh) / 1150;
  const clampZ = z => Math.min(5, Math.max(Math.min(vw, vh) / (WORLD_R * 2.3), z));

  const hits = [];
  function draw(now) {
    const t = now / 1000;

    if (intro) {                              // the opening drift, out from the Source
      const p = ease((now - intro.t0) / intro.ms);
      cam.z = intro.z0 * Math.pow(intro.z1 / intro.z0, p); cam.x = 0; cam.y = 0;
      if (p >= 1) { intro = null; document.body.classList.remove("intro"); }
    } else if (aim.on) {
      cam.x += (aim.x - cam.x) * .09; cam.y += (aim.y - cam.y) * .09; cam.z += (aim.z - cam.z) * .09;
      if (Math.abs(aim.x - cam.x) < .5 && Math.abs(aim.y - cam.y) < .5 && Math.abs(aim.z - cam.z) < .002) aim.on = false;
    }
    if (selected && following && !drag && !intro) { const p = pos(selected.n, t); aim.x = p.x; aim.y = p.y; aim.on = true; }

    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = "#03010a"; cx.fillRect(0, 0, vw, vh);

    // far stars, barely moving
    for (const s of stars) {
      const sx = ((s.x * vw * 1.4 - cam.x * .04 * cam.z) % vw + vw) % vw;
      const sy = ((s.y * vh * 1.4 - cam.y * .04 * cam.z) % vh + vh) % vh;
      cx.globalAlpha = s.a * (.65 + .35 * Math.sin(t * 1.2 + s.p));
      cx.fillStyle = s.s > 1 ? "#f4efe4" : "#9d8fc4";
      cx.fillRect(sx | 0, sy | 0, s.s, s.s);
    }
    cx.globalAlpha = 1;

    // the painted realm, turning very slowly
    const [ox, oy] = toScreen(0, 0), gsz = WORLD_R * 2 * cam.z;
    cx.save(); cx.translate(ox, oy); cx.rotate(t * .0015);
    cx.imageSmoothingEnabled = true;
    cx.drawImage(ground, -gsz / 2, -gsz / 2, gsz, gsz);
    cx.restore();

    // region edges and names
    cx.lineWidth = 1;
    ORDER.slice(1).forEach(tier => {
      const R = REGION[tier], col = (TIER[tier] || {}).color || "#9d8fc4";
      const rr = (R.r1 === R.r0 ? R.r0 : R.r1 + 40) * cam.z;
      cx.strokeStyle = col + "22"; cx.setLineDash(R.r1 === R.r0 ? [2, 6] : []);
      cx.beginPath(); cx.arc(ox, oy, R.r1 === R.r0 ? R.r0 * cam.z : rr, 0, Math.PI * 2); cx.stroke();
      const ly = oy - (R.r1 === R.r0 ? R.r0 + 46 : (R.r0 + R.r1) / 2) * cam.z;
      if (cam.z > .42 && ly > 70 && ly < vh - 140) {
        const a = Math.min(1, (cam.z - .42) * 4) * (filter.size && !filter.has(tier) ? .3 : 1);
        cx.font = `600 ${Math.max(10, Math.min(15, 11 + cam.z * 3))}px "Pixelify Sans", system-ui`;
        cx.textAlign = "center"; cx.fillStyle = col; cx.globalAlpha = .55 * a;
        cx.fillText(R.name.toUpperCase().split("").join(" "), ox, ly);
        cx.globalAlpha = 1;
      }
    });
    cx.setLineDash([]);

    // places not yet taken: faint sparks
    if (cam.z > .12) {
      cx.fillStyle = "rgba(244,239,228,.22)";
      for (let n = 1; n < slots.length; n++) {
        if (byN.has(n)) continue;
        const p = pos(n, t), [sx, sy] = toScreen(p.x, p.y);
        if (sx < 0 || sy < 0 || sx > vw || sy > vh) continue;
        const k = .5 + .5 * Math.sin(t * 2 + n);
        cx.globalAlpha = .15 + .25 * k; cx.fillRect(sx | 0, sy | 0, 2, 2);
      }
      cx.globalAlpha = 1;
    }

    // the Source, as a dim silhouette until it is taken
    if (!byN.has(slots.length - 1)) {
      const s = REGION.Source.size * cam.z, src = slots.length - 1;
      const pulse = .5 + .5 * Math.sin(t * 1.1);
      const g = s * (2.6 + pulse * .5);
      cx.globalAlpha = .32; cx.drawImage(glow("#fff1c4"), ox - g / 2, oy - g / 2, g, g);
      cx.globalAlpha = .28 + pulse * .1; cx.drawImage(orb(src), ox - s / 2, oy - s / 2, s, s);
      cx.globalAlpha = 1;
    }

    // the constellation of the chosen wallet
    let pts = null;
    if (focusOwner && focusOwner.members.length > 1) {
      pts = focusOwner.members.map(b => { const p = pos(b.n, t); return toScreen(p.x, p.y); });
      const prog = ease((now - lineT) / 900);
      cx.strokeStyle = "rgba(227,186,92,.75)"; cx.lineWidth = 1.25;
      cx.shadowColor = "#e3ba5c"; cx.shadowBlur = 8;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const f = Math.max(0, Math.min(1, prog * pts.length - (i - 1)));
        if (!f) continue;
        cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f); cx.stroke();
      }
      cx.shadowBlur = 0;
    }

    // the beings
    hits.length = 0;
    const flying = new Set(arrivals.map(a => a.b));
    for (const b of beings) {
      if (flying.has(b)) continue;
      drawBeing(b, pos(b.n, t), t, 1);
    }

    // arrivals: a streak from the centre to the place, then a flash
    for (let i = arrivals.length - 1; i >= 0; i--) {
      const a = arrivals[i], p = Math.min(1, (now - a.t0) / 1600), e = ease(p);
      const to = pos(a.b.n, t), x = to.x * e, y = to.y * e;
      const [hx, hy] = toScreen(x, y), [sx0, sy0] = toScreen(to.x * Math.max(0, e - .25), to.y * Math.max(0, e - .25));
      const col = (TIER[a.b.tier] || {}).color || "#fff";
      const gr = cx.createLinearGradient(sx0, sy0, hx, hy);
      gr.addColorStop(0, col + "00"); gr.addColorStop(1, col + "ff");
      cx.strokeStyle = gr; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(sx0, sy0); cx.lineTo(hx, hy); cx.stroke();
      if (p < 1) { const g = 40; cx.drawImage(glow(col), hx - g / 2, hy - g / 2, g, g); }
      else {
        const f = Math.min(1, (now - a.t0 - 1600) / 900);
        drawBeing(a.b, to, t, 1);
        const g = (REGION[a.b.tier].size * 3 + f * 120) * cam.z;
        cx.globalAlpha = 1 - f; cx.drawImage(glow("#ffffff"), hx - g / 2, hy - g / 2, g, g); cx.globalAlpha = 1;
        if (f >= 1) arrivals.splice(i, 1);
      }
    }

    // the entrance: the realm still dark, only the Source lit, the dark lifting as we draw back
    if (intro) {
      const p = Math.max(0, (now - intro.t0) / intro.ms);
      cx.fillStyle = `rgba(3,1,10,${.93 * (1 - ease(p * 1.15))})`; cx.fillRect(0, 0, vw, vh);
      const s = REGION.Source.size * cam.z, src = slots.length - 1, pulse = .5 + .5 * Math.sin(t * 1.1);
      const g = s * (2.2 + pulse * .4);
      cx.globalAlpha = .5; cx.drawImage(glow("#fff1c4"), ox - g / 2, oy - g / 2, g, g);
      cx.globalAlpha = .9; cx.drawImage(orb(src), ox - s / 2, oy - s / 2, s, s); cx.globalAlpha = 1;
    }

    // nodes on the constellation, over the orbs
    if (pts) { cx.fillStyle = "#ffe9b0"; pts.forEach(([x, y]) => { cx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }); }

    requestAnimationFrame(draw);
  }

  function drawBeing(b, p, t, alpha) {
    const [sx, sy] = toScreen(p.x, p.y), R = REGION[b.tier], tier = TIER[b.tier] || {};
    const s = R.size * cam.z;
    if (sx < -s * 2 || sy < -s * 2 || sx > vw + s * 2 || sy > vh + s * 2) return;
    const dimmed = (focusOwner && b.o !== focusOwner) || (filter.size && !filter.has(b.tier));
    const a = alpha * (dimmed ? .22 : 1);
    const rare = b.tier === "God" || b.tier === "Source" || b.tier === "Entity" || b.tier === "Mythic";
    // light: everyone has a little, the rare ones breathe
    const pulse = rare ? .75 + .25 * Math.sin(t * 1.6 + b.n) : .55;
    const g = s * (rare ? 2.6 : 1.7);
    cx.globalAlpha = a * pulse; cx.drawImage(glow(tier.color || "#9d8fc4"), sx - g / 2, sy - g / 2, g, g);
    if (b.tier === "God" || b.tier === "Source") {            // Gods trail light
      for (let k = 1; k <= 5; k++) {
        const q = pos(b.n, t - k * .35), [qx, qy] = toScreen(q.x, q.y), qs = s * (.5 - k * .07);
        cx.globalAlpha = a * (.32 - k * .05); cx.drawImage(glow(tier.color), qx - qs, qy - qs, qs * 2, qs * 2);
      }
    }
    cx.globalAlpha = a;
    if (s < 7) {
      cx.fillStyle = tier.color || "#9d8fc4";
      const d = Math.max(2, s * .5); cx.fillRect(Math.round(sx - d / 2), Math.round(sy - d / 2), d, d);
    } else {
      cx.imageSmoothingEnabled = s < 40;
      cx.drawImage(orb(b.n), sx - s / 2, sy - s / 2, s, s);
      if (b === selected) {
        cx.strokeStyle = "#ffe9b0"; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(sx, sy, s / 2 + 5 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); cx.stroke();
      }
    }
    cx.globalAlpha = 1;
    hits.push([b, sx, sy, Math.max(s / 2, 11)]);
  }

  /* ---------- moving about ---------- */
  const ptrs = new Map();
  let drag = false, moved = 0, pinch0 = null, down0 = null, kind = "mouse";
  cv.addEventListener("pointerdown", e => {
    if (intro) skipIntro();
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    moved = 0; down0 = [e.clientX, e.clientY]; kind = e.pointerType || "mouse";
    drag = true; aim.on = false; cv.classList.add("dragging");
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z }; }
    hideHint();
  });
  cv.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === "mouse") hover(e.clientX, e.clientY); return; }
    const [px, py] = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, [wx, wy] = toWorld(mx, my);
      cam.z = clampZ(pinch0.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d);
      const [wx2, wy2] = toWorld(mx, my); cam.x += wx - wx2; cam.y += wy - wy2; moved += 10;
    } else if (ptrs.size === 1) {
      const dx = e.clientX - px, dy = e.clientY - py;
      moved = Math.max(moved, Math.hypot(e.clientX - down0[0], e.clientY - down0[1]));
      cam.x -= dx / cam.z; cam.y -= dy / cam.z;
      if (moved > 6) following = false;
    }
  });
  const up = e => {
    const was = ptrs.size; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = null;
    if (!ptrs.size) { drag = false; cv.classList.remove("dragging"); }
    if (was === 1 && moved < (kind === "mouse" ? 6 : 14)) tap(e.clientX, e.clientY, kind);
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", () => { tip.hidden = true; });
  cv.addEventListener("wheel", e => {
    e.preventDefault(); if (intro) skipIntro(); aim.on = false;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    cam.z = clampZ(cam.z * Math.exp(-e.deltaY * .0015));
    const [wx2, wy2] = toWorld(e.clientX, e.clientY); cam.x += wx - wx2; cam.y += wy - wy2;
    hideHint();
  }, { passive: false });

  function hitAt(x, y, slop = 4) {
    let best = null, bd = Infinity;
    for (const [b, sx, sy, r] of hits) {
      const d = Math.hypot(x - sx, y - sy);
      if (d <= r + slop && d - r < bd) { bd = d - r; best = b; }
    }
    return best;
  }
  function tap(x, y, how) { const b = hitAt(x, y, how === "mouse" ? 6 : 26); b ? choose(b) : close(); }

  const tip = $("[data-tip]");
  function hover(x, y) {
    const b = hitAt(x, y);
    cv.style.cursor = b ? "pointer" : "";
    if (!b) { tip.hidden = true; return; }
    tip.innerHTML = '<b>' + esc(b.being) + '</b><span style="color:' + (TIER[b.tier] || {}).color + '">' + esc(b.tier) + '</span>';
    tip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    tip.hidden = false;
  }

  const hintEl = $("[data-hint]");
  const hideHint = () => hintEl.classList.add("gone");

  /* ---------- the panel ---------- */
  $("[data-panel-close]").addEventListener("click", close);
  function close() {
    selected = null; focusOwner = null; panel.hidden = true; document.body.classList.remove("panel-open");
    history.replaceState(null, "", location.pathname);
  }

  function offerLink(b) {
    if (!live || !b.mint) return null;
    const m = (CONFIG.links && CONFIG.links.marketplace) || "";
    return m.includes("{mint}") ? m.replace("{mint}", b.mint) : "https://magiceden.io/item-details/" + b.mint;
  }

  function choose(b) {
    $("[data-tops]").hidden = true;
    if (focusOwner !== b.o) lineT = performance.now();
    selected = b; focusOwner = b.o; following = true;
    const p = pos(b.n, performance.now() / 1000);
    aim.x = p.x; aim.y = p.y; aim.z = Math.max(cam.z, REGION[b.tier].size > 50 ? 1.2 : 1.7); aim.on = true;
    history.replaceState(null, "", "?being=" + b.n);
    render(b);
    if (live && b.o.tokens == null) {
      fetch("/api/holdings?address=" + encodeURIComponent(b.owner)).then(r => r.json()).then(d => {
        if (typeof d.tokens === "number") { b.o.tokens = d.tokens; if (selected && selected.o === b.o) render(selected, false); }
      }).catch(() => {});
    }
  }

  function countUp(el, to) {
    if (reduced) { el.textContent = sol(to); return; }
    const t0 = performance.now();
    const step = now => { const p = ease((now - t0) / 700); el.textContent = sol(to * p); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function render(b, animate = true) {
    const tier = TIER[b.tier] || {}, o = b.o;
    const w = o.weight, tokens = o.tokens, m = tokens == null ? 1 : multFor(tokens);
    const reward = POOL * w / W, mine = w * m, high = POOL * mine / (mine + (W - w));
    const counts = {}; o.members.forEach(x => counts[x.tier] = (counts[x.tier] || 0) + 1);
    const tierLine = TIERS.slice().reverse().filter(t => counts[t.name])
      .map(t => '<b style="color:' + t.color + '">' + counts[t.name] + ' ' + t.name + '</b>').join(" &middot; ");
    const traits = Object.entries(b.traits || {}).filter(([, v]) => v && v !== "None")
      .map(([k, v]) => '<div><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>').join("");
    const rank = tier.count === 1 ? "The only one" : "One of " + fmt(tier.count) + " " + plural(tier.name);
    const offer = offerLink(b);
    const url = location.origin + "/map?being=" + b.n;
    const xText = encodeURIComponent(`${b.being} · ${b.tier} · REALM #${b.n}`);

    body.innerHTML =
        '<div class="m-hero" style="--c:' + tier.color + '"><span data-art></span></div>'
      + '<div class="m-head">'
        + '<p class="m-rank" style="color:' + tier.color + '">' + esc(b.tier) + ' &middot; ' + rank + '</p>'
        + '<h2 class="m-name">' + esc(b.being) + '</h2>'
        + '<p class="m-num">REALM #' + b.n + ' &middot; weight ' + (tier.weight || 0) + ' &middot; ' + esc(REGION[b.tier].name) + '</p>'
      + '</div>'
      + (traits ? '<div class="m-traits">' + traits + '</div>' : '')
      + '<div class="m-sec"><h3>Held by</h3><div class="m-owner"><code>' + esc(short(b.owner)) + '</code>'
        + '<button type="button" data-copy>Copy</button>'
        + (live ? '<a href="https://solscan.io/account/' + esc(b.owner) + '" target="_blank" rel="noopener">Solscan</a>' : '')
        + '</div>'
        + '<p class="m-tiers">' + o.members.length + ' being' + (o.members.length > 1 ? 's' : '') + ': ' + tierLine + '</p>'
        + (o.members.length > 1 ? '<div class="m-herd" data-herd></div><p class="m-note">Gold lines join everything this wallet holds.</p>' : '')
      + '</div>'
      + '<div class="m-sec"><h3>What the wallet receives</h3><div class="m-figs">'
        + '<div class="ty"><span>Reward</span><b class="num" data-reward>' + sol(reward) + '</b><i>SOL, once all ' + fmt(TOTAL_BEINGS) + ' are minted</i></div>'
        + '<div><span>' + TOKEN_NAME + '</span><b class="num">' + (tokens == null ? '…' : fmt(tokens)) + '</b><i>'
          + (tokens == null ? 'reading' : m.toFixed(1) + '×' + (m > 1 ? ' · boost up to +' + sol(high - reward) + ' SOL' : ' · no boost')) + '</i></div>'
      + '</div>'
      + '<div class="sum-total"><span>Total</span><b class="num">' + (m > 1 ? 'up to ' : '') + sol(m > 1 ? high : reward) + ' SOL</b>'
        + '<i>' + (m > 1 ? 'reward + ' + TOKEN_NAME + ' boost' : 'the reward; ' + TOKEN_NAME + ' would boost it') + '</i></div>'
      + '</div>'
      + '<div class="m-share"><button type="button" data-share>Share this being</button>'
        + '<a href="https://x.com/intent/post?text=' + xText + '&url=' + encodeURIComponent(url) + '" target="_blank" rel="noopener">Post on X</a></div>'
      /* the offer, pinned to the foot of the panel so it is always in reach */
      + '<div class="m-dock">'
        + (offer
          ? '<a class="m-offer" href="' + esc(offer) + '" target="_blank" rel="noopener">Make an offer</a>'
          : '<button type="button" class="m-offer" data-offer-soon>Make an offer</button>')
        + '<p class="m-soon" data-soon hidden>' + (live
          ? 'Offers open as soon as the marketplace lists this being.'
          : 'Offers open once the collection is minted. This one is a preview.') + '</p>'
      + '</div>';


    const hero = crop(b.n, 288); $("[data-art]", body).replaceWith(hero);
    const herd = $("[data-herd]", body);
    if (herd) o.members.forEach(x => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.style.setProperty("--c", (TIER[x.tier] || {}).color);
      btn.title = x.being + " · " + x.tier; btn.setAttribute("aria-label", x.being + ", " + x.tier);
      if (x === b) btn.className = "on";
      btn.appendChild(crop(x.n, 64));
      btn.addEventListener("click", () => choose(x));
      herd.appendChild(btn);
    });
    if (animate) countUp($("[data-reward]", body), reward);
    const soon = $("[data-offer-soon]", body);
    if (soon) soon.addEventListener("click", () => { $("[data-soon]", body).hidden = false; });
    $("[data-copy]", body).addEventListener("click", e => {
      navigator.clipboard && navigator.clipboard.writeText(b.owner).then(() => { e.target.textContent = "Copied"; });
    });
    $("[data-share]", body).addEventListener("click", e => {
      if (navigator.share) navigator.share({ title: b.being + " · REALM", url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { e.target.textContent = "Link copied"; });
    });
    if (animate) body.scrollTop = 0, panel.scrollTop = 0;
    panel.hidden = false; document.body.classList.add("panel-open");
  }

  /* ---------- top holders ---------- */
  const tops = $("[data-tops]");
  $("[data-tops-open]").addEventListener("click", () => {
    const list = [...owners.values()].sort((a, b) => b.weight - a.weight).slice(0, 15);
    $("[data-tops-list]").innerHTML = list.map((o, i) =>
      '<li><button type="button" data-o="' + esc(o.owner) + '"><span class="num">' + (i + 1) + '</span>'
      + '<code>' + esc(short(o.owner)) + '</code><i>' + o.members.length + ' being' + (o.members.length > 1 ? 's' : '') + '</i>'
      + '<span class="m-dots">' + o.members.map(b => '<em style="background:' + (TIER[b.tier] || {}).color + '"></em>').join("") + '</span>'
      + '<b class="num">' + fmt(o.weight) + '</b></button></li>').join("");
    panel.hidden = true; tops.hidden = false; document.body.classList.add("panel-open");
  });
  $("[data-tops-close]").addEventListener("click", () => { tops.hidden = true; document.body.classList.remove("panel-open"); });
  $("[data-tops-list]").addEventListener("click", e => {
    const btn = e.target.closest("button[data-o]"); if (!btn) return;
    const o = owners.get(btn.dataset.o); if (o) choose(o.members[0]);
  });

  /* ---------- the key, which is also a filter ---------- */
  const legend = $("[data-legend]");
  function drawLegend() {
    const have = {}; beings.forEach(b => have[b.tier] = (have[b.tier] || 0) + 1);
    legend.innerHTML = ORDER.map(name => {
      const t = TIER[name]; if (!t) return "";
      return '<button type="button" data-t="' + name + '" aria-pressed="' + filter.has(name) + '" style="--c:' + t.color + '">'
        + '<em></em>' + plural(name)
        + '<span class="num">' + (have[name] || 0) + '/' + t.count + '</span></button>';
    }).join("");
  }
  legend.addEventListener("click", e => {
    const btn = e.target.closest("button[data-t]"); if (!btn) return;
    const t = btn.dataset.t;
    filter.has(t) ? filter.delete(t) : filter.add(t);
    drawLegend();
  });

  /* ---------- the ticker ---------- */
  const ticker = $("[data-ticker]");
  function announce(b, when) {
    const li = document.createElement("li");
    li.innerHTML = '<em style="background:' + (TIER[b.tier] || {}).color + '"></em><b>' + esc(b.being) + '</b> crossed'
      + '<span>' + esc(when) + '</span>';
    li.addEventListener("click", () => choose(b));
    ticker.prepend(li);
    while (ticker.children.length > 3) ticker.lastChild.remove();
  }
  function arrive(b, when) {
    arrivals.push({ b, t0: performance.now() });
    announce(b, when);
    count();
    drawLegend();
  }
  const count = () => {
    $("[data-count]").textContent = fmt(beings.length) + "/" + fmt(TOTAL_BEINGS) + " minted · " + fmt(owners.size) + " holders";
  };

  /* ---------- search ---------- */
  const msg = $("[data-msg]");
  $("[data-search]").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("input", e.target).value.trim().replace(/^#/, "");
    msg.textContent = "";
    if (/^\d{1,4}$/.test(q)) {
      const n = Number(q);
      if (n < 1 || n > TOTAL_BEINGS) return msg.textContent = "Beings are numbered 1 to " + fmt(TOTAL_BEINGS) + ".";
      const b = byN.get(n);
      return b ? choose(b) : msg.textContent = "#" + n + " has not crossed yet. Its place is waiting.";
    }
    if (ADDR.test(q)) {
      const o = owners.get(q);
      return o ? choose(o.members[0]) : msg.textContent = "That wallet holds no beings.";
    }
    msg.textContent = "Paste a Solana address, or type a number from 1 to " + fmt(TOTAL_BEINGS) + ".";
  });

  /* ---------- the entrance ---------- */
  function skipIntro() { intro = null; document.body.classList.remove("intro"); cam.z = fitZ(); }

  /* ---------- start ---------- */
  async function start() {
    resize();
    const img = new Image(); img.src = "map-atlas.webp" + ART;
    const [data] = await Promise.all([fetch("map-data.json" + ART).then(r => r.json()), img.decode(),
                                      document.fonts && document.fonts.load('600 14px "Pixelify Sans"').catch(() => {})]);
    atlas = img; cell = data.cell; cols = data.cols; info = data.beings;
    place(); paint();

    let list = null, tokens = null;
    try {
      const r = await fetch("/api/map"), d = await r.json();
      if (r.ok && d.ready) { list = d.beings; live = true; }
    } catch { /* the preview, then */ }
    if (!list) { preview = makePreview(); list = preview.list; tokens = preview.tokens; $("[data-preview]").hidden = false; }
    list.forEach(([n, o, m]) => add(n, o, m, tokens ? tokens[o] : null));
    count(); drawLegend();

    const q = new URLSearchParams(location.search);
    const n = Number(q.get("being")), w = q.get("wallet");
    const deep = (n && byN.get(n)) || (w && owners.get(w) && owners.get(w).members[0]);
    $("[data-intro-line]").textContent = fmt(beings.length) + " beings have crossed";
    if (deep || reduced) { skipIntro(); if (deep) choose(deep); }
    else {
      cam.z = 1.8; intro = { t0: performance.now() + 600, ms: 4200, z0: 1.8, z1: fitZ() };
      setTimeout(() => document.body.classList.add("intro-out"), 3200);
    }
    requestAnimationFrame(draw);

    if (live) setInterval(refresh, 60_000);
    else setTimeout(function demo() {         // the preview plays an arrival now and then
      if (!preview.rest.length) return;
      const n2 = preview.rest.shift(), wl = preview.wallets[Math.floor(preview.r() * preview.wallets.length)];
      const b = add(n2, wl, "", preview.tokens[wl]);
      if (b) arrive(b, "just now · preview");
      setTimeout(demo, 9000 + preview.r() * 6000);
    }, 6500);
  }

  async function refresh() {
    try {
      const r = await fetch("/api/map"), d = await r.json();
      if (!r.ok || !d.ready) return;
      const seen = new Set(beings.map(b => b.n));
      d.beings.forEach(([n, o, m]) => {
        if (seen.has(n)) { const b = byN.get(n); if (b && b.owner !== o) moveOwner(b, o); return; }
        const b = add(n, o, m, null); if (b) arrive(b, "just now");
      });
    } catch { /* try again next minute */ }
  }
  function moveOwner(b, owner) {               // sold: the being joins its new holder
    const old = b.o; old.members = old.members.filter(x => x !== b); old.weight -= (TIER[b.tier] || {}).weight || 0;
    if (!old.members.length) owners.delete(old.owner);
    beings = beings.filter(x => x !== b); byN.delete(b.n);
    add(b.n, owner, b.mint, null);
  }

  start().catch(() => { $("[data-count]").textContent = "Could not load the map."; document.body.classList.remove("intro"); });
})();
