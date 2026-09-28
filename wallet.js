/* ============================================================
   REALM — connecting a wallet.

   Read only. This site never asks anyone to sign a transaction or
   approve spending, and it never will — the mint happens on the
   launchpad, not here. Connecting shows an address and, once the
   collection exists, what that address holds.

   Wallets are found through the Wallet Standard rather than by
   reaching for window.phantom or window.solana. That is how every
   Solana wallet announces itself now — Phantom, Solflare, Backpack,
   and MetaMask when its Solana support is present — so one piece of
   code finds all of them and there is no list to keep up to date.
   ============================================================ */

(() => {
  "use strict";

  const bar = document.querySelector(".topbar");
  if (!bar) return;

  const short = a => a.slice(0, 4) + "…" + a.slice(-4);

  /* ---------- finding what is installed ----------
     A wallet either fires register-wallet when it loads, or is already
     waiting when we announce ourselves. Both have to be handled or the
     one that loaded first is missed. */
  const wallets = [];
  const seen = new Set();

  function take(list) {
    for (const w of list) {
      if (!w || seen.has(w.name)) continue;
      const f = w.features || {};
      if (!f["standard:connect"]) continue;          // cannot be connected to
      const chains = w.chains || [];
      if (chains.length && !chains.some(c => String(c).startsWith("solana:"))) continue;
      seen.add(w.name);
      wallets.push(w);
    }
    return () => {};
  }

  const api = { register: (...ws) => take(ws) };
  window.addEventListener("wallet-standard:register-wallet", e => {
    try { e.detail(api); } catch (err) { /* a wallet that will not play */ }
  });
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));

  /* ---------- the control in the bar ----------
     It stays away until there is something for it to show.

     Connecting is not how anybody gets paid — the pool is worked out from a
     snapshot of the chain and sent out, so a holder who never opens this
     site again still receives theirs. Until the collection exists this
     button can only report that it has nothing to report, and a crypto site
     asking for a wallet connection it does not need is a small tax on
     trust for no return. */
  const liveCollection = (typeof CONFIG !== "undefined"
                          && CONFIG.collectionAddress) || "";
  if (!liveCollection) return;

  const btn = document.createElement("button");
  btn.className = "wal";
  btn.type = "button";
  btn.textContent = "Connect";
  bar.appendChild(btn);

  const sheet = document.createElement("div");
  sheet.className = "wal-sheet";
  sheet.hidden = true;
  document.body.appendChild(sheet);

  let account = null, active = null;

  const g_ = (name, fallback) => {
    try { return eval(name); } catch (e) { return fallback; }
  };

  function open() {
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("here"));
  }
  function close() {
    sheet.classList.remove("here");
    setTimeout(() => { sheet.hidden = true; }, 200);
  }

  function row(label, sub, onClick, icon) {
    const b = document.createElement("button");
    b.className = "wal-row";
    b.type = "button";
    if (icon) {
      const im = document.createElement("img");
      im.src = icon; im.alt = ""; im.width = 22; im.height = 22;
      b.appendChild(im);
    }
    const t = document.createElement("span");
    t.innerHTML = `<b>${label}</b>${sub ? `<i>${sub}</i>` : ""}`;
    b.appendChild(t);
    if (onClick) b.addEventListener("click", onClick);
    else b.disabled = true;
    return b;
  }

  function note(text) {
    const p = document.createElement("p");
    p.className = "wal-note";
    p.textContent = text;
    return p;
  }

  /* ---------- choosing one ---------- */
  function chooser() {
    sheet.innerHTML = "";
    const h = document.createElement("h3");
    h.textContent = "Connect a wallet";
    sheet.appendChild(h);
    sheet.appendChild(note(
      "REALM never asks you to sign a transaction or approve spending. "
      + "Connecting only shows your address."));

    if (!wallets.length) {
      sheet.appendChild(row("No wallet found", "on this browser", null));
      sheet.appendChild(note(
        "On a phone, open dmt-realm.dev inside your wallet's own browser. "
        + "On a computer, install Phantom, Solflare, Backpack or MetaMask and reload."));
    } else {
      for (const w of wallets) {
        sheet.appendChild(row(w.name, "", () => connect(w), w.icon));
      }
    }

    const x = document.createElement("button");
    x.className = "wal-close";
    x.type = "button";
    x.textContent = "Close";
    x.addEventListener("click", close);
    sheet.appendChild(x);
    open();
  }

  /* ---------- connected ---------- */
  function connected() {
    sheet.innerHTML = "";
    const h = document.createElement("h3");
    h.textContent = short(account);
    sheet.appendChild(h);
    sheet.appendChild(note(active ? "Connected with " + active.name : "Connected"));

    const cfg = g_("CONFIG", {});
    const box = document.createElement("div");
    box.className = "wal-hold";
    box.innerHTML = "<b>Reading your beings…</b>"
      + "<i>Your beings and the weight they carry. This is for looking at — "
      + "rewards are sent from a snapshot of the chain, so you do not need to "
      + "connect here to receive anything.</i>";
    sheet.appendChild(box);

    const d = document.createElement("button");
    d.className = "wal-close";
    d.type = "button";
    d.textContent = "Disconnect";
    d.addEventListener("click", () => { disconnect(); close(); });
    sheet.appendChild(d);

    const x = document.createElement("button");
    x.className = "wal-close ghost";
    x.type = "button";
    x.textContent = "Close";
    x.addEventListener("click", close);
    sheet.appendChild(x);
    open();
  }

  async function connect(w) {
    try {
      btn.textContent = "…";
      const res = await w.features["standard:connect"].connect();
      const acc = (res && res.accounts && res.accounts[0]) || null;
      if (!acc) throw new Error("no account");
      account = acc.address;
      active = w;
      btn.textContent = short(account);
      btn.classList.add("on");
      connected();

      // follow the wallet if the person switches account or signs out
      const ev = w.features["standard:events"];
      if (ev && ev.on) {
        ev.on("change", props => {
          if (!props || !props.accounts) return;
          if (!props.accounts.length) { disconnect(); return; }
          account = props.accounts[0].address;
          btn.textContent = short(account);
        });
      }
    } catch (err) {
      btn.textContent = account ? short(account) : "Connect";
      sheet.innerHTML = "";
      const h = document.createElement("h3");
      h.textContent = "Not connected";
      sheet.appendChild(h);
      sheet.appendChild(note(
        "The wallet turned the request down, or the window was closed. "
        + "Nothing was sent and nothing was signed."));
      const x = document.createElement("button");
      x.className = "wal-close"; x.type = "button"; x.textContent = "Close";
      x.addEventListener("click", close);
      sheet.appendChild(x);
      open();
    }
  }

  function disconnect() {
    try {
      const f = active && active.features["standard:disconnect"];
      if (f && f.disconnect) f.disconnect();
    } catch (err) { /* some wallets have no way to be told */ }
    account = null; active = null;
    btn.textContent = "Connect";
    btn.classList.remove("on");
  }

  btn.addEventListener("click", () => {
    if (!sheet.hidden) { close(); return; }
    account ? connected() : chooser();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !sheet.hidden) close();
  });

  window.RealmWallet = {
    get address() { return account; },
    get wallets() { return wallets.map(w => w.name); },
    disconnect
  };
})();
