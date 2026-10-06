/* dmt-realm.dev/mint: the page around mint-chain.js (window.RealmMint). */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const test = new URLSearchParams(location.search).get("net") === "devnet";
  const C = (CONFIG.chain || {});
  const machine = test ? C.test && C.test.machine : C.machine;
  const rpc = location.origin + "/api/rpc" + (test ? "?net=devnet" : "");
  const cluster = test ? "?cluster=devnet" : "";
  const fmt = n => n.toLocaleString();
  if (test && window.__TEST_KEY) window.phantom = { solana: window.RealmMint.testWallet(window.__TEST_KEY) };
  const short = a => a.slice(0, 4) + "…" + a.slice(-4);
  const err = m => { const e = $("[data-err]"); e.textContent = m; e.hidden = !m; };
  $("[data-test]").hidden = !test;
  const tk = $("[data-ticker]"); if (tk) tk.textContent = typeof TOKEN_NAME !== "undefined" ? TOKEN_NAME : "";
  if (CONFIG.rewardsWallet) $("[data-rw]").href = "https://solscan.io/account/" + CONFIG.rewardsWallet + cluster;

  // the beings, cycling, quiet to loud
  const tiers = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "entity", "god"];
  let ci = 0; const cyc = $("[data-cycle]");
  const spin = () => { cyc.src = "preview/" + tiers[ci++ % tiers.length] + ".png"; };
  spin(); setInterval(spin, 900);

  let S = null, me = null, mine = 0, qty = 1, busy = false;
  const state = h => { $("[data-state]").innerHTML = h; };

  function paint() {
    if (!S) return;
    const left = S.total - S.minted;
    $("[data-minted]").textContent = fmt(S.minted);
    $("[data-total]").textContent = fmt(S.total);
    $("[data-left]").textContent = left ? fmt(left) + " remain" : "the realm is full";
    $("[data-bar]").style.width = (100 * S.minted / S.total) + "%";
    const open = !S.start || Date.now() >= S.start;
    if (!left) { state("<b>The realm is full.</b> Every being has crossed."); $("[data-act]").hidden = true; $("[data-connect]").hidden = true; return; }
    if (!open) {
      const s = Math.max(0, Math.floor((S.start - Date.now()) / 1000));
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
      state("The gate opens in <b>" + (d ? d + "d " : "") + h + "h " + m + "m " + x + "s</b>");
    }
    if (!me) {
      if (window.RealmMint.hasWallet()) { $("[data-connect]").hidden = false; if (open) state("Connect your Solana wallet to mint."); }
      else {
        // on a phone the wallet lives in its own app: open this page inside it
        const a = $("[data-phantom]");
        a.href = "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin);
        a.hidden = false;
        if (open) state("Open this page in your wallet app to mint.");
      }
      return;
    }
    $("[data-connect]").hidden = true;
    const can = Math.min(left, (S.perWallet || 5) - mine);
    qty = Math.max(1, Math.min(qty, Math.max(1, can)));
    $("[data-act]").hidden = false;
    $("[data-qty]").textContent = qty;
    $("[data-step='-1']").disabled = busy || qty <= 1;
    $("[data-step='1']").disabled = busy || qty >= can;
    const go = $("[data-go]");
    go.disabled = busy || !open || can <= 0;
    go.textContent = can <= 0 ? "Wallet limit reached" : "Mint " + qty + " · " + (qty * S.price).toFixed(2).replace(/\.?0+$/, "") + " SOL";
    $("[data-mine]").textContent = "This wallet has minted " + mine + " of " + (S.perWallet || 5) + ".";
    if (open && !busy) state("Ready.");
  }

  async function refresh() {
    try { S = await window.RealmMint.read(); if (me) mine = await window.RealmMint.mintedBy(me); paint(); } catch (e) { /* try again next tick */ }
  }

  document.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => { qty += Number(b.dataset.step); paint(); }));

  $("[data-connect]").addEventListener("click", async () => {
    err("");
    try {
      me = await window.RealmMint.connect();
      $("[data-who]").innerHTML = "Connected <b>" + short(me) + "</b>";
      mine = await window.RealmMint.mintedBy(me);
      paint();
    } catch (e) { err("The wallet did not connect. Try again."); }
  });

  $("[data-go]").addEventListener("click", async () => {
    err("");
    busy = true; paint();
    try {
      const bal = await window.RealmMint.balance(me);
      if (bal < qty * S.price + 0.01 * qty) { busy = false; paint(); return err("Not enough SOL: " + (qty * S.price).toFixed(2) + " SOL plus a little for fees is needed."); }
      state("Approve in your wallet&hellip;");
      const out = await window.RealmMint.mint(qty, step => { if (step === "send") state("Crossing&hellip; this takes a few seconds."); });
      const grid = $("[data-grid]");
      out.forEach(r => {
        const el = document.createElement(r.ok ? "a" : "div");
        if (r.ok) {
          el.href = "https://solscan.io/token/" + r.asset + cluster; el.target = "_blank"; el.rel = "noopener";
          el.innerHTML = (r.image ? '<img alt="" src="' + r.image + '">' : "") + "<span>" + r.name + "</span>";
        } else { el.className = "bad"; el.textContent = r.taxed ? "Blocked: wallet limit or gate closed." : "Did not go through. Nothing was taken but the fee."; }
        grid.prepend(el);
      });
      $("[data-got]").hidden = false;
      const okN = out.filter(r => r.ok).length;
      state(okN ? "<b>" + okN + " being" + (okN > 1 ? "s" : "") + " crossed.</b>" : "Nothing crossed.");
    } catch (e) {
      const m = (e && e.message) || "";
      err(/reject|cancel|denied/i.test(m) ? "Cancelled in the wallet." : "Something went wrong: " + m.slice(0, 120));
    }
    busy = false;
    await refresh();
  });

  if (!machine) {
    state("The gate has not opened yet. When it does, this is the only place to mint.");
    $("[data-minted]").textContent = "0";
    return;
  }
  window.RealmMint.init({ rpc, machine }).then(s => { S = s; paint(); setInterval(refresh, 10000); setInterval(paint, 1000); })
    .catch(() => state("Could not reach the realm. Refresh to try again."));
})();
