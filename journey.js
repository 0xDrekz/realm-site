/* ============================================================
   REALM — the chamber.

   Where you come out of the tunnel. One room, five ways on.

   The room is a still picture, so everything that makes it feel
   inhabited is drawn over it: the light in the eyes and the doorway
   breathes, the floor moves like water, orbs drift between the
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
    { key: "map",     label: "THE MAP",    href: "/map" },
    { key: "duels",   label: "DUELS",      href: "/duels" }

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

  /* The orbs have a layer of their own, at the screen's full resolution.
     On the room's half-size grid they could only move in two-pixel jumps,
     which at their slow drift read as stutter. Here each sprite pixel is
     still a hard square block — they look the same — but the sprite as a
     whole moves a device pixel at a time, and it is redrawn every frame
     rather than with the room's thirty. */
  const oc = document.createElement("canvas");
  oc.className = "orbs-layer";
  oc.setAttribute("aria-hidden", "true");
  cv.after(oc);
  const octx = oc.getContext("2d");
  let DPR = 1;
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
  /* How chunky the pixels are: the canvas is drawn at 1/PX of the screen
     and blown back up with hard edges.

     It was 3. On a phone that made the canvas about 390 pixels across --
     NARROWER THAN THE 460-PIXEL ARTWORK, so the site was throwing away
     detail the picture already had and the result read as old console
     graphics rather than as pixel art. At 2 the canvas is wider than the
     source, so everything drawn in it survives. It costs a quarter of the
     drawing work instead of a ninth, which is still cheap. */
  const PX = 2;

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
    DPR = Math.min(2, window.devicePixelRatio || 1);
    oc.width = Math.round(W * DPR); oc.height = Math.round(H * DPR);
    bakeOverlay();
    seedMotes();
    seedOrbs();
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
  /* On a wide screen this tall picture stretched edge to edge is blown up
     past three times its size and turns to blocks. There it is held
     narrower, and the sides are the same room pushed back into the dark —
     the same as the door. */
  function frame(zoom, sway) {
    let cover = Math.max(W / art.width, H / art.height);
    if (W > H * 1.05) cover = Math.min(cover, Math.max(H * 1.1 / art.height, W * 0.55 / art.width));
    cover *= zoom;
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

  /* ---------- the orbs ----------
     Lights that live in the room, drifting between the spires at three
     depths. Each one is drawn fresh every frame into its own tiny canvas,
     a few dozen pixels across, and blown up with hard edges onto the
     room's grid — so it is pixel art, but pixel art that turns: a shaded
     sphere with a slowly rotating figure inside it, some with a tilted
     ring and sparks going round. The finished sprite is run through an
     ordered dither so its glow breaks into pixels instead of smearing. */
  const ORB_HUES = [
    [282, 312], [176, 150], [44, 28], [318, 286], [196, 230], [262, 200]
  ];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let orbs = [];

  function seedOrbs() {
    const k = Math.min(1.3, Math.max(0.8, Math.min(W, H) / 700));
    const n = W > 900 ? 13 : 9;
    orbs = [];
    for (let i = 0; i < n; i++) {
      const z = i / (n - 1);                       // 0 far, 1 near
      const S = Math.max(10, Math.round((13 + z * 31) * k)) | 1;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const [h1, h2] = ORB_HUES[i % ORB_HUES.length];
      orbs.push({
        S, cv: c, g: c.getContext("2d", { willReadFrequently: true }),
        z, h1, h2,
        /* A drift and two slow swells on each axis, at speeds that never
           line up, so the path is a long smooth wander rather than a line
           with a bounce on it. Near ones travel further and quicker:
           parallax, so the room has depth. */
        x0: Math.random(), y0: rand(0.10, 0.56),
        vx: (0.003 + z * 0.008) * (Math.random() < 0.5 ? -1 : 1),
        ax: [rand(0.012, 0.03) * (0.6 + z), rand(0.005, 0.012) * (0.6 + z)],
        ay: [rand(0.012, 0.028) * (0.6 + z), rand(0.004, 0.01) * (0.6 + z)],
        wx: [rand(0.05, 0.11), rand(0.17, 0.29)],
        wy: [rand(0.07, 0.14), rand(0.21, 0.33)],
        px: [rand(0, 6.3), rand(0, 6.3)], py: [rand(0, 6.3), rand(0, 6.3)],
        ph: rand(0, 6.3),
        points: 5 + (i % 4),                       // the figure inside
        spin: rand(0.15, 0.4) * (i % 2 ? 1 : -1),
        ring: i % 3 !== 1, tilt: rand(-0.6, 0.6),
        sparks: 1 + (i % 3), sp: rand(0.7, 1.4)
      });
    }
    orbs.sort((a, b) => a.z - b.z);                // far ones drawn first
  }

  function paintOrb(o, t) {
    const { S, g, h1, h2 } = o;
    const c = S / 2, r = S * 0.3;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, S, S);
    g.lineWidth = 1;

    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + o.ph);

    // the glow it sits in
    const halo = g.createRadialGradient(c, c, r * 0.7, c, c, c);
    halo.addColorStop(0, `hsla(${h1},100%,70%,${0.32 + 0.14 * pulse})`);
    halo.addColorStop(1, `hsla(${h1},100%,60%,0)`);
    g.fillStyle = halo;
    g.fillRect(0, 0, S, S);

    // a ring round it, and sparks on an orbit: back halves first
    const rx = r * 1.55, ry = r * 0.42;
    const ring = (front) => {
      if (!o.ring) return;
      g.strokeStyle = `hsla(46,100%,${front ? 74 : 52}%,${front ? 0.95 : 0.5})`;
      g.beginPath();
      g.ellipse(c, c, rx, ry, o.tilt, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      g.stroke();
    };
    const sparks = (front) => {
      for (let k = 0; k < o.sparks; k++) {
        const a = t * o.sp + (k / o.sparks) * Math.PI * 2;
        if ((Math.sin(a) > 0) !== front) continue;
        const ex = Math.cos(a) * rx * 1.08, ey = Math.sin(a) * ry * 1.08;
        const px = c + ex * Math.cos(o.tilt) - ey * Math.sin(o.tilt);
        const py = c + ex * Math.sin(o.tilt) + ey * Math.cos(o.tilt);
        g.fillStyle = front ? "#fff8e6" : `hsla(${h2},100%,70%,0.7)`;
        g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
      }
    };
    ring(false); sparks(false);

    // the sphere, lit from the upper left
    const body = g.createRadialGradient(c - r * 0.38, c - r * 0.42, r * 0.08, c, c, r);
    body.addColorStop(0,    `hsl(${h2},95%,78%)`);
    body.addColorStop(0.45, `hsl(${h1},85%,44%)`);
    body.addColorStop(1,    `hsl(${h1},90%,12%)`);
    g.fillStyle = body;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();

    // the figure inside it, turning
    g.save();
    g.beginPath(); g.arc(c, c, r - 0.5, 0, Math.PI * 2); g.clip();
    g.globalCompositeOperation = "lighter";
    const rot = t * o.spin + o.ph;
    /* a star polygon {n/step}: 5 and 6 points skip one, 7 and 8 skip
       two. Where n and step share a factor it is several polygons laid
       over each other (6 → two triangles, a hexagram), so each is traced */
    const n = o.points, step = n > 6 ? 3 : 2;
    const loops = n % step === 0 ? step : 1, per = n / loops;
    g.strokeStyle = `hsla(${h2},100%,82%,0.7)`;
    g.beginPath();
    for (let L = 0; L < loops; L++) {
      for (let i = 0; i <= per; i++) {
        const a = rot + ((L + i * step) / n) * Math.PI * 2;
        const px = c + Math.cos(a) * r * 0.86, py = c + Math.sin(a) * r * 0.86;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
    }
    g.stroke();
    if (S > 22) {                                   // petals, where there is room
      g.strokeStyle = `hsla(${h1 + 40},100%,72%,0.35)`;
      for (let i = 0; i < 6; i++) {
        const a = -rot * 0.7 + (i / 6) * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * r * 0.42, c + Math.sin(a) * r * 0.42, r * 0.42, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // the eye at the middle
    g.fillStyle = `hsla(${h2},100%,92%,${0.55 + 0.45 * pulse})`;
    g.beginPath(); g.arc(c, c, Math.max(1, r * 0.16), 0, Math.PI * 2); g.fill();
    g.restore();

    // backlight on the rim, and a hard highlight
    g.strokeStyle = `hsla(${h2},100%,84%,0.55)`;
    g.beginPath(); g.arc(c, c, r - 0.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.fillRect(Math.round(c - r * 0.5), Math.round(c - r * 0.55), S > 22 ? 2 : 1, S > 22 ? 2 : 1);

    ring(true); sparks(true);

    /* ordered dither: colour to a short ramp, alpha to four steps, so
       the soft parts crumble into pixels like everything else here */
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const b = (BAYER4[((p / S | 0) & 3) * 4 + (p % S & 3)] + 0.5) / 16 - 0.5;
      const a = d[i + 3] / 255 + b * 0.34;
      d[i + 3] = a < 0.12 ? 0 : Math.min(255, Math.round(a * 3) / 3 * 255);
      for (let ch = 0; ch < 3; ch++) {
        const v = d[i + ch] / 255 + b * 0.16;
        d[i + ch] = Math.max(0, Math.min(255, Math.round(v * 6) / 6 * 255));
      }
    }
    g.putImageData(img, 0, 0);
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

  /* ---------- the pulse's clock ----------
     Shared by the shaft, the eyes and the light in the room, so the room
     brightens exactly as the pulse climbs and hits. */
  const P_LEN = 4.6;                                   // seconds per pulse
  const TRAVEL = 0.6;                                  // share of the cycle spent climbing
  const P_Y0 = 0.74;                                   // it leaves the far door here
  const pEase = (u) => Math.pow(u, 1.7);
  function pulseAt(t) {
    const q = (t % P_LEN) / P_LEN;
    const fHit = (P_Y0 - EYE_BIG.y) / (P_Y0 - EYE_HIGH.y);
    const sinceEye = (q - Math.pow(fHit, 1 / 1.7) * TRAVEL) * P_LEN;
    const sinceTop = (q - TRAVEL) * P_LEN;
    /* how lit the room is, 0 to 1: it gathers as the pulse climbs,
       floods when it hits the great eye, and ebbs away before the next */
    const u = q < TRAVEL ? q / TRAVEL : 1;
    let lit = q < TRAVEL ? 0.38 * u * u : 0;
    if (sinceEye >= 0) lit = Math.max(lit, Math.exp(-sinceEye * 1.25) *
                                       Math.min(1, sinceEye / 0.08));
    return { q, sinceEye, sinceTop, lit };
  }

  /* ---------- one frame ---------- */
  let ringT = 0;

  function paint(t, dt) {
    ctx.setTransform(GW / W, 0, 0, GH / H, 0, 0);
    ctx.fillStyle = "#03010a";
    ctx.fillRect(0, 0, W, H);
    if (!art) return;

    /* Nearest, not smoothed. The canvas is a third of the screen, so the
       picture is always scaled DOWN to be drawn, and smoothing averages
       it — which is what softened the eyes and the far door into blobs.
       Off, the pixels survive the downscale. */
    ctx.imageSmoothingEnabled = false;

    /* the room breathes: a slow push in and out, so standing here
       never feels like looking at a photograph */
    const zoom = 1 + 0.035 * (0.5 + 0.5 * Math.sin(t * 0.12));
    const { x, y, w, h } = frame(zoom, Math.sin(t * 0.055));

    const narrow = w < W - 1;
    if (narrow) {
      const c = Math.max(W / art.width, H / art.height) * 1.08;
      const bw = art.width * c, bh = art.height * c;
      ctx.drawImage(art, (W - bw) / 2, (H - bh) / 2, bw, bh);
      ctx.fillStyle = "rgba(3,1,10,0.62)";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, 0, w, H); ctx.clip();
    }

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

    if (narrow) {
      ctx.restore();
      // feather the picture's edges into the backdrop
      const f = Math.min(w * 0.18, 160);
      for (const [from, to] of [[x, x + f], [x + w, x + w - f]]) {
        const g = ctx.createLinearGradient(from, 0, to, 0);
        g.addColorStop(0, "rgba(3,1,10,1)");
        g.addColorStop(1, "rgba(3,1,10,0)");
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(from, to) - 1, 0, f + 2, H);
      }
    }

    /* ---------- the room, dark between pulses and lit by them ----------
       Held down in the dark while nothing is happening, so that when the
       pulse hits it has somewhere to go: a warm flood from the great eye
       that reaches the walls, and then the dark coming back. */
    const PS = pulseAt(t);
    ctx.fillStyle = `rgba(3,1,10,${0.5 * (1 - PS.lit)})`;
    ctx.fillRect(0, 0, W, H);
    if (PS.lit > 0.01) {
      const ex = x + w * EYE_BIG.x, ey = y + h * EYE_BIG.y;
      const R = Math.hypot(W, H) * 0.75;
      const flood = ctx.createRadialGradient(ex, ey, 0, ex, ey, R);
      flood.addColorStop(0,    `hsla(46,100%,80%,${0.55 * PS.lit})`);
      flood.addColorStop(0.3,  `hsla(38,100%,64%,${0.26 * PS.lit})`);
      flood.addColorStop(0.65, `hsla(300,100%,55%,${0.08 * PS.lit})`);
      flood.addColorStop(1,    "hsla(290,100%,40%,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = flood;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
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
    /* a pool, not a band: a straight-edged fill showed its sides as seams
       once the picture stopped running edge to edge */
    if (P.y < H && y + h > P.y) {
      const R = w * 0.42;
      const spill = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, R);
      spill.addColorStop(0, `hsla(44,100%,76%,${0.2 * door})`);
      spill.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = spill;
      ctx.fillRect(P.x - R, P.y, R * 2, R);
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

    /* ---------- the shaft of light, and the pulse that climbs it ----------
       One pulse at a time, built the way light behaves rather than as a
       dot: a white-hot core, a gold bloom round it and a wide soft halo
       that lights the room it passes through; a burning trail on the
       shaft behind it; a four-point glint and a horizontal streak, as a
       lens would see it. It leaves the far door slowly and accelerates,
       and when it reaches the great eye the eye flares — a burst of rays
       and a ring — then it spends itself at the eye above. */
    const bxC = x + w * 0.5;
    const q = PS.q;
    const Y0 = P_Y0, Y1 = EYE_HIGH.y;                    // door to the top eye
    const ease = pEase;

    // the shaft itself, a little brighter while something is in it
    const live = q < TRAVEL ? Math.sin(Math.PI * q / TRAVEL) : 0;
    const beam = ctx.createLinearGradient(bxC - w * 0.03, 0, bxC + w * 0.03, 0);
    beam.addColorStop(0,   "hsla(0,0%,0%,0)");
    beam.addColorStop(0.5, `hsla(50,100%,88%,${0.11 + 0.04 * Math.sin(t * 0.9) + 0.07 * live})`);
    beam.addColorStop(1,   "hsla(0,0%,0%,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(x + w * 0.47, y, w * 0.06, h * 0.78);

    if (q < TRAVEL) {
      const u  = q / TRAVEL;
      const f  = ease(u);
      const py = y + h * (Y0 - f * (Y0 - Y1));
      const a  = Math.min(1, u * 8) * Math.min(1, (1 - u) * 10);   // in and out
      const flick = 0.9 + 0.1 * Math.sin(t * 37) * Math.sin(t * 23); // a live flame, not a lamp

      // the trail it burns on the shaft, longer the faster it goes
      const len = h * (0.05 + 0.16 * u);
      const trail = ctx.createLinearGradient(0, py, 0, py + len);
      trail.addColorStop(0, `hsla(48,100%,90%,${0.55 * a})`);
      trail.addColorStop(0.3, `hsla(40,100%,70%,${0.22 * a})`);
      trail.addColorStop(1, "hsla(30,100%,50%,0)");
      ctx.fillStyle = trail;
      ctx.fillRect(bxC - w * 0.009, py, w * 0.018, len);

      // bloom: wide and faint, then tighter and brighter, then the core
      glow(bxC, py, w * 0.42, 280, 0.07 * a, 70);        // the room it lights
      glow(bxC, py, w * 0.16, 44,  0.32 * a * flick, 82);
      glow(bxC, py, w * 0.06, 50,  0.75 * a * flick, 94);
      glow(bxC, py, w * 0.022, 55, 1.0 * a, 100);

      // a lens's view of it: a long thin horizontal streak and a glint
      const shine = a * (0.75 + 0.25 * Math.sin(t * 9.0));
      const sL = w * (0.22 + 0.08 * Math.sin(t * 2.3));
      const streak = ctx.createLinearGradient(bxC - sL, 0, bxC + sL, 0);
      streak.addColorStop(0,   "hsla(270,100%,80%,0)");
      streak.addColorStop(0.5, `hsla(50,100%,97%,${0.95 * shine})`);
      streak.addColorStop(1,   "hsla(190,100%,80%,0)");
      ctx.fillStyle = streak;
      ctx.fillRect(bxC - sL, py - PX * 0.5, sL * 2, PX);

      const spike = (dx, dy, L) => {
        const g = ctx.createLinearGradient(bxC, py, bxC + dx * L, py + dy * L);
        g.addColorStop(0, `hsla(52,100%,97%,${0.9 * shine})`);
        g.addColorStop(1, "hsla(52,100%,90%,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = PX;
        ctx.beginPath(); ctx.moveTo(bxC, py); ctx.lineTo(bxC + dx * L, py + dy * L); ctx.stroke();
      };
      const gl = w * 0.07 * (0.8 + 0.4 * Math.sin(t * 6.1));
      spike(0, -1, gl * 1.3); spike(0, 1, gl * 0.8);
      const d45 = Math.SQRT1_2, gd = gl * 0.45;
      spike(d45, d45, gd); spike(-d45, d45, gd); spike(d45, -d45, gd); spike(-d45, -d45, gd);
    }

    /* the great eye takes the hit: how long since the pulse passed it */
    const sinceEye = PS.sinceEye;
    if (sinceEye >= 0 && sinceEye < 2.2) {
      const k = Math.exp(-sinceEye * 2.4);
      glow(E1.x, E1.y, w * 0.34, 40, 0.34 * k, 86);
      glow(E1.x, E1.y, w * 0.10, 48, 0.9 * k, 98);
      // rays bursting out of it, turning slightly as they fade
      ctx.lineWidth = PX;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + sinceEye * 0.35 + (i % 2) * 0.13;
        const L = w * (0.12 + 0.2 * (1 - k)) * (i % 2 ? 0.6 : 1);
        const g = ctx.createLinearGradient(E1.x, E1.y, E1.x + Math.cos(ang) * L, E1.y + Math.sin(ang) * L);
        g.addColorStop(0, `hsla(48,100%,95%,${0.85 * k})`);
        g.addColorStop(1, "hsla(40,100%,70%,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = PX * (i % 2 ? 1 : 2);
        ctx.beginPath();
        ctx.moveTo(E1.x, E1.y);
        ctx.lineTo(E1.x + Math.cos(ang) * L, E1.y + Math.sin(ang) * L);
        ctx.stroke();
      }
      // and a ring going out through the room
      ctx.strokeStyle = `hsla(46,100%,82%,${0.42 * k})`;
      ctx.lineWidth = PX * (1 + k);
      ctx.beginPath();
      ctx.arc(E1.x, E1.y, w * (0.04 + 0.5 * (1 - k)), 0, Math.PI * 2);
      ctx.stroke();
    }

    /* and spends what is left at the eye above the apex */
    const sinceTop = PS.sinceTop;
    if (sinceTop >= 0 && sinceTop < 1.6) {
      const k = Math.exp(-sinceTop * 3);
      glow(E2.x, E2.y, w * 0.22, 196, 0.3 * k, 88);
      glow(E2.x, E2.y, w * 0.06, 52, 0.85 * k, 99);
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

    /* ---------- hold the room back so the words read ---------- */
    if (overlay) ctx.drawImage(overlay, 0, 0, W, H);
  }

  /* ---------- the orbs, every frame ---------- */
  function drawOrbs(t) {
    if (!W) return;
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    octx.clearRect(0, 0, W, H);
    const T = still ? 0 : t;
    for (const o of orbs) {
      const d = o.S * PX;
      const m = (d / W) * 0.75;                    // off the edge before it wraps
      let x = o.x0 + o.vx * T
            + o.ax[0] * Math.sin(T * o.wx[0] + o.px[0])
            + o.ax[1] * Math.sin(T * o.wx[1] + o.px[1]);
      x = ((x + m) % (1 + 2 * m) + (1 + 2 * m)) % (1 + 2 * m) - m;
      const y = o.y0
            + o.ay[0] * Math.sin(T * o.wy[0] + o.py[0])
            + o.ay[1] * Math.sin(T * o.wy[1] + o.py[1]);
      const bx = x * W, by = y * H;

      // its own soft light first, under it
      const r = d * 0.95;
      const gl = octx.createRadialGradient(bx, by, 0, bx, by, r);
      const a = 0.10 + 0.10 * o.z;
      gl.addColorStop(0, `hsla(${o.h1},100%,72%,${a})`);
      gl.addColorStop(0.45, `hsla(${o.h1},100%,60%,${a * 0.35})`);
      gl.addColorStop(1, "hsla(0,0%,0%,0)");
      octx.fillStyle = gl;
      octx.fillRect(bx - r, by - r, r * 2, r * 2);

      // then the sprite, its corner on a whole device pixel so every
      // sprite pixel stays the same size as it moves
      paintOrb(o, T);
      const sx = Math.round((bx - d / 2) * DPR) / DPR;
      const sy = Math.round((by - d / 2) * DPR) / DPR;
      octx.globalAlpha = 0.5 + 0.5 * o.z;
      octx.imageSmoothingEnabled = false;
      octx.drawImage(o.cv, sx, sy, d, d);
      octx.globalAlpha = 1;
    }
    // the same wash that holds the room back, laid only over the orbs
    if (overlay) {
      octx.globalCompositeOperation = "source-atop";
      octx.imageSmoothingEnabled = true;
      octx.drawImage(overlay, 0, 0, W, H);
      octx.globalCompositeOperation = "source-over";
    }
  }

  /* ---------- the loop ---------- */
  let running = false, last = 0;
  function tick(ms) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (document.hidden) { last = ms; return; }
    const dt = Math.min(0.05, (ms - last) * 0.001);
    drawOrbs(ms * 0.001);
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
      case "beings":  return all.toLocaleString() + " & their lore";
      case "rewards": return g_("POOL_PERCENT", 75) + "% · any wallet";
      case "lore":    return "who they are";
      case "holders": return "what a wallet earns";
      case "map":     return "every being, live";
      case "duels":   return "battle your beings · weekly board";
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
      el.className = "slab" + (o.key === "duels" ? " slab-duels" : "");
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
