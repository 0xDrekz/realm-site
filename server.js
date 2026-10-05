/* Tiny static file server for Railway. No dependencies — Node built-ins only. */

const http = require("http");
const fs   = require("fs");
const path  = require("path");
const https = require("https");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".mp4":  "video/mp4",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".txt":  "text/plain; charset=utf-8"
};

/* ============================================================
   THE WALLET CHECKER

   The site asks nobody to connect a wallet. You paste an address and it
   says what that address holds. No signing, no permission prompt, no
   extension, and it works on a phone with no wallet installed at all —
   you can check somebody else's address, which is the point: the whole
   mechanism is meant to be checkable.

   This has to live on the server because it needs an RPC key, and a key
   in the page is a key given to everybody who opens the page. It reads
   HELIUS_KEY, COLLECTION and TOKEN_MINT from the environment — set them
   in Railway's variables, never in a file.
   ============================================================ */

const ENV = {
  key:   process.env.HELIUS_KEY || "",
  col:   process.env.COLLECTION || "",
  mint:  process.env.TOKEN_MINT || ""
};

/* base58 has no 0, O, I or l, and a Solana address is 32 bytes, which
   lands between 32 and 44 characters. Anything else is not worth a
   round trip to the RPC. */
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/* One answer per address for half a minute. Somebody refreshing, or a
   dozen people checking the same whale, should not each cost a call. */
const cache = new Map();
const CACHE_MS = 30_000;

/* And a plain ceiling per caller, so the key cannot be burned through
   by anyone who finds the endpoint. */
const hits = new Map();
const LIMIT = 30, WINDOW_MS = 60_000;

function allowed(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  h.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();       // never grow without bound
  return h.length <= LIMIT;
}

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: "realm", method, params });
    const r = https.request(
      `https://mainnet.helius-rpc.com/?api-key=${ENV.key}`,
      { method: "POST", headers: { "Content-Type": "application/json",
                                   "Content-Length": Buffer.byteLength(body) },
        timeout: 15_000 },
      resp => {
        let d = "";
        resp.on("data", c => d += c);
        resp.on("end", () => {
          try {
            const j = JSON.parse(d);
            j.error ? reject(new Error(j.error.message || "rpc error")) : resolve(j.result);
          } catch { reject(new Error("bad rpc response")); }
        });
      });
    r.on("timeout", () => r.destroy(new Error("rpc timeout")));
    r.on("error", reject);
    r.end(body);
  });
}

async function holdings(address) {
  const beings = [];
  for (let page = 1; page <= 10; page++) {
    const res = await rpc("searchAssets", {
      ownerAddress: address, grouping: ["collection", ENV.col],
      page, limit: 1000
    });
    const items = (res && res.items) || [];
    for (const a of items) {
      const attrs = (a.content && a.content.metadata && a.content.metadata.attributes) || [];
      const tier = (attrs.find(t => t.trait_type === "Tier") || {}).value;
      const name = (a.content && a.content.metadata && a.content.metadata.name) || a.id;
      const image = (a.content && a.content.links && a.content.links.image)
                 || (a.content && a.content.files && a.content.files[0] && a.content.files[0].uri)
                 || "";
      const being = (attrs.find(t => t.trait_type === "Being") || {}).value || "";
      if (tier) beings.push({ tier, name, being, image });
    }
    if (items.length < 1000) break;
  }

  let tokens = 0;
  if (ENV.mint) {
    const res = await rpc("getTokenAccountsByOwner",
      [address, { mint: ENV.mint }, { encoding: "jsonParsed" }]);
    for (const acc of (res && res.value) || []) {
      const t = acc.account.data.parsed.info.tokenAmount;
      tokens += Math.floor(Number(t.amount) / 10 ** Number(t.decimals));
    }
  }
  return { beings, tokens };
}

/* ---- the holders board ----
   Every being in the collection, grouped by owner and weighed. Done once
   every ten minutes at most, whoever asks: it is a few calls for the whole
   collection, and a board that is ten minutes old is still a true board.
   The tier weights are read out of data.js so there is one list of them. */
