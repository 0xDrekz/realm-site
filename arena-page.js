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
    epic: () => { tone(55, 1.2, { type: "sawtooth", v: .12, to: 110 }); tone(82, 1.2, { type: "triangle", v: .1, to: 165, at: .05 }); [262, 330, 392, 523].forEach((f, i) => tone(f, .6, { type: "triangle", v: .05, at: .15 + i * .08 })); },
    meteor: () => { tone(1800, .5, { type: "sine", v: .03, to: 300 }); },
    implode: () => { tone(40, 1.0, { type: "sine", v: .3, to: 25 }); noise(.8, { v: .3, f: 200 }); tone(900, .4, { type: "square", v: .03, to: 60 }); },
    drone: () => { tone(48, 2.0, { type: "sawtooth", v: .06, to: 90 }); tone(97, 2.0, { type: "sine", v: .05, to: 30 }); },
    hum: () => { tone(70, 4.2, { type: "sawtooth", v: .04, to: 66 }); tone(140, 4.2, { type: "sine", v: .03, to: 150, at: .8 }); },
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
    fireball: '<circle cx="50" cy="56" r="26" fill="#ff7a2a"/><circle cx="50" cy="56" r="16" fill="#ffd27a"/><path d="M30 44C30 20 50 22 46 6c18 12 26 24 24 42M62 40c4-12 14-16 12-30 10 12 10 24 2 34" fill="#ff9a3c"/><circle cx="50" cy="58" r="7" fill="#fff6d8"/>',
    quake: '<path d="M8 70h84" stroke="#9a8060" stroke-width="6"/><path d="M50 70 42 52l12-8-8-14 10-10-6-14M50 70l8 14-10 8" stroke="#ffd27a" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="22" cy="58" r="6" fill="#6a5a48"/><circle cx="78" cy="54" r="8" fill="#6a5a48"/><circle cx="70" cy="40" r="4" fill="#6a5a48"/>',
    storm: '<ellipse cx="50" cy="30" rx="34" ry="16" fill="#3a2a5a"/><ellipse cx="34" cy="26" rx="18" ry="12" fill="#4a3a6a"/><ellipse cx="64" cy="24" rx="20" ry="13" fill="#4a3a6a"/><path d="M48 42 38 64h10l-6 26 20-32H50l8-16z" fill="#fff6a0"/><path d="M24 48l-4 10M78 46l-4 12M30 62l-3 8" stroke="#9fc8ff" stroke-width="3"/>',
    cosmic: '<path d="M44 0h12l8 100H36z" fill="#e8f6ff" opacity=".85"/><path d="M40 0h4l-6 100h-4zM56 0h4l6 100h-4z" fill="#ff7ae6"/><path d="M36 0h4l-8 100h-4zM60 0h4l8 100h-4z" fill="#7fe8ff" opacity=".8"/><ellipse cx="50" cy="88" rx="30" ry="8" fill="#fff1c2" opacity=".7"/>',
    meteor: '<path d="M88 10 46 46" stroke="#ffb347" stroke-width="10" stroke-linecap="round" opacity=".6"/><path d="M80 14 40 50" stroke="#fff2c0" stroke-width="4" stroke-linecap="round"/><circle cx="36" cy="60" r="22" fill="#ff7a2a"/><circle cx="36" cy="60" r="15" fill="#4a2a1a"/><circle cx="30" cy="54" r="4" fill="#7a4a2a"/><circle cx="42" cy="66" r="3" fill="#2a1a10"/>',
    hole: '<circle cx="50" cy="50" r="40" fill="#1a0630"/><path d="M50 14a36 36 0 0 1 30 56M86 50a36 36 0 0 1-56 30M50 86a36 36 0 0 1-30-56M14 50a36 36 0 0 1 56-30" stroke="#c48bff" stroke-width="5" fill="none"/><ellipse cx="50" cy="50" rx="20" ry="8" fill="none" stroke="#ffcf7a" stroke-width="4"/><circle cx="50" cy="50" r="11" fill="#000"/>',
    mother: '<path d="M30 58 18 92h64L70 58z" fill="#7fffd0" opacity=".35"/><ellipse cx="50" cy="52" rx="42" ry="12" fill="#8a8ea8"/><ellipse cx="50" cy="48" rx="42" ry="9" fill="#c8ccdc"/><path d="M30 46a20 18 0 0 1 40 0z" fill="#7fe8ff"/><circle cx="22" cy="54" r="3" fill="#ffe58a"/><circle cx="38" cy="58" r="3" fill="#ff7ae6"/><circle cx="62" cy="58" r="3" fill="#7fffd0"/><circle cx="78" cy="54" r="3" fill="#ffe58a"/>',
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
    $("[data-army-note]").textContent = s ? "Signed in: your own beings turn up more often, with your $DMT boost" : "Sign in at Duels and your own beings turn up more often";
  }
  // on phones that allow it (Android), the battle goes truly full screen: no browser bars
  function fullscreen() { try { const d = document.documentElement; if (document.fullscreenEnabled && !document.fullscreenElement && matchMedia("(pointer: coarse)").matches) d.requestFullscreen({ navigationUI: "hide" }).catch(() => {}); } catch { /* not supported */ } }
  $("[data-battle]").addEventListener("click", () => { sfx("tick"); fullscreen(); battle(); });
  $("[data-again]").addEventListener("click", () => { $("[data-end]").hidden = true; fullscreen(); battle(); });
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
    // pictures load as the cards come up, not all at once
    for (const side of d.sides) for (const c of side.deck.slice(0, 8)) img(c.n);
    for (const c of d.wild || []) img(c.n);
    await faceOff(d);
    G = { match: d.match, seed: d.seed, sides: d.sides, wild: d.wild, S: A.createMatch({ seed: d.seed, sides: d.sides, wild: d.wild }), inputs: [], acc: 0, last: 0, prev: new Map(),
      fx: [], parts: [], nums: [], beams: new Map(), immune: new Map(), shake: 0, flash: 0, sel: null, drag: null, aim: null, phase: "calm", tips: store.get("tips", {}), over: false, overlays: [], storms: [], rays: [], seen: new Set(), river: 0, crowns: [0, 0], towerShake: new Map(), crewFire: new Map(), crewTurn: new Map(), shotFrom: new Map(), flies: [], holes: [], ships: [], scorch: [], gait: new Map(), swing: new Map(), jolt: new Map() };
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
    $("[data-vs-army]").textContent = d.own ? `All 1,111 in play · your beings come up more${d.boost ? " · $DMT boost" : ""}` : "All 1,111 in play · every card a gamble";
    // the opening hand, then the unknown: every card after is a random being, gone once played
    const back = i => `<div class="ar-card back" style="animation-delay:${.45 + i * .06}s"><span class="ar-card-in"><b>?</b></span></div>`;
    $("[data-vs-deck]").innerHTML = d.sides[0].deck.slice(0, 4).map((c, i) => cardHtml(c, false, `animation-delay:${.45 + i * .06}s`)).join("") + [4, 5, 6, 7].map(back).join("");
    vs.classList.remove("out"); vs.hidden = false;
    sfx("whoosh"); setTimeout(() => { sfx("blast"); buzz(30); }, 350);
    return new Promise(res => setTimeout(() => { vs.classList.add("out"); setTimeout(() => { vs.hidden = true; }, 350); res(); }, REDUCED ? 900 : 2300));
  }

  /* ---------- layout ---------- */
  // headroom above the rival's Throne, so its crystal and health bar sit clear of the top bar
  const TOP = 1.9, CROP = 2.2;
  let OX = 0, OY = TOP, VW = 18, VH = 34, SY = 1;
  /* sprites, towers and words stand upright even when the ground tilts away */
  function upright(x, y, fn) { if (SY === 1) return fn(); ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / SY); ctx.translate(-x, -y); fn(); ctx.restore(); }
  const stageEl = $("[data-stage]");
  function layout() {
    const st = $("[data-stage]").getBoundingClientRect();
    // the canvas fills the whole stage; the arena is as big as fits (its outer rim may be trimmed),
    // centred, with open sky painted around it. The top bar floats over the headroom.
    // the arena always fills the width. On a short screen the ground tilts away a little (a gentle
    // perspective, up to a fifth), the rival's tree may tuck under the top bar and the ground behind
    // your own tree under the cards; only on very short screens does the arena shrink.
    const hud = $(".ar-hud").getBoundingClientRect().height - 8, HEAD = .9, NEED = A.H + HEAD - CROP;
    ts = st.width / (A.W - .7);
    SY = Math.min(1, (st.height - hud) / (ts * NEED));
    if (SY < .72) { SY = .72; ts = Math.max(8, (st.height - hud) / (NEED * SY)); }
    dpr = Math.min(lowRes ? 1.2 : 2, window.devicePixelRatio || 1);
    VW = st.width / ts; VH = st.height / (ts * SY);
    OX = (VW - A.W) / 2; OY = hud / (ts * SY) + HEAD + Math.max(0, (VH - hud / (ts * SY) - NEED) / 2);
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
    const g = c.getContext("2d"); g.scale(dpr * ts, dpr * ts * SY); g.translate(OX, OY);
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
      const y0 = side === 0 ? R : 0.3, y1 = side === 0 ? H - 0.3 : R, T = TEAM[side], St = STONE[side];
      const spots = SPOTS.map(([x, y, s]) => [x, side ? H - y : y, s]);
      const inLane = (x, y) => A.BRIDGES.some(bx => Math.abs(x - bx) < 1.25) || Math.hypot(x - 9, y - spots[2][1]) < 3.3;
      g.save();
      g.beginPath(); roundRect(g, 0.35, 0.3, W - 0.7, H - 0.6, 0.3); g.clip(); g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip();
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
      g.save(); g.lineJoin = "round"; g.beginPath(); g.rect(-5, y0, W + 10, y1 - y0); g.clip();
      g.shadowColor = T.main; g.shadowBlur = ts * dpr * .5;
      g.strokeStyle = T.glow + ".8)"; g.lineWidth = .1; g.beginPath(); roundRect(g, 0.3, 0.25, W - 0.6, H - 0.5, 0.35); g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = "#0b0716"; g.lineWidth = .34; g.beginPath(); roundRect(g, 0.52, 0.47, W - 1.04, H - 0.94, 0.2); g.stroke();
      g.strokeStyle = "rgba(227,186,92,.55)"; g.lineWidth = .045; g.beginPath(); roundRect(g, 0.7, 0.65, W - 1.4, H - 1.3, 0.1); g.stroke();
      g.restore();
      // corner pillars with a gem on top
      const yb = side === 0 ? H - 1.05 : 1.05;
      for (const px of [.75, W - .75]) pillar(g, px, yb, T);
    }
    // the great mandala at the heart of the arena, and gold pillars where the halves meet
    mandala(g, 9, R, 5.2, "rgba(227,186,92,.2)");
    for (const px of [.75, W - .75]) pillar(g, px, R + .3, { main: "#e3ba5c" });
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
      if (tw.tower === "throne") G.shotFrom.set(sh.id, { ox: 0, oy: .4 - 1.05 / SY, d0, look: "eye" });
      else { G.crewFire.set(tw.id, G.river); G.shotFrom.set(sh.id, { ox: 0, oy: .4 - 3.25 / SY, d0, look: "plasma" }); }
    }
    // spent plasma bursts into a puff of green mist where it struck
    const live = new Set(S.shots.map(q => q.id));
    for (const [k, f] of G.shotFrom) if (!live.has(k)) { if (f && f.look === "plasma" && f.last) mist(f.last.x, f.last.y); G.shotFrom.delete(k); }
  }

  /* ---------- what just happened, as effects ---------- */
  function events(evs) {
    for (const e of evs) {
      switch (e.t) {
        case "spawn":
          G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.big ? 3.5 : 1.6, life: e.big ? .8 : .45, t: 0, col: e.side ? "#ff7a90" : "#7fd8ff" });
          G.fx.push({ k: "beamin", x: e.x, y: e.y, life: .45, t: 0, col: e.side ? "#ff9aac" : "#9fe0ff" });
          if (e.wild) G.fx.push({ k: "portal", x: e.x, y: e.y, life: 1.4, t: 0 });
          if (e.big) { G.shake = Math.max(G.shake, .5); sfx("spawnBig"); burst(e.x, e.y, 30, "#fff1c2", 5); }
          break;
        case "charge": sfx("whoosh"); break;
        case "slam": G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.6, life: .4, t: 0, col: "#ffd27a", fill: true }); burst(e.x, e.y - .6, 16, "#ffd27a", 3.5); G.shake = Math.max(G.shake, .45); sfx("blast"); break;
        case "quake": G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r + .5, life: .5, t: 0, col: "#e8c08a" }, { k: "ring", x: e.x, y: e.y, r: e.r, life: .35, t: 0, col: "#ffefc8", fill: true }); G.scorch.push({ x: e.x, y: e.y, r: 1.4, t: 0, life: 4, crack: true }); burst(e.x, e.y, 14, "#9a8060", 2.5); G.shake = Math.max(G.shake, .5); sfx("blast"); buzz(15); break;
        case "bomb": { const b = G.S.ents.find(q => q.id === e.id); G.fx.push({ k: "bombfall", x0: b ? b.x : e.x, y0: (b ? b.y : e.y) - 1.8, x: e.x, y: e.y, life: .35, t: 0 }); break; }
        case "summon": G.fx.push({ k: "circle", x: e.x, y: e.y, life: .9, t: 0 }); sfx("heal"); break;
        case "split": burst(e.x, e.y - .6, 26, "#e6d0ff", 3.5); G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.4, life: .4, t: 0, col: "#e6d0ff", fill: true }); break;
        case "surge": {
          const T = { spirits: ["Realm Surge", "Wild spirits join both sides"], titan: ["Realm Surge", "A titan rises for both sides"], meteors: ["Realm Surge", "Meteor storm!"], bloom: ["Realm Surge", "+3 DMT for everyone"] }[e.kind] || ["Realm Surge", ""];
          banner(T[0], T[1]); sfx("phase"); buzz([20, 30, 20]);
          if (e.kind === "bloom") { for (let i = 0; i < 60; i++) G.parts.push({ x: Math.random() * A.W, y: Math.random() * A.H, vx: 0, vy: -.8 - Math.random(), life: 1.2 + Math.random(), t: 0, col: Math.random() < .5 ? "#ff7ae6" : "#c56bff", s: .07 }); G.flash = .25; }
          break;
        }
        case "swing": {
          G.swing.set(e.id, { t: G.river, to: e.to });
          // a slash: a bright crescent across the target, in the attacker's colour
          const a = G.S.ents.find(q => q.id === e.id), tg = G.S.ents.find(q => q.id === e.to);
          if (a && tg) G.fx.push({ k: "slash", x: tg.x, y: tg.y + bodyY(tg), ang: Math.atan2(tg.y - a.y, tg.x - a.x), life: .22, t: 0, col: TEAM[a.side].main, big: a.def && a.def.cost >= 5 });
          break;
        }
        case "play": {
          sfx("place"); if (e.side === 0) buzz(10);
          const def = G.S.sides[e.side].deck.find(c => c.id === e.card);
          if (def && def.epic) { banner(def.name, e.side ? "The rival unleashes" : "Unleashed", e.side === 1); sfx("epic"); G.shake = Math.max(G.shake, .6); buzz([30, 40, 60]); }
          break;
        }
        case "quake0": G.fx.push({ k: "quakewarn", x: e.x, y: e.y, r: e.r, life: .35, t: 0 }); sfx("drone"); break;
        case "quakepulse": {
          const n = e.n; G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r * (1 + n * .15), life: .55, t: 0, col: "#ffd27a" }, { k: "ring", x: e.x, y: e.y, r: e.r * .8, life: .35, t: 0, col: "#e8c08a", fill: true });
          G.scorch.push({ x: e.x + (Math.random() - .5), y: e.y + (Math.random() - .5) * .6, r: e.r * (.7 + n * .15), t: 0, life: 6, crack: true });
          G.fx.push({ k: "fissure", x: e.x, y: e.y, r: e.r * (.8 + n * .2), life: 1.4, t: 0, seed: Math.random() * 1000 });
          for (let i = 0; i < 5 + n * 2; i++) { const a = Math.random() * TAU; G.fx.push({ k: "rock", x: e.x + Math.cos(a) * e.r * .5, y: e.y + Math.sin(a) * e.r * .3, vx: Math.cos(a) * (1 + Math.random() * 2), vz: 4 + Math.random() * 4, s: .14 + Math.random() * .14, life: .9, t: 0 }); }
          for (let i = 0; i < 14 + n * 6 && G.parts.length < 420; i++) { const a = Math.random() * TAU, d = Math.random() * e.r; G.parts.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * .6, vx: (Math.random() - .5) * 1.2, vy: -2 - Math.random() * 2.5, life: .6 + Math.random() * .3, t: 0, col: Math.random() < .5 ? "rgba(120,100,80,.85)" : "rgba(80,66,52,.85)", s: .1 + Math.random() * .08, smoke: true }); }
          G.shake = Math.max(G.shake, .5 + n * .25); sfx("blast"); buzz([40, 20, 40]); break;
        }
        case "storm": G.storms.push({ x: e.x, y: e.y, r: e.r, dur: e.dur, t: 0 }); sfx("thunder"); break;
        case "cosmic": G.rays.push({ x0: e.x0, x1: e.x1, y: e.y, charge: e.charge, dur: e.dur, t: 0, side: e.side }); sfx("drone"); break;
        case "hole": G.holes.push({ x: e.x, y: e.y, r: e.r, dur: e.dur, t: 0 }); sfx("drone"); break;
        case "ship": G.ships.push({ x: e.x, y: e.y, r: e.r, arrive: e.arrive, dur: e.dur, t: 0, side: e.side }); sfx("hum"); break;
        case "hit": {
          impact(e);
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
        case "bolt": if (e.storm) { const st = G.storms[G.storms.length - 1]; G.fx.push({ k: "bolt", x: e.x, y: e.y, fromY: st ? st.y - 6.5 : e.y - 8, life: .32, t: 0, seed: Math.random() * 1000, big: true }); G.flash = Math.max(G.flash, .12); burst(e.x, e.y, 10, "#fff6a0", 3); sfx("zap"); break; }
          G.fx.push({ k: "bolt", x: e.x, y: e.y, life: .3, t: 0, seed: Math.random() * 1000 }); G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.4, life: .35, t: 0, col: "#fff6a0", fill: true }); sfx("zap"); break;
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
          } else { burst(e.x, e.y - .9, 18, e.side ? "#ff9aac" : "#9fe0ff", 3); G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1.1, life: .35, t: 0, col: e.side ? "#ff9aac" : "#9fe0ff" }, { k: "soul", x: e.x, y: e.y - .9, life: .9, t: 0, col: e.side ? "#ffb3c0" : "#b8e6ff" }); sfx("die"); }
          break;
        case "phase": {
          const P = { rising: ["Rising", "DMT ×1.5 · units +15%"], peak: ["Peak", "DMT ×2 · units +30%"], overtime: ["Sudden death", "Next tower wins"] }[e.name];
          if (P) { banner(P[0], P[1]); sfx("phase"); buzz([30, 30, 30]); G.flash = .35; G.phase = e.name; }
          break;
        }
      }
    }
  }
  /* every hit lands with a flash sized to its damage, coloured by the power behind it */
  function impact(e) {
    const y = e.y + (e.tower ? -1.6 : e.air ? -1.8 : -.9) / SY, n = e.n || 0, heavy = n >= 150;
    G.fx.push({ k: "ring", x: e.x, y, r: .35 + Math.min(1.1, n / 260), life: .18, t: 0, col: e.tower ? "#ffd65c" : "#ffffff", fill: true });
    const C = { fire: "#ff8a3c", frost: "#bfeaff", acid: "#8dff5a", drain: "#ff4a6a", gas: "#8dff5a", burst: "#ffb05c", chain: "#cfe0ff", beam: "#7fffd0", descend: "#fff1c2", quake: "#e8c08a", cloak: "#e8e0ff" }[e.s];
    burst(e.x, y, heavy ? 8 : 3, C || (e.tower ? "#ffd65c" : "#ffffff"), heavy ? 3 : 2);
    if (e.s === "fire") for (let i = 0; i < 5; i++) G.parts.push({ x: e.x + (Math.random() - .5) * .5, y, vx: (Math.random() - .5) * .5, vy: -1 - Math.random(), life: .45, t: 0, col: i % 2 ? "#ffd24a" : "#ff6a2a", s: .08 });
    if (e.s === "frost") for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; G.parts.push({ x: e.x, y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, life: .35, t: 0, col: "#e8f8ff", s: .06 }); }
    if (e.s === "acid") for (let i = 0; i < 6; i++) G.parts.push({ x: e.x, y, vx: (Math.random() - .5) * 2, vy: -1.5 + Math.random(), life: .5, t: 0, col: "#a6ff4a", s: .07 });
    if (e.s === "drain") G.fx.push({ k: "ring", x: e.x, y, r: .8, life: .3, t: 0, col: "#ff4a6a" });
    if (heavy) { G.fx.push({ k: "ring", x: e.x, y: e.y, r: 1 + n / 300, life: .3, t: 0, col: C || "#ffffff" }); G.shake = Math.max(G.shake, Math.min(.35, n / 900)); }
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
    if (e.fx === "meteor") {
      G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r + .6, life: .5, t: 0, col: "#ffb347", fill: true });
      burst(e.x, e.y, 22, "#ffb347", 3.2); burst(e.x, e.y, 10, "#4a3428", 2.4); G.scorch.push({ x: e.x, y: e.y, r: 1.3, t: 0, life: 7 });
      G.shake = Math.max(G.shake, .55); sfx("blast"); buzz(20); return;
    }
    if (e.fx === "fireball") {
      G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r + .6, life: .5, t: 0, col: "#ff9a3c", fill: true });
      burst(e.x, e.y, 34, "#ffb347", 4.5); burst(e.x, e.y, 16, "#ff5a2a", 3); G.scorch.push({ x: e.x, y: e.y, r: 1.6, t: 0, life: 7 });
      for (let i = 0; i < 24; i++) { const a = Math.random() * TAU, d = Math.random() * e.r; G.parts.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * .6, vx: 0, vy: -.8 - Math.random(), life: .8 + Math.random() * .8, t: 0, col: Math.random() < .5 ? "#ff9a3c" : "#ffd24a", s: .09 }); }
      G.shake = Math.max(G.shake, .6); G.flash = Math.max(G.flash, .15); sfx("blast"); buzz(25); return;
    }
    if (e.fx === "bomb") {
      G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r + .5, life: .45, t: 0, col: "#ff9a3c", fill: true });
      burst(e.x, e.y, 26, "#ffb347", 4); burst(e.x, e.y, 8, "#3a3030", 2.5); G.scorch.push({ x: e.x, y: e.y, r: 1.2, t: 0, life: 6 }); G.shake = Math.max(G.shake, .5); sfx("blast"); return;
    }
    if (e.fx === "hole") {
      G.fx.push({ k: "ring", x: e.x, y: e.y, r: e.r * 1.9, life: .7, t: 0, col: "#ffffff" }, { k: "ring", x: e.x, y: e.y, r: e.r * 1.3, life: .5, t: 0, col: "#c48bff", fill: true });
      burst(e.x, e.y, 70, "#e6d0ff", 7); burst(e.x, e.y, 30, "#ffcf7a", 5); G.flash = .6; G.shake = 1.2; sfx("implode"); buzz([60, 30, 120]); return;
    }
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
    const k = ts * dpr; ctx.save(); ctx.translate(x, y); ctx.scale(1 / k, 1 / (k * SY));
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
    ctx.scale(dpr * ts, dpr * ts * SY); ctx.translate(OX, OY);
    drawRiver(S);
    drawZone();
    // rubble where towers stood
    for (const r of G.rubble || []) drawRubble(r);
    // towers, then ground units by depth, then flyers, then shots
    const ents = S.ents.slice().sort((a, b) => a.y - b.y);
    drawScorch(dt);
    drawZones(S);
    drawHoles(dt);
    for (const e of ents) if (e.kind === "tower") drawTower(e, alpha, dt);
    for (const e of ents) if (e.kind === "unit" && !e.air) drawUnit(e, alpha);
    for (const e of ents) if (e.kind === "unit" && e.air) drawUnit(e, alpha);
    drawBeams(S, alpha);
    for (const s of S.shots) drawShot(s, alpha);
    drawStorms(dt);
    drawFx(dt);
    drawRays(dt);
    drawShips(dt);
    drawOverlays();
    drawGhost();
    // the flash of something big
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${G.flash * .5})`; ctx.fillRect(-OX, -OY, VW, VH); G.flash = Math.max(0, G.flash - dt * 1.6); }
  }
  let riverGrad = null, riverKey = "";
  /* the line where the halves meet: a seam of living light, brighter as the match heats up */
  function drawRiver(S) {
    const R = A.RIVER, t = G.river;
    const col = G.phase === "peak" || G.phase === "overtime" ? ["#ff9ad8", "#fff1c2"] : G.phase === "rising" ? ["#e05cff", "#ff7ae6"] : ["#7a3cff", "#c56bff"];
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = col[0] + "55"; ctx.lineWidth = .32; ctx.beginPath(); ctx.moveTo(.7, R); ctx.lineTo(A.W - .7, R); ctx.stroke();
    ctx.strokeStyle = col[1] + "cc"; ctx.lineWidth = .06; ctx.setLineDash([.6, .3]); ctx.lineDashOffset = -t * 1.5; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const st = streak(col[1]);
    for (let k = 0; k < 6; k++) { const len = 1.4 + (k % 3) * .6, x = ((t * (1.2 + k * .3) * 2 + k * 3.7) % (A.W + len)) - len * .5; ctx.globalAlpha = .7; ctx.drawImage(st, x, R - .07, len, .14); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  function drawZone() {
    const card = G.drag ? G.drag.def : G.sel != null ? G.S.sides[0].deck[G.S.sides[0].hand[G.sel]] : null;
    if (!card || card.kind === "spell") return;
    // where you can't place: a red veil
    const S = G.S, R = A.RIVER;
    ctx.fillStyle = "rgba(255,40,80,.16)";
    const down = S.sides[1].gatesDown;
    if (!down[0] && !down[1]) ctx.fillRect(0, 0, A.W, R + .5);
    else {
      for (let lane = 0; lane < 2; lane++) {
        const x0 = lane ? A.W / 2 : 0;
        ctx.fillRect(x0, 0, A.W / 2, down[lane] ? 10 : R + .5);
      }
    }
    ctx.strokeStyle = "rgba(255,90,120,.6)"; ctx.setLineDash([.3, .2]); ctx.lineWidth = .06;
    ctx.beginPath(); ctx.moveTo(0, R + .5); ctx.lineTo(A.W, R + .5); ctx.stroke(); ctx.setLineDash([]);
  }
  const drawTower = (e, alpha, dt) => upright(e.x, e.y + .4, () => drawTowerUp(e, alpha, dt));
  function drawTowerUp(e, alpha, dt) {
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
    // drawn last, over everything, so it can't be hidden in a busy fight
    overlay(() => {
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
    });
  }
  /* things that must stay readable (health bars) are queued and drawn last, in the place they were meant for */
  function overlay(fn) { G.overlays.push({ m: ctx.getTransform(), fn }); }
  function drawOverlays() { for (const o of G.overlays) { ctx.save(); ctx.setTransform(o.m); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; o.fn(); ctx.restore(); } G.overlays.length = 0; }
  function drawRubble(r) {
    const s = r.big ? 1.5 : 1.1;
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(r.x, r.y + s * .5, s, s * .45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a3448";
    for (let k = 0; k < 6; k++) { const a = k * 1.1, d = s * (.25 + (k % 3) * .2); ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d * .5, s * .22, 0, Math.PI * 2); ctx.fill(); }
    if (Math.random() < .05) G.parts.push({ x: r.x + (Math.random() - .5), y: r.y, vx: 0, vy: -.6, life: 1.2, t: 0, col: "rgba(160,150,180,.5)", s: .18, smoke: true });
  }
  const drawUnit = (e, alpha) => { const p = pos(e.id, e.x, e.y, alpha); upright(p.x, p.y, () => drawUnitUp(e, alpha)); };
  function drawUnitUp(e, alpha) {
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
    // trails: a charger kicks up dust and speed lines, a flyer leaves a streak of light
    if (e.charging) { ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(255,220,150,.6)"; ctx.lineWidth = .06; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fx + i * .3, cy + .2); ctx.lineTo(fx + i * .3 - (gt.x - (gt.px ?? gt.x)) * 30, cy + .2 - (gt.y - (gt.py ?? gt.y)) * 30); ctx.stroke(); } ctx.globalCompositeOperation = "source-over"; if (Math.random() < .5) G.parts.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * .6, vy: -.3, life: .5, t: 0, col: "rgba(160,140,120,.5)", s: .1, smoke: true }); }
    if (e.air && e.def.id !== "wisp" && Math.random() < .35) G.parts.push({ x: fx + (Math.random() - .5) * .4, y: cy + .3, vx: 0, vy: .25, life: .5, t: 0, col: e.style === "bomber" ? "rgba(200,190,180,.4)" : T.main, s: .06, smoke: e.style === "bomber" });
    gt.px = gt.x; gt.py = gt.y;
    if (e.def.id === "wisp") {
      // a wisp: a little spirit of light with a flickering heart
      ctx.globalCompositeOperation = "lighter"; stamp(T.main, fx, cy - .1, .7 + Math.sin(t * 9 + e.id) * .08); stamp("#ffffff", fx, cy - .1, .22); ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#0a0514"; ctx.fillRect(fx - .1, cy - .16, .05, .07); ctx.fillRect(fx + .05, cy - .16, .05, .07);
      if (Math.random() < .3) G.parts.push({ x: fx, y: cy, vx: (Math.random() - .5) * .4, vy: .3, life: .4, t: 0, col: T.main, s: .05 });
    } else {
      // the being in its medallion, hopping, floating or breathing
      const spr = sprite(e.def, e.side, vr), size = vr * 3;
      ctx.save(); ctx.translate(fx, cy); ctx.rotate(rot); ctx.scale(scale, sy * scale);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
      // a bomber carries its bomb slung beneath
      if (e.style === "bomber") { ctx.strokeStyle = "#8a8ea8"; ctx.lineWidth = .03; ctx.beginPath(); ctx.moveTo(fx, cy + vr * .9); ctx.lineTo(fx, cy + vr * 1.25); ctx.stroke(); ctx.fillStyle = "#1c1a24"; ctx.beginPath(); ctx.arc(fx, cy + vr * 1.4, .17, 0, TAU); ctx.fill(); stamp("#ffb347", fx + .08, cy + vr * 1.22, .14 + Math.random() * .05); }
      // a summoner glows with green motes; a splitter shimmers at its edges
      if (e.style === "summon" && Math.random() < .2) G.parts.push({ x: fx + (Math.random() - .5) * vr * 2, y: cy + vr * .6, vx: 0, vy: -.6, life: .7, t: 0, col: "#9dffcf", s: .05 });
    }
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
      const bw = Math.max(1.2, Math.min(1.8, w * .8)), by = fy - lift - h - .05, k = Math.max(0, e.hp / e.max);
      overlay(() => {
        ctx.fillStyle = "#000"; ctx.fillRect(fx - bw / 2 - .07, by - .07, bw + .14, .4);
        ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(fx - bw / 2 - .07, by - .07, bw + .14, .04);
        ctx.fillStyle = "#2a2236"; ctx.fillRect(fx - bw / 2, by, bw, .26);
        ctx.fillStyle = e.ethereal ? "#c9a8ff" : k < .3 ? "#ff9a3c" : T.main; ctx.fillRect(fx - bw / 2, by, bw * k, .26);
        ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(fx - bw / 2, by, bw * k, .07);
        if (e.shield > 0) { ctx.fillStyle = "#ffe58a"; ctx.fillRect(fx - bw / 2, by - .16, bw * Math.min(1, e.shield / e.max), .1); }
      });
    }
  }
  /* scorched ground where meteors struck and the beam burned */
  let scorchSpr = null;
  function drawScorch(dt) {
    if (!G.scorch.length) return;
    if (!scorchSpr) { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(12,6,4,.85)"); gr.addColorStop(.55, "rgba(30,14,8,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,${100 + Math.random() * 100 | 0},40,.8)`; g.fillRect(16 + Math.random() * 32, 16 + Math.random() * 32, 2, 2); } scorchSpr = c; }
    for (const sc of G.scorch) {
      sc.t += dt; ctx.globalAlpha = Math.max(0, 1 - sc.t / sc.life) * .9;
      if (sc.crack) { ctx.strokeStyle = "#140c08"; ctx.lineWidth = .07; for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + sc.x; ctx.beginPath(); ctx.moveTo(sc.x, sc.y); ctx.lineTo(sc.x + Math.cos(a) * sc.r * .6, sc.y + Math.sin(a) * sc.r * .35); ctx.lineTo(sc.x + Math.cos(a + .3) * sc.r, sc.y + Math.sin(a + .3) * sc.r * .55); ctx.stroke(); } }
      else ctx.drawImage(scorchSpr, sc.x - sc.r, sc.y - sc.r * .6, sc.r * 2, sc.r * 1.2);
    }
    ctx.globalAlpha = 1; G.scorch = G.scorch.filter(sc => sc.t < sc.life);
  }
  /* a lightning storm: a dark cloud churns over the area; the bolts come from it */
  function drawStorms(dt) {
    for (const st of G.storms) {
      st.t += dt; const k = st.t / st.dur, a = Math.min(1, st.t * 3, (st.dur - st.t) * 2), t = G.river, cy = st.y - 6.5;
      ctx.fillStyle = `rgba(6,4,20,${.25 * a})`; ctx.beginPath(); ctx.ellipse(st.x, st.y, st.r * 1.3, st.r * .7, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 9; i++) { const ox = Math.sin(i * 2.3 + t * .6) * st.r * .9, oy = Math.cos(i * 1.7 + t * .5) * .6; ctx.globalAlpha = .85 * a; ctx.fillStyle = i % 2 ? "#2a2046" : "#3a2c5e"; ctx.beginPath(); ctx.ellipse(st.x + ox, cy + oy, 1.4 + (i % 3) * .4, .8, 0, 0, TAU); ctx.fill(); }
      if (Math.random() < .25) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .5 * a; stamp("#b8a8ff", st.x + (Math.random() - .5) * st.r * 1.6, cy, 1.4); ctx.globalCompositeOperation = "source-over"; }
      ctx.globalAlpha = .45 * a; ctx.strokeStyle = "#9fb8ff"; ctx.lineWidth = .03;
      for (let i = 0; i < 14; i++) { const rx = st.x + ((i * 1.37 + t * 3) % (st.r * 2.4)) - st.r * 1.2, ry = cy + 1 + ((i * .71 + t * 9) % 5.5); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - .15, ry + .5); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    G.storms = G.storms.filter(st => st.t < st.dur);
  }
  /* a cosmic ray: a mark, a gathering star, then a beam from the sky sweeping its line */
  function drawRays(dt) {
    for (const ry of G.rays) {
      ry.t += dt; const t = G.river;
      if (ry.t < ry.charge) {
        const k = ry.t / ry.charge;
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .4 + .5 * k; ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = .05; ctx.setLineDash([.3, .2]);
        ctx.beginPath(); ctx.moveTo(ry.x0, ry.y); ctx.lineTo(ry.x1, ry.y); ctx.stroke(); ctx.setLineDash([]);
        stamp("#ffffff", ry.x0, ry.y - 9, .4 + k * 1.4); stamp("#ff7ae6", ry.x0, ry.y - 9, .8 + k * 2);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; continue;
      }
      const k = Math.min(1, (ry.t - ry.charge) / ry.dur), bx = lerp(ry.x0, ry.x1, k), fade = k >= 1 ? Math.max(0, 1 - (ry.t - ry.charge - ry.dur) * 4) : 1, top = ry.y - 22;
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = fade;
      for (const [off, col, w] of [[-.35, "#7fe8ff", .5], [.35, "#ff7ae6", .5], [0, "#ffffff", .7]]) {
        const g = ctx.createLinearGradient(0, top, 0, ry.y); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.6, col); g.addColorStop(1, col);
        ctx.fillStyle = g; ctx.fillRect(bx + off - w / 2 - Math.sin(t * 40) * .05, top, w, ry.y - top);
      }
      stamp("#fff1c2", bx, ry.y, 1.8); stamp("#ffffff", bx, ry.y, .9); stamp("#ff7ae6", bx, ry.y, 2.4 * (.8 + Math.sin(t * 30) * .2));
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      if (k < 1) {
        if (Math.random() < .6) G.scorch.push({ x: bx, y: ry.y + (Math.random() - .5) * .5, r: 1, t: 0, life: 6 });
        for (let i = 0; i < 3; i++) G.parts.push({ x: bx, y: ry.y, vx: (Math.random() - .5) * 4, vy: -1 - Math.random() * 3, life: .5, t: 0, col: ["#ffffff", "#7fe8ff", "#ff7ae6", "#fff1c2"][i % 4], s: .07 });
        G.shake = Math.max(G.shake, .35); G.flash = Math.max(G.flash, .06);
      }
    }
    G.rays = G.rays.filter(ry => ry.t < ry.charge + ry.dur + .3);
  }
  /* a black hole: the arena dims, light spirals in, and an event horizon glows */
  function drawHoles(dt) {
    for (const h of G.holes) {
      h.t += dt; const k = Math.min(1, h.t / h.dur), grow = Math.min(1, h.t * 3), t = G.river;
      ctx.fillStyle = `rgba(4,0,12,${.28 * grow})`; ctx.fillRect(-OX, -OY, VW, VH);
      const rr = h.r * (1.15 + .1 * Math.sin(t * 6)) * grow;
      const dg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, rr); dg.addColorStop(0, "rgba(0,0,0,.95)"); dg.addColorStop(.35, "rgba(20,4,40,.8)"); dg.addColorStop(.75, "rgba(90,30,160,.35)"); dg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(h.x, h.y, rr, rr * .62, 0, 0, TAU); ctx.fill();
      ctx.lineCap = "round";
      for (let arm = 0; arm < 4; arm++) {
        ctx.strokeStyle = arm % 2 ? "#c48bff" : "#ffcf7a"; ctx.globalAlpha = .75; ctx.lineWidth = .1;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const f = i / 24, rad = rr * (1 - f) + .2, a = t * (3 + k * 5) + arm * Math.PI / 2 + f * 4.2; const px = h.x + Math.cos(a) * rad, py = h.y + Math.sin(a) * rad * .62; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      stamp("#ffcf7a", h.x, h.y, .9 + k * .6); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(h.x, h.y, .42 + k * .2, .28 + k * .12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#fff1c2"; ctx.lineWidth = .06; ctx.beginPath(); ctx.ellipse(h.x, h.y, .7 + k * .3, .3 + k * .12, Math.sin(t) * .2, 0, TAU); ctx.stroke();
      for (let i = 0; i < 3 && G.parts.length < 420; i++) { const a = Math.random() * TAU, d = h.r + .6; G.parts.push({ x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d * .62, vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 1.4, life: .45, t: 0, col: Math.random() < .5 ? "#e6d0ff" : "#ffcf7a", s: .05 }); }
    }
    G.holes = G.holes.filter(h => h.t < h.dur);
  }
  /* the Mothership: it descends from beyond the top of the screen, burns, then lifts away */
  function shipArt() {
    return art("ship", 5, 2.4, 2.5, 1.3, g => {
      g.fillStyle = "rgba(127,255,208,.25)"; g.beginPath(); g.ellipse(0, .35, 1.4, .3, 0, 0, TAU); g.fill();
      const bg = g.createLinearGradient(0, -.3, 0, .5); bg.addColorStop(0, "#d8dcec"); bg.addColorStop(.5, "#8a8ea8"); bg.addColorStop(1, "#3a3c52");
      g.fillStyle = bg; g.strokeStyle = OUT; g.lineWidth = .06; g.beginPath(); g.ellipse(0, .1, 2.35, .55, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = "#5a5e78"; g.beginPath(); g.ellipse(0, .2, 1.9, .3, 0, 0, Math.PI); g.fill();
      g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = .04; g.beginPath(); g.ellipse(0, .02, 2.1, .38, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      const dg = g.createRadialGradient(-.25, -.5, .05, 0, -.25, .9); dg.addColorStop(0, "#e8fbff"); dg.addColorStop(.5, "#7fe8ff"); dg.addColorStop(1, "#1a5a7a");
      g.fillStyle = dg; g.strokeStyle = OUT; g.beginPath(); g.ellipse(0, -.12, .95, .72, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      for (let i = 0; i < 9; i++) { const a = Math.PI * (.1 + .8 * i / 8); ell(g, -Math.cos(a) * 2.0, .2 + Math.sin(a) * .2, .07, .05, "#2a2c3a"); }
    });
  }
  function drawShips(dt) {
    for (const s of G.ships) {
      s.t += dt; const t = G.river, hoverY = s.y - 3.4;
      let sy, sc = 1, beam = 0;
      if (s.t < s.arrive) { const k = s.t / s.arrive, e = 1 - (1 - k) * (1 - k); sy = lerp(hoverY - 16, hoverY, e); sc = 1.5 - .5 * e; }
      else if (s.t < s.arrive + s.dur) { sy = hoverY + Math.sin(t * 2.5) * .12; beam = Math.min(1, (s.t - s.arrive) * 5); }
      else { const k = (s.t - s.arrive - s.dur) / .7; sy = hoverY - k * k * 16; }
      // its shadow on the ground
      const near = Math.max(0, 1 - Math.abs(sy - hoverY) / 16);
      ctx.fillStyle = `rgba(0,0,0,${.35 * near})`; ctx.beginPath(); ctx.ellipse(s.x, s.y, 2.2 * near, .8 * near, 0, 0, TAU); ctx.fill();
      if (beam > 0) {
        const pulse = .75 + Math.sin(t * 18) * .15, r = s.r;
        const bg = ctx.createLinearGradient(0, sy + .4, 0, s.y); bg.addColorStop(0, `rgba(200,255,240,${.75 * beam * pulse})`); bg.addColorStop(1, `rgba(90,255,200,${.4 * beam * pulse})`);
        ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(s.x - .55, sy + .45); ctx.lineTo(s.x + .55, sy + .45); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x - r, s.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(230,255,248,${.55 * beam})`; ctx.beginPath(); ctx.moveTo(s.x - .18, sy + .45); ctx.lineTo(s.x + .18, sy + .45); ctx.lineTo(s.x + r * .35, s.y); ctx.lineTo(s.x - r * .35, s.y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = .9 * beam; stamp("#7fffd0", s.x, s.y, r * 1.1); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#e8fff6"; ctx.lineWidth = .07; ctx.setLineDash([.4, .25]); ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * .45, 0, t * 3, t * 3 + TAU); ctx.stroke(); ctx.setLineDash([]);
        if (Math.random() < .7) G.parts.push({ x: s.x + (Math.random() - .5) * r * 2, y: s.y + (Math.random() - .5) * r * .8, vx: 0, vy: -1.6, life: .5, t: 0, col: Math.random() < .5 ? "#7fffd0" : "#ffb347", s: .07 });
        if (Math.random() < .08) G.scorch.push({ x: s.x + (Math.random() - .5) * r, y: s.y + (Math.random() - .5) * r * .4, r: .9, t: 0, life: 5 });
        if (Math.random() < .25) G.shake = Math.max(G.shake, .25);
      }
      const a = shipArt(); sc *= 1.3; ctx.save(); ctx.translate(s.x, sy); ctx.scale(sc, sc / SY); ctx.drawImage(a.c, -a.ax, -a.ay, a.w, a.h); ctx.restore();
      for (let i = 0; i < 7; i++) { const lx = s.x + (i - 3) * .62 * sc, ly = sy + .2 * sc + Math.abs(i - 3) * -.04; const on = Math.floor(t * 8 + i) % 3 === 0; stamp(on ? "#ffe58a" : ["#ff7ae6", "#7fffd0", "#7fe8ff"][i % 3], lx, ly, on ? .32 : .2); }
      stamp("#7fe8ff", s.x, sy - .3 * sc, .7 * sc);
    }
    G.ships = G.ships.filter(s => s.t < s.arrive + s.dur + .7);
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
  const bodyY = e => (!e ? 0 : e.kind === "tower" ? (e.tower === "throne" ? -1.2 : -1.8) : e.air ? -1.8 : -.95) / SY;
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
    const len = s.kind === "caster" ? 1.0 : .8;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang); ctx.drawImage(streak(col.length === 7 ? col : "#ffffff"), -len, -.07, len + .05, .14); ctx.restore();
    const r = s.kind === "gas" ? .34 : s.kind === "caster" || s.kind === "burst" ? .3 : .2;
    ctx.globalCompositeOperation = "lighter"; stamp(col, q.x, q.y, r * 2.8); stamp("#ffffff", q.x, q.y, r); ctx.globalCompositeOperation = "source-over";
  }
  function drawFlies(dt) {
    for (const f of G.flies) {
      f.t += dt; const k = Math.min(1, f.t / f.dur), T = TEAM[f.side];
      if (f.fx === "fireball") {
        const d = Math.hypot(f.x1 - f.x0, f.y1 - f.y0), hgt = 1 + d * .18, at = q => ({ x: lerp(f.x0, f.x1, q), y: lerp(f.y0, f.y1, q) - Math.sin(Math.PI * q) * hgt });
        const h = at(k);
        for (let i = 10; i >= 1; i--) { const q = at(Math.max(0, k - i * .025)); ctx.globalAlpha = (1 - i / 11) * .8; stamp(i < 4 ? "#ffd27a" : i < 7 ? "#ff8a3c" : "#c8361a", q.x, q.y, .8 * (1 - i / 12)); }
        ctx.globalAlpha = 1; stamp("#ff8a3c", h.x, h.y, 1.1); stamp("#fff2c0", h.x, h.y, .45);
        if (Math.random() < .8) G.parts.push({ x: h.x, y: h.y, vx: (Math.random() - .5) * .8, vy: -.4, life: .5, t: 0, col: Math.random() < .5 ? "#ffb347" : "rgba(90,70,60,.6)", s: .09, smoke: Math.random() < .4 });
        continue;
      }
      if (f.fx === "meteor") {
        // each meteor shows its mark, then streaks down from the sky in its last moments
        const left = f.dur - f.t, kk = Math.max(0, 1 - left / .45);
        ctx.globalAlpha = .35 + .5 * Math.min(1, f.t / f.dur); ctx.strokeStyle = "#ff8a3c"; ctx.lineWidth = .06;
        ctx.beginPath(); ctx.arc(f.x1, f.y1, 1.35 * (1.25 - .25 * kk), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        if (kk > 0) {
          const q = kk * kk, mx = lerp(f.x0, f.x1, q), my = lerp(f.y0, f.y1, q), ang = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
          for (let i = 10; i >= 1; i--) { ctx.globalAlpha = (1 - i / 11) * .8; stamp(i < 4 ? "#ffd27a" : i < 7 ? "#ff8a3c" : "#c8361a", mx - Math.cos(ang) * i * .32, my - Math.sin(ang) * i * .32, .75 - i * .05); }
          ctx.globalAlpha = 1; stamp("#ffb347", mx, my, .9); stamp("#fff2c0", mx, my, .4);
          ctx.fillStyle = "#3a2418"; ctx.beginPath(); ctx.arc(mx, my, .2, 0, TAU); ctx.fill();
          if (Math.random() < .8) G.parts.push({ x: mx, y: my, vx: (Math.random() - .5) * 1.2, vy: (Math.random() - .5) * 1.2, life: .4, t: 0, col: Math.random() < .5 ? "#ffd27a" : "#ff6a2a", s: .07 });
          if (!f.whistled) { f.whistled = true; sfx("meteor"); }
        }
        continue;
      }
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
    // light adds up: glows, rings and sparks blend additively, so overlapping magic blazes
    ctx.globalCompositeOperation = "lighter";
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
      if (f.k === "beamin") {
        ctx.globalAlpha = Math.max(0, 1 - k) * .7; const w = .9 * (1 - k * .5);
        const lg = ctx.createLinearGradient(0, f.y - 7, 0, f.y); lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(1, f.col);
        ctx.fillStyle = lg; ctx.fillRect(f.x - w / 2, f.y - 7, w, 7); ctx.globalAlpha = 1;
      }
      if (f.k === "soul") { ctx.globalAlpha = Math.max(0, 1 - k) * .9; stamp(f.col, f.x + Math.sin(k * 9) * .15, f.y - k * 1.6, .45 * (1 - k * .4)); stamp("#ffffff", f.x + Math.sin(k * 9) * .15, f.y - k * 1.6, .15); ctx.globalAlpha = 1; }
      if (f.k === "portal") {
        // a rift tears open and the wild spirit steps through
        const a = Math.sin(Math.min(1, k * 1.4) * Math.PI), t2 = G.river;
        ctx.globalAlpha = a; stamp("#c56bff", f.x, f.y - .8, 2.2); stamp("#ffd27a", f.x, f.y - .8, 1.0);
        for (let i = 0; i < 4; i++) { ctx.strokeStyle = i % 2 ? "#ffd27a" : "#e6d0ff"; ctx.lineWidth = .08; ctx.beginPath(); ctx.ellipse(f.x, f.y - .8, (1.4 - i * .25) * a, (2 - i * .35) * a, 0, t2 * (i % 2 ? -3 : 3) + i, t2 * (i % 2 ? -3 : 3) + i + 4.5); ctx.stroke(); }
        if (Math.random() < .25) { const a1 = Math.random() * TAU, a2 = a1 + 1 + Math.random(); G.fx.push({ k: "chain", pts: [{ x: f.x + Math.cos(a1) * 1.2, y: f.y - .8 + Math.sin(a1) * 1.6 }, { x: f.x + Math.cos(a2) * .5, y: f.y - .8 + Math.sin(a2) * .7 }], life: .15, t: 0, seed: Math.random() * 1000 }); }
        ctx.globalAlpha = 1;
      }
      if (f.k === "circle") {
        // the summoner's circle: a rotating ring of runes
        ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = "#9dffcf"; ctx.lineWidth = .06;
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(1, .5); ctx.rotate(G.river * 2);
        ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1.0, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 1.0, Math.sin(a) * 1.0); ctx.lineTo(Math.cos(a + 2.1) * 1.0, Math.sin(a + 2.1) * 1.0); ctx.stroke(); }
        ctx.restore(); stamp("#9dffcf", f.x, f.y, 1.2 * (1 - k)); ctx.globalAlpha = 1;
      }
      if (f.k === "bombfall") {
        const bx = lerp(f.x0, f.x, k), by = lerp(f.y0, f.y, k * k);
        ctx.fillStyle = "#1c1a24"; ctx.beginPath(); ctx.arc(bx, by, .2, 0, TAU); ctx.fill(); ctx.strokeStyle = "#8a8ea8"; ctx.lineWidth = .04; ctx.stroke();
        stamp("#ffb347", bx + .1, by - .22, .18);
        if (k > .95 && !f.boom) { f.boom = true; blastFx({ fx: "bomb", x: f.x, y: f.y, r: 1 }); }
      }
      if (f.k === "pillar") {
        ctx.globalAlpha = Math.max(0, 1 - k);
        const w = 1.4 * (1 - k * .5), lg = ctx.createLinearGradient(0, f.y - 14, 0, f.y); lg.addColorStop(0, "rgba(255,241,194,0)"); lg.addColorStop(1, "rgba(255,255,255,.9)");
        ctx.fillStyle = lg; ctx.fillRect(f.x - w / 2, f.y - 14, w, 14); stamp("#fff1c2", f.x, f.y, 3 * (1 - k * .3));
        ctx.globalAlpha = 1;
      }
      if (f.k === "bolt") {
        // a forked bolt with a glow; from the storm cloud when there is one
        const top = f.fromY != null ? f.fromY : f.y - 8, hgt = f.y - top;
        ctx.globalAlpha = Math.max(0, 1 - k);
        const path = (seed, jit) => { ctx.beginPath(); let x = f.x + 1.2, y = top; ctx.moveTo(x, y); let sd = seed; for (let i = 0; i < 8; i++) { sd = (sd * 9301 + 49297) % 233280; x = f.x + (1.2 - i * .17) + (sd / 233280 - .5) * jit; y = top + (i + 1) * (hgt / 8); ctx.lineTo(x, y); } };
        ctx.strokeStyle = "rgba(170,140,255,.35)"; ctx.lineWidth = f.big ? .9 : .55; path(f.seed, 1.2); ctx.stroke();
        ctx.strokeStyle = "#fffbe0"; ctx.lineWidth = f.big ? .2 : .13; path(f.seed, 1.2); ctx.stroke();
        ctx.strokeStyle = "#cfe0ff"; ctx.lineWidth = .06; path(f.seed + 77, 2.2); ctx.stroke();
        stamp("#fff6c8", f.x, f.y, f.big ? 1.2 : .8);
        ctx.globalAlpha = 1;
      }
      if (f.k === "slash") {
        // a crescent of light carved across the target
        ctx.globalAlpha = Math.max(0, 1 - k); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang + Math.PI / 2);
        const r = f.big ? .95 : .7, sweep = -1.2 + k * 2.4;
        ctx.strokeStyle = f.col; ctx.lineWidth = f.big ? .28 : .2; ctx.beginPath(); ctx.arc(0, 0, r, sweep - .9, sweep + .3); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = f.big ? .1 : .07; ctx.beginPath(); ctx.arc(0, 0, r, sweep - .6, sweep + .25); ctx.stroke();
        ctx.restore(); stamp(f.col, f.x, f.y, .5 * (1 - k)); ctx.globalAlpha = 1;
      }
      if (f.k === "fissure") {
        // the ground splits: jagged cracks run out from the centre, molten light inside
        const grow = Math.min(1, k * 4), fade = Math.max(0, 1 - k); let sd = f.seed;
        for (let i = 0; i < 7; i++) {
          let a = i * TAU / 7 + (f.seed % 1), x = f.x, y = f.y; const pts = [[x, y]];
          for (let j = 0; j < 5; j++) { sd = (sd * 9301 + 49297) % 233280; a += (sd / 233280 - .5) * .9; const step = f.r * grow / 5; x += Math.cos(a) * step; y += Math.sin(a) * step * .55; pts.push([x, y]); }
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = fade * .9; ctx.strokeStyle = "#140a06"; ctx.lineWidth = .2; ctx.beginPath(); pts.forEach(([px, py], q) => q ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
          ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = fade; ctx.strokeStyle = "#ff8a2a"; ctx.lineWidth = .08; ctx.stroke(); ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = .03; ctx.stroke();
        }
        stamp("#ff8a2a", f.x, f.y, f.r * .7 * fade); ctx.globalAlpha = 1;
      }
      if (f.k === "rock") {
        // a chunk of the floor, thrown up and falling back
        const h = Math.max(0, f.vz * f.t - 9 * f.t * f.t), x = f.x + f.vx * f.t;
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = Math.max(0, 1 - k * .6);
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, f.y, f.s, f.s * .4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#4a3e5e"; ctx.save(); ctx.translate(x, f.y - h); ctx.rotate(f.t * 8); ctx.fillRect(-f.s / 2, -f.s / 2, f.s, f.s); ctx.fillStyle = "#6a5a80"; ctx.fillRect(-f.s / 2, -f.s / 2, f.s, f.s * .35); ctx.restore();
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 1;
      }
      if (f.k === "quakewarn") { ctx.globalAlpha = Math.max(0, 1 - k) * .7; stamp("#ffd27a", f.x, f.y, f.r * 1.2); ctx.globalAlpha = 1; }
    }
    G.fx = G.fx.filter(f => f.t < f.life);
    ctx.globalCompositeOperation = "source-over";
    for (const p of G.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92;
      const k = 1 - p.t / p.life; if (k <= 0) continue;
      ctx.globalCompositeOperation = p.smoke ? "source-over" : "lighter";
      ctx.globalAlpha = k; ctx.fillStyle = p.col;
      const ps = p.smoke ? p.s * (2 - k) : p.s * k + .02; ctx.fillRect(p.x - ps, p.y - ps, ps * 2, ps * 2);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
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
    return `<div class="ar-card${mini ? " mini" : ""}${spell ? " spell" : ""}${def.epic ? " epic" : ""}" style="--tc:${tc};${extra}"><span class="ar-card-in">${pic}</span><span class="ar-card-cost"><svg viewBox="0 0 10 12"><use href="#i-drop"/></svg><b>${def.cost}</b></span>
      <span class="ar-card-name">${def.name}</span><span class="ar-card-role">${def.epic ? "Epic spell" : spell ? "Spell" : def.power ? def.power.label : def.roleLabel}</span><span class="ar-card-fill"></span></div>`;
  }
  let handSig = "";
  function paintHand(force) {
    const P = G.S.sides[0], sig = P.hand.join() + ":" + P.queue[0];
    if (force || sig !== handSig) {
      const fresh = P.hand.filter(ci => !G.seen.has(ci));
      handSig = sig;
      $("[data-hand]").innerHTML = P.hand.map((ci, slot) => `<div data-slot="${slot}">${cardHtml(P.deck[ci])}</div>`).join("");
      $("[data-next]").innerHTML = cardHtml(P.deck[P.queue[0]], true);
      for (const ci of P.queue.slice(0, 4)) img(P.deck[ci].n);
      // a jackpot: a God, an Entity, the Source or a Mythic turns up in your hand
      for (const ci of fresh) {
        G.seen.add(ci); const c = P.deck[ci];
        if (G.S.tick > 0 && c.kind === "unit" && ["Mythic", "Entity", "God", "Source"].includes(c.tier)) {
          const el = $(`[data-slot="${P.hand.indexOf(ci)}"] .ar-card`); if (el) el.classList.add("jackpot");
          banner(c.tier === "Source" ? "The Source!" : "Jackpot!", c.tier === "Mythic" ? "A Mythic in your hand" : `${c.tier === "God" ? "A God" : c.tier === "Entity" ? "An Entity" : "The Prime Source"} in your hand`);
          sfx("epic"); buzz([30, 30, 30, 30, 80]);
        }
      }
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
  }
  const crown = on => `<svg viewBox="0 0 16 12" class="${on ? "on" : ""}"><use href="#i-crown"/></svg>`;
  function paintCrowns() { for (const side of [0, 1]) $(`[data-crowns="${side}"]`).innerHTML = [0, 1, 2].map(i => crown(i < G.S.crowns[side])).join(""); }

  /* ---------- placing: drag a card, or tap it then tap the field ---------- */
  function toArena(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) / ts - OX, y = (clientY - r.top) / (ts * SY) - OY;
    return { x, y, inside: x >= 0 && x <= A.W && y >= 0 && y <= A.H && clientY <= r.bottom };
  }
  function tryPlace(slot, x, y) {
    const S = G.S, P = S.sides[0], def = P.deck[P.hand[slot]];
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    if (P.dmt < def.cost) { sfx("no"); nudge(slot); return false; }
    if (!A.canPlaceAt(S, 0, def, x, y)) { sfx("no"); nudge(slot); return false; }
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
  /* no words over the battle: a card that can't go yet just shakes */
  function nudge(slot) { const el = $(`[data-slot="${slot}"] .ar-card`); if (!el) return; el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); buzz(15); }

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
  if (/[?&]debug\b/.test(location.search)) { window.__arena = () => G; window.__arenaPlace = (slot, x, y) => { const ok = tryPlace(slot, x, y); paintHand(true); return ok; }; }

})();
