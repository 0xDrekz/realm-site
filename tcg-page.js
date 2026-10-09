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
      shared: Object.fromEntries(d.shared.map(c => [c.id, c])), view: d.view, busy: true, mode: "idle", hold: new Set(), blocks: {}, aim: null, tips: new Set(), saying: false };
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
    const canGo = me && idle && u.ready && !v.you.attacked;
    el.classList.toggle("ready", canGo && !M.hold.has(u.uid));
    el.classList.toggle("hold", canGo && M.hold.has(u.uid));
    const attacking = v.phase === "block" && v.pending && v.pending.attackers.includes(u.uid);
    el.classList.toggle("attacking", attacking);
    el.style.setProperty("--lift", side === 1 ? "10px" : "-10px");
    const aim = M.mode === "target" && M.aim && M.aim.uids.includes(u.uid);
    el.classList.toggle("target", !!aim);
    // blocking
    const blocking = M.mode === "block";
    const canBlock = blocking && me && v.pending && Object.values(v.pending.can).some(l => l.includes(u.uid));
    el.classList.toggle("can-block", canBlock && !(u.uid in M.blocks));
    el.classList.toggle("blocker", blocking && me && u.uid in M.blocks);
    let tag = "";
    if (blocking && v.pending) {
      const order = v.pending.attackers;
      if (attacking) tag = String(order.indexOf(u.uid) + 1);
      if (me && u.uid in M.blocks) tag = String(order.indexOf(M.blocks[u.uid]) + 1);
    }
    let t = el.querySelector(".tu-tag");
    if (tag) { if (!t) { t = document.createElement("span"); t.className = "tu-tag"; el.appendChild(t); } t.textContent = tag; }
    else if (t) t.remove();
    // a word on top of the unit: what it can do now
    const st = tag ? "" : canGo ? (M.hold.has(u.uid) ? "Stays" : "Ready") : u.frozen ? "Frozen" : (u.exhausted && !attacking) ? "Tired" : u.sick ? "New" : (blocking && me && u.uid in M.blocks) ? "Blocks" : "";
    let pill = el.querySelector(".tu-st");
    if (st) { if (!pill) { pill = document.createElement("span"); pill.className = "tu-st"; el.appendChild(pill); } pill.textContent = st; pill.dataset.k = st.toLowerCase(); }
    else if (pill) pill.remove();
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
    const essHtml = pips.join("") + `<em>${s.ess} of ${s.maxEss} essence</em>`, essBox = $(`[data-ess="${side}"]`);
    if (essBox._h !== essHtml) essBox._h = essHtml, essBox.innerHTML = essHtml;
    if (side === 1) $('[data-handn="1"]').textContent = s.hand;
    else $('[data-deck="0"]').textContent = s.deck;
    const defs = side === 0 ? M.defs.you : M.defs.rival;
    const myMain = side === 0 && !M.busy && M.mode === "idle" && v.active === 0 && v.phase === "main";
    const chBox = $(`[data-champs="${side}"]`);
    if (!chBox) { $(`[data-side="${side}"]`).classList.toggle("turn", v.active === side && v.phase !== "over"); return; }
    const chSig = JSON.stringify([s.champions, myMain, s.ess, s.board.length]);
    if (chBox._sig !== chSig) chBox._sig = chSig, chBox.innerHTML = s.champions.map(c => {
      const d = defs[c.i] || {}, can = myMain && c.home && c.cost <= s.ess && s.board.length < 6;
      return `<button type="button" class="tm-ch${c.home ? "" : " out"}${can ? " can" : ""}" data-champ="${c.i}" data-cside="${side}" style="--tc:${TIER_COL[d.tier] || "#888"};--ec:${ESS_COL[(d.essence || ["light"])[0]]}" aria-label="${esc(d.name)}, costs ${c.cost}${c.home ? "" : ", on the board"}">
        <img src="/thumbs/${c.n}.webp" alt="" width="40" height="40"><b>${c.cost}</b></button>`;
    }).join("");
    $(`[data-side="${side}"]`).classList.toggle("turn", v.active === side && v.phase !== "over");
  }
  function attunedFor(def) { return M.view.you.board.some(u => (u.essence || []).some(e => (def.essence || []).includes(e))); }
  /* your hand: champions waiting (gold, at the front), then your cards */
  function handItems(v) {
    const champs = v.you.champions.filter(c => c.home).map(c => ({ key: "c" + c.i, champion: c.i, def: M.defs.you[c.i], cost: c.cost, kind: "unit", champ: true }));
    return champs.concat(v.you.hand.map(c => ({ key: "h" + c.uid, uid: c.uid, def: c, cost: c.cost, kind: c.kind })));
  }
  function playable(c) {
    const v = M.view, me = v.you;
    if (v.active !== 0 || v.phase !== "main") return "Wait for your turn.";
    if (c.cost > me.ess) return `It costs ${c.cost} essence. You have ${me.ess}.`;
    if (c.kind !== "ritual" && me.board.length >= 6) return "Your side is full.";
    if (c.kind === "ritual") {
      const d = c.def || c, e = attunedFor(d) && d.attuned ? d.attuned : d.effect;
      const a = aimFor(e);
      if (a && !a.uids.length && !a.face) return "There is nothing for it to hit yet.";
    }
    return null;
  }
  function paintHand(hand, deal) {
    const box = $("[data-hand]"), v = M.view;
    const items = handItems(v);
    const keep = new Set(items.map(c => c.key));
    for (const [k, el] of handEls) if (!keep.has(k)) { el.remove(); handEls.delete(k); }
    const fresh = [];
    items.forEach((c, i) => {
      let el = handEls.get(c.key);
      if (!el) {
        const d = c.def, ess = d.essence && d.essence.length ? d.essence : ["light"];
        el = document.createElement("button"); el.type = "button"; el.className = "hc" + (c.champ ? " champ" : ""); el.dataset.hkey = c.key;
        el.style.setProperty("--tc", c.champ ? (TIER_COL[d.tier] || "#e3ba5c") : c.kind === "ritual" ? "#c9a24e" : "#8f82c4"); el.style.setProperty("--e1", ESS_COL[ess[0]]);
        el.innerHTML = `${c.champ ? '<span class="hc-rib">Champion</span>' : ""}<span class="hc-cost">${c.cost}</span><span class="hc-in"><span class="hc-art">${RC.art(d, false)}</span><span class="hc-name">${esc(d.name)}</span>
          ${c.kind === "ritual" ? '<span class="hc-pt ritual">Ritual</span>' : `<span class="hc-pt"><span class="p">${d.power}</span><span class="h">${d.health}</span></span>`}</span>`;
        el.setAttribute("aria-label", `${c.champ ? "Champion " : ""}${d.name}, costs ${c.cost}`);
        handEls.set(c.key, el); fresh.push(el);
      }
      el._c = c;
      if (el._cost !== c.cost) { el._cost = c.cost; el.querySelector(".hc-cost").textContent = c.cost; }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
    hand = items;
    // the fan: sizes read once, then only what changed is written
    const n = hand.length;
    if (!paintHand.cw || paintHand.W !== box.clientWidth) { paintHand.W = box.clientWidth; const f = box.firstElementChild; paintHand.cw = f ? f.offsetWidth || 80 : 80; }
    const W = paintHand.W - 8, cw = paintHand.cw;
    const ov = n > 1 ? Math.min(4, (W - n * cw) / (n - 1)) : 0;
    const myIdle = !M.busy && M.mode === "idle" && v.active === 0 && v.phase === "main";
    hand.forEach((c, i) => {
      const el = handEls.get(c.key), k = i - (n - 1) / 2;
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
    if (!M.busy) coachCheck();
  }
  const goers = v => v.you.board.filter(u => u.ready && !M.hold.has(u.uid)).map(u => u.uid);
  function paintControls() {
    const v = M.view, L = $("[data-left]"), R = $("[data-right]"), ph = $("[data-phase]");
    L.hidden = true; R.hidden = false; R.disabled = false; R.className = "tm-btn"; L.className = "tm-btn ghost";
    if (v.phase === "over") { R.hidden = true; ph.textContent = ""; return; }
    if (M.busy) { R.disabled = true; R.classList.add("wait"); R.textContent = v.active === 1 ? "Rival's turn…" : "…"; if (!M.saying) ph.innerHTML = v.active === 1 ? "Rival's turn" : "&nbsp;"; return; }
    if (M.mode === "target") {
      L.hidden = false; L.textContent = "Cancel"; R.hidden = true;
      ph.innerHTML = `<b>Tap a glowing target</b> for ${esc(M.aim.name)}`; return;
    }
    if (M.mode === "block") {
      const n = Object.keys(M.blocks).length;
      L.hidden = !n; L.textContent = "No blocks";
      R.textContent = n ? `Confirm ${n === 1 ? "block" : n + " blocks"}` : "Take the hit";
      ph.innerHTML = n ? "<b>Rival attacks!</b> Blue = your blockers. Tap a unit to change" : "<b>Rival attacks!</b> Tap your units to block";
      return;
    }
    const me = v.you;
    if (v.active === 0 && v.phase === "main") {
      const go = me.attacked ? [] : goers(v);
      if (go.length) { L.hidden = false; L.className = "tm-btn red"; L.textContent = `Attack (${go.length})`; }
      R.textContent = "End turn";
      const anything = handItems(v).some(c => !playable(c));
      R.className = "tm-btn" + (anything || go.length ? " ghost" : "");
      ph.innerHTML = go.length ? "Your turn · <b>Ready</b> units can attack" : anything ? "Your turn · play a <b>glowing</b> card" : "Your turn · nothing left to do: <b>End turn</b>";
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
    coachCheck();
  }
  function hidePeek() { $("[data-peek]").hidden = true; if (M) { M.peekGo = null; coachCheck(); } }
  $$("[data-peek-close]").forEach(b => b.addEventListener("click", hidePeek));
  $("[data-peek-play]").addEventListener("click", () => { const go = M.peekGo; hidePeek(); if (go) { sfx("tap"); go(); } });

  $("[data-hand]").addEventListener("click", e => {
    const el = e.target.closest("[data-hkey]"); if (!el || !M) return;
    const c = el._c; sfx("tap");
    const note = c.champ ? (c.cost > c.def.cost ? "Your champion. It died once already, so it costs more now." : "Your champion: one of your beings. If it dies it comes back here, for 2 more.") : "";
    if (M.busy || M.mode !== "idle") return showPeek(c.def, { cost: c.cost, note });
    const why = playable(c);
    showPeek(c.def, { cost: c.cost, note, action: c.kind === "ritual" ? `Cast · ${c.cost} essence` : `Summon · ${c.cost} essence`, why,
      go: () => tryPlay(c.champ ? { champion: c.champion, def: c.def } : { uid: c.uid, def: c.def }) });
  });
  document.addEventListener("click", e => {
    const ch = e.target.closest("[data-champ]"); if (!ch || !M) return;
    const i = Number(ch.dataset.champ), c = M.view.rival.champions[i], def = M.defs.rival[i]; sfx("tap");
    showPeek(def, { cost: c.cost, note: c.home ? "The rival's champion, waiting to be summoned." : "The rival's champion, on the board." });
  });
  $$("[data-board]").forEach(box => box.addEventListener("click", e => {
    const el = e.target.closest("[data-uid]"); if (!el || !M) return;
    const uid = Number(el.dataset.uid), side = Number(el.dataset.side), v = M.view;
    if (!M.busy && M.mode === "target" && M.aim.uids.includes(uid)) return aimAt({ uid });
    // your turn: tap a ready unit to keep it back (or send it again)
    if (!M.busy && M.mode === "idle" && side === 0 && v.active === 0 && v.phase === "main" && !v.you.attacked) {
      const u = v.you.board.find(x => x.uid === uid);
      if (u && u.ready) { M.hold.has(uid) ? M.hold.delete(uid) : M.hold.add(uid); sfx("tap"); buzz(6); render(v); return; }
    }
    // blocking: tap your unit to block (again to block the next attacker, then to stop)
    if (!M.busy && M.mode === "block" && side === 0 && v.pending) {
      const atks = v.pending.attackers.filter(a => (v.pending.can[a] || []).includes(uid));
      if (atks.length) {
        if (uid in M.blocks) { const k = atks.indexOf(M.blocks[uid]); if (k + 1 < atks.length) M.blocks[uid] = atks[k + 1]; else delete M.blocks[uid]; }
        else M.blocks[uid] = atks[0];
        sfx("tap"); buzz(8); render(v); return;
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
    else if (M.mode === "block") { M.blocks = {}; }
    else if (M.view.active === 0 && M.view.phase === "main") { const a = goers(M.view); if (a.length) { buzz(10); return send({ type: "attack", attackers: a }); } }
    render(M.view); coachCheck();
  });
  $("[data-right]").addEventListener("click", () => {
    if (!M || M.busy) return; sfx("tap");
    if (M.mode === "block") { const b = M.blocks; M.mode = "idle"; M.blocks = {}; return send({ type: "block", blocks: b }); }
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
    M.blocks = M.mode === "block" ? { ...((v.pending && v.pending.suggest) || {}) } : {};
    M.hold = new Set(); M.saying = false;
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
  const whoName = p => p === 0 ? "You" : "Rival";
  function say(t) { M.saying = true; $("[data-phase]").innerHTML = t; }
  async function playEvents(evs) {
    let parallel = false;
    const flush = async () => { if (parallel) { parallel = false; await sleep(pace(420)); } };
    for (const e of evs) {
      switch (e.t) {
        case "turn": await flush(); await banner(e.p === 0 ? "Your turn" : "Rival's turn", e.p); break;
        case "summon": {
          await flush();
          const el = tileOf(e.uid), champ = e.n && el && el._u && el._u.champion;
          if (el) say(`${whoName(Number(el.dataset.side))} ${Number(el.dataset.side) ? "summons" : "summon"} <b>${esc(e.name)}</b>${champ ? " (champion)" : ""}`);
          sfx(champ ? "champ" : "summon"); if (champ) buzz(15);
          ring(el, champ ? "#ffd65c" : "#c9b8ff"); if (champ) sparks(el, "#ffd65c", 12);
          await sleep(pace(champ ? 420 : 260)); break;
        }
        case "cast": await flush(); say(`${whoName(e.p)} ${e.p ? "casts" : "cast"} <b>${esc((M.shared[e.id] || {}).name || "a ritual")}</b>`); await castFx(e); break;
        case "attack": await flush(); say(`${whoName(e.p)} ${e.p ? "attacks" : "attack"} with <b>${e.attackers.length}</b>`); e.attackers.forEach(uid => { const t = tileOf(uid); if (t) t.classList.add("attacking"); }); sfx("whoosh"); await sleep(pace(320)); break;
        case "clash": await flush(); await clashFx(e.pairs); break;
        case "damage": { const t = tileOf(e.uid); floatText(t, "-" + e.n, "dmg"); jolt(t); sfx("hit"); parallel = true; break; }
        case "face": say(e.p === 0 ? `You take <b>${e.n}</b> damage` : `Rival takes <b>${e.n}</b> damage`); floatText(lifeEl(e.p), "-" + e.n, "dmg"); bumpLife(e.p, -e.n); sfx("hit"); jolt(lifeEl(e.p)); if (e.p === 0) { shakeScreen(); buzz(30); } parallel = true; break;
        case "heal": floatText(lifeEl(e.p), "+" + e.n, "heal"); bumpLife(e.p, e.n); sfx("heal"); parallel = true; break;
        case "mend": floatText(tileOf(e.uid), "+" + e.n, "heal"); parallel = true; break;
        case "freeze": { const t = tileOf(e.uid); if (t) { t.classList.add("frozen"); sparks(t, "#9fe8ff", 8); } sfx("freeze"); parallel = true; break; }
        case "buff": { const t = tileOf(e.uid); ring(t, "#ffd65c"); sparks(t, "#ffd65c", 6); sfx("heal"); parallel = true; break; }
        case "death": { await flush(); const t = tileOf(e.uid); if (t && t._u) say(`<b>${esc(t._u.name)}</b> is destroyed`); } dieFx(e.uid); sfx("death"); buzz(15); await sleep(pace(220)); break;
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

  /* ---------- the tutorial: one step at a time, pointing at what to tap ---------- */
  const handEl = id => [...handEls.values()].find(el => el._c && el._c.def && el._c.def.id === id);
  const champEl = () => [...handEls.values()].find(el => el._c && el._c.champ && !playable(el._c));
  const inHand = id => M.view.you.hand.some(c => c.id === id);
  const STEPS = [
    { id: "goal", info: true, when: () => true, at: () => lifeEl(1), text: "You win by bringing the rival's life to 0. This heart is their life. Yours is the heart at the bottom." },
    { id: "wisp", when: v => v.active === 0 && inHand("s-wisp") && v.you.ess >= 1, done: () => !inHand("s-wisp"), at: () => handEl("s-wisp"),
      text: "Your cards are at the bottom. Tap Spore Wisp.", peek: "Tap Summon. It costs 1 essence: the gold diamond by your life. You get one more each turn." },
    { id: "end1", when: v => v.turn === 1 && v.you.ess === 0, done: v => v.turn > 1, at: () => $("[data-right]"), text: "No essence left this turn, and new units can't attack yet. Tap End turn." },
    { id: "block", when: () => M.mode === "block", done: () => M.mode !== "block", at: () => $("[data-right]"), text: "The rival attacks! Your blockers are already picked (blue). Tap Confirm." },
    { id: "champ", when: v => v.active === 0 && !!champEl(), done: v => v.you.champions.some(c => !c.home), at: () => champEl(),
      text: "The gold cards are your champions: your own beings. Tap one.", peek: "Tap Summon. If a champion dies it comes back to your hand, for 2 more." },
    { id: "attack", when: v => v.active === 0 && !v.you.attacked && goers(v).length > 0, done: v => v.you.attacked, at: () => $("[data-left]"),
      text: "Units marked READY can attack. Tap Attack: they hit the rival unless the rival blocks." },
    { id: "strike", when: v => v.active === 0 && v.you.hand.some(c => c.id === "r-strike" && c.cost <= v.you.ess), done: () => !inHand("r-strike"), at: () => handEl("r-strike"),
      text: "Lightning Strike is a ritual: a spell you use once. Tap it.", peek: "Tap Cast, then tap a target: a rival unit, or their heart." },
    { id: "free", info: true, when: v => v.turn >= 6, text: "That's the game. Each turn: play cards, attack, then End turn. Now finish the rival!" },
  ];
  let coachStep = null, focused = null;
  function coach(step, text, target) {
    const c = $("[data-coach]"), pt = $("[data-point]");
    coachStep = step;
    if (focused) { focused.classList.remove("tm-focus"); focused = null; }
    if (!step) { c.hidden = true; pt.hidden = true; return; }
    $("[data-coach-text]").textContent = text || step.text;
    $("[data-coach-ok]").hidden = !step.info;
    const el = target === undefined ? (step.at && step.at()) : target;
    if (el) {
      const r = el.getBoundingClientRect(), low = r.top > innerHeight * .45;
      pt.hidden = false; pt.classList.toggle("up", !low);
      pt.style.left = (r.left + r.width / 2) + "px"; pt.style.top = (low ? r.top - 6 : r.bottom + 6) + "px";
      c.classList.toggle("top", low); el.classList.add("tm-focus"); focused = el;
    } else { pt.hidden = true; c.classList.add("top"); }
    c.hidden = false;
  }
  function coachCheck() {
    if (!M || !M.tutorial || M.busy || M.view.phase === "over") return coach(null);
    const v = M.view;
    STEPS.forEach(st => { if (!M.tips.has(st.id) && st.done && st.done(v)) M.tips.add(st.id); });
    if (!$("[data-peek]").hidden) {
      const st = coachStep && coachStep.peek && !M.tips.has(coachStep.id) ? coachStep : null;
      return st ? coach(st, st.peek, $("[data-peek-play]")) : coach(null);
    }
    if (M.mode === "target") return coach({ id: "aim", info: false }, "Tap a glowing target. To hit the rival directly, tap their heart.", (M.aim.uids.length ? tileOf(M.aim.uids[0]) : null) || lifeEl(1));
    coach(STEPS.find(st => !M.tips.has(st.id) && st.when(v)) || null);
  }
  $("[data-coach-ok]").addEventListener("click", () => { if (coachStep) M.tips.add(coachStep.id); coach(null); sfx("tap"); setTimeout(coachCheck, 200); });

  /* ---------- how to play ---------- */
  $("[data-help]").addEventListener("click", () => { sfx("tap"); $("[data-rules]").hidden = false; });
  $$("[data-rules-close]").forEach(b => b.addEventListener("click", () => { $("[data-rules]").hidden = true; }));

  window.addEventListener("resize", () => { paintHand.cw = 0; if (M && !$("[data-screen=match]").hidden) { handEls.forEach(el => { el._fan = null; }); render(M.view); } });
  hub();
})();
