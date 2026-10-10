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
    gas: () => noise(.5, { v: .07, f: 500 }),
    thunder: () => { noise(.9, { v: .3, f: 260 }); tone(55, .8, { type: "sawtooth", v: .12, to: 35 }); tone(1800, .12, { type: "square", v: .03, to: 400 }); },
    whoosh: () => noise(.25, { v: .1, f: 1600 }),
  };
  const sfx = k => { try { SFX[k](); } catch { /* no audio */ } };
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* no haptics */ } };
  function setMute(m) { muted = m; store.set("muted", m); $$("[data-mute]").forEach(b => { b.innerHTML = `<svg><use href="#i-${m ? "mute" : "sound"}"/></svg>`; b.setAttribute("aria-pressed", String(!m)); }); }
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
  const POWERS = [
    [11, "Spore Gas", "Leaves a toxic cloud that keeps hurting", "#8dff5a"],
    [176, "Descend", "Gods fall from the sky calling lightning", "#fde68a"],
    [29, "Ethereal", "Entities: only towers can hurt them", "#c9a8ff"],
    [17, "Chain Lightning", "Leaps to two more enemies", "#9fe0ff"],
    [28, "Tractor Beam", "Flies; burns hotter the longer it holds", "#ffd27a"],
    [71, "Star Burst", "Lands with a blast; every hit explodes", "#ffb05c"],
    [6, "Roots", "Pins its target and mends itself", "#6dff8a"],
    [43, "Orbit", "Moons smash everything close by", "#d9ccff"],
    [193, "Phantom", "Unseen until its first big strike", "#e8e0ff"],
    [445, "Frost", "Slows enemies to a crawl", "#bfeaff"],
  ];
  $("[data-powers]").innerHTML = POWERS.map(([n, t, d, c]) => `<div class="ar-pow" style="--pc:${c}"><img src="/thumbs/${n}.webp" alt="" loading="lazy"><span><b>${t}</b><i>${d}</i></span></div>`).join("");
  const record = () => store.get("record", { w: 0, l: 0, d: 0 });
  function paintLobby() {
    $("[data-wins]").textContent = record().w;
    const s = session(), tile = $("[data-army]");
    tile.classList.toggle("own", !!s);
    $("[data-army-title]").textContent = s ? "Your beings" : "Borrowed spirits";
    $("[data-army-note]").textContent = s ? "Signed in: your own beings fight, with your $DMT boost" : "Sign in at Duels to fight with your own beings";
  }
  $("[data-battle]").addEventListener("click", () => { sfx("tick"); battle(); });
  $("[data-again]").addEventListener("click", () => { $("[data-end]").hidden = true; battle(); });
  $("[data-lobby]").addEventListener("click", () => { $("[data-end]").hidden = true; show("lobby"); paintLobby(); });
  $("[data-how]").addEventListener("click", () => { $("[data-howsheet]").hidden = false; sfx("tick"); });
  $$("[data-howclose]").forEach(b => b.addEventListener("click", () => { $("[data-howsheet]").hidden = true; }));
  $("[data-quit]").addEventListener("click", () => { if (G && !G.S.over && confirm("Leave this battle? It counts as a loss.")) { G.quit = true; G.S.over = true; G.S.winner = 1; endBattle(); } });
  function show(name) { $$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; }); }
  const session = () => { try { const s = JSON.parse(localStorage.getItem("realm-tcg-session") || "null"); return s && Date.now() - s.at < 23 * 3600e3 ? s : null; } catch { return null; } };
  paintLobby();

  /* ============================================================
     THE BATTLE
     ============================================================ */
  let G = null;
  const canvas = $("[data-canvas]"), ctx = canvas.getContext("2d"), bg = $("[data-bg]"), layers = $("[data-layers]");
  let ts = 16, dpr = 1, lowRes = store.get("lowres", false), slowFrames = 0, frames = 0;
  const sprites = new Map();

  async function battle() {
    const btn = $("[data-battle]"); btn.disabled = true;
    $("[data-battle-label]").textContent = "Finding…"; $("[data-battle-sub]").textContent = "summoning a guardian";
    const s = session();
    let d;
    try { d = await (await fetch("/api/arena/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s ? { token: s.token } : {}) })).json(); }
    catch { d = { error: "The realm did not answer. Try again." }; }
    btn.disabled = false; $("[data-battle-label]").textContent = "Battle"; $("[data-battle-sub]").textContent = "vs the realm's guardians";
    if (d.error) { $("[data-lobby-note]").textContent = d.error; show("lobby"); return; }
    for (const side of d.sides) for (const c of side.deck) img(c.n);
    await faceOff(d);
    G = { match: d.match, seed: d.seed, sides: d.sides, S: A.createMatch({ seed: d.seed, sides: d.sides }), inputs: [], acc: 0, last: 0, prev: new Map(),
      fx: [], parts: [], nums: [], beams: new Map(), immune: new Map(), shake: 0, flash: 0, sel: null, drag: null, aim: null, phase: "calm", tips: store.get("tips", {}), over: false, river: 0, crowns: [0, 0], towerShake: new Map(), crewFire: new Map(), crewTurn: new Map(), shotFrom: new Map(), flies: [], gait: new Map(), swing: new Map(), jolt: new Map() };
    $("[data-rname]").textContent = d.rival;
    show("battle"); layout(); paintHand(true); paintHud(); paintCrowns();
    banner("Battle!");
    sfx("phase"); buzz(20);
    G.last = performance.now();
    requestAnimationFrame(frame);
  }

  /* the face-off: who you're fighting and the eight cards you bring */
  function faceOff(d) {
    const vs = $("[data-vs]");
    $("[data-vs-rival]").textContent = d.rival;
    $("[data-vs-army]").textContent = d.own && d.own.length ? `Your beings${d.boost ? " · $DMT boost" : ""}` : "Borrowed spirits";
    $("[data-vs-deck]").innerHTML = d.sides[0].deck.map((c, i) => cardHtml(c, false, `animation-delay:${.45 + i * .06}s`)).join("");
    vs.classList.remove("out"); vs.hidden = false;
    sfx("whoosh"); setTimeout(() => { sfx("blast"); buzz(30); }, 350);
    return new Promise(res => setTimeout(() => { vs.classList.add("out"); setTimeout(() => { vs.hidden = true; }, 350); res(); }, REDUCED ? 900 : 2300));
  }

  /* ---------- layout ---------- */
  // headroom above the rival's Throne, so its crystal and health bar sit clear of the top bar
  const TOP = 1.9, CROP = 1.6;
  let OX = 0, OY = TOP, VW = 18, VH = 34;
  const stageEl = $("[data-stage]");
  function layout() {
    const st = $("[data-stage]").getBoundingClientRect();
    // the canvas fills the whole stage; the arena is as big as fits (its outer rim may be trimmed),
    // centred, with open sky painted around it. The top bar floats over the headroom.
    const hud = $(".ar-hud").getBoundingClientRect().height - 8, HEAD = 1.45;   // room for the rival's tree under the bar
    ts = Math.max(8, Math.min(st.width / (A.W - .7), (st.height - hud) / (A.H + HEAD - CROP)));
    dpr = Math.min(lowRes ? 1.2 : 2, window.devicePixelRatio || 1);
    VW = st.width / ts; VH = st.height / ts;
    OX = (VW - A.W) / 2; OY = hud / ts + HEAD + Math.max(0, (VH - hud / ts - (A.H + HEAD - CROP)) / 2);
    for (const c of [canvas, bg]) { c.style.width = st.width + "px"; c.style.height = st.height + "px"; c.width = Math.round(st.width * dpr); c.height = Math.round(st.height * dpr); }
    sprites.clear(); towerArt.clear();
    // the arena itself is drawn once, on its own layer underneath
    bg.getContext("2d").drawImage(drawStatic(), 0, 0);
  }
  const relayout = () => { if (G && !$("[data-screen=battle]").hidden) layout(); };
  window.addEventListener("resize", relayout);
  try { new ResizeObserver(relayout).observe($("[data-stage]")); } catch { /* old browser: resize still works */ }
  try { document.fonts.ready.then(relayout); } catch { /* fine */ }

  /* ---------- the arena, drawn once ---------- */
  const SPOTS = [[3.5, 25.5, 1.1], [14.5, 25.5, 1.1], [9, 29, 1.5]];
  const STONE = [{ h: 222, s: 30, l: 19 }, { h: 335, s: 26, l: 17 }];
  function drawStatic() {
    const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext("2d"); g.scale(dpr * ts, dpr * ts); g.translate(OX, OY);
    const W = A.W, H = A.H, R = A.RIVER;
    let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    // the deep: a nebula under everything
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#14040e"); gr.addColorStop(.5, "#0c0620"); gr.addColorStop(1, "#040c1e");
    const L = -OX, T0 = -OY, FW = VW, FH = VH;
    g.fillStyle = gr; g.fillRect(L, T0, FW, FH);
    const neb = (x, y, rad, col) => { const n = g.createRadialGradient(x, y, 0, x, y, rad); n.addColorStop(0, col); n.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = n; g.fillRect(L, T0, FW, FH); };
    neb(9, R, 7, "rgba(197,107,255,.35)"); neb(2, R, 4, "rgba(255,122,230,.18)"); neb(16, R, 4, "rgba(120,140,255,.2)");
    neb(-1, 7, 5, "rgba(255,70,110,.16)"); neb(W + 1, 25, 5, "rgba(70,150,255,.16)"); neb(-1, 26, 4, "rgba(150,90,255,.14)"); neb(W + 1, 6, 4, "rgba(255,110,200,.12)");
    for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(255,255,255,${.2 + r() * .6})`; const x = L + r() * FW, y = T0 + r() * FH; g.fillRect(x, y, .04 + r() * .05, .04 + r() * .05); }
    // floating rocks in the open sky either side of the arena
    if (OX > .4) for (let k = 0; k < 10; k++) { const left = k % 2 === 0, x = left ? -OX * (.25 + r() * .5) : W + OX * (.25 + r() * .5), y = 2 + r() * (H - 4); if (Math.abs(y - R) < 2) continue; skyRock(g, x, y, Math.min(.9, OX * .35) * (.6 + r() * .5), r); }
    for (let side = 0; side < 2; side++) {
      const y0 = side === 0 ? R + 1 : 0.3, y1 = side === 0 ? H - 0.3 : R - 1, T = TEAM[side], St = STONE[side];
      const spots = SPOTS.map(([x, y, s]) => [x, side ? H - y : y, s]);
      const inLane = (x, y) => A.BRIDGES.some(bx => Math.abs(x - bx) < 1.25) || Math.hypot(x - 9, y - spots[2][1]) < 3.3;
      g.save();
      g.beginPath(); roundRect(g, 0.35, y0, W - 0.7, y1 - y0, 0.3); g.clip();
      g.fillStyle = `hsl(${St.h} ${St.s}% ${St.l - 7}%)`; g.fillRect(0, y0, W, y1 - y0);
      // flagstones, laid like brick; the walked lanes are worn lighter
      for (let row = Math.floor(y0); row < y1; row++) {
        let x = -(row % 2) * .6 - r() * .3;
        while (x < W) {
          const w = [1, 1.3, 1.6, 2][Math.floor(r() * 4)], cx = x + w / 2, cy = row + .5, lane = inLane(cx, cy);
          const l = St.l + (r() - .5) * 4 + (lane ? 5 : 0), sat = St.s - (lane ? 10 : 0);
          g.fillStyle = `hsl(${St.h + (r() - .5) * 10} ${sat}% ${l}%)`;
          g.fillRect(x + .06, row + .06, w - .12, .88);
          g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + .12, row + .07, w - .24, .06);
          g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x + .1, row + .87, w - .2, .07);
          if (r() < .08) { g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = .03; g.beginPath(); g.moveTo(x + w * .3, row + .15); g.lineTo(x + w * .45, row + .5); g.lineTo(x + w * .4, row + .85); g.stroke(); }
          x += w;
        }
      }
      // runes glowing down the middle of each lane
      for (const bx of A.BRIDGES) {
        const lg = g.createLinearGradient(bx - 1.3, 0, bx + 1.3, 0); lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(.5, T.glow + ".09)"); lg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = lg; g.fillRect(bx - 1.3, y0, 2.6, y1 - y0);
        for (let y = Math.ceil(y0) + .5; y < y1; y += 2) { if (spots.some(([sx, sy]) => Math.hypot(bx - sx, y - sy) < 1.6)) continue; g.fillStyle = T.glow + ".35)"; g.beginPath(); g.arc(bx, y, .07, 0, Math.PI * 2); g.fill(); }
      }
      // the summoning circle under the Throne, and rings under each tower
      mandala(g, 9, spots[2][1], 3.4, side ? "rgba(255,140,170,.4)" : "rgba(140,210,255,.4)");
      for (const [x, y, s] of spots) { const tg = g.createRadialGradient(x, y + .3, 0, x, y + .3, s * 2.2); tg.addColorStop(0, T.glow + ".22)"); tg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = tg; g.fillRect(x - 4, y - 4, 8, 8); }
      // glowing mushrooms and crystals along the walls
      for (let k = 0, tries = 0; k < 9 && tries < 200; tries++) {
        const x = .9 + r() * (W - 1.8), y = y0 + .8 + r() * (y1 - y0 - 1.6);
        if (inLane(x, y) || spots.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < 2.4) || Math.abs(x - 9) < 2.4) continue;
        k++; (k % 3 ? shroom : crystal)(g, x, y, .55 + r() * .35, r, T);
      }
      // a soft shadow in from the walls
      const vg = g.createRadialGradient(W / 2, (y0 + y1) / 2, 4, W / 2, (y0 + y1) / 2, 11); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.45)");
      g.fillStyle = vg; g.fillRect(0, y0, W, y1 - y0);
      g.restore();
      // the wall: dark stone, a bevel, a gold inlay and the team's glow
      g.save(); g.lineJoin = "round";
      g.shadowColor = T.main; g.shadowBlur = ts * dpr * .5;
      g.strokeStyle = T.glow + ".8)"; g.lineWidth = .1; g.beginPath(); roundRect(g, 0.3, y0 - .05, W - 0.6, y1 - y0 + .1, 0.35); g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = "#0b0716"; g.lineWidth = .34; g.beginPath(); roundRect(g, 0.52, y0 + .17, W - 1.04, y1 - y0 - .34, 0.2); g.stroke();
      g.strokeStyle = "rgba(227,186,92,.55)"; g.lineWidth = .045; g.beginPath(); roundRect(g, 0.7, y0 + .35, W - 1.4, y1 - y0 - .7, 0.1); g.stroke();
      g.restore();
      // corner pillars with a gem on top
      for (const [px, py] of [[.75, y0 + .75], [W - .75, y0 + .75], [.75, y1 - .75], [W - .75, y1 - .75]]) pillar(g, px, py, T);
    }
    // the great mandala over the river
    mandala(g, 9, R, 5.2, "rgba(227,186,92,.16)");
    return c;
  }
  function skyRock(g, x, y, s, r) {
    const gl = g.createRadialGradient(x, y + s * .3, 0, x, y + s * .3, s * 2); gl.addColorStop(0, "rgba(150,110,255,.18)"); gl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gl; g.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
    g.fillStyle = "#2a2140"; g.strokeStyle = "#0a0514"; g.lineWidth = .05;
    g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s * .6, y - s * .3); g.lineTo(x + s * .5, y - s * .35); g.lineTo(x + s, y); g.lineTo(x + s * .3, y + s * .9); g.lineTo(x - s * .2, y + s * .6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#3e3458"; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s * .6, y - s * .3); g.lineTo(x + s * .5, y - s * .35); g.lineTo(x + s, y); g.closePath(); g.fill();
    const cols = ["#7fe8ff", "#ff8ad8", "#b98bff", "#8dff6a"], col = cols[Math.floor(r() * 4)];
    for (const [ox, h] of [[-.25, .55], [.1, .8], [.35, .45]]) { g.fillStyle = col; g.beginPath(); g.moveTo(x + (ox - .08) * s, y - s * .3); g.lineTo(x + ox * s, y - s * (.3 + h)); g.lineTo(x + (ox + .08) * s, y - s * .3); g.closePath(); g.fill(); }
  }
  function shroom(g, x, y, s, r, T) {
    const cols = ["#ff5fd2", "#5ff0ff", "#ffb347", "#b98bff", "#7dff6a"], col = cols[Math.floor(r() * cols.length)];
    const gl = g.createRadialGradient(x, y, 0, x, y, s * 1.4); gl.addColorStop(0, col + "55"); gl.addColorStop(1, col + "00"); g.fillStyle = gl; g.fillRect(x - s * 1.5, y - s * 1.5, s * 3, s * 3);
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * s * .42, sc = k === 1 ? 1 : .65, by = y + (k === 1 ? 0 : s * .12);
      g.fillStyle = "#e8dcc8"; g.fillRect(x + ox - s * .06 * sc, by - s * .38 * sc, s * .12 * sc, s * .38 * sc);
      g.fillStyle = col; g.beginPath(); g.ellipse(x + ox, by - s * .38 * sc, s * .3 * sc, s * .2 * sc, 0, Math.PI, 0); g.fill();
      g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(x + ox - s * .1 * sc, by - s * .48 * sc, s * .04 * sc, 0, Math.PI * 2); g.arc(x + ox + s * .1 * sc, by - s * .44 * sc, s * .03 * sc, 0, Math.PI * 2); g.fill();
    }
  }
  function crystal(g, x, y, s, r, T) {
    const gl = g.createRadialGradient(x, y, 0, x, y, s * 1.3); gl.addColorStop(0, T.glow + ".35)"); gl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gl; g.fillRect(x - s * 1.4, y - s * 1.4, s * 2.8, s * 2.8);
    g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(x, y + s * .05, s * .45, s * .15, 0, 0, Math.PI * 2); g.fill();
    for (const [ox, h, w, tilt] of [[-.22, .55, .14, -.25], [.2, .5, .13, .3], [0, .85, .18, 0]]) {
      const bx = x + ox * s, top = y - h * s, tx = bx + tilt * s * .4;
      const cg = g.createLinearGradient(bx - w * s, 0, bx + w * s, 0); cg.addColorStop(0, T.deep); cg.addColorStop(.5, "#ffffff"); cg.addColorStop(1, T.main);
      g.fillStyle = cg; g.beginPath(); g.moveTo(bx - w * s, y); g.lineTo(tx, top); g.lineTo(bx + w * s, y); g.closePath(); g.fill();
    }
  }
  function pillar(g, x, y, T) {
    g.fillStyle = "rgba(0,0,0,.45)"; g.beginPath(); g.ellipse(x, y + .32, .42, .16, 0, 0, Math.PI * 2); g.fill();
    const pg = g.createLinearGradient(x - .32, 0, x + .32, 0); pg.addColorStop(0, "#2a2238"); pg.addColorStop(.5, "#4a3e5e"); pg.addColorStop(1, "#1c1628");
    g.fillStyle = pg; g.beginPath(); roundRect(g, x - .3, y - .5, .6, .82, .08); g.fill();
    g.strokeStyle = "rgba(227,186,92,.7)"; g.lineWidth = .04; g.beginPath(); roundRect(g, x - .3, y - .5, .6, .82, .08); g.stroke();
    const gg = g.createRadialGradient(x, y - .55, 0, x, y - .55, .5); gg.addColorStop(0, "#ffffff"); gg.addColorStop(.25, T.main); gg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gg; g.fillRect(x - .5, y - 1.05, 1, 1);
  }
  /* the bridge: planks between gold-trimmed rails, drawn once */
  let bridgeSpr = null, bridgeKey = 0;
  function bridge() {
    const key = Math.round(ts * dpr);
    if (bridgeSpr && bridgeKey === key) return bridgeSpr;
    const w = 2.6, h = 3, c = document.createElement("canvas"); c.width = Math.ceil(w * key); c.height = Math.ceil(h * key);
    const g = c.getContext("2d"); g.scale(key, key);
    g.fillStyle = "rgba(0,0,0,.5)"; g.beginPath(); roundRect(g, .15, .2, w - .3, h - .2, .2); g.fill();
    let sd = 3; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let y = .25; y < h - .3; y += .34) {
      g.fillStyle = `hsl(${24 + r() * 8} ${35 + r() * 10}% ${22 + r() * 8}%)`; g.beginPath(); roundRect(g, .32, y, w - .64, .29, .05); g.fill();
      g.fillStyle = "rgba(255,220,170,.1)"; g.fillRect(.36, y + .02, w - .72, .04);
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(.4 + r() * 1.4, y + .12, .06, .06);
    }
    for (const x of [.18, w - .38]) {
      const rg = g.createLinearGradient(x, 0, x + .2, 0); rg.addColorStop(0, "#3a2414"); rg.addColorStop(.5, "#6a4426"); rg.addColorStop(1, "#2a180c");
      g.fillStyle = rg; g.fillRect(x, .1, .2, h - .2);
      g.fillStyle = "#e3ba5c"; g.fillRect(x + .07, .1, .05, h - .2);
      for (const y of [.12, h - .42]) { g.fillStyle = "#1c1228"; g.beginPath(); roundRect(g, x - .08, y, .36, .32, .06); g.fill(); g.strokeStyle = "#e3ba5c"; g.lineWidth = .04; g.stroke(); }
    }
    bridgeSpr = c; bridgeKey = key; return c;
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
    const hg = g.createRadialGradient(m, m, rad * .7, m, m, rad * 1.45); hg.addColorStop(0, T.glow + ".5)"); hg.addColorStop(1, T.glow + "0)");
    g.fillStyle = hg; g.beginPath(); g.arc(m, m, rad * 1.45, 0, Math.PI * 2); g.fill();
    // a metal rim: dark edge, the team's colour lit from above, then a thin rarity band
    g.fillStyle = "#07030e"; g.beginPath(); g.arc(m, m, rad * 1.04, 0, Math.PI * 2); g.fill();
    const rg = g.createLinearGradient(0, m - rad, 0, m + rad); rg.addColorStop(0, "#ffffff"); rg.addColorStop(.25, T.main); rg.addColorStop(1, T.deep);
    g.fillStyle = rg; g.beginPath(); g.arc(m, m, rad, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#07030e"; g.beginPath(); g.arc(m, m, rad * .87, 0, Math.PI * 2); g.fill();
    g.fillStyle = TIER_COL[def.tier] || "#c9a24e"; g.beginPath(); g.arc(m, m, rad * .84, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(m, m, rad * .77, 0, Math.PI * 2); g.clip();
    const im = img(def.n);
    if (im) g.drawImage(im, m - rad * .8, m - rad * .8, rad * 1.6, rad * 1.6);
    else { const bg = g.createRadialGradient(m, m * .8, 0, m, m, rad); bg.addColorStop(0, T.main); bg.addColorStop(1, T.dark); g.fillStyle = bg; g.fillRect(0, 0, px, px); }
    // a glassy shine across the top
    const sh = g.createLinearGradient(0, m - rad * .77, 0, m); sh.addColorStop(0, "rgba(255,255,255,.35)"); sh.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sh; g.beginPath(); g.ellipse(m, m - rad * .38, rad * .62, rad * .36, 0, 0, Math.PI * 2); g.fill();
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
        noteShots(G.S);
      }
      paintHud();
      if (G.S.over && !G.over) endBattle();
    }
    G.river += dt;
    draw(G.S.over ? 1 : G.acc / A.DT, dt);
    if (!G.done) requestAnimationFrame(frame);
  }

  /* a tower's shot leaves from whoever fired it: a crew member on the cap, or the tree's eye */
  function noteShots(S) {
    for (const sh of S.shots) {
      if (sh.kind !== "tower" || G.shotFrom.has(sh.id)) continue;
      const tw = S.ents.find(e => e.id === sh.from), tg = S.ents.find(e => e.id === sh.to);
      if (!tw || !tg) { G.shotFrom.set(sh.id, null); continue; }
      const d0 = Math.max(.5, Math.hypot(tg.x - sh.x, tg.y - sh.y));
      if (tw.tower === "throne") G.shotFrom.set(sh.id, { ox: 0, oy: .4 - 1.05, d0, look: "eye" });
      else { G.crewFire.set(tw.id, G.river); G.shotFrom.set(sh.id, { ox: 0, oy: .4 - 3.25, d0, look: "plasma" }); }
    }
    // spent plasma bursts into a puff of green mist where it struck
    const live = new Set(S.shots.map(q => q.id));
    for (const [k, f] of G.shotFrom) if (!live.has(k)) { if (f && f.look === "plasma" && f.last) mist(f.last.x, f.last.y); G.shotFrom.delete(k); }
  }

  /* ---------- what just happened, as effects ---------- */
  function events(evs) {
    for (const e of evs) {
      switch (e.t) {
        case "spawn": G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.big ? 3.5 : 1.6, life: e.big ? .8 : .45, t: 0, col: e.side ? "#ff7a90" : "#7fd8ff" }); if (e.big) { G.shake = Math.max(G.shake, .5); sfx("spawnBig"); burst(e.x, e.y, 30, "#fff1c2", 5); } break;
        case "swing": G.swing.set(e.id, { t: G.river, to: e.to }); break;
        case "play": sfx("place"); if (e.side === 0) buzz(10); break;
        case "hit": {
          burst(e.x, e.y + (e.tower ? -1.6 : -.9), e.tower ? 3 : 2, e.tower ? "#ffd65c" : "#ffffff", 2);
          // no floating numbers: the fight stays readable; health bars tell the story
          if (e.tower) G.towerShake.set(e.id, .18); else G.jolt.set(e.id, G.river);
          sfx("hit"); break;
        }
        case "blast": blastFx(e); break;
        case "heal": break;
        case "launch": G.flies.push({ fx: e.fx, side: e.side, x0: e.fromX, y0: e.fromY, x1: e.x, y1: e.y, dur: e.dur, t: 0 }); sfx(e.fx === "nova" ? "whoosh" : "zap"); break;
        case "gas": burst(e.x, e.y, 10, "#9dff7a", 1.5); sfx("gas"); break;
        case "chain": G.fx.push({ k: "chain", pts: e.pts, life: .28, t: 0, seed: Math.random() * 1000 }); sfx("zap"); break;
        case "beam": G.beams.set(e.id, { to: e.to, ramp: e.ramp, until: G.S.time + .6 }); break;
        case "bolt": G.fx.push({ k: "bolt", x: e.x, y: e.y, life: .3, t: 0, seed: Math.random() * 1000 }); G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.4, life: .35, t: 0, col: "#fff6a0", fill: true }); sfx("zap"); break;
        case "bolts":
          for (const q of e.pts) { G.fx.push({ k: "bolt", x: q.x, y: q.y, life: .5, t: 0, seed: Math.random() * 1000, big: true }); burst(q.x, q.y, 12, "#fff6a0", 3); }
          G.fx.push({ k: "pillar", x: e.x, y: e.y, life: .7, t: 0 }); G.flash = .45; G.shake = Math.max(G.shake, .9); sfx("thunder"); buzz([40, 30, 60]);
          break;
        case "roots": burst(e.x, e.y, 6, "#6dff8a", 1); break;
        case "orbit": G.fx.push({ k: "ring", x: e.x, y: e.y, r: 2.1, life: .35, t: 0, col: "#c9b8ff" }); break;
        case "reveal": G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.6, life: .4, t: 0, col: "#e8e0ff", fill: true }); sfx("whoosh"); break;
        case "immune": { const now = G.S.time, last = G.immune.get(e.id) || -9; if (now - last > 2.5) { G.immune.set(e.id, now); G.nums.push({ x: e.x, y: e.y - .5, txt: "IMMUNE", life: .8, t: 0 }); } break; }
        case "death":
          if (e.tower) {
            G.shake = 1.1; G.flash = .55; burst(e.x, e.y, 80, e.side ? "#ff7a90" : "#7fd8ff", 7); burst(e.x, e.y, 40, "#fff1c2", 5);
            G.fx.push({ k: "ring", x: e.x, y: e.y, r: 6, life: .9, t: 0, col: "#fff1c2" });
            G.rubble = G.rubble || []; G.rubble.push({ x: e.x, y: e.y, big: e.tower === "throne", side: e.side });
            sfx("tower"); buzz(e.side === 0 ? [80, 40, 80] : [40]);
            banner(e.side === 1 ? "Tower down!" : "Tower lost", e.tower === "throne" ? "The Throne falls" : "", e.side === 0);
          } else { burst(e.x, e.y - .9, 18, e.side ? "#ff9aac" : "#9fe0ff", 3); G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.1, life: .35, t: 0, col: e.side ? "#ff9aac" : "#9fe0ff" }); sfx("die"); }
          break;
        case "phase": {
          const P = { rising: ["Rising", "DMT ×1.5 · units +15%"], peak: ["Peak", "DMT ×2 · units +30%"], overtime: ["Sudden death", "Next tower wins"] }[e.name];
          if (P) { banner(P[0], P[1]); sfx("phase"); buzz([30, 30, 30]); G.flash = .35; G.phase = e.name; }
          break;
        }
      }
    }
  }
  function mist(x, y) {
    for (let i = 0; i < 9 && G.parts.length < 420; i++) { const a = Math.random() * TAU, v = .3 + Math.random() * .9; G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .2, life: .6 + Math.random() * .4, t: 0, col: i % 3 ? "rgba(140,255,110,.55)" : "rgba(220,255,200,.7)", s: .1 + Math.random() * .08, smoke: true }); }
  }
  function burst(x, y, n, col, speed) {
    if (REDUCED) n = Math.min(n, 6);
    for (let i = 0; i < n && G.parts.length < 420; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * speed;
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .35 + Math.random() * .45, t: 0, col, s: .06 + Math.random() * .1 });
    }
  }
  function blastFx(e) {
    const C = { strike: "#fff6a0", nova: "#ff7ae6", halo: "#7dffb8", dust: "#bfeaff", burst: "#ffb05c", prime: "#ffffff", splash: "#ffc48a" }[e.fx] || "#ffffff";
    G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r + .3, life: e.fx === "splash" ? .3 : .6, t: 0, col: C, fill: e.fx !== "splash" });
    if (e.fx === "strike") G.fx.push({ k: "bolt", x: e.x, y: e.y, life: .35, t: 0, seed: Math.random() * 1000 });
    if (e.fx !== "splash") { burst(e.x, e.y, Math.round(e.r * 14), C, e.r * 2.2); G.shake = Math.max(G.shake, Math.min(.9, e.r * .25)); if (e.fx === "nova" || e.fx === "prime" || e.fx === "quake") G.flash = .25; }
    if (e.fx === "halo") sfx("heal"); else if (e.fx === "splash") sfx("hit"); else { sfx("blast"); buzz(25); }
  }
  function banner(t, sub, foe) {
    const b = $("[data-banner]"); b.innerHTML = `${t}${sub ? `<small>${sub}</small>` : ""}`; b.classList.toggle("foe", !!foe);
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
  /* ---------- the towers: fighting mushrooms with a crew on the cap, and the mystical tree ----------
     Each is painted once per screen size, then stamped; only the crew, the glows and the eye move. */
  const TAU = Math.PI * 2, OUT = "#0a0514";
  const PAL = [
    { cap: ["#0a2350", "#1c5fb4", "#7fdcff"], spot: "#e2f8ff", glow: "rgba(120,220,255,", leaf: ["#05202f", "#0d4f66", "#26a3bb", "#a6f4ff"], rune: "#7fe8ff" },
    { cap: ["#46040f", "#b0102c", "#ff7a6a"], spot: "#fff4e0", glow: "rgba(255,200,170,", leaf: ["#24040f", "#66102f", "#c8345f", "#ffb3c6"], rune: "#ff8aa8" },
  ];
  const towerArt = new Map();
  function art(key, w, h, ax, ay, paint) {
    const k = Math.max(8, Math.round(ts * dpr)), full = key + ":" + k;
    if (towerArt.has(full)) return towerArt.get(full);
    const c = document.createElement("canvas"); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    const g = c.getContext("2d"); g.scale(k, k); g.translate(ax, ay); g.lineJoin = "round"; g.lineCap = "round";
    paint(g);
    const out = { c, w, h, ax, ay }; towerArt.set(full, out); return out;
  }
  const stampArt = (a, x, y, sx = 1) => { if (sx === 1) ctx.drawImage(a.c, x - a.ax, y - a.ay, a.w, a.h); else { ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1); ctx.drawImage(a.c, -a.ax, -a.ay, a.w, a.h); ctx.restore(); } };
  const ell = (g, x, y, rx, ry, fill, line, lw = .04) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (line) { g.strokeStyle = line; g.lineWidth = lw; g.stroke(); } };
  function babyShroom(g, x, y, s, P) {
    g.fillStyle = "#e9dcbc"; g.strokeStyle = OUT; g.lineWidth = .03;
    g.beginPath(); g.moveTo(x - s * .18, y); g.lineTo(x - s * .12, y - s * .6); g.lineTo(x + s * .12, y - s * .6); g.lineTo(x + s * .18, y); g.closePath(); g.fill(); g.stroke();
    const cg = g.createRadialGradient(x - s * .2, y - s * .85, 0, x, y - s * .6, s * .6); cg.addColorStop(0, P.cap[2]); cg.addColorStop(1, P.cap[1]);
    g.fillStyle = cg; g.beginPath(); g.ellipse(x, y - s * .6, s * .5, s * .38, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    ell(g, x - s * .15, y - s * .78, s * .07, s * .05, P.spot);
  }
  function mushroomArt(side) {
    return art("mush" + side, 3.8, 4, 1.9, 3.55, g => {
      const P = PAL[side];
      ell(g, 0, .1, 1.45, .4, "rgba(0,0,0,.5)");
      // moss at the foot
      for (const [mx, my, mr] of [[-.75, .05, .32], [.7, .08, .3], [0, .16, .4]]) { const mg = g.createRadialGradient(mx, my, 0, mx, my, mr); mg.addColorStop(0, "rgba(90,170,80,.9)"); mg.addColorStop(1, "rgba(40,90,40,0)"); g.fillStyle = mg; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2); }
      // the stem: pale, fibrous, with a door and a lit window
      const sg = g.createLinearGradient(-.62, 0, .62, 0); sg.addColorStop(0, "#8f7752"); sg.addColorStop(.32, "#f5ead0"); sg.addColorStop(.68, "#ddc9a0"); sg.addColorStop(1, "#7d6543");
      g.beginPath(); g.moveTo(-.64, .06); g.bezierCurveTo(-.5, -.6, -.36, -1.15, -.42, -1.7); g.lineTo(.42, -1.7); g.bezierCurveTo(.36, -1.15, .5, -.6, .64, .06); g.quadraticCurveTo(0, .24, -.64, .06); g.closePath();
      g.fillStyle = sg; g.fill(); g.strokeStyle = OUT; g.lineWidth = .06; g.stroke();
      g.strokeStyle = "rgba(110,86,52,.4)"; g.lineWidth = .025;
      for (const fx of [-.4, -.2, .02, .2, .38]) { g.beginPath(); g.moveTo(fx * 1.15, .05); g.quadraticCurveTo(fx * .9, -.8, fx * .85, -1.65); g.stroke(); }
      g.fillStyle = "#3a2212"; g.beginPath(); g.moveTo(-.2, .1); g.lineTo(-.2, -.3); g.arc(0, -.3, .2, Math.PI, 0); g.lineTo(.2, .1); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = .04; g.stroke();
      g.strokeStyle = "#5c3a1e"; g.lineWidth = .025; g.beginPath(); g.moveTo(0, -.48); g.lineTo(0, .1); g.stroke();
      ell(g, .12, -.12, .03, .03, "#ffd27a");
      const wg = g.createRadialGradient(.14, -.98, 0, .14, -.98, .3); wg.addColorStop(0, "rgba(255,210,120,.6)"); wg.addColorStop(1, "rgba(255,210,120,0)"); g.fillStyle = wg; g.fillRect(-.2, -1.3, .7, .7);
      ell(g, .14, -.98, .12, .12, "#ffcf6a", OUT, .04);
      g.strokeStyle = "#5c3a1e"; g.lineWidth = .025; g.beginPath(); g.moveTo(.02, -.98); g.lineTo(.26, -.98); g.moveTo(.14, -1.1); g.lineTo(.14, -.86); g.stroke();
      // a vine climbing the stem
      g.strokeStyle = "#2f8a3e"; g.lineWidth = .05; g.beginPath(); g.moveTo(-.58, .02); g.bezierCurveTo(-.1, -.3, -.6, -.75, -.2, -1.1); g.bezierCurveTo(.1, -1.35, .3, -1.4, .38, -1.66); g.stroke();
      for (const [lx, ly, la] of [[-.4, -.2, -.6], [-.38, -.72, .8], [-.05, -1.2, -.4], [.3, -1.48, .9]]) { g.save(); g.translate(lx, ly); g.rotate(la); ell(g, .07, 0, .08, .04, "#4fc25e", OUT, .02); g.restore(); }
      // the frilled ring
      g.fillStyle = "#f8f0dc"; g.strokeStyle = OUT; g.lineWidth = .035; g.beginPath(); g.moveTo(-.46, -1.36);
      for (let i = 0; i <= 8; i++) { const fx = -.46 + i * .115; g.quadraticCurveTo(fx - .05, -1.16 + (i % 2) * .05, fx, -1.24); }
      g.lineTo(.46, -1.42); g.quadraticCurveTo(0, -1.5, -.46, -1.42); g.closePath(); g.fill(); g.stroke();
      // the gills under the cap
      ell(g, 0, -1.76, 1.5, .34, "#6a4e38", OUT, .04);
      g.strokeStyle = "rgba(40,24,14,.6)"; g.lineWidth = .022;
      for (let i = 0; i < 26; i++) { const a = Math.PI + (i / 25) * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * .42, -1.76 + Math.sin(a) * .1 * -1 + .02); g.lineTo(Math.cos(a) * 1.45, -1.76 - Math.sin(a) * .3); g.stroke(); }
      // the cap: a great dome, lit from the upper left, spotted
      const cap = () => { g.beginPath(); g.moveTo(-1.62, -1.78); g.bezierCurveTo(-1.7, -2.75, -.85, -3.45, 0, -3.45); g.bezierCurveTo(.85, -3.45, 1.7, -2.75, 1.62, -1.78); g.quadraticCurveTo(0, -1.4, -1.62, -1.78); g.closePath(); };
      const cg = g.createRadialGradient(-.45, -3.0, .1, 0, -2.4, 1.9); cg.addColorStop(0, P.cap[2]); cg.addColorStop(.5, P.cap[1]); cg.addColorStop(1, P.cap[0]);
      cap(); g.fillStyle = cg; g.fill();
      g.save(); cap(); g.clip();
      for (const [sx2, sy, sr] of [[-.95, -2.25, .22], [-.32, -2.9, .26], [.52, -2.72, .23], [1.1, -2.15, .17], [.08, -2.3, .15], [-1.32, -1.95, .11], [.88, -3.08, .13], [-.7, -3.15, .12], [.45, -2.05, .1]]) {
        if (side === 0) { const sgl = g.createRadialGradient(sx2, sy, 0, sx2, sy, sr * 2.2); sgl.addColorStop(0, P.glow + ".55)"); sgl.addColorStop(1, P.glow + "0)"); g.fillStyle = sgl; g.fillRect(sx2 - sr * 2.2, sy - sr * 2.2, sr * 4.4, sr * 4.4); }
        ell(g, sx2, sy, sr, sr * .72, P.spot); ell(g, sx2 - sr * .25, sy - sr * .25, sr * .35, sr * .22, "rgba(255,255,255,.7)");
      }
      const rim = g.createLinearGradient(0, -2.2, 0, -1.5); rim.addColorStop(0, "rgba(0,0,0,0)"); rim.addColorStop(1, "rgba(0,0,0,.45)"); g.fillStyle = rim; g.fillRect(-2, -2.2, 4, 1);
      g.restore();
      g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = .06; g.beginPath(); g.moveTo(-1.35, -2.35); g.bezierCurveTo(-1.2, -2.9, -.7, -3.25, -.15, -3.32); g.stroke();
      cap(); g.strokeStyle = OUT; g.lineWidth = .07; g.stroke();
      // little mushrooms at the foot
      for (const [mx, ms] of [[-1.05, .42], [1.0, .34], [-.78, .26], [1.28, .22]]) babyShroom(g, mx, .14, ms, P);
    });
  }
  function treeArt(side) {
    return art("tree" + side, 5, 5.4, 2.5, 4.7, g => {
      const P = PAL[side];
      ell(g, 0, .12, 2.0, .55, "rgba(0,0,0,.5)");
      const stone = (sx, sy, sc) => { g.fillStyle = "#4a4458"; g.strokeStyle = OUT; g.lineWidth = .035; g.beginPath(); roundRect(g, sx - .12 * sc, sy - .34 * sc, .24 * sc, .36 * sc, .06 * sc); g.fill(); g.stroke(); g.fillStyle = "#6a6280"; g.fillRect(sx - .1 * sc, sy - .32 * sc, .08 * sc, .3 * sc); ell(g, sx, sy - .18 * sc, .04 * sc, .05 * sc, P.rune); };
      const ring = [...Array(8).keys()].map(i => { const a = i / 8 * TAU + .2; return [Math.cos(a) * 1.8, .05 + Math.sin(a) * .55, 1 + Math.sin(a) * .15]; });
      for (const [sx2, sy, sc] of ring) if (sy < .05) stone(sx2, sy, sc);
      // roots, gripping the ground
      for (const [ex, ey, cx2] of [[-1.55, .2, -.7], [1.5, .25, .8], [-.9, .4, -.3], [.95, .42, .4], [-1.8, -.05, -1], [1.75, -.02, 1.1]]) {
        for (const [w, col] of [[.24, OUT], [.17, "#4a2c18"], [.06, "#7a5232"]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(ex * .2, -.15); g.quadraticCurveTo(cx2, -.05, ex, ey); g.stroke(); }
      }
      // the trunk, twisting up, threaded with a glowing rune
      const trunk = () => { g.beginPath(); g.moveTo(-.62, .02); g.bezierCurveTo(-.3, -.6, -.62, -1.3, -.3, -2.0); g.lineTo(.34, -2.0); g.bezierCurveTo(.6, -1.3, .3, -.6, .62, .02); g.quadraticCurveTo(0, .16, -.62, .02); g.closePath(); };
      const tg = g.createLinearGradient(-.6, 0, .6, 0); tg.addColorStop(0, "#24140a"); tg.addColorStop(.4, "#6b4428"); tg.addColorStop(.7, "#4a2e1a"); tg.addColorStop(1, "#1e1008");
      trunk(); g.fillStyle = tg; g.fill();
      g.save(); trunk(); g.clip();
      g.strokeStyle = "rgba(20,10,4,.55)"; g.lineWidth = .035;
      for (const bx of [-.35, -.15, .08, .3]) { g.beginPath(); g.moveTo(bx * 1.4, .05); g.bezierCurveTo(bx + .2, -.6, bx - .2, -1.3, bx * .6, -2); g.stroke(); }
      g.strokeStyle = P.rune; g.globalAlpha = .35; g.lineWidth = .12; g.beginPath(); for (let i = 0; i <= 30; i++) { const ty = -i / 30 * 2, tx = Math.sin(i / 30 * TAU * 1.5) * (.45 - i / 30 * .15); i ? g.lineTo(tx, ty) : g.moveTo(tx, ty); } g.stroke();
      g.globalAlpha = 1; g.lineWidth = .035; g.stroke();
      g.restore();
      trunk(); g.strokeStyle = OUT; g.lineWidth = .06; g.stroke();
      // branches into the canopy
      for (const [bx, by, cx2, cy] of [[-1.45, -2.75, -.8, -2.1], [1.45, -2.75, .8, -2.1], [-.5, -3.3, -.3, -2.6], [.55, -3.3, .3, -2.6]]) {
        for (const [w, col] of [[.2, OUT], [.14, "#4a2c18"], [.05, "#7a5232"]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(bx * .15, -1.95); g.quadraticCurveTo(cx2, cy, bx, by); g.stroke(); }
      }
      // the eye in the hollow of the trunk
      g.fillStyle = "#0e0604"; g.strokeStyle = "#8a6038"; g.lineWidth = .04; g.beginPath(); g.moveTo(-.3, -1.05); g.quadraticCurveTo(0, -1.3, .3, -1.05); g.quadraticCurveTo(0, -.82, -.3, -1.05); g.closePath(); g.fill(); g.stroke();
      // the canopy: clusters of glowing leaves, outlined as one crown
      const CL = [[-1.75, -2.45, .48], [1.75, -2.45, .48], [-1.35, -2.95, .68], [1.35, -2.95, .68], [-.75, -3.55, .74], [.75, -3.55, .74], [0, -4.0, .72], [0, -3.1, .8], [-.9, -2.55, .55], [.9, -2.55, .55]];
      for (const [cx2, cy, r] of CL) ell(g, cx2, cy, r + .07, r * .86 + .07, OUT);
      for (const [cx2, cy, r] of CL) {
        const lg = g.createRadialGradient(cx2 - r * .35, cy - r * .4, r * .1, cx2, cy, r); lg.addColorStop(0, P.leaf[2]); lg.addColorStop(.6, P.leaf[1]); lg.addColorStop(1, P.leaf[0]);
        ell(g, cx2, cy, r, r * .86, lg);
      }
      let sd = 5 + side; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) { const [cx2, cy, r] = CL[Math.floor(rr() * CL.length)]; const a = rr() * TAU, d = rr() * r * .85; g.globalAlpha = .25 + rr() * .5; ell(g, cx2 + Math.cos(a) * d, cy + Math.sin(a) * d * .8, .07, .045, P.leaf[3]); }
      g.globalAlpha = 1;
      // hanging vines
      g.strokeStyle = P.leaf[1]; g.lineWidth = .04;
      for (const [vx, vl] of [[-1.5, .6], [-.6, .45], [.4, .55], [1.3, .7], [1.85, .4]]) { g.beginPath(); g.moveTo(vx, -2.3); g.quadraticCurveTo(vx + .1, -2.3 + vl / 2, vx, -2.3 + vl); g.stroke(); }
      for (const [sx2, sy, sc] of ring) if (sy >= .05) stone(sx2, sy, sc);
    });
  }
  const ORBS = [[-1.5, -1.68], [-.6, -1.83], [.4, -1.73], [1.3, -1.58], [1.85, -1.88]];

  // words in the site's pixel face; figures in its number face, which can't be misread
  let FONT = "system-ui", NUMFONT = "system-ui";
  try { document.fonts.load('700 20px "Space Grotesk"').then(() => { NUMFONT = '"Space Grotesk", system-ui'; }); } catch { /* old browser */ }
  /* text is drawn in real pixels: a font scaled down to a fraction of a pixel draws badly */
  function txt(str, x, y, size, fill, stroke) {
    const k = ts * dpr; ctx.save(); ctx.translate(x, y); ctx.scale(1 / k, 1 / k);
    ctx.font = `700 ${Math.max(8, Math.round(size * k))}px ${typeof str === "number" || /^-?\d+$/.test(str) ? NUMFONT : FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    if (stroke) { ctx.lineWidth = stroke * k; ctx.strokeStyle = "#0a0514"; ctx.strokeText(str, 0, 0); }
    ctx.fillStyle = fill; ctx.fillText(str, 0, 0); ctx.restore();
  }
  try { document.fonts.load('700 20px "Pixelify Sans"').then(() => { FONT = '"Pixelify Sans", system-ui'; }); } catch { /* old browser */ }
  /* units look bigger than the space they take, so a phone can read them */
  const vis = r => Math.max(1.05, r * 2.25);

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
    ctx.scale(dpr * ts, dpr * ts); ctx.translate(OX, OY);
    drawRiver(S);
    drawZone();
    // rubble where towers stood
    for (const r of G.rubble || []) drawRubble(r);
    // towers, then ground units by depth, then flyers, then shots
    const ents = S.ents.slice().sort((a, b) => a.y - b.y);
    drawZones(S);
    for (const e of ents) if (e.kind === "tower") drawTower(e, alpha, dt);
    for (const e of ents) if (e.kind === "unit" && !e.air) drawUnit(e, alpha);
    for (const e of ents) if (e.kind === "unit" && e.air) drawUnit(e, alpha);
    drawBeams(S, alpha);
    for (const s of S.shots) drawShot(s, alpha);
    drawFx(dt);
    drawGhost();
    // the flash of something big
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${G.flash * .5})`; ctx.fillRect(-OX, -OY, VW, VH); G.flash = Math.max(0, G.flash - dt * 1.6); }
  }
  let riverGrad = null, riverKey = "";
  function drawRiver(S) {
    const R = A.RIVER, t = G.river;
    const col = G.phase === "peak" || G.phase === "overtime" ? ["#ff9ad8", "#fff1c2"] : G.phase === "rising" ? ["#e05cff", "#ff7ae6"] : ["#7a3cff", "#c56bff"];
    if (riverKey !== col[0]) { riverKey = col[0]; riverGrad = ctx.createLinearGradient(0, R - 1, 0, R + 1); riverGrad.addColorStop(0, "rgba(10,4,24,.9)"); riverGrad.addColorStop(.5, col[0] + "55"); riverGrad.addColorStop(1, "rgba(10,4,24,.9)"); }
    ctx.fillStyle = riverGrad; ctx.fillRect(-OX, R - 1, VW, 2);
    const st = streak(col[1]);
    for (let k = 0; k < 14; k++) {
      const y = R - .8 + ((k * 0.37) % 1.6), speed = .8 + (k % 5) * .25, len = 1.2 + (k % 3) * .7;
      const x = ((t * speed * 2 + k * 3.7) % (VW + len * 2)) - len - OX;
      ctx.drawImage(st, x, y - .06, len, .12 + (k % 3) * .04);
    }
    ctx.strokeStyle = col[1] + "55"; ctx.lineWidth = .18;
    ctx.beginPath(); ctx.moveTo(-OX, R - 1); ctx.lineTo(VW - OX, R - 1); ctx.moveTo(-OX, R + 1); ctx.lineTo(VW - OX, R + 1); ctx.stroke();
    ctx.strokeStyle = col[1] + "cc"; ctx.lineWidth = .05; ctx.stroke();
    const bs = bridge(), fl = .8 + Math.sin(t * 7) * .1 + Math.sin(t * 13) * .06;
    for (const bx of A.BRIDGES) {
      ctx.drawImage(bs, bx - 1.3, R - 1.5, 2.6, 3);
      for (const [lx, ly] of [[bx - 1, R - 1.2], [bx + 1, R - 1.2], [bx - 1, R + 1.2], [bx + 1, R + 1.2]]) stamp("#ffd27a", lx, ly, .45 * fl);
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
    const T = TEAM[e.side], throne = e.tower === "throne", t = G.river, P = PAL[e.side];
    let sx = 0; const shk = G.towerShake.get(e.id) || 0;
    if (shk > 0) { sx = (Math.random() - .5) * .18; G.towerShake.set(e.id, shk - dt); }
    const x = e.x + sx, y = e.y + .4;
    let top;
    if (throne) {
      stampArt(treeArt(e.side), x, y);
      // the eye wakes and watches; lanterns glow in the branches
      const blink = (t + e.id) % 5 < .12 ? .2 : 1;
      ctx.globalAlpha = .9; stamp(P.rune, x, y - 1.05, .42 + Math.sin(t * 3) * .05); ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(x, y - 1.05, .1, .1 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(x, y - 1.05, .035, .08 * blink, 0, 0, TAU); ctx.fill();
      ORBS.forEach(([ox, oy], i) => { const tw = .7 + Math.sin(t * 2.5 + i * 1.7) * .3; stamp(i % 2 ? "#ffd27a" : P.rune, x + ox, y + oy + Math.sin(t * 1.5 + i) * .04, .28 * tw); });
      if (Math.random() < .08) G.parts.push({ x: x + (Math.random() - .5) * 3.4, y: y - 2.2 - Math.random() * 1.6, vx: (Math.random() - .5) * .2, vy: -.35, life: 1.6, t: 0, col: P.leaf[3], s: .05 });
      top = y - 4.75;
    } else {
      stampArt(mushroomArt(e.side), x, y);
      if (e.side === 0) { ctx.globalAlpha = .35 + Math.sin(t * 2 + e.id) * .15; stamp(P.rune, x, y - 2.6, 1.3); ctx.globalAlpha = 1; }
      // the cap breathes green mist, and flares when it spits plasma
      const fired = G.crewFire.get(e.id), since = fired == null ? 9 : t - fired, flare = since < .3 ? 1 - since / .3 : 0;
      ctx.globalAlpha = .25 + Math.sin(t * 3 + e.id) * .08 + flare * .5; stamp("#5dff6a", x, y - 3.15, .9 + flare * .7); ctx.globalAlpha = 1;
      if (Math.random() < .12 + flare * .6) G.parts.push({ x: x + (Math.random() - .5) * 1.2, y: y - 3.1, vx: (Math.random() - .5) * .3, vy: -.35 - Math.random() * .3, life: .9, t: 0, col: "rgba(140,255,110,.45)", s: .1, smoke: true });
      top = y - 3.75;
    }
    // health: above your towers, below theirs (theirs sit at the top edge)
    const w = throne ? 2.6 : 2, bh = .56, k = Math.max(0, e.hp / e.max);
    const hy = e.side === 0 ? top - .75 : y + .5;
    ctx.fillStyle = "#000"; ctx.fillRect(x - w / 2 - .08, hy - .08, w + .16, bh + .16);
    ctx.fillStyle = "#e3ba5c"; ctx.fillRect(x - w / 2 - .08, hy - .08, w + .16, .06); ctx.fillRect(x - w / 2 - .08, hy + bh + .02, w + .16, .06);
    ctx.fillRect(x - w / 2 - .08, hy - .08, .06, bh + .16); ctx.fillRect(x + w / 2 + .02, hy - .08, .06, bh + .16);
    if (k > 0) {
      ctx.fillStyle = T.deep; ctx.fillRect(x - w / 2, hy, w * k, bh);
      ctx.fillStyle = T.main; ctx.fillRect(x - w / 2, hy, w * k, bh * .62);
      ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(x - w / 2, hy, w * k, .08);
    }
    txt(Math.max(0, Math.ceil(e.hp)), x, hy + bh / 2 + .02, .5, "#fff", .1);
    if (throne) { ctx.save(); ctx.translate(x - w / 2 - .42, hy + .26); ctx.fillStyle = "#f6cf6a"; ctx.strokeStyle = "#2a1306"; ctx.lineWidth = .05; ctx.beginPath(); ctx.moveTo(-.26, .18); ctx.lineTo(-.3, -.14); ctx.lineTo(-.13, 0); ctx.lineTo(0, -.22); ctx.lineTo(.13, 0); ctx.lineTo(.3, -.14); ctx.lineTo(.26, .18); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore(); }
  }
  function drawRubble(r) {
    const s = r.big ? 1.5 : 1.1;
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(r.x, r.y + s * .5, s, s * .45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a3448";
    for (let k = 0; k < 6; k++) { const a = k * 1.1, d = s * (.25 + (k % 3) * .2); ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d * .5, s * .22, 0, Math.PI * 2); ctx.fill(); }
    if (Math.random() < .05) G.parts.push({ x: r.x + (Math.random() - .5), y: r.y, vx: 0, vy: -.6, life: 1.2, t: 0, col: "rgba(160,150,180,.5)", s: .18, smoke: true });
  }
  function drawUnit(e, alpha) {
    const p = pos(e.id, e.x, e.y, alpha), T = TEAM[e.side], t = G.river, st = e.style;
    const wake0 = st === "descend" || st === "prime" ? 1.3 : 1;
    const born = Math.min(1, wake0 - Math.max(0, e.wake));
    let scale = e.wake > 0 ? .55 + .45 * Math.min(1, born * 1.6) : 1, drop = 0;
    // a God falls from the sky in a pillar of light
    if ((st === "descend" || st === "prime") && e.wake > 0) {
      const k = Math.max(0, e.wake) / wake0; drop = k * k * 9; scale = 1 + k * .4;
      ctx.globalAlpha = .35 + .4 * (1 - k); stamp("#fff1c2", p.x, p.y, 1.6 + k * 1.5); ctx.globalAlpha = 1;
      const lg = ctx.createLinearGradient(0, p.y - 12, 0, p.y); lg.addColorStop(0, "rgba(255,241,194,0)"); lg.addColorStop(1, "rgba(255,241,194,.55)");
      ctx.fillStyle = lg; ctx.fillRect(p.x - .5 - k * .3, p.y - 12, 1 + k * .6, 12);
    }
    const vr = vis(e.r);
    // how it moves: walkers hop and sway, flyers and Entities float, everyone breathes; it faces where it goes
    const gt = G.gait.get(e.id) || { x: p.x, y: p.y, ph: e.id, face: 1, still: 0 };
    const dx = p.x - gt.x, dy = p.y - gt.y, moved = Math.hypot(dx, dy);
    gt.ph += moved * 6.5; gt.still = moved > .002 ? 0 : gt.still + 1; gt.x = p.x; gt.y = p.y; G.gait.set(e.id, gt);
    const walking = gt.still < 3 && e.wake <= 0, floats = e.air || e.ethereal || st === "beam";
    let lift = 0, rot = 0, sy = 1;
    if (floats) { lift = (e.air ? .75 : .3) + Math.sin(t * 3 + e.id) * .14; rot = Math.sin(t * 1.7 + e.id) * .06; }
    else if (walking) { lift = Math.abs(Math.sin(gt.ph)) * .24; rot = Math.sin(gt.ph) * .08; sy = 1 + Math.cos(gt.ph * 2) * .045; }
    else sy = 1 + Math.sin(t * 2.6 + e.id) * .028;
    // the lunge of an attack, and a flinch when struck
    let lx = 0, ly = 0;
    const sw = G.swing.get(e.id);
    if (sw && t - sw.t < .22) { const tg = G.S.ents.find(q => q.id === sw.to), k = Math.sin((t - sw.t) / .22 * Math.PI); if (tg) { const d = Math.hypot(tg.x - p.x, tg.y - p.y) || 1; lx = (tg.x - p.x) / d * k * .32; ly = (tg.y - p.y) / d * k * .32; } sy *= 1 + k * .06; }
    const jt = G.jolt.get(e.id); if (jt != null && t - jt < .12) lx += (Math.random() - .5) * .14;
    const fx = p.x + lx, fy = p.y + ly - drop;
    const w = vr * 2 * scale, h = vr * 2 * scale;
    // shadow and the team's ring on the ground
    const sh = Math.max(.35, 1 - lift * .35);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(p.x + lx, p.y + ly, w * .3 * sh, .2 * sh, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = T.main; ctx.globalAlpha = .75; ctx.lineWidth = .07; ctx.beginPath(); ctx.ellipse(p.x + lx, p.y + ly, w * .34, .22, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    if (G.S.time < e.rootUntil) { ctx.strokeStyle = "#5fe07a"; ctx.lineWidth = .08; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + t; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * w * .25, p.y - .1, .35, Math.PI, Math.PI * 1.9); ctx.stroke(); } }
    let a0 = e.wake > 0 ? .55 + .45 * Math.min(1, born) : 1;
    if (e.cloaked) a0 = e.side === 0 ? .35 + Math.sin(t * 5) * .1 : .14 + Math.sin(t * 5) * .06;   // you see your phantom faintly; they barely see theirs
    const cy = fy - lift - h * .45;                                                            // the middle of the body
    if (e.ethereal) { a0 *= .75; ctx.globalAlpha = .4 + Math.sin(t * 3 + e.id) * .15; stamp("#c9a8ff", fx, cy, h * .8); }
    ctx.globalAlpha = a0;
    // the being in its medallion, hopping, floating or breathing
    const spr = sprite(e.def, e.side, vr), size = vr * 3;
    ctx.save(); ctx.translate(fx, cy); ctx.rotate(rot); ctx.scale(scale, sy * scale);
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (e.ethereal) { ctx.strokeStyle = `rgba(214,190,255,${.5 + Math.sin(t * 4 + e.id) * .3})`; ctx.lineWidth = .06; ctx.setLineDash([.2, .15]); ctx.beginPath(); ctx.ellipse(fx, cy, w * .55, h * .58, 0, t % 6.28, t % 6.28 + 6); ctx.stroke(); ctx.setLineDash([]); }
    if (st === "orbit" && e.wake <= 0) for (let k = 0; k < 3; k++) { const a = t * 2.4 + k * 2.094; stamp("#d9ccff", fx + Math.cos(a) * 1.4, cy + Math.sin(a) * .7, .22); }
    if (e.frozen) { ctx.fillStyle = "rgba(190,235,255,.45)"; ctx.beginPath(); ctx.ellipse(fx, cy, w * .5, h * .55, 0, 0, TAU); ctx.fill(); }
    else if (e.chilled) { ctx.strokeStyle = "rgba(170,225,255,.85)"; ctx.lineWidth = .07; ctx.beginPath(); ctx.ellipse(fx, cy, w * .5, h * .55, 0, 0, TAU); ctx.stroke(); }
    if (e.burn && G.S.time < e.burn.until && Math.random() < .35) G.parts.push({ x: fx + (Math.random() - .5) * w * .6, y: cy, vx: 0, vy: -1.2, life: .4, t: 0, col: Math.random() < .5 ? "#ff9a3c" : "#ffd24a", s: .09 });
    if (e.poison && G.S.time < e.poison.until && Math.random() < .25) G.parts.push({ x: fx + (Math.random() - .5) * w * .6, y: cy, vx: 0, vy: -.6, life: .5, t: 0, col: "#8dff5a", s: .07 });
    if (e.wake > 0 && !drop) { ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = .07; ctx.beginPath(); ctx.ellipse(p.x, p.y, w * .4, .26, 0, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - Math.max(0, e.wake) / wake0)); ctx.stroke(); }
    // health and shield, over its head
    if (e.hp < e.max || e.shield > 0) {
      const bw = Math.max(1, Math.min(1.6, w * .7)), by = fy - lift - h + .05;
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(fx - bw / 2 - .03, by - .03, bw + .06, .2);
      ctx.fillStyle = e.ethereal ? "#c9a8ff" : T.main; ctx.fillRect(fx - bw / 2, by, bw * Math.max(0, e.hp / e.max), .14);
      if (e.shield > 0) { ctx.fillStyle = "#ffe58a"; ctx.fillRect(fx - bw / 2, by - .1, bw * Math.min(1, e.shield / e.max), .07); }
    }
  }
  /* toxic clouds: layered puffs that drift and fade */
  function drawZones(S) {
    for (const z of S.zones) {
      const left = z.until - S.time, a = Math.min(1, left / .8) * .55;
      for (let k = 0; k < 6; k++) {
        const ang = G.river * .7 + k * 1.05 + z.id, d = z.r * .45;
        ctx.globalAlpha = a; stamp(k % 2 ? "#7dff5a" : "#b06bff", z.x + Math.cos(ang) * d, z.y + Math.sin(ang) * d * .7, z.r * .75);
      }
      ctx.globalAlpha = a * .8; ctx.strokeStyle = "#9dff7a"; ctx.lineWidth = .04; ctx.setLineDash([.15, .2]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (Math.random() < .3) G.parts.push({ x: z.x + (Math.random() - .5) * z.r * 1.4, y: z.y + (Math.random() - .5) * z.r, vx: 0, vy: -.3, life: .9, t: 0, col: "rgba(150,255,120,.55)", s: .12, smoke: true });
    }
  }
  /* tractor beams: thicker and whiter the longer they hold */
  function drawBeams(S, alpha) {
    for (const [id, b] of G.beams) {
      if (S.time > b.until) { G.beams.delete(id); continue; }
      const a = S.ents.find(e => e.id === id), t = S.ents.find(e => e.id === b.to);
      if (!a || !t) { G.beams.delete(id); continue; }
      const pa = pos(a.id, a.x, a.y, alpha), pt0 = pos(t.id, t.x, t.y, alpha), pt = { x: pt0.x, y: pt0.y + bodyY(t) }, ay = pa.y + bodyY(a);
      const k = (b.ramp - 1) / 2, col = k > .6 ? "#ffffff" : k > .3 ? "#ffd27a" : TEAM[a.side].main;
      ctx.lineCap = "round";
      ctx.strokeStyle = col + "55"; ctx.lineWidth = .35 + k * .35; ctx.beginPath(); ctx.moveTo(pa.x, ay); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = .08 + k * .12; ctx.beginPath(); ctx.moveTo(pa.x, ay); ctx.lineTo(pt.x + Math.sin(G.river * 40) * .05, pt.y); ctx.stroke();
      stamp(col, pt.x, pt.y, .35 + k * .4);
    }
  }
  /* shots leave from the body that fired them (a cap, an eye, a chest) and strike the body they hit */
  const bodyY = e => !e ? 0 : e.kind === "tower" ? (e.tower === "throne" ? -1.2 : -1.8) : e.air ? -1.8 : -.95;
  function drawShot(s, alpha) {
    const T = TEAM[s.side], p = pos("s" + s.id, s.x, s.y, alpha);
    let from = G.shotFrom.get(s.id);
    if (from === undefined) { const a = G.S.ents.find(e => e.id === s.from), tg0 = G.S.ents.find(e => e.id === s.to); from = { ox: 0, oy: bodyY(a), d0: tg0 ? Math.max(.5, Math.hypot(tg0.x - s.x, tg0.y - s.y)) : 1, look: null }; G.shotFrom.set(s.id, from); }
    if (!from) return;
    const tg = G.S.ents.find(e => e.id === s.to), d = tg ? Math.hypot(tg.x - p.x, tg.y - p.y) : 0, k = Math.max(0, Math.min(1, d / from.d0));
    const q = { x: p.x + from.ox * k, y: p.y + from.oy * k + bodyY(tg) * (1 - k) };
    const ang = tg ? Math.atan2(tg.y + bodyY(tg) - q.y, tg.x - q.x) : 0;
    from.last = q;
    if (from.look === "plasma") {
      for (let i = 4; i >= 1; i--) { const bx = q.x - Math.cos(ang) * i * .22, by = q.y - Math.sin(ang) * i * .22; ctx.globalAlpha = .5 - i * .1; stamp("#5dff6a", bx, by, .38 - i * .05); }
      ctx.globalAlpha = 1; stamp("#5dff6a", q.x, q.y, .55); stamp("#d8ffcc", q.x, q.y, .22);
      if (Math.random() < .5) G.parts.push({ x: q.x, y: q.y, vx: (Math.random() - .5) * .4, vy: -.2, life: .5, t: 0, col: "rgba(140,255,110,.5)", s: .09, smoke: true });
      return;
    }
    if (from.look === "eye") { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang); ctx.drawImage(streak(T.main), -.8, -.1, .9, .2); ctx.restore(); stamp(T.main, q.x, q.y, .42); stamp("#ffffff", q.x, q.y, .16); return; }
    const col = { gas: "#8dff5a", frost: "#bfeaff", fire: "#ff9a3c", acid: "#a6ff4a", drain: "#ff4a6a", burst: "#ffb05c", cloak: "#e8e0ff", roots: "#6dff8a", caster: "#e9a8ff", support: "#9dffcf" }[s.kind] || T.main;
    const len = s.kind === "caster" ? .7 : .55;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang); ctx.drawImage(streak(col.length === 7 ? col : "#ffffff"), -len, -.07, len + .05, .14); ctx.restore();
    const r = s.kind === "gas" ? .3 : s.kind === "caster" || s.kind === "burst" ? .24 : .15;
    stamp(col, q.x, q.y, r * 2.2);
  }
  function drawFlies(dt) {
    for (const f of G.flies) {
      f.t += dt; const k = Math.min(1, f.t / f.dur), T = TEAM[f.side];
      if (f.fx === "nova") {
        // a burning star arcs high over the arena and comes down on the mark
        const d = Math.hypot(f.x1 - f.x0, f.y1 - f.y0), hgt = 1.5 + d * .22;
        const at = q => ({ x: lerp(f.x0, f.x1, q), y: lerp(f.y0, f.y1, q) - Math.sin(Math.PI * q) * hgt, gy: lerp(f.y0, f.y1, q) });
        ctx.globalAlpha = .45 + .4 * Math.sin(G.river * 10); ctx.strokeStyle = "#ff7ae6"; ctx.lineWidth = .07; ctx.setLineDash([.3, .2]);
        ctx.beginPath(); ctx.arc(f.x1, f.y1, 2.8 * (.6 + .4 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        const h = at(k);
        ctx.fillStyle = `rgba(0,0,0,${.15 + .3 * k})`; ctx.beginPath(); ctx.ellipse(h.x, h.gy, .5 + k * .6, .2 + k * .25, 0, 0, TAU); ctx.fill();
        for (let i = 16; i >= 1; i--) { const q = at(Math.max(0, k - i * .018)); ctx.globalAlpha = (1 - i / 17) * .85; stamp(i % 3 ? "#ff7ae6" : "#ffd1ff", q.x, q.y, 1.1 * (1 - i / 18)); }
        ctx.globalAlpha = 1; stamp("#ff7ae6", h.x, h.y, 1.7); stamp("#ffd1ff", h.x, h.y, 1.0); stamp("#ffffff", h.x, h.y, .55);
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(G.river * 6); ctx.strokeStyle = "#fff6ff"; ctx.lineWidth = .07;
        ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * .9, Math.sin(a) * .9); } ctx.stroke(); ctx.restore();
        if (Math.random() < .7) G.parts.push({ x: h.x, y: h.y, vx: (Math.random() - .5) * 1.5, vy: (Math.random() - .5) * 1.5, life: .5, t: 0, col: Math.random() < .5 ? "#ffd1ff" : "#ff7ae6", s: .08 });
      } else {
        // lightning gathers: a mark on the ground and a light coming down
        ctx.globalAlpha = .5 + .5 * k; ctx.strokeStyle = "#fff6a0"; ctx.lineWidth = .08;
        ctx.beginPath(); ctx.arc(f.x1, f.y1, 1.4 * (1.4 - .4 * k), 0, TAU); ctx.stroke();
        ctx.globalAlpha = .25 * k; ctx.fillStyle = "#fff6c8"; ctx.fillRect(f.x1 - .25, f.y1 - 14, .5, 14); ctx.globalAlpha = 1;
      }
    }
    G.flies = G.flies.filter(f => f.t < f.dur);
  }
  function drawFx(dt) {
    drawFlies(dt);
    for (const f of G.fx) {
      f.t += dt; const k = f.t / f.life;
      if (f.k === "ring") {
        ctx.globalAlpha = Math.max(0, 1 - k);
        if (f.fill) { ctx.globalAlpha = Math.max(0, (1 - k) * .5); stamp(f.col, f.x, f.y, Math.max(.01, f.r * k)); ctx.globalAlpha = Math.max(0, 1 - k); }
        ctx.strokeStyle = f.col; ctx.lineWidth = .12 * (1 - k) + .02; ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(.01, f.r * (.2 + .8 * k)), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (f.k === "chain") {
        ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = "#e6f6ff"; ctx.lineWidth = .1; ctx.lineCap = "round";
        let sd = f.seed;
        for (let i = 0; i + 1 < f.pts.length; i++) {
          const a = f.pts[i], b = f.pts[i + 1]; ctx.beginPath(); ctx.moveTo(a.x, a.y);
          for (let q = 1; q <= 5; q++) { sd = (sd * 9301 + 49297) % 233280; const tt = q / 5; ctx.lineTo(a.x + (b.x - a.x) * tt + (q < 5 ? (sd / 233280 - .5) * .7 : 0), a.y + (b.y - a.y) * tt + (q < 5 ? (sd / 233280 - .5) * .7 : 0)); }
          ctx.stroke(); stamp("#9fe0ff", b.x, b.y, .5);
        }
        ctx.globalAlpha = 1;
      }
      if (f.k === "pillar") {
        ctx.globalAlpha = Math.max(0, 1 - k);
        const w = 1.4 * (1 - k * .5), lg = ctx.createLinearGradient(0, f.y - 14, 0, f.y); lg.addColorStop(0, "rgba(255,241,194,0)"); lg.addColorStop(1, "rgba(255,255,255,.9)");
        ctx.fillStyle = lg; ctx.fillRect(f.x - w / 2, f.y - 14, w, 14); stamp("#fff1c2", f.x, f.y, 3 * (1 - k * .3));
        ctx.globalAlpha = 1;
      }
      if (f.k === "bolt") {
        ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = "#fffbe0"; ctx.lineWidth = f.big ? .22 : .14;
        ctx.save(); ctx.strokeStyle = "rgba(255,229,138,.35)"; ctx.lineWidth = f.big ? .6 : .4; ctx.beginPath(); ctx.moveTo(f.x + 1.5, f.y - 8); ctx.lineTo(f.x, f.y); ctx.stroke(); ctx.restore();
        ctx.beginPath(); let x = f.x + 1.5, y = f.y - 8; ctx.moveTo(x, y);
        let sd = f.seed; for (let i = 0; i < 7; i++) { sd = (sd * 9301 + 49297) % 233280; x = f.x + (1.5 - i * .22) + (sd / 233280 - .5) * 1.2; y = f.y - 8 + (i + 1) * (8 / 7); ctx.lineTo(x, y); }
        ctx.stroke(); ctx.globalAlpha = 1;
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
      ctx.globalAlpha = 1 - k;
      const label = n.txt || "-" + n.n;
      txt(label, n.x, n.y - k * .9, n.txt ? .5 : n.tower ? .7 : .6, n.txt ? "#d9c8ff" : n.tower ? "#ffe58a" : "#fff", .12);
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
  function cardHtml(def, mini, extra = "") {
    const spell = def.kind === "spell", tc = spell ? "#e3ba5c" : TIER_COL[def.tier];
    const pic = def.n ? `<img src="/thumbs/${def.n}.webp" alt="" draggable="false">` : `<svg class="ar-sig" viewBox="0 0 100 100" style="background:radial-gradient(circle at 50% 45%,#4a1a7a,#0b0616 70%)">${SPELL_ICON[def.id] || ""}</svg>`;
    return `<div class="ar-card${mini ? " mini" : ""}${spell ? " spell" : ""}" style="--tc:${tc};${extra}"><span class="ar-card-in">${pic}</span><span class="ar-card-cost"><svg viewBox="0 0 10 12"><use href="#i-drop"/></svg><b>${def.cost}</b></span>
      <span class="ar-card-name">${def.name}</span><span class="ar-card-role">${spell ? "Spell" : def.power ? def.power.label : def.roleLabel}</span><span class="ar-card-fill"></span></div>`;
  }
  let handSig = "";
  function paintHand(force) {
    const P = G.S.sides[0], sig = P.hand.join() + ":" + P.queue[0];
    if (force || sig !== handSig) {
      handSig = sig;
      $("[data-hand]").innerHTML = P.hand.map((ci, slot) => `<div data-slot="${slot}">${cardHtml(P.deck[ci])}</div>`).join("");
      $("[data-next]").innerHTML = cardHtml(P.deck[P.queue[0]], true);
    }
    $$("[data-slot]").forEach(el => {
      const slot = Number(el.dataset.slot), def = P.deck[P.hand[slot]], card = el.firstElementChild;
      const poor = P.dmt < def.cost;
      if (card.classList.contains("poor") && !poor) { card.classList.remove("ready"); void card.offsetWidth; card.classList.add("ready"); }
      card.classList.toggle("poor", poor);
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
    const clock = $("[data-clockbox]");
    $("[data-clock]").textContent = Math.floor(left / 60) + ":" + String(Math.floor(left % 60)).padStart(2, "0");
    clock.className = "ar-clock " + G.phase + (left <= 10 ? " hurry" : "");
    $("[data-phase]").textContent = { calm: "Calm", rising: "Rising ×1.5", peak: "Peak ×2", overtime: "Sudden death" }[G.phase];
    if (S.crowns.join() !== G.crowns.join()) { G.crowns = S.crowns.slice(); paintCrowns(); }
    paintHand(false);
    tips(S);
  }
  const crown = on => `<svg viewBox="0 0 16 12" class="${on ? "on" : ""}"><use href="#i-crown"/></svg>`;
  function paintCrowns() { for (const side of [0, 1]) $(`[data-crowns="${side}"]`).innerHTML = [0, 1, 2].map(i => crown(i < G.S.crowns[side])).join(""); }

  /* ---------- placing: drag a card, or tap it then tap the field ---------- */
  function toArena(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) / ts - OX, y = (clientY - r.top) / ts - OY;
    return { x, y, inside: x >= 0 && x <= A.W && y >= 0 && y <= A.H && clientY <= r.bottom };
  }
  function tryPlace(slot, x, y) {
    const S = G.S, P = S.sides[0], def = P.deck[P.hand[slot]];
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    if (P.dmt < def.cost) { sfx("no"); flashTip("Not enough DMT yet: wait for the bar."); return false; }
    if (!A.canPlaceAt(S, 0, def, x, y)) { sfx("no"); flashTip(def.kind === "spell" ? "Not there." : "Place units on your half of the arena."); return false; }
    const t = S.tick, err = A.place(S, 0, slot, x, y);
    if (err) { sfx("no"); return false; }
    // what placing set off (a summoning, a spell taking flight) shows now; the next step clears the list
    events(S.events.splice(0));
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
    else {
      G.sel = G.sel === d.slot ? null : d.slot; sfx("tick");
      if (G.sel != null) { const def = d.def; flashTip(def.kind === "spell" ? `${def.name}: ${def.text}` : `${def.name} · ${def.power.label}: ${def.power.text}`, 3200); }
    }
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
  function flashTip(t, ms = 1800) { const el = $("[data-tip]"); el.textContent = t; el.hidden = false; clearTimeout(tipT); tipT = setTimeout(() => { el.hidden = true; }, ms); }
  function tips(S) {
    if (G.tips.done) return;
    const t = S.time, P = S.sides[0];
    if (!G.tips.placed && t > 1.5 && !G.tipShown) { G.tipShown = 1; const el = $("[data-tip]"); el.innerHTML = "<span><b>Drag a card</b> from your hand onto your half of the arena.</span>"; el.hidden = false; clearTimeout(tipT); }
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
    const rec = record(); rec[won ? "w" : draw ? "d" : "l"]++; store.set("record", rec);
    const end = $("[data-end]");
    end.classList.toggle("lost", !won && !draw);
    $("[data-end-title]").textContent = won ? "Victory!" : draw ? "Draw" : "Defeat";
    $("[data-end-crowns]").innerHTML = [0, 1, 2].map(i => crown(i < S.crowns[0]).replace("<svg ", `<svg style="animation-delay:${.6 + i * .3}s" `)).join("");
    $("[data-score-you]").textContent = S.crowns[0]; $("[data-score-foe]").textContent = S.crowns[1]; $("[data-score-rival]").textContent = $("[data-rname]").textContent;
    const mins = Math.floor(S.time / 60) + ":" + String(Math.floor(S.time % 60)).padStart(2, "0");
    const stats = $("[data-end-stats]");
    stats.innerHTML = `<span>Time<b>${mins}</b></span><span>Cards played<b>${G.inputs.length}</b></span><span>Arena wins<b>${rec.w}</b></span>`;
    const note = $("[data-end-note]");
    note.textContent = G.quit ? "You left the battle." : "Checking the result with the realm…";
    setTimeout(() => { end.hidden = false; if (won) setTimeout(() => sfx("phase"), 600); }, 1400);
    if (G.quit) return;
    try {
      const r = await (await fetch("/api/arena/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match: G.match, inputs: G.inputs }) })).json();
      if (r.error) note.textContent = "The realm could not confirm this one: " + r.error;
      else {
        note.innerHTML = `<svg><use href="#i-check"/></svg>Confirmed by the realm`;
        if (r.result.xp) stats.insertAdjacentHTML("afterbegin", `<span class="xp">XP<b>+${r.result.xp}</b></span>`);
      }
    } catch { note.textContent = "The result could not be sent. Check your connection."; }
  }

  // for testing only: ?debug lets a test reach the match
  if (/[?&]debug\b/.test(location.search)) window.__arena = () => G;

})();
