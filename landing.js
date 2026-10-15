/* ============================================================
   REALM — the landing page's behaviour.

   Fills the panels from data.js and opens them over the gate.
   Nothing here needs editing.

   REALM is $DMT and BREAKTHROUGH: the beings are the game's cards, and
   holding $DMT boosts every cast.
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

  /* ---------- fill in the numbers ---------- */
  $$("[data-total]").forEach(n => n.textContent = TOTAL_BEINGS.toLocaleString());
  $$("[data-tiers]").forEach(n => n.textContent = TIERS.length);
  $$("[data-token-name]").forEach(n => n.textContent = TOKEN_NAME);

  /* ---------- the holder boost, straight from the game's own rules ----------
     bt/engine.js is the same file the game and the server score with, so this
     table can't drift from what a cast actually gets. */
  const B = window.RealmBreak;
  if (B) {
    const top = B.BOOST_BANDS[B.BOOST_BANDS.length - 1][1];
    $$("[data-boost-max]").forEach(n => n.textContent = String((100 + top) / 100));
    const rowsEl = $("[data-boost-rows]");
    if (rowsEl) B.BOOST_BANDS.forEach(([hold, pct], i) => {
      const r = document.createElement("div");
      r.className = "rw-row" + (hold === 500000 ? " lit" : "");
      r.innerHTML = `<span>${hold.toLocaleString("en-GB")} ${TOKEN_NAME}${i === B.BOOST_BANDS.length - 1 ? " or more" : ""}</span><b>+${pct}% &middot; &times;${(100 + pct) / 100}</b>`;
      rowsEl.appendChild(r);
    });
  }

  /* ---------- live: the $DMT market cap ---------- */
  const usd = n => n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M"
                 : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n);
  /* the contract address: shown in full or short, a tap copies it */
  const CA = { token: CONFIG.tokenMint || "" };
  $$("[data-ca]").forEach(el => {
    const a = CA[el.dataset.ca]; if (!a) { el.hidden = true; return; }
    const label = "$DMT CA";
    const show = () => { el.innerHTML = (el.hasAttribute("data-ca-full") ? "" : "<span>" + label + "</span> ") + "<b>" + (el.hasAttribute("data-ca-full") ? a : a.slice(0, 6) + "…" + a.slice(-4)) + "</b> <i>copy</i>"; };
    show();
    el.addEventListener("click", async e => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(a); } catch (err) {
        const t = document.createElement("textarea"); t.value = a; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (x) { /* nothing more to try */ } t.remove();
      }
      el.classList.add("copied"); el.querySelector("i").textContent = "copied";
      setTimeout(() => { el.classList.remove("copied"); show(); }, 1600);
    });
  });
  if (CA.token) {
    $$("[data-ca-pump]").forEach(x => x.href = "https://pump.fun/coin/" + CA.token);
    $$("[data-ca-dex]").forEach(x => x.href = "https://dexscreener.com/solana/" + CA.token);
    $$("[data-ca-scan]").forEach(x => x.href = "https://solscan.io/token/" + CA.token);
  }

  fetch("/api/stats").then(r => r.json()).then(s => {
    if (s.token) $$("[data-live-mcap]").forEach(el => {
      // in the top bar the label is hidden on a phone, so the chip says what the number is
      el.innerHTML = '<a href="https://dexscreener.com/solana/' + encodeURIComponent(s.token) + '" target="_blank" rel="noopener" style="color:inherit">'
        + (el.closest(".top-stats") ? "<small>MCAP</small>" : "") + (s.dmt && s.dmt.mcap ? usd(s.dmt.mcap) : "LIVE") + ' &nearr;</a>';
    });
  }).catch(() => {});

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
      // an item-page template ({mint}) is not a page of its own
      if (!url || url.includes("{mint}") || /^https:\/\/(x\.com|t\.me)\/?$/.test(url)) return;
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
    if (url && !url.includes("{mint}")) { el.href = url; el.target = "_blank"; el.rel = "noopener"; }
    else el.remove();
  });

  /* ---------- the tiers: what each tier of card looks like, and how many there are ---------- */
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
      if (/\d/.test(n.nodeValue) && !(n.parentNode && (n.parentNode.classList.contains("num") || n.parentNode.closest(".ca-chip"))))
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

  // a link straight to a panel: dmt-realm.dev/#dmt, /#cards, /#lore, /#faq (old #rewards and #mint links land on $DMT)
  const ALIAS = { dmt: "dmt", rewards: "dmt", mint: "dmt", beings: "nfts", cards: "nfts", nfts: "nfts", lore: "lore", faq: "faq" };
  const fromHash = () => { const k = ALIAS[location.hash.slice(1)]; if (k) show(k); };
  setTimeout(fromHash, 400);
  window.addEventListener("hashchange", fromHash);

  $$(".panel-close").forEach(b => b.addEventListener("click", hide));

  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });

  // tapping the dimmed area outside the content closes it too
  $$(".panel").forEach(p => p.addEventListener("click", e => {
    if (e.target === p) hide();
  }));
})();
