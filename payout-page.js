/* ============================================================
   REALM — the payout page.  /payout

   Before mint-out: what will happen, and how far the mint has got.
   After: the snapshot (time, slot, hash, a download), when the payout
   runs, and every holder's share with whether it has been paid. All of
   it from /api/payout, which reads the payout record off the chain.
   ============================================================ */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const out = $("[data-out]");
  const fmt = n => Number(n).toLocaleString();
  const sol = x => x < 1 ? x.toFixed(4) : x.toFixed(3);
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = iso => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function left(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (ms <= 0) return "any moment now";
    const h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
    return (h ? h + "h " : "") + m + "m to go";
  }

  async function load() {
    let d;
    try { d = await (await fetch("/api/payout")).json(); }
    catch { out.innerHTML = '<section class="h-card"><p class="h-bad">Could not read the payout just now. Refresh to try again.</p></section>'; return; }

    if (!d.snapshot) {
      const i = d.info || {};
      out.innerHTML = '<section class="w-hero"><span>The snapshot</span>'
        + '<b class="num">' + (i.minted != null ? fmt(i.minted) : '&mdash;') + '<small>/ ' + fmt(TOTAL_BEINGS) + '</small></b>'
        + '<p>is taken automatically the moment #' + fmt(TOTAL_BEINGS) + ' is minted. Every holder, every being and every '
        + TOKEN_NAME + ' balance is read off the chain at that moment.</p></section>'
        + '<section class="h-card"><h2>Then</h2>'
        + '<p class="h-note">The snapshot is published here and in Telegram with its fingerprint (a hash), so anyone can check it never changed. '
        + '24 hours later every holder is paid their share of the pool straight to their wallet: nothing to claim. '
        + 'Each payment carries a note naming the snapshot, so the whole payout can be checked on Solscan.</p>'
        + '<div class="w-share"><a class="w-btn" href="/wallet">Check what a wallet gets</a><a class="w-btn ghost" href="/mint">Mint</a></div></section>';
      return;
    }

    const s = d.snapshot, rows = d.rows || [];
    const paidN = rows.filter(r => r.paid).length, payable = rows.filter(r => r.payable).length;
    const stage = d.stage === "paid" ? "Every holder has been paid"
      : d.paidBatches ? "Paying now: " + d.paidBatches + " of " + d.batches + " batches sent"
      : d.dueAt && Date.parse(d.dueAt) > Date.now() ? "Payout " + when(d.dueAt) + " · " + left(d.dueAt)
      : /funded/.test(d.stage) ? "Payout due: waiting for the pool to arrive in the payout wallet"
      : d.stage === "on hold" ? "Payout on hold" : "Payout due";

    out.innerHTML = '<section class="w-hero"><span>Holder pool</span>'
      + '<b class="num">' + sol(d.pool) + '<small>SOL</small></b>'
      + '<p>' + esc(stage) + '</p>'
      + '<p><i>' + fmt(s.holders) + ' holders &middot; ' + fmt(s.minted) + ' beings &middot; ' + fmt(s.totalPoints) + ' points'
      + (d.poolFinal ? '' : ' &middot; shares shown at the full pool; final once paying starts') + '</i></p></section>'

      + '<section class="h-card"><h2>The snapshot</h2><div class="w-tiers">'
        + '<div class="w-kv"><span>Taken</span><b>' + esc(when(s.takenAt)) + '</b></div>'
        + '<div class="w-kv"><span>Solana slot</span><b class="num">' + fmt(s.slot) + '</b></div>'
        + '<div class="w-kv"><span>Paid so far</span><b class="num">' + fmt(paidN) + ' of ' + fmt(payable) + ' holders</b></div>'
      + '</div>'
      + '<p class="w-fine" style="word-break:break-all">Fingerprint (SHA-256): ' + esc(s.hash) + '</p>'
      + '<div class="w-share"><a class="w-btn ghost" href="/api/snapshot" target="_blank" rel="noopener">Download the snapshot</a>'
      + (d.payoutWallet ? '<a class="w-btn ghost" href="https://solscan.io/account/' + esc(d.payoutWallet) + '" target="_blank" rel="noopener">Payout wallet on Solscan</a>' : '')
      + '</div></section>'

      + '<section class="h-card"><h2>Find a wallet</h2><form class="h-find" data-find>'
        + '<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste a Solana address" aria-label="Solana address">'
        + '<button type="submit" class="h-go">Find</button></form><div data-hit></div></section>'

      + '<section class="h-card"><h2>Every holder</h2><div class="h-table"><table><thead><tr>'
        + '<th>#</th><th>Wallet</th><th>Beings</th><th>Points</th><th>Share</th><th></th></tr></thead><tbody>'
        + rows.map((r, i) => '<tr><td class="num">' + (i + 1) + '</td>'
          + '<td><a href="/wallet?a=' + esc(r.owner) + '">' + esc(short(r.owner)) + '</a></td>'
          + '<td class="num">' + fmt(r.beings) + '</td>'
          + '<td class="num">' + fmt(r.points) + (r.mult > 1 ? ' <i style="color:var(--gold);font-style:normal">' + r.mult + '&times;</i>' : '') + '</td>'
          + '<td class="num">' + sol(r.sol) + '</td>'
          + '<td>' + (r.paid ? '<b style="color:#7ce8be">Paid</b>' : !r.payable ? '<span title="A program account, such as a marketplace listing: paid by hand" style="color:#ff8a7a">Held</span>' : '<span style="color:var(--dim)">Due</span>') + '</td></tr>').join("")
        + '</tbody></table></div>'
        + '<p class="w-fine">"Held" is a holder the payout cannot send to safely, such as a being listed in a marketplace escrow: that share is kept back and settled by hand.</p></section>';

    $("[data-find]").addEventListener("submit", e => {
      e.preventDefault();
      const a = e.target.querySelector("input").value.trim();
      const r = rows.find(x => x.owner === a);
      $("[data-hit]").innerHTML = !r ? '<p class="h-note">That wallet held no beings at the snapshot.</p>'
        : '<p class="h-note"><b style="color:var(--bone)">' + esc(short(a)) + '</b>: ' + fmt(r.beings) + ' beings, ' + fmt(r.points) + ' points, '
          + '<b style="color:var(--gold)">' + sol(r.sol) + ' SOL</b> &middot; ' + (r.paid ? 'paid' : r.payable ? 'due' : 'held, settled by hand') + '</p>';
    });
  }
  load();
  setInterval(() => { if (!document.hidden && !document.activeElement.matches("input")) load(); }, 60_000);
})();
