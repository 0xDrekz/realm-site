/* ============================================================
   REALM — the 5-mint bonus.

   The first BONUS_WALLETS wallets (10 unless set) to mint BONUS_MINTS
   beings (5 unless set) on dmt-realm.dev are each sent BONUS_AMOUNT $DMT
   (250,000 unless set) from the bonus wallet, so their $DMT multiplier
   starts at the 1.5x band. "First" means whose 5th mint landed first.

   Mints are read off the candy machine itself: every successful mint
   transaction there, its fee payer (the minter) and the asset it signed
   for, counted only if that asset now exists as a Core asset. A mint the
   bot tax refused creates no asset, so it does not count. Wallets that
   minted 5 before this was switched on count too, in the order they did.

   Each bonus is its own transaction with the memo
     REALM 5-mint bonus <wallet>
   and those memos on the bonus wallet are the record: on a restart the
   server reads them back, so no wallet is paid twice and the count of
   wallets paid can never pass the limit, with no file to lose.

   The bonus wallet is its own wallet holding only the bonus $DMT and a
   little SOL for fees and new token accounts (about 0.0025 SOL each).
   Its key is a Railway variable set nowhere else.

   Railway variables:
     BONUS_KEY       the bonus wallet's secret key (base58, or [n,n,...]); without it nothing is sent
     BONUS_AMOUNT    $DMT per wallet (default 250000)
     BONUS_WALLETS   how many wallets in all (default 10)
     BONUS_MINTS     mints needed (default 5)
     BONUS_EXCLUDE   wallets never paid, comma separated (the team's own)
     BONUS_HOLD      set to 1 to pause sending
   ============================================================ */
"use strict";
const crypto = require("crypto");
const { loadKey, b58enc, b58dec } = require("./payout");

const SYSTEM = "11111111111111111111111111111111";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const BUDGET = "ComputeBudget111111111111111111111111111111";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
const TAG = "REALM 5-mint bonus ";

/* ---------- is a 32-byte key a point on ed25519? (a PDA must not be) ---------- */
const P = 2n ** 255n - 19n;
const D = (-121665n * inv(121666n)) % P;
function pw(b, e) { let r = 1n; b %= P; while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; }
function inv(x) { return pw((x % P + P) % P, P - 2n); }
function onCurve(bytes) {
  const b = Buffer.from(bytes); const y = BigInt("0x" + Buffer.from(b).reverse().toString("hex")) & ((1n << 255n) - 1n);
  if (y >= P) return false;
  const y2 = y * y % P, u = (y2 - 1n + P) % P, v = (D * y2 + 1n) % P;
  const x2 = u * inv(v) % P;
  if (x2 === 0n) return true;
  return pw(x2, (P - 1n) / 2n) === 1n;          // a square: a real x exists
}
function findPda(seeds, program) {
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash("sha256").update(Buffer.concat([...seeds, Buffer.from([bump]), b58dec(program), Buffer.from("ProgramDerivedAddress")])).digest();
    if (!onCurve(h)) return b58enc(h);
  }
  throw new Error("no PDA");
}
const ataOf = (owner, mint) => findPda([b58dec(owner), b58dec(TOKEN_2022), b58dec(mint)], ATA_PROGRAM);

