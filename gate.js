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
  /* Two pictures of the same scene: a wide one for computers, a tall one
     for phones. aim is the middle of the opening and gap its box (both
     from tools/doorscene.py), sun the burst in the canopy. Bump ?v= when
     a picture changes. */
  const SCENES = {
    wide:  { src: "door.jpg?v=1", mask: "door-mask.png?v=2",
             aim: { x: 0.526, y: 0.614 }, sun: { x: 0.485, y: 0.178 },
             gap: { x0: 0.482, y0: 0.351, x1: 0.560, y1: 0.871 },
             /* the two painted sparkles, top right, and four drawn in to
                balance them on the left (drawn: true gets its own glint) */
             sparks: [[0.907, 0.142], [0.946, 0.212],
                      [0.120, 0.090, true], [0.250, 0.050, true],
                      [0.330, 0.330, true], [0.730, 0.070, true]] },
    phone: { src: "door-phone.jpg?v=1", mask: "door-mask-phone.png?v=1",
             aim: { x: 0.557, y: 0.593 }, sun: { x: 0.504, y: 0.328 },
             gap: { x0: 0.473, y0: 0.428, x1: 0.615, y1: 0.750 },
             /* the sparkles painted in the canopy, found by eye and colour */
             sparks: [[0.119, 0.060], [0.188, 0.122], [0.869, 0.084], [0.799, 0.140],
                      [0.056, 0.363], [0.121, 0.401], [0.921, 0.338], [0.876, 0.411]] },
  };
  const TALL = window.innerWidth / window.innerHeight < 0.8;
  const SCENE = TALL ? SCENES.phone : SCENES.wide;
  const AIM = SCENE.aim, SUN = SCENE.sun;

  /* The light, the smoke and the sway were tuned against the old painting,
     a tall picture of the tree alone. Sized against the width that tree
     would have at this height, they stay the size they were. */
  const TREE_W = 640 / 862;

  const canvas = document.getElementById("sky");
  const tree   = document.getElementById("tree");
  if (!canvas || !tree) return;

  const ctx = canvas.getContext("2d");
  const tc  = tree.getContext("2d");

  /* The realm has its own canvas at the FULL screen resolution, while the
     tree is drawn at half. That is deliberate and it is the whole point of
     the effect: what is through the doorway has to carry more detail than
     the wood around it, or it is just a differently coloured hole. */
  const portal = document.getElementById("portal");
  const pc = portal ? portal.getContext("2d") : null;


  /* two buffers, so each frame of the tunnel can be drawn on top of a
     scaled copy of the last one — that feedback is what makes it feel
     endless */
  const A = document.createElement("canvas"), a = A.getContext("2d");
  const B = document.createElement("canvas"), b = B.getContext("2d");
  let front = A, back = B, fc = a, bc = b;

  let W = 0, H = 0, cx = 0, cy = 0, R = 0, SC = 1, GW = 0, GH = 0;
  let PDPR = 1;

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
    if (portal) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      portal.width  = Math.max(1, Math.round(W * dpr));
      portal.height = Math.max(1, Math.round(H * dpr));
      PDPR = dpr;
    }
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
    img.onload = () => {
      art = img;
      tree.classList.add("ready");
      if (portal) portal.classList.add("ready");
    };
    img.src = SCENE.src;
  })();

  /* Full bleed across, and the doorway held just above the middle so
     that it is the first thing seen and nothing has to sit on top of
     it. The tree is a tall picture and the door is three quarters of
     the way down it, so holding the door that high means the roots run
     off the bottom of the screen — which is where the words stand, in
     the dark, rather than over the artwork. */
  const DOOR_AT = 0.44;


  /* ============================================================
     THE REALM, STANDING IN THE DOORWAY

     Three earlier attempts are worth knowing about, because each one
     failed for a different reason and the shape of this one is the answer
     to all three.

       1. The picture's own colours, lifted out of the arch, blurred and
          scrolled with "lighter". Compositing with "lighter" can only ever
          BRIGHTEN what is already there, so it read as the same green and
          violet as the tree. A brighter version of the wood is not another
          place.

       2. A generated plasma. It looked like a screensaver. Nothing
          generated carries the density of something drawn.

       3. The painting's own gap, flattened and slid upward as one block.
          A photograph sliding upward reads as a sliding photograph, not as
          energy — the giveaway is that every part of it moves the same way
          at the same time, which nothing alive does.

     So: a drawn texture (1), warped in strips that churn against each
     other (3), and recoloured through a travelling gradient into hues that
     appear nowhere else on the screen (2) — violet, teal, acid green, red.
     Drawn at the full screen resolution and clipped to the traced opening,
     so the door panel and the stonework are untouched and the realm is
     visibly finer-grained than the wood it sits in.
     ============================================================ */

  /* The opening, traced BY HAND and registered onto the artwork by
     tools/doormask.py. Three goes at finding it from colour all failed the
     same way — below the arch the glow on the ground is the same violet as
     the way through, so every rule either missed the edges or painted the
     floor. A hand-marked cut-out settles it, and the tool lines the mark up
     with the painting rather than trusting it was drawn to scale. */
  const GAP = SCENE.gap;

  const gapImg = new Image();
  let gapReady = false;
  gapImg.onload = () => { gapReady = true; };
  gapImg.src = SCENE.mask;

  /* the cut-out of the mask that covers GAP, taken once.
     The shape lives in the mask's ALPHA, not its brightness: canvas masks
     with destination-in, which tests alpha and ignores luminance, and a
     greyscale mask kept everything — the realm rendered as its own
     bounding rectangle. */
  let gapCut = null;
  function gapStencil() {
    if (gapCut || !gapReady) return gapCut;
    const w = gapImg.width, h = gapImg.height;
    const cv = document.createElement("canvas");
    cv.width  = Math.max(1, Math.round((GAP.x1 - GAP.x0) * w));
    cv.height = Math.max(1, Math.round((GAP.y1 - GAP.y0) * h));
    cv.getContext("2d").drawImage(gapImg,
      GAP.x0 * w, GAP.y0 * h, cv.width, cv.height, 0, 0, cv.width, cv.height);
    gapCut = cv;
    return gapCut;
  }

  /* The texture. Geometry and smoke from a corner of the Source's own
     artwork, flattened so no dark band can drift through the arch and look
     like an unfilled gap, then stacked with its own mirror so a drift
     upward loops for ever with no join. tools/realm.py builds it. */
  const realmImg = new Image();
  let realmReady = false;
  realmImg.onload = () => { realmReady = true; };
  realmImg.src = "realm.png";

  /* ---------- the colours ----------
     Patches of colour drifting against each other, NOT a gradient.

     A single linear gradient across the opening was tried and it came out
     as a rainbow: one hue at the top running smoothly to another at the
     bottom through every colour in between, including the yellows and
     oranges this palette does not want anywhere near it. A gradient reads
     as a gradient however it is coloured. Patches that move independently
     read as a field with something going on inside it.

     THREE colours, repeated, and no others.

     Seven hues spread round the wheel and stacked down a narrow opening is
     a rainbow however they are drawn — the doorway came out as a strip of
     spectrum, which is the one thing it must not look like. Purple, green
     and red, each appearing twice, read as three colours moving past each
     other. Where two of them meet the blend is short and dark, which the
     eye takes for depth rather than for another colour. */
  /* Narrow ribbons, taller than they are wide, and never the full width.

     Three shapes were tried and two of them read as something a person
     drew. Round blobs the width of the opening put an unmistakable green
     DOT in the middle of the doorway. Blobs stretched tall AND wide
     stacked into three flat vertical stripes. Narrow ones, each covering
     well under half the width and sweeping slowly across it, are neither:
     they overlap into ribbons that pass each other going up, which is what
     light moving through a gap actually looks like. */
  const BLOBS = [
    { hue: 285, x: 0.30, y: 0.00, ax: 0.34, ay: 0.05, sx: 0.051, sy: 0.037, r: 0.30, st: 3.4, ph: 0.0 },
    { hue: 120, x: 0.70, y: 0.12, ax: 0.32, ay: 0.06, sx: 0.037, sy: 0.059, r: 0.28, st: 3.0, ph: 1.9 },
    { hue: 350, x: 0.38, y: 0.25, ax: 0.35, ay: 0.05, sx: 0.067, sy: 0.043, r: 0.31, st: 3.2, ph: 3.4 },
    { hue: 285, x: 0.66, y: 0.37, ax: 0.33, ay: 0.06, sx: 0.059, sy: 0.031, r: 0.29, st: 3.6, ph: 2.6 },
    { hue: 120, x: 0.32, y: 0.50, ax: 0.34, ay: 0.05, sx: 0.045, sy: 0.071, r: 0.30, st: 3.1, ph: 4.7 },
    { hue: 350, x: 0.68, y: 0.62, ax: 0.32, ay: 0.06, sx: 0.063, sy: 0.049, r: 0.28, st: 3.5, ph: 5.5 },
    { hue: 285, x: 0.36, y: 0.75, ax: 0.35, ay: 0.05, sx: 0.041, sy: 0.065, r: 0.31, st: 3.0, ph: 0.9 },
    { hue: 120, x: 0.64, y: 0.87, ax: 0.33, ay: 0.06, sx: 0.055, sy: 0.039, r: 0.29, st: 3.3, ph: 2.2 }
  ];

  /* The field is painted small and blown up soft, so the colour is a wash
     the texture shows through rather than a second set of shapes competing
     with it. Its own canvas, kept between frames. */
  let fieldCv = null;
  function colourField(t, w, h) {
    const FW = 64, FH = Math.max(8, Math.round(FW * h / w));
    if (!fieldCv) fieldCv = document.createElement("canvas");
    if (fieldCv.width !== FW || fieldCv.height !== FH) {
      fieldCv.width = FW; fieldCv.height = FH;
    }
    const g = fieldCv.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.setTransform(1, 0, 0, 1, 0, 0);
    /* 92%, not 100%. Full saturation everywhere turned the doorway into a
       flat neon panel: with the "color" blend the field supplies ALL of the
       saturation, so pinning it to the maximum erases the difference
       between the lit parts of the texture and the rest. */
    g.fillStyle = "hsl(285,92%,46%)";
    g.fillRect(0, 0, FW, FH);

    for (const bl of BLOBS) {
      const bx = (bl.x + bl.ax * Math.sin(t * bl.sx * 6.283 + bl.ph)) * FW;
      /* climbing, with the texture — they wrap past the top and come back
         below the bottom, so the loop never shows */
      const v = ((bl.y - t * 0.028 + bl.ay * Math.sin(t * bl.sy * 6.283 + bl.ph * 1.7))
                 % 1 + 1) % 1;
      const by = (v * 1.5 - 0.25) * FH;
      const r = bl.r * FW * (1 + 0.18 * Math.sin(t * 0.21 + bl.ph));

      g.save();
      g.translate(bx, by);
      g.scale(1, bl.st);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      /* Held wide and then dropped off a cliff. A gentle falloff leaves a
         broad band of half-and-half wherever two of them meet, and half
         purple plus half green is GREY — a washed-out column ran down the
         middle of the doorway until this was tightened. */
      gr.addColorStop(0,    `hsla(${bl.hue},92%,52%,1)`);
      gr.addColorStop(0.68, `hsla(${bl.hue},92%,52%,0.96)`);
      gr.addColorStop(0.86, `hsla(${bl.hue},92%,52%,0.4)`);
      gr.addColorStop(1,    `hsla(${bl.hue},92%,52%,0)`);
      g.fillStyle = gr;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return fieldCv;
  }

  /* Recolouring needs the "color" blend: hue and saturation from the
     gradient, LIGHTNESS from the texture underneath, which is what keeps
     every bit of the drawn detail while replacing the colour completely.
     An unsupported composite value is ignored rather than refused, so it
     is tested by setting it and reading it back — without the test, an old
     browser would silently fall through to source-over and paint a flat
     wash of gradient straight over the texture. */
  const TINT = (() => {
    const g = document.createElement("canvas").getContext("2d");
    g.globalCompositeOperation = "color";
    return g.globalCompositeOperation === "color" ? "color" : "lighter";
  })();

  let pbuf = null;
  function portalBuf(w, h) {
    if (!pbuf) pbuf = document.createElement("canvas");
    if (pbuf.width !== w || pbuf.height !== h) { pbuf.width = w; pbuf.height = h; }
    return pbuf;
  }

  /* ---------- one layer of the churn ----------
     The texture drawn in horizontal strips, each one taking its slice from
     a different place across the picture. The offsets come from two sines
     at different lengths and speeds, so neighbouring strips pull against
     each other and the whole thing swirls instead of sliding.

     Sideways only, near enough. Every destination strip is painted edge to
     edge whatever its source offset, so no amount of horizontal warping
     can open a gap — moving a strip DOWN the screen would tear one above
     it. The small vertical term shifts where the slice is READ from, not
     where it lands, which stretches the content without leaving a hole. */
  function warpLayer(bg, fw, fh, t, rise, phase, zoom, mirror) {
    const half = realmImg.height / 2;        // the loop is half the tile

    /* Pick the HEIGHT first and derive the width from it. The other way
       round once asked for a slice 687 pixels tall out of a 514-pixel
       picture: it sampled past the bottom edge and left the foot of the
       doorway empty. The opening is far taller than it is wide, so height
       is the scarce dimension. */
    let srcH = (half * 0.92) / zoom;
    let srcW = srcH * (fw / fh);
    if (srcW > realmImg.width * 0.92) {
      srcW = realmImg.width * 0.92;
      srcH = srcW * (fh / fw);
    }
    const ox = (realmImg.width - srcW) / 2;
    /* whatever slack is left either side is how far a strip may travel —
       asking for pixels past the edge of the texture would smear the last
       column of it across the strip */
    const amp = Math.min(ox - 1, srcW * 0.085);
    const creep = mirror ? half - ((t * rise) % half) : ((t * rise) % half);

    const n = Math.max(14, Math.min(56, Math.round(fh / 7)));
    const dy = fh / n, sy = srcH / n;

    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const off = amp * (0.62 * Math.sin(f * 6.1 + t * 0.62 + phase)
                       + 0.38 * Math.sin(f * 13.4 - t * 1.07 + phase * 1.9));
      const lift = sy * 0.5 * Math.sin(f * 9.2 + t * 0.43 + phase * 2.3);
      /* a pixel of overlap each way, or rounding leaves hairlines between
         the strips that read as scanlines */
      bg.drawImage(realmImg,
        ox + off, creep + i * sy + lift, srcW, sy + 1,
        0, i * dy, fw, dy + 1);
    }
  }

  function drawPortal(t, x, y, w, h, pull, rush, ax, ay) {
    if (!pc || !gapReady || !realmReady) return;
    const cut = gapStencil();
    if (!cut) return;

    /* where the gap lands on the screen, in device pixels */
    const sx = (x + w * GAP.x0) * PDPR;
    const sy = (y + h * GAP.y0) * PDPR;
    const sw = w * (GAP.x1 - GAP.x0) * PDPR;
    const sh = h * (GAP.y1 - GAP.y0) * PDPR;

    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.clearRect(0, 0, portal.width, portal.height);
    if (sw < 2 || sh < 2) return;

    /* The buffer is a little smaller than the hole it fills, so the realm
       lands on a visibly finer grid than the tree's blocks without going
       smooth. The tree is drawn at half the screen; this is drawn at about
       four fifths of the opening. */
    const fw = Math.max(8, Math.min(260, Math.round(sw / 1.25)));
    const fh = Math.max(8, Math.min(520, Math.round(sh / 1.25)));
    const buf = portalBuf(fw, fh);
    const bg = buf.getContext("2d");

    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = "source-over";
    bg.globalAlpha = 1;
    bg.clearRect(0, 0, fw, fh);
    bg.imageSmoothingEnabled = false;

    /* two depths, at different speeds and different scales — one coming
       toward you, one drifting the other way behind it */
    const zoom = 1 + 0.09 * Math.sin(t * 0.19);
    warpLayer(bg, fw, fh, t, 15, 0, zoom, false);

    bg.globalCompositeOperation = "lighter";
    bg.globalAlpha = 0.18;                 // parallax, not brightness: 0.45
    warpLayer(bg, fw, fh, t, 7, 2.4,       // washed the whole thing to cream
              zoom * 1.34, true);
    bg.globalAlpha = 1;
    bg.globalCompositeOperation = "source-over";

    /* ---------- the colour, drifting through it ----------
       Smoothed on the way up, deliberately: this is the only part of the
       picture that is allowed to be soft. The hard pixels come from the
       texture underneath, and the colour is a wash over them. */
    bg.imageSmoothingEnabled = true;
    bg.globalCompositeOperation = TINT;
    bg.globalAlpha = TINT === "color" ? 1 : 0.5;
    bg.drawImage(colourField(t, fw, fh), 0, 0, fw, fh);
    bg.globalAlpha = 1;
    bg.imageSmoothingEnabled = false;

    /* ---------- hot filaments ----------
       Over the colour, not under it, so they keep a white edge. Short,
       wavy and faint: six long smooth ones read as scratches drawn across
       the doorway rather than as anything moving through it. */
    bg.globalCompositeOperation = "lighter";
    bg.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const climb = ((t * (0.17 + k * 0.04) + k / 4) % 1);
      bg.strokeStyle = `hsla(${[286, 170, 322, 104][k]},100%,88%,` +
                       `${0.1 + 0.05 * Math.sin(t * 1.3 + k)})`;
      bg.lineWidth = Math.max(0.7, fw * 0.008);
      bg.beginPath();
      for (let s = 0; s <= 14; s++) {
        const f = s / 14;
        const py = fh * (1 - ((f * 0.26 + climb) % 1));
        const px = fw * (0.5 + Math.sin(f * 2.1 + t * 0.7 + k * 1.7) * 0.2
                             + Math.sin(f * 16 - t * 1.6 + k) * 0.09);
        s ? bg.lineTo(px, py) : bg.moveTo(px, py);
      }
      bg.stroke();
    }
    bg.globalCompositeOperation = "source-over";

    /* ---------- then cut it to the opening ----------
       Last, so nothing above can have strayed past the stonework. */
    bg.globalCompositeOperation = "destination-in";
    bg.drawImage(cut, 0, 0, fw, fh);
    bg.globalCompositeOperation = "source-over";

    pc.imageSmoothingEnabled = false;
    if (pull > 0) {
      pc.translate(ax * PDPR, ay * PDPR);
      pc.scale(rush, rush);
      pc.translate(-ax * PDPR, -ay * PDPR);
      pc.globalAlpha = Math.max(0, 1 - Math.pow(pull, 2.4));
    }
    pc.drawImage(buf, sx, sy, sw, sh);
    pc.globalAlpha = 1;
    pc.setTransform(1, 0, 0, 1, 0, 0);
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
      const give = Math.max(0, 1 - f / 0.33);   // the canopy only: the door must not move under its light
      const amp  = h * TREE_W * 0.013 * give * give * e2 * gust;

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

  /* where the picture landed this frame, in screen pixels. Kept so that
     tools/check can ask where the doorway is rather than recomputing the
     breathing zoom and getting a slightly different answer. */
  let at = null;

  /* A computer: the wide picture covers the screen. A phone: the tall
     picture, all of it, as wide as the screen and just under the top bar;
     the button stands on the path at its foot. */
  function frame(zoom) {
    const cover = (TALL ? Math.min(W / art.width, (H - 44) / art.height)
                        : Math.max(W / art.width, H / art.height)) * zoom;
    const w = art.width * cover, h = art.height * cover;
    const y = TALL ? 44 - (h - h / zoom) / 2
                   : Math.max(H - h, Math.min(0, H * DOOR_AT - h * AIM.y));
    const x = w <= W ? (W - w) / 2 : Math.max(W - w, Math.min(0, W / 2 - w * AIM.x));
    at = { x, y, w, h };
    return at;
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
  /* Soft puffs: big enough to be drawn smoothed, falling off gently,
     so the smoke reads as smoke over the painted scene rather than as
     blocks. (They used to be tiny dithered sprites blown up on purpose
     into chunky pixels, which suited the old blocky tree and not the
     detailed forest.) */
  function bakePuffs() {
    if (PUFFS.length) return;
    for (let v = 0; v < 3; v++) {
      const S = 96;
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
          const lump = 1 + 0.12 * Math.sin(Math.atan2(dy, dx) * (3 + v) + v * 2.1);
          let a = 1 - r / lump;
          a = a <= 0 ? 0 : a * a * (3 - 2 * a) * 0.8;
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

  /* ---------- the sparkles feeding the star ----------
     Like the pulse that climbs to the eye in the chamber: every few
     seconds each sparkle in the canopy lets go a mote of light, which
     curves in to the star, slow at first and quickening, cooling from
     the sparkle's blue-white through violet to the star's gold. They arrive close
     together, and when the last one lands the star flares and sends a
     ring out. Returns how hard the star is flaring, for the sun's own glow. */
  const GATHER = 5.6;                      // seconds from one flare to the next
  const LAND = 3.2;                        // when, in each round, the motes land
  const SPARKS = (SCENE.sparks || []).map(([fx, fy, drawn], i) => {
    const dur = 1.5 + 0.35 * ((i * 7) % 5) / 4;          // some take longer than others
    const land = LAND - 0.32 + 0.64 * ((i * 3) % 4) / 3; // and land a little apart
    return { fx, fy, drawn: !!drawn, dur, go: land - dur, land,
             bend: (i % 2 ? 1 : -1) * (0.12 + 0.1 * ((i * 5) % 3) / 2), ph: i * 1.7 };
  });
  const LAST = SPARKS.reduce((m, k) => Math.max(m, k.land), 0);

  /* the explosion of light when the star flares: 0 to 1, up in an
     instant, then ebbing away over a couple of seconds */
  function boom(t) {
    const since = (t % GATHER) - LAST;
    if (since < 0) return 0;
    return Math.min(1, since / 0.07) * Math.exp(-since * 1.25);
  }

  function gather(t, x, y, w, h, tw, sx, sy, fade) {
    if (!SPARKS.length) return 0;
    const p = t % GATHER;
    let hit = 0;
    for (const k of SPARKS) {
      const px = x + w * k.fx, py = y + h * k.fy;
      // the sparkle itself: drawn ones always glint; all of them flash as they let go
      const flash = p >= k.go ? Math.exp(-(p - k.go) * 3.2) : 0;
      const tw8 = 0.5 + 0.5 * Math.sin(t * 2.1 + k.ph);
      const glint = (k.drawn ? 0.35 + 0.35 * tw8 : 0) + 0.9 * flash;
      if (glint > 0.02) {
        glow(tc, px, py, tw * 0.05, 200, 0.22 * glint * fade, 92);
        glow(tc, px, py, tw * 0.012, 210, 0.9 * glint * fade, 99);
        const L = tw * (0.03 + 0.03 * glint);
        tc.strokeStyle = `hsla(205,100%,95%,${0.7 * glint * fade})`;
        tc.lineWidth = 1.2;
        tc.beginPath();
        tc.moveTo(px - L, py); tc.lineTo(px + L, py);
        tc.moveTo(px, py - L * 1.3); tc.lineTo(px, py + L * 1.3);
        tc.stroke();
      }
      // the star brightens a little with each mote that lands
      if (p >= k.land) hit += 0.18 * Math.exp(-(p - k.land) * 2.4);
      const u = (p - k.go) / k.dur;
      if (u < 0 || u >= 1) continue;
      // a gentle curve in to the star, bowed to one side
      const mx = (px + sx) / 2, my = (py + sy) / 2;
      const dx = sx - px, dy = sy - py;
      const cxp = mx - dy * k.bend, cyp = my + dx * k.bend;
      const at = f => {
        const a = 1 - f;
        return [a * a * px + 2 * a * f * cxp + f * f * sx, a * a * py + 2 * a * f * cyp + f * f * sy];
      };
      const ease = v => v * v * (1.6 - 0.6 * v);       // slow to leave, quick to arrive
      const hueAt = v => (210 + 195 * v) % 360;           // blue, violet, magenta, gold: never green
      const f = ease(u);
      const a = Math.min(1, u * 6) * Math.min(1, (1 - u) * 14) * fade;
      // the thread it travels, faintly lit while it is on it
      tc.strokeStyle = `hsla(${hueAt(f)},100%,85%,${0.13 * Math.sin(Math.PI * u) * fade})`;
      tc.lineWidth = 1;
      tc.beginPath(); tc.moveTo(px, py); tc.quadraticCurveTo(cxp, cyp, sx, sy); tc.stroke();
      // the trail, then the mote
      for (let j = 10; j >= 1; j--) {
        const fj = ease(Math.max(0, u - j * 0.032));
        const [qx, qy] = at(fj);
        glow(tc, qx, qy, tw * 0.03 * (1 - j / 12), hueAt(fj), 0.5 * a * (1 - j / 11), 88);
      }
      const [hx, hy] = at(f);
      const hue = hueAt(f);
      glow(tc, hx, hy, tw * 0.11, hue, 0.3 * a, 80);
      glow(tc, hx, hy, tw * 0.035, hue, 0.9 * a, 96);
      glow(tc, hx, hy, tw * 0.012, 50, 1.0 * a, 100);     // a white-hot core
    }
    // the flare, when the last of them lands, and the ring it sends out
    const since = p - LAST;
    if (since >= 0) {
      const burst = Math.exp(-since * 1.5) * Math.min(1, since / 0.06);
      hit += burst;
      if (since < 1.3) {
        const r = tw * (0.05 + 0.42 * Math.pow(since / 1.3, 0.7));
        tc.strokeStyle = `hsla(46,100%,82%,${0.45 * (1 - since / 1.3) * fade})`;
        tc.lineWidth = 2;
        tc.beginPath(); tc.arc(sx, sy, r, 0, Math.PI * 2); tc.stroke();
      }
    }
    return Math.min(1.4, hit) * fade;
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
    const tw = h * TREE_W;                         // see TREE_W

    tc.save();
    zoomed = pull > 0;
    if (pull > 0) {
      tc.translate(ax, ay); tc.scale(rush, rush); tc.translate(-ax, -ay);
      tc.globalAlpha = Math.max(0, 1 - Math.pow(pull, 2.4));
    }
    const fadeOut = pull > 0 ? Math.max(0, 1 - Math.pow(pull, 2.4)) : 1;
    drawTree(t, pull, x, y, w, h);
    /* The realm in the doorway. Drawn on its own canvas, over the gap
       rather than added to it, so it is not limited to brightening the
       colours the tree already has. */
    const door = 0.42 + 0.2 * Math.sin(t * 0.55) + 0.07 * Math.sin(t * 1.9);
    drawPortal(t, x, y, w, h, pull, rush, ax, ay);

    /* ---------- light ---------- */
    tc.globalCompositeOperation = "lighter";

    // the sun, flaring through the canopy, fed by the sparkles around it
    const sx = x + w * SUN.x, sy = y + h * SUN.y;
    const fed = gather(t, x, y, w, h, tw, sx, sy, Math.max(0, 1 - pull * 3));
    const flare = 0.34 + 0.12 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 2.3) + 0.9 * fed;

    /* and the forest lit by it: the picture itself brightened, so the
       leaves, trunks and mushrooms catch the light rather than being
       fogged over, then a warm wash spreading out from the star */
    const lit = boom(t) * Math.max(0, 1 - pull * 3);
    if (lit > 0.01) {
      tc.globalAlpha = 0.85 * lit;
      tc.drawImage(art, x, y, w, h);
      tc.globalAlpha = 1;
      // the first instant: a white flash over everything
      const flash = Math.max(0, lit - 0.6) / 0.4;
      if (flash > 0) { tc.fillStyle = `rgba(255,248,225,${0.22 * flash})`; tc.fillRect(0, 0, W, H); }
      const R = Math.hypot(W, H) * (0.7 + 0.5 * (1 - lit));
      const wash = tc.createRadialGradient(sx, sy, 0, sx, sy, R);
      wash.addColorStop(0,    `hsla(48,100%,92%,${0.7 * lit})`);
      wash.addColorStop(0.25, `hsla(42,100%,70%,${0.36 * lit})`);
      wash.addColorStop(0.6,  `hsla(30,100%,55%,${0.10 * lit})`);
      wash.addColorStop(1,    "hsla(0,0%,0%,0)");
      tc.fillStyle = wash;
      tc.fillRect(0, 0, W, H);
    }
    glow(tc, sx, sy, tw * 0.26, 48, flare * 0.42, 92);
    glow(tc, sx, sy, tw * 0.07, 54, flare, 99);

    tc.strokeStyle = `hsla(50,100%,92%,${0.13 * flare})`;
    tc.lineWidth = 1.4;
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + t * 0.04;
      const len = tw * (0.14 + 0.07 * Math.sin(t * 1.3 + k) + 0.12 * fed);
      tc.beginPath();
      tc.moveTo(sx + Math.cos(ang) * tw * 0.03, sy + Math.sin(ang) * tw * 0.03);
      tc.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      tc.stroke();
    }

    // the light it throws into the room, in the tunnel's own colours
    const open = door + pull * 2.2 + 0.25 * fed;          // the doorway answers the star
    glow(tc, ax, ay, tw * 0.26, 282, open * 0.3, 74);
    glow(tc, ax, ay, tw * 0.10, 172, open * 0.5, 86);
    glow(tc, ax, ay, tw * 0.04, 300, open, 96);

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
      tc.imageSmoothingEnabled = true;              // and is soft, not blocky
      for (const q of smoke) {
        q.life += dt;
        if (q.life > q.span) { Object.assign(q, newPuff(0)); continue; }

        const u = q.life / q.span;              // 0 new, 1 spent
        q.y -= q.rise * dt;
        q.x += q.drift * dt + Math.sin(t * q.sway + q.phase) * 0.0016;

        // gathers quickly, holds through the middle, thins out at the top
        const fade = Math.min(1, u * 5) * Math.min(1, (1 - u) * 2.6);
        if (fade <= 0.01) continue;
        /* measured against the tree, not the window, so on a wide screen
           the smoke rises off the roots instead of filling the dark sides */
        const d = tw * q.size * (0.45 + q.grow * u);
        const px = x + w * AIM.x + (q.x - 0.5) * tw * 1.4, py = q.y * H;
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
     The picture rushes into the doorway, and a feedback loop of scaled
     copies stands in for the passage beyond it.

     A generated film was tried in place of this and taken out again. It
     was the thing itself rather than an imitation of it, and it cost a
     megabyte, a second codec, two stall guards and a phone that would not
     start it — and on the way through, the jump from this site's chunky
     pixels to full-resolution video and back again was worse than the
     imitation it replaced. */
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

  window.RealmGate = { enter, land, where: () => at };

  /* coming back from the map or the holders page: straight into the
     chamber, not the door again. Waits for every script, so the chamber
     is ready to start when it lands. */
  if (location.hash === "#chamber") {
    document.addEventListener("DOMContentLoaded", () => {
      if (gate) gate.classList.add("gone");
      land();
      history.replaceState(null, "", location.pathname);
    });
  }

  resize();
  go("gate");
  requestAnimationFrame(loop);
})();
