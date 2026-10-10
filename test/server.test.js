/* The server must survive any JSON body on every POST endpoint. npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");

const PORT = 18000 + Math.floor(Math.random() * 1000);
const ENDPOINTS = ["/api/rpc", "/api/arena/start", "/api/arena/finish",
  "/api/tcg/deal", "/api/tcg/start", "/api/tcg/act", "/api/tcg/view", "/api/tcg/hint", "/api/tcg/team",
  "/api/duel/nonce", "/api/duel/signin", "/api/duel/signout", "/api/duel/start", "/api/duel/play", "/api/duel/nope"];
const BODIES = ["null", "[]", '"x"', "5", "true", "{", "{\"wallet\":null}", "{\"token\":5,\"match\":[],\"inputs\":null}"];

let srv;
test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "realm-test-"));
  srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT), SNAPSHOT_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
  srv.stderr.on("data", () => {});
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("server did not start")), 15000); srv.stdout.on("data", d => { if (/live on port/.test(String(d))) { clearTimeout(t); res(); } }); });
});
test.after(() => srv && srv.kill());

test("no JSON body on any POST endpoint can crash the server", async () => {
  for (const ep of ENDPOINTS) for (const body of BODIES) {
    const r = await fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.ok(r.status >= 200 && r.status < 600, ep + " " + body);
    if (["null", "[]", '"x"', "5", "true", "{"].includes(body) && ep !== "/api/rpc") assert.equal(r.status, 400, `${ep} ${body} should be 400, got ${r.status}`);
    await r.arrayBuffer();
  }
  assert.equal(srv.exitCode, null, "the server is still running");
  const home = await fetch(`http://127.0.0.1:${PORT}/mint`); assert.equal(home.status, 200, "and still serves the mint page");
});