const WEIGHTS = (() => {
  try {
    const src = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
    const out = {};
    for (const m of src.matchAll(/name:\s*"([A-Za-z]+)"[^}]*?weight:\s*(\d+)/g)) out[m[1]] = Number(m[2]);
    return out;
  } catch { return {}; }
})();
let board = null, boardAt = 0, boardBusy = null;
const BOARD_MS = 10 * 60_000;

async function holders() {
  const owners = new Map();
  let minted = 0;
  for (let page = 1; page <= 10; page++) {
    const res = await rpc("getAssetsByGroup", {
      groupKey: "collection", groupValue: ENV.col, page, limit: 1000
    });
    const items = (res && res.items) || [];
    for (const a of items) {
      const attrs = (a.content && a.content.metadata && a.content.metadata.attributes) || [];
      const tier = (attrs.find(t => t.trait_type === "Tier") || {}).value;
      const owner = a.ownership && a.ownership.owner;
      if (!tier || !owner) continue;
      minted++;
      const o = owners.get(owner) || { owner, weight: 0, beings: 0, tiers: {} };
      o.weight += WEIGHTS[tier] || 0;
      o.beings += 1;
      o.tiers[tier] = (o.tiers[tier] || 0) + 1;
      owners.set(owner, o);
    }
    if (items.length < 1000) break;
  }
  const list = [...owners.values()].sort((a, b) => b.weight - a.weight);
  // token balances only for the top of the board: one call each
  if (ENV.mint) {
    for (const o of list.slice(0, 25)) {
      try {
        const res = await rpc("getTokenAccountsByOwner",
          [o.owner, { mint: ENV.mint }, { encoding: "jsonParsed" }]);
        o.tokens = 0;
        for (const acc of (res && res.value) || []) {
          const t = acc.account.data.parsed.info.tokenAmount;
          o.tokens += Math.floor(Number(t.amount) / 10 ** Number(t.decimals));
        }
      } catch { /* a missing balance is shown as unknown, not as zero */ }
    }
  }
  return { minted, holders: list.length, weightHeld: list.reduce((a, o) => a + o.weight, 0),
           top: list.slice(0, 25), at: Date.now() };
}

/* ---- the live numbers on the door ----
   How many beings are minted (so the page can show the rewards pool raised
   so far) and the market cap of $DMT. One shared answer, at most once a
   minute, whoever asks. The market cap comes from DexScreener's public API:
   the deepest pool for the token, its market cap, or its FDV where a market
   cap is not given. Either half is null when it cannot be known yet. */
let stats = null, statsAt = 0, statsBusy = null;
const STATS_MS = 60_000;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10_000, headers: { "Accept": "application/json" } }, resp => {
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("bad json")); } });
    }).on("timeout", function () { this.destroy(new Error("timeout")); }).on("error", reject);
  });
}

async function readStats() {
  let minted = null;
  if (ENV.key && ENV.col) {
    minted = 0;
    for (let page = 1; page <= 10; page++) {
      const res = await rpc("getAssetsByGroup", { groupKey: "collection", groupValue: ENV.col, page, limit: 1000 });
      const items = (res && res.items) || [];
      minted += items.length;
      if (items.length < 1000) break;
    }
  }
  let dmt = null;
  if (ENV.mint) {
    try {
      const d = await getJSON(`https://api.dexscreener.com/latest/dex/tokens/${ENV.mint}`);
      const pairs = (d && d.pairs) || [];
      const best = pairs.sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0];
      if (best) dmt = {
        mcap: Number(best.marketCap || best.fdv) || null,
        price: Number(best.priceUsd) || null,
        url: best.url || null
      };
    } catch { /* unknown, not zero */ }
  }
  return { minted, dmt, at: Date.now() };
}

