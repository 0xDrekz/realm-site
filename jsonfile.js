/* ============================================================
   A JSON file that holds something we can't lose (a leaderboard).

   - load(): a missing file is a fresh start; a file that is there but
     can't be read or parsed STOPS the server, and the file is left alone
     for a person to look at. A board never silently starts empty.
   - Writes are atomic: a temp file is written in full, then renamed over
     the old one, so a crash mid-write can't leave half a board.
   - Saves are batched (a short pause after the last change) but never
     put off for more than 30 seconds, however busy the server is.
   - flush() writes now; the server calls it on SIGTERM.
   ============================================================ */
"use strict";
const fs = require("fs"), path = require("path");

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function create(file, { fallback = {}, log = () => {}, quiet = 1500, maxWait = 30_000, serialize = v => JSON.stringify(v) } = {}) {
  function load() {
    let text;
    try { text = fs.readFileSync(file, "utf8"); }
    catch (e) { if (e.code === "ENOENT") return structuredClone(fallback); throw new Error(`${file} could not be read (${e.message}); refusing to start rather than lose it`); }
    try { const v = JSON.parse(text); if (!v || typeof v !== "object") throw new Error("not an object"); return v; }
    catch (e) { throw new Error(`${file} is corrupt (${e.message}). It has been left as it is; fix or move it by hand, then restart.`); }
  }
  let get = null, timer = null, first = 0;
  function flush() {
    clearTimeout(timer); timer = null; first = 0;
    if (!get) return;
    try { writeAtomic(file, serialize(get())); } catch (e) { log("could not save " + path.basename(file) + ": " + e.message); }
  }
  /* call after every change; getValue returns what to write */
  function save(getValue) {
    get = getValue;
    const now = Date.now();
    if (!first) first = now;
    clearTimeout(timer);
    const wait = Math.max(0, Math.min(quiet, first + maxWait - now));
    timer = setTimeout(flush, wait);
    if (timer.unref) timer.unref();
  }
  return { load, save, flush };
}

module.exports = { create, writeAtomic };
