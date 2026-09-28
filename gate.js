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

  let openCv = null, edgeCv = null;
  const layer = document.createElement("canvas");
  const lg = layer.getContext("2d");

  const GEO = ["#ff2ec4", "#22f0ff", "#ffe14a", "#9b6bff", "#ffffff", "#ff4d2e"];

  function isOpening(r, g, b) {
    const s = r + g + b;
    if (s > 400 && Math.min(r, g, b) > 110) return true;
    if (b > 70 && r > 60 && (b + r) > g * 2.05 && s > 160 && b > g - 10) return true;
    if (b > 90 && g > 70 && (b + g) > r * 2.15 && s > 200 && g > r) return true;
    return false;
  }

  function buildPortal() {
    const AW = art.width, AH = art.height;
    const probe = document.createElement("canvas");
    probe.width = AW; probe.height = AH;
    const pg = probe.getContext("2d", { willReadFrequently: true });
    pg.drawImage(art, 0, 0);
    let img;
    try { img = pg.getImageData(0, 0, AW, AH); }
    catch (e) { return; }
    const d = img.data;

    const open = new Uint8Array(AW * AH);
    const door = new Uint8Array(AW * AH);
    const ox0 = (0.40 * AW) | 0, ox1 = (0.63 * AW) | 0;
    const oy0 = (0.55 * AH) | 0, oy1 = (0.94 * AH) | 0;
    for (let y = oy0; y < oy1; y++) {
      for (let x = ox0; x < ox1; x++) {
        const i = (y * AW + x) * 4;
        if (isOpening(d[i], d[i + 1], d[i + 2])) open[y * AW + x] = 1;
      }
    }

    /* The slab: dark wood and the gold cut into it, left of the crack,
       and only as far down as the door is still a door. Below that the
       light has already swallowed it, and an outline there turns into
       a scribble. */
    const dx0 = (0.428 * AW) | 0, dx1 = (0.512 * AW) | 0;
    const dy0 = (0.578 * AH) | 0, dy1 = (0.845 * AH) | 0;
    for (let y = dy0; y < dy1; y++) {
      for (let x = dx0; x < dx1; x++) {
        const p = y * AW + x;
        if (open[p]) continue;
        const i = p * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2], s = r + g + b;
        const gold = r > 110 && g > 80 && b < 120 && r > b + 20;
        if (s < 150 || gold) door[p] = 1;
      }
    }

    const n = AW > 300 ? 2 : 1;
    const n2 = n * n;
    const dil = new Uint8Array(AW * AH);
    for (let y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++) {
        if (!door[y * AW + x]) continue;
        for (let dy = -n; dy <= n; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= AH) continue;
          for (let dx = -n; dx <= n; dx++) {
            if (dx * dx + dy * dy > n2) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= AW) continue;
            dil[yy * AW + xx] = 1;
          }
        }
      }
    }
    const closed = new Uint8Array(AW * AH);
    for (let y = n; y < AH - n; y++) {
      for (let x = n; x < AW - n; x++) {
        let ok = 1;
        for (let dy = -n; dy <= n && ok; dy++) {
          for (let dx = -n; dx <= n; dx++) {
            if (dx * dx + dy * dy > n2) continue;
            if (!dil[(y + dy) * AW + (x + dx)]) { ok = 0; break; }
          }
        }
        if (ok) closed[y * AW + x] = 1;
      }
    }
    for (let y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++) {
        if (x < dx0 - 1 || x > dx1 + 3 || y < dy0 || y > dy1) closed[y * AW + x] = 0;
      }
    }

    const oc = document.createElement("canvas");
    oc.width = AW; oc.height = AH;
    const oi = oc.getContext("2d").createImageData(AW, AH);
    const od = oi.data;
    let found = 0;
    for (let p = 0; p < open.length; p++) {
      if (!open[p]) continue;
      const i = p * 4;
      od[i] = od[i + 1] = od[i + 2] = od[i + 3] = 255;
      found++;
    }
    if (found < 80) return;
    oc.getContext("2d").putImageData(oi, 0, 0);
    openCv = oc;

    const ec = document.createElement("canvas");
    ec.width = AW; ec.height = AH;
    const ei = ec.getContext("2d").createImageData(AW, AH);
    const ed = ei.data;
    for (let y = 1; y < AH - 1; y++) {
      for (let x = 1; x < AW - 1; x++) {
        const p = y * AW + x;
        if (!closed[p]) continue;
        if (closed[p - 1] && closed[p + 1] && closed[p - AW] && closed[p + AW]) continue;
        const crack = x >= dx1 - (AW > 300 ? 7 : 4);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = ((y + dy) * AW + (x + dx)) * 4;
            ed[i]     = 255;
            ed[i + 1] = crack ? 236 : 186;
            ed[i + 2] = crack ? 140 : 48;
            ed[i + 3] = 255;
          }
        }
      }
    }
    ec.getContext("2d").putImageData(ei, 0, 0);
    edgeCv = ec;
  }

  function diamond(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r, y);
    g.closePath();
    g.stroke();
  }

  /* Flat colour and hard lines, in the gap. Clipped afterwards, so
     anything that would land on the door or the tree is thrown away. */
  function drawGeo(g, t, x, y, w, h) {
    const tt = still ? 1.2 : t;
    const fx = x + w * 0.548;
    const fy = y + h * 0.735;
    const reach = Math.min(w, h) * 0.2;

    g.fillStyle = "#070012";
    g.fillRect(x + w * 0.40, y + h * 0.54, w * 0.24, h * 0.42);

    g.save();
    g.translate(fx, fy);
    g.rotate(tt * 0.07);
    const wedges = [[0.1, "#ff2ec4"], [1.7, "#22f0ff"], [3.3, "#ffe14a"], [4.8, "#7a3cff"]];
    for (let i = 0; i < wedges.length; i++) {
      g.fillStyle = wedges[i][1];
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, reach * 1.45, wedges[i][0] + tt * 0.15, wedges[i][0] + 1.05 + tt * 0.15);
      g.closePath();
      g.fill();
    }
    g.restore();

    const step = Math.max(13, reach * 0.18);
    const shift = still ? 0 : (tt * 18) % (step * 2);
    g.lineWidth = 1.4;
    g.lineJoin = "miter";
    const x0 = x + w * 0.43, x1 = x + w * 0.64;
    const y0 = y + h * 0.56, y1 = y + h * 0.94;
    let row = 0;
    for (let py = y0; py < y1 + step; py += step, row++) {
      let col = 0;
      for (let px = x0; px < x1 + step; px += step, col++) {
        g.strokeStyle = GEO[(row * 2 + col + (tt * 0.6 | 0)) % GEO.length];
        diamond(g, px + ((row & 1) ? step * 0.5 : 0), py - shift, step * 0.40);
      }
    }

    const rings = [
      [3, 1.08,  0.25, 0, 2.5],
      [3, 0.74, -0.42, 1, 2.1],
      [6, 0.90,  0.16, 2, 1.8],
      [6, 0.54, -0.30, 3, 1.6],
      [4, 0.34,  0.55, 4, 1.5],
      [8, 1.22, -0.10, 1, 1.25]
    ];
    for (let r = 0; r < rings.length; r++) {
      const n = rings[r][0], rad = rings[r][1], sp = rings[r][2], ci = rings[r][3], lw = rings[r][4];
      g.save();
      g.translate(fx, fy);
      g.rotate(tt * sp);
      g.strokeStyle = GEO[ci % GEO.length];
      g.lineWidth = lw;
      g.beginPath();
      const rr = reach * rad;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
      g.restore();
    }

    g.save();
    g.translate(fx, fy);
    g.rotate(tt * 0.1);
    g.lineWidth = 1.3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.strokeStyle = i % 2 ? "#22f0ff" : "#ff2ec4";
      g.beginPath();
      g.moveTo(Math.cos(a) * reach * 0.1, Math.sin(a) * reach * 0.1);
      g.lineTo(Math.cos(a) * reach * 1.3, Math.sin(a) * reach * 1.3);
      g.stroke();
    }
    g.restore();

    for (let i = 0; i < 8; i++) {
      const a = tt * (0.32 + i * 0.035) + i * 0.9;
      const rad = reach * (0.3 + (i % 4) * 0.2);
      g.save();
      g.translate(fx + Math.cos(a) * rad, fy + Math.sin(a) * rad * 0.72);
      g.rotate(tt * 0.7 + i);
      g.fillStyle = GEO[i % GEO.length];
      g.beginPath();
      const s = 5 + (i % 3);
      g.moveTo(0, -s);
      g.lineTo(s * 0.86, s * 0.7);
      g.lineTo(-s * 0.86, s * 0.7);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  function paintPortal(t, pull, x, y, w, h) {
    if (!openCv) return;
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
      lg.save();
      if (pull > 0) {
        lg.translate(ax, ay);
        lg.scale(rush, rush);
        lg.translate(-ax, -ay);
      }
      lg.globalAlpha = 1;
      lg.globalCompositeOperation = "source-over";
      drawGeo(lg, t, x, y, w, h);

      lg.globalCompositeOperation = "destination-in";
      lg.imageSmoothingEnabled = false;
      lg.drawImage(openCv, x, y, w, h);

      lg.globalCompositeOperation = "source-over";
      lg.imageSmoothingEnabled = false;
      lg.globalAlpha = 0.82 + 0.18 * Math.sin(t * 1.35);
      if (edgeCv) lg.drawImage(edgeCv, x, y, w, h);
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
