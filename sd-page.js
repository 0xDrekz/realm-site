/* ============================================================
   SHOWDOWN — the page. It only shows what the server says and sends the
   player's choices (fold, check, call, raise); the server deals, holds
   everyone's secret beings and decides every pot.
   ============================================================ */
(() => {
  "use strict";
  const E = window.RealmBreak;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => Math.round(n).toLocaleString("en-GB");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = { get(k, d) { try { const v = localStorage.getItem("realm-bt-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("realm-bt-" + k, JSON.stringify(v)); } catch { /* private mode */ } } };

  /* ---------- the cards, drawn as in BREAKTHROUGH ---------- */
  const TIER = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#fff7d6" };
  const AURA_C = { Cold: "#5cf0ff", Rose: "#ff7ac8", Warm: "#ffc94a", Acid: "#8dff5c", Opposed: "#b18cff", Prime: "#fff1c2" };
  const GLYPH = { L: "ϟ", T: "♣", P: "◉", S: "✺", M: "✿", D: "☾", U: "◬" };
  const PIX = {
    M: ["....###....", "..#######..", ".##.###.##.", "###########", "###########", "....###....", "....###....", "...#####..."],
    U: ["....###....", "...#####...", ".#########.", "###########", "#.#.#.#.#.#", ".#########.", "...#...#...", "..#.....#..", ".#.......#."],
  };
  const pixSvg = rows => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rows.map((r, y) => [...r].map((ch, x) => ch === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "").join("")).join("")}</svg>`;
  const icon = k => PIX[k] ? pixSvg(PIX[k]) : GLYPH[k];
  const TRAIT = {
    L: { name: "Lightning", Strike: "+4 mult", Storm: "+8 mult", Tempest: "×3 mult" }, T: { name: "Trees", One: "+3 mult", Copse: "+6 mult", Forest: "×2 mult" },
    P: { name: "Planets", One: "+20 chips", Two: "+40 chips", Ringed: "+30 chips, +2 mult", Cluster: "+150 chips" }, S: { name: "Supernova", One: "×1.5 mult", Two: "×2 mult", Barrage: "×4 mult" },
    M: { name: "Mushrooms", Few: "scores twice", Cluster: "scores 3 times", Grove: "scores 4 times" }, D: { name: "Moon Dust", Faint: "no effect here", Drifting: "no effect here", Heavy: "no effect here" },
    U: { name: "UFOs", One: "no effect here", Few: "no effect here" },
  };
  let CARDS = null;
  const card = n => CARDS[n - 1];
  async function loadCards() { if (CARDS) return; const r = await fetch("/api/bt/cards"); CARDS = (await r.json()).cards; }
  function cardEl(n) {
    const c = card(n), el = document.createElement("div");
    el.className = "bt-card"; el.style.setProperty("--tc", TIER[c.tier]); el.style.setProperty("--ac", AURA_C[c.aura] || "#fff");
    const tr = Object.keys(c.x || {}).map(k => `<i>${icon(k)}</i>`).join("");
    el.innerHTML = `<div class="art" style="background-image:url(/thumbs/${n}.webp)"><span class="gem${c.aura === "Prime" ? " prime" : ""}">${c.aura === "Prime" ? "✦" : c.aura[0]}</span><span class="tr">${tr}</span></div>`
      + `<div class="foot"><b>${c.chips}</b><span>${esc(c.geo || c.tier)}</span></div>`;
    el.dataset.n = n; el.addEventListener("click", () => showCard(n));
    return el;
  }
  const backEl = () => { const d = document.createElement("div"); d.className = "sd-card-back"; return d; };
  function showCard(n) {
    const c = card(n), box = $("[data-carddetail]");
    const lines = [["Aura", c.aura === "Prime" ? "Every Aura (wild)" : c.aura], ["Chips", c.chips + " (" + c.tier + ")"]];
    if (c.geo) lines.push(["Geometry", c.geo + ": +2 mult with each other scoring " + c.geo]);
    for (const [k, v] of Object.entries(c.x || {})) lines.push([TRAIT[k].name, v + ": " + TRAIT[k][v]]);
    if (c.tier === "Entity") lines.push(["Entity", "+10 mult"]); if (c.tier === "God") lines.push(["God", "×2 mult"]); if (c.tier === "Source") lines.push(["Source", "×5 mult, any Aura"]);
    box.innerHTML = `<h2 style="font-size:1.3rem">${esc(c.name)}</h2><ul style="text-align:left;font-family:var(--num);line-height:1.5;padding-left:18px">${lines.map(([a, b]) => `<li><b>${esc(a)}</b>: ${esc(b)}</li>`).join("")}</ul><button class="bt-ghost wide">Close</button>`;
    $("[data-cardsheet]").hidden = false;
  }
  $("[data-cardsheet]").addEventListener("click", () => { $("[data-cardsheet]").hidden = true; });

  /* the best five of the beings you can see, scored like a cast (every order of every five) */
  function bestOf(ns) {
    if (ns.length < 5) return null;
    const cs = ns.map(card); let best = null;
    const pick = (s, c) => {
      if (c.length === 5) { const a = c.map(i => cs[i]); const perm = k => { if (k === 5) { const ev = E.evaluate(a, 0); if (!best || ev.score > best.score) best = { score: ev.score, name: ev.name, ns: a.map(x => x.n), scoring: ev.scoring.map(i => a[i].n) }; return; } for (let j = k; j < 5; j++) { [a[k], a[j]] = [a[j], a[k]]; perm(k + 1); [a[k], a[j]] = [a[j], a[k]]; } }; perm(0); return; }
      for (let i = s; i < cs.length; i++) { c.push(i); pick(i + 1, c); c.pop(); }
    };
    pick(0, []); return best;
  }

  /* ---------- who you are: the same sign-in as BREAKTHROUGH ---------- */
  const session = () => { try { const s = JSON.parse(localStorage.getItem("realm-tcg-session") || "null"); return s && Date.now() - s.at < 23 * 3600e3 ? s : null; } catch { return null; } };
  let PID = store.get("pid", null);
  const auth = () => { const s = session(); return s ? { token: s.token } : { pid: PID }; };
  const api = async (url, body) => {
    const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "The realm didn't answer."); e.status = r.status; e.data = d; throw e; }
    return d;
  };
  async function ensurePid() {
    if (session() || PID) return;
    try { const me = await api("/api/bt/me", { pid: null }); if (me.pid) { PID = me.pid; store.set("pid", PID); } } catch { /* try again on Find */ }
  }

  /* ---------- views ---------- */
  const show = v => $$("[data-view]").forEach(s => { s.hidden = s.dataset.view !== v; });
  async function loadBoard() {
    try {
      const s = session(), q = s ? "" : PID ? "?pid=" + PID : "";
      const r = await fetch("/api/sd/board" + q, s ? { headers: { Authorization: "Bearer " + s.token } } : {}); const d = await r.json();
      $("[data-board]").innerHTML = d.top.length ? d.top.map(p => `<div class="row${p.you ? " you" : ""}"><i>${p.rank}</i><span>${esc(p.name)}</span><small>${p.w}–${p.l}${p.d ? "–" + p.d : ""}</small><b>${p.rating}</b></div>`).join("")
        : `<p class="bt-sub">No real-player games yet. Be the first.</p>`;
      if (d.you && (d.you.bw || d.you.bl)) $("[data-board]").insertAdjacentHTML("beforeend", `<p class="bt-sub">You v The Realm: ${d.you.bw} won, ${d.you.bl} lost.</p>`);
    } catch { $("[data-board]").innerHTML = `<p class="bt-sub">The ranking couldn't be read just now.</p>`; }
  }

  /* ---------- finding a match ---------- */
  let MATCH = store.get("sd-match", null), seeking = false;
  async function find() {
    await ensurePid(); await loadCards();
    seeking = true; show("wait");
    while (seeking) {
      try {
        const r = await api("/api/sd/queue", auth());
        if (r.match) { MATCH = r.match; store.set("sd-match", MATCH); seeking = false; return play(); }
        $("[data-wait-note]").textContent = r.botIn > 0 ? `Looking for a real player… The Realm (a bot) steps in in ${Math.ceil(r.botIn / 1000)}s` : "Starting…";
      } catch (e) { $("[data-wait-note]").textContent = e.message; }
      await sleep(1000);
    }
  }
  $("[data-find]").addEventListener("click", find);
  $("[data-cancel]").addEventListener("click", () => { seeking = false; api("/api/sd/leave", auth()).catch(() => {}); show("lobby"); });

  /* ---------- the table ---------- */
  let V = null, playing = false, lastSeq = -1, lastHand = 0, shownBoard = 0, busy = false;
  async function play() {
    show("table"); playing = true; lastSeq = -1;
    while (playing) {
      try { const v = await api("/api/sd/state", { ...auth(), match: MATCH }); render(v); if (v.stage === "done") { playing = false; return endMatch(v); } }
      catch (e) { if (e.data && e.data.gone) { playing = false; store.set("sd-match", null); show("lobby"); loadBoard(); return; } $("[data-status]").textContent = e.message; }
      await sleep(900);
    }
  }
  function render(v) {
    V = v; const s = v.you, o = 1 - s, me = v.seats[s], op = v.seats[o];
    // the timer and the buttons change every poll; the cards only when something happened
    const myTurn = v.toAct === s && !v.result && v.legal;
    const secs = Math.ceil(v.ms / 1000);
    $("[data-timer]").textContent = myTurn ? secs + "s" : ""; $("[data-timer]").classList.toggle("low", myTurn && secs <= 8);
    $("[data-status]").textContent = v.result ? `Next hand in ${Math.ceil(v.result.nextIn / 1000)}s` : myTurn ? "Your move" : v.toAct === o ? `${op.name} is thinking…` : "";
    paintActions(v, myTurn);
    if (v.seq === lastSeq) return;
    lastSeq = v.seq;
    if (v.hand !== lastHand) { lastHand = v.hand; shownBoard = 0; }
    $("[data-opp-name]").innerHTML = esc(op.name) + (v.dealer === o ? '<span class="sd-dealer">D</span>' : "");
    $("[data-my-name]").innerHTML = "You" + (v.dealer === s ? '<span class="sd-dealer">D</span>' : "");
    $("[data-opp-stack]").textContent = fmt(op.stack); $("[data-my-stack]").textContent = fmt(me.stack);
    $("[data-opp-bet]").textContent = op.bet ? fmt(op.bet) : ""; $("[data-my-bet]").textContent = me.bet ? fmt(me.bet) : "";
    $("[data-pot]").textContent = fmt(v.pot + me.bet + op.bet);
    $("[data-info]").textContent = `Hand ${v.hand} of ${v.hands} · blinds ${v.blinds[0]}/${v.blinds[1]}`;
    const oh = $("[data-opp-hole]"); oh.innerHTML = ""; (v.oppHole || [0, 0]).forEach(n => oh.appendChild(n ? cardEl(n) : backEl()));
    const mh = $("[data-my-hole]"); mh.innerHTML = ""; v.hole.forEach(n => mh.appendChild(cardEl(n)));
    const bd = $("[data-boardcards]"); bd.innerHTML = "";
    for (let i = 0; i < 5; i++) { if (v.board[i]) { const el = cardEl(v.board[i]); if (i >= shownBoard) el.classList.add("deal"); bd.appendChild(el); } else { const d = document.createElement("div"); d.className = "sd-slot"; bd.appendChild(d); } }
    shownBoard = v.board.length;
    const b = bestOf(v.hole.concat(v.board));
    $("[data-best]").innerHTML = b ? `Your best: <b>${esc(b.name)}</b> · ${fmt(b.score)}` : v.board.length ? "" : "Your best five shows from the flop";
    if (b) [...mh.children, ...bd.children].forEach(el => { if (el.dataset.n && b.scoring.includes(+el.dataset.n)) el.classList.add("hot"); });
    paintResult(v);
  }
  function paintResult(v) {
    const box = $("[data-result]"), R = v.result;
    if (!R) { box.hidden = true; return; }
    const s = v.you, o = 1 - s, won = R.winner === s, tie = R.winner == null;
    const title = tie ? "Split pot" : won ? `You win ${fmt(R.won[s])}` : `${esc(v.seats[o].name)} wins ${fmt(R.won[o])}`;
    let html = `<h3 class="${tie ? "" : won ? "win" : "lose"}">${title}</h3>`;
    if (R.folded) html += `<small>${won ? "They folded." : "You folded."}</small>`;
    else {
      const line = (who, h) => `<div class="line"><span>${esc(who)}: <b>${esc(h.name)} · ${fmt(h.score)}</b></span><div class="cards">${h.ns.map(n => `<i data-n="${n}"></i>`).join("")}</div></div>`;
      html += line("You", R.hands[s]) + line(v.seats[o].name, R.hands[o]);
    }
    box.innerHTML = html; box.hidden = false;
    box.querySelectorAll(".cards i[data-n]").forEach(i => { const el = cardEl(+i.dataset.n); i.replaceWith(el); });
  }
  function paintActions(v, myTurn) {
    const L = v.legal, A = $("[data-actions]");
    A.classList.toggle("off", !myTurn);
    if (!myTurn) { $("[data-raiserow]").hidden = true; return; }
    $("[data-act=fold]").disabled = !L.fold;
    $("[data-act=call]").textContent = L.check ? "Check" : L.call >= v.seats[v.you].stack ? `All in ${fmt(L.call)}` : `Call ${fmt(L.call)}`;
    $("[data-act=raise]").disabled = !L.canRaise;
  }
  async function send(action, amount) {
    if (busy || !V) return; busy = true; $("[data-raiserow]").hidden = true;
    try { const v = await api("/api/sd/move", { ...auth(), match: MATCH, action, amount }); render(v); }
    catch (e) { $("[data-status]").textContent = e.message; }
    busy = false;
  }
  $("[data-act=fold]").addEventListener("click", () => send("fold"));
  $("[data-act=call]").addEventListener("click", () => send(V && V.legal && V.legal.check ? "check" : "call"));
  $("[data-act=raise]").addEventListener("click", () => {
    if (!V || !V.legal || !V.legal.canRaise) return;
    const row = $("[data-raiserow]"); if (!row.hidden) { row.hidden = true; return; }
    const L = V.legal, s = V.you, pot = V.pot + V.seats[0].bet + V.seats[1].bet, opp = V.seats[1 - s].bet;
    const clamp = x => Math.max(L.minTo, Math.min(L.maxTo, Math.round(x)));
    const opts = [["Min", L.minTo], ["½ pot", clamp(opp + pot / 2)], ["Pot", clamp(opp + pot)], ["All in", L.maxTo]];
    row.innerHTML = opts.map(([k, to]) => `<button data-to="${to}">${k}<b>${fmt(to)}</b></button>`).join("");
    row.querySelectorAll("button").forEach(b => b.addEventListener("click", () => send("raise", +b.dataset.to)));
    row.hidden = false;
  });

  function endMatch(v) {
    store.set("sd-match", null);
    const s = v.you, o = 1 - s, won = v.winner === s, tie = v.winner == null;
    $("[data-end-title]").textContent = tie ? "A draw" : won ? "You win the match!" : `${v.seats[o].name} wins`;
    $("[data-end-score]").textContent = `${fmt(v.seats[s].stack)} – ${fmt(v.seats[o].stack)}`;
    $("[data-end-sub]").textContent = v.forfeit != null ? (v.forfeit === s ? "You left the match" : "Your opponent left the match") : "Essence at the end, you first";
    $("[data-endsheet]").hidden = false;
  }
  $("[data-again]").addEventListener("click", () => { $("[data-endsheet]").hidden = true; find(); });
  $("[data-back]").addEventListener("click", () => { $("[data-endsheet]").hidden = true; show("lobby"); loadBoard(); });

  /* ---------- start ---------- */
  (async () => {
    await ensurePid(); loadBoard();
    if (MATCH) { await loadCards(); play(); }
  })();
})();
