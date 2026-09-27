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
  /* The creed directly above this already says "1,111 beings · one drop",
     so this carried the same sentence twice. It carries the price now,
     which is the other thing a stranger wants before deciding anything. */
  const chapter = $("#st-chapter");
  if (chapter) chapter.textContent = `${PRICE} SOL each`;

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

  /* ---------- a look at what is behind the door ----------
     The first screen used to be a button, a creed and a definition list.
     The collection is not a mood — it is 1,111 drawn beings, and they were
     two taps away under The Beings. Five of them stand on the door now,
     quiet to loud, so a stranger can see what this actually is before
     deciding whether to go in.

     They are the same preview pictures the Beings panel uses, so this
     costs no extra download. */
  const peek = $("[data-peek]");
  if (peek) {
    ["common", "rare", "legendary", "god", "source"].forEach(key => {
      const t = TIERS.find(x => x.key === key);
      if (!t) return;
      const img = document.createElement("img");
      img.className = "peek-art";
      img.src = "preview/" + key + ".png";
      img.alt = "";
      img.loading = "lazy";
      img.width = 360; img.height = 360;
      img.style.setProperty("--c", t.color);
      peek.appendChild(img);
    });
    peek.addEventListener("click", () => show("nfts"));
  }

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

  /* ---------- provenance ----------
     The hash is the whole of the honesty claim, so the panel states plainly
     which of the two things it proves, and says so even while it is empty
     rather than quietly showing nothing. */
  const provEl = $("[data-prov]");
  if (provEl) {
    const hash = (CONFIG.provenance || "").trim();
    provEl.textContent = hash || "not published yet";
    provEl.classList.toggle("waiting", !hash);
  }
  const provNote = $("[data-prov-note]");
  if (provNote) provNote.innerHTML = (CONFIG.provenance || "").trim()
    ? "Every image was hashed, the hashes joined in token order, and that hashed again. "
      + "Repeat it on the finished collection and it must come out the same — if one being "
      + "had been altered, or two swapped over, it would not. <b>What this proves:</b> the "
      + "collection handed out is the collection that was hashed. <b>What it does not "
      + "prove:</b> how mint order was assigned to token number, which is the launchpad's "
      + "shuffle rather than ours."
    : "This is published before the gate opens, never after — the whole point of it is that "
      + "it existed before anybody could see what they were buying. Until it is here, take "
      + "nothing on this page as proof of anything.";

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

  /* This line used to be written by hand and it was false: it claimed the
     400 Commons outweighed every God and the Source together. They are 400
     points against 661. The earlier version of the same sentence was wrong
     too, so a wrong claim survived a rewrite unchecked.

     It is computed now. A sentence about numbers on a page whose whole
     argument is that the numbers can be checked has no business being
     typed in by hand. */
  const weightLine = $("[data-rw-weightline]");
  if (weightLine) {
    const src  = TIERS.find(t => t.key === "source");
    const low  = ["common", "uncommon", "rare"].map(k => TIERS.find(t => t.key === k));
    const lowN = low.reduce((a, t) => a + t.count, 0);
    const lowW = low.reduce((a, t) => a + t.count * t.weight, 0);
    weightLine.textContent =
      `Every being carries a weight, and yours add up. The Source alone is worth `
      + `${src.weight} Commons. The ${lowN.toLocaleString()} Commons, Uncommons and Rares `
      + `are ${Math.round(lowN / TOTAL_BEINGS * 100)}% of the collection but only `
      + `${Math.round(lowW / TOTAL_WEIGHT * 100)}% of the weight — the pool leans to the `
      + `rare end, and that is the whole shape of it.`;
  }

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
                    collection's. This is the honest baseline, and it is
                    the same at every band.
       with N x     you in the chosen band with nobody else holding any
                    token at all. A ceiling, not a forecast.

     A real outcome sits between them, and nearer the first. Anything
     that showed one number here would be picking an assumption about
     everybody else's wallet and not saying so. */
  const evenPay = (w, pool) => pool * w / TOTAL_WEIGHT;

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

  /* ---- every holding, at a chosen size and a chosen token band ----
     Nine tiers times five quantities times six bands is 270 rows, which
     nobody scrolls through on a phone. Both are chosen instead, and the
     table stays ten rows long.

     Moving the band deliberately does NOT move the even-field column, and
     that is the most useful thing on the page rather than a flaw in it:
     the token scales your weight, not the pool, so if everybody buys the
     same band it cancels out completely and nobody has gained anything. */
  const lede2 = $("[data-ch-lede]");
  if (lede2) lede2.innerHTML =
    `${n_(MAX_PER_WALLET)} beings is the most one wallet may mint. Choose what you hold and `
    + `how much ${TOKEN_NAME} you hold with it.`;

  const bandLabel = $("[data-ch-bandlabel]");
  if (bandLabel) bandLabel.textContent = TOKEN_NAME + " you hold";

  /* short enough to sit on a button */
  const shortHold = v =>
    v === 0 ? "none" :
    v >= 1e6 ? (v / 1e6) + "M" :
    v >= 1e3 ? (v / 1e3) + "k" : String(v);

  /* what your beings earn when YOU carry a multiplier and the rest of the
     field carries none. The multiplier is applied to your weight, so the
     denominator moves with it. */
  const bandPay = (w, mult, pool) => {
    const mine = w * mult;
    return pool * mine / (TOTAL_WEIGHT - w + mine);
  };

  function detail(q, bandIndex) {
    const pool = POOL_FULL;
    const band = TOKEN_BANDS[bandIndex];
    const body = [];

    /* the anchor: what any holding returns on average, which is exactly
       the 75% coming back. Everything that beats this line is paid for
       by something that does not. */
    const avgW = q * TOTAL_WEIGHT / TOTAL_BEINGS;
    body.push({
      lit: true,
      cells: [`Any ${n_(q)}`, n_((q * PRICE).toFixed(2)),
              takeaway(evenPay(avgW, pool), q * PRICE),
              takeaway(bandPay(avgW, band.mult, pool), q * PRICE)]
    });

    TIERS.forEach(t => {
      /* only one Source exists, so a wallet cannot hold two however
         many it mints */
      const held = Math.min(q, t.count);
      const w = t.weight * held, cost = held * PRICE;
      body.push({
        color: t.color,
        lit: t.key === "source",
        cells: [`${t.name} <span class="num">\u00d7${held}</span>`,
                n_(cost.toFixed(2)),
                takeaway(evenPay(w, pool), cost),
                takeaway(bandPay(w, band.mult, pool), cost)]
      });
    });

    table($("[data-ch-table]"), "1.3fr .62fr 1fr 1fr",
      ["Holding", "Mint cost", "Even field",
       `With ${band.mult.toFixed(1)}\u00d7`], body);

    const chosen = $("[data-ch-chosen]");
    if (chosen) chosen.innerHTML = band.hold === 0
      ? `Holding no ${TOKEN_NAME}, your multiplier is <b>1.0×</b> — the last column is the `
        + `same as the first, because there is nothing multiplying it.`
      : `Holding <b>${band.hold.toLocaleString()} ${TOKEN_NAME}</b> puts you in the `
        + `<b>${band.mult.toFixed(1)}×</b> band.`;

    const foot = $("[data-ch-foot]");
    if (foot) foot.innerHTML =
      `All figures in SOL, assuming the drop fills. The first row is what any `
      + `${n_(q)} being${q > 1 ? "s" : ""} return${q > 1 ? "" : "s"} on average — exactly the `
      + `${n_(POOL_PERCENT)}% coming back — and every holding that beats it is paid for by one `
      + `that does not. The small figure under each is what is left once the mint is paid.`
      + `<br><br>`
      + `<b>Even field</b> is what your weight earns when every holder carries the same `
      + `multiplier as you. <b>Notice it does not move when you change the band above.</b> `
      + `That is the mechanism being honest with you: ${TOKEN_NAME} multiplies your weight, `
      + `not the pool, so if everybody buys the same amount it cancels out and nobody has `
      + `gained a thing.`
      + `<br><br>`
      + `<b>With ${band.mult.toFixed(1)}×</b> is the other end: you in this band with nobody `
      + `else holding any ${TOKEN_NAME} at all. It is a ceiling, not a forecast, and it falls `
      + `as other people buy in. What you actually get lands between the two columns — the `
      + `token is worth something only to the degree you hold more of it than the people `
      + `you are sharing the pool with.`
      + `<br><br>`
      + `A holding needs ${n_(breakEven(TOTAL_BEINGS).toFixed(1))} points to return its own `
      + `mint price, so <b>${TIERS.find(t => t.weight >= breakEven(TOTAL_BEINGS)).name}</b> is `
      + `the first tier that pays for itself on weight alone. And you do not choose your tier — `
      + `it is whatever the mint hands you.`;
  }

  /* the two pickers */
  /* It used to open on five beings at the top token band — the most
     flattering corner of the grid, on a panel whose whole argument is that
     it does not flatter. It opens on one being and no tokens now, which is
     what somebody actually has before they decide anything. Everything
     better than that is one tap away. */
  let pickQty = 1, pickBand = 0;

  function picker(el, items, initial, onPick) {
    if (!el) return;
    items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = it.html;
      b.setAttribute("aria-pressed", String(i === initial));
      b.setAttribute("aria-label", it.label);
      b.addEventListener("click", () => {
        [...el.children].forEach(c => c.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        onPick(i);
        detail(pickQty, pickBand);
      });
      el.appendChild(b);
    });
  }

  picker($("[data-ch-qty]"),
    [...Array(MAX_PER_WALLET)].map((_, i) => ({
      html: n_(i + 1), label: (i + 1) + (i ? " beings" : " being")
    })), 0, i => pickQty = i + 1);

  picker($("[data-ch-band]"),
    TOKEN_BANDS.map(b => ({
      html: b.hold === 0 ? "none" : n_(shortHold(b.hold)),
      label: (b.hold === 0 ? "no " + TOKEN_NAME
                           : b.hold.toLocaleString() + " " + TOKEN_NAME)
             + ", " + b.mult.toFixed(1) + " times"
    })), 0, i => pickBand = i);

  detail(pickQty, pickBand);

  const fine = $("[data-rw-fine]");
  if (fine) fine.textContent =
    `Most of the pool is the mint's own money coming back, shared out unevenly. Across `
    + `${TOTAL_BEINGS.toLocaleString()} beings the average is ${POOL_PERCENT}% of what was paid, `
    + `so most people receive less than they put in and a few receive a great deal more. The `
    + `only new money is the ${ROYALTY_PERCENT}% royalty on resales, and that only exists if `
    + `people trade. None of this is a promise of profit, and none of it is financial advice.`;

  /* ---------- lore ----------
     One story, and all of it, from the first visit. It used to be ten
     chapters that unsealed as the mint filled — the staged release wearing
     its last disguise, rationing the one thing on the site that costs
     nothing to give away. */
  const chaptersEl = $(".chapters");
  if (chaptersEl) {
    const art = document.createElement("img");
    art.className = "lore-art";
    art.src = "preview/source.png";
    art.alt = "";
    art.loading = "lazy";
    art.width = 360; art.height = 360;
    chaptersEl.appendChild(art);

    LORE.forEach((para, i) => {
      const p = document.createElement("p");
      p.className = "lore-p" + (i === 0 ? " lore-open" : "");
      p.textContent = para;
      chaptersEl.appendChild(p);
    });
  }

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
