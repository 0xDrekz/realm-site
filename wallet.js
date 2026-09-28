/* ============================================================
   REALM — the wallet checker.

   Nobody is asked to connect anything. You paste an address and it says
   what that address holds: which beings, what they weigh, what $DMT sits
   with them, and what that comes to.

   Why this rather than a connect button. Connecting is a permission
   prompt for something the site does not need — rewards are paid from a
   snapshot of the chain, so a holder who never opens this page still
   gets theirs. A checker costs the visitor nothing, works on a phone
   with no wallet extension installed, and lets anybody check anybody.
   That last part is the point: a mechanism that claims to be checkable
   should be checkable by people who have not bought in.

   The chain is read by the server, because reading it needs an RPC key,
   and a key in this file is a key handed to every visitor.
   ============================================================ */

(() => {
  "use strict";

  const bar = document.querySelector(".top-links");
  if (!bar) return;

  const TIERS_ = typeof TIERS        !== "undefined" ? TIERS        : [];
  const BANDS  = typeof TOKEN_BANDS  !== "undefined" ? TOKEN_BANDS  : [{ hold: 0, mult: 1 }];
  const TOKEN  = typeof TOKEN_NAME   !== "undefined" ? TOKEN_NAME   : "$DMT";
  const WEIGHT = typeof TOTAL_WEIGHT !== "undefined" ? TOTAL_WEIGHT : 0;
  const POOL   = typeof POOL_FULL    !== "undefined" ? POOL_FULL    : 0;

  const tierOf  = name => TIERS_.find(t => t.name === name || t.key === name);
  const multFor = bal => BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);

  /* base58 has no 0, O, I or l, and a Solana address is 32 bytes, which
     lands between 32 and 44 characters. Checked here so an obvious typo
     costs nobody a round trip, and again on the server, which is the
     side that matters. */
  const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  /* ---------- the control in the bar ---------- */
  const btn = document.createElement("button");
  btn.className = "wal";
  btn.type = "button";
  btn.textContent = "Check";
  btn.setAttribute("aria-label", "Check what a wallet holds");
  bar.appendChild(btn);

  const sheet = document.createElement("div");
  sheet.className = "wal-sheet";
  sheet.hidden = true;
  document.body.appendChild(sheet);

  let open = false;
  function close() {
    open = false;
    sheet.classList.remove("here");
    setTimeout(() => { if (!open) sheet.hidden = true; }, 180);
  }

  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (open) return close();
    build();
    sheet.hidden = false;
    open = true;
    requestAnimationFrame(() => sheet.classList.add("here"));
    const f = sheet.querySelector("input");
    if (f) f.focus();
  });

  document.addEventListener("click", e => {
    if (open && !sheet.contains(e.target) && e.target !== btn) close();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && open) close(); });

  /* ---------- the sheet ---------- */
  function build() {
    if (sheet.dataset.built) return;
    sheet.dataset.built = "1";

    sheet.innerHTML =
      '<h3>Check a wallet</h3>' +
      '<p class="wal-note">Paste any Solana address. Nothing is connected and nothing ' +
      'is signed, and it does not have to be yours. Rewards are paid from a snapshot ' +
      'of the chain, so nobody needs to come here to receive them.</p>' +
      '<div class="wal-find">' +
        '<input type="text" inputmode="text" autocomplete="off" autocapitalize="off" ' +
               'spellcheck="false" placeholder="Solana address" aria-label="Solana address">' +
        '<button type="button" class="wal-go">Check</button>' +
      '</div>' +
      '<div class="wal-out" aria-live="polite"></div>';

    const input = sheet.querySelector("input");
    const go    = sheet.querySelector(".wal-go");
    const out   = sheet.querySelector(".wal-out");
    const say   = html => { out.innerHTML = html; };

    async function check() {
      const address = input.value.trim();
      if (!ADDRESS.test(address)) {
        say('<p class="wal-bad">That does not look like a Solana address.</p>');
        return;
      }
      go.disabled = true;
      say('<p class="wal-wait">Reading the chain…</p>');
      try {
        const r = await fetch("/api/holdings?address=" + encodeURIComponent(address));
        const d = await r.json();
        if (r.status === 503 || d.ready === false) {
          say('<p class="wal-wait">Nothing has been minted yet, so there is nothing to ' +
              'read. This works the moment the collection exists.</p>');
        } else if (!r.ok) {
          say('<p class="wal-bad">' + (d.error || "Could not read the chain just now.")
              + '</p>');
        } else {
          say(render(d));
        }
      } catch {
        say('<p class="wal-bad">Could not reach the chain. Try again in a moment.</p>');
      }
      go.disabled = false;
    }

    go.addEventListener("click", check);
    input.addEventListener("keydown", e => { if (e.key === "Enter") check(); });
  }

  /* ---------- what it found ----------
     Two figures, the same two the Rewards chart gives. A holder reading
     one number here and two there would rightly wonder which is real. */
  function render(d) {
    const beings = d.beings || [];
    const tokens = d.tokens || 0;

    if (!beings.length) {
      return '<p class="wal-none">No beings at this address.</p>'
        + (tokens
            ? '<p class="wal-note">It holds ' + tokens.toLocaleString() + ' ' + TOKEN
              + ', which on its own earns nothing — the token multiplies beings, '
              + 'and there are none here to multiply.</p>'
            : "");
    }

    const w    = beings.reduce((a, b) => a + ((tierOf(b.tier) || {}).weight || 0), 0);
    const mult = multFor(tokens);
    const even = WEIGHT ? POOL * w / WEIGHT : 0;
    const mine = w * mult;
    const best = WEIGHT ? POOL * mine / (WEIGHT - w + mine) : 0;

    const counts = {};
    beings.forEach(b => counts[b.tier] = (counts[b.tier] || 0) + 1);

    const order = TIERS_.map(t => t.name);
    const list = Object.entries(counts)
      .sort((a, b) => order.indexOf(b[0]) - order.indexOf(a[0]))
      .map(([tier, n]) => {
        const t = tierOf(tier) || {};
        return '<div class="wal-hold-row" style="--c:' + (t.color || "#9d8fc4") + '">'
             + '<span>' + tier + (n > 1 ? ' <i>×' + n + '</i>' : "") + '</span>'
             + '<b>' + ((t.weight || 0) * n) + '</b></div>';
      }).join("");

    return '<div class="wal-holds">' + list + '</div>'
      + '<div class="wal-sum">'
        + '<div><span>Weight</span><b>' + w + '</b></div>'
        + '<div><span>' + TOKEN + '</span><b>' + tokens.toLocaleString() + '</b></div>'
        + '<div><span>Multiplier</span><b>' + mult.toFixed(1) + '×</b></div>'
      + '</div>'
      + '<div class="wal-pay">'
        + '<div><span>Even field</span><b>' + even.toFixed(3) + ' SOL</b></div>'
        + '<div><span>At ' + mult.toFixed(1) + '×</span><b>'
          + best.toFixed(3) + ' SOL</b></div>'
      + '</div>'
      + '<p class="wal-note">Even field is what this weight earns if everybody carries '
      + 'the same multiplier — they cancel, so it is the same at every band. The '
      + 'second is this wallet at ' + mult.toFixed(1) + '× with nobody else '
      + 'multiplied at all, which is a ceiling and falls as others buy in. What it '
      + 'actually gets sits between them, and both assume the drop fills.</p>';
  }
})();