const server = http.createServer((req, res) => {
  // strip query string, decode, and block path traversal
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  if (urlPath === "/holders") urlPath = "/holders.html";

  if (urlPath === "/api/holders") {
    const send = (code, obj) => res.writeHead(code, {
      "Content-Type": TYPES[".json"], "Cache-Control": "no-store"
    }).end(JSON.stringify(obj));
    if (!ENV.key || !ENV.col) return send(503, { ready: false });
    if (board && Date.now() - boardAt < BOARD_MS) return send(200, board);
    boardBusy = boardBusy || holders()
      .then(d => { board = d; boardAt = Date.now(); return d; })
      .finally(() => { boardBusy = null; });
    boardBusy.then(d => send(200, d))
             .catch(() => board ? send(200, board) : send(502, { error: "Could not read the chain just now." }));
    return;
  }

  if (urlPath === "/api/stats") {
    const send = (code, obj) => res.writeHead(code, {
      "Content-Type": TYPES[".json"], "Cache-Control": "no-store"
    }).end(JSON.stringify(obj));
    if (stats && Date.now() - statsAt < STATS_MS) return send(200, stats);
    statsBusy = statsBusy || readStats()
      .then(d => { stats = d; statsAt = Date.now(); return d; })
      .finally(() => { statsBusy = null; });
    statsBusy.then(d => send(200, d))
             .catch(() => stats ? send(200, stats) : send(200, { minted: null, dmt: null }));
    return;
  }

  /* ---- the mint bot's connection check ---- */
  if (urlPath === "/api/bot-test") {
    require("./bot").test()
      .then(r => res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" })
                    .end(JSON.stringify(r, null, 2)))
      .catch(() => res.writeHead(502, { "Content-Type": TYPES[".json"] })
                      .end(JSON.stringify({ ok: false, problem: "Could not reach Telegram." })));
    return;
  }

  if (urlPath === "/api/bot-sample") {
    require("./bot").sample(ROOT)
      .then(r => res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" })
                    .end(JSON.stringify(r, null, 2)))
      .catch(() => res.writeHead(502, { "Content-Type": TYPES[".json"] })
                      .end(JSON.stringify({ ok: false, problem: "Could not reach Telegram." })));
    return;
  }

  /* ---- the checker ---- */
  if (urlPath === "/api/holdings") {
    const send = (code, obj) => res.writeHead(code, {
      "Content-Type": TYPES[".json"], "Cache-Control": "no-store"
    }).end(JSON.stringify(obj));

    const address = new URL(req.url, "http://x").searchParams.get("address") || "";

    if (!ENV.key || !ENV.col) return send(503, { ready: false });
    if (!ADDRESS.test(address)) return send(400, { error: "That is not a Solana address." });

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
               || req.socket.remoteAddress || "?";
    if (!allowed(ip)) return send(429, { error: "Too many checks. Wait a minute." });

    const hit = cache.get(address);
    if (hit && Date.now() - hit.at < CACHE_MS) return send(200, hit.data);

    holdings(address)
      .then(data => { cache.set(address, { at: Date.now(), data });
                      if (cache.size > 2000) cache.clear();
                      send(200, data); })
      .catch(e => send(502, { error: "Could not read the chain just now." }));
    return;
  }

  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // unknown path -> serve the homepage (single page site behaviour)
      fs.readFile(path.join(ROOT, "index.html"), (err2, home) => {
        if (err2) { res.writeHead(404).end("Not found"); return; }
        res.writeHead(404, { "Content-Type": TYPES[".html"] }).end(home);
      });
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const type = TYPES[ext] || "application/octet-stream";

    /* Code and pages must never be served stale — otherwise a browser
       keeps running yesterday's site after a deploy. Images and fonts
       rarely change under the same name, so those can be cached. */
    const isCode = [".html", ".css", ".js", ".json", ".txt"].includes(ext);

    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": isCode
        ? "no-cache, must-revalidate"
        : "public, max-age=3600"
    }).end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`REALM is live on port ${PORT}`);
  // posts every new mint to Telegram; sleeps unless its variables are set
  require("./bot").start({ root: ROOT, rpc, holdings, env: ENV });
});
