/* ============================================================
   REALM Arena — the page.

   The match runs here, in fixed steps, with the same engine the server
   uses; the canvas draws it 60 times a second, smoothing between steps.
   When it ends, the page sends only your placements; the server replays
   them and decides the result.
   ============================================================ */
(() => {
  "use strict";
  const A = window.RealmArena;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TIER_COL = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#ffffff" };
  const TEAM = [{ main: "#5cc8ff", deep: "#1f5fd6", glow: "rgba(92,200,255,", dark: "#0c1f3a" }, { main: "#ff5470", deep: "#b3123a", glow: "rgba(255,84,112,", dark: "#3a0c18" }];
  const store = { get(k, d) { try { const v = localStorage.getItem("realm-arena-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("realm-arena-" + k, JSON.stringify(v)); } catch { /* private mode */ } } };

  /* ---------- sound ---------- */
  let ac = null, muted = store.get("muted", false);
  function au() { if (muted) return null; try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch { return null; } return ac; }
  function tone(f, d, { type = "sine", v = .1, to = null, at = 0 } = {}) {
    const a = au(); if (!a) return; const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02);
  }
  function noise(d, { v = .12, f = 900, at = 0 } = {}) {
    const a = au(); if (!a) return; const t = a.currentTime + at, n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), c = b.getChannelData(0);
    for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; fl.type = "lowpass"; fl.frequency.value = f; g.gain.value = v;
    s.connect(fl).connect(g).connect(a.destination); s.start(t);
  }
  let lastHit = 0;
  const SFX = {
    place: () => { noise(.18, { v: .12, f: 600 }); tone(180, .2, { type: "triangle", v: .1, to: 90 }); },
    spawnBig: () => { tone(110, .6, { type: "sawtooth", v: .06, to: 220 }); tone(330, .7, { v: .06, to: 660, at: .05 }); },
    hit: () => { const t = performance.now(); if (t - lastHit < 60) return; lastHit = t; noise(.05, { v: .06, f: 1400 }); },
    zap: () => tone(1400, .08, { type: "square", v: .02, to: 700 }),
    blast: () => { noise(.5, { v: .22, f: 400 }); tone(80, .5, { type: "sine", v: .2, to: 40 }); },
    heal: () => { tone(660, .25, { v: .06, to: 990 }); tone(990, .3, { v: .04, at: .1 }); },
    die: () => { tone(420, .18, { type: "triangle", v: .05, to: 140 }); },
    tower: () => { noise(1.1, { v: .3, f: 300 }); tone(60, 1, { v: .25, to: 30 }); [523, 659, 784].forEach((f, i) => tone(f, .5, { type: "triangle", v: .05, at: .2 + i * .1 })); },
    phase: () => [392, 523, 659, 784].forEach((f, i) => tone(f, .35, { type: "triangle", v: .07, at: i * .09 })),
    tick: () => tone(1200, .04, { type: "square", v: .03 }),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .45, { type: "triangle", v: .08, at: i * .12 })),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .5, { v: .07, at: i * .16 })),
    no: () => tone(160, .12, { type: "square", v: .05 }),
  };
  const sfx = k => { try { SFX[k](); } catch { /* no audio */ } };
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* no haptics */ } };
  function setMute(m) { muted = m; store.set("muted", m); $$("[data-mute]").forEach(b => { b.textContent = m ? "Sound off" : "Sound on"; }); }
  $$("[data-mute]").forEach(b => b.addEventListener("click", () => setMute(!muted)));
  setMute(muted);

  /* ---------- pictures: the beings' thumbnails ---------- */
  const IMG = new Map();
  function img(n) {
    if (!n) return null;
    if (!IMG.has(n)) { const i = new Image(); i.decoding = "async"; i.src = "/thumbs/" + n + ".webp"; i.onload = () => { sprites.clear(); }; IMG.set(n, i); }
    const i = IMG.get(n); return i.complete && i.naturalWidth ? i : null;
  }
  const SPELL_ICON = {
    strike: '<path d="M58 8 30 52h18L38 92l34-48H54z" fill="#fff6c8" stroke="#ffd65c" stroke-width="3"/>',
    nova: '<circle cx="50" cy="50" r="14" fill="#ffd1ff"/><path d="M50 10v24M50 66v24M10 50h24M66 50h24M22 22l16 16M62 62l16 16M78 22 62 38M38 62 22 78" stroke="#ff7ae6" stroke-width="6" stroke-linecap="round"/>',
    halo: '<ellipse cx="50" cy="50" rx="32" ry="12" fill="none" stroke="#9dffcf" stroke-width="7"/>',
    dust: '<path d="M62 18a32 32 0 1 0 20 50 26 26 0 1 1-20-50z" fill="#cfefff"/>',
  };

  /* ============================================================
     THE LOBBY
     ============================================================ */
  const ROLES = [["Tank", "Walks at towers, soaks hits"], ["Striker", "Fast, fierce up close"], ["Ranged", "Shoots from behind; hits flyers"], ["Caster", "Area blasts on groups"], ["Support", "Heals allies around it"]];
  $("[data-deck-preview]").innerHTML = ROLES.slice(0, 4).map(([r, t]) => `<div class="ar-how-role"><b>${r}</b><i>${t}</i></div>`).join("");
  $("[data-battle]").addEventListener("click", () => { sfx("tick"); battle(); });
  $("[data-again]").addEventListener("click", () => { $("[data-end]").hidden = true; battle(); });
  $("[data-lobby]").addEventListener("click", () => { $("[data-end]").hidden = true; show("lobby"); });
  $("[data-quit]").addEventListener("click", () => { if (G && !G.S.over && confirm("Leave this battle? It counts as a loss.")) { G.quit = true; G.S.over = true; G.S.winner = 1; endBattle(); } });
  function show(name) { $$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; }); }
  const session = () => { try { const s = JSON.parse(localStorage.getItem("realm-tcg-session") || "null"); return s && Date.now() - s.at < 23 * 3600e3 ? s : null; } catch { return null; } };

  /* ============================================================
     THE BATTLE
     ============================================================ */
  let G = null;
  const canvas = $("[data-canvas]"), ctx = canvas.getContext("2d"), bg = $("[data-bg]"), layers = $("[data-layers]");
  let ts = 16, dpr = 1, lowRes = store.get("lowres", false), slowFrames = 0, frames = 0;
  const sprites = new Map();

  async function battle() {
    $("[data-battle]").disabled = true;
    const s = session();
    let d;
    try { d = await (await fetch("/api/arena/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s ? { token: s.token } : {}) })).json(); }
    catch { d = { error: "The realm did not answer. Try again." }; }
    $("[data-battle]").disabled = false;
    if (d.error) { $("[data-lobby-note]").textContent = d.error; return; }
    G = { match: d.match, seed: d.seed, sides: d.sides, S: A.createMatch({ seed: d.seed, sides: d.sides }), inputs: [], acc: 0, last: 0, prev: new Map(),
      fx: [], parts: [], nums: [], shake: 0, flash: 0, sel: null, drag: null, aim: null, phase: "calm", tips: store.get("tips", {}), over: false, river: 0, crowns: [0, 0], towerShake: new Map() };
    for (const side of d.sides) for (const c of side.deck) img(c.n);
    $("[data-rname]").textContent = d.rival;
    show("battle"); layout(); paintHand(true); paintHud(); paintCrowns();
    banner("Battle!", "Break their towers");
    sfx("phase"); buzz(20);
    G.last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------- layout ---------- */
  function layout() {
    const st = $("[data-stage]").getBoundingClientRect();
    ts = Math.max(8, Math.min(st.width / A.W, st.height / A.H));
    dpr = Math.min(lowRes ? 1.2 : 2, window.devicePixelRatio || 1);
    for (const c of [canvas, bg]) { c.style.width = (ts * A.W) + "px"; c.style.height = (ts * A.H) + "px"; c.width = Math.round(ts * A.W * dpr); c.height = Math.round(ts * A.H * dpr); }
    sprites.clear(); towerBodies.clear();
    // the arena itself is drawn once, on its own layer underneath
    bg.getContext("2d").drawImage(drawStatic(), 0, 0);
  }
  window.addEventListener("resize", () => { if (G && !$("[data-screen=battle]").hidden) layout(); });

  /* ---------- the arena, drawn once ---------- */
  function drawStatic() {
    const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext("2d"); g.scale(dpr * ts, dpr * ts);
    const W = A.W, H = A.H, R = A.RIVER;
    // the deep: a nebula under everything
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#1a0612"); gr.addColorStop(.48, "#120a26"); gr.addColorStop(.52, "#0a1026"); gr.addColorStop(1, "#06142a");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const neb = (x, y, r, col) => { const n = g.createRadialGradient(x, y, 0, x, y, r); n.addColorStop(0, col); n.addColorStop(1, "transparent"); g.fillStyle = n; g.fillRect(0, 0, W, H); };
    neb(3, 6, 9, "rgba(255,70,110,.18)"); neb(15, 10, 8, "rgba(197,107,255,.16)"); neb(4, 24, 9, "rgba(70,160,255,.16)"); neb(14, 27, 8, "rgba(120,90,255,.14)");
    // the two halves: floating platforms of dark crystal, laid in tiles
    for (let side = 0; side < 2; side++) {
      const y0 = side === 0 ? R + 1 : 0.3, y1 = side === 0 ? H - 0.3 : R - 1, T = TEAM[side];
      g.save();
      g.beginPath(); roundRect(g, 0.35, y0, W - 0.7, y1 - y0, 0.8); g.clip();
      const pg = g.createLinearGradient(0, y0, 0, y1);
      pg.addColorStop(0, side ? "#2a1020" : "#131a33"); pg.addColorStop(1, side ? "#1a0a1c" : "#0f2238");
      g.fillStyle = pg; g.fillRect(0, y0, W, y1 - y0);
      for (let y = Math.floor(y0); y < y1; y++) for (let x = 0; x < W; x++) {
        if ((x + y) % 2) { g.fillStyle = "rgba(255,255,255,.025)"; g.fillRect(x, y, 1, 1); }
      }
      // faint grid lines
      g.strokeStyle = side ? "rgba(255,120,150,.07)" : "rgba(120,190,255,.07)"; g.lineWidth = 0.03;
      for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
      for (let y = Math.ceil(y0); y < y1; y++) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // lanes: worn, glowing paths from the bridges to the towers
      for (const bx of A.BRIDGES) {
        const lg = g.createLinearGradient(0, y0, 0, y1);
        lg.addColorStop(0, T.glow + (side ? ".02)" : ".10)")); lg.addColorStop(1, T.glow + (side ? ".10)" : ".02)"));
        g.fillStyle = lg; g.fillRect(bx - 1.3, y0, 2.6, y1 - y0);
      }
      // the summoning circle under the Throne
      const ty = side === 0 ? H - 3 : 3;
      mandala(g, 9, ty, 3.6, side ? "rgba(255,110,140,.32)" : "rgba(110,200,255,.32)");
      g.restore();
      // the platform's edge glows in the team's colour
      g.save(); g.shadowColor = T.main; g.shadowBlur = 0.6; g.strokeStyle = T.glow + ".55)"; g.lineWidth = 0.08;
      g.beginPath(); roundRect(g, 0.35, y0, W - 0.7, y1 - y0, 0.8); g.stroke(); g.restore();
    }
    // the great mandala over the river
    mandala(g, 9, R, 5.5, "rgba(227,186,92,.22)");
    // bridges of gold-veined stone
    for (const bx of A.BRIDGES) {
      g.save();
      g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 0.4; g.shadowOffsetY = 0.15;
      const bg = g.createLinearGradient(bx - 1.2, 0, bx + 1.2, 0); bg.addColorStop(0, "#3a2a4e"); bg.addColorStop(.5, "#5a4670"); bg.addColorStop(1, "#3a2a4e");
      g.fillStyle = bg; g.beginPath(); roundRect(g, bx - 1.15, R - 1.35, 2.3, 2.7, 0.25); g.fill();
      g.restore();
      g.strokeStyle = "rgba(227,186,92,.75)"; g.lineWidth = 0.09;
      g.beginPath(); g.moveTo(bx - 1.15, R - 1.3); g.lineTo(bx - 1.15, R + 1.3); g.moveTo(bx + 1.15, R - 1.3); g.lineTo(bx + 1.15, R + 1.3); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 0.04;
      for (let k = -1; k <= 1; k += 0.5) { g.beginPath(); g.moveTo(bx - 1.1, R + k); g.lineTo(bx + 1.1, R + k); g.stroke(); }
    }
    // stars
    let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(255,255,255,${.15 + r() * .5})`; g.fillRect(r() * W, r() * H, .05 + r() * .05, .05 + r() * .05); }
    return c;
  }
  function roundRect(g, x, y, w, h, r) { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function mandala(g, cx, cy, R, col) {
    g.save(); g.strokeStyle = col; g.lineWidth = 0.05;
    for (const k of [1, .78, .5, .26]) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * .26, cy + Math.sin(a) * R * .26); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
    for (let t = 0; t < 2; t++) { g.beginPath(); for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + t * Math.PI / 3 + i * 2 * Math.PI / 3; const x = cx + Math.cos(a) * R * .78, y = cy + Math.sin(a) * R * .78; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.arc(cx + Math.cos(a) * R * .26, cy + Math.sin(a) * R * .26, R * .26, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }

  /* ---------- a unit's token, drawn once per card and side ---------- */
  function sprite(def, side, r) {
    const key = def.id + ":" + side + ":" + Math.round(r * ts * dpr);
    if (sprites.has(key)) return sprites.get(key);
    const px = Math.ceil(r * 2 * ts * dpr * 1.5), c = document.createElement("canvas"); c.width = c.height = px;
    const g = c.getContext("2d"), m = px / 2, rad = r * ts * dpr, T = TEAM[side];
    // team halo
    const hg = g.createRadialGradient(m, m, rad * .6, m, m, rad * 1.45); hg.addColorStop(0, T.glow + ".55)"); hg.addColorStop(1, T.glow + "0)");
    g.fillStyle = hg; g.beginPath(); g.arc(m, m, rad * 1.45, 0, Math.PI * 2); g.fill();
    // rim: team colour outside, rarity inside
    g.fillStyle = T.main; g.beginPath(); g.arc(m, m, rad, 0, Math.PI * 2); g.fill();
    g.fillStyle = TIER_COL[def.tier] || "#c9a24e"; g.beginPath(); g.arc(m, m, rad * .9, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(m, m, rad * .8, 0, Math.PI * 2); g.clip();
    const im = img(def.n);
    if (im) g.drawImage(im, m - rad * .8, m - rad * .8, rad * 1.6, rad * 1.6);
    else { const bg = g.createRadialGradient(m, m * .8, 0, m, m, rad); bg.addColorStop(0, T.main); bg.addColorStop(1, T.dark); g.fillStyle = bg; g.fillRect(0, 0, px, px); }
    g.restore();
    // a small role mark
    const mark = { tank: "▲", striker: "✦", ranged: "➶", caster: "✺", support: "✚" }[def.role];
    if (mark && rad > 9) { g.font = `bold ${Math.round(rad * .55)}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#000"; g.beginPath(); g.arc(m + rad * .72, m + rad * .72, rad * .34, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.fillText(mark, m + rad * .72, m + rad * .74); }
    sprites.set(key, c);
    return c;
  }

  /* ---------- the loop ---------- */
  function frame(now) {
    if (!G) return;
    const dt = Math.min(.25, (now - G.last) / 1000); G.last = now;
    // a phone that can't keep up gets fewer pixels, so the battle stays smooth
    if (!lowRes && G.S.time > 3) { frames++; if (dt > 1 / 40) slowFrames++; if (frames >= 120) { if (slowFrames > 40) { lowRes = true; store.set("lowres", true); layout(); } frames = slowFrames = 0; } }
    if (!G.S.over) {
      G.acc += dt;
      while (G.acc >= A.DT && !G.S.over) {
        for (const e of G.S.ents) G.prev.set(e.id, { x: e.x, y: e.y });
        for (const s of G.S.shots) G.prev.set("s" + s.id, { x: s.x, y: s.y });
        A.step(G.S); G.acc -= A.DT;
        events(G.S.events);
      }
      paintHud();
      if (G.S.over && !G.over) endBattle();
    }
    G.river += dt;
    draw(G.S.over ? 1 : G.acc / A.DT, dt);
    if (!G.done) requestAnimationFrame(frame);
  }

  /* ---------- what just happened, as effects ---------- */
  function events(evs) {
    for (const e of evs) {
      switch (e.t) {
        case "spawn": G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.big ? 3.5 : 1.6, life: e.big ? .8 : .45, t: 0, col: e.side ? "#ff7a90" : "#7fd8ff" }); if (e.big) { G.shake = Math.max(G.shake, .5); sfx("spawnBig"); burst(e.x, e.y, 30, "#fff1c2", 5); } break;
        case "play": sfx("place"); if (e.side === 0) buzz(10); break;
        case "hit": {
          burst(e.x, e.y, e.tower ? 3 : 2, e.tower ? "#ffd65c" : "#ffffff", 2);
          if (e.n >= 40) G.nums.push({ x: e.x + (Math.random() - .5) * .5, y: e.y - .3, n: e.n, life: .8, t: 0, tower: e.tower });
          if (e.tower) G.towerShake.set(e.id, .18);
          sfx("hit"); break;
        }
        case "blast": blastFx(e); break;
        case "heal": break;
        case "death":
          if (e.tower) {
            G.shake = 1.1; G.flash = .55; burst(e.x, e.y, 80, e.side ? "#ff7a90" : "#7fd8ff", 7); burst(e.x, e.y, 40, "#fff1c2", 5);
            G.fx.push({ k: "ring", x: e.x, y: e.y, r: 6, life: .9, t: 0, col: "#fff1c2" });
            G.rubble = G.rubble || []; G.rubble.push({ x: e.x, y: e.y, big: e.tower === "throne", side: e.side });
            sfx("tower"); buzz(e.side === 0 ? [80, 40, 80] : [40]);
            banner(e.side === 1 ? "Tower down!" : "You lost a tower", e.tower === "throne" ? "The Throne falls" : "");
          } else { burst(e.x, e.y, 14, e.side ? "#ff9aac" : "#9fe0ff", 3); sfx("die"); }
          break;
        case "phase": {
          const P = { rising: ["Rising", "DMT ×1.5 · units +15%"], peak: ["Peak", "DMT ×2 · units +30%"], overtime: ["Sudden death", "Next tower wins"] }[e.name];
          if (P) { banner(P[0], P[1]); sfx("phase"); buzz([30, 30, 30]); G.flash = .35; G.phase = e.name; }
          break;
        }
      }
    }
  }
  function burst(x, y, n, col, speed) {
    if (REDUCED) n = Math.min(n, 6);
    for (let i = 0; i < n && G.parts.length < 420; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * speed;
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .35 + Math.random() * .45, t: 0, col, s: .06 + Math.random() * .1 });
    }
  }
  function blastFx(e) {
    const C = { strike: "#fff6a0", nova: "#ff7ae6", halo: "#7dffb8", dust: "#bfeaff", quake: "#ffa45c", prime: "#ffffff", blast: "#ffb05c", splash: "#d6a8ff" }[e.fx] || "#ffffff";
    G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r + .3, life: e.fx === "splash" ? .3 : .6, t: 0, col: C, fill: e.fx !== "splash" });
    if (e.fx === "strike") G.fx.push({ k: "bolt", x: e.x, y: e.y, life: .35, t: 0, seed: Math.random() * 1000 });
    if (e.fx !== "splash") { burst(e.x, e.y, Math.round(e.r * 14), C, e.r * 2.2); G.shake = Math.max(G.shake, Math.min(.9, e.r * .25)); if (e.fx === "nova" || e.fx === "prime" || e.fx === "quake") G.flash = .25; }
    if (e.fx === "halo") sfx("heal"); else if (e.fx === "splash") sfx("hit"); else { sfx("blast"); buzz(25); }
  }
  function banner(t, sub) {
    const b = $("[data-banner]"); b.innerHTML = `${t}${sub ? `<small>${sub}</small>` : ""}`;
    b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
  }

  /* glows, streaks and tower bodies are drawn once and stamped each frame (gradients and blur are slow) */
  const glows = new Map();
  function glow(col) {
    if (glows.has(col)) return glows.get(col);
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "#ffffff"); gr.addColorStop(.3, col); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glows.set(col, c); return c;
  }
  const stamp = (col, x, y, r) => ctx.drawImage(glow(col), x - r, y - r, r * 2, r * 2);
  const streaks = new Map();
  function streak(col) {
    if (streaks.has(col)) return streaks.get(col);
    const c = document.createElement("canvas"); c.width = 128; c.height = 8; const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, col + "00"); gr.addColorStop(.65, col + "cc"); gr.addColorStop(1, "#ffffff");
    g.fillStyle = gr; g.beginPath(); g.ellipse(64, 4, 64, 3, 0, 0, Math.PI * 2); g.fill(); streaks.set(col, c); return c;
  }
  const towerBodies = new Map();
  function towerBody(side, throne) {
    const key = side + ":" + throne + ":" + Math.round(ts * dpr);
    if (towerBodies.has(key)) return towerBodies.get(key);
    const s = throne ? 1.5 : 1.1, T = TEAM[side], box = 4 * s, px = Math.ceil(box * ts * dpr);
    const c = document.createElement("canvas"); c.width = c.height = px; const g = c.getContext("2d");
    g.scale(px / box, px / box); const x = box / 2, y = box * .62;
    g.fillStyle = "rgba(0,0,0,.45)"; g.beginPath(); g.ellipse(x, y + s * .55, s * 1.05, s * .45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = T.dark; g.strokeStyle = T.main; g.lineWidth = .07;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const px2 = x + Math.cos(a) * s, py = y + s * .25 + Math.sin(a) * s * .5; i ? g.lineTo(px2, py) : g.moveTo(px2, py); } g.closePath(); g.fill(); g.stroke();
    const top = y - s * (throne ? 1.9 : 1.6), cg = g.createLinearGradient(x - s * .5, 0, x + s * .5, 0);
    cg.addColorStop(0, T.deep); cg.addColorStop(.45, T.main); cg.addColorStop(.55, "#ffffff"); cg.addColorStop(1, T.deep);
    g.shadowColor = T.main; g.shadowBlur = .8 * px / box;
    g.fillStyle = cg; g.beginPath(); g.moveTo(x, top); g.lineTo(x + s * .5, y - s * .55); g.lineTo(x + s * .32, y + s * .2); g.lineTo(x - s * .32, y + s * .2); g.lineTo(x - s * .5, y - s * .55); g.closePath(); g.fill();
    g.shadowBlur = 0; g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = .04; g.beginPath(); g.moveTo(x, top); g.lineTo(x, y + s * .2); g.stroke();
    if (throne) { g.fillStyle = "#fff"; g.beginPath(); g.ellipse(x, y - s * .65, s * .32, s * .16, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = T.deep; g.beginPath(); g.arc(x, y - s * .65, s * .12, 0, Math.PI * 2); g.fill(); }
    const out = { c, box, ox: x, oy: y, top: top - y };
    towerBodies.set(key, out); return out;
  }

  /* units look bigger than the space they take, so a phone can read them */
  const vis = r => Math.max(.9, r * 1.9);

  /* ---------- drawing a frame ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  function pos(id, x, y, a) { const p = G.prev.get(id); return p ? { x: lerp(p.x, x, a), y: lerp(p.y, y, a) } : { x, y }; }
  function draw(alpha, dt) {
    const S = G.S, W = A.W, H = A.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // screen shake moves both layers together, on the compositor
    G.shake = Math.max(0, G.shake - dt * 2.2);
    const sh = REDUCED ? 0 : G.shake * ts * .35;
    layers.style.transform = sh > .2 ? `translate(${((Math.random() - .5) * sh).toFixed(1)}px,${((Math.random() - .5) * sh).toFixed(1)}px)` : "";
    ctx.scale(dpr * ts, dpr * ts);
    drawRiver(S);
    drawZone();
    // rubble where towers stood
    for (const r of G.rubble || []) drawRubble(r);
    // towers, then ground units by depth, then flyers, then shots
    const ents = S.ents.slice().sort((a, b) => a.y - b.y);
    for (const e of ents) if (e.kind === "tower") drawTower(e, alpha, dt);
    for (const e of ents) if (e.kind === "unit" && !e.air) drawUnit(e, alpha);
    for (const e of ents) if (e.kind === "unit" && e.air) drawUnit(e, alpha);
    for (const s of S.shots) drawShot(s, alpha);
    drawFx(dt);
    drawGhost();
    // the flash of something big
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${G.flash * .5})`; ctx.fillRect(0, 0, W, H); G.flash = Math.max(0, G.flash - dt * 1.6); }
  }
  let riverGrad = null, riverKey = "";
  function drawRiver(S) {
    const R = A.RIVER, t = G.river;
    const col = G.phase === "peak" || G.phase === "overtime" ? ["#ff9ad8", "#fff1c2"] : G.phase === "rising" ? ["#e05cff", "#ff7ae6"] : ["#7a3cff", "#c56bff"];
    if (riverKey !== col[0]) { riverKey = col[0]; riverGrad = ctx.createLinearGradient(0, R - 1, 0, R + 1); riverGrad.addColorStop(0, "rgba(10,4,24,.9)"); riverGrad.addColorStop(.5, col[0] + "55"); riverGrad.addColorStop(1, "rgba(10,4,24,.9)"); }
    ctx.fillStyle = riverGrad; ctx.fillRect(0, R - 1, A.W, 2);
    const st = streak(col[1]);
    for (let k = 0; k < 14; k++) {
      const y = R - .8 + ((k * 0.37) % 1.6), speed = .8 + (k % 5) * .25, len = 1.2 + (k % 3) * .7;
      const x = ((t * speed * 2 + k * 3.7) % (A.W + len * 2)) - len;
      ctx.drawImage(st, x, y - .06, len, .12 + (k % 3) * .04);
    }
    ctx.strokeStyle = col[1] + "55"; ctx.lineWidth = .18;
    ctx.beginPath(); ctx.moveTo(0, R - 1); ctx.lineTo(A.W, R - 1); ctx.moveTo(0, R + 1); ctx.lineTo(A.W, R + 1); ctx.stroke();
    ctx.strokeStyle = col[1] + "cc"; ctx.lineWidth = .05; ctx.stroke();
    for (const bx of A.BRIDGES) {
      ctx.fillStyle = "rgba(70,54,92,.96)"; ctx.beginPath(); roundRect(ctx, bx - 1.1, R - 1.05, 2.2, 2.1, .2); ctx.fill();
      ctx.strokeStyle = "rgba(227,186,92,.8)"; ctx.lineWidth = .08; ctx.beginPath(); ctx.moveTo(bx - 1.1, R - 1.05); ctx.lineTo(bx - 1.1, R + 1.05); ctx.moveTo(bx + 1.1, R - 1.05); ctx.lineTo(bx + 1.1, R + 1.05); ctx.stroke();
    }
  }
  function drawZone() {
    const card = G.drag ? G.drag.def : G.sel != null ? G.S.sides[0].deck[G.S.sides[0].hand[G.sel]] : null;
    if (!card || card.kind === "spell") return;
    // where you can't place: a red veil
    const S = G.S, R = A.RIVER;
    ctx.fillStyle = "rgba(255,40,80,.16)";
    const down = S.sides[1].gatesDown;
    if (!down[0] && !down[1]) ctx.fillRect(0, 0, A.W, R + 1);
    else {
      for (let lane = 0; lane < 2; lane++) {
        const x0 = lane ? A.W / 2 : 0;
        ctx.fillRect(x0, 0, A.W / 2, down[lane] ? 10 : R + 1);
      }
    }
    ctx.strokeStyle = "rgba(255,90,120,.6)"; ctx.setLineDash([.3, .2]); ctx.lineWidth = .06;
    ctx.beginPath(); ctx.moveTo(0, R + 1); ctx.lineTo(A.W, R + 1); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawTower(e, alpha, dt) {
    const T = TEAM[e.side], throne = e.tower === "throne", s = throne ? 1.5 : 1.1, t = G.river;
    let sx = 0; const shk = G.towerShake.get(e.id) || 0;
    if (shk > 0) { sx = (Math.random() - .5) * .18; G.towerShake.set(e.id, shk - dt); }
    const x = e.x + sx, y = e.y, body = towerBody(e.side, throne);
    ctx.drawImage(body.c, x - body.ox, y - body.oy, body.box, body.box);
    const top = y + body.top;
    // a floating heart of light, pulsing
    const pulse = .8 + Math.sin(t * 3 + e.id) * .2, oy = top - .35 - Math.sin(t * 2 + e.id) * .12;
    stamp(T.main, x, oy, s * .6 * pulse);
    if (throne) {
      ctx.strokeStyle = T.glow + ".7)"; ctx.lineWidth = .05;
      for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(x, y - s * .7, s * (1.05 + k * .2), s * (.3 + k * .06), (t * (k ? -.6 : .4)) % (Math.PI * 2), 0, Math.PI * 2); ctx.stroke(); }
    }
    // health
    const w = throne ? 2.6 : 2, hy = top - (throne ? 1.15 : 1);
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.beginPath(); roundRect(ctx, x - w / 2 - .05, hy - .05, w + .1, .4, .12); ctx.fill();
    ctx.fillStyle = T.main; ctx.beginPath(); roundRect(ctx, x - w / 2, hy, w * Math.max(0, e.hp / e.max), .3, .1); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold .34px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(Math.max(0, Math.ceil(e.hp)), x, hy + .17);
  }
  function drawRubble(r) {
    const s = r.big ? 1.5 : 1.1;
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(r.x, r.y + s * .5, s, s * .45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a3448";
    for (let k = 0; k < 6; k++) { const a = k * 1.1, d = s * (.25 + (k % 3) * .2); ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d * .5, s * .22, 0, Math.PI * 2); ctx.fill(); }
    if (Math.random() < .05) G.parts.push({ x: r.x + (Math.random() - .5), y: r.y, vx: 0, vy: -.6, life: 1.2, t: 0, col: "rgba(160,150,180,.5)", s: .18, smoke: true });
  }
  function drawUnit(e, alpha) {
    const p = pos(e.id, e.x, e.y, alpha), T = TEAM[e.side];
    const born = Math.min(1, (e.def.id === "spore" ? 1.2 : 1) - Math.max(0, e.wake));
    const scale = e.wake > 0 ? .6 + .4 * Math.min(1, born * 1.5) : 1;
    const bob = e.air ? Math.sin(G.river * 4 + e.id) * .12 - .55 : Math.abs(Math.sin(G.river * 6 + e.id)) * -.06;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + vis(e.r) * .6, vis(e.r) * (e.air ? .7 : .95), vis(e.r) * .35, 0, 0, Math.PI * 2); ctx.fill();
    const vr = vis(e.r), spr = sprite(e.def, e.side, vr);
    const size = vr * 2 * 1.5 * scale;
    ctx.globalAlpha = e.wake > 0 ? .55 + .45 * Math.min(1, born) : 1;
    ctx.drawImage(spr, p.x - size / 2, p.y + bob - size / 2, size, size);
    ctx.globalAlpha = 1;
    // frozen / slowed
    if (e.frozen) { ctx.fillStyle = "rgba(190,235,255,.45)"; ctx.beginPath(); ctx.arc(p.x, p.y + bob, vis(e.r) * 1.05, 0, Math.PI * 2); ctx.fill(); }
    // deploy countdown ring
    if (e.wake > 0) { ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = .06; ctx.beginPath(); ctx.arc(p.x, p.y + bob, vis(e.r) * 1.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - Math.max(0, e.wake))); ctx.stroke(); }
    // health and shield
    if (e.hp < e.max || e.shield > 0) {
      const w = Math.max(1, vis(e.r) * 2), y = p.y + bob - vis(e.r) - .3;
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(p.x - w / 2 - .03, y - .03, w + .06, .2);
      ctx.fillStyle = T.main; ctx.fillRect(p.x - w / 2, y, w * Math.max(0, e.hp / e.max), .14);
      if (e.shield > 0) { ctx.fillStyle = "#ffe58a"; ctx.fillRect(p.x - w / 2, y - .1, w * Math.min(1, e.shield / e.max), .07); }
    }
  }
  function drawShot(s, alpha) {
    const p = pos("s" + s.id, s.x, s.y, alpha), T = TEAM[s.side];
    const col = s.kind === "tower" ? "#ffe58a" : s.kind === "caster" ? "#e9a8ff" : s.kind === "support" ? "#9dffcf" : T.main;
    const prev = G.prev.get("s" + s.id);
    if (prev) { ctx.strokeStyle = col + "88"; ctx.lineWidth = s.kind === "caster" ? .18 : .1; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    const r = s.kind === "caster" ? .24 : s.kind === "tower" ? .18 : .13;
    stamp(col, p.x, p.y, r * 2.2);
  }
  function drawFx(dt) {
    for (const f of G.fx) {
      f.t += dt; const k = f.t / f.life;
      if (f.k === "ring") {
        ctx.globalAlpha = Math.max(0, 1 - k);
        if (f.fill) { ctx.globalAlpha = Math.max(0, (1 - k) * .5); stamp(f.col, f.x, f.y, Math.max(.01, f.r * k)); ctx.globalAlpha = Math.max(0, 1 - k); }
        ctx.strokeStyle = f.col; ctx.lineWidth = .12 * (1 - k) + .02; ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(.01, f.r * (.2 + .8 * k)), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (f.k === "bolt") {
        ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = "#fffbe0"; ctx.lineWidth = .14; ctx.shadowColor = "#ffe58a"; ctx.shadowBlur = .6;
        ctx.beginPath(); let x = f.x + 1.5, y = f.y - 8; ctx.moveTo(x, y);
        let sd = f.seed; for (let i = 0; i < 7; i++) { sd = (sd * 9301 + 49297) % 233280; x = f.x + (1.5 - i * .22) + (sd / 233280 - .5) * 1.2; y = f.y - 8 + (i + 1) * (8 / 7); ctx.lineTo(x, y); }
        ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }
    G.fx = G.fx.filter(f => f.t < f.life);
    for (const p of G.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92;
      const k = 1 - p.t / p.life; if (k <= 0) continue;
      ctx.globalAlpha = k; ctx.fillStyle = p.col;
      const ps = p.smoke ? p.s * (2 - k) : p.s * k + .02; ctx.fillRect(p.x - ps, p.y - ps, ps * 2, ps * 2);
    }
    ctx.globalAlpha = 1;
    G.parts = G.parts.filter(p => p.t < p.life);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const n of G.nums) {
      n.t += dt; const k = n.t / n.life; if (k >= 1) continue;
      ctx.globalAlpha = 1 - k; ctx.font = `bold ${n.tower ? .55 : .45}px system-ui`;
      ctx.lineWidth = .08; ctx.strokeStyle = "#000"; ctx.strokeText("-" + n.n, n.x, n.y - k * .9);
      ctx.fillStyle = n.tower ? "#ffe58a" : "#fff"; ctx.fillText("-" + n.n, n.x, n.y - k * .9);
    }
    ctx.globalAlpha = 1;
    G.nums = G.nums.filter(n => n.t < n.life);
  }
  function drawGhost() {
    const a = G.aim; if (!a) return;
    const def = a.def, ok = a.ok;
    if (def.kind === "spell") {
      ctx.fillStyle = ok ? "rgba(255,230,140,.18)" : "rgba(255,60,90,.2)"; ctx.strokeStyle = ok ? "#ffe58a" : "#ff5470"; ctx.lineWidth = .08;
      ctx.beginPath(); ctx.arc(a.x, a.y, def.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); return;
    }
    ctx.globalAlpha = ok ? .8 : .45;
    const vr = vis(def.r || .45), spr = sprite(def, 0, vr), size = vr * 3;
    ctx.drawImage(spr, a.x - size / 2, a.y - size / 2, size, size);
    ctx.globalAlpha = 1;
    if (def.range > 1.6) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.setLineDash([.25, .2]); ctx.lineWidth = .05; ctx.beginPath(); ctx.arc(a.x, a.y, def.range + .5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (!ok) { ctx.strokeStyle = "#ff5470"; ctx.lineWidth = .12; ctx.beginPath(); ctx.moveTo(a.x - .5, a.y - .5); ctx.lineTo(a.x + .5, a.y + .5); ctx.moveTo(a.x + .5, a.y - .5); ctx.lineTo(a.x - .5, a.y + .5); ctx.stroke(); }
  }

  /* ---------- the hand and the bar ---------- */
  function cardHtml(def, mini) {
    const tc = def.kind === "spell" ? "#c9a24e" : TIER_COL[def.tier];
    const pic = def.n ? `<img src="/thumbs/${def.n}.webp" alt="" draggable="false">` : `<svg class="ar-sig" viewBox="0 0 100 100" style="background:radial-gradient(circle at 50% 45%,#4a1a7a,#0b0616 70%)">${SPELL_ICON[def.id] || ""}</svg>`;
    return `<div class="ar-card${mini ? " mini" : ""}" style="--tc:${tc}"><span class="ar-card-in">${pic}</span><span class="ar-card-cost">${def.cost}</span>
      <span class="ar-card-name">${def.name}</span><span class="ar-card-role">${def.kind === "spell" ? "Spell" : def.roleLabel + (def.power ? " · " + def.power.label : "")}</span><span class="ar-card-fill"></span></div>`;
  }
  let handSig = "";
  function paintHand(force) {
    const P = G.S.sides[0], sig = P.hand.join() + ":" + P.queue[0];
    if (force || sig !== handSig) {
      handSig = sig;
      $("[data-hand]").innerHTML = P.hand.map((ci, slot) => `<div data-slot="${slot}">${cardHtml(P.deck[ci])}</div>`).join("");
      $("[data-next]").outerHTML = cardHtml(P.deck[P.queue[0]], true).replace('class="ar-card mini"', 'data-next class="ar-card mini"');
    }
    $$("[data-slot]").forEach(el => {
      const slot = Number(el.dataset.slot), def = P.deck[P.hand[slot]], card = el.firstElementChild;
      card.classList.toggle("poor", P.dmt < def.cost);
      card.classList.toggle("sel", G.sel === slot);
      card.classList.toggle("dragging", !!(G.drag && G.drag.slot === slot));
      const f = card.querySelector(".ar-card-fill"); f.style.height = (P.dmt >= def.cost ? 0 : 100 * (1 - P.dmt / def.cost)) + "%";
    });
  }
  let lastDmt = -1;
  function paintHud() {
    const S = G.S, P = S.sides[0];
    $("[data-dmt-fill]").style.width = (P.dmt / A.MAX_DMT * 100).toFixed(1) + "%";
    const whole = Math.floor(P.dmt + 1e-9);
    if (whole !== lastDmt) { $("[data-dmt-n]").textContent = whole; lastDmt = whole; }
    const left = Math.max(0, (S.time < A.MATCH_S ? A.MATCH_S : A.MATCH_S + A.OVERTIME_S) - S.time);
    const clock = $("[data-clock]").parentElement;
    $("[data-clock]").textContent = Math.floor(left / 60) + ":" + String(Math.floor(left % 60)).padStart(2, "0");
    clock.className = "ar-clock " + G.phase + (left <= 10 ? " hurry" : "");
    $("[data-phase]").textContent = { calm: "Calm", rising: "Rising ×1.5", peak: "Peak ×2", overtime: "Sudden death" }[G.phase];
    if (S.crowns.join() !== G.crowns.join()) { G.crowns = S.crowns.slice(); paintCrowns(); }
    paintHand(false);
    tips(S);
  }
  function paintCrowns() { for (const side of [0, 1]) $(`[data-crowns="${side}"]`).innerHTML = [0, 1, 2].map(i => `<i class="${i < G.S.crowns[side] ? "on" : ""}"></i>`).join(""); }

  /* ---------- placing: drag a card, or tap it then tap the field ---------- */
  function toArena(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / ts, y: (clientY - r.top) / ts, inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom };
  }
  function tryPlace(slot, x, y) {
    const S = G.S, P = S.sides[0], def = P.deck[P.hand[slot]];
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    if (P.dmt < def.cost) { sfx("no"); flashTip("Not enough DMT yet: wait for the bar."); return false; }
    if (!A.canPlaceAt(S, 0, def, x, y)) { sfx("no"); flashTip(def.kind === "spell" ? "Not there." : "Place units on your half of the arena."); return false; }
    const t = S.tick, err = A.place(S, 0, slot, x, y);
    if (err) { sfx("no"); return false; }
    G.inputs.push({ t, slot, x, y });
    G.sel = null; G.tips.placed = true; store.set("tips", G.tips);
    paintHand(true);
    return true;
  }
  $("[data-hand]").addEventListener("pointerdown", e => {
    const el = e.target.closest("[data-slot]"); if (!el || !G || G.S.over) return;
    const slot = Number(el.dataset.slot), def = G.S.sides[0].deck[G.S.sides[0].hand[slot]];
    G.drag = { slot, def, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    au();
  });
  window.addEventListener("pointermove", e => {
    if (!G || !G.drag || e.pointerId !== G.drag.id) return;
    const d = G.drag;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) { d.moved = true; G.sel = null; paintHand(false); }
    if (!d.moved) return;
    const p = toArena(e.clientX, e.clientY - 40);   // lifted a little above the finger, so you can see it
    G.aim = p.inside || p.y < A.H ? { def: d.def, x: p.x, y: p.y, ok: p.inside && A.canPlaceAt(G.S, 0, d.def, p.x, p.y) && G.S.sides[0].dmt >= d.def.cost } : null;
  });
  window.addEventListener("pointerup", e => {
    if (!G || !G.drag || e.pointerId !== G.drag.id) return;
    const d = G.drag; G.drag = null;
    if (d.moved) { const p = toArena(e.clientX, e.clientY - 40); if (p.inside) tryPlace(d.slot, p.x, p.y); G.aim = null; }
    else { G.sel = G.sel === d.slot ? null : d.slot; sfx("tick"); }
    paintHand(false);
  });
  canvas.addEventListener("pointerdown", e => {
    if (!G || G.sel == null || G.S.over) return;
    const p = toArena(e.clientX, e.clientY);
    if (tryPlace(G.sel, p.x, p.y)) G.aim = null;
  });
  canvas.addEventListener("pointermove", e => {
    if (!G || G.sel == null || G.drag) return;
    const p = toArena(e.clientX, e.clientY), def = G.S.sides[0].deck[G.S.sides[0].hand[G.sel]];
    G.aim = { def, x: p.x, y: p.y, ok: A.canPlaceAt(G.S, 0, def, p.x, p.y) && G.S.sides[0].dmt >= def.cost };
  });

  /* ---------- tips for a first battle ---------- */
  let tipT = null;
  function flashTip(t) { const el = $("[data-tip]"); el.textContent = t; el.hidden = false; clearTimeout(tipT); tipT = setTimeout(() => { el.hidden = true; }, 1800); }
  function tips(S) {
    if (G.tips.done) return;
    const t = S.time, P = S.sides[0];
    if (!G.tips.placed && t > 1.5 && !G.tipShown) { G.tipShown = 1; const el = $("[data-tip]"); el.textContent = "Drag a card from your hand onto your half of the arena."; el.hidden = false; clearTimeout(tipT); }
    if (G.tips.placed && G.tipShown === 1) { G.tipShown = 2; $("[data-tip]").hidden = true; flashTip("Nice. DMT refills over time: spend it, but keep some to defend."); }
    if (P.dmt >= 9.9 && t > 8 && !G.tips.full) { G.tips.full = 1; flashTip("Your DMT is full: you're wasting it. Play a card!"); }
    if (t > 40 && G.tips.placed) { G.tips.done = 1; store.set("tips", G.tips); }
  }

  /* ---------- the end ---------- */
  async function endBattle() {
    G.over = true; G.aim = null; G.drag = null;
    const S = G.S, won = S.winner === 0, draw = S.winner == null && !G.quit;
    setTimeout(() => { G.done = true; }, 2500);
    sfx(won ? "win" : draw ? "phase" : "lose"); buzz(won ? [40, 60, 40, 60, 120] : [120]);
    const end = $("[data-end]");
    end.classList.toggle("lost", !won && !draw);
    $("[data-end-title]").textContent = won ? "Victory" : draw ? "Draw" : "Defeat";
    $("[data-end-sub]").textContent = `${S.crowns[0]} – ${S.crowns[1]}`;
    $("[data-end-crowns]").innerHTML = [0, 1, 2].map(i => `<i class="${i < S.crowns[0] ? "on" : ""}" style="animation-delay:${.5 + i * .25}s"></i>`).join("");
    $("[data-end-note]").textContent = G.quit ? "You left the battle." : "Checking the result with the realm…";
    setTimeout(() => { end.hidden = false; }, 1400);
    if (G.quit) return;
    try {
      const r = await (await fetch("/api/arena/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match: G.match, inputs: G.inputs }) })).json();
      if (r.error) $("[data-end-note]").textContent = "The realm could not confirm this one: " + r.error;
      else $("[data-end-note]").textContent = `Confirmed by the realm · +${r.result.xp} XP`;
    } catch { $("[data-end-note]").textContent = "The result could not be sent. Check your connection."; }
  }

  // Codex-style card art for the lobby's role list
  const style = document.createElement("style");
  style.textContent = ".ar-how-role{padding:10px;border-radius:14px;background:rgba(18,10,36,.8);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:3px}.ar-how-role b{font-size:.82rem}.ar-how-role i{font-style:normal;font-size:.68rem;color:#a99bd6;line-height:1.3}.ar-deck{grid-template-columns:repeat(2,1fr)!important}";
  document.head.appendChild(style);
})();
