/* ============================================================
   REALM — the entrance.

   Three states on one page:
     gate     the tree, and the door in it
     tunnel   you are pulled through the door
     options  the chamber you come out into

   The tree is a still picture. Everything that makes it feel like a
   living place is drawn over it: the canopy bends in gusts, the sun
   flares through it, and the doorway breathes. Pressing ENTER plays the
   film, which opens on this exact picture and pushes in through the door.

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
  const AIM = { x: 0.505, y: 0.700 };   // the middle of the opening
  const SUN = { x: 0.506, y: 0.433 };   // the burst in the canopy.
                                      // Both measured off tree.jpg.

  /* The still IS the first frame of the film (gate.mp4), so pressing
     enter starts the zoom from exactly the picture already on screen.
     If the film is ever replaced, re-extract these from its frame 0. */
  const FULL = "tree.jpg";
  const SMALL = "tree-small.jpg";       // lighter, for narrow screens

  const canvas = document.getElementById("sky");
  const tree   = document.getElementById("tree");
  if (!canvas || !tree) return;

  /* Declared up here with the other elements, not beside the code that
     plays it: the paint loop draws the film and runs before that code is
     reached, which threw "Cannot access 'rush' before initialization" on
     every frame. */
  /* Named `reel`, not `rush`: paintTree already declares a local `rush` for
     the zoom factor, and a `const` in that function shadows this one for the
     whole of it — every frame threw "Cannot access 'rush' before
     initialization" from a line above the declaration that caused it. */
  const reel = document.getElementById("rush");
  let playing = false, filmAt = 0, filmBreathe = 1;
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

    bakeHush();
  }
  window.addEventListener("resize", resize);

  /* ---------- state ---------- */
  let phase   = "gate";
  let phaseAt = 0;
  let quality = 0.55;          // climbs on fast devices, falls on slow ones
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TUNNEL_MS  = 3800;
  const SWALLOW_MS = 1250;

  const smooth = (a, b, v) => {
    const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };


  /* ============================================================
     THE TREE
     ============================================================ */

  let art = null;
  (function loadTree() {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      art = img;
      buildPortal();
      tree.classList.add("ready");
    };
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
     THE LIGHT IN THE DOORWAY

     The picture is still, so the energy standing in the arch is still
     too. It is found once, by colour — the tree is green and the door
     is brown, so the one place where neither is the strongest colour is
     the light between them — and from then on that patch is redrawn
     every frame, climbing, so the colours move while the arch around
     them stays exactly where it is.
     ============================================================ */

  let maskCv = null, energyCv = null, PB = null, flowCv = null, flowC = null;

  function buildPortal() {
    const AW = 200, AH = Math.max(1, Math.round(AW * art.height / art.width));
    const probe = document.createElement("canvas");
    probe.width = AW; probe.height = AH;
    const pg = probe.getContext("2d", { willReadFrequently: true });
    pg.drawImage(art, 0, 0, AW, AH);

    let px;
    try { px = pg.getImageData(0, 0, AW, AH); } catch (e) { return; }
    const d = px.data;

    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, found = 0;
    for (let i = 0; i < d.length; i += 4) {
      const p = i >> 2, fx = (p % AW) / AW, fy = ((p / AW) | 0) / AH;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i + 3] = 0;
      if (fx < AIM.x - 0.16 || fx > AIM.x + 0.14) continue;
      if (fy < AIM.y - 0.255 || fy > AIM.y + 0.185) continue;
      if (g >= (r > b ? r : b) - 4) continue;   // green — that is the tree
      if (b < r * 0.82) continue;               // brown — that is the door
      if ((r + g + b) / 3 <= 62) continue;      // too dark to be the light
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
      found++;
      if (fx < x0) x0 = fx; if (fx > x1) x1 = fx;
      if (fy < y0) y0 = fy; if (fy > y1) y1 = fy;
    }
    if (found < 40) return;
    pg.putImageData(px, 0, 0);

    /* A stencil edge would show, so the shape is softened — but softening
       spreads it outward, over the door and the stone frame. Clipping the
       soft version back to the hard one puts the fade on the inside, so
       the mask never reaches anything that is not light. */
    const tiny = document.createElement("canvas");
    tiny.width = Math.max(1, AW / 9 | 0); tiny.height = Math.max(1, AH / 9 | 0);
    tiny.getContext("2d").drawImage(probe, 0, 0, tiny.width, tiny.height);

    maskCv = document.createElement("canvas");
    maskCv.width = AW; maskCv.height = AH;
    const mg = maskCv.getContext("2d");
    mg.drawImage(tiny, 0, 0, AW, AH);
    mg.drawImage(tiny, 0, 0, AW, AH);
    mg.globalCompositeOperation = "destination-in";
    mg.drawImage(probe, 0, 0);
    mg.globalCompositeOperation = "source-over";

    PB = { x0: Math.max(0, x0 - 0.02), y0: Math.max(0, y0 - 0.02),
           x1: Math.min(1, x1 + 0.02), y1: Math.min(1, y1 + 0.02) };

    /* ---------- the moving layer holds light and nothing else ----------
       Scrolling the picture itself dragged the door's hinges and the
       runes on the frame along with it. So the light is lifted out of
       the picture, masked to itself, and then blurred until there is no
       edge or letterform left in it — only the colour. That cloud is
       what climbs; the door and the frame underneath never move. */
    const EW = 180;
    const EH = Math.max(2, Math.round(EW *
      ((PB.y1 - PB.y0) * art.height) / ((PB.x1 - PB.x0) * art.width)));
    const lift = document.createElement("canvas");
    lift.width = EW; lift.height = EH;
    const lg = lift.getContext("2d");
    lg.drawImage(art,
      PB.x0 * art.width, PB.y0 * art.height,
      (PB.x1 - PB.x0) * art.width, (PB.y1 - PB.y0) * art.height,
      0, 0, EW, EH);
    lg.globalCompositeOperation = "destination-in";
    lg.drawImage(maskCv,
      PB.x0 * AW, PB.y0 * AH, (PB.x1 - PB.x0) * AW, (PB.y1 - PB.y0) * AH,
      0, 0, EW, EH);

    const smear = document.createElement("canvas");
    smear.width = Math.max(1, EW / 8 | 0); smear.height = Math.max(1, EH / 8 | 0);
    smear.getContext("2d").drawImage(lift, 0, 0, smear.width, smear.height);
    energyCv = document.createElement("canvas");
    energyCv.width = EW; energyCv.height = EH;
    energyCv.getContext("2d").drawImage(smear, 0, 0, EW, EH);

    flowCv = document.createElement("canvas");
    flowCv.width = 240;
    flowCv.height = Math.max(2, Math.round(240 *
      ((PB.y1 - PB.y0) * art.height) / ((PB.x1 - PB.x0) * art.width)));
    flowC = flowCv.getContext("2d");
  }

  /* One pass of the light, climbing. Two copies of it half a cycle
     apart, crossfaded, so it never reaches a seam and restarts. */
  function flowDoor(t, x, y, w, h, open) {
    if (!maskCv || !PB || !flowC || !energyCv) return;
    const FW = flowCv.width, FH = flowCv.height;

    flowC.setTransform(1, 0, 0, 1, 0, 0);
    flowC.clearRect(0, 0, FW, FH);

    /* Each copy has one join in it, where its top meets its own bottom.
       That join travels down the arch as it climbs, so each copy is
       weighted by how far the join is from the middle — at its most
       visible it is not being shown at all. */
    const u = (t / 4.2) % 1;
    for (const o of [u, (u + 0.5) % 1]) {
      flowC.globalAlpha = Math.abs(2 * o - 1);
      const up = o * FH;
      flowC.drawImage(energyCv, 0, -up,     FW, FH);
      flowC.drawImage(energyCv, 0, FH - up, FW, FH);
    }

    // filaments running up through it
    flowC.globalAlpha = 1;
    flowC.globalCompositeOperation = "lighter";
    for (let k = 0; k < 5; k++) {
      const ph = k * 1.7, climb = ((t * 0.33 + k / 5) % 1);
      flowC.strokeStyle = `hsla(${k % 2 ? 176 : 286},100%,84%,${0.11 * open})`;
      flowC.lineWidth = FW * 0.02;
      flowC.beginPath();
      for (let s = 0; s <= 14; s++) {
        const f = s / 14;
        const py = FH * (1 - ((f * 0.5 + climb) % 1));
        const pxx = FW * (0.52 + Math.sin(f * 4.2 + t * 1.1 + ph) * 0.17);
        s ? flowC.lineTo(pxx, py) : flowC.moveTo(pxx, py);
      }
      flowC.stroke();
    }
    flowC.globalCompositeOperation = "destination-in";
    flowC.drawImage(maskCv,
      PB.x0 * maskCv.width, PB.y0 * maskCv.height,
      (PB.x1 - PB.x0) * maskCv.width, (PB.y1 - PB.y0) * maskCv.height,
      0, 0, FW, FH);
    flowC.globalCompositeOperation = "source-over";

    /* added to the picture, not laid over it: the light brightens what
       is already in the arch, so the door and the frame beneath stay
       exactly where they are while the colour climbs through them */
    tc.globalCompositeOperation = "lighter";
    tc.globalAlpha = 0.5;
    tc.drawImage(flowCv, x + w * PB.x0, y + h * PB.y0,
                 w * (PB.x1 - PB.x0), h * (PB.y1 - PB.y0));
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = "source-over";
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

  /* On a wide screen a tall picture stretched edge to edge is cropped to
     the middle of the door: no sun, no canopy, and nothing left to zoom
     towards. So there it is held narrower than the screen, the whole arch
     and the sun's burst in view, and the sides are filled by backdrop(). */
  function frame(zoom, iw, ih) {
    iw = iw || art.width; ih = ih || art.height;
    let cover = Math.max(W / iw, H / ih);
    const wide = W > H * 1.05;
    if (wide) cover = Math.min(cover, Math.max(H * 1.25 / ih, W * 0.55 / iw));
    cover *= zoom;
    const w = iw * cover, h = ih * cover;
    const y = Math.min(0, H * (wide ? 0.5 : DOOR_AT) - h * AIM.y);
    return { x: (W - w) / 2, y, w, h };
  }

  /* What fills the sides when the picture is narrower than the screen:
     the same picture blown up and pushed back into the dark, then the
     picture's own edges feathered into it so there is no line. */
  function backdrop(src, iw, ih, x, w, k) {
    if (w >= W - 1) return;
    const c = Math.max(W / iw, H / ih) * 1.08;
    const bw = iw * c, bh = ih * c;
    tc.imageSmoothingEnabled = false;
    tc.drawImage(src, (W - bw) / 2, (H - bh) / 2, bw, bh);
    tc.fillStyle = `rgba(3,1,10,${0.55 + 0.1 * k})`;
    tc.fillRect(0, 0, W, H);
  }
  function feather(x, w) {
    if (w >= W - 1) return;
    const f = Math.min(w * 0.18, 160);
    for (const [from, to] of [[x, x + f], [x + w, x + w - f]]) {
      const g = tc.createLinearGradient(from, 0, to, 0);
      g.addColorStop(0, "rgba(3,1,10,1)");
      g.addColorStop(1, "rgba(3,1,10,0)");
      tc.fillStyle = g;
      tc.fillRect(Math.min(from, to) - 1, 0, f + 2, H);
    }
    tc.fillStyle = "#03010a";
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

    /* ---------- the film, on the same grid as everything else ----------
       Drawn into this canvas rather than shown as a video, so the pixels
       stay exactly the size they were on the door. Showing the element
       itself jumped from chunky pixel art to full-resolution film the
       instant you pressed enter, and back again when you arrived. */
    const filming = playing && reel && reel.videoWidth > 0;

    /* standing in front of it, not looking at a photograph */
    const breathe = filming ? filmBreathe
                            : 1 + 0.028 * (0.5 + 0.5 * Math.sin(t * 0.14));
    const rush = 1 + 17 * pull * pull * pull;      // and then, the doorway
    let { x, y, w, h } = frame(breathe);

    /* How far into going through: 0 on the door, 1 a second after enter.
       The lights, the wash and the sway all fade on this, so nothing pops
       off the moment the film takes over. */
    const lit = filming ? Math.max(0, 1 - (performance.now() - filmAt) / 1000) : 1;

    if (filming) {
      /* The film opens on exactly this picture, framed exactly as the
         still was, so the zoom starts from what is already on screen.
         As the camera arrives at the door the framing drifts to the
         middle of the film, where the passage and the flare are. */
      const p = reel.duration ? Math.min(1, reel.currentTime / reel.duration) : 0;
      const m = smooth(0.0, 0.45, p);
      const f = frame(breathe, reel.videoWidth, reel.videoHeight);
      const cover = Math.max(W / reel.videoWidth, H / reel.videoHeight);
      const cw = reel.videoWidth * cover, ch = reel.videoHeight * cover;
      x = f.x + ((W - cw) / 2 - f.x) * m;
      y = f.y + ((H - ch) / 2 - f.y) * m;
      w = f.w + (cw - f.w) * m;
      h = f.h + (ch - f.h) * m;
      backdrop(reel, reel.videoWidth, reel.videoHeight, x, w, 1 - m);
      tc.imageSmoothingEnabled = false;
      tc.drawImage(reel, x, y, w, h);
      tc.globalAlpha = 1 - m;
      feather(x, w);
      tc.globalAlpha = 1;
    }

    const ax = x + w * AIM.x, ay = y + h * AIM.y;

    tc.save();
    zoomed = pull > 0;
    if (pull > 0) {
      tc.translate(ax, ay); tc.scale(rush, rush); tc.translate(-ax, -ay);
      tc.globalAlpha = Math.max(0, 1 - Math.pow(pull, 2.4));
    }
    if (!filming) {
      backdrop(art, art.width, art.height, x, w, 1);
      /* the sway slides bands past the picture's edges; keep them in */
      tc.save();
      if (w < W - 1) { tc.beginPath(); tc.rect(x, 0, w, H); tc.clip(); }
      drawTree(t, pull, x, y, w, h);
      tc.restore();
      feather(x, w);
    }
    else if (lit > 0.65) {
      /* the still, swaying, laid over its own first frame for a moment,
         so the sway settles instead of snapping straight */
      tc.globalAlpha = (lit - 0.65) / 0.35;
      drawTree(t, pull, x, y, w, h);
      tc.globalAlpha = 1;
    }

    /* The doorway is left as painted.

       An animated portal was built here and taken out again. Every version
       of it was measurably better than the last — the mask traced and
       snapped to the stonework, the texture flattened both ways, the
       button lifted clear — and none of them was as good as the painting
       already is. The violet and teal in that gap were painted by someone
       who could see the whole picture at once; a canvas redrawing a strip
       of it sixty times a second was never going to improve on that.

       If it is ever wanted again it is in the history, whole, at 828d34b. */
    const door = 0.42 + 0.2 * Math.sin(t * 0.55) + 0.07 * Math.sin(t * 1.9);

    /* ---------- light ---------- */
    tc.globalCompositeOperation = "lighter";

    // the sun, flaring through the canopy
    const sx = x + w * SUN.x, sy = y + h * SUN.y;
    const flare = 0.34 + 0.12 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 2.3);
    glow(tc, sx, sy, w * 0.26, 48, flare * 0.42 * lit, 92);
    glow(tc, sx, sy, w * 0.07, 54, flare * lit, 99);

    tc.strokeStyle = `hsla(50,100%,92%,${0.13 * flare * lit})`;
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
    const open = (door + pull * 2.2) * lit;
    glow(tc, ax, ay, w * 0.26, 282, open * 0.3, 74);
    glow(tc, ax, ay, w * 0.10, 172, open * 0.5, 86);
    glow(tc, ax, ay, w * 0.04, 300, open, 96);

    tc.globalCompositeOperation = "source-over";

    /* where the picture ends, let it fall away into the dark rather
       than stopping on a line */
    const foot = y + h;
    if (foot < H + 1) {
      const fade = tc.createLinearGradient(0, foot - h * 0.1, 0, foot);
      fade.addColorStop(0, "rgba(3,1,10,0)");
      fade.addColorStop(1, "rgba(3,1,10,1)");
      tc.fillStyle = fade;
      tc.fillRect(0, foot - h * 0.1, W, h * 0.1 + 1);
      tc.fillStyle = "#03010a";
      tc.fillRect(0, foot, W, H - foot + 1);
    }

    tc.restore();

    if (hush && lit > 0) {
      tc.globalAlpha = lit;
      tc.drawImage(hush, 0, 0, W, H);
      tc.globalAlpha = 1;
    }
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
      if (pull >= 1 && tree.style.display !== "none") tree.style.display = "none";
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

  /* ---------- going through ----------
     A film, not a simulation of one.

     There used to be a canvas tunnel here: the picture zoomed into the
     doorway, then a feedback loop of scaled copies stood in for the
     passage. It was a good imitation and it was still an imitation. The
     video is the thing itself, it ends on the white flare exactly where
     the chamber should take over, and it is 980 KB.

     The canvas tunnel is kept as the fallback, for a browser that will
     not play it and for anyone who has asked for less motion. */
  function canFilm() {
    if (!reel || still || !reel.canPlayType) return false;
    return reel.canPlayType("video/webm") !== "" ||
           reel.canPlayType("video/mp4") !== "";
  }

  function film() {
    /* freeze the slow breathing where it is, so the film is framed the
       same as the still was at the instant of the press */
    filmBreathe = 1 + 0.028 * (0.5 + 0.5 * Math.sin(performance.now() * 0.001 * 0.14));
    filmAt = performance.now();
    playing = true;

    let fellBack = false;
    const fallBack = () => {
      if (!playing || fellBack) return;
      fellBack = true; playing = false;
      canvasRush();                       // the canvas tunnel, as it was
    };
    const done = () => {
      if (!playing) return;
      playing = false; clearTimeout(stall); clearTimeout(guard);
      land();
    };

    /* Two guards, because a video can fail in two ways.

       It can refuse to start — no codec, a policy, a dead connection — and
       that has to be caught FAST: a second and a bit of nothing, then the
       canvas tunnel runs instead and nobody notices. Waiting out a long
       timeout would leave somebody staring at a door that has already shut
       behind them.

       Or it can start and then stall. That one is caught by a backstop set
       from the real duration once the browser knows it. */
    /* 2.2s, not 1.3. A phone on a cold cellular connection can take longer
       than a second to get the first frame out, and cutting to the fallback
       while the film was about to start is worse than waiting a moment. */
    const stall = setTimeout(() => { if (reel.currentTime < 0.05) fallBack(); }, 2200);
    let guard = setTimeout(done, 9000);
    reel.addEventListener("loadedmetadata", () => {
      if (reel.duration && isFinite(reel.duration)) {
        clearTimeout(guard);
        guard = setTimeout(done, reel.duration * 1000 + 1200);
      }
    }, { once: true });

    reel.addEventListener("ended", done, { once: true });

    const p = reel.play();
    if (p && p.catch) p.catch(() => { clearTimeout(stall); fallBack(); });
  }

  function canvasRush() {
    playing = false;
    gate.classList.remove("filming");
    gate.classList.add("gone");
    pullFrom = performance.now();
    setTimeout(() => go("tunnel"), SWALLOW_MS * 0.58);
    setTimeout(land, SWALLOW_MS + TUNNEL_MS);
  }

  function enter() {
    if (phase !== "gate") return;
    if (still) { gate.classList.add("gone"); land(); return; }
    if (canFilm()) {
      /* Only the writing fades. .gate.gone would take the canvas with it,
         and the canvas is where the film is being drawn — that is what
         made it play for a second and then go black. */
      gate.classList.add("filming");
      film();
      return;
    }
    gate.classList.add("gone");
    canvasRush();
  }

  function land() {
    go("options");
    playing = false;
    if (reel) reel.pause();
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
  window.addEventListener("pointerdown", (e) => {
    if (phase === "tunnel") land();
    /* the film too, after a beat so the press on ENTER itself doesn't
       count as the skip */
    else if (playing && performance.now() - filmAt > 600 && !e.target.closest("#enter")) {
      playing = false; land();
    }
  });

  window.RealmGate = { enter, land };

  resize();
  go("gate");
  requestAnimationFrame(loop);
})();
