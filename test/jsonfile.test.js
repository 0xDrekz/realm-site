/* Board files: atomic, saved under load, never silently emptied. npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const J = require("../jsonfile");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "realm-jf-"));

test("a missing file is a fresh start; a corrupt one stops everything and is left alone", () => {
  const d = tmp(), f = path.join(d, "b.json");
  assert.deepEqual(J.create(f, { fallback: { weeks: {} } }).load(), { weeks: {} });
  fs.writeFileSync(f, '{"weeks": {"2026-10-05": {"W": {"po');
  assert.throws(() => J.create(f).load(), /corrupt/);
  assert.equal(fs.readFileSync(f, "utf8"), '{"weeks": {"2026-10-05": {"W": {"po', "untouched");
  fs.copyFileSync(f, path.join(d, "tcg2-boards.json"));
  assert.throws(() => require("../tcg2/game").create({ dir: d, log: () => {} }), /corrupt/);
});

test("writes are atomic and leave no temp files", () => {
  const d = tmp(), f = path.join(d, "b.json"), jf = J.create(f);
  jf.save(() => ({ a: 1 })); jf.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(f, "utf8")), { a: 1 });
  assert.deepEqual(fs.readdirSync(d), ["b.json"]);
});

test("constant activity can't put a save off for more than the max wait", async () => {
  const d = tmp(), f = path.join(d, "b.json"), jf = J.create(f, { quiet: 50, maxWait: 200 });
  const t0 = Date.now(); let n = 0;
  while (!fs.existsSync(f) && Date.now() - t0 < 2000) { jf.save(() => ({ n: ++n })); await new Promise(r => setTimeout(r, 20)); }
  assert.ok(fs.existsSync(f), "saved while changes kept coming"); assert.ok(Date.now() - t0 < 600);
});
