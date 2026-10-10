/* ============================================================
   Wallet sign-in for the games.

   The page asks for a one-time message, the wallet signs it (a signature,
   not a transaction: nothing is sent or spent), and the server checks the
   signature against the address and hands back a session token.

   - The message names the site (dmt-realm.dev) and carries an expiry, so a
     signature collected elsewhere, or later, is worthless here.
   - Small-order public keys (the all-zero key and friends, for which a
     forged signature can verify) are refused before any check.
   - Sessions are kept on disk (SNAPSHOT_DIR), by a hash of the token, so a
     redeploy doesn't sign everyone out and the file never holds a usable
     token. Signing out ends the session here too.
   - When the stores fill up, the oldest entries go, never all of them.
   ============================================================ */
"use strict";
const crypto = require("crypto"), fs = require("fs"), path = require("path");

const NONCE_TTL = 10 * 60e3, SESSION_TTL = 24 * 3600e3, MAX_NONCES = 5000, MAX_SESSIONS = 20000;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58dec(s) {
  let n = 0n;
  for (const ch of String(s)) { const i = B58.indexOf(ch); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of String(s)) { if (ch !== "1") break; out.unshift(0); }
  return Buffer.from(out);
}

/* An ed25519 point has small order exactly when its y-coordinate is one of five values:
   1, -1, 0 and the two order-8 values. Checked on y mod p with the sign bit masked off, which
   also catches the non-canonical encodings (y + p). */
const P = 2n ** 255n - 19n;
const Y8 = 0x05fc536d880238b13933c6d305acdfd5f098eff289f4c345b027b2c28f95e826n;
const SMALL_Y = new Set([0n, 1n, P - 1n, Y8, P - Y8].map(String));
function smallOrder(pub) {
  if (pub.length !== 32) return true;
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(pub[i]);
  y &= (1n << 255n) - 1n;
  return SMALL_Y.has(String(y % P));
}

const hash = t => crypto.createHash("sha256").update(String(t)).digest("hex");
function bounded(map, max) { while (map.size > max) map.delete(map.keys().next().value); }

function create({ dir = null, domain = "dmt-realm.dev", log = () => {} } = {}) {
  const nonces = new Map(), sessions = new Map();          // sessions: sha256(token) → { wallet, exp }
  const file = dir ? path.join(dir, "sessions.json") : null;
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8")), now = Date.now();
      for (const [h, s] of Object.entries(saved || {})) if (s && s.exp > now && typeof s.wallet === "string") sessions.set(h, s);
    } catch (e) { if (e.code !== "ENOENT") log("sessions: could not read the saved sessions, starting fresh: " + e.message); }
  }
  let timer = null, dirty = false;
  function flush() {
    if (!file || !dirty) return;
    dirty = false; clearTimeout(timer); timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + "." + process.pid + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sessions)));
      fs.renameSync(tmp, file);
    } catch (e) { log("sessions: could not save: " + e.message); }
  }
  const save = () => { dirty = true; if (!timer) timer = setTimeout(flush, 2000); if (timer.unref) timer.unref(); };

  function nonce(address) {
    const code = crypto.randomBytes(12).toString("hex"), issued = new Date(), expires = new Date(issued.getTime() + NONCE_TTL);
    const message = `${domain} wants you to sign in with your Solana account:\n${address}\n\n`
      + "Sign in to REALM. This only proves you own this wallet. It is not a transaction: it costs nothing and moves nothing.\n\n"
      + `URI: https://${domain}\nNonce: ${code}\nIssued At: ${issued.toISOString()}\nExpiration Time: ${expires.toISOString()}`;
    nonces.set(code, { address, message, exp: expires.getTime() });
    bounded(nonces, MAX_NONCES);
    return { nonce: code, message };
  }

  function verify({ nonce: code, signature } = {}) {
    const n = nonces.get(String(code || "")); nonces.delete(String(code || ""));   // each code works once
    if (!n || Date.now() > n.exp) return null;
    try {
      const pub = b58dec(n.address);
      if (pub.length !== 32 || smallOrder(pub)) return null;
      const sig = Buffer.from(String(signature || ""), "base64");
      if (sig.length !== 64) return null;
      const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pub]), format: "der", type: "spki" });
      if (!crypto.verify(null, Buffer.from(n.message, "utf8"), key, sig)) return null;
    } catch { return null; }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(hash(token), { wallet: n.address, exp: Date.now() + SESSION_TTL });
    bounded(sessions, MAX_SESSIONS);
    save();
    return { token, wallet: n.address };
  }

  /* the wallet a token belongs to; null for an unknown or expired one */
  function walletOf(token) {
    if (!token || typeof token !== "string") return null;
    const h = hash(token), s = sessions.get(h);
    if (!s) return null;
    if (s.exp <= Date.now()) { sessions.delete(h); save(); return null; }
    return s.wallet;
  }
  function end(token) { if (typeof token === "string" && sessions.delete(hash(token))) save(); }

  return { nonce, verify, walletOf, end, flush, size: () => ({ nonces: nonces.size, sessions: sessions.size }) };
}

module.exports = { create, smallOrder, b58dec };
