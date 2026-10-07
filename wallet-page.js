/* ============================================================
   REALM — the wallet page.  /wallet?a=<address>

   Everything one address holds, laid out: each being with its picture,
   tier and weight, what the whole holding receives when the last being
   is minted, where it ranks, and what $DMT would do to it. The link is
   the address, so a holder can share their page.

   The figures are the same ones holders.html and the Check sheet give:
   the pool at sell-out, times this wallet's weight, over all the weight
   in the collection. The $DMT figures are the most it could add, if
   nobody else held any.
   ============================================================ */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const fmt = n => Number(n).toLocaleString();
  const sol = (x, d) => (d != null ? x.toFixed(d) : x < 1 ? x.toFixed(3) : x.toFixed(2));
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => /^https:\/\//i.test(String(u || "")) ? String(u) : "";

  const W = TOTAL_WEIGHT, POOL = POOL_FULL, TOKEN = TOKEN_NAME;
  const tierOf = name => TIERS.find(t => t.name === name || t.key === name) || { name, weight: 0, color: "#9d8fc4" };
  const multFor = bal => TOKEN_BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);
  const bandOf = bal => TOKEN_BANDS.reduce((i, b, k) => bal >= b.hold ? k : i, 0);
  const PT = POOL / W;                                     // one weight point, in SOL
  const even = w => POOL * w / W;                          // everyone at the same band
  const most = (w, m) => POOL * w * m / (W - w + w * m);   // nobody else holds $DMT
  const kfmt = n => n >= 1e6 ? (n / 1e6) + "M" : n >= 1e3 ? (n / 1e3) + "K" : String(n);

  const out = $("[data-out]"), form = $("[data-find]"), input = form.querySelector("input");
  const say = h => { out.innerHTML = h; };

  form.addEventListener("submit", e => {
    e.preventDefault();
    const a = input.value.trim();
    if (!ADDR.test(a)) return say('<section class="h-card"><p class="h-bad">That does not look like a Solana address.</p></section>');
    history.replaceState(null, "", "/wallet?a=" + a);
    load(a);
  });

  const start = new URLSearchParams(location.search).get("a") || "";
  if (start) { input.value = start; if (ADDR.test(start)) load(start); }

  let stats = null, RANK = {};
  const statsP = Promise.all([
    fetch("/api/stats").then(r => r.json()).then(s => (stats = s)).catch(() => null),
    fetch("rarity.json").then(r => r.json()).then(r => (RANK = r)).catch(() => null)   // rarity rank by number, from tools/rarity.py
  ]);

  async function load(a) {
    say('<section class="h-card"><p class="h-note">Reading the chain…</p></section>');
    try {
      const r = await fetch("/api/holdings?address=" + encodeURIComponent(a));
      const d = await r.json().catch(() => ({}));
      if (r.status === 503 || d.ready === false) return say('<section class="h-card"><p class="h-note">Nothing has been minted yet.</p></section>');
      if (!r.ok) return say('<section class="h-card"><p class="h-bad">' + esc(d.error || "Could not read the chain just now.") + '</p></section>');
      await statsP;
      const pay = await fetch("/api/payout?address=" + encodeURIComponent(a)).then(r => r.json()).catch(() => null);
      say(page(a, d, pay));
      wire(a, d);
      document.title = "REALM — " + short(a);
    } catch {
      say('<section class="h-card"><p class="h-bad">Could not reach the chain. Try again in a moment.</p></section>');
    }
  }

  /* once the snapshot exists, the payout decides: show it first */
  function payCard(pay) {
    if (!pay || !pay.snapshot) return "";
    const h = pay.holder;
    if (!h) return '<section class="h-card"><h2>Payout</h2><p class="h-note">This wallet held no beings at the snapshot, so it is not in the payout. '
      + '<a href="/payout">See the snapshot</a></p></section>';
    const due = pay.dueAt ? new Date(pay.dueAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return '<section class="w-hero"><span>' + (h.paid ? 'Paid to this wallet' : 'Share in the payout') + '</span>'
      + '<b class="num">' + (h.sol < 1 ? h.sol.toFixed(4) : h.sol.toFixed(3)) + '<small>SOL</small></b>'
      + '<p>' + (h.paid ? 'Sent from the payout wallet. <a href="https://solscan.io/account/' + esc(pay.payoutWallet || "") + '" target="_blank" rel="noopener">See it on Solscan</a>'
        : !h.payable ? 'Held back: this address is a program account (a marketplace listing, say), so it is settled by hand.'
        : 'Due ' + esc(due) + '. Nothing to claim: it arrives in this wallet.') + '</p>'
      + '<p><i>From the snapshot of ' + esc(new Date(pay.snapshot.takenAt).toLocaleDateString()) + ' &middot; <a href="/payout">every share</a></i></p></section>';
  }

  function page(a, d, pay) {
    const beings = (d.beings || []).slice();
    const tokens = d.tokens || 0;
    const head = '<section class="w-head">'
      + '<p class="eyebrow">Wallet</p>'
      + '<h1 class="w-addr">' + esc(short(a)) + '</h1>'
      + '<div class="w-chips">'
        + (d.rank ? '<span class="w-chip rank">Rank #' + d.rank + ' of ' + fmt(d.holders) + ' holders</span>' : '')
        + '<button type="button" class="w-chip" data-copy>Copy address</button>'
        + '<a class="w-chip" href="https://solscan.io/account/' + esc(a) + '" target="_blank" rel="noopener">Solscan &nearr;</a>'
      + '</div></section>';

    if (!beings.length) {
      return head + payCard(pay) + '<section class="h-card w-empty"><b>No beings in this wallet' + (pay && pay.snapshot ? ' now' : ' yet') + '</b>'
        + '<p class="h-note">' + (tokens ? 'It holds ' + fmt(tokens) + ' ' + TOKEN + ', which multiplies beings but earns nothing on its own. ' : '')
        + 'Each being carries weight, and weight is what the holder pool pays on.</p>'
        + '<div class="w-share"><a class="w-btn" href="/mint">Mint a being</a></div></section>';
    }

    const order = TIERS.map(t => t.name);
    beings.sort((x, y) => order.indexOf(y.tier) - order.indexOf(x.tier) || (x.n || 0) - (y.n || 0));
    const w = beings.reduce((s, b) => s + tierOf(b.tier).weight, 0);
    const m = multFor(tokens);
    const base = even(w), top = most(w, m);
    const share = 100 * w / W;

    const hero = '<section class="w-hero">'
      + '<span>Receives when all ' + fmt(TOTAL_BEINGS) + ' are minted</span>'
      + '<b class="num">' + sol(base) + '<small>SOL</small></b>'
      + (m > 1 ? '<p class="up">Up to ' + sol(top) + ' SOL with ' + m.toFixed(1) + '&times; ' + TOKEN + '</p>' : '')
      + '<p>' + share.toFixed(share < 1 ? 2 : 1) + '% of the ' + sol(POOL, 2) + ' SOL holder pool <i>&middot; '
        + fmt(w) + ' of ' + fmt(W) + ' weight points</i></p>'
      + '</section>';

    const statsRow = '<section class="w-stats">'
      + '<div><span>Beings</span><b class="num">' + fmt(beings.length) + '</b><i>held</i></div>'
      + '<div><span>Weight</span><b class="num">' + fmt(w) + '</b><i>points</i></div>'
      + '<div><span>' + TOKEN + '</span><b class="num">' + (stats && stats.token ? fmt(tokens) : '&mdash;') + '</b><i>'
        + (stats && stats.token ? 'held' : 'not launched yet') + '</i></div>'
      + '<div><span>Multiplier</span><b class="num">' + m.toFixed(1) + '&times;</b><i>' + (m > 1 ? 'from ' + TOKEN : 'no ' + TOKEN + ' yet') + '</i></div>'
      + '</section>';

    const grid = beings.map(b => {
      const t = tierOf(b.tier);
      const src = safeUrl(b.image);
      const link = b.id ? 'https://solscan.io/token/' + esc(b.id) : '#';
      return '<a class="w-being" style="--c:' + t.color + '" href="' + link + '" target="_blank" rel="noopener">'
        + '<div class="w-pic">' + (src ? '<img src="' + esc(src) + '" alt="' + esc(b.name) + '" loading="lazy">' : '')
          + '<div class="ph"' + (src ? ' hidden' : '') + '>#' + esc(b.n || "") + '</div>'
          + '<span class="w-tag">' + esc(t.name) + '</span></div>'
        + '<div class="w-cap"><b>' + esc(b.name) + '</b><i>' + esc(b.being || "")
          + (RANK[b.n] ? ' &middot; Rank #' + fmt(RANK[b.n]) : '') + '</i>'
          + '<em class="num">' + t.weight + (t.weight === 1 ? ' pt' : ' pts') + ' &middot; &asymp; ' + sol(t.weight * PT) + ' SOL</em></div>'
        + '</a>';
    }).join("");

    const counts = {};
    beings.forEach(b => counts[b.tier] = (counts[b.tier] || 0) + 1);
    const tierRows = TIERS.slice().reverse().filter(t => counts[t.name]).map(t =>
      '<div class="w-tier" style="--c:' + t.color + '"><span>' + t.name + '<i>&times;' + counts[t.name] + '</i></span>'
      + '<b class="num">' + fmt(t.weight * counts[t.name]) + ' pts</b>'
      + '<em class="num">&asymp; ' + sol(even(t.weight * counts[t.name])) + ' SOL</em></div>').join("")
      + '<div class="w-tier total"><span>Total</span><b class="num">' + fmt(w) + ' pts</b><em class="num">&asymp; ' + sol(base) + ' SOL</em></div>';

    const cur = bandOf(tokens);
    const bands = TOKEN_BANDS.map((b, i) =>
      '<div class="w-band' + (i === cur ? ' on' : '') + '"><span>' + (b.hold ? kfmt(b.hold) + '+ ' : 'No ') + TOKEN + '</span>'
      + '<b>' + b.mult.toFixed(1) + '&times;</b>'
      + '<em class="num">' + (i === 0 ? sol(base) : 'up to ' + sol(most(w, b.mult))) + ' SOL</em></div>').join("");

    const minted = (stats && stats.minted) || d.minted || 0;
    const raised = stats && stats.rewards && stats.rewards.sol != null ? stats.rewards.sol : null;
    const pool = '<section class="h-card"><h2>The holder pool</h2>'
      + '<div class="w-pool">'
        + '<div><span>Minted</span><b class="num">' + fmt(minted) + ' / ' + fmt(TOTAL_BEINGS) + '</b></div>'
        + '<div><span>In the pool now</span><b class="num">' + (raised != null ? sol(raised, 2) + ' SOL' : '&mdash;') + '</b></div>'
        + '<div><span>At mint-out</span><b class="num">' + sol(POOL, 2) + ' SOL</b></div>'
      + '</div>'
      + '<div class="w-bar"><i style="width:' + (100 * minted / TOTAL_BEINGS).toFixed(2) + '%"></i></div>'
      + '<p class="h-note">Paid once, from a snapshot of every wallet, when #' + fmt(TOTAL_BEINGS) + ' is minted. Nothing to claim: hold your beings and it comes to you. '
      + '<a href="https://solscan.io/account/' + CONFIG.rewardsWallet + '" target="_blank" rel="noopener">Rewards wallet on Solscan &nearr;</a></p></section>';

    return head + payCard(pay) + (pay && pay.snapshot ? "" : hero) + statsRow
      + '<section class="h-card"><h2>Beings</h2><div class="w-grid">' + grid + '</div>'
        + '<p class="w-fine">Tap a being to see it on Solscan.</p></section>'
      + '<section class="h-card"><h2>By tier</h2><div class="w-tiers">' + tierRows + '</div>'
        + '<p class="w-fine">1 weight point &asymp; ' + PT.toFixed(4) + ' SOL at mint-out (' + sol(POOL, 2) + ' SOL &divide; ' + fmt(W) + ' points), before ' + TOKEN + '.</p></section>'
      + '<section class="h-card"><h2>With ' + TOKEN + '</h2>'
        + '<p class="h-note">' + TOKEN + ' multiplies every being in the wallet. What this holding could receive at each band:</p>'
        + '<div class="w-bands">' + bands + '</div>'
        + (stats && stats.token ? '<div class="w-share" style="margin-top:12px"><a class="w-btn" href="https://pump.fun/coin/' + esc(stats.token) + '" target="_blank" rel="noopener">Buy ' + TOKEN + ' on pump.fun</a></div>' : '')
        + '<p class="w-fine">"Up to" is the most it could reach, if no other holder had ' + TOKEN + '. The more others hold, the closer it comes back to the first row.</p></section>'
      + pool
      + '<section class="h-card"><h2>Share</h2><div class="w-share">'
        + '<button type="button" class="w-btn" data-link>Copy link to this page</button>'
        + '<a class="w-btn ghost" data-x target="_blank" rel="noopener">Post on X</a></div></section>'
      + '<p class="w-fine">Read live from Solana; updates within a minute of a mint or a sale. Figures assume the collection sells out. Not financial advice.</p>';
  }

  function wire(a, d) {
    out.querySelectorAll(".w-pic img").forEach(img => img.addEventListener("error", () => {
      img.remove(); const ph = img.parentNode && img.parentNode.querySelector(".ph"); if (ph) ph.hidden = false;
    }));
    const copy = (txt, btn, done) => {
      const ok = () => { const t = btn.textContent; btn.textContent = done; setTimeout(() => btn.textContent = t, 1600); };
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(ok, () => prompt("Copy this:", txt));
    };
    const c = out.querySelector("[data-copy]"); if (c) c.addEventListener("click", () => copy(a, c, "Copied ✓"));
    const url = location.origin + "/wallet?a=" + a;
    const l = out.querySelector("[data-link]"); if (l) l.addEventListener("click", () => copy(url, l, "Link copied ✓"));
    const x = out.querySelector("[data-x]");
    if (x) {
      const beings = d.beings || [];
      const w = beings.reduce((s, b) => s + tierOf(b.tier).weight, 0);
      const txt = "My REALM wallet: " + beings.length + " being" + (beings.length === 1 ? "" : "s") + ", " + w + " weight points 🍄\n\n" + url;
      x.href = "https://x.com/intent/post?text=" + encodeURIComponent(txt);
    }
  }
})();
