/* ============================================================
   The mint reveal (window.RealmReveal.play(beings) -> Promise).
   Only what happens on screen after a mint has landed: the package, the
   smoke, the card. It never touches the chain.
   beings: [{ n, name, image }] in the order they were minted.
   ============================================================ */
(() => {
  "use strict";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TIER = {
    Common: ["#c9ced6", "rgba(201,206,214,.45)"], Uncommon: ["#34d399", "rgba(52,211,153,.55)"], Rare: ["#3b82f6", "rgba(59,130,246,.6)"],
    Epic: ["#c77dff", "rgba(168,85,247,.7)"], Legendary: ["#f59e0b", "rgba(245,158,11,.8)"], Mythic: ["#ef4444", "rgba(239,68,68,.85)"],
    Entity: ["#a5f3fc", "rgba(165,243,252,.9)"], God: ["#fde68a", "rgba(253,230,138,.95)"], Source: ["#ffffff", "rgba(255,247,214,1)"],
  };
  const COUNT = { Common: 400, Uncommon: 280, Rare: 180, Epic: 110, Legendary: 70, Mythic: 40, Entity: 20, God: 10, Source: 1 };
  const BIG = new Set(["Legendary", "Mythic", "Entity", "God", "Source"]);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* none */ } };

  /* every being's tier and name, read once */
  let CODEX = null;
  async function lookup(n) {
    try { if (!CODEX) { const d = await (await fetch("/api/codex")).json(); CODEX = new Map(d.cards.map(c => [c.n, c])); } } catch { CODEX = CODEX || new Map(); }
    const c = CODEX.get(n);
    return c ? { tier: c.tier, name: c.being || c.name } : { tier: "Common", name: null };
  }

  /* ---------- sound, made on the spot ---------- */
  let AC = null;
  const ac = () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC; } catch { return null; } };
  function tone(f, d, { type = "sine", v = .08, to = null, at = 0 } = {}) {
    const a = ac(); if (!a) return; const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .05);
  }
  function hiss(d, v = .15, f = 700) {
    const a = ac(); if (!a) return; const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), c = b.getChannelData(0);
    for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; fl.type = "lowpass"; fl.frequency.value = f; g.gain.value = v;
    s.connect(fl).connect(g).connect(a.destination); s.start();
  }
  const SFX = {
    drop: () => { tone(90, .35, { type: "triangle", v: .15, to: 45 }); hiss(.2, .1, 400); },
    rattle: () => tone(180 + Math.random() * 120, .06, { type: "square", v: .03 }),
    open: () => { hiss(1.2, .25, 900); tone(70, .9, { type: "sawtooth", v: .07, to: 140 }); [392, 523, 659].forEach((f, i) => tone(f, .7, { type: "triangle", v: .05, at: .1 + i * .07 })); },
    rise: () => { tone(220, 1.3, { v: .06, to: 660 }); tone(330, 1.3, { type: "triangle", v: .03, to: 990, at: .1 }); },
    flip: () => hiss(.25, .12, 2400),
    reveal: big => (big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784]).forEach((f, i) => tone(f, .55, { type: "triangle", v: .07, at: i * .09 })),
  };

  /* ---------- smoke and sparks ---------- */
  function smoke(cv) {
    const g = cv.getContext("2d"), P = [];
    let raf = 0, alive = true, dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
    size(); window.addEventListener("resize", size);
    const COLS = ["197,107,255", "255,90,210", "92,240,255", "125,255,154", "255,227,92", "255,138,60"];
    const puff = (x, y, n, spread, up) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - .5) * spread, v = (2 + Math.random() * 5) * up;
        P.push({ k: "s", x: x + (Math.random() - .5) * 80, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 34 + Math.random() * 56, gr: 1.1 + Math.random() * 1.4,
          life: 2.2 + Math.random() * 2, t: 0, c: COLS[Math.floor(Math.random() * COLS.length)], rot: Math.random() * 6 });
      }
    };
    const sparks = (x, y, n, col) => {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 9; P.push({ k: "p", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: .8 + Math.random() * .9, t: 0, c: col || COLS[i % COLS.length], r: 2 + Math.random() * 3 }); }
    };
    let last = performance.now();
    const tick = now => {
      if (!alive) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      for (const p of P) {
        p.t += dt; const k = p.t / p.life; if (k >= 1) continue;
        if (p.k === "s") {
          p.x += p.vx; p.y += p.vy; p.vx *= .97; p.vy = p.vy * .97 - .04; p.r += p.gr;
          // soft coloured clouds laid over each other, never added up to white
          g.globalCompositeOperation = "source-over";
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          const al = Math.min(1, k * 4) * (1 - k) * .62;
          gr.addColorStop(0, `rgba(${p.c},${al})`); gr.addColorStop(1, `rgba(${p.c},0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
        } else {
          p.x += p.vx; p.y += p.vy; p.vy += .25; p.vx *= .985;
          g.globalCompositeOperation = "lighter"; g.fillStyle = p.c.startsWith("#") ? p.c : `rgb(${p.c})`; g.globalAlpha = 1 - k;
          g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); g.globalAlpha = 1;
        }
      }
      for (let i = P.length - 1; i >= 0; i--) if (P[i].t >= P[i].life) P.splice(i, 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { puff, sparks, stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", size); } };
  }

  /* ---------- one being ---------- */
  function build(root, b, i, total) {
    const T = TIER[b.tier] || TIER.Common;
    root.style.setProperty("--tc", T[0]); root.style.setProperty("--tg", T[1]);
    root.innerHTML = `<div class="rv-glow"></div><div class="rv-sky"></div><div class="rv-sky b"></div><canvas></canvas><div class="rv-flash"></div>
${total > 1 ? `<div class="rv-count">Being ${i + 1} of ${total}</div>` : ""}<button class="rv-skip" type="button" data-rv-skip>Skip</button>
<div class="rv-tier" data-rv-tier>${esc(b.tier)}<small>${COUNT[b.tier] === 1 ? "one of one" : "1 of " + (COUNT[b.tier] || "")}</small></div>
<div class="rv-stage">
  <div class="rv-box"><div class="rv-boxin" data-rv-boxin>
    <div class="rv-back"></div><div class="rv-beam" data-rv-beam></div>
    <div class="rv-card" data-rv-card>
      <div class="rv-face rv-cb"><img src="logo-bar.png" alt=""></div>
      <div class="rv-face rv-cf"><div class="rv-art"><img data-rv-img src="/thumbs/${b.n}.webp" alt=""></div>
        <div class="rv-info"><b>${esc(b.name)}</b><i>${esc(b.tier)}<span>#${b.n}</span></i></div></div>
    </div>
    <div class="rv-front"></div><div class="rv-seal"><img src="logo-bar.png" alt=""></div><div class="rv-leak" data-rv-leak></div><div class="rv-lid" data-rv-lid></div>
  </div></div>
</div>
<p class="rv-hint" data-rv-hint>Tap to open</p>
<div class="rv-acts" data-rv-acts></div>`;
    // the sharp picture, once it has loaded
    if (b.image) { const full = new Image(); full.onload = () => { const im = root.querySelector("[data-rv-img]"); if (im) im.src = b.image; }; full.src = b.image; }
  }

  async function revealOne(root, b, i, total, last) {
    build(root, b, i, total);
    const $ = s => root.querySelector(s);
    const fx = smoke(root.querySelector("canvas"));
    const box = $("[data-rv-boxin]"), lid = $("[data-rv-lid]"), card = $("[data-rv-card]"), hint = $("[data-rv-hint]");
    let skip = false;
    $("[data-rv-skip]").onclick = e => { e.stopPropagation(); skip = true; opened(); };
    // it drops in, then shakes harder and harder until you tap (or it opens by itself)
    let open = null; const opened = () => { if (open) { open(); open = null; } };
    const tapped = new Promise(r => { open = r; });
    root.onclick = () => opened();
    box.classList.add("drop"); SFX.drop(); buzz(20);
    if (!REDUCED) await Promise.race([wait(650), tapped]);
    box.classList.remove("drop"); box.classList.add("shake");
    let rattling = setInterval(() => { SFX.rattle(); }, 160);
    const auto = setTimeout(opened, 3200);
    const harder = setTimeout(() => { box.classList.replace("shake", "shake2"); $("[data-rv-leak]").classList.add("on"); buzz([15, 30, 15]); }, 1400);
    await tapped; clearTimeout(auto); clearTimeout(harder); clearInterval(rattling);
    root.onclick = null; hint.remove();
    box.classList.remove("shake", "shake2");
    // it bursts open: the lid flies, smoke pours out, light shines up
    const r = box.getBoundingClientRect(), cx = r.left + r.width / 2, top = r.top + r.height * .3;
    lid.classList.add("fly"); $("[data-rv-leak]").remove(); $("[data-rv-beam]").classList.add("on");
    root.querySelector(".rv-flash").classList.add("go");
    fx.puff(cx, top, REDUCED ? 8 : 80, 2.8, 1.3); fx.sparks(cx, top, REDUCED ? 10 : 60);
    SFX.open(); buzz([40, 30, 80]);
    const more = REDUCED ? null : setInterval(() => fx.puff(cx, top + 10, 5, 2.6, 1), 130);
    if (!skip) await wait(380);
    // the card lifts out of the box, back first
    card.classList.add("rise"); SFX.rise();
    setTimeout(() => card.classList.add("up"), 500);
    if (!skip) await wait(1350); else await wait(60);
    if (more) clearInterval(more);
    // and turns round
    card.classList.add("flip"); SFX.flip();
    await wait(skip ? 300 : 620);
    const big = BIG.has(b.tier);
    $("[data-rv-tier]").classList.add("go"); SFX.reveal(big);
    const rc = card.getBoundingClientRect();
    fx.sparks(rc.left + rc.width / 2, rc.top + rc.height / 2, big ? 140 : 40, (TIER[b.tier] || TIER.Common)[0]);
    if (big) { root.querySelector(".rv-flash").classList.remove("go"); void root.offsetWidth; root.querySelector(".rv-flash").classList.add("go"); buzz([60, 40, 60, 40, 160]); fx.puff(rc.left + rc.width / 2, rc.bottom, 24, 3, .9); }
    await wait(skip ? 200 : 450);
    card.classList.add("done");
    // what next: the next being, share, or done
    const acts = $("[data-rv-acts]");
    const text = `I just pulled ${b.name}, ${/^[AEIOU]/.test(b.tier) ? "an" : "a"} ${b.tier} from REALM. ${COUNT[b.tier] === 1 ? "The only one there is." : "1 of " + COUNT[b.tier] + "."}\n\ndmt-realm.dev/mint`;
    const share = "https://x.com/intent/tweet?text=" + encodeURIComponent(text);
    acts.innerHTML = `<a class="rv-ghost" href="${share}" target="_blank" rel="noopener">Share on X</a><button class="rv-go" type="button" data-rv-next>${last ? "Done" : "Next being"}</button>`;
    acts.classList.add("on");
    await new Promise(res => { acts.querySelector("[data-rv-next]").onclick = res; });
    fx.stop();
  }

  async function play(list) {
    const beings = [];
    for (const x of list) {
      const n = Number(x.n || (String(x.name || "").match(/#(\d+)/) || [])[1] || 0); if (!n) continue;
      const t = await lookup(n);
      beings.push({ n, name: t.name || x.name || "Being #" + n, tier: t.tier, image: x.image || null });
    }
    if (!beings.length) return;
    const root = document.createElement("div"); root.className = "rv"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Your new being");
    document.body.appendChild(root); document.body.style.overflow = "hidden";
    try { for (let i = 0; i < beings.length; i++) await revealOne(root, beings[i], i, beings.length, i === beings.length - 1); }
    finally { root.classList.add("out"); await wait(300); root.remove(); document.body.style.overflow = ""; }
  }

  window.RealmReveal = { play };
  // a preview without minting: /mint?reveal=demo (or ?reveal=176 for a given being)
  const q = new URLSearchParams(location.search).get("reveal");
  if (q) addEventListener("load", () => play(q === "demo" ? [{ n: 1 + Math.floor(Math.random() * 1111) }] : q.split(",").map(n => ({ n: Number(n) }))));
})();
