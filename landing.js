/* ============================================================
   REALM — the landing page's behaviour.

   Fills the panels from data.js and opens them over the gate.
   Nothing here needs editing.
   ============================================================ */

(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const round   = ROUND;
  const current = SECTORS[round - 1];
  const roundSupply = supplyFor(round);
  const price       = priceFor(round);

  /* ---------- fill in the numbers ---------- */
  $$("[data-round]").forEach(n => n.textContent = round);
  $$("[data-sector-name]").forEach(n => n.textContent = current.name);
  $$("[data-supply]").forEach(n => n.textContent = roundSupply);
  $$("[data-total]").forEach(n => n.textContent = TOTAL_BEINGS.toLocaleString());
  $$("[data-price]").forEach(n => n.textContent = price + " SOL");
  $$("[data-royalty]").forEach(n => n.textContent = ROYALTY_PERCENT + "%");
  $$("[data-minted]").forEach(n => n.textContent = CONFIG.minted);
  const rl = $("[data-round-label]");
  if (rl) rl.textContent = `round ${round}`;

  /* ---------- what is true right now, on the door ---------- */
  const chapter = $("#st-chapter");
  if (chapter) chapter.textContent = `Round ${round} · ${current.name}`;

  const supply = $("#st-supply");
  if (supply) {
    supply.textContent = CONFIG.minted > 0
      ? `${CONFIG.minted} of ${roundSupply}`
      : `none of ${roundSupply} yet`;
  }

  const status = $("#st-status");
  if (status) {
    const open = !!CONFIG.mintLink;
    status.textContent = open ? "Open" : "Closed";
    status.classList.toggle("shut", !open);
  }

  /* ---------- mint ---------- */
  const bar = $("[data-bar]");
  if (bar) {
    const pct = Math.min(100, (CONFIG.minted / roundSupply) * 100);
    requestAnimationFrame(() => bar.style.width = pct + "%");
  }

  let qty = 1;
  const qtyEl = $("[data-qty]");
  $$(".step").forEach(btn => btn.addEventListener("click", () => {
    qty = Math.min(3, Math.max(1, qty + Number(btn.dataset.step)));
    qtyEl.textContent = qty;
  }));

  const mintBtn  = $("[data-mint-btn]");
  const mintNote = $("[data-mint-note]");
  if (CONFIG.mintLink) {
    mintBtn.href = CONFIG.mintLink;
    mintBtn.target = "_blank";
    mintBtn.rel = "noopener";
    mintBtn.textContent = "Mint on the launchpad";
    mintNote.textContent = "Opens the official mint page. Connect your Solana wallet there.";
  } else {
    /* nothing to choose while the gate is shut — offering a quantity
       would suggest there is something to take */
    const qtyBox = $(".qty"), limit = $(".limit");
    if (qtyBox) qtyBox.hidden = true;
    if (limit)  limit.hidden = true;
    mintBtn.classList.add("disabled");
    mintBtn.textContent = "The gate is shut";
    mintNote.textContent = "The gate for this round has not been opened yet. "
                         + "When it is, this becomes the only mint link — anything else is not us.";
  }

  /* ---------- the top bar ----------
     A link only appears once it goes somewhere. The placeholders in
     data.js are blanks, not links, and showing them would send people
     to an empty profile. */
  const ticker = $("[data-ticker]");
  if (ticker) ticker.textContent = TOKEN_NAME;

  const nest = $(".top-links");
  if (nest) {
    const REAL = { x: "X", telegram: "Telegram", marketplace: "Market" };
    Object.entries(REAL).forEach(([key, label]) => {
      const url = (CONFIG.links && CONFIG.links[key]) || "";
      if (!url || /^https:\/\/(x\.com|t\.me)\/?$/.test(url)) return;
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = label;
      nest.appendChild(a);
    });
  }

  /* ---------- links ---------- */
  Object.entries(CONFIG.links).forEach(([key, url]) => {
    const el = $(`[data-link="${key}"]`);
    if (!el) return;
    if (url) { el.href = url; el.target = "_blank"; el.rel = "noopener"; }
    else el.remove();
  });

  /* ---------- the eight tiers ----------
     Each row shows a real being of that tier, rendered by the same pipeline
     that makes the collection.

     These are rendered from a seed that belongs to no round, so nothing on
     this page is a token anybody will be minted. They show what a tier looks
     like; they are not the thing being sold, and which being a mint holds
     still is not known until the reveal. */
  const tiersEl = $(".tiers");
  TIERS.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "tier" + (t.key === "god" ? " god" : "");
    el.style.setProperty("--c", t.color);

    const slot = document.createElement("span");
    slot.className = "form-slot";
    const art = document.createElement("img");
    art.className = "tier-art";
    art.src = "preview/" + t.key + ".png";
    art.alt = "";
    art.loading = "lazy";
    art.width = 360; art.height = 360;
    slot.appendChild(art);
    el.appendChild(slot);

    const rest = document.createElement("span");
    rest.className = "name";
    rest.textContent = t.name;
    el.appendChild(rest);

    const count = document.createElement("span");
    count.className = "count";
    count.innerHTML = t.key === "god"
      ? `<b>1</b>per sector`
      : `<b>${t.count}</b>per round`;
    el.appendChild(count);

    tiersEl.appendChild(el);
  });

  /* ---------- rewards ----------
     Every number here comes out of data.js, so the panel cannot drift
     away from the mechanism the way prose does. */
  const rows = (el, pairs) => {
    if (!el) return;
    pairs.forEach(([left, right, lit]) => {
      const r = document.createElement("div");
      r.className = "rw-row" + (lit ? " lit" : "");
      r.innerHTML = `<span>${left}</span><b>${right}</b>`;
      el.appendChild(r);
    });
  };

  const roundWeight = TIERS.reduce((a, t) => a + t.count * t.weight, 0);
  const pool = poolFor(round);

  const lede = $("[data-rw-lede]");
  if (lede) lede.textContent =
    `When a round sells out, ${POOL_PERCENT}% of what it took is shared among the people `
    + `holding that round's beings. Your slice is three things multiplied together: the `
    + `beings you hold, the ${TOKEN_NAME} you hold, and how many sectors you hold across.`;

  const poolEl = $("[data-rw-pool]");
  if (poolEl) poolEl.textContent =
    `${POOL_PERCENT}% of every round's mint goes back to that round's holders. Round ${round} `
    + `is ${roundSupply} beings at ${price} SOL, so its pool is ${pool} SOL. Rounds do not `
    + `share — round ${round}'s money goes to round ${round}'s holders and nobody else.`;

  const tokEl = $("[data-rw-token]");
  if (tokEl) tokEl.textContent =
    `${TOKEN_NAME} multiplies what your beings are worth, up to ${
      TOKEN_BANDS[TOKEN_BANDS.length - 1].mult}× at the top. It cannot earn on its own: `
    + `tokens with no being is nothing at all.`;

  rows($("[data-rw-weights]"), TIERS.map(t =>
    [t.name, t.weight + (t.weight === 1 ? " point" : " points"), t.key === "god"]));

  rows($("[data-rw-bands]"), TOKEN_BANDS.map((b, i) =>
    [b.hold === 0 ? `under ${TOKEN_BANDS[1].hold.toLocaleString()} ${TOKEN_NAME}`
                  : b.hold.toLocaleString() + " " + TOKEN_NAME
                    + (i === TOKEN_BANDS.length - 1 ? " or more" : ""),
     b.mult.toFixed(1) + "×", i === TOKEN_BANDS.length - 1]));

  const steps = Math.round((PILGRIM_MAX - 1) / PILGRIM_STEP);
  rows($("[data-rw-pilgrim]"), [...Array(steps + 1)].map((_, i) =>
    [i === steps ? `${i + 1} sectors or more` : (i ? `${i + 1} sectors` : "1 sector"),
     (1 + i * PILGRIM_STEP).toFixed(2) + "×", i === steps]));

  /* ---------- the earnings chart ----------
     Every holding a wallet can legally have, priced round by round.

     Two figures per holding, because one on its own would be a lie. The
     token and pilgrim multipliers scale YOUR weight, not the pool, so what
     they are worth depends entirely on what everybody else is holding:

       even field   every holder carrying the same multiplier as you. The
                    multipliers cancel and your slice is your weight over
                    the round's 532 points. This is the honest baseline.
       best case    you at the top token band and the pilgrim ceiling with
                    nobody else multiplied at all. A ceiling, not a forecast.

     A real round sits between them, and nearer the first.

     Nothing here is typed in. Change a weight, a price or a tier count in
     the constants above and the whole chart follows. */
  const TOP_MULT = TOKEN_BANDS[TOKEN_BANDS.length - 1].mult;

  /* You cannot hold across more sectors than have opened, so in the early
     rounds the pilgrim bonus cannot reach the ceiling its own table shows. */
  const pilgrimCap = n => Math.min(PILGRIM_MAX, 1 + (n - 1) * PILGRIM_STEP);

  const evenPay = (n, w) => poolFor(n) * w / roundWeight;
  const bestPay = (n, w) => {
    const mine = w * TOP_MULT * pilgrimCap(n);
    return poolFor(n) * mine / (roundWeight - w + mine);
  };

  /* what a holding has to weigh before it returns its own mint price */
  const breakEven = n => roundWeight / (supplyFor(n) * POOL_PERCENT / 100);

  const n_  = v => `<span class="num">${v}</span>`;
  const net = v => `<i class="num ${v < 0 ? "ch-down" : "ch-up"}">`
                 + (v < 0 ? "−" : "+") + Math.abs(v).toFixed(3) + "</i>";
  /* the figure, and under it what is left once the mint is paid */
  const takeaway = (got, cost) =>
    ({ h: `<b class="num">${got.toFixed(3)}</b>` + net(got - cost), cls: "ch-v" });

  function table(el, cols, head, body) {
    if (!el) return;
    el.innerHTML = "";
    el.style.setProperty("--cols", cols);
    const cell = (html, cls) => {
      const d = document.createElement("div");
      d.className = cls;
      d.innerHTML = html;
      return d;
    };
    head.forEach(h => el.appendChild(cell(h, "ch-h")));
    body.forEach(row => row.cells.forEach((c, i) => {
      const o = typeof c === "object" ? c : { h: c };
      const d = cell(o.h, [i === 0 ? "ch-lab" : "", row.lit ? "ch-in" : "", o.cls || ""]
        .filter(Boolean).join(" "));
      if (i === 0 && row.color) d.style.color = row.color;
      el.appendChild(d);
    }));
  }

  /* ---- the ten rounds ---- */
  const poolNote = $("[data-ch-poolnote]");
  if (poolNote) poolNote.innerHTML =
    `A round's pool is ${n_(POOL_PERCENT)}% of what that round's mint took, paid when it `
    + `sells out. Rounds never share. The last column is what a single weight point `
    + `pays — a Common is ${n_(1)} point, a God is ${n_(TIERS[TIERS.length - 1].weight)}.`;

  table($("[data-ch-pools]"), "1fr .8fr 1fr 1.1fr",
    ["Round", "Mint", "Pool", "Per point"],
    [...Array(10)].map((_, i) => {
      const n = i + 1;
      return {
        lit: n === round,
        cells: [`Round ${n_(n)}`, n_(priceFor(n).toFixed(2)),
                n_(poolFor(n).toFixed(2)), n_((poolFor(n) / roundWeight).toFixed(4))]
      };
    }));

  /* ---- every holding, for one round at a time ----
     Ten rounds as ten columns would need sideways scrolling on a phone, and
     anything you have to scroll sideways to reach does not get read. So the
     round is chosen instead. */
  const lede2 = $("[data-ch-lede]");
  if (lede2) lede2.innerHTML =
    `Three beings is the most one wallet may hold in a round — and no round holds `
    + `three Entities or three Gods, so those stop where the round does. Tap a round.`;

  function detail(n) {
    const price = priceFor(n);
    const body  = [];

    /* the anchor: what three mints return on average, which is exactly the
       75% coming back. Everything above this line is paid for by everything
       below it. */
    const avgW = 3 * roundWeight / supplyFor(n);
    body.push({
      lit: true,
      cells: [`Any ${n_(3)} mints`,
              n_((3 * price).toFixed(2)),
              takeaway(evenPay(n, avgW), 3 * price),
              n_(bestPay(n, avgW).toFixed(3))]
    });

    TIERS.forEach(t => {
      for (let q = 1; q <= Math.min(3, t.count); q++) {
        const w = t.weight * q, cost = q * price;
        body.push({
          color: t.color,
          lit: t.key === "god",
          cells: [`${t.name} <span class="num">×${q}</span>`,
                  n_(cost.toFixed(2)),
                  takeaway(evenPay(n, w), cost),
                  n_(bestPay(n, w).toFixed(3))]
        });
      }
    });

    table($("[data-ch-table]"), "1.45fr .7fr 1fr .9fr",
      ["Holding", "Mint cost", "Even field", "Best case"], body);

    const foot = $("[data-ch-foot]");
    if (foot) foot.innerHTML =
      `All figures in SOL. The first row is what any ${n_(3)} mints return on average — `
      + `exactly the ${n_(POOL_PERCENT)}% coming back — and every holding that beats it is `
      + `paid for by one that does not. `
      + `<b>Even field</b> is what your weight alone earns, with every `
      + `holder on the same multiplier as you — they cancel out, and this is the honest `
      + `baseline. <b>Best case</b> is you at ${n_(TOP_MULT.toFixed(1))}× tokens and `
      + `${n_(pilgrimCap(n).toFixed(2))}× pilgrim with nobody else multiplied at all; `
      + `it falls the moment anyone else buys tokens, so it is a ceiling and not a forecast. `
      + `The small figure is what is left once the mint is paid. A holding needs `
      + `${n_(breakEven(n).toFixed(1))} points to return its own mint price, so `
      + `<b>${TIERS.find(t => t.weight >= breakEven(n)).name}</b> is the first tier that pays `
      + `for itself — in every round, because the price cancels. And you do not choose your `
      + `tier: it is sealed until the reveal.`;
  }

  const picker = $("[data-ch-rounds]");
  if (picker) {
    [...Array(10)].forEach((_, i) => {
      const n = i + 1;
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = n_(n);
      b.setAttribute("aria-pressed", String(n === round));
      b.setAttribute("aria-label", "Round " + n);
      b.addEventListener("click", () => {
        [...picker.children].forEach(c => c.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        detail(n);
      });
      picker.appendChild(b);
    });
  }
  detail(round);

  /* ---- one of a tier in every round ---- */
  const allTen = [...Array(10)].map((_, i) => i + 1);
  const tenCost = allTen.reduce((a, n) => a + priceFor(n), 0);
  table($("[data-ch-ten]"), "1.2fr .8fr 1.05fr 1fr",
    ["Tier", "Ten mints", "Even field", "Best case"],
    TIERS.map(t => ({
      color: t.color,
      lit: t.key === "god",
      cells: [t.name, n_(tenCost.toFixed(2)),
              takeaway(allTen.reduce((a, n) => a + evenPay(n, t.weight), 0), tenCost),
              n_(allTen.reduce((a, n) => a + bestPay(n, t.weight), 0).toFixed(2))]
    })));

  const tenFoot = $("[data-ch-tenfoot]");
  if (tenFoot) tenFoot.innerHTML =
    `One being in every round costs ${n_(tenCost.toFixed(2))} SOL in mints, and holding `
    + `across all ten sectors is also what takes the pilgrim bonus to its ceiling. The `
    + `bottom row means holding every God there will ever be, so treat it as the edge of `
    + `what is possible rather than a plan.`;

  const fine = $("[data-rw-fine]");
  if (fine) fine.textContent =
    `Most of a round's pool is that round's own mint money coming back, shared out unevenly. `
    + `Across ${roundSupply} holders the average is ${POOL_PERCENT}% of what they paid, so most `
    + `people receive less than they put in and a few receive a great deal more. The only new `
    + `money is the ${ROYALTY_PERCENT}% royalty on resales, and that only exists if people trade. `
    + `None of this is a promise of profit, and none of it is financial advice.`;

  /* ---------- lore ---------- */
  const chaptersEl = $(".chapters");
  SECTORS.forEach((sector, i) => {
    const open = i < round;
    const el = document.createElement("article");
    el.className = "chapter" + (open ? "" : " sealed");
    el.innerHTML = `<p class="meta">Chapter ${i + 1}</p>
                    <h3>${open ? sector.name : "Sector " + (i + 1)}</h3>
                    <p class="body">${sector.lore}</p>`;
    chaptersEl.appendChild(el);
  });

  /* ---------- rounds ---------- */
  const timeline = $(".timeline");
  SECTORS.forEach((sector, i) => {
    const state = i < round - 1 ? "done" : i === round - 1 ? "now" : "";
    const li = document.createElement("li");
    li.className = state;
    const n = supplyFor(i + 1);
    li.innerHTML = `<span class="r">Round ${i + 1}${state === "now" ? " &middot; live" : ""}</span>
                    <span class="s">${i < round ? sector.name : "Sealed sector"}</span>
                    <span class="d">${n} beings &middot; ${priceFor(i + 1)} SOL${
                      n > SUPPLY_PER_ROUND ? " &middot; the last one ever" : ""}</span>`;
    timeline.appendChild(li);
  });

  /* ---------- digits in prose ----------
     The numeric face is applied by class, and CSS cannot select a digit
     inside a sentence. So every run of digits in the panels is wrapped
     once, after everything is built. Text nodes only — no element, event
     or attribute is touched. */
  function numerify(root) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (/\d/.test(n.nodeValue) && !(n.parentNode && n.parentNode.classList.contains("num")))
        hits.push(n);
    }
    for (const node of hits) {
      const text = node.nodeValue;
      const frag = document.createDocumentFragment();
      let last = 0;
      text.replace(/\d[\d,.]*/g, (m, i) => {
        if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
        const sp = document.createElement("span");
        sp.className = "num";
        sp.textContent = m;
        frag.appendChild(sp);
        last = i + m.length;
        return m;
      });
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }
  $$(".panel").forEach(numerify);

  /* ---------- panels ---------- */
  let openPanel = null;

  function show(name) {
    const p = $("#p-" + name);
    if (!p) return;
    hide();
    p.hidden = false;
    openPanel = p;
    document.body.style.overflow = "hidden";
    p.scrollTop = 0;
  }

  function hide() {
    if (!openPanel) return;
    openPanel.hidden = true;
    openPanel = null;
    document.body.style.overflow = "";
  }

  $$("[data-open]").forEach(b => b.addEventListener("click", () => show(b.dataset.open)));

  // the journey opens these too
  window.RealmPanels = { show, hide };

  // X is a link when one is configured, and a panel-free no-op otherwise

  $$(".panel-close").forEach(b => b.addEventListener("click", hide));

  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });

  // tapping the dimmed area outside the content closes it too
  $$(".panel").forEach(p => p.addEventListener("click", e => {
    if (e.target === p) hide();
  }));
})();
