/* ============================================================
   REALM — the snapshot and the holder payout.

   1. SNAPSHOT. The moment the candy machine reports all beings minted,
      every holder is read off the chain: which beings, their weight,
      their $DMT and its multiplier, so their points. The snapshot is
      saved, hashed, served at /api/snapshot and announced in Telegram.

   2. PAYOUT. PAYOUT_DELAY_HOURS after the snapshot (24 unless set), the
      server pays every holder their share from the payout wallet:
        share = pool x (their points / everyone's points)
      Plain SOL transfers, 16 holders to a transaction, each transaction
      tagged with a memo naming the snapshot, the pool and the batch:
        REALM payout <hash> P=<lamports> b=<k>/<n>
      The memos are the record. On a restart the server reads them back
      off the chain and carries on from the first batch not yet paid, so
      nobody is paid twice and nobody is skipped, with no file to lose.

   The payout wallet is its own wallet, not the rewards wallet: the owner
   moves the pool into it after the snapshot, and its key is a Railway
   variable (PAYOUT_KEY) that is set nowhere else. Without PAYOUT_KEY the
   snapshot is still taken and published; nothing is paid.

   Railway variables, all optional:
     PAYOUT_KEY          the payout wallet's secret key (base58, or [n,n,...])
     PAYOUT_DELAY_HOURS  hours from snapshot to payout (default 24)
     PAYOUT_AT           an exact payout time instead, e.g. 2026-11-02T20:00:00Z
     PAYOUT_HOLD         set to 1 to pause the payout
     PAYOUT_MAX_SOL      the most it will pay out in all (default: the expected pool + 10%)
     SNAPSHOT_DIR        a Railway volume path, so the snapshot survives redeploys
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SYSTEM = "11111111111111111111111111111111";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const BUDGET = "ComputeBudget111111111111111111111111111111";
const PER_TX = 16;                 // 16 transfers fit well inside a transaction
const RESERVE = 10_000_000;        // 0.01 SOL left behind for fees
const RENT_MIN = 890_880;          // the least a brand-new wallet can be sent

/* ---------- base58 ---------- */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58enc(buf) {
  let n = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x) break; s = "1" + s; }
  return s;
}
function b58dec(str) {
  let n = 0n;
  for (const c of str) { const i = B58.indexOf(c); if (i < 0) throw new Error("not base58"); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  const body = n ? Buffer.from(hex, "hex") : Buffer.alloc(0);
  let zeros = 0; for (const c of str) { if (c !== "1") break; zeros++; }
  return Buffer.concat([Buffer.alloc(zeros), body]);
}

/* ---------- a signing key from PAYOUT_KEY ---------- */
function loadKey(raw) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  // wallets export keys differently: [n,n,...], hex, or base58; the full 64 bytes, or only the 32-byte seed
  const bytes = raw.startsWith("[") ? Buffer.from(JSON.parse(raw))
    : /^(0x)?[0-9a-fA-F]{64}([0-9a-fA-F]{64})?$/.test(raw) ? Buffer.from(raw.replace(/^0x/, ""), "hex") : b58dec(raw);
  if (bytes.length !== 64 && bytes.length !== 32) throw new Error("PAYOUT_KEY is not a Solana secret key");
  const seed = bytes.subarray(0, 32);
  const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  const derived = crypto.createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32);
  // with the full 64 bytes, the public half must match, or the key was pasted wrong
  if (bytes.length === 64 && !derived.equals(bytes.subarray(32))) throw new Error("PAYOUT_KEY does not match its own public key");
  return { key, pub: Buffer.from(derived), address: b58enc(derived) };
}

