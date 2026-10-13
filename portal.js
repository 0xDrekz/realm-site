/* ============================================================
   REALM — the way into BREAKTHROUGH from the home page.

   Tapping Play BREAKTHROUGH (on the door or in the chamber) turns the
   screen into cards: a wave of REALM card backs flips over it, starting
   from the button, then flips again, and their faces piece together
   the game's title. Then the game opens. About two seconds; a tap skips
   it, and with reduced motion it simply goes.

   The faces are drawn here (the title, the fan of beings, the game's
   sky), so nothing is fetched to show them, and the game page itself
   is fetched in the background while the cards turn.
   ============================================================ */
(() => {
  "use strict";
  const HREF = "/breakthrough";
  const FAN = [29, 193, 1111, 762, 569];
  let busy = false;
  const imgs = {};
  const load = src => imgs[src] || (imgs[src] = new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));

  const css = document.createElement("style");
  css.textContent = `
  .pt-layer{position:fixed;inset:0;z-index:9000;perspective:900px;pointer-events:auto;cursor:pointer}
  .pt-tile{position:absolute;transform-style:preserve-3d;transform:rotateY(-90deg)}
  .pt-tile i{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
  .pt-back{background:radial-gradient(circle at 50% 50%,#3b1a63 0,#1a0b2e 55%,#0b0516 100%);
    box-shadow:inset 0 0 0 2px #e3ba5c,inset 0 0 0 4px #1a0b2e,inset 0 0 0 5px rgba(227,186,92,.5)}
  .pt-back::after{content:"";position:absolute;inset:28%;background:url(/logo.png) center/contain no-repeat;opacity:.9}
  .pt-face{transform:rotateY(180deg);background-repeat:no-repeat;background-color:#05020c}`;
  document.head.appendChild(css);

  /* the faces: the game's title screen, drawn to fit this screen */
  async function poster(W, H) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement("canvas");
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    try { await Promise.all([document.fonts.load('700 60px "Pixelify Sans"'), document.fonts.load('700 20px "Space Grotesk"')]); } catch (e) { /* the fallback font will do */ }
    const sky = g.createRadialGradient(W / 2, H * .38, 10, W / 2, H * .38, Math.max(W, H) * .8);
    sky.addColorStop(0, "#3a1458"); sky.addColorStop(.55, "#14072a"); sky.addColorStop(1, "#05020c");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H * .38); g.fillStyle = "rgba(197,107,255,.10)";
    for (let i = 0; i < 20; i++) { g.rotate(Math.PI / 10); g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -H); g.lineTo(40, -H); g.fill(); }
    g.restore();
    const t = (s, x, y, size, col, font, extra = {}) => {
      g.save(); g.font = `700 ${size}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle"; if (extra.spacing) g.letterSpacing = extra.spacing + "px";
      if (extra.deep) { g.fillStyle = "#000"; g.fillText(s, x + size / 9, y + size / 9); g.fillStyle = extra.deep; g.fillText(s, x + size / 18, y + size / 18); }
      if (extra.glow) { g.shadowColor = extra.glow; g.shadowBlur = 24; }
      g.fillStyle = col; g.fillText(s, x, y); g.restore();
    };
    // laid out like the game's own title screen, so the hand-over doesn't jump
    const big = Math.min(W * .18, 74);
    t("THE REALM CARD GAME", W / 2, H * .078, Math.max(11, big * .17), "#5cf0ff", '"Pixelify Sans", sans-serif', { spacing: 4 });
    t("BREAK", W / 2, H * .148, big, "#e3ba5c", '"Pixelify Sans", sans-serif', { deep: "#7a5414", glow: "rgba(255,200,90,.45)" });
    t("THROUGH", W / 2, H * .148 + big * .86, big, "#e3ba5c", '"Pixelify Sans", sans-serif', { deep: "#7a5414", glow: "rgba(255,200,90,.45)" });
    t("Match the Auras · chain the traits · break through", W / 2, H * .3, Math.max(12, W * .034), "#cfc4ee", '"Space Grotesk", sans-serif');
    // the fan of beings
    const cw = Math.min(W * .17, 90), ch = cw * 1.42, cy = H * .42;
    const ims = await Promise.all(FAN.map(n => load(`/thumbs/${n}.webp`)));
    FAN.forEach((n, i) => {
      const k = i - 2, im = ims[i]; g.save(); g.translate(W / 2 + k * cw * .42, cy + Math.abs(k) * cw * .1); g.rotate(k * .19);
      g.fillStyle = "#000"; g.fillRect(-cw / 2 + 4, -ch / 2 + 4, cw, ch);
      g.fillStyle = n === 1111 ? "#fff7d6" : "#fde68a"; g.fillRect(-cw / 2, -ch / 2, cw, ch);
      if (im) { g.save(); g.beginPath(); g.rect(-cw / 2 + 3, -ch / 2 + 3, cw - 6, ch - 6); g.clip(); g.drawImage(im, -ch / 2 + 3, -ch / 2 + 3, ch - 6, ch - 6); g.restore(); }
      g.restore();
    });
    return cv.toDataURL("image/jpeg", .86);
  }

  /* a soft card flick, made on the spot */
  let ac = null;
  function flick(when) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const len = Math.floor(ac.sampleRate * .03), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
      src.buffer = buf; f.type = "bandpass"; f.frequency.value = 2400 + Math.random() * 1600; v.gain.value = .12;
      src.connect(f).connect(v).connect(ac.destination); src.start(ac.currentTime + when);
    } catch (e) { /* no sound: fine */ }
  }

  async function go(from) {
    if (busy) return; busy = true;
    const leave = () => { location.href = HREF; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return leave();
    // fetch the game while the cards turn
    const pre = document.createElement("link"); pre.rel = "prefetch"; pre.href = HREF; document.head.appendChild(pre);
    const W = innerWidth, H = innerHeight;
    const L = document.createElement("div"); L.className = "pt-layer"; document.body.appendChild(L);
    L.addEventListener("pointerdown", leave);
    const cols = W < 600 ? 6 : 10, cw = W / cols, ch = cw * 1.4, rows = Math.ceil(H / ch);
    const b = from.getBoundingClientRect(), bx = b.x + b.width / 2, by = b.y + b.height / 2;
    let last = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const t = document.createElement("div"); t.className = "pt-tile";
      Object.assign(t.style, { left: c * cw + "px", top: r * ch + "px", width: cw + 1 + "px", height: ch + 1 + "px" });
      const bk = document.createElement("i"); bk.className = "pt-back";
      const fc = document.createElement("i"); fc.className = "pt-face";
      Object.assign(fc.style, { backgroundSize: `${W}px ${H}px`, backgroundPosition: `${-c * cw}px ${-r * ch}px` });
      t.append(bk, fc); L.appendChild(t);
      const delay = Math.hypot(c * cw + cw / 2 - bx, r * ch + ch / 2 - by) * .9;
      last = Math.max(last, delay);
      t.animate([{ transform: "rotateY(-90deg)" }, { transform: "rotateY(0deg)", offset: .4 }, { transform: "rotateY(0deg)", offset: .55 }, { transform: "rotateY(180deg)" }],
        { duration: 1100, delay, easing: "ease-in-out", fill: "both" });
      if ((r * cols + c) % 4 === 0) flick(delay / 1000);
    }
    // the faces are drawn while the first cards turn (they show from about half a second in)
    poster(W, H).then(url => L.querySelectorAll(".pt-face").forEach(f => { f.style.backgroundImage = `url(${url})`; })).catch(() => {});
    setTimeout(leave, last + 1100 + 250);
  }

  // the door's button and the chamber's BREAKTHROUGH slab
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest('a[href="/breakthrough"]');
    if (!a || !a.closest(".gate, .journey, .play-break") || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); go(a);
  });
  // back from the game: the page may come back from the cache with the cards still up
  addEventListener("pageshow", ev => { if (ev.persisted) { busy = false; document.querySelectorAll(".pt-layer").forEach(n => n.remove()); } });
  window.RealmPortal = { go };
})();
