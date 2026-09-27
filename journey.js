/* ============================================================
   REALM — the chamber.

   Where you come out of the tunnel. One room, five ways on.

   The room is a still picture, so everything that makes it feel
   inhabited is drawn over it: the light in the eyes and the doorway
   breathes, the floor moves like water, beings drift between the
   spires, and the whole room pushes very slowly in and out as though
   you were standing in it rather than looking at it.

   The options themselves are in OPTIONS below.
   ============================================================ */

window.RealmJourney = (() => {
  "use strict";

  const OPTIONS = [
    { key: "mint",    label: "MINT",       panel: "mint" },
    { key: "beings",  label: "THE BEINGS", panel: "nfts" },
    { key: "rewards", label: "REWARDS",    panel: "rewards" },
    { key: "lore",    label: "LORE",       panel: "lore" }
    
  ];

  return { OPTIONS };
})();


(() => {
  "use strict";

  const wrap = document.querySelector(".journey");
  if (!wrap) return;
  const cv = document.getElementById("chamber");
  if (!cv) return;

  const { OPTIONS } = window.RealmJourney;
  const ctx  = cv.getContext("2d");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* data.js declares these with const, so they are globals but not
     properties of window. Reach them by name, with a fallback. */
  const g_ = (name, fallback) => {
    try { return eval(name); } catch (e) { return fallback; }
  };

  /* ---------- the room ----------
     Landmarks are fractions of the picture, measured off the artwork,
     so the light lands on the right things at any size. */
  const EYE_HIGH = { x: 0.500, y: 0.094 };   // the eye above the apex
  const EYE_BIG  = { x: 0.500, y: 0.358 };   // the eye in the pyramid
  const DOOR     = { x: 0.500, y: 0.655 };   // the lit doorway at the end
  const FLOOR    = 0.735;                     // where the floor begins

  let art = null;
  let W = 0, H = 0, GW = 0, GH = 0;

  /* Drawn small and blown up hard, the same grid the door uses, so the
     room and everything living in it are pixel art too. */
  const PX = 3;

  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- loading, small picture on small screens ---------- */
  (function loadRoom() {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { art = img; resize(); };
    img.src = (window.innerWidth <= 700 || (window.devicePixelRatio || 1) < 2)
      ? "chamber-small.png" : "chamber.png";
  })();

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    GW = Math.max(1, Math.round(W / PX));
    GH = Math.max(1, Math.round(H / PX));
    cv.width = GW; cv.height = GH;
    ctx.setTransform(GW / W, 0, 0, GH / H, 0, 0);
    bakeOverlay();
    seedMotes();
  }

  /* The two washes that hold the room back never change, and filling
     the whole screen with a gradient twice a frame is the single most
     expensive thing here. So they are painted once and stamped. */
  let overlay = null;
  function bakeOverlay() {
    const ow = Math.max(2, Math.round(W / 3)), oh = Math.max(2, Math.round(H / 3));
    overlay = document.createElement("canvas");
    overlay.width = ow; overlay.height = oh;
    const g = overlay.getContext("2d");

    const vig = g.createRadialGradient(ow / 2, oh * 0.45, Math.min(ow, oh) * 0.2,
                                       ow / 2, oh * 0.45, Math.hypot(ow, oh) * 0.62);
    vig.addColorStop(0,   "rgba(3,1,10,0)");
    vig.addColorStop(0.7, "rgba(3,1,10,0.35)");
    vig.addColorStop(1,   "rgba(3,1,10,0.88)");
    g.fillStyle = vig;
    g.fillRect(0, 0, ow, oh);

    const scrim = g.createLinearGradient(0, oh * 0.30, 0, oh);
    scrim.addColorStop(0,    "rgba(3,1,10,0)");
    scrim.addColorStop(0.42, "rgba(3,1,10,0.42)");
    scrim.addColorStop(0.72, "rgba(3,1,10,0.76)");
    scrim.addColorStop(1,    "rgba(3,1,10,0.9)");
    g.fillStyle = scrim;
    g.fillRect(0, oh * 0.30, ow, oh * 0.70);
  }
  window.addEventListener("resize", resize);

  /* ---------- where the room sits ----------
     Always full bleed: whatever the shape of the screen, the picture
     covers it. What is then chosen is which part you are standing in
     front of — the eye in the pyramid is held high, above the words,
     and the picture is slid no further than its own edges allow. */
  function frame(zoom, sway) {
    const cover = Math.max(W / art.width, H / art.height) * zoom;
    const w = art.width * cover, h = art.height * cover;
    let y = H * 0.30 - h * EYE_BIG.y;
    if (y > 0)     y = 0;
    if (y < H - h) y = H - h;
    // drift sideways, but never far enough to show an edge
    const room = Math.max(0, (w - W) / 2);
    const x = (W - w) / 2 + sway * Math.min(room, W * 0.02);
    return { x, y, w, h };
  }

  /* ---------- dust in the air ---------- */
  let motes = [];
  function seedMotes() {
    motes = [];
    const n = Math.min(60, Math.round((W * H) / 16000));
    for (let i = 0; i < n; i++) {
      motes.push({
        x: Math.random(), y: Math.random(),
        r: rand(0.5, 1.9),
        vy: rand(0.006, 0.026),
        drift: rand(0, 6.3),
        hue: rand(178, 300),
        tw: rand(0.5, 2.1)
      });
    }
  }

  /* ---------- the things that live here ----------
     The beings are the ones from the collection, drawn small and lit
     from within, drifting between the spires. */
  let beings = [];
  function bakeBeings() {
    const TIERS = g_("TIERS", null);
    if (beings.length || !window.RealmForms || !TIERS) return;
    const keys = ["god", "entity", "mythic", "legendary", "epic", "rare", "uncommon"];
    beings = keys.map((tier, n) => {
      const t = TIERS.find(x => x.key === tier);
      if (!t) return null;
      return {
        img: RealmForms.pixelate(
          RealmForms.makeForm({ id: 700 + n, n: n + 1, tier, tierName: t.name, color: t.color }), 20),
        x: rand(0.08, 0.92), y: rand(0.16, 0.66),
        vx: rand(0.004, 0.017) * (Math.random() < 0.5 ? -1 : 1),
        vy: rand(0.002, 0.009) * (Math.random() < 0.5 ? -1 : 1),
        s:  rand(0.045, 0.1),
        ph: rand(0, 6.3),
        a:  rand(0.3, 0.62)
      };
    }).filter(Boolean);
  }

  /* a pocket of dark for a being to stand in, painted once */
  let pocketCv = null;
  function pocket() {
    if (pocketCv) return pocketCv;
    pocketCv = document.createElement("canvas");
    pocketCv.width = pocketCv.height = 72;
    const g = pocketCv.getContext("2d");
    const r = g.createRadialGradient(36, 36, 0, 36, 36, 36);
    r.addColorStop(0,    "rgba(3,1,10,0.8)");
    r.addColorStop(0.55, "rgba(3,1,10,0.45)");
    r.addColorStop(1,    "rgba(3,1,10,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 72, 72);
    return pocketCv;
  }

  /* ---------- light ---------- */
  function glow(x, y, r, hue, a, light) {
    if (a <= 0.004 || r <= 0) return;
    if (x + r < 0 || x - r > W || y + r < 0 || y - r > H) return;   // off-screen
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,    `hsla(${hue},100%,${light || 78}%,${a})`);
    g.addColorStop(0.38, `hsla(${hue},100%,62%,${a * 0.34})`);
    g.addColorStop(1,    "hsla(0,0%,0%,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ---------- one frame ---------- */
  let ringT = 0;

  function paint(t, dt) {
    ctx.setTransform(GW / W, 0, 0, GH / H, 0, 0);
    ctx.fillStyle = "#03010a";
    ctx.fillRect(0, 0, W, H);
    if (!art) return;

    /* the room breathes: a slow push in and out, so standing here
       never feels like looking at a photograph */
    const zoom = 1 + 0.035 * (0.5 + 0.5 * Math.sin(t * 0.12));
    const { x, y, w, h } = frame(zoom, Math.sin(t * 0.055));

    ctx.drawImage(art, x, y, w, h);

    /* ---------- the floor moves like water ----------
       Only the rows below FLOOR, each slid sideways by its own slow
       wave, further the nearer it is. Drawn a little wider than the
       picture so a sliding row never shows its edge. */
    const N = 18;
    const y0 = FLOOR, span = 1 - FLOOR;
    const srcH = art.height * span / N;
    const dstH = h * span / N;
    for (let i = 0; i < N; i++) {
      const dy = y + h * y0 + i * dstH;
      if (dy + dstH < 0 || dy > H) continue;       // that row is off-screen
      const f = i / N;                              // 0 far, 1 near
      const amp = w * 0.0065 * Math.pow(f, 1.7);
      const off = Math.sin(f * 6.2 - t * 0.85) * amp
                + Math.sin(f * 13.0 - t * 0.41) * amp * 0.4;
      const over = amp * 2.4 + 1;
      ctx.drawImage(art,
        0, art.height * y0 + i * srcH, art.width, srcH + 2,
        x + off - over, dy, w + over * 2, dstH + 2);
    }

    /* ---------- everything that gives off light ---------- */
    ctx.globalCompositeOperation = "lighter";

    const P  = { x: x + w * DOOR.x,     y: y + h * DOOR.y };
    const E1 = { x: x + w * EYE_BIG.x,  y: y + h * EYE_BIG.y };
    const E2 = { x: x + w * EYE_HIGH.x, y: y + h * EYE_HIGH.y };

    // the doorway at the end of the hall
    const door = 0.3 + 0.16 * Math.sin(t * 0.63) + 0.06 * Math.sin(t * 1.7);
    glow(P.x, P.y, w * 0.30, 44, door * 0.5, 86);
    glow(P.x, P.y, w * 0.11, 52, door, 95);

    // light spilling out of it along the floor
    if (P.y < H && y + h > P.y) {
      const spill = ctx.createLinearGradient(P.x, P.y, P.x, y + h);
      spill.addColorStop(0, `hsla(44,100%,76%,${0.2 * door})`);
      spill.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = spill;
      ctx.fillRect(Math.max(x, 0), P.y, Math.min(w, W), Math.min(y + h, H) - P.y);
    }

    // the two eyes, awake at their own pace
    glow(E1.x, E1.y, w * 0.115, 38, 0.22 + 0.17 * Math.sin(t * 0.83), 90);
    glow(E2.x, E2.y, w * 0.062, 196, 0.20 + 0.16 * Math.sin(t * 1.21 + 2), 92);

    /* a ring leaves an eye now and then and opens outwards — the room
       noticing you */
    ringT += dt;
    const period = 5.4;
    const rp = (ringT % period) / period;
    if (rp < 0.62) {
      const e = ringT % (period * 2) < period ? E1 : E2;
      const k = rp / 0.62;
      ctx.strokeStyle = `hsla(${ringT % (period * 2) < period ? 40 : 196},100%,80%,${0.34 * (1 - k)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(e.x, e.y, w * (0.05 + k * 0.30), 0, Math.PI * 2);
      ctx.stroke();
    }

    // the shaft of light up the middle, with pulses climbing it
    const beam = ctx.createLinearGradient(x + w * 0.5 - w * 0.03, 0, x + w * 0.5 + w * 0.03, 0);
    beam.addColorStop(0,   "hsla(0,0%,0%,0)");
    beam.addColorStop(0.5, `hsla(50,100%,88%,${0.12 + 0.05 * Math.sin(t * 0.9)})`);
    beam.addColorStop(1,   "hsla(0,0%,0%,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(x + w * 0.47, y, w * 0.06, h * 0.78);

    for (let k = 0; k < 3; k++) {
      const u = ((t * 0.19 + k / 3) % 1);
      const py = y + h * (0.74 - u * 0.66);
      const a  = Math.sin(u * Math.PI) * 0.5;
      glow(x + w * 0.5, py, w * 0.05, 52, a * 0.5, 94);
    }

    /* light moving across the crystal — three slow bands, as though
       something out of frame were turning */
    for (let k = 0; k < 3; k++) {
      const bx = (((t * 0.035 + k / 3) % 1) * 1.6 - 0.3) * W;
      const half = W * 0.22;
      const l = Math.max(0, bx - half), r = Math.min(W, bx + half);
      if (r <= l) continue;
      const sweep = ctx.createLinearGradient(bx - half, 0, bx + half, H);
      sweep.addColorStop(0,   "hsla(0,0%,0%,0)");
      sweep.addColorStop(0.5, `hsla(${190 + k * 46},100%,74%,0.06)`);
      sweep.addColorStop(1,   "hsla(0,0%,0%,0)");
      ctx.fillStyle = sweep;
      ctx.fillRect(l, 0, r - l, H);
    }

    // dust
    for (const m of motes) {
      m.y -= m.vy * dt;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      const mx = (m.x + Math.sin(t * 0.25 + m.drift) * 0.012) * W;
      const my = m.y * H;
      const a  = 0.25 + 0.6 * Math.abs(Math.sin(t * m.tw + m.drift));
      ctx.fillStyle = `hsla(${m.hue},90%,86%,${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(mx, my, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    /* ---------- the things that live here ----------
       Drawn solid, not as light. The room is bright enough that
       anything added to it would simply vanish, so each being gets a
       pocket of dark to stand in and its own glow on top. */
    bakeBeings();
    for (const b of beings) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0.06 || b.x > 0.94) b.vx *= -1;
      if (b.y < 0.10 || b.y > 0.62) b.vy *= -1;

      const d  = w * b.s * (1 + Math.sin(t * 0.9 + b.ph) * 0.09);
      const bx = x + b.x * w, by = y + b.y * h;
      if (bx < -d || bx > W + d || by < -d || by > H * 0.92) continue;

      ctx.drawImage(pocket(), bx - d, by - d, d * 2, d * 2);

      ctx.globalAlpha = 0.72 + 0.22 * Math.sin(t * 0.7 + b.ph);
      ctx.imageSmoothingEnabled = false;      // a sprite keeps its pixels
      ctx.drawImage(b.img, bx - d / 2, by - d / 2, d, d);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = "lighter";
      glow(bx, by, d * 0.8, 200 + (b.ph * 30) % 120, 0.1, 80);
      ctx.globalCompositeOperation = "source-over";
    }

    /* ---------- hold the room back so the words read ---------- */
    if (overlay) ctx.drawImage(overlay, 0, 0, W, H);
  }

  /* ---------- the loop ---------- */
  let running = false, last = 0;
  function tick(ms) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (document.hidden) { last = ms; return; }
    const dt = Math.min(0.05, (ms - last) * 0.001);
    if (ms - last < 26) return;
    last = ms;
    paint(ms * 0.001, dt);
  }

  /* ---------- what each way on says about itself ---------- */
  function noteFor(o) {
    const cfg  = g_("CONFIG", {});
    const all  = g_("TOTAL_BEINGS", 1111);
    const gone = Math.min(Math.max(cfg.minted || 0, 0), all);
    switch (o.key) {
      case "mint":    return cfg.mintLink ? "open" : "shut";
      case "beings":  return all.toLocaleString() + " in all";
      case "rewards": return g_("POOL_PERCENT", 75) + "% of the mint";
      case "lore":    return "who they are";
      default:        return "";
    }
  }

  function open(o) {
    if (o.href) { window.location.href = o.href; return; }
    if (o.panel && window.RealmPanels) window.RealmPanels.show(o.panel);
  }

  /* ---------- writing that moves, same as the door ---------- */
  function liquify(el, text) {
    [...text].forEach((ch, i) => {
      const sp = document.createElement("span");
      sp.className = "ch";
      sp.style.setProperty("--i", i);
      sp.textContent = ch;
      if (ch === " ") sp.style.width = ".34em";
      el.appendChild(sp);
    });
  }

  function build() {
    const menu = document.querySelector(".j-menu");
    if (!menu || menu.children.length) return;

    OPTIONS.forEach(o => {
      const el = document.createElement(o.href ? "a" : "button");
      el.className = "slab";
      if (o.href) el.href = o.href; else el.type = "button";

      const word = document.createElement("b");
      word.className = "slab-in";
      liquify(word, o.label);

      const note = document.createElement("i");
      note.className = "slab-note";
      note.textContent = noteFor(o);

      el.append(word, note);
      el.addEventListener("click", e => {
        if (!o.href) { e.preventDefault(); open(o); }
      });
      menu.appendChild(el);
    });

    const where = document.querySelector(".j-where");
    if (where) {
      const all  = g_("TOTAL_BEINGS", 1111);
      const gone = Math.min(Math.max((g_("CONFIG", {}).minted) || 0, 0), all);
      where.textContent = gone
        ? `${gone.toLocaleString()} of ${all.toLocaleString()} taken`
        : `${all.toLocaleString()} beings · one drop`;
    }
  }

  /* back out to the door — the door is a whole entrance, so it is
     opened again rather than kept alive behind this */
  const back = document.getElementById("j-back");
  if (back) back.addEventListener("click", () => {
    if (document.querySelector(".panel:not([hidden])")) {
      if (window.RealmPanels) RealmPanels.hide();
      return;
    }
    window.location.reload();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && window.RealmPanels) RealmPanels.hide();
  });

  /* the mark in the bar does the same as the arrow, but only once you are
     past the door — clicking it at the door would replay the whole entrance */
  const brand = document.querySelector(".topbar .brand");
  if (brand) brand.addEventListener("click", e => {
    e.preventDefault();
    if (document.querySelector(".panel:not([hidden])")) {
      if (window.RealmPanels) RealmPanels.hide();
      return;
    }
    const j = document.querySelector(".journey");
    if (j && !j.hidden) window.location.reload();
  });

  function start() {
    if (running) return;
    build();
    resize();
    running = true;
    paint(0, 0);
    if (!still) requestAnimationFrame(tick);
  }

  window.RealmJourney.start = start;
})();
