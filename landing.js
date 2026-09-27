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