/* ---------- a legacy transaction from instructions, accounts ordered as Solana wants ---------- */
function shortvec(n) { const out = []; do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); }
function compile(signer, blockhash, ixs) {
  const meta = new Map(); const add = (k, s, w) => { const m = meta.get(k) || { s: false, w: false }; m.s = m.s || s; m.w = m.w || w; meta.set(k, m); };
  add(signer.address, true, true);
  for (const ix of ixs) { ix.keys.forEach(a => add(a.k, a.s, a.w)); add(ix.p, false, false); }
  const all = [...meta.entries()];
  const grp = (s, w) => all.filter(([, m]) => m.s === s && m.w === w).map(([k]) => k);
  const keys = [signer.address, ...grp(true, true).filter(k => k !== signer.address), ...grp(true, false), ...grp(false, true), ...grp(false, false)];
  if (grp(true, true).length + grp(true, false).length !== 1) throw new Error("only the bonus wallet may sign");
  const at = k => keys.indexOf(k);
  const msg = Buffer.concat([
    Buffer.from([1, 0, grp(false, false).length]),
    shortvec(keys.length), ...keys.map(k => b58dec(k)),
    b58dec(blockhash),
    shortvec(ixs.length),
    ...ixs.map(i => Buffer.concat([Buffer.from([at(i.p)]), shortvec(i.keys.length), Buffer.from(i.keys.map(a => at(a.k))), shortvec(i.d.length), i.d]))
  ]);
  const sig = signer.key ? crypto.sign(null, msg, signer.key) : Buffer.alloc(64);
  return { tx: Buffer.concat([shortvec(1), sig, msg]).toString("base64"), sig: b58enc(sig) };
}
function bonusIxs(from, to, mint, raw, decimals) {
  const src = ataOf(from, mint), dst = ataOf(to, mint);
  const amt = Buffer.alloc(8); amt.writeBigUInt64LE(BigInt(raw));
  const price = Buffer.alloc(9); price[0] = 3; price.writeBigUInt64LE(20_000n, 1);
  return [
    { p: BUDGET, keys: [], d: price },
    // the recipient's $DMT account, opened if it is not there yet (no-op if it is)
    { p: ATA_PROGRAM, keys: [{ k: from, s: true, w: true }, { k: dst, s: false, w: true }, { k: to, s: false, w: false },
      { k: mint, s: false, w: false }, { k: SYSTEM, s: false, w: false }, { k: TOKEN_2022, s: false, w: false }], d: Buffer.from([1]) },
    { p: TOKEN_2022, keys: [{ k: src, s: false, w: true }, { k: mint, s: false, w: false }, { k: dst, s: false, w: true }, { k: from, s: true, w: false }],
      d: Buffer.concat([Buffer.from([12]), amt, Buffer.from([decimals])]) },
    { p: MEMO, keys: [], d: Buffer.from(TAG + to, "utf8") }
  ];
}

