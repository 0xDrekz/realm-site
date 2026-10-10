/* Wallet sign-in. npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto"), fs = require("fs"), os = require("os"), path = require("path");
const Sess = require("../session");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = buf => { let n = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = "1" + s; } return s; };
function wallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { address: b58(raw), sign: msg => crypto.sign(null, Buffer.from(msg, "utf8"), privateKey).toString("base64") };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "realm-sess-"));

test("a real signature signs in; the message names the site and expires", () => {
  const S = Sess.create(), w = wallet(), { nonce, message } = S.nonce(w.address);
  assert.match(message, /^dmt-realm\.dev wants you to sign in/); assert.match(message, /URI: https:\/\/dmt-realm\.dev/); assert.match(message, /Expiration Time: /);
  const r = S.verify({ nonce, signature: w.sign(message) });
  assert.equal(r.wallet, w.address); assert.equal(S.walletOf(r.token), w.address);
  assert.equal(S.verify({ nonce, signature: w.sign(message) }), null, "a code works once");
});

test("a wrong signature, an expired code and a wrong wallet are refused", () => {
  const S = Sess.create(), w = wallet(), other = wallet();
  let n = S.nonce(w.address); assert.equal(S.verify({ nonce: n.nonce, signature: other.sign(n.message) }), null);
  n = S.nonce(w.address); const real = Date.now; Date.now = () => real() + 11 * 60e3;
  try { assert.equal(S.verify({ nonce: n.nonce, signature: w.sign(n.message) }), null); } finally { Date.now = real; }
});

test("small-order public keys are refused", () => {
  const zero = "11111111111111111111111111111111";
  assert.equal(Sess.smallOrder(Sess.b58dec(zero)), true);
  const ident = Buffer.alloc(32); ident[0] = 1; assert.equal(Sess.smallOrder(ident), true);
  const order8 = Buffer.from("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05", "hex"); assert.equal(Sess.smallOrder(order8), true);
  const noncanon = Buffer.from("eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", "hex"); assert.equal(Sess.smallOrder(noncanon), true);
  assert.equal(Sess.smallOrder(Sess.b58dec(wallet().address)), false);
  const S = Sess.create(), n = S.nonce(zero);
  assert.equal(S.verify({ nonce: n.nonce, signature: Buffer.alloc(64).toString("base64") }), null);
});

test("an unknown or expired token is no one; signing out ends the session", () => {
  const S = Sess.create(), w = wallet(), n = S.nonce(w.address), { token } = S.verify({ nonce: n.nonce, signature: w.sign(n.message) });
  assert.equal(S.walletOf("nope"), null); assert.equal(S.walletOf(null), null); assert.equal(S.walletOf(5), null);
  const real = Date.now; Date.now = () => real() + 25 * 3600e3;
  try { assert.equal(S.walletOf(token), null, "expired"); } finally { Date.now = real; }
  const n2 = S.nonce(w.address), t2 = S.verify({ nonce: n2.nonce, signature: w.sign(n2.message) }).token;
  S.end(t2); assert.equal(S.walletOf(t2), null, "signed out");
});

test("sessions survive a restart, stored by hash only", () => {
  const dir = tmp(), A = Sess.create({ dir }), w = wallet(), n = A.nonce(w.address), { token } = A.verify({ nonce: n.nonce, signature: w.sign(n.message) });
  A.flush();
  const raw = fs.readFileSync(path.join(dir, "sessions.json"), "utf8");
  assert.ok(!raw.includes(token), "the token itself is never written to disk");
  const B = Sess.create({ dir }); assert.equal(B.walletOf(token), w.address);
});

test("a full nonce store drops the oldest, not everyone", () => {
  const S = Sess.create(), w = wallet(), first = S.nonce(w.address);
  const mine = S.nonce(w.address);
  for (let i = 0; i < 4999; i++) S.nonce(w.address);
  assert.equal(S.size().nonces, 5000);
  assert.equal(S.verify({ nonce: first.nonce, signature: w.sign(first.message) }), null, "the oldest went");
  const last = S.nonce(w.address); assert.ok(S.verify({ nonce: last.nonce, signature: w.sign(last.message) }), "the newest still works");
});
