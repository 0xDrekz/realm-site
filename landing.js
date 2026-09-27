/* ============================================================
   REALM — the landing page's behaviour.

   Fills the panels from data.js and opens them over the gate.
   Nothing here needs editing.

   ONE DROP. No rounds and no sectors: the whole collection mints at
   once, at one price, and a being is its tier and its traits. The ten
   chapters are the story of the realm and nothing is counted in them.
   ============================================================ */

(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const minted = Math.min(Math.max(CONFIG.minted, 0), TOTAL_BEINGS);
  const left   = TOTAL_BEINGS - minted;
  const soldOut = left === 0;

  /* ---------- fill in the numbers ---------- */
  $$("[data-total]").forEach(n => n.textContent = TOTAL_BEINGS.toLocaleString());
  $$("[data-supply]").forEach(n => n.textContent = TOTAL_BEINGS.toLocaleString());
  $$("[data-price]").forEach(n => n.textContent = PRICE + " SOL");
  $$("[data-royalty]").forEach(n => n.textContent = ROYALTY_PERCENT + "%");
  $$("[data-minted]").forEach(n => n.textContent = minted.toLocaleString());
  $$("[data-max]").forEach(n => n.textContent = MAX_PER_WALLET);
  $$("[data-tiers]").forEach(n => n.textContent = TIERS.length);

  /* when the gate shuts whether or not it has sold out */
  const closing = CONFIG.mintCloses
    ? new Date(CONFIG.mintCloses + "T00:00:00Z").toLocaleDateString("en-GB",
        { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  $$("[data-closes]").forEach(n => n.textContent = closing || "to be announced");

  /* ---------- what is true right now, on the door ---------- */
  const chapter = $("#st-chapter");
  if (chapter) chapter.textContent = `${TOTAL_BEINGS.toLocaleString()} beings · one drop`;

  const supply = $("#st-supply");
  if (supply) {
    supply.textContent = soldOut ? "all of them"
      : minted > 0 ? `${minted.toLocaleString()} of ${TOTAL_BEINGS.toLocaleString()}`
                   : `none of ${TOTAL_BEINGS.toLocaleString()} yet`;
  }

  const status = $("#st-status");
  if (status) {
    const open = !!CONFIG.mintLink && !soldOut;
    status.textContent = soldOut ? "Gone" : open ? "Open" : "Closed";
    status.classList.toggle("shut", !open);
  }

  /* ---------- mint ---------- */
  const bar = $("[data-bar]");
  if (bar) {
    const pct = Math.min(100, (minted / TOTAL_BEINGS) * 100);
    requestAnimationFrame(() => bar.style.width = pct + "%");
  }

  let qty = 1;
  const qtyEl = $("[data-qty]");
  $$(".step").forEach(btn => btn.addEventListener("click", () => {
    qty = Math.min(MAX_PER_WALLET, Math.max(1, qty + Number(btn.dataset.step)));
    if (qtyEl) qtyEl.textContent = qty;
  }));

  const mintBtn  = $("[data-mint-btn]");
  const mintNote = $("[data-mint-note]");
  if (mintBtn && mintNote) {
    if (CONFIG.mintLink && !soldOut) {
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
      mintBtn.textContent = soldOut ? "Every being is taken" : "The gate is shut";
      mintNote.textContent = soldOut
        ? "The realm is complete. Nothing further will ever be minted here."
        : "The gate has not been opened yet. When it is, this becomes the only "
          + "mint link — anything else is not us.";
    }
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

  /* ---------- the tiers ----------
     Each row shows a real being of that tier, rendered by the same pipeline
     that makes the collection — but from a seed that belongs to nothing, so
     nothing on this page is a token anybody will be minted. They show what a
     tier looks like; they are not the thing being sold, and which being a
     mint holds is not known until the reveal. */
  const tiersEl = $(".tiers");
  if (tiersEl) TIERS.forEach(t => {
    const top = t.key === "source";
    const el = document.createElement("div");
    el.className = "tier" + (top ? " god" : "");
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
    count.innerHTML = top
      ? `<b>1</b>ever`
      : `<b>${t.count}</b>of ${TOTAL_BEINGS.toLocaleString()}`;
    el.appendChild(count);

    tiersEl.appendChild(el);
  });

  /* ---------- rewards ----------
     Every number here comes out of data.js, so the panel cannot drift
     away from the mechanism the way prose does. */
  const rows = (el, pairs) => {
    if (!el) return;
    pairs.forEach(([leftText, right, lit]) => {
      const r = document.createElement("div");
      r.className = "rw-row" + (lit ? " lit" : "");
      r.innerHTML = `<span>${leftText}</span><b>${right}</b>`;
      el.appendChild(r);
    });
  };

  const lede = $("[data-rw-lede]");
  if (lede) lede.textContent =
    `When the mint closes, ${POOL_PERCENT}% of what it took is shared among the people `
    + `holding beings. Your slice is two things multiplied together: the beings you `
    + `hold, and the ${TOKEN_NAME} you hold.`;

  const poolEl = $("[data-rw-pool]");
  if (poolEl) poolEl.textContent =
    `${POOL_PERCENT}% of the mint goes back to holders. All ${TOTAL_BEINGS.toLocaleString()} `
    + `at ${PRICE} SOL is ${POOL_FULL} SOL. It is a share of what was actually taken, not a `
    + `fixed sum — if the drop does not fill, the pool is smaller in the same proportion, `
    + `and it pays on whatever sold by the closing date.`;

  const tokEl = $("[data-rw-token]");
  if (tokEl) tokEl.textContent =
    `${TOKEN_NAME} multiplies what your beings are worth, up to ${
      TOKEN_BANDS[TOKEN_BANDS.length - 1].mult}× at the top. It cannot earn on its own: `
    + `tokens with no being is nothing at all.`;

  rows($("[data-rw-weights]"), TIERS.map(t =>
    [t.name, t.weight + (t.weight === 1 ? " point" : " points"), t.key === "source"]));

  rows($("[data-rw-bands]"), TOKEN_BANDS.map((b, i) =>
    [b.hold === 0 ? `under ${TOKEN_BANDS[1].hold.toLocaleString()} ${TOKEN_NAME}`
                  : b.hold.toLocaleString() + " " + TOKEN_NAME
                    + (i === TOKEN_BANDS.length - 1 ? " or more" : ""),
     b.mult.toFixed(1) + "×", i === TOKEN_BANDS.length - 1]));

  /* ============================================================
     THE EARNINGS CHART

     Two figures per holding, because one on its own would be a lie.
     The token multiplier scales YOUR weight, not the pool, so what it
     is worth depends on what everybody else is holding:

       even field   every holder carrying the same multiplier as you.
                    They cancel, and your slice is your weight over the
                    collection's. This is the honest baseline.
       best case    you at the top token band with nobody else
                    multiplied at all. A ceiling, not a forecast.

     A real outcome sits between them, and nearer the first.
     ============================================================ */
  const TOP_MULT = TOKEN_BANDS[TOKEN_BANDS.length - 1].mult;

  const evenPay = (w, pool) => pool * w / TOTAL_WEIGHT;
  const bestPay = (w, pool) => {
    const mine = w * TOP_MULT;
    return pool * mine / (TOTAL_WEIGHT - w + mine);
  };

  /* what a holding has to weigh before it returns its own mint price.
     The price cancels out of both sides, so this does not depend on it —
     only on how much of the drop sells. */
  const breakEven = sold => TOTAL_WEIGHT / (sold * POOL_PERCENT / 100);

  const n_  = v => `<span class="num">${v}</span>`;
  const net = v => `<i class="num ${v < 0 ? "ch-down" : "ch-up"}">`
                 + (v < 0 ? "−" : "+") + Math.abs(v).toFixed(3) + "</i>";
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

  /* ---- how big the pool is, depending on how much of it sells ----
     One drop has one risk the ten rounds did not, which is that it does
     not fill. Hiding that would be the wrong call: it is printed. */
  const SHARES = [0.25, 0.5, 0.75, 1];
  const poolNote = $("[data-ch-poolnote]");
  if (poolNote) poolNote.innerHTML =
    `The pool is ${n_(POOL_PERCENT)}% of what the mint actually takes, so it depends on how `
    + `much of the drop goes. Everything further down assumes a full ${
      n_(TOTAL_BEINGS.toLocaleString())} — if less sells, every figure scales down with it.`;

  table($("[data-ch-pools]"), "1fr .9fr 1fr 1.1fr",
    ["Minted", "Gross", "Pool", "Per point"],
    SHARES.map(f => {
      const sold = Math.round(TOTAL_BEINGS * f);
      return {
        lit: f === 1,
        cells: [`${n_(Math.round(f * 100))}%`,
                n_((sold * PRICE).toFixed(2)),
                n_(poolFrom(sold).toFixed(2)),
                n_((poolFrom(sold) / TOTAL_WEIGHT).toFixed(5))]
      };
    }));

  /* ---- every holding ----
     Nine tiers times five quantities is forty-five rows, which nobody
     scrolls through on a phone. So the quantity is chosen and the table
     stays nine rows long. */
  const lede2 = $("[data-ch-lede]");
  if (lede2) lede2.innerHTML =
    `${n_(MAX_PER_WALLET)} beings is the most one wallet may mint. Choose how many you hold.`;

  function detail(q) {
    const pool = POOL_FULL;
    const body = [];

    /* the anchor: what any holding returns on average, which is exactly
       the 75% coming back. Everything that beats this line is paid for
       by something that does not. */
    const avgW = q * TOTAL_WEIGHT / TOTAL_BEINGS;
    body.push({
      lit: true,
      cells: [`Any ${n_(q)}`, n_((q * PRICE).toFixed(2)),
              takeaway(evenPay(avgW, pool), q * PRICE),
              n_(bestPay(avgW, pool).toFixed(3))]
    });

    TIERS.forEach(t => {
      /* only one Source exists, so a wallet cannot hold two however
         many it mints */
      const held = Math.min(q, t.count);
      const w = t.weight * held, cost = held * PRICE;
      body.push({
        color: t.color,
        lit: t.key === "source",
        cells: [`${t.name} <span class="num">×${held}</span>`,
                n_(cost.toFixed(2)),
                takeaway(evenPay(w, pool), cost),
                n_(bestPay(w, pool).toFixed(3))]
      });
    });

    table($("[data-ch-table]"), "1.45fr .7fr 1fr .9fr",
      ["Holding", "Mint cost", "Even field", "Best case"], body);

    const foot = $("[data-ch-foot]");
    if (foot) foot.innerHTML =
      `All figures in SOL, assuming the drop fills. The first row is what any `
      + `${n_(q)} being${q > 1 ? "s" : ""} return${q > 1 ? "" : "s"} on average — exactly the `
      + `${n_(POOL_PERCENT)}% coming back — and every holding that beats it is paid for by one `
      + `that does not. <b>Even field</b> is what your weight alone earns, with every holder on `
      + `the same multiplier as you; they cancel out, and this is the honest baseline. `
      + `<b>Best case</b> is you at ${n_(TOP_MULT.toFixed(1))}× tokens with nobody else `
      + `multiplied at all. It falls the moment anyone else buys tokens, so it is a ceiling `
      + `and not a forecast. The small figure is what is left `
      + `once the mint is paid. A holding needs ${n_(breakEven(TOTAL_BEINGS).toFixed(1))} points `
      + `to return its own mint price, so <b>${
        TIERS.find(t => t.weight >= breakEven(TOTAL_BEINGS)).name}</b> is the first tier that `
      + `pays for itself. And you do not choose your tier: it is sealed until the reveal.`;
  }

  const picker = $("[data-ch-qty]");
  if (picker) {
    [...Array(MAX_PER_WALLET)].forEach((_, i) => {
      const q = i + 1;
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = n_(q);
      b.setAttribute("aria-pressed", String(q === MAX_PER_WALLET));
      b.setAttribute("aria-label", q + (q === 1 ? " being" : " beings"));
      b.addEventListener("click", () => {
        [...picker.children].forEach(c => c.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        detail(q);
      });
      picker.appendChild(b);
    });
  }
  detail(MAX_PER_WALLET);

  const fine = $("[data-rw-fine]");
  if (fine) fine.textContent =
    `Most of the pool is the mint's own money coming back, shared out unevenly. Across `
    + `${TOTAL_BEINGS.toLocaleString()} beings the average is ${POOL_PERCENT}% of what was paid, `
    + `so most people receive less than they put in and a few receive a great deal more. The `
    + `only new money is the ${ROYALTY_PERCENT}% royalty on resales, and that only exists if `
    + `people trade. None of this is a promise of profit, and none of it is financial advice.`;

  /* ---------- lore ----------
     The ten rounds used to unseal a chapter at a time, and that was the
     best thing about them. It survives the drop: a chapter opens for
     every tenth that mints, for everybody at once. */
  const openChapters = chaptersOpen();
  const chaptersEl = $(".chapters");
  if (chaptersEl) CHAPTERS.forEach((chapter, i) => {
    const open = i < openChapters;
    const el = document.createElement("article");
    el.className = "chapter" + (open ? "" : " sealed");
    el.innerHTML = `<p class="meta">Chapter ${i + 1}</p>
                    <h3>${open ? chapter.name : "Sealed"}</h3>
                    <p class="body">${open ? chapter.lore
                      : "This chapter opens when the mint passes "
                        + Math.round(i / CHAPTERS.length * 100) + "%."}</p>`;
    chaptersEl.appendChild(el);
  });

  const loreNote = $("[data-lore-note]");
  if (loreNote) loreNote.textContent = soldOut
    ? "The realm is complete, and every chapter is open."
    : `${openChapters} of ${CHAPTERS.length} chapters are open. One more opens with every `
      + `tenth of the drop that goes.`;

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

  $$(".panel-close").forEach(b => b.addEventListener("click", hide));

  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });

  // tapping the dimmed area outside the content closes it too
  $$(".panel").forEach(p => p.addEventListener("click", e => {
    if (e.target === p) hide();
  }));
})();
