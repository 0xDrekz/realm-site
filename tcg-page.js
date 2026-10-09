/* ============================================================
   REALM — the card battler page (duels-beta.html).

   The server decides everything. This page shows the match, turns taps
   into moves, and replays what the server sends back, one step at a time,
   with motion and sound. It never works out a result for itself.
   ============================================================ */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const RC = window.RealmCard, { esc, ESS_COL, TIER_COL } = RC;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pace = ms => REDUCED ? Math.min(ms, 120) : ms;

  /* ---------- saved on this device ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("realm-tcg-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("realm-tcg-" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  let progress = store.get("progress", { tutorial: false, stars: {} });

  /* ---------- sound: a small synth, no files to load ---------- */
  let ac = null, muted = store.get("muted", false);
  function audio() {
    if (muted) return null;
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch { return null; }
    return ac;
  }
  function tone(f, d, { type = "sine", v = .12, to = null, at = 0 } = {}) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02);
  }
  function noise(d, { v = .15, f = 1000, at = 0 } = {}) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + at, n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = b; fl.type = "lowpass"; fl.frequency.value = f; g.gain.value = v;
    s.connect(fl).connect(g).connect(a.destination); s.start(t);
  }
  const SFX = {
    deal: () => tone(900, .06, { type: "triangle", v: .05, to: 1500 }),
    summon: () => { tone(330, .26, { type: "triangle", v: .1, to: 660 }); tone(495, .32, { v: .07, to: 990, at: .05 }); },
    champ: () => { tone(262, .5, { type: "triangle", v: .12, to: 523 }); tone(392, .5, { v: .08, to: 784, at: .08 }); tone(1046, .4, { v: .04, at: .2 }); },
    cast: () => { tone(220, .5, { type: "sawtooth", v: .035, to: 880 }); tone(660, .4, { v: .06, at: .1, to: 1320 }); },
    whoosh: () => noise(.25, { v: .12, f: 900 }),
    hit: () => { noise(.12, { v: .2, f: 420 }); tone(130, .14, { type: "square", v: .05, to: 60 }); },
    death: () => { tone(300, .4, { type: "sawtooth", v: .05, to: 55 }); noise(.3, { v: .09, f: 300 }); },
    heal: () => { tone(660, .2, { v: .07, to: 990 }); tone(990, .25, { v: .05, at: .08, to: 1320 }); },
    turn: () => { tone(523, .18, { type: "triangle", v: .09 }); tone(784, .32, { type: "triangle", v: .08, at: .12 }); },
    rival: () => { tone(311, .2, { type: "triangle", v: .07 }); tone(233, .3, { type: "triangle", v: .07, at: .12 }); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .4, { type: "triangle", v: .09, at: i * .12 })),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .45, { v: .08, at: i * .16 })),
    tap: () => tone(1200, .03, { type: "square", v: .02 }),
    star: () => tone(1320, .18, { type: "triangle", v: .08, to: 1760 }),
    freeze: () => tone(1800, .3, { v: .04, to: 2600 }),
  };
  const sfx = k => { try { SFX[k] && SFX[k](); } catch { /* no audio */ } };
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* no haptics */ } };
  function setMute(m) {
    muted = m; store.set("muted", m);
    $$("[data-mute]").forEach(b => { b.setAttribute("aria-pressed", String(m)); b.textContent = m ? "Sound off" : "Sound on"; });
    if (!m) sfx("tap");
  }
  $$("[data-mute]").forEach(b => b.addEventListener("click", () => setMute(!muted)));
  setMute(muted);

  /* ---------- the server ---------- */
  async function post(path, body) {
    const r = await fetch("/api/tcg/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    let d; try { d = await r.json(); } catch { d = { error: "The realm did not answer. Try again." }; }
    return d;
  }

  /* ---------- screens ---------- */
  function screen(name) {
    $$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; });
    document.body.style.overflow = name === "match" ? "hidden" : "";
    window.scrollTo(0, 0);
  }

  /* ============================================================
     THE HUB
     ============================================================ */
  let MAP = null;
  const STAR = '<svg class="tg-star" viewBox="0 0 24 24"><path d="M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z"/></svg>';
  const starsHtml = n => [0, 1, 2].map(i => STAR.replace('class="tg-star"', `class="tg-star${i < n ? " on" : ""}"`)).join("");
  function levelOrder() { return MAP ? MAP.realms.flatMap(r => r.levels.map(l => l.id)) : []; }
  function unlocked(id) {
    const order = levelOrder(), i = order.indexOf(id);
    return i <= 0 || (progress.stars[order[i - 1]] || 0) > 0;
  }
  async function hub() {
    screen("hub");
    if (!MAP) { try { MAP = await (await fetch("/api/tcg/map")).json(); } catch { $("[data-realms]").innerHTML = '<p class="tg-bad">The map could not be read. Pull to refresh.</p>'; return; } }
    $(".tg-tut").classList.toggle("done", !!progress.tutorial);
    $("[data-tut-note]").textContent = progress.tutorial ? "Done. Play it again any time." : "Start here: learn to play in a few minutes";
    const soon = ["Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Entity", "God", "Source"];
    $("[data-realms]").innerHTML = MAP.realms.map(r => `<section class="tg-realm">
      <span class="tg-rtag">Realm ${r.id} · ${esc(r.tier)}</span><h3>${esc(r.name)}</h3><p>${esc(r.blurb)}</p>
      <ol class="tg-levels">${r.levels.map((l, i) => {
        const open = unlocked(l.id), st = progress.stars[l.id] || 0;
        return `<li><button class="tg-lv${l.boss ? " boss" : ""}" type="button" data-level="${l.id}" ${open ? "" : "disabled"}>
          <span class="tg-lv-face"><img src="/thumbs/${l.face}.webp" alt="" loading="lazy" width="40" height="40"></span>
          <span class="tg-lv-copy"><b>${l.boss ? "Boss: " : ""}${esc(l.name)}</b><i>${open ? `${esc(l.rival)} · ${l.life} life` : "Clear the level before"}</i></span>
          <span class="tg-lv-stars" aria-label="${st} of 3 stars">${starsHtml(st)}</span></button></li>`;
      }).join("")}</ol></section>`).join("") +
      `<section class="tg-realm locked"><span class="tg-rtag">Realms 2 to 9</span><h3>Deeper in</h3><p>Each realm is a tier, with a God at the end of it. The Source waits at the last. They open in the next phase.</p>
       <div class="tg-soon">${soon.map(t => `<span>${t}</span>`).join("")}</div></section>`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-level]");
    if (b && !b.disabled) { sfx("tap"); begin(b.dataset.level); }
    if (e.target.closest("[data-to-hub]")) { $("[data-over]").hidden = true; hub(); }
  });

  /* ============================================================
     THE DRAFT
     ============================================================ */
  let draft = null;
  async function begin(level) {
    if (level === "tutorial") return startMatch({ level });
    screen("draft");
    const meta = MAP && MAP.realms.flatMap(r => r.levels).find(l => l.id === level);
    $("[data-draft-title]").textContent = meta ? `${level} · ${meta.name}` : level;
    $("[data-pick]").innerHTML = '<p class="tg-lede">Dealing&hellip;</p>';
    $("[data-start]").disabled = true; $("[data-draft-err]").hidden = true;
    const d = await post("deal", { level });
    if (d.error) { $("[data-pick]").innerHTML = ""; $("[data-draft-err]").textContent = d.error; $("[data-draft-err]").hidden = false; return; }
    draft = { level, deal: d.deal, cards: d.cards, picked: new Set() };
    $("[data-pick]").innerHTML = d.cards.map((c, i) => `<button type="button" data-pick-i="${i}" aria-pressed="false">${RC.html(c, { lazy: false })}</button>`).join("");
    $$("[data-pick-i]").forEach((b, i) => b.animate([{ opacity: 0, transform: "translateY(30px) rotate(-4deg)" }, { opacity: 1, transform: "none" }], { duration: pace(380), delay: i * 70, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
    // the strongest three to start with: the page suggests, you decide
    const worth = c => c.power + c.health + c.cost * 1.5 + c.kw.length + (c.text ? 1 : 0);
    d.cards.map((c, i) => [worth(c), i]).sort((a, b) => b[0] - a[0]).slice(0, 3).forEach(([, i]) => draft.picked.add(i));
    paintDraft();
  }
  function paintDraft() {
    $$("[data-pick-i]").forEach(b => {
      const on = draft.picked.has(Number(b.dataset.pickI));
      b.setAttribute("aria-pressed", String(on)); b.classList.toggle("full", draft.picked.size >= 3);
    });
    $("[data-start]").disabled = draft.picked.size !== 3;
  }
  $("[data-pick]").addEventListener("click", e => {
    const b = e.target.closest("[data-pick-i]"); if (!b || !draft) return;
    const i = Number(b.dataset.pickI);
    if (draft.picked.has(i)) draft.picked.delete(i); else if (draft.picked.size < 3) draft.picked.add(i);
    sfx("tap"); buzz(8); paintDraft();
  });
  $("[data-start]").addEventListener("click", () => {
    if (!draft || draft.picked.size !== 3) return;
    startMatch({ level: draft.level, deal: draft.deal, pick: [...draft.picked] });
  });

  /* ============================================================
     THE MATCH
     ============================================================ */
  let M = null;   // { id, level, name, rival, tutorial, defs, shared, view, busy, mode, ... }
  const tiles = [new Map(), new Map()];
  const handEls = new Map();

  async function startMatch(body) {
    $("[data-start]").disabled = true;
    const d = await post("start", body);
    if (d.error) {
      if (body.level === "tutorial") { alert(d.error); return; }
      $("[data-draft-err]").textContent = d.error; $("[data-draft-err]").hidden = false; $("[data-start]").disabled = false; return;
    }
    M = { id: d.match, level: d.level, name: d.name, rival: d.rival, boss: d.boss, tutorial: d.tutorial, defs: d.defs,
      shared: Object.fromEntries(d.shared.map(c => [c.id, c])), view: d.view, busy: true, mode: "idle", attack: new Set(), blocks: {}, blocker: null, aim: null, tips: new Set() };
    tiles.forEach(t => t.clear()); handEls.clear();
    $$("[data-board]").forEach(b => { b.innerHTML = ""; }); $("[data-hand]").innerHTML = "";
    $("[data-over]").hidden = true; hidePeek(); coach(null);
    $("[data-level-name]").textContent = (M.tutorial ? "Tutorial · " : M.level + " · ") + M.name;
    $('[data-name="1"]').textContent = M.rival;
    screen("match");
    render(M.view, { deal: true });
    await sleep(pace(500));
    if (!d.frames.length) await banner("You go first", 0);
    else { await banner("Rival goes first", 1); await playFrames(d.frames); }
    M.busy = false;
    if (d.result) return over(d.result);
    afterFrames();
  }

  /* ---------- drawing the table ---------- */
  const KWI = {
    flying: '<path d="M3 14c4-1 7-4 9-9 2 5 5 8 9 9-4 0-6 2-9 5-3-3-5-5-9-5z"/>',
    haste: '<path d="M13 2 5 13h6l-1 9 8-12h-6z"/>',
    veiled: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M4 20 20 4"/>',
    unblockable: '<path d="M3 12h15m-5-6 6 6-6 6"/>',
    lifelink: '<path d="M12 21 4 13a5 5 0 0 1 8-6 5 5 0 0 1 8 6z"/><path d="M12 9v6m-3-3h6"/>',
    poison: '<path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/>',
    freeze: '<path d="M12 2v20M3 7l18 10M21 7 3 17"/>',
    firstStrike: '<path d="M14 3h7v7L9 22l-3-3z"/>',
    doubleStrike: '<path d="M10 3h5v5L6 17l-2-2z"/><path d="M15 9h5v5l-9 9-2-2z"/>',
  };
  const tierCol = c => (c && c.tier && TIER_COL[c.tier]) || (c && c.kind === "token" ? "#7c6fb0" : "#8f82c4");
  function unitCard(u) {           // what a unit on the table is, as a full card
    if (u.n) {
      const side = [M.view.you, M.view.rival].find(s => s.board.some(x => x.uid === u.uid));
      const defs = side === M.view.rival ? M.defs.rival : M.defs.you;
      const d = defs.find(c => c.n === u.n) || {};
      return { ...d, power: u.power, health: u.health };
    }
    const d = M.shared[u.id] || {};
    return { ...d, kind: d.kind || "token", name: u.name, id: u.id, essence: u.essence, power: u.power, health: u.health, cost: d.cost || 0,
      text: d.text || u.kw.map(k => ({ firstStrike: "First strike", doubleStrike: "Double strike" }[k] || k[0].toUpperCase() + k.slice(1))).join(", ") };
  }
  function tileHtml(u) {
    const art = u.n ? `<img src="/thumbs/${u.n}.webp" alt="" decoding="async" width="224" height="224">` : RC.sigil(u.id, u.essence);
    return `<span class="tu-art">${art}</span><span class="tu-kw">${u.kw.map(k => KWI[k] ? `<i title="${k}"><svg viewBox="0 0 24 24">${KWI[k]}</svg></i>` : "").join("")}</span>
<span class="tu-p">${u.power}</span><span class="tu-h${u.health < u.maxHealth ? " hurt" : ""}">${u.health}</span>`;
  }
  function makeTile(u, side) {
    const el = document.createElement("button");
    el.type = "button"; el.className = "tu"; el.dataset.uid = u.uid; el.dataset.side = side;
    el.style.setProperty("--tc", u.token ? "#7c6fb0" : u.n ? TIER_COL[u.tier] || "#9ca3af" : "#8f82c4");
    el.setAttribute("aria-label", `${u.name}, ${u.power} power, ${u.health} health`);
    el.innerHTML = tileHtml(u);
    el._u = u;
    return el;
  }
  function paintTile(el, u, side, v) {
    if (el._sig !== JSON.stringify([u.power, u.health, u.maxHealth, u.kw])) { el.innerHTML = tileHtml(u); el._sig = JSON.stringify([u.power, u.health, u.maxHealth, u.kw]); }
    el._u = u;
    el.setAttribute("aria-label", `${u.name}, ${u.power} power, ${u.health} health${u.frozen ? ", frozen" : ""}`);
    const me = side === 0, idle = !M.busy && M.mode === "idle" && v.active === 0 && v.phase === "main";
    el.classList.toggle("champ", u.champion);
    el.classList.toggle("token", u.token);
    el.classList.toggle("sick", u.sick);
    el.classList.toggle("exhausted", u.exhausted && !(v.phase === "block" && v.pending && v.pending.attackers.includes(u.uid)));
    el.classList.toggle("frozen", u.frozen);
    el.classList.toggle("ready", me && idle && u.ready && !v.you.attacked);
    el.classList.toggle("pick", me && M.mode === "attack" && M.attack.has(u.uid));
    const attacking = v.phase === "block" && v.pending && v.pending.attackers.includes(u.uid);
    el.classList.toggle("attacking", attacking);
    el.style.setProperty("--lift", side === 1 ? "10px" : "-10px");
    const aim = M.mode === "target" && M.aim && M.aim.uids.includes(u.uid);
    el.classList.toggle("target", !!aim);
    // blocking
    const blocking = M.mode === "block";
    const canBlock = blocking && me && v.pending && Object.values(v.pending.can).some(l => l.includes(u.uid));
    el.classList.toggle("can-block", canBlock && M.blocker !== u.uid && !(u.uid in M.blocks));
    el.classList.toggle("blocker", blocking && me && (M.blocker === u.uid || u.uid in M.blocks));
    let tag = "";
    if (blocking && v.pending) {
      const order = v.pending.attackers;
      if (attacking) tag = String(order.indexOf(u.uid) + 1);
      if (me && u.uid in M.blocks) tag = String(order.indexOf(M.blocks[u.uid]) + 1);
    }
    let t = el.querySelector(".tu-tag");
    if (tag) { if (!t) { t = document.createElement("span"); t.className = "tu-tag"; el.appendChild(t); } t.textContent = tag; }
    else if (t) t.remove();
  }
  function paintBoard(side, units, v, addOnly) {
    const box = $(`[data-board="${side}"]`), map = tiles[side];
    box.style.setProperty("--n", Math.max(4, units.length));
    units.forEach((u, i) => {
      u.side = side;
      let el = map.get(u.uid);
      if (!el) {
        el = makeTile(u, side); map.set(u.uid, el);
        const before = box.children[i] || null; box.insertBefore(el, before);
        if (!REDUCED) { el.classList.add("arrive"); el.addEventListener("animationend", () => el.classList.remove("arrive"), { once: true }); }
        el._sig = JSON.stringify([u.power, u.health, u.maxHealth, u.kw]);
      }
      if (!addOnly) { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); paintTile(el, u, side, v); }
    });
    if (!addOnly) for (const [uid, el] of map) if (!units.some(u => u.uid === uid)) { if (!el.classList.contains("dying")) el.remove(); map.delete(uid); }
  }
  function paintSide(side, s, v) {
    $(`[data-life-n="${side}"]`).textContent = s.life;
    const max = Math.max(s.maxEss, s.ess), pips = [];
    for (let i = 0; i < Math.min(max, 10); i++) pips.push(`<i class="${i < s.ess ? "on" : "spent"}"></i>`);
    const essHtml = pips.join("") + `<em>${s.ess}/${s.maxEss}</em>`, essBox = $(`[data-ess="${side}"]`);
    if (essBox._h !== essHtml) essBox._h = essHtml, essBox.innerHTML = essHtml;
    if (side === 1) $('[data-handn="1"]').textContent = s.hand;
    else $('[data-deck="0"]').textContent = s.deck;
    const defs = side === 0 ? M.defs.you : M.defs.rival;
    const myMain = side === 0 && !M.busy && M.mode === "idle" && v.active === 0 && v.phase === "main";
    const chBox = $(`[data-champs="${side}"]`);
    const chSig = JSON.stringify([s.champions, myMain, s.ess, s.board.length]);
    if (chBox._sig !== chSig) chBox._sig = chSig, chBox.innerHTML = s.champions.map(c => {
      const d = defs[c.i] || {}, can = myMain && c.home && c.cost <= s.ess && s.board.length < 6;
      return `<button type="button" class="tm-ch${c.home ? "" : " out"}${can ? " can" : ""}" data-champ="${c.i}" data-cside="${side}" style="--tc:${TIER_COL[d.tier] || "#888"};--ec:${ESS_COL[(d.essence || ["light"])[0]]}" aria-label="${esc(d.name)}, costs ${c.cost}${c.home ? "" : ", on the board"}">
        <img src="/thumbs/${c.n}.webp" alt="" width="40" height="40"><b>${c.cost}</b></button>`;
    }).join("");
    $(`[data-side="${side}"]`).classList.toggle("turn", v.active === side && v.phase !== "over");
  }
  function attunedFor(def) { return M.view.you.board.some(u => (u.essence || []).some(e => (def.essence || []).includes(e))); }
  function playable(c) {
    const v = M.view, me = v.you;
    if (v.active !== 0 || v.phase !== "main") return "Wait for your turn.";
    if (c.cost > me.ess) return `It costs ${c.cost} essence. You have ${me.ess}.`;
    if (c.kind !== "ritual" && me.board.length >= 6) return "Your side is full.";
    if (c.kind === "ritual") {
      const e = attunedFor(c) && c.attuned ? c.attuned : c.effect;
      const a = aimFor(e);
      if (a && !a.uids.length && !a.face) return "There is nothing for it to hit yet.";
    }
    return null;
  }
  function paintHand(hand, deal) {
    const box = $("[data-hand]"), v = M.view;
    const keep = new Set(hand.map(c => c.uid));
    for (const [uid, el] of handEls) if (!keep.has(uid)) { el.remove(); handEls.delete(uid); }
    const fresh = [];
    hand.forEach((c, i) => {
      let el = handEls.get(c.uid);
      if (!el) {
        el = document.createElement("button"); el.type = "button"; el.className = "hc"; el.dataset.huid = c.uid;
        const ess = c.essence && c.essence.length ? c.essence : ["light"];
        el.style.setProperty("--tc", c.kind === "ritual" ? "#c9a24e" : "#8f82c4"); el.style.setProperty("--e1", ESS_COL[ess[0]]);
        el.innerHTML = `<span class="hc-cost">${c.cost}</span><span class="hc-in"><span class="hc-art">${RC.art(c, false)}</span><span class="hc-name">${esc(c.name)}</span>
          ${c.kind === "ritual" ? '<span class="hc-pt ritual">Ritual</span>' : `<span class="hc-pt"><span class="p">${c.power}</span><span class="h">${c.health}</span></span>`}</span>`;
        el.setAttribute("aria-label", `${c.name}, costs ${c.cost}`);
        handEls.set(c.uid, el); fresh.push(el);
      }
      el._c = c;
      if (el._cost !== c.cost) { el._cost = c.cost; el.querySelector(".hc-cost").textContent = c.cost; }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
    // the fan: sizes read once, then only what changed is written
    const n = hand.length;
    if (!paintHand.cw || paintHand.W !== box.clientWidth) { paintHand.W = box.clientWidth; const f = box.firstElementChild; paintHand.cw = f ? f.offsetWidth || 80 : 80; }
    const W = paintHand.W - 8, cw = paintHand.cw;
    const ov = n > 1 ? Math.min(4, (W - n * cw) / (n - 1)) : 0;
    const myIdle = !M.busy && M.mode === "idle" && v.active === 0 && v.phase === "main";
    hand.forEach((c, i) => {
      const el = handEls.get(c.uid), k = i - (n - 1) / 2;
      const why = playable(c), can = myIdle && !why;
      const sig = [ov, n > 3 ? k : 0, can, myIdle && !!why].join();
      if (el._fan === sig) return;
      el._fan = sig;
      el.style.setProperty("--ov", ov + "px");
      el.style.setProperty("--rot", (n > 3 ? k * 2.4 : 0) + "deg");
      el.classList.toggle("can", can);
      el.classList.toggle("no", myIdle && !!why);
      el.style.setProperty("--dy", (can ? -6 : 0) + Math.abs(k) * (n > 3 ? 2 : 0) + "px");
    });
    // new cards fly in from the deck (one read of positions, then the animations)
    if (fresh.length && !REDUCED) {
      const deck = $('[data-deck="0"]').getBoundingClientRect(), rects = fresh.map(el => el.getBoundingClientRect());
      fresh.forEach((el, j) => {
        const r = rects[j], delay = deal ? j * 110 : j * 90;
        el.animate([{ transform: `translate(${deck.left - r.left}px,${deck.top - r.top}px) scale(.35) rotate(25deg)`, opacity: 0 }],
          { duration: 420, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
        setTimeout(() => sfx("deal"), delay);
      });
    }
  }
  function render(v, opts = {}) {
    M.view = v;
    paintSide(1, v.rival, v); paintSide(0, v.you, v);
    paintBoard(1, v.rival.board, v, false); paintBoard(0, v.you.board, v, false);
    paintHand(v.you.hand, opts.deal);
    // the life orbs can be aimed at
    $('[data-life="1"]').classList.toggle("target", M.mode === "target" && !!(M.aim && M.aim.face));
    paintControls();
  }
  function paintControls() {
    const v = M.view, L = $("[data-left]"), R = $("[data-right]"), ph = $("[data-phase]");
    L.hidden = true; R.hidden = false; R.disabled = false; R.className = "tm-btn"; L.className = "tm-btn ghost";
    if (v.phase === "over") { R.hidden = true; ph.textContent = ""; return; }
    if (M.busy) { R.disabled = true; R.classList.add("wait"); R.textContent = v.active === 1 ? "Rival's turn…" : "…"; ph.innerHTML = v.active === 1 ? "Rival's turn" : "&nbsp;"; return; }
    if (M.mode === "target") {
      L.hidden = false; L.textContent = "Cancel"; R.hidden = true;
      ph.innerHTML = `<b>Choose a target</b> for ${esc(M.aim.name)}`; return;
    }
    if (M.mode === "attack") {
      L.hidden = false; L.textContent = "Cancel";
      R.classList.add("red"); R.textContent = M.attack.size ? `Attack with ${M.attack.size}` : "Pick attackers"; R.disabled = !M.attack.size;
      ph.innerHTML = "<b>Choose your attackers</b>"; return;
    }
    if (M.mode === "block") {
      const n = Object.keys(M.blocks).length;
      L.hidden = !n; L.textContent = "Clear";
      R.textContent = n ? `Block (${n})` : "No blocks";
      ph.innerHTML = M.blocker ? "<b>Now tap the attacker</b> to block" : "<b>Block!</b> Tap your unit, then an attacker";
      return;
    }
    const me = v.you, ready = me.board.some(u => u.ready) && !me.attacked;
    if (v.active === 0 && v.phase === "main") {
      if (ready) { L.hidden = false; L.className = "tm-btn red"; L.textContent = "Attack"; }
      R.textContent = "End turn";
      const anything = me.hand.some(c => !playable(c)) || me.champions.some(c => c.home && c.cost <= me.ess && me.board.length < 6);
      R.className = "tm-btn" + (anything || ready ? " ghost" : "");
      ph.innerHTML = `Your turn · <b>${me.ess}</b> essence`;
    } else { R.disabled = true; R.textContent = "…"; ph.textContent = ""; }
  }

  /* ---------- aiming ---------- */
  const needs = e => !e ? null : e.to === "anyTarget" ? "any" : e.to === "enemyUnit" ? "enemyUnit" : e.k === "buffUnit" ? "ownUnit" : null;
  function aimFor(e) {
    const kind = needs(e); if (!kind) return null;
    const v = M.view;
    if (kind === "ownUnit") return { uids: v.you.board.map(u => u.uid), face: false };
    const uids = v.rival.board.filter(u => (e.maxCost == null || u.cost <= e.maxCost) && (e.maxPower == null || u.power <= e.maxPower)).map(u => u.uid);
    return { uids, face: kind === "any" };
  }
  function tryPlay(ref) {
    // ref: { uid } from hand, or { champion } ; def: the card
    const def = ref.def;
    let e = null;
    if (def.kind === "ritual") e = attunedFor(def) && def.attuned ? def.attuned : def.effect;
    else e = (def.arrive || []).find(x => needs(x));
    const aim = e ? aimFor(e) : null;
    if (aim && (aim.uids.length || aim.face)) {
      M.mode = "target"; M.aim = { ...aim, ref, name: def.name };
      render(M.view); coachCheck();
      return;
    }
    send({ type: "play", ...(ref.champion != null ? { champion: ref.champion } : { uid: ref.uid }) });
  }

  /* ---------- taps ---------- */
  function showPeek(card, opts = {}) {
    $("[data-peek-card]").innerHTML = RC.html(card, { cost: opts.cost, lazy: false });
    const b = $("[data-peek-play]");
    b.hidden = !opts.action; b.textContent = opts.action || ""; b.disabled = !!opts.why;
    $("[data-peek-why]").textContent = opts.why || opts.note || "";
    M.peekGo = opts.go || null;
    $("[data-peek]").hidden = false;
  }
  function hidePeek() { $("[data-peek]").hidden = true; if (M) M.peekGo = null; }
  $$("[data-peek-close]").forEach(b => b.addEventListener("click", hidePeek));
  $("[data-peek-play]").addEventListener("click", () => { const go = M.peekGo; hidePeek(); if (go) { sfx("tap"); go(); } });

  $("[data-hand]").addEventListener("click", e => {
    const el = e.target.closest("[data-huid]"); if (!el || !M) return;
    const c = el._c; sfx("tap");
    if (M.busy || M.mode !== "idle") return showPeek(c, { cost: c.cost });
    const why = playable(c);
    showPeek(c, { cost: c.cost, action: c.kind === "ritual" ? `Cast · ${c.cost}` : `Summon · ${c.cost}`, why, go: () => tryPlay({ uid: c.uid, def: c }) });
  });
  document.addEventListener("click", e => {
    const ch = e.target.closest("[data-champ]"); if (!ch || !M) return;
    const side = Number(ch.dataset.cside), i = Number(ch.dataset.champ), s = side ? M.view.rival : M.view.you, c = s.champions[i];
    const def = (side ? M.defs.rival : M.defs.you)[i]; sfx("tap");
    if (side === 1 || M.busy || M.mode !== "idle") return showPeek(def, { cost: c.cost, note: c.home ? (side ? "The rival's champion, waiting." : "") : "On the board." });
    let why = null;
    if (!c.home) why = "Already on the board.";
    else if (M.view.active !== 0 || M.view.phase !== "main") why = "Wait for your turn.";
    else if (c.cost > M.view.you.ess) why = `It costs ${c.cost} essence. You have ${M.view.you.ess}.`;
    else if (M.view.you.board.length >= 6) why = "Your side is full.";
    showPeek(def, { cost: c.cost, action: `Summon · ${c.cost}`, why, note: c.cost > def.cost ? "It died once already, so it costs more now." : "", go: () => tryPlay({ champion: i, def }) });
  });
  $$("[data-board]").forEach(box => box.addEventListener("click", e => {
    const el = e.target.closest("[data-uid]"); if (!el || !M) return;
    const uid = Number(el.dataset.uid), side = Number(el.dataset.side), v = M.view;
    if (!M.busy && M.mode === "target" && M.aim.uids.includes(uid)) return aimAt({ uid });
    if (!M.busy && M.mode === "attack" && side === 0) {
      const u = v.you.board.find(x => x.uid === uid);
      if (u && u.ready) { M.attack.has(uid) ? M.attack.delete(uid) : M.attack.add(uid); sfx("tap"); buzz(6); render(v); return; }
    }
    if (!M.busy && M.mode === "block") {
      const can = v.pending ? v.pending.can : {};
      if (side === 0 && Object.values(can).some(l => l.includes(uid))) {
        if (uid in M.blocks) { delete M.blocks[uid]; M.blocker = null; }
        else M.blocker = M.blocker === uid ? null : uid;
        sfx("tap"); buzz(6); render(v); return;
      }
      if (side === 1 && v.pending.attackers.includes(uid) && M.blocker != null) {
        if ((can[uid] || []).includes(M.blocker)) { M.blocks[M.blocker] = uid; M.blocker = null; sfx("tap"); buzz(10); render(v); }
        else toast("That unit can't block this one.");
        return;
      }
    }
    sfx("tap");
    showPeek(unitCard(el._u), { cost: el._u.cost, note: [el._u.frozen && "Frozen: it can't attack next turn.", el._u.sick && "Just arrived: it can attack next turn.", el._u.exhausted && "It attacked: it can't block until its next turn."].filter(Boolean).join(" ") });
  }));
  $('[data-life="1"]').addEventListener("click", () => { if (M && !M.busy && M.mode === "target" && M.aim.face) aimAt({ face: 1 }); });
  function aimAt(target) {
    const ref = M.aim.ref; M.mode = "idle"; M.aim = null;
    send({ type: "play", ...(ref.champion != null ? { champion: ref.champion } : { uid: ref.uid }), target });
  }
  $("[data-left]").addEventListener("click", () => {
    if (!M || M.busy) return; sfx("tap");
    if (M.mode === "target") { M.mode = "idle"; M.aim = null; }
    else if (M.mode === "attack") { M.mode = "idle"; M.attack.clear(); }
    else if (M.mode === "block") { M.blocks = {}; M.blocker = null; }
    else if (M.view.active === 0) { M.mode = "attack"; M.attack = new Set(M.view.you.board.filter(u => u.ready).map(u => u.uid)); buzz(8); }
    render(M.view); coachCheck();
  });
  $("[data-right]").addEventListener("click", () => {
    if (!M || M.busy) return; sfx("tap");
    if (M.mode === "attack") { const a = [...M.attack]; M.mode = "idle"; M.attack.clear(); return send({ type: "attack", attackers: a }); }
    if (M.mode === "block") { const b = M.blocks; M.mode = "idle"; M.blocks = {}; M.blocker = null; return send({ type: "block", blocks: b }); }
    if (M.view.active === 0 && M.view.phase === "main") return send({ type: "end" });
  });
  $("[data-resign]").addEventListener("click", () => {
    if (!M) return hub();
    if (M.view.phase === "over") return hub();
    if (confirm("Leave this match? It counts as a loss.")) { M.busy = false; send({ type: "resign" }); }
  });
  let toastT;
  function toast(t) { $("[data-phase]").textContent = t; clearTimeout(toastT); toastT = setTimeout(() => paintControls(), 1800); }

  /* ---------- a move, and what came of it ---------- */
  async function send(move) {
    M.busy = true; hidePeek(); coach(null); render(M.view);
    const d = await post("act", { match: M.id, move });
    if (d.error) {
      M.busy = false;
      if (d.view) render(d.view); else paintControls();
      toast(d.error);
      if (d.result) over(d.result);
      return;
    }
    await playFrames(d.frames);
    M.busy = false;
    if (d.result) return over(d.result);
    afterFrames();
  }
  function afterFrames() {
    const v = M.view;
    M.mode = v.phase === "block" && v.active === 1 ? "block" : "idle";
    M.blocks = {}; M.blocker = null;
    if (M.mode === "block") { buzz([20, 40, 20]); sfx("whoosh"); }
    render(v);
    coachCheck();
  }

  /* ---------- the animation player ---------- */
  const fxLayer = () => $("[data-fx]");
  const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
  const tileOf = uid => tiles[0].get(uid) || tiles[1].get(uid) || null;
  const lifeEl = p => $(`[data-life="${p}"]`);
  function floatText(el, text, cls) {
    if (!el) return;
    const c = centre(el), s = document.createElement("span");
    s.className = "fx-num " + cls; s.textContent = text; s.style.left = c.x + "px"; s.style.top = c.y + "px";
    fxLayer().appendChild(s);
    s.animate([{ transform: "translate(-50%,-50%) scale(.6)", opacity: 0 }, { transform: "translate(-50%,-80%) scale(1.25)", opacity: 1, offset: .18 }, { transform: "translate(-50%,-190%) scale(1)", opacity: 0 }],
      { duration: pace(950), easing: "cubic-bezier(.2,.8,.2,1)" }).onfinish = () => s.remove();
  }
  function sparks(el, col, n = 10) {
    if (!el || REDUCED) return;
    const c = centre(el);
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span"); s.className = "fx-spark"; s.style.left = c.x + "px"; s.style.top = c.y + "px"; s.style.setProperty("--c", col);
      fxLayer().appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 36;
      s.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.2)`, opacity: 0 }],
        { duration: 420 + Math.random() * 200, easing: "cubic-bezier(.1,.7,.3,1)" }).onfinish = () => s.remove();
    }
  }
  function ring(el, col) {
    if (!el || REDUCED) return;
    const c = centre(el), s = document.createElement("span"); s.className = "fx-ring"; s.style.left = c.x + "px"; s.style.top = c.y + "px"; s.style.setProperty("--c", col);
    fxLayer().appendChild(s);
    s.animate([{ transform: "scale(.3)", opacity: 1 }, { transform: "scale(1.6)", opacity: 0 }], { duration: 520, easing: "ease-out" }).onfinish = () => s.remove();
  }
  function jolt(el) { if (el && !REDUCED) el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }], { duration: 260, composite: "add" }); }
  function shakeScreen() { if (REDUCED) return; const t = $(".tm"); t.classList.remove("shake"); void t.offsetWidth; t.classList.add("shake"); }
  function bumpLife(p, d) {
    const b = $(`[data-life-n="${p}"]`); const n = Number(b.textContent) + d; b.textContent = n;
    b.animate([{ transform: "scale(1.5)" }, { transform: "scale(1)" }], { duration: 300, easing: "ease-out" });
  }
  async function banner(text, p) {
    const b = $("[data-banner]");
    b.textContent = text; b.classList.toggle("rival", p === 1); b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
    sfx(p === 1 ? "rival" : "turn"); if (p === 0) buzz(12);
    await sleep(pace(800));
  }
  async function castFx(e) {
    const def = M.shared[e.id]; if (!def) return;
    sfx("cast");
    const wrap = document.createElement("div"); wrap.className = "fx-cast"; wrap.innerHTML = RC.html(def, { lazy: false });
    fxLayer().appendChild(wrap);
    const from = e.p === 0 ? "translate(-50%, 60vh)" : "translate(-50%, -60vh)";
    await wrap.animate([{ transform: from + " scale(.5) rotate(-8deg)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], { duration: pace(380), easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }).finished;
    await sleep(pace(e.p === 0 ? 300 : 700));
    const t = e.target && (e.target.uid != null ? tileOf(e.target.uid) : e.target.face != null ? lifeEl(e.target.face) : null);
    if (t) { const c = centre(t), w = centre(wrap); wrap.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${c.x - w.x}px), calc(-50% + ${c.y - w.y}px)) scale(.15)`, opacity: .2 }], { duration: pace(300), easing: "ease-in", fill: "forwards" }); await sleep(pace(280)); ring(t, "#ffd65c"); }
    else { wrap.animate([{ opacity: 1, transform: "translate(-50%,-50%) scale(1)" }, { opacity: 0, transform: "translate(-50%,-50%) scale(1.25)" }], { duration: pace(320), fill: "forwards" }); await sleep(pace(260)); }
    wrap.remove();
  }
  async function clashFx(pairs) {
    sfx("whoosh");
    const anims = pairs.map((p, i) => {
      const a = tileOf(p.a); if (!a) return null;
      const side = Number(a.dataset.side), tgt = p.b != null ? tileOf(p.b) : lifeEl(1 - side);
      if (!tgt) return null;
      const ca = centre(a), ct = centre(tgt), dx = (ct.x - ca.x) * .78, dy = (ct.y - ca.y) * .78;
      const base = getComputedStyle(a).transform; const b0 = base === "none" ? "" : base;
      setTimeout(() => { sparks(tgt, p.b != null ? "#ff9a5c" : "#ff5470", 8); jolt(tgt); }, pace(210) + i * 70);
      return a.animate([{ transform: b0 || "none" }, { transform: `translate(${dx}px,${dy}px) scale(1.12)`, offset: .45 }, { transform: b0 || "none" }],
        { duration: pace(480), delay: i * 70, easing: "cubic-bezier(.5,0,.3,1)" }).finished;
    }).filter(Boolean);
    await Promise.all(anims);
  }
  function dieFx(uid) {
    const el = tileOf(uid); if (!el) return;
    sparks(el, "#c9b8ff", 14);
    el.classList.add("dying");
    tiles[Number(el.dataset.side)].delete(uid);
    setTimeout(() => el.remove(), 480);
  }
  async function playEvents(evs) {
    let parallel = false;
    const flush = async () => { if (parallel) { parallel = false; await sleep(pace(420)); } };
    for (const e of evs) {
      switch (e.t) {
        case "turn": await flush(); await banner(e.p === 0 ? "Your turn" : "Rival's turn", e.p); break;
        case "summon": {
          await flush();
          const el = tileOf(e.uid), champ = e.n && el && el._u && el._u.champion;
          sfx(champ ? "champ" : "summon"); if (champ) buzz(15);
          ring(el, champ ? "#ffd65c" : "#c9b8ff"); if (champ) sparks(el, "#ffd65c", 12);
          await sleep(pace(champ ? 420 : 260)); break;
        }
        case "cast": await flush(); await castFx(e); break;
        case "attack": await flush(); e.attackers.forEach(uid => { const t = tileOf(uid); if (t) t.classList.add("attacking"); }); sfx("whoosh"); await sleep(pace(320)); break;
        case "clash": await flush(); await clashFx(e.pairs); break;
        case "damage": { const t = tileOf(e.uid); floatText(t, "-" + e.n, "dmg"); jolt(t); sfx("hit"); parallel = true; break; }
        case "face": floatText(lifeEl(e.p), "-" + e.n, "dmg"); bumpLife(e.p, -e.n); sfx("hit"); jolt(lifeEl(e.p)); if (e.p === 0) { shakeScreen(); buzz(30); } parallel = true; break;
        case "heal": floatText(lifeEl(e.p), "+" + e.n, "heal"); bumpLife(e.p, e.n); sfx("heal"); parallel = true; break;
        case "mend": floatText(tileOf(e.uid), "+" + e.n, "heal"); parallel = true; break;
        case "freeze": { const t = tileOf(e.uid); if (t) { t.classList.add("frozen"); sparks(t, "#9fe8ff", 8); } sfx("freeze"); parallel = true; break; }
        case "buff": { const t = tileOf(e.uid); ring(t, "#ffd65c"); sparks(t, "#ffd65c", 6); sfx("heal"); parallel = true; break; }
        case "death": await flush(); dieFx(e.uid); sfx("death"); buzz(15); await sleep(pace(220)); break;
        case "bounce": { await flush(); const t = tileOf(e.uid); if (t) { t.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-40px) scale(.6)" }], { duration: 380, fill: "forwards" }); tiles[Number(t.dataset.side)].delete(e.uid); setTimeout(() => t.remove(), 400); } await sleep(pace(300)); break; }
        case "burn": floatText($('[data-deck="0"]'), "Burned", "info"); break;
        case "draw": break;   // the hand animates its new cards
        case "over": break;
      }
    }
    await flush();
  }
  async function playFrames(frames) {
    for (const f of frames) {
      M.view = f.view;
      // new units appear first, so the events can point at them
      paintBoard(1, f.view.rival.board, f.view, true); paintBoard(0, f.view.you.board, f.view, true);
      await playEvents(f.ev);
      render(f.view);
      if (f.who === 1) await sleep(pace(260));
    }
  }

  /* ---------- the end ---------- */
  function over(res) {
    const won = res.won, o = $("[data-over]");
    if (M.level === "tutorial" && won) progress.tutorial = true;
    if (won && M.level !== "tutorial") progress.stars[M.level] = Math.max(progress.stars[M.level] || 0, res.stars);
    store.set("progress", progress);
    o.classList.toggle("lost", !won);
    $("[data-over-sub]").textContent = M.tutorial ? "Tutorial" : `${M.level} · ${M.name}`;
    $("[data-over-title]").textContent = won ? (M.boss ? "Boss down!" : "Victory") : "Defeat";
    $("[data-stars]").innerHTML = M.tutorial ? "" : [0, 1, 2].map(() => '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z"/></svg>').join("");
    $("[data-over-note]").textContent = won
      ? (M.tutorial ? "You know the basics. The Spore Fields are open." : `Won in ${res.turns} turns with ${res.life} life left. Stars: a win, half your life or more, and a win by turn 16.`)
      : (M.tutorial ? "Try again: summon early, and attack when the rival has no good blocks." : "Your borrowed spirits fell. Deal again and try another three.");
    const order = levelOrder(), next = M.tutorial ? order[0] : order[order.indexOf(M.level) + 1];
    const nb = $("[data-next]"); nb.hidden = !(won && next); nb.onclick = () => { o.hidden = true; begin(next); };
    $("[data-retry]").onclick = () => { o.hidden = true; begin(M.level); };
    o.hidden = false;
    sfx(won ? "win" : "lose"); buzz(won ? [30, 60, 30, 60, 80] : [80]);
    if (won && !M.tutorial) $$("[data-stars] svg").forEach((s, i) => { if (i < res.stars) setTimeout(() => { s.classList.add("on"); sfx("star"); buzz(12); }, 450 + i * 320); });
  }

  /* ---------- the tutorial coach ---------- */
  const TIPS = [
    { id: "hello", when: v => v.turn <= 1, at: "top", text: "Bring the rival's life (top) to 0 before they do it to yours (bottom). Essence, the gold diamonds, pays for cards and grows by one each turn." },
    { id: "play", when: v => v.you.hand.some(c => !playable(c) && c.kind !== "ritual"), text: "Tap a glowing card in your hand, then Summon. Spore Wisp costs 1." },
    { id: "end", when: v => v.turn <= 2 && v.you.ess === 0, text: "Units can't attack on the turn they arrive. Tap End turn." },
    { id: "champ", when: v => v.you.champions.some(c => c.home && c.cost <= v.you.ess), text: "These three by your life are your champions: your beings. Tap a glowing one to summon it. If it dies it comes back, for 2 more." },
    { id: "attack", when: v => v.you.board.some(u => u.ready) && !v.you.attacked, text: "Your units are ready. Tap Attack, choose who goes, then attack. Units that attack can't block on the rival's turn." },
    { id: "block", when: () => M.mode === "block", at: "top", text: "The rival attacks! Tap one of your units, then the attacker it should block. Or tap No blocks to take the hit." },
    { id: "ritual", when: v => v.you.hand.some(c => c.kind === "ritual" && !playable(c)), text: "Rituals are spells, used once. Lightning Strike deals 3 to a unit or to the rival. Rituals grow stronger when a unit of their colour is on your side." },
    { id: "aim", when: () => M.mode === "target", at: "top", text: "Tap a glowing target. To hit the rival, tap their life." },
  ];
  let coachTip = null;
  function coach(tip) {
    const c = $("[data-coach]");
    coachTip = tip;
    if (!tip) { c.hidden = true; return; }
    $("[data-coach-text]").textContent = tip.text;
    c.classList.toggle("top", tip.at === "top");
    c.hidden = false;
  }
  function coachCheck() {
    if (!M || !M.tutorial || M.busy) return coach(null);
    const v = M.view;
    if (coachTip && !M.tips.has(coachTip.id) && coachTip.when(v)) return;
    const t = TIPS.find(t => !M.tips.has(t.id) && t.when(v));
    coach(t || null);
  }
  $("[data-coach-ok]").addEventListener("click", () => { if (coachTip) M.tips.add(coachTip.id); coach(null); sfx("tap"); setTimeout(coachCheck, 250); });

  window.addEventListener("resize", () => { paintHand.cw = 0; if (M && !$("[data-screen=match]").hidden) { handEls.forEach(el => { el._fan = null; }); render(M.view); } });
  hub();
})();