/* ---------- the module ---------- */
function create(opt) {
  const { rpc, envVar, machine, mint, log = console.log, notify = async () => {} } = opt;
  const num = (k, d) => { const v = Number(envVar(k)); return v > 0 ? v : d; };
  const AMOUNT = num("BONUS_AMOUNT", 250_000), WALLETS = num("BONUS_WALLETS", 10), NEED = num("BONUS_MINTS", 5);
  const exclude = new Set([...(opt.exclude || []), ...String(envVar("BONUS_EXCLUDE") || "").split(",").map(s => s.trim()).filter(Boolean)]);
  let signer = null, keyProblem = "", busy = false, last = { stage: "starting" };
  try { signer = loadKey(envVar("BONUS_KEY")); } catch (e) { keyProblem = e.message.replace(/PAYOUT_KEY/g, "BONUS_KEY"); log("bonus: " + keyProblem); }

  const seen = new Map();          // signature -> { slot, minter, asset } for every mint transaction read
  let newest = null;

  /* every mint on the machine, oldest first, read once each */
  async function mints() {
    const fresh = []; let before;
    for (let page = 0; page < 20; page++) {
      const sigs = await rpc("getSignaturesForAddress", [machine, { limit: 1000, ...(before ? { before } : {}), ...(newest ? { until: newest } : {}) }]);
      for (const s of sigs) if (!s.err && !seen.has(s.signature)) fresh.push(s);
      if (sigs.length < 1000) break; before = sigs[sigs.length - 1].signature;
    }
    for (const s of fresh.reverse()) {
      let t = null;
      for (let k = 0; k < 4 && !t; k++) { try { t = await rpc("getTransaction", [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed", commitment: "confirmed" }]); } catch { await new Promise(r => setTimeout(r, 1500 * (k + 1))); } }
      if (!t) throw new Error("could not read " + s.signature);
      const keys = t.transaction.message.accountKeys;
      const signers = keys.filter(k => k.signer).map(k => k.pubkey);
      // a mint: the minter pays, the new asset co-signs; a setup transaction by the owner has one signer
      seen.set(s.signature, { slot: s.slot, minter: signers[0], asset: signers.length === 2 ? signers[1] : null });
      newest = s.signature;
    }
    const rows = [...seen.values()].filter(r => r.asset).sort((a, b) => a.slot - b.slot);
    // count an asset only if it exists now, owned by Core: a mint the bot tax refused made none
    const unknown = rows.filter(r => r.real === undefined);
    for (let i = 0; i < unknown.length; i += 100) {
      const chunk = unknown.slice(i, i + 100);
      const r = await rpc("getMultipleAccounts", [chunk.map(x => x.asset), { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]);
      chunk.forEach((x, k) => { const a = r.value[k]; x.real = !!a && a.owner === CORE; });
    }
    return rows.filter(r => r.real);
  }

  /* wallets in the order their NEEDth mint landed */
  async function eligible() {
    const count = new Map(), order = [];
    for (const r of await mints()) {
      const c = (count.get(r.minter) || 0) + 1; count.set(r.minter, c);
      if (c === NEED && !exclude.has(r.minter)) order.push({ wallet: r.minter, slot: r.slot });
    }
    return { order, count };
  }

  /* wallets already sent a bonus, from the memos on the bonus wallet */
  async function paid() {
    const done = new Set(); let before;
    for (let page = 0; page < 5; page++) {
      const sigs = await rpc("getSignaturesForAddress", [signer.address, { limit: 1000, ...(before ? { before } : {}) }]);
      for (const s of sigs) { if (s.err || !s.memo) continue; const m = s.memo.match(/REALM 5-mint bonus ([1-9A-HJ-NP-Za-km-z]{32,44})/); if (m) done.add(m[1]); }
      if (sigs.length < 1000) break; before = sigs[sigs.length - 1].signature;
    }
    return done;
  }

  async function confirm(sig, lastValid) {
    for (;;) {
      await new Promise(r => setTimeout(r, 2500));
      const st = (await rpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }])).value[0];
      if (st && st.err) return "failed";
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return "ok";
      if (await rpc("getBlockHeight", []) > lastValid) {
        const again = (await rpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }])).value[0];
        return again && !again.err ? "ok" : "expired";
      }
    }
  }

  async function tick() {
    if (busy) return; busy = true;
    try {
      if (!mint) { last = { stage: "no token set" }; return; }
      const { order, count } = await eligible();
      const winners = order.slice(0, WALLETS);
      last = { stage: "watching", winners: winners.map(w => w.wallet), qualified: order.length, minters: count.size };
      if (!signer) { last.stage = keyProblem ? "bonus key problem: " + keyProblem : "no bonus wallet set"; return; }
      if (envVar("BONUS_HOLD") === "1") { last.stage = "on hold"; return; }
      const decimals = Number(opt.decimals || 6), raw = BigInt(Math.round(AMOUNT)) * 10n ** BigInt(decimals);
      let done = await paid();
      for (const w of winners) {
        if (done.has(w.wallet)) continue;
        if (done.size >= WALLETS) break;
        // enough $DMT left for a whole bonus?
        const bal = await rpc("getTokenAccountsByOwner", [signer.address, { mint }, { encoding: "jsonParsed" }]);
        const have = (bal.value || []).reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
        if (have < raw) { last.stage = "bonus wallet needs more $DMT"; return; }
        for (let attempt = 0; attempt < 5; attempt++) {
          if ((done = await paid()).has(w.wallet)) break;            // never twice
          const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
          const t = compile(signer, bh.value.blockhash, bonusIxs(signer.address, w.wallet, mint, raw, decimals));
          await rpc("sendTransaction", [t.tx, { encoding: "base64", preflightCommitment: "confirmed" }]);
          const r = await confirm(t.sig, bh.value.lastValidBlockHeight);
          if (r === "ok") {
            done.add(w.wallet); log(`bonus: ${AMOUNT} $DMT to ${w.wallet} ${t.sig}`);
            await notify(`5-mint bonus #${done.size} of ${WALLETS}: ${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)} minted 5 beings and has been sent ${AMOUNT.toLocaleString("en-GB")} $DMT. ${WALLETS - done.size > 0 ? (WALLETS - done.size) + " bonuses left." : "That was the last one."}`);
            break;
          }
          if (r === "failed") throw new Error("bonus to " + w.wallet + " failed on chain (" + t.sig + ")");
        }
      }
      last.stage = done.size >= WALLETS ? "all bonuses sent" : "watching"; last.paid = [...done];
    } catch (e) {
      last = { ...last, stage: "error", error: String(e.message || e).slice(0, 200) };
      log("bonus: " + last.error);
    } finally { busy = false; }
  }

  const status = () => ({ amount: AMOUNT, wallets: WALLETS, mints: NEED, bonusWallet: signer ? signer.address : null,
    stage: last.stage, error: last.error, winners: last.winners || [], paid: last.paid || [], left: Math.max(0, WALLETS - (last.paid || []).length) });

  return { tick, status, eligible, start(ms = 120_000) { setTimeout(tick, 15_000); setInterval(tick, ms); } };
}

module.exports = { create, ataOf, onCurve, findPda, compile, bonusIxs };
