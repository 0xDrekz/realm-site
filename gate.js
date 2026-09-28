/* ============================================================
   REALM — the entrance.

   Three states on one page:
     gate     the tree, and the door in it
     tunnel   you are pulled through the door
     options  the chamber you come out into

   The tree is a still picture. Everything that makes it feel like a
   living place is drawn over it: the canopy bends in gusts, the sun
   flares through it, smoke rises off the roots, and the doorway
   breathes. Pressing ENTER rushes the whole picture into that doorway.

   The tunnel is meant to be punishing. It measures its own frame rate
   and adds detail until the device is working hard, then holds there —
   so a fast phone gets something overwhelming and an old one still
   gets through without locking up.
   ============================================================ */

(() => {
  "use strict";

  /* ---------- the picture, and the two places that matter in it ----------
     Both are fractions: how far across, how far down. If the artwork is
     ever replaced, these two lines are what to re-measure. */
  const AIM = { x: 0.503, y: 0.745 };   // the doorway — where the zoom goes.
                                      // Measured off the art rather than
                                      // guessed: the old value was 19px to
                                      // the right of the actual arch.
  const SUN = { x: 0.513, y: 0.436 };   // the burst of light in the canopy

  const FULL = "tree.png";
  const SMALL = "tree-small.png";       // lighter, for narrow screens

  const canvas = document.getElementById("sky");
  const tree   = document.getElementById("tree");
  if (!canvas || !tree) return;
  const ctx = canvas.getContext("2d");
  const tc  = tree.getContext("2d");

  /* two buffers, so each frame of the tunnel can be drawn on top of a
     scaled copy of the last one — that feedback is what makes it feel
     endless */
  const A = document.createElement("canvas"), a = A.getContext("2d");
  const B = document.createElement("canvas"), b = B.getContext("2d");
  let front = A, back = B, fc = a, bc = b;

  let W = 0, H = 0, cx = 0, cy = 0, R = 0, SC = 1, GW = 0, GH = 0;

  /* ---------- the grid ----------
     Everything is drawn into a canvas a fraction of the screen's size and
     then blown up by the browser with hard edges. That one decision makes
     the artwork, the sway, the light in the doorway and the whole tunnel
     pixel art together, rather than each needing its own treatment. Three
     screen pixels to one drawn pixel, so it reads the same on a phone as
     on a desk. */
  /* How chunky the pixels are: the canvas is drawn at 1/PX of the screen
     and blown back up with hard edges.

     It was 3. On a phone that made the canvas about 390 pixels across --
     NARROWER THAN THE 460-PIXEL ARTWORK, so the site was throwing away
     detail the picture already had and the result read as old console
     graphics rather than as pixel art. At 2 the canvas is wider than the
     source, so everything drawn in it survives. It costs a quarter of the
     drawing work instead of a ninth, which is still cheap. */
  const PX = 2;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    GW = Math.max(1, Math.round(W / PX));
    GH = Math.max(1, Math.round(H / PX));

    canvas.width = GW; canvas.height = GH;
    ctx.setTransform(GW / W, 0, 0, GH / H, 0, 0);
    SC = W > 900 ? 0.5 : 0.62;            // buffer scale
    const bw = Math.max(1, Math.floor(W * SC)), bh = Math.max(1, Math.floor(H * SC));
    for (const c of [A, B]) { c.width = bw; c.height = bh; }
    cx = W / 2; cy = H / 2;
    R  = Math.hypot(W, H) * 0.6;
    fc.setTransform(SC, 0, 0, SC, 0, 0);
    bc.setTransform(SC, 0, 0, SC, 0, 0);

    tree.width  = GW; tree.height = GH;
    tc.setTransform(GW / W, 0, 0, GH / H, 0, 0);

    /* The portal is the one sharp layer. The tree stays at 1/PX.
       This canvas is device pixels, so the geometry inside the door
       is finer than the leaves around it. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    portal.width  = Math.max(1, Math.round(W * dpr));
    portal.height = Math.max(1, Math.round(H * dpr));

    bakeHush();
    seedAir();
  }
  window.addEventListener("resize", resize);

  /* ---------- state ---------- */
  let phase   = "gate";
  let phaseAt = 0;
  let quality = 0.55;          // climbs on fast devices, falls on slow ones
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TUNNEL_MS  = 3800;
  const SWALLOW_MS = 1250;

  const rand = (a, b) => a + Math.random() * (b - a);


  /* ============================================================
     THE TREE
     ============================================================ */

  let art = null;
  (function loadTree() {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { art = img; buildPortal(); tree.classList.add("ready"); portal.classList.add("ready"); };
    img.onerror = () => {
      if (img.src.indexOf(SMALL) === -1) { img.src = SMALL; return; }
    };
    img.src = (window.innerWidth <= 700 || (window.devicePixelRatio || 1) < 2)
      ? SMALL : FULL;
  })();

  /* Full bleed across, and the doorway held just above the middle so
     that it is the first thing seen and nothing has to sit on top of
     it. The tree is a tall picture and the door is three quarters of
     the way down it, so holding the door that high means the roots run
     off the bottom of the screen — which is where the words stand, in
     the dark, rather than over the artwork. */
  const DOOR_AT = 0.44;


  /* ============================================================
     THE DOOR, AND WHAT IS THROUGH IT

     The tree stays pixelated. Inside the arch the picture has a door
     standing ajar, and that slab is outlined so the crack reads.
     Through the crack the light is not a blur of the painting: it is
     drawn again, sharper than the leaves, as flat colour and hard
     geometry that keeps moving.
     ============================================================ */

  const portal = document.createElement("canvas");
  portal.id = "portal";
  portal.setAttribute("aria-hidden", "true");
  tree.after(portal);
  const pc = portal.getContext("2d");

  function buildPortal() { /* the door and the gap are drawn as paths */ }

  /* The ajar door, traced off the picture. A stroke, not a box. */
  const DOOR = [
    [0.434, 0.648],
    [0.496, 0.638],
    [0.502, 0.670],
    [0.498, 0.808],
    [0.468, 0.830],
    [0.438, 0.814],
    [0.428, 0.710]
  ];

  /* The opening you see past that door: the arch of light, and the
     pool of it along the threshold. Not the carved slab. */
  const GAP = [
    [0.508, 0.610],
    [0.528, 0.568],
    [0.558, 0.562],
    [0.582, 0.610],
    [0.598, 0.690],
    [0.596, 0.790],
    [0.576, 0.870],
    [0.530, 0.916],
    [0.448, 0.908],
    [0.422, 0.868],
    [0.498, 0.836],
    [0.504, 0.680]
  ];

  function poly(g, x, y, w, h, pts) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = x + w * pts[i][0], py = y + h * pts[i][1];
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
  }

  function blob(g, x, y, r, hue, sat, light, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    gr.addColorStop(0,    `hsla(${hue},${sat}%,${light}%,${a})`);
    gr.addColorStop(0.42, `hsla(${hue},${sat}%,${Math.max(20, light - 18)}%,${a * 0.45})`);
    gr.addColorStop(1,    `hsla(${hue},${sat}%,${light}%,0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* A crystal standing in that place: a lit face and a shaded one,
     so it reads as a thing with volume, not an outline. */
  function crystal(g, cx, cy, s, hue) {
    g.beginPath();
    g.moveTo(cx, cy - s * 1.7);
    g.lineTo(cx - s * 0.46, cy + s * 0.15);
    g.lineTo(cx, cy + s * 0.02);
    g.closePath();
    g.fillStyle = `hsl(${hue}, 85%, 72%)`;
    g.fill();
    g.beginPath();
    g.moveTo(cx, cy - s * 1.7);
    g.lineTo(cx + s * 0.46, cy + s * 0.15);
    g.lineTo(cx, cy + s * 0.02);
    g.closePath();
    g.fillStyle = `hsl(${hue}, 70%, 38%)`;
    g.fill();
  }

  /* The world past the door. Depth, a sun, air, and solid forms —
     not lines sitting on black. */
  function drawGeo(g, t, x, y, w, h) {
    const tt = still ? 1.2 : t;
    const vx = x + w * 0.552;
    const vy = y + h * 0.70;
    const reach = Math.min(w * 0.16, h * 0.2);

    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    const sky = g.createLinearGradient(vx, vy - reach * 1.3, vx, vy + reach * 1.6);
    sky.addColorStop(0,    "#12061f");
    sky.addColorStop(0.38, "#3a1460");
    sky.addColorStop(0.62, "#c45a8a");
    sky.addColorStop(0.78, "#1a6e86");
    sky.addColorStop(1,    "#071820");
    g.fillStyle = sky;
    g.fillRect(x, y + h * 0.5, w, h * 0.5);

    g.globalCompositeOperation = "lighter";
    const drift = still ? 0 : tt;
    blob(g, vx + Math.sin(drift * 0.17) * w * 0.008,
            vy - reach * 0.08,
            reach * (1.15 + Math.sin(drift * 0.4) * 0.06),
            36, 90, 78, 0.9);
    blob(g, vx - reach * 0.25 + Math.sin(drift * 0.13) * w * 0.01,
            vy + reach * 0.05, reach * 1.5, 320, 100, 62, 0.42);
    blob(g, vx + reach * 0.3, vy + reach * 0.55, reach * 1.6, 176, 100, 60, 0.38);
    blob(g, vx, vy + reach * 0.02, reach * 0.42, 48, 40, 96, 0.85);

    g.globalAlpha = 0.34;
    for (let i = 0; i < 9; i++) {
      const a = drift * 0.07 + i * (Math.PI * 2 / 9);
      const spread = 0.07;
      g.fillStyle = i % 2 ? "rgba(255,214,140,0.95)" : "rgba(150,255,245,0.75)";
      g.beginPath();
      g.moveTo(vx, vy - reach * 0.02);
      g.lineTo(vx + Math.cos(a) * reach * 2.6, vy + Math.sin(a) * reach * 2.8);
      g.lineTo(vx + Math.cos(a + spread) * reach * 2.6, vy + Math.sin(a + spread) * reach * 2.8);
      g.closePath();
      g.fill();
    }

    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    const floor = g.createLinearGradient(vx, vy + reach * 0.15, vx, vy + reach * 1.5);
    floor.addColorStop(0,    "rgba(255,206,150,0)");
    floor.addColorStop(0.18, "rgba(255,176,110,0.55)");
    floor.addColorStop(0.5,  "rgba(16,78,98,0.45)");
    floor.addColorStop(1,    "rgba(4,14,22,0.2)");
    g.fillStyle = floor;
    g.beginPath();
    g.ellipse(vx, vy + reach * 0.72, reach * 1.5, reach * 0.62, 0, 0, Math.PI * 2);
    g.fill();

    /* spires standing on that ground, small and pale far away,
       larger and deeper in colour up close */
    const spires = [
      [-0.020, 0.55, 0.7,  268],
      [ 0.004, 0.62, 0.9,   36],
      [ 0.016, 0.70, 1.05, 174],
      [-0.010, 0.78, 1.25, 328],
      [ 0.012, 0.88, 1.5,  198],
      [-0.004, 0.98, 1.7,   48]
    ];
    for (let i = 0; i < spires.length; i++) {
      const sx = spires[i][0], depth = spires[i][1], sc = spires[i][2], hue = spires[i][3];
      const bob = still ? 0 : Math.sin(tt * 0.6 + i) * h * 0.002;
      crystal(g,
        vx + w * sx + Math.sin(tt * 0.2 + i) * w * 0.003,
        vy + h * 0.02 + reach * depth * 0.55 + bob,
        w * 0.011 * sc,
        hue);
    }

    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 10; i++) {
      const u = (tt * 0.04 + i / 10) % 1;
      const px = vx + Math.sin(i * 2.1 + tt * 0.3) * reach * (0.15 + u * 0.7);
      const py = vy + reach * (0.9 - u * 1.5);
      blob(g, px, py, 2.2 + u * 3.5, i % 2 ? 48 : 180, 100, 86, 0.55 * (1 - u));
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  function paintPortal(t, pull, x, y, w, h) {
    const dpr = portal.width / Math.max(1, W);
    if (layer.width !== portal.width || layer.height !== portal.height) {
      layer.width = portal.width;
      layer.height = portal.height;
    }
    const fade = pull > 0 ? Math.max(0, 1 - Math.pow(pull, 2.4)) : 1;
    lg.setTransform(dpr, 0, 0, dpr, 0, 0);
    lg.clearRect(0, 0, W, H);
    if (fade > 0.01) {
      const ax = x + w * AIM.x, ay = y + h * AIM.y;
      const rush = 1 + 17 * pull * pull * pull;
      const place = () => {
        if (pull > 0) {
          lg.translate(ax, ay);
          lg.scale(rush, rush);
          lg.translate(-ax, -ay);
        }
      };

      lg.save();
      place();
      poly(lg, x, y, w, h, GAP);
      lg.clip();
      drawGeo(lg, t, x, y, w, h);
      lg.restore();

      lg.save();
      place();
      lg.lineJoin = "round";
      lg.lineCap = "round";
      poly(lg, x, y, w, h, DOOR);
      lg.globalAlpha = 0.92;
      lg.strokeStyle = "#ffe14a";
      lg.lineWidth = 2.25;
      lg.stroke();
      lg.strokeStyle = "rgba(255,255,255,0.9)";
      lg.lineWidth = 1;
      lg.stroke();
      lg.restore();
    }

    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.clearRect(0, 0, portal.width, portal.height);
    pc.globalAlpha = fade;
    pc.imageSmoothingEnabled = true;
    pc.drawImage(layer, 0, 0);
    pc.globalAlpha = 1;
  }


  /* ---------- the tree will not hold still ----------
     Bands of the picture, each slid sideways by its own slow wave. The
     wave dies away downward, so the canopy moves the way a canopy does
     and the trunk, the door and the roots stay rooted. Sideways only:
     moving a band up or down tears a gap above it. */
  const BANDS = 48;

  function drawTree(t, pull, x, y, w, h) {
    /* Nearest, not smoothed.

       The canvas is a third of the screen, so the 460-pixel picture is
       always being scaled DOWN to be drawn — and with smoothing on, the
       browser averages it. That is what turned a light with a hot white
       core and hard rays into a soft blob: the art was defined and the
       drawing threw the definition away.

       Off, the pixels survive the downscale and the blow-up puts them
       back as hard blocks, which is the look the whole site is built on. */
    tc.imageSmoothingEnabled = false;

    const ease = Math.max(0, 1 - pull / 0.3);
    if (ease <= 0) { tc.drawImage(art, x, y, w, h); return; }

    const e2  = ease * ease;
    const src = art.height / BANDS;
    const k   = h / art.height;
    /* every band the same width, or the mismatch shows as a seam */
    const over = w * 0.028 * e2 + 2 * e2;

    /* Wind is not a metronome. A slow envelope makes it arrive in gusts
       and fall away again, so the tree is never doing the same thing for
       long. */
    const gust = 0.42 + 0.34 * Math.sin(t * 0.11)
                      + 0.18 * Math.sin(t * 0.27 + 1.3)
                      + 0.10 * Math.sin(t * 0.63 + 2.1);

    for (let i = 0; i < BANDS; i++) {
      const f = i / BANDS;                       // 0 at the crown, 1 at the roots

      /* How freely this height moves. The crown swings, the trunk barely
         does, the roots not at all — squared, so it falls away the way a
         trunk stiffens rather than in a straight line. */
      const give = Math.max(0, 1 - f / 0.66);
      const amp  = w * 0.013 * give * give * e2 * gust;

      /* Three waves at different lengths and speeds, and each one lags
         further down the tree, so what you see is a bend travelling up
         through the branches rather than every row sliding together. */
      const lag = f * 2.6;
      const dx = Math.sin(t * 0.55 - lag)         * amp
               + Math.sin(t * 0.91 - lag * 1.7)   * amp * 0.42
               + Math.sin(t * 1.83 - lag * 2.9)   * amp * 0.16;

      tc.drawImage(art, 0, i * src, art.width, src + 2,
                   x + dx - over, y + i * src * k, w + over * 2, (src + 2) * k);
    }
  }

  function frame(zoom) {
    const cover = Math.max(W / art.width, H / art.height) * zoom;
    const w = art.width * cover, h = art.height * cover;
    const y = Math.min(0, H * DOOR_AT - h * AIM.y);
    return { x: (W - w) / 2, y, w, h };
  }

  /* the wash that holds the picture back so the words on it can be
     read — the same every frame, so painted once */
  let hush = null;
  function bakeHush() {
    const ow = Math.max(2, Math.round(W / 3)), oh = Math.max(2, Math.round(H / 3));
    hush = document.createElement("canvas");
    hush.width = ow; hush.height = oh;
    const g = hush.getContext("2d");

    const vig = g.createRadialGradient(ow / 2, oh * 0.5, Math.min(ow, oh) * 0.24,
                                       ow / 2, oh * 0.5, Math.hypot(ow, oh) * 0.6);
    vig.addColorStop(0,   "rgba(3,1,10,0)");
    vig.addColorStop(0.7, "rgba(3,1,10,0.3)");
    vig.addColorStop(1,   "rgba(3,1,10,0.86)");
    g.fillStyle = vig;
    g.fillRect(0, 0, ow, oh);

    const scrim = g.createLinearGradient(0, oh * 0.5, 0, oh);
    scrim.addColorStop(0,   "rgba(3,1,10,0)");
    scrim.addColorStop(0.5, "rgba(3,1,10,0.5)");
    scrim.addColorStop(1,   "rgba(3,1,10,0.88)");
    g.fillStyle = scrim;
    g.fillRect(0, oh * 0.5, ow, oh * 0.5);
  }

  /* ---------- smoke ----------
     Baked as a handful of small sprites with a dithered edge, then drawn
     over and over. A soft gradient would look like a smudge once the
     screen is blown up; a dithered one breaks into the same pixels as
     everything else and reads as smoke made of them. */
  const PUFFS = [];
  function bakePuffs() {
    if (PUFFS.length) return;
    const BAYER = [
      [ 0,  8,  2, 10], [12,  4, 14,  6],
      [ 3, 11,  1,  9], [15,  7, 13,  5]
    ];
    /* deliberately tiny: every puff is drawn bigger than this, so the
       dither is magnified into the same chunky pixels as the rest
       rather than being thrown away by shrinking it */
    for (let v = 0; v < 3; v++) {
      const S = 11 + v * 5;
      const cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const g = cv.getContext("2d");
      const img = g.createImageData(S, S);
      const d = img.data;
      const c = (S - 1) / 2;
      for (let py = 0; py < S; py++) {
        for (let px = 0; px < S; px++) {
          const dx = (px - c) / c, dy = (py - c) / c;
          // a little squashed, and lumpier on one side than the other
          const r = Math.sqrt(dx * dx * (1 + v * 0.14) + dy * dy * 1.22);
          const lump = 1 + 0.16 * Math.sin(Math.atan2(dy, dx) * (3 + v) + v * 2.1);
          let a = 1 - r / lump;
          a = a <= 0 ? 0 : Math.pow(a, 1.5);
          // quantise through the dither table, so the edge crumbles
          const step = (BAYER[py & 3][px & 3] + 0.5) / 16;
          a = a * 6 - step > 0 ? Math.min(1, Math.round(a * 6 - step) / 6) : 0;
          const i4 = (py * S + px) * 4;
          d[i4] = 226; d[i4 + 1] = 216; d[i4 + 2] = 255;
          d[i4 + 3] = a * 255;
        }
      }
      g.putImageData(img, 0, 0);
      PUFFS.push(cv);
    }
  }

  let smoke = [];

  function seedAir() {
    bakePuffs();
    smoke = [];
    const n = Math.min(64, Math.round((W * H) / 5200));
    for (let i = 0; i < n; i++) smoke.push(newPuff(Math.random()));
  }

  /* Smoke comes up off the roots, thickest where the trunk meets the
     ground and thinning out to the sides. A puff is handed a fraction of
     a life when it is made, so that on the first frame the air is already
     full of smoke at every stage rather than a clean floor. */
  function newPuff(f) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const off  = Math.pow(Math.random(), 1.8) * 0.46 * side;
    const q = {
      x: 0.5 + off,
      y: 1.0 + Math.random() * 0.12,
      span: rand(9, 16),
      rise: rand(0.055, 0.115),
      sway: rand(0.5, 1.6),
      phase: rand(0, 6.3),
      drift: rand(-0.022, 0.022) + off * 0.07,
      size: rand(0.12, 0.3),
      grow: rand(0.8, 1.7),
      spr: (Math.random() * 3) | 0,
      a: rand(0.3, 0.58)
    };
    q.life = (f || 0) * q.span;
    q.y   -= q.rise * q.life;                  // already on its way up
    q.x   += q.drift * q.life;
    return q;
  }

  let zoomed = false;          // true while the picture is being rushed into
  function glow(g, x, y, r, hue, alpha, light) {
    if (alpha <= 0.004 || r <= 0) return;
    if (!zoomed && (x + r < 0 || x - r > W || y + r < 0 || y - r > H)) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0,    `hsla(${hue},100%,${light || 80}%,${alpha})`);
    gr.addColorStop(0.36, `hsla(${hue},100%,64%,${alpha * 0.34})`);
    gr.addColorStop(1,    "hsla(0,0%,0%,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ---------- one frame of the tree ---------- */
  function paintTree(t, dt, pull) {
    tc.setTransform(GW / W, 0, 0, GH / H, 0, 0);
    tc.clearRect(0, 0, W, H);
    if (!art) return;

    /* standing in front of it, not looking at a photograph */
    const breathe = 1 + 0.028 * (0.5 + 0.5 * Math.sin(t * 0.14));
    const rush = 1 + 17 * pull * pull * pull;      // and then, the doorway
    const { x, y, w, h } = frame(breathe);

    const ax = x + w * AIM.x, ay = y + h * AIM.y;

    tc.save();
    zoomed = pull > 0;
    if (pull > 0) {
      tc.translate(ax, ay); tc.scale(rush, rush); tc.translate(-ax, -ay);
      tc.globalAlpha = Math.max(0, 1 - Math.pow(pull, 2.4));
    }
    drawTree(t, pull, x, y, w, h);

    // the door outlined, and the geometry moving in the gap
    paintPortal(t, pull, x, y, w, h);
    const door = 0.42 + 0.2 * Math.sin(t * 0.55) + 0.07 * Math.sin(t * 1.9);

    /* ---------- light ---------- */
    tc.globalCompositeOperation = "lighter";

    // the sun, flaring through the canopy
    const sx = x + w * SUN.x, sy = y + h * SUN.y;
    const flare = 0.34 + 0.12 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 2.3);
    glow(tc, sx, sy, w * 0.26, 48, flare * 0.42, 92);
    glow(tc, sx, sy, w * 0.07, 54, flare, 99);

    tc.strokeStyle = `hsla(50,100%,92%,${0.13 * flare})`;
    tc.lineWidth = 1.4;
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + t * 0.04;
      const len = w * (0.14 + 0.07 * Math.sin(t * 1.3 + k));
      tc.beginPath();
      tc.moveTo(sx + Math.cos(ang) * w * 0.03, sy + Math.sin(ang) * w * 0.03);
      tc.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      tc.stroke();
    }

    // the light it throws into the room, in the tunnel's own colours
    /* a small halo on the frame only — the gap itself is drawn
       on the portal, and a big glow here would wash the door out */
    const open = door + pull * 2.2;
    glow(tc, ax, ay, w * 0.16, 286, open * 0.14, 70);
    glow(tc, ax, ay, w * 0.05, 176, open * 0.2, 88);

    tc.globalCompositeOperation = "source-over";

    /* where the picture ends, let it fall away into the dark rather
       than stopping on a line */
    const foot = y + h;
    if (foot < H + 1) {
      const fade = tc.createLinearGradient(0, foot - h * 0.1, 0, foot);
      fade.addColorStop(0, "rgba(3,1,10,0)");
      fade.addColorStop(1, "rgba(3,1,10,1)");
      tc.fillStyle = fade;
      tc.fillRect(x, foot - h * 0.1, w, h * 0.1 + 1);
      tc.fillStyle = "#03010a";
      tc.fillRect(0, foot, W, H - foot + 1);
    }

    tc.restore();

    /* ---------- the air between you and the tree ----------
       Drawn after the picture is put back, in plain screen space: none
       of this should rush into the doorway with the tree, and at
       seventeen times its size a firefly would be a saucer. */
    const air = Math.max(0, 1 - pull * 2.4);
    if (air > 0.01) {
      tc.globalCompositeOperation = "lighter";

      tc.globalCompositeOperation = "source-over";   // smoke blocks light
      tc.imageSmoothingEnabled = false;             // and keeps its pixels
      for (const q of smoke) {
        q.life += dt;
        if (q.life > q.span) { Object.assign(q, newPuff(0)); continue; }

        const u = q.life / q.span;              // 0 new, 1 spent
        q.y -= q.rise * dt;
        q.x += q.drift * dt + Math.sin(t * q.sway + q.phase) * 0.0016;

        // gathers quickly, holds through the middle, thins out at the top
        const fade = Math.min(1, u * 5) * Math.min(1, (1 - u) * 2.6);
        if (fade <= 0.01) continue;
        const d = W * q.size * (0.45 + q.grow * u);
        const px = q.x * W, py = q.y * H;
        if (px < -d || px > W + d || py < -d) continue;

        tc.globalAlpha = q.a * fade * air;
        tc.drawImage(PUFFS[q.spr], px - d / 2, py - d / 2, d, d);
      }
      tc.globalAlpha = 1;
      tc.imageSmoothingEnabled = true;
      tc.globalCompositeOperation = "lighter";

      tc.globalCompositeOperation = "source-over";
    }

    if (hush) tc.drawImage(hush, 0, 0, W, H);
  }


  /* ============================================================
     THE TUNNEL
     ============================================================ */

  function polygon(g, rr, sides, rot) {
    g.beginPath();
    for (let i = 0; i <= sides; i++) {
      const ang = (i / sides) * Math.PI * 2 + rot;
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  }

  /* One ring of the tunnel, with its own nested detail. */
  function ringAt(g, f, k, t, hue, intensity, detail) {
    const rr = Math.pow(f, 2.0) * R * 1.65;
    if (rr < 1.5) return;

    const fade = Math.min(1, f * 4) * (1 - f) * 2.1 * intensity;
    if (fade <= 0.01) return;
    const sides = 3 + (k % 10);
    const rot   = t * 0.22 * (k % 2 ? 1 : -1) + k * 0.37;

    g.strokeStyle = `hsla(${hue + k * 23},100%,${52 + (k % 3) * 6}%,${0.5 * fade})`;
    g.lineWidth = 0.8 + f * 5;
    polygon(g, rr, sides, rot);
    g.stroke();

    if (detail < 1) return;

    g.strokeStyle = `hsla(${hue + k * 23 + 150},100%,64%,${0.4 * fade})`;
    g.lineWidth = 0.6 + f * 2.4;
    polygon(g, rr * 0.72, sides + 2, -rot * 1.5);
    g.stroke();

    if (detail < 2) return;

    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2 + rot;
      g.moveTo(Math.cos(ang) * rr * 0.72, Math.sin(ang) * rr * 0.72);
      g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    g.strokeStyle = `hsla(${hue + k * 23 + 60},100%,68%,${0.26 * fade})`;
    g.lineWidth = 0.6;
    g.stroke();

    if (detail < 3) return;

    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2 + rot;
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      const nr = Math.max(0.8, rr * 0.035);
      g.moveTo(x + nr, y);
      g.arc(x, y, nr, 0, Math.PI * 2);
    }
    g.strokeStyle = `hsla(${hue + k * 23 + 210},100%,72%,${0.32 * fade})`;
    g.lineWidth = 0.7;
    g.stroke();
  }

  function paintTunnel(t) {
    const g = fc;
    const rush = Math.min(1, (performance.now() - phaseAt) / TUNNEL_MS);
    const intensity = 0.75 + rush * 0.9;
    const speed = 0.28 + rush * rush * 2.6;
    const hue   = t * (70 + rush * 190);

    // feedback: last frame, scaled up, underneath everything
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, front.width, front.height);
    g.globalAlpha = 0.66 + rush * 0.12;
    const zoom = 1 + 0.028 + rush * 0.05;
    const dw = front.width * zoom, dh = front.height * zoom;
    g.drawImage(back, (front.width - dw) / 2, (front.height - dh) / 2, dw, dh);
    g.globalAlpha = 1;
    g.setTransform(SC, 0, 0, SC, 0, 0);

    // darken what carried over, so trails decay instead of smearing white
    g.fillStyle = "rgba(0,0,0,0.26)";
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";

    const RINGS  = Math.round(46 * quality);
    const SYM    = Math.round(2 + 5 * quality);
    const detail = quality > 0.85 ? 3 : quality > 0.6 ? 2 : quality > 0.4 ? 1 : 0;
    const z = (t * speed) % 1;

    g.save();
    g.translate(cx, cy);
    for (let m = 0; m < SYM; m++) {
      g.save();
      g.rotate((m / SYM) * Math.PI * 2 + t * 0.05 * (m % 2 ? 1 : -1));
      for (let k = 0; k < RINGS; k++) {
        ringAt(g, ((k / RINGS) + z) % 1, k, t, hue + m * 31, intensity, detail);
      }
      g.restore();
    }
    g.restore();

    // the light you are heading into
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * (0.3 + rush * 0.7));
    const blow = Math.pow(rush, 2.2);          // the whiteout arrives late
    core.addColorStop(0,    `hsla(${hue + 50},100%,${70 + blow * 30}%,${0.2 + blow * 0.78})`);
    core.addColorStop(0.2,  `hsla(${hue},100%,62%,${0.14 + blow * 0.5})`);
    core.addColorStop(0.62, `hsla(${hue + 170},100%,54%,${0.05 + blow * 0.25})`);
    core.addColorStop(1,    "hsla(0,0%,0%,0)");
    g.fillStyle = core;
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = "source-over";

    const vig = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.12, cx, cy, R);
    vig.addColorStop(0,   "rgba(0,0,0,0)");
    vig.addColorStop(0.6, "rgba(0,0,0,0.37)");
    vig.addColorStop(1,   "rgba(0,0,0,0.88)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    // blit and swap
    ctx.drawImage(front, 0, 0, W, H);
    const tf = front, tcx = fc;
    front = back; fc = bc;
    back = tf;   bc = tcx;
  }


  /* ---------- the loop, with its own quality governor ---------- */
  let last = performance.now(), acc = 0, frames = 0;
  let pull = 0, pullFrom = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }

    const dt = Math.min(0.06, (now - last) * 0.001);
    if (now - last > 400) { last = now; return; }   // came back from the background
    last = now;
    const t = now * 0.001;

    if (phase === "tunnel" || phase === "options") paintTunnel(t);
    if (phase !== "options") {
      if (pullFrom) pull = Math.min(1, (now - pullFrom) / SWALLOW_MS);
      paintTree(t, dt, pull);
      if (pull >= 1 && tree.style.display !== "none") {
        tree.style.display = "none";
        portal.style.display = "none";
      }
    }

    /* Push the detail up while frames are cheap, back off when they are
       not. Checked over a handful of frames so it doesn't thrash. */
    acc += dt * 1000; frames++;
    if (frames >= 12) {
      const avg = acc / frames;
      acc = 0; frames = 0;
      if (avg < 15 && quality < 1)        quality = Math.min(1, quality + 0.08);
      else if (avg > 26 && quality > 0.3) quality = Math.max(0.3, quality - 0.12);
    }
  }

  /* ---------- states ---------- */
  const gate    = document.querySelector(".gate");
  const journey = document.querySelector(".journey");

  function go(next) {
    phase = next;
    phaseAt = performance.now();
    document.body.dataset.phase = next;
    if (next === "tunnel") {
      /* the buffers still hold whatever was there; feeding that forward
         is what bleached the tunnel to grey */
      for (const [cv, cx2] of [[A, a], [B, b]]) {
        cx2.setTransform(1, 0, 0, 1, 0, 0);
        cx2.fillStyle = "#000";
        cx2.fillRect(0, 0, cv.width, cv.height);
        cx2.setTransform(SC, 0, 0, SC, 0, 0);
      }
    }
  }

  function enter() {
    if (phase !== "gate") return;
    gate.classList.add("gone");
    if (still) { land(); return; }
    pullFrom = performance.now();
    setTimeout(() => go("tunnel"), SWALLOW_MS * 0.58);
    setTimeout(land, SWALLOW_MS + TUNNEL_MS);
  }

  function land() {
    go("options");
    if (gate) gate.style.display = "none";
    if (!journey) return;
    journey.hidden = false;
    if (window.RealmJourney && RealmJourney.start) RealmJourney.start();
    requestAnimationFrame(() => journey.classList.add("here"));
  }

  /* ---------- writing that moves ----------
     Each letter becomes its own element with its own place in the
     wave, so the words ripple across instead of animating as a block. */
  function liquify(el, cls) {
    if (!el) return;
    const text = el.textContent;
    el.textContent = "";
    [...text].forEach((ch, i) => {
      const sp = document.createElement("span");
      sp.className = cls + (/\d/.test(ch) ? " num" : "");
      sp.style.setProperty("--i", i);
      sp.textContent = ch;
      if (ch === " ") sp.style.width = ".32em";
      el.appendChild(sp);
    });
  }
  liquify(document.querySelector(".enter-in"), "ch");
  liquify(document.querySelector(".creed"), "ch soft");

  document.querySelector("#enter").addEventListener("click", enter);

  /* nobody should be trapped in the tunnel — a tap takes you straight
     through, and it becomes the obvious thing to do on a second visit */
  window.addEventListener("pointerdown", () => {
    if (phase === "tunnel") land();
  });

  window.RealmGate = { enter, land };

  resize();
  go("gate");
  requestAnimationFrame(loop);
})();
