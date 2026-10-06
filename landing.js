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

  /* The tier pictures keep their names when the art changes, and the
     server lets browsers keep images for an hour — so after a new
     collection a visitor saw the old beings. The provenance hash changes
     with every collection, so it is the version: new art, new URL. */
  const ART = "?v=" + String((typeof CONFIG !== "undefined" && CONFIG.provenance) || "1").slice(0, 8);

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

  /* no closing date: the gate shuts when the last being is minted */
  $$("[data-closes]").forEach(n => n.textContent = "when all " + TOTAL_BEINGS.toLocaleString() + " are minted");

  /* ---------- what is true right now, on the door ---------- */
  /* The creed directly above this already says "1,111 beings · one drop",
     so this carried the same sentence twice. It carries the price now,
     which is the other thing a stranger wants before deciding anything. */
  $$("[data-price]").forEach(n => n.textContent = `${PRICE} SOL`);

  /* short enough that all three sit on one row on a phone */
  const supply = $("#st-supply");
  if (supply) {
    supply.textContent = `${minted.toLocaleString()} / ${TOTAL_BEINGS.toLocaleString()}`;
  }

  const status = $("#st-status");
  if (status) {
    const open = !!CONFIG.mintLink && !soldOut;
    status.textContent = soldOut ? "Gone" : open ? "Open" : "Closed";
    status.classList.toggle("shut", !open);
  }

  /* ---------- live: the pool raised so far, and the $DMT market cap ----------
     Read from the server, which reads the chain and DexScreener. Until the
     collection exists the pool shows what data.js says has been minted
     (nothing), and the market cap shows a dash rather than a guess. */
  $$("[data-token-name]").forEach(n => n.textContent = TOKEN_NAME);
  const usd = n => n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M"
                 : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n);
  const showPool = n => $$("[data-live-pool]").forEach(el =>
    el.textContent = poolFrom(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " SOL");
  showPool(minted);
  /* the rewards wallet: its address on Solscan at once, its balance once the server has read it */
  if (CONFIG.rewardsWallet) {
    $$("[data-rw-wallet]").forEach(el => el.hidden = false);
    $$("[data-rw-link]").forEach(a => a.href = "https://solscan.io/account/" + CONFIG.rewardsWallet);
  }
  fetch("/api/stats").then(r => r.json()).then(s => {
    if (s.minted != null) {
      const n = Math.min(s.minted, TOTAL_BEINGS);
      showPool(n);
      if (supply) supply.textContent = `${n.toLocaleString()} / ${TOTAL_BEINGS.toLocaleString()}`;
      $$("[data-minted]").forEach(el => el.textContent = n.toLocaleString());
      if (bar) bar.style.width = Math.min(100, (n / TOTAL_BEINGS) * 100) + "%";
    }
    if (s.dmt && s.dmt.mcap) $$("[data-live-mcap]").forEach(el => el.textContent = usd(s.dmt.mcap));
    if (s.rewards && s.rewards.sol != null)
      $$("[data-rw-bal]").forEach(el => el.textContent = s.rewards.sol.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " SOL");
  }).catch(() => {});

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
      mintBtn.textContent = "Go to the mint";
      mintNote.textContent = "The only official mint page. Connect your Solana wallet there.";
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
      if (key === "telegram") a.dataset.short = "TG";   // the long word does not fit beside the mark on a phone
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
      img.src = "preview/" + key + ".png" + ART;
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
    art.src = "preview/" + t.key + ".png" + ART;
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
    `When the last of the ${TOTAL_BEINGS.toLocaleString()} is minted, ${POOL_PERCENT}% of the mint is shared among the people `
    + `holding beings. Your slice is two things multiplied together: the beings you `
    + `hold, and the ${TOKEN_NAME} you hold.`;

  const poolEl = $("[data-rw-pool]");
  if (poolEl) poolEl.textContent =
    `${POOL_PERCENT}% of the mint goes back to holders: ${POOL_PERCENT}% of ${TOTAL_BEINGS.toLocaleString()} `
    + `at ${PRICE} SOL is ${POOL_FULL} SOL. There is no closing date: the gate stays open `
    + `until every being is minted, and the pool is paid once, when the last one goes.`;

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
     BUILD YOUR HOLDING

     Pick the beings you hold, tier by tier, and the $DMT you hold with
     them, and see what the wallet receives once all 1,111 are minted.

     Reward is exact for the beings: by then the pool and the total weight
     are both fixed. The $DMT boost is shown apart from it as the most the
     token could add, if nobody else held any, because what it is really
     worth depends on everybody else's.
     ============================================================ */
  const n_ = v => `<span class="num">${v}</span>`;
  const sol3 = v => v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
  const shortHold = v => v === 0 ? "none" : v >= 1e6 ? (v / 1e6) + "M" : v >= 1e3 ? (v / 1e3) + "k" : String(v);

  const held = Object.fromEntries(TIERS.map(t => [t.key, 0]));
  held.common = 1;                         // what somebody has before deciding anything
  let pickBand = 0;

  const buildEl = $("[data-bh-tiers]");
  if (buildEl) {
    buildEl.innerHTML = TIERS.slice().reverse().map(t =>
      `<div class="bh-tier" style="--c:${t.color}" data-k="${t.key}">`
      + `<img src="preview/${t.key}.png?v=${String(CONFIG.provenance || "").slice(0, 8)}" alt="" loading="lazy">`
      + `<span class="bh-name"><b>${t.name}</b><i>weight ${n_(t.weight)}</i></span>`
      + `<span class="bh-step">`
        + `<button type="button" data-d="-1" aria-label="One fewer ${t.name}">&minus;</button>`
        + `<span class="num" data-n>0</span>`
        + `<button type="button" data-d="1" aria-label="One more ${t.name}">+</button>`
      + `</span></div>`).join("");
    buildEl.addEventListener("click", e => {
      const btn = e.target.closest("button[data-d]"); if (!btn) return;
      const k = btn.closest(".bh-tier").dataset.k, t = TIERS.find(x => x.key === k);
      const total = Object.values(held).reduce((a, x) => a + x, 0);
      const d = Number(btn.dataset.d);
      if (d > 0 && (total >= MAX_PER_WALLET || held[k] >= t.count)) return;
      held[k] = Math.max(0, held[k] + d);
      drawHolding();
    });
  }

  const bandsEl = $("[data-bh-bands]");
  if (bandsEl) TOKEN_BANDS.forEach((b, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = (b.hold === 0 ? "none" : n_(shortHold(b.hold))) + `<i class="num">${b.mult.toFixed(1)}×</i>`;
    btn.setAttribute("aria-label", (b.hold === 0 ? "no " + TOKEN_NAME : b.hold.toLocaleString() + " " + TOKEN_NAME) + ", " + b.mult.toFixed(1) + " times");
    btn.addEventListener("click", () => { pickBand = i; drawHolding(); });
    bandsEl.appendChild(btn);
  });
  const bandLabel = $("[data-bh-bandlabel]");
  if (bandLabel) bandLabel.textContent = TOKEN_NAME + " you hold";

  function drawHolding() {
    const n = Object.values(held).reduce((a, x) => a + x, 0);
    const w = TIERS.reduce((a, t) => a + t.weight * held[t.key], 0);
    const band = TOKEN_BANDS[pickBand], m = band.mult;
    $$(".bh-tier").forEach(el => {
      const k = el.dataset.k;
      $("[data-n]", el).textContent = held[k];
      el.classList.toggle("on", held[k] > 0);
      const t = TIERS.find(x => x.key === k);
      $('button[data-d="1"]', el).disabled = n >= MAX_PER_WALLET || held[k] >= t.count;
      $('button[data-d="-1"]', el).disabled = held[k] === 0;
    });
    if (bandsEl) [...bandsEl.children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === pickBand)));

    const out = $("[data-bh-result]");
    if (!out) return;
    if (!n) { out.innerHTML = `<p class="bh-empty">Add a being to see what it receives. ${TOKEN_NAME} on its own receives nothing.</p>`; return; }
    const reward = POOL_FULL * w / TOTAL_WEIGHT;
    const mine = w * m, high = POOL_FULL * mine / (TOTAL_WEIGHT - w + mine);
    out.innerHTML =
        `<div class="bh-figs">`
        + `<div class="bh-main"><span>Reward</span><b class="num">${sol3(reward)}</b><i>SOL, once all ${TOTAL_BEINGS.toLocaleString()} are minted</i></div>`
        + `<div><span>${TOKEN_NAME} boost</span><b class="num">${m > 1 ? "+" + sol3(high - reward) : "—"}</b>`
          + `<i>${m > 1 ? "SOL at most, at " + m.toFixed(1) + "×" : "no " + TOKEN_NAME + " held"}</i></div>`
      + `</div>`
      + `<div class="sum-total"><span>Total</span><b class="num">${m > 1 ? "up to " : ""}${sol3(m > 1 ? high : reward)} SOL</b>`
        + `<i>${m > 1 ? "reward + " + TOKEN_NAME + " boost" : "your reward; add " + TOKEN_NAME + " to boost it"}</i></div>`
      + `<p class="bh-line">${n_(n)} being${n > 1 ? "s" : ""} &middot; weight ${n_(w)} of ${n_(TOTAL_WEIGHT.toLocaleString())} `
        + `&middot; ${n_((PRICE * n).toFixed(2))} SOL to mint</p>`
      + `<p class="bh-note">The reward is exact for the beings. The ${TOKEN_NAME} boost is the most it could add, `
        + `if nobody else held any; if everyone holds the same band it cancels out. Up to `
        + `${n_(MAX_PER_WALLET)} beings per wallet at mint.</p>`;
  }
  drawHolding();

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
    art.src = "preview/source.png" + ART;
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