/* ---------- a legacy transaction, built by hand ---------- */
function shortvec(n) { const out = []; do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function buildTx(signer, blockhash, transfers, memo) {
  // keys: payer (signer, writable), recipients (writable), then the read-only programs
  const recips = transfers.map(t => t.to);
  const keys = [signer.address, ...recips, SYSTEM, BUDGET, MEMO];
  const idx = k => keys.indexOf(k);
  const ix = [];
  ix.push({ p: idx(BUDGET), a: [], d: Buffer.concat([Buffer.from([3]), u64(20_000)]) });           // a small priority fee
  for (const t of transfers) {
    const d = Buffer.alloc(12); d.writeUInt32LE(2, 0); d.writeBigUInt64LE(BigInt(t.lamports), 4);    // system transfer
    ix.push({ p: idx(SYSTEM), a: [0, idx(t.to)], d });
  }
  ix.push({ p: idx(MEMO), a: [], d: Buffer.from(memo, "utf8") });
  const msg = Buffer.concat([
    Buffer.from([1, 0, 3]),                                   // 1 signer, 0 read-only signers, 3 read-only programs
    shortvec(keys.length), ...keys.map(k => b58dec(k).length === 32 ? b58dec(k) : (() => { throw new Error("bad key " + k); })()),
    b58dec(blockhash),
    shortvec(ix.length),
    ...ix.map(i => Buffer.concat([Buffer.from([i.p]), shortvec(i.a.length), Buffer.from(i.a), shortvec(i.d.length), i.d]))
  ]);
  const sig = crypto.sign(null, msg, signer.key);
  const tx = Buffer.concat([shortvec(1), sig, msg]);
  if (tx.length > 1232) throw new Error("transaction too large: " + tx.length);
  return { tx: tx.toString("base64"), sig: b58enc(sig) };
}

/* ---------- the snapshot ---------- */
const canon = o => JSON.stringify(o);
const hashOf = snap => crypto.createHash("sha256").update(canon({ ...snap, hash: undefined })).digest("hex");

async function takeSnapshot({ rpc, assets, tierOf, weightOf, multFor, tokenMint, collection }) {
  const slot = await rpc("getSlot", []);
  const list = await assets();
  const owners = new Map();
  for (const a of list) {
    const n = Number((a.name.match(/#(\d+)/) || [])[1] || 0);
    const tier = tierOf(n);
    if (!n || !tier || !a.owner) continue;
    const o = owners.get(a.owner) || { owner: a.owner, beings: [], weight: 0 };
    o.beings.push(n); o.weight += weightOf(tier); owners.set(a.owner, o);
  }
  const holders = [...owners.values()];
  // $DMT balances, one call per holder, when the token exists
  for (const h of holders) {
    h.beings.sort((x, y) => x - y);
    h.tokens = 0;
    if (tokenMint) {
      for (let t = 0; t < 4; t++) {
        try {
          const r = await rpc("getTokenAccountsByOwner", [h.owner, { mint: tokenMint }, { encoding: "jsonParsed" }]);
          for (const acc of (r && r.value) || []) { const ta = acc.account.data.parsed.info.tokenAmount; h.tokens += Math.floor(Number(ta.amount) / 10 ** Number(ta.decimals)); }
          break;
        } catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (t + 1))); }
      }
    }
    h.mult = multFor(h.tokens);
    h.points = Math.round(h.weight * h.mult * 1000) / 1000;
  }
  // a holder that is a program's account (a marketplace escrow, say) cannot be paid safely: set aside
  for (let i = 0; i < holders.length; i += 100) {
    const chunk = holders.slice(i, i + 100);
    const r = await rpc("getMultipleAccounts", [chunk.map(h => h.owner), { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]);
    chunk.forEach((h, k) => { const acc = r.value[k]; h.payable = !acc || acc.owner === SYSTEM; h.exists = !!acc; });
  }
  holders.sort((a, b) => b.points - a.points || (a.owner < b.owner ? -1 : 1));
  const snap = {
    version: 1, takenAt: new Date().toISOString(), slot, collection, tokenMint: tokenMint || null,
    minted: holders.reduce((s, h) => s + h.beings.length, 0),
    totalWeight: holders.reduce((s, h) => s + h.weight, 0),
    totalPoints: Math.round(holders.reduce((s, h) => s + h.points, 0) * 1000) / 1000,
    holders
  };
  snap.hash = hashOf(snap);
  return snap;
}

/* ---------- who gets what, from a snapshot and a pool ---------- */
function plan(snap, poolLamports, perTx = PER_TX) {
  const P = BigInt(poolLamports), T = BigInt(Math.round(snap.totalPoints * 1000));
  const rows = snap.holders.map(h => {
    const lamports = T ? (P * BigInt(Math.round(h.points * 1000))) / T : 0n;
    // a wallet that does not exist yet can only be opened with at least RENT_MIN
    const payable = h.payable && (h.exists || lamports >= BigInt(RENT_MIN));
    return { owner: h.owner, beings: h.beings.length, weight: h.weight, mult: h.mult, points: h.points, lamports: Number(lamports), payable };
  });
  const pay = rows.filter(r => r.payable && r.lamports > 0);
  const batches = [];
  for (let i = 0; i < pay.length; i += perTx) batches.push(pay.slice(i, i + perTx));
  return { rows, batches, held: rows.filter(r => !r.payable) };
}

/* ---------- the module ---------- */
function create(opt) {
  const { root, rpc, envVar, log = console.log, notify = async () => {} } = opt;
  const total = opt.totalBeings, perTx = opt.perTx || PER_TX, reserve = Math.max(opt.reserve != null ? opt.reserve : RESERVE, RENT_MIN + 100_000);   // the payout wallet itself must stay above Solana's minimum
  const dir = envVar("SNAPSHOT_DIR") || path.join(root, "snapshot-data");
  const file = path.join(dir, "snapshot.json");
  let snap = null, signer = null, keyProblem = "", busy = false, last = { stage: "waiting for the mint to finish" };

  try { signer = loadKey(envVar("PAYOUT_KEY")); } catch (e) { keyProblem = e.message; log("payout: " + e.message); }

  // a snapshot already taken: a volume first, then one committed to the repo
  for (const f of [file, path.join(root, "snapshot.json")]) {
    try { const s = JSON.parse(fs.readFileSync(f, "utf8")); if (s.hash === hashOf(s)) { snap = s; log("payout: snapshot loaded from " + f); break; } else log("payout: " + f + " fails its hash, ignored"); } catch {}
  }

  const dueAt = () => {
    if (!snap) return null;
    const at = envVar("PAYOUT_AT"); if (at && !isNaN(Date.parse(at))) return new Date(at).toISOString();
    const h = Number(envVar("PAYOUT_DELAY_HOURS") || 24);
    return new Date(Date.parse(snap.takenAt) + h * 3600_000).toISOString();
  };
  const expectedPool = () => Math.round(total * opt.price * opt.poolPercent / 100 * 1e9);
  // a little headroom over the expected pool: the price changed mid-mint, so the real pool may differ slightly
  const cap = () => { const m = Number(envVar("PAYOUT_MAX_SOL")); return m > 0 ? Math.round(m * 1e9) : Math.round(expectedPool() * 1.1); };

  /* the batches already paid, read back from the memos on the payout wallet */
  async function paid() {
    const tag = "REALM payout " + snap.hash.slice(0, 12);
    const done = new Set(); let P = null, before, foreign = false;
    for (let page = 0; page < 10; page++) {
      const sigs = await rpc("getSignaturesForAddress", [signer.address, { limit: 1000, ...(before ? { before } : {}) }]);
      for (const s of sigs) {
        if (!s.memo || !/REALM payout /.test(s.memo)) continue;
        if (!s.memo.includes(tag)) { foreign = true; continue; }
        if (s.err) continue;
        const m = s.memo.match(/P=(\d+) b=(\d+)\/(\d+)/); if (!m) continue;
        P = P || m[1]; if (m[1] === P) done.add(Number(m[2]));
      }
      if (sigs.length < 1000) break; before = sigs[sigs.length - 1].signature;
    }
    return { done, P, foreign };
  }

  async function confirm(sig, lastValid) {
    for (;;) {
      await new Promise(r => setTimeout(r, 2500));
      const st = (await rpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }])).value[0];
      if (st && st.err) return "failed";
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return "ok";
      const h = await rpc("getBlockHeight", []);
      if (h > lastValid) {
        const again = (await rpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }])).value[0];
        return again && !again.err ? "ok" : "expired";       // past its blockhash it can never land: safe to send afresh
      }
    }
  }

  async function payNow() {
    const before = await paid();
    if (before.foreign) throw new Error("the payout wallet has payout memos from a different snapshot: stopping");
    let P = before.P ? BigInt(before.P) : null;
    if (!P) {
      const bal = BigInt((await rpc("getBalance", [signer.address])).value);
      const exp = BigInt(expectedPool());
      if (bal < (exp * 9n) / 10n) { last = { stage: "waiting for the payout wallet to be funded", balance: Number(bal) / 1e9, needs: Number(exp) / 1e9 }; return; }
      P = bal - BigInt(reserve); if (P > BigInt(cap())) P = BigInt(cap());
    }
    const pl = plan(snap, P, perTx);
    const n = pl.batches.length;
    const already = before.done.size >= n;
    for (let b = 1; b <= n; b++) {
      if (before.done.has(b)) continue;
      for (let attempt = 0; attempt < 5; attempt++) {
        // read the record again first: a batch that landed is never sent twice
        if ((await paid()).done.has(b)) break;
        const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
        const t = buildTx(signer, bh.value.blockhash, pl.batches[b - 1].map(r => ({ to: r.owner, lamports: r.lamports })),
          `REALM payout ${snap.hash.slice(0, 12)} P=${P} b=${b}/${n}`);
        await rpc("sendTransaction", [t.tx, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" }]);
        const r = await confirm(t.sig, bh.value.lastValidBlockHeight);
        last = { stage: "paying", batch: b, of: n, lastTx: t.sig };
        if (r === "ok") { log(`payout: batch ${b}/${n} paid ${t.sig}`); break; }
        if (r === "failed") throw new Error(`batch ${b} failed on chain (${t.sig})`);
        log(`payout: batch ${b} expired, sending again`);
      }
    }
    const after = await paid();
    if (after.done.size >= n) {
      last = { stage: "paid", batches: n, pool: Number(P) / 1e9 };
      log("payout: every holder paid");
      if (!already) await notify(`All ${pl.rows.filter(r => r.payable).length} holders have been paid from the REALM pool: ${(Number(P) / 1e9).toFixed(2)} SOL. Check yours at dmt-realm.dev/wallet`);
    }
  }

  async function tick() {
    if (busy) return; busy = true;
    try {
      if (!snap) {
        const minted = await opt.minted();
        if (minted < total) { last = { stage: "waiting for the mint to finish", minted, of: total }; return; }
        log("payout: all minted, taking the snapshot");
        snap = await takeSnapshot(opt.snapshotFrom());
        try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(snap, null, 1)); } catch (e) { log("payout: could not save the snapshot: " + e.message); }
        log("payout: snapshot " + snap.hash);
        await notify(`The REALM is full. Snapshot taken: ${snap.holders.length} holders, ${snap.minted} beings.\nHash ${snap.hash}\nPayout: ${dueAt().replace("T", " ").slice(0, 16)} UTC. Every share is listed at dmt-realm.dev/payout`);
      }
      if (!signer) { last = { stage: keyProblem ? "payout key problem: " + keyProblem : "snapshot taken; no payout wallet set" }; return; }
      if (envVar("PAYOUT_HOLD") === "1") { last = { stage: "on hold" }; return; }
      if (last.stage === "paid") return;
      if (Date.now() < Date.parse(dueAt())) { last = { stage: "snapshot taken; payout scheduled", dueAt: dueAt() }; return; }
      await payNow();
    } catch (e) {
      last = { stage: "error", error: String(e.message || e).slice(0, 200) };
      log("payout: " + last.error);
    } finally { busy = false; }
  }

  // the page and the wallet checker read the record often: once every 15 seconds is plenty
  let paidAt = 0, paidHit = null;
  async function paidCached() {
    if (paidHit && Date.now() - paidAt < 15_000) return paidHit;
    paidHit = await paid(); paidAt = Date.now(); return paidHit;
  }

  async function status(address) {
    const out = { stage: last.stage, info: last, payoutWallet: signer ? signer.address : null, dueAt: dueAt(),
      snapshot: snap ? { hash: snap.hash, takenAt: snap.takenAt, slot: snap.slot, holders: snap.holders.length, minted: snap.minted, totalPoints: snap.totalPoints } : null };
    if (snap) {
      let P = BigInt(expectedPool()), done = new Set(), final = false;
      if (signer) { try { const p = await paidCached(); if (p.P) { P = BigInt(p.P); final = true; } done = p.done; } catch {} }
      const pl = plan(snap, P, perTx);
      const batchOf = new Map(); pl.batches.forEach((b, i) => b.forEach(r => batchOf.set(r.owner, i + 1)));
      const row = r => ({ ...r, sol: r.lamports / 1e9, paid: batchOf.has(r.owner) && done.has(batchOf.get(r.owner)) });
      out.pool = Number(P) / 1e9; out.poolFinal = final;
      out.paidBatches = done.size; out.batches = pl.batches.length;
      if (address) out.holder = (pl.rows.find(r => r.owner === address) && row(pl.rows.find(r => r.owner === address))) || null;
      else out.rows = pl.rows.map(row);
    }
    return out;
  }

  return { tick, status, snapshot: () => snap, start(ms = 60_000) { setTimeout(tick, 5_000); setInterval(tick, ms); } };
}

module.exports = { create, plan, takeSnapshot, buildTx, loadKey, hashOf, b58enc, b58dec };
