/* BREAKTHROUGH: the effects layer behind the game.
   One canvas behind the cards. The game tells it how the run is going:
     BTFX.level(heat, depth)  heat: this layer's score / its target (0..1+); depth: layers deep (0..1)
     BTFX.burst(x, y, kind)   a scoring step at a point on screen: "chips" | "mult" | "x" | "again"
     BTFX.cast(x, y, ratio)   a cast landing; ratio = its score / the layer's target
     BTFX.breakthrough()      the layer is cleared
     BTFX.total(total)        the run total, for the milestone moments (million, billion, trillion...)
   It draws nothing that matters to the game: if anything here fails, the game plays on. */
window.BTFX = (() => {
  "use strict";
  const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = document.createElement("canvas"); cv.className = "bt-fx"; cv.setAttribute("aria-hidden", "true");
  const g = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  function size() { DPR = Math.min(1.5, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0); }
  const mount = () => { const sky = document.querySelector(".bt-sky"); (sky && sky.parentNode ? sky.parentNode.insertBefore(cv, sky.nextSibling) : document.body.prepend(cv)); size(); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();
  addEventListener("resize", size);

  // where the action is: the middle of the stage (the chips x mult boxes), else the middle of the screen
  const centre = () => { const st = document.querySelector("[data-calc]"); if (st && st.offsetParent) { const r = st.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; } return [W / 2, H * 0.45]; };

  // the colours of the deep: violet near the top of the run, through magenta and orange, to gold far down
  const PAL = [[150, 90, 255], [255, 79, 195], [255, 140, 60], [255, 215, 110]];
  const tone = d => { const t = Math.min(.999, Math.max(0, d)) * (PAL.length - 1), i = Math.floor(t), f = t - i, a = PAL[i], b = PAL[i + 1]; return a.map((v, k) => Math.round(v + (b[k] - v) * f)); };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  let heat = 0, depth = 0, heatShown = 0, inGame = false;
  const P = [], MAX = calm ? 160 : 650;          // particles
  const RINGS = [];                              // shockwaves
  const rnd = (a, b) => a + Math.random() * (b - a);

  function add(p) { if (P.length < MAX) P.push(p); }
  // the motes that drift up all the time: more, faster and brighter as the layer fills and the run goes deeper
  function ambient(dt) {
    const want = (calm ? 12 : 26) + heatShown * (calm ? 30 : 110) + depth * (calm ? 15 : 55);
    const motes = P.reduce((n, p) => n + (p.mote ? 1 : 0), 0);
    if (motes < want && Math.random() < dt * 30) {
      const c = tone(depth + rnd(-.1, .25));
      add({ mote: true, x: rnd(0, W), y: H + 10, vx: rnd(-.15, .15), vy: -rnd(.25, .6) - heatShown * 1.6 - depth * .8, r: rnd(1, 2.4) + heatShown * 1.2, life: 1, decay: rnd(.06, .12), c, tw: rnd(0, 6) });
    }
  }

  function burst(x, y, kind, power = 1) {
    const C = { chips: [92, 240, 255], mult: [255, 79, 195], x: [255, 211, 92], again: [141, 255, 92] }[kind] || tone(depth);
    const n = Math.round((calm ? 5 : 14) * power);
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), s = rnd(1, 4.5) * (kind === "x" ? 1.5 : 1) * Math.sqrt(power);
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, r: rnd(1.5, 3.2), life: 1, decay: rnd(.9, 1.5), c: C, grav: .05 }); }
    if (kind === "x") ring(x, y, 1, C);
  }
  function ring(x, y, power, c) { RINGS.push({ x, y, r: 6, vr: 260 + 260 * power, life: 1, decay: 1.4 / Math.max(.6, Math.sqrt(power)), w: 2 + 3 * power, c: c || [255, 226, 140] }); }

  // a cast lands: a blast at the stage, scaled by how much of the target it scored; the screen shakes on the big ones
  function cast(x, y, ratio) {
    if (!(ratio > 0)) return;
    const power = Math.min(4, .5 + Math.log10(1 + ratio * 9) * 2);          // 0.5 for a tiny cast, ~2.5 at the whole target, up to 4
    const c = ratio >= 1 ? [255, 226, 140] : ratio >= .5 ? [255, 120, 220] : [92, 240, 255];
    ring(x, y, power, c); if (ratio >= .5) setTimeout(() => ring(x, y, power * .7, tone(depth)), 120);
    const n = Math.round((calm ? 8 : 26) * power);
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), s = rnd(2, 7) * power;
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1.5, 3.5), life: 1, decay: rnd(.6, 1.1), c: Math.random() < .5 ? c : tone(depth + .2), grav: .04, trail: true }); }
    if (ratio >= .5) shake(Math.min(1, ratio) * (ratio >= 1 ? 1 : .5));
  }

  function shake(s) {
    if (calm) return;
    const el = document.querySelector("[data-screen=game]"); if (!el) return;
    const t0 = performance.now(), dur = 380 + 220 * s, amp = 4 + 9 * s;
    const step = () => { const t = (performance.now() - t0) / dur; if (t >= 1) { el.style.transform = ""; return; }
      const k = amp * (1 - t); el.style.transform = `translate(${rnd(-k, k).toFixed(1)}px,${rnd(-k, k).toFixed(1)}px)`; requestAnimationFrame(step); };
    step();
  }

  // the layer is cleared: fireworks across the whole sky
  function breakthrough() {
    const shots = calm ? 3 : 7;
    for (let i = 0; i < shots; i++) setTimeout(() => {
      const x = rnd(W * .15, W * .85), y = rnd(H * .12, H * .5), c = [tone(depth), [92, 240, 255], [255, 79, 195], [255, 226, 140]][i % 4];
      ring(x, y, .8, c);
      const n = calm ? 12 : 40;
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, s = rnd(2.5, 5.5);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1.6, 3), life: 1, decay: rnd(.55, .85), c, grav: .06, trail: true }); }
    }, i * 140);
  }

  // milestones in the run total: a banner and a shower of gold
  const MILESTONES = [[1e6, "MILLION!"], [1e9, "BILLION!"], [1e12, "TRILLION!"], [1e15, "QUADRILLION!"], [1e18, "QUINTILLION!"]];
  let lastTotal = 0;
  function total(t) {
    if (!(t >= 0)) return;
    if (t < lastTotal) lastTotal = 0;                                          // a new run
    const hit = MILESTONES.filter(([v]) => lastTotal < v && t >= v).pop(); lastTotal = t;
    const tot = document.querySelector("[data-total]");
    if (tot) tot.dataset.mag = String(MILESTONES.filter(([v]) => t >= v).length);   // the run total glows hotter with each milestone
    if (!hit) return;
    const b = document.createElement("div"); b.className = "bt-mile"; b.innerHTML = `<b>${hit[1]}</b><span>RUN TOTAL</span>`;
    document.body.appendChild(b); setTimeout(() => b.remove(), 1900);
    const n = calm ? 30 : 120;
    for (let i = 0; i < n; i++) add({ x: rnd(0, W), y: rnd(-H * .3, 0), vx: rnd(-.6, .6), vy: rnd(2, 5), r: rnd(1.5, 3.4), life: 1, decay: rnd(.35, .6), c: Math.random() < .7 ? [255, 215, 110] : [255, 245, 210], grav: .03, spin: true });
  }

  function level(h, d) { heat = Math.max(0, Math.min(1.2, h || 0)); depth = Math.max(0, Math.min(1, d || 0)); inGame = true; }
  function rest() { heat = 0; depth = 0; inGame = false; lastTotal = 0; }

  /* ---------- the loop ---------- */
  let last = performance.now(), t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !W) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    heatShown += (heat - heatShown) * Math.min(1, dt * 3);                   // the glow catches up smoothly
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    const [cx, cy] = centre(), c = tone(depth);
    if (inGame) {
      // the core: a glow behind the chips x mult, breathing faster as the layer fills
      const pulse = 1 + Math.sin(t * (1.5 + heatShown * 6)) * (.06 + heatShown * .1);
      const R = (90 + heatShown * 170 + depth * 60) * pulse, a = .1 + heatShown * .35 + depth * .1;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(.45, rgba(c, a * .45)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
      // beams: once the layer is well on its way, light starts to break out of the core
      if (heatShown > .35 && !calm) {
        const n = 8, len = Math.max(W, H) * (.4 + heatShown * .5), ba = (heatShown - .35) * .28;
        g.save(); g.translate(cx, cy); g.rotate(t * (.15 + heatShown * .5));
        for (let i = 0; i < n; i++) { g.rotate(Math.PI * 2 / n);
          const lg = g.createLinearGradient(0, 0, 0, -len); lg.addColorStop(0, rgba(c, ba)); lg.addColorStop(1, rgba(c, 0));
          g.fillStyle = lg; g.beginPath(); g.moveTo(-6, 0); g.lineTo(-26 - heatShown * 30, -len); g.lineTo(26 + heatShown * 30, -len); g.lineTo(6, 0); g.fill(); }
        g.restore();
      }
      ambient(dt);
    }
    // shockwaves
    for (let i = RINGS.length - 1; i >= 0; i--) { const r = RINGS[i]; r.r += r.vr * dt; r.life -= r.decay * dt;
      if (r.life <= 0) { RINGS.splice(i, 1); continue; }
      g.strokeStyle = rgba(r.c, r.life * .9); g.lineWidth = r.w * r.life + .5; g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke(); }
    // particles
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i];
      p.vy += (p.grav || 0); p.x += p.vx; p.y += p.vy; p.life -= p.decay * dt * (p.mote ? .5 : 1);
      if (p.mote) { p.x += Math.sin(t * 2 + p.tw) * .3; if (p.y < -20) p.life = 0; }
      if (p.life <= 0 || p.y > H + 40) { P.splice(i, 1); continue; }
      const a = Math.max(0, Math.min(1, p.life)) * (p.mote ? .5 + .5 * Math.sin(t * 5 + p.tw) : 1);
      if (p.trail) { g.strokeStyle = rgba(p.c, a * .6); g.lineWidth = p.r; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); g.stroke(); }
      g.fillStyle = rgba(p.c, a); g.beginPath(); g.arc(p.x, p.y, p.r * (p.spin ? (.6 + .4 * Math.abs(Math.sin(t * 8 + i))) : 1), 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = "source-over";
  }
  requestAnimationFrame(frame);

  return { level, rest, burst, cast, breakthrough, total, shake };
})();
