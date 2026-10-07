/* ============================================================
   REALM — the holders page.

   Three things, all from the numbers in data.js so there is one source
   of truth for them:

     look up    paste an address; the server reads what it holds
     what if    build a holding by hand and watch the payout move
     top        the biggest holders, read from the chain

   Every payout is given as a range, never as one number, because a
   holder's share depends on everybody else's $DMT and nobody can know
   that before the snapshot:

     low      everyone else is in the top band
     typical  everyone is in your band — the multipliers cancel
     high     nobody else holds any $DMT

   All of it assumes the drop fills. Said on the page, too.
   ============================================================ */

(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const POOL   = POOL_FULL;
  const W      = TOTAL_WEIGHT;
  const BANDS  = TOKEN_BANDS;
  const MAXM   = BANDS[BANDS.length - 1].mult;
  const TOKEN  = TOKEN_NAME;
  const ART    = "?v=" + String(CONFIG.provenance || "1").slice(0, 8);
  const ADDR   = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  const tierOf  = n => TIERS.find(t => t.name === n || t.key === n);
  const multFor = bal => BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);
  const nextBand = bal => BANDS.find(b => b.hold > bal);
  const sol = (x, d) => (x >= 10 ? x.toFixed(2) : x.toFixed(d == null ? 3 : d));
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const fmt = n => n.toLocaleString();
  /* names, tiers and image links come off the chain: anybody can mint
     metadata, so none of it goes into the page unescaped */
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => /^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(String(u || "")) ? String(u) : "";

  /* the range, for a total weight w at multiplier m */
  function range(w, m) {
    w = Math.min(w, W);
    if (!w) return { low: 0, typ: 0, high: 0 };
    const mine = w * m, rest = W - w;
    return {
      low:  POOL * mine / (mine + rest * MAXM),
      typ:  POOL * w / W,
      high: POOL * mine / (mine + rest)
    };
  }

  /* ---------- the fixed text ---------- */
  $$("[data-token]").forEach(n => n.textContent = TOKEN);
  $$("[data-ticker]").forEach(n => n.textContent = TOKEN);
  $$("[data-pool-pct]").forEach(n => n.textContent = POOL_PERCENT + "%");
  $$("[data-total]").forEach(n => n.textContent = fmt(TOTAL_BEINGS));
  $$("[data-weight]").forEach(n => n.textContent = fmt(W));
  const minted = Math.max(0, Math.min(CONFIG.minted || 0, TOTAL_BEINGS));
  $$("[data-pool]").forEach(n => n.textContent = sol(POOL, 1) + " SOL");
  $$("[data-pool-note]").forEach(n => n.textContent = minted
    ? sol(poolFrom(minted), 2) + " SOL so far, " + fmt(minted) + " minted"
    : "if every being is minted");

  /* live: the pool raised so far and the $DMT market cap, from the server */
  const usd = n => n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M"
                 : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n);
  /* the rewards wallet: its address on Solscan at once, its balance once the server has read it */
  if (CONFIG.rewardsWallet) {
    $$("[data-rw-wallet]").forEach(el => el.hidden = false);
    $$("[data-rw-link]").forEach(a => a.href = "https://solscan.io/account/" + CONFIG.rewardsWallet);
  }
  fetch("/api/stats").then(r => r.json()).then(s => {
    if (s.minted != null) {
      const n = Math.min(s.minted, TOTAL_BEINGS);
      $$("[data-live-pool]").forEach(el => el.textContent = sol(poolFrom(n), 2) + " SOL");
      $$("[data-live-minted]").forEach(el => el.textContent = fmt(n) + " of " + fmt(TOTAL_BEINGS) + " minted");
    }
    if (s.token) $$("[data-live-mcap]").forEach(el => {
      el.innerHTML = '<a href="https://pump.fun/coin/' + encodeURIComponent(s.token) + '" target="_blank" rel="noopener" style="color:inherit">'
        + (s.dmt && s.dmt.mcap ? usd(s.dmt.mcap) : "LIVE") + ' &nearr;</a>';
    });
    if (s.rewards && s.rewards.sol != null)
      $$("[data-rw-bal]").forEach(el => el.textContent = s.rewards.sol.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " SOL");
  }).catch(() => {});

  const wEl = $("[data-weights]");
  if (wEl) wEl.innerHTML = TIERS.map(t =>
    '<div style="--c:' + t.color + '"><img src="preview/' + t.key + '.png' + ART + '" alt="" loading="lazy">'
    + '<span>' + t.name + '</span><b class="num">' + t.weight + '</b></div>').join("");

  /* ---------- the reward, drawn ----------
     The headline is the reward: what the beings are worth once all 1,111
     are minted. Pool and total weight are both fixed by then, so for the
     beings alone it is an exact figure. The token is shown apart from it,
     as a boost, because what a boost is worth depends on how much of the
     token everybody else holds. The bar runs from nothing to the most the
     boost could reach, with the reward marked and the mint cost too. */
  function rewardHTML(r, w, m, cost) {
    const boost = Math.max(0, r.high - r.typ);
    const top = Math.max(r.high, cost || 0) * 1.08 || 1;
    const at = x => (100 * x / top).toFixed(1) + "%";
    const share = (100 * r.typ / POOL);
    return '<div class="h-range">'
      + '<div class="h-figs h-figs2">'
        + '<div class="ty"><span>Reward</span><b class="num">' + sol(r.typ) + '</b><i>SOL, once all '
          + fmt(TOTAL_BEINGS) + ' are minted</i></div>'
        + '<div class="hi"><span>' + TOKEN + ' boost</span><b class="num">'
          + (m > 1 ? '+' + sol(boost) : '—') + '</b><i>'
          + (m > 1 ? 'SOL at most, at ' + m.toFixed(1) + '×' : 'no ' + TOKEN + ' held') + '</i></div>'
      + '</div>'
      + '<div class="sum-total"><span>Total</span><b class="num">' + (m > 1 ? 'up to ' : '') + sol(m > 1 ? r.high : r.typ) + ' SOL</b>'
        + '<i>' + (m > 1 ? 'reward + ' + TOKEN + ' boost' : 'your reward; add ' + TOKEN + ' to boost it') + '</i></div>'
      + '<div class="h-bar" role="img" aria-label="Reward ' + sol(r.typ) + ' SOL'
        + (m > 1 ? ', up to ' + sol(r.high) + ' SOL with the boost' : '') + '">'
        + '<div class="h-span" style="left:0;width:' + at(r.typ) + '"></div>'
        + (m > 1 ? '<div class="h-boost" style="left:' + at(r.typ) + ';width:calc(' + at(r.high) + ' - ' + at(r.typ) + ')"></div>' : "")
        + '<div class="h-tick ty" style="left:' + at(r.typ) + '"></div>'
        + (cost ? '<div class="h-cost' + (cost / top > 0.6 ? ' flip' : '') + '" style="left:' + at(cost) + '"><i>mint cost ' + sol(cost, 2) + '</i></div>' : "")
      + '</div>'
      + '<p class="h-sub">' + fmt(w) + ' weight of ' + fmt(W) + ' &middot; '
        + share.toFixed(share < 1 ? 2 : 1) + '% of the pool</p>'
      + '</div>';
  }

  /* ============================================================
     WHAT IF
     ============================================================ */
  const counts = Object.fromEntries(TIERS.map(t => [t.key, 0]));
  counts.common = 1;
  let band = 0;

  const tiersEl = $("[data-tiers]");
  tiersEl.innerHTML = TIERS.map(t =>
    '<div class="h-tier" style="--c:' + t.color + '" data-k="' + t.key + '">'
    + '<img src="preview/' + t.key + '.png' + ART + '" alt="" loading="lazy">'
    + '<div class="h-tname"><b>' + t.name + '</b><i>weight <span class="num">' + t.weight + '</span></i></div>'
    + '<div class="h-step">'
      + '<button type="button" data-d="-1" aria-label="One fewer ' + t.name + '">&minus;</button>'
      + '<span class="num" data-n></span>'
      + '<button type="button" data-d="1" aria-label="One more ' + t.name + '">+</button>'
    + '</div></div>').join("");

  tiersEl.addEventListener("click", e => {
    const b = e.target.closest("button[data-d]");
    if (!b) return;
    const k = b.closest(".h-tier").dataset.k;
    const t = tierOf(k);
    counts[k] = Math.max(0, Math.min(t.count, counts[k] + Number(b.dataset.d)));
    draw();
  });

  /* Tap buttons, not a slider. A slider on a phone catches the finger of
     anybody scrolling past it, and every value it skidded through changed
     the figures and the height of the section underneath. */
  $("[data-bands]").innerHTML = BANDS.map((b, i) =>
    '<button type="button" role="radio" data-i="' + i + '">' + (b.hold ? (b.hold >= 1e6 ? b.hold / 1e6 + "M" : b.hold / 1e3 + "k") : "0")
    + '<i>' + b.mult.toFixed(1) + '×</i></button>').join("");
  $("[data-bands]").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]");
    if (b) { band = Number(b.dataset.i); draw(); }
  });

  function draw() {
    $$(".h-tier").forEach(el => {
      const n = counts[el.dataset.k];
      $("[data-n]", el).textContent = n;
      el.classList.toggle("on", n > 0);
    });
    const b = BANDS[band];
    $$("[data-bands] button").forEach((el, i) => {
      el.classList.toggle("on", i === band);
      el.setAttribute("aria-checked", i === band ? "true" : "false");
    });

    const n = Object.values(counts).reduce((a, x) => a + x, 0);
    const w = TIERS.reduce((a, t) => a + t.weight * counts[t.key], 0);
    const res = $("[data-result]");
    if (!n) {
      res.innerHTML = '<p class="h-note">Add a being to see what it earns. ' + TOKEN
        + ' on its own earns nothing.</p>';
      return;
    }
    const cost = n * PRICE;
    const r = range(w, b.mult);
    const nb = nextBand(b.hold);
    res.innerHTML = rewardHTML(r, w, b.mult, cost)
      + '<p class="h-note">' + fmt(n) + ' being' + (n > 1 ? "s" : "") + ', ' + sol(cost, 2)
      + ' SOL to mint. '
      + (nb ? 'Moving up to ' + fmt(nb.hold) + ' ' + TOKEN + ' (' + nb.mult.toFixed(1)
        + '×) would raise the most the boost could add to +' + sol(range(w, nb.mult).high - range(w, nb.mult).typ) + ' SOL.'
        : 'This is the top ' + TOKEN + ' band.') + '</p>';
  }
  draw();

  /* ============================================================
     LOOK UP
     ============================================================ */
  const input = $("#lookup input"), go = $("#lookup .h-go"), out = $("#lookup .h-out");
  const say = h => { out.innerHTML = h; };

  async function lookup() {
    const a = input.value.trim();
    if (!ADDR.test(a)) return say('<p class="h-bad">That does not look like a Solana address.</p>');
    go.disabled = true;
    say('<p class="h-note">Reading the chain…</p>');
    try {
      const r = await fetch("/api/holdings?address=" + encodeURIComponent(a));
      const d = await r.json().catch(() => ({}));
      if (r.status === 503 || d.ready === false) {
        say('<p class="h-note">Nothing has been minted yet, so there is nothing to read. '
          + 'This works the moment the collection exists. Until then, try <a href="#build">What if</a>.</p>');
      } else if (!r.ok) {
        say('<p class="h-bad">' + (d.error || "Could not read the chain just now.") + '</p>');
      } else {
        say(wallet(a, d));
      }
    } catch {
      say('<p class="h-bad">Could not reach the chain. Try again in a moment.</p>');
    }
    go.disabled = false;
  }
  go.addEventListener("click", lookup);
  input.addEventListener("keydown", e => { if (e.key === "Enter") lookup(); });

  function wallet(addr, d) {
    const beings = d.beings || [];
    const tokens = d.tokens || 0;
    const m = multFor(tokens);
    if (!beings.length) {
      return '<p class="h-note"><b>' + short(addr) + '</b> holds no beings'
        + (tokens ? ', and ' + fmt(tokens) + ' ' + TOKEN + ' — which earns nothing on its own.' : '.')
        + '</p>';
    }
    const order = TIERS.map(t => t.name).reverse();
    beings.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
    const w = beings.reduce((a, b) => a + ((tierOf(b.tier) || {}).weight || 0), 0);
    const nb = nextBand(tokens);

    // load it into the builder too, so it can be played with
    TIERS.forEach(t => counts[t.key] = 0);
    beings.forEach(b => { const t = tierOf(b.tier); if (t) counts[t.key]++; });
    band = BANDS.reduce((i, b, k) => tokens >= b.hold ? k : i, 0);
    draw();

    const grid = beings.slice(0, 24).map(b => {
      const t = tierOf(b.tier) || {};
      const src = safeUrl(b.image).replace(/^https:\/\/(?:gateway\.irys\.xyz|arweave\.net)\/([A-Za-z0-9_-]{43,44})$/, "/img/$1").replace(/^ipfs:\/\//i, "https://ipfs.io/ipfs/")
                                  .replace(/^ar:\/\//i, "https://arweave.net/")
               || ("preview/" + (t.key || "common") + ".png" + ART);
      return '<figure style="--c:' + (t.color || "#9d8fc4") + '">'
        + '<img src="' + esc(src) + '" alt="' + esc(b.name) + '" loading="lazy">'
        + '<figcaption>' + esc(t.name || b.tier) + '</figcaption></figure>';
    }).join("") + (beings.length > 24 ? '<p class="h-more">+' + (beings.length - 24) + ' more</p>' : "");

    return '<p class="h-who"><b>' + short(addr) + '</b> &middot; <a href="/wallet?a=' + esc(addr) + '">open the full wallet page &rarr;</a></p>'
      + '<div class="h-grid">' + grid + '</div>'
      + '<div class="h-sum">'
        + '<div><span>Beings</span><b class="num">' + fmt(beings.length) + '</b></div>'
        + '<div><span>Weight</span><b class="num">' + fmt(w) + '</b></div>'
        + '<div><span>' + TOKEN + '</span><b class="num">' + fmt(tokens) + '</b></div>'
        + '<div><span>Multiplier</span><b class="num">' + m.toFixed(1) + '×</b></div>'
      + '</div>'
      + rewardHTML(range(w, m), w, m, 0)
      + (nb ? '<p class="h-note">Hold ' + fmt(nb.hold - tokens) + ' more ' + TOKEN
        + ' to reach ' + nb.mult.toFixed(1) + '×. This holding is now loaded into '
        + '<a href="#build">What if</a> below.</p>'
        : '<p class="h-note">In the top ' + TOKEN + ' band. Loaded into <a href="#build">What if</a> below.</p>');
  }

  /* ============================================================
     TOP HOLDERS
     ============================================================ */
  (async () => {
    const el = $("[data-board]");
    try {
      const r = await fetch("/api/holders");
      const d = await r.json().catch(() => ({}));
      if (r.status === 503 || d.ready === false) {
        el.innerHTML = '<p class="h-note">The board fills in once the collection is minted: '
          + 'every holder, ranked by weight, read straight from the chain.</p>';
        return;
      }
      if (!r.ok || !d.top) throw 0;
      const pool = d.minted ? poolFrom(d.minted) : POOL;
      const rows = d.top.map((o, i) => {
        const share = o.weight / W;
        return '<tr><td class="num">' + (i + 1) + '</td>'
          + '<td><button type="button" class="h-addr" data-a="' + esc(o.owner) + '">' + esc(short(String(o.owner))) + '</button></td>'
          + '<td class="num">' + Number(o.beings) + '</td>'
          + '<td class="num">' + Number(o.weight) + '</td>'
          + '<td class="num">' + (o.tokens == null ? "—" : multFor(o.tokens).toFixed(1) + "×") + '</td>'
          + '<td class="num">' + (100 * share).toFixed(1) + '%</td>'
          + '<td class="num">' + sol(POOL * share) + '</td></tr>';
      }).join("");
      el.innerHTML = '<div class="h-sum">'
          + '<div><span>Holders</span><b class="num">' + fmt(d.holders) + '</b></div>'
          + '<div><span>Minted</span><b class="num">' + fmt(d.minted) + '</b></div>'
          + '<div><span>Pool now</span><b class="num">' + sol(pool, 2) + '</b></div>'
        + '</div>'
        + '<div class="h-table"><table><thead><tr><th>#</th><th>Wallet</th><th>Beings</th>'
        + '<th>Weight</th><th>Band</th><th>Share</th><th>Reward</th></tr></thead><tbody>'
        + rows + '</tbody></table></div>'
        + '<p class="h-note">Reward is each wallet&rsquo;s SOL from its beings once all ' + fmt(TOTAL_BEINGS) + ' are minted, before any ' + TOKEN + ' boost. '
        + 'Tap a wallet to look it up. Updated every few minutes.</p>';
      el.addEventListener("click", e => {
        const b = e.target.closest(".h-addr");
        if (!b) return;
        input.value = b.dataset.a;
        $("#lookup").scrollIntoView({ behavior: "smooth" });
        lookup();
      });
    } catch {
      el.innerHTML = '<p class="h-bad">Could not read the board just now.</p>';
    }
  })();
})();
