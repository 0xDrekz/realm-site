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
  // the key alone, or the whole Helius RPC URL pasted in (the key is taken from its api-key=)
  key:   (((process.env.HELIUS_KEY || "").match(/api-key=([A-Za-z0-9-]+)/) || [])[1] || (process.env.HELIUS_KEY || "")).trim(),
  col:   process.env.COLLECTION || "",
  mint:  process.env.TOKEN_MINT || ((() => { try { return (require("fs").readFileSync(require("path").join(__dirname, "data.js"), "utf8").match(/tokenMint:\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/) || [])[1] || ""; } catch { return ""; } })())
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

function rpc(method, params, url) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: "realm", method, params });
    const r = https.request(
      url || `https://mainnet.helius-rpc.com/?api-key=${ENV.key}`,
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

/* Every REALM being, read straight from the chain over the free public RPC
   (Metaplex Core assets in the collection), with each one's number, tier and
   being name from map-data.json. Shared by the map, the leaderboard and the
   wallet checker; read at most once a minute. */
const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
/* Helius first when its key is set, the public RPC if it is missing or refuses */
async function rpcBest(method, params) {
  if (ENV.key) { try { return await rpc(method, params); } catch { /* fall back */ } }
  return rpc(method, params, PUBLIC_RPC);
}
const COLLECTION_ADDR = () => ENV.col || (readConfig().collectionAddress || "");
let MAPDATA = null;
function readConfig() {
  try { return { collectionAddress: (fs.readFileSync(path.join(ROOT, "data.js"), "utf8").match(/collectionAddress:\s*"([^"]*)"/) || [])[1] || "" }; }
  catch { return {}; }
}
let chainCache = null, chainAt = 0, chainBusy = null;
async function chainBeings() {
  if (chainCache && Date.now() - chainAt < (ENV.key ? 10_000 : 60_000)) return chainCache;
  chainBusy = chainBusy || (async () => {
    if (!MAPDATA) MAPDATA = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
    const assets = await require("./bot")._chain.collectionAssets(COLLECTION_ADDR());
    const out = assets.map(a => {
      const n = Number((a.name.match(/#(\d+)/) || [])[1] || 0);
      const md = MAPDATA[n - 1] || [];
      return { n, id: a.id, owner: a.owner, name: a.name, uri: a.uri, tier: md[0] || "", being: md[1] || "" };
    }).filter(b => b.n);
    chainCache = out; chainAt = Date.now(); return out;
  })().finally(() => { chainBusy = null; });
  return chainBusy;
}
async function tokensOf(address) {
  if (!ENV.mint) return 0;
  const res = await rpcBest("getTokenAccountsByOwner", [address, { mint: ENV.mint }, { encoding: "jsonParsed" }]);
  let tokens = 0;
  for (const acc of (res && res.value) || []) { const t = acc.account.data.parsed.info.tokenAmount; tokens += Math.floor(Number(t.amount) / 10 ** Number(t.decimals)); }
  return tokens;
}

/* a being's picture link, read from its metadata once and kept: it never changes */
const imageOf = new Map();
async function holdings(address) {
  const all = await chainBeings();
  const mine = all.filter(b => b.owner === address);
  const beings = await Promise.all(mine.map(async b => {
    let image = imageOf.get(b.uri) || "";
    if (!image) { try { image = (await (await fetch(b.uri, { redirect: "follow" })).json()).image || ""; if (image) imageOf.set(b.uri, image); } catch {} }
    return { n: b.n, id: b.id, tier: b.tier, name: b.name, being: b.being, image };
  }));
  // where this wallet stands: holders ranked by weight, ties share a place
  const w = new Map();
  for (const b of all) if (b.tier) w.set(b.owner, (w.get(b.owner) || 0) + (WEIGHTS[b.tier] || 0));
  const mineW = w.get(address) || 0;
  const rank = mineW ? 1 + [...w.values()].filter(x => x > mineW).length : null;
  return { beings, tokens: await tokensOf(address).catch(() => 0),
           rank, holders: w.size, minted: all.filter(b => b.tier).length };
}

async function holdingsHelius(address) {
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
const BOARD_MS = 20_000;

async function holders() {
  const owners = new Map();
  let minted = 0;
  for (const x of await chainBeings()) {
    if (!x.tier) continue;
    minted++;
    const o = owners.get(x.owner) || { owner: x.owner, weight: 0, beings: 0, tiers: {} };
    o.weight += WEIGHTS[x.tier] || 0; o.beings += 1; o.tiers[x.tier] = (o.tiers[x.tier] || 0) + 1;
    owners.set(x.owner, o);
  }
  const list = [...owners.values()].sort((a, b) => b.weight - a.weight);
  // token balances only for the top of the board: one call each
  if (ENV.mint) {
    for (const o of list.slice(0, 25)) {
      try {
        const res = await rpcBest("getTokenAccountsByOwner",
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
const STATS_MS = 15_000;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10_000, headers: { "Accept": "application/json" } }, resp => {
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("bad json")); } });
    }).on("timeout", function () { this.destroy(new Error("timeout")); }).on("error", reject);
  });
}

/* The rewards wallet, read out of data.js so the address lives in one
   place. Its balance is public on the chain; the site shows it so anybody
   can watch the pool fill rather than take the number on trust. */
const REWARDS = ((require("fs").readFileSync(path.join(ROOT, "data.js"), "utf8")
  .match(/rewardsWallet:\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/) || [])[1]) || "";

/* the candy machine REALM sells from. How many it has minted is a u64 at
   byte 104 of its account, so the public RPC can count it: no paid API needed. */
const MACHINE = process.env.CANDY_MACHINE || "5qG2B6RssAkpsg3KLJTbgLTbQUc6B6HBroPDh8UoCbd7";
async function mintedFromMachine() {
  const r = await rpcBest("getAccountInfo", [MACHINE, { encoding: "base64", dataSlice: { offset: 104, length: 8 } }]);
  const b = Buffer.from(r.value.data[0], "base64");
  return Number(b.readBigUInt64LE(0));
}

async function readStats() {
  let minted = null;
  try { minted = await mintedFromMachine(); } catch { /* unknown, not zero */ }
  if (minted === null && ENV.key && ENV.col) {
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
  let rewards = null;
  if (REWARDS) {
    try {
      const r = await rpcBest("getBalance", [REWARDS]);
      rewards = { address: REWARDS, sol: Math.round((r.value / 1e9) * 100) / 100 };
    } catch { /* unknown, not zero */ }
  }
  return { minted, dmt, rewards, token: ENV.mint || null, at: Date.now() };
}

/* ---- the map ----
   Every minted being as [token number, owner, asset id], read once every
   five minutes for everybody. The number comes out of the name ("REALM #17"),
   which is how the map finds the being's picture and traits in map-data.json. */
let mapData = null, mapAt = 0, mapBusy = null;
const MAP_MS = 8_000;      // the chain read underneath is shared and cached a minute

async function readMap() {
  const beings = (await chainBeings()).map(b => [b.n, b.owner, b.id]);
  return { ready: true, beings, at: Date.now() };
}

/* ---- the snapshot at mint-out, and the holder payout (payout.js) ---- */
const PAYOUT = (() => {
  const bot = require("./bot"), D = bot.readData(ROOT);
  const multFor = bal => D.TOKEN_BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);
  return require("./payout").create({
    root: ROOT, rpc: rpcBest, envVar: bot.envVar, notify: bot.notify,
    totalBeings: D.TOTAL_BEINGS, price: D.POOL_FULL / D.TOTAL_BEINGS, poolPercent: 100,
    minted: () => bot._chain.mintedCount(MACHINE),
    snapshotFrom: () => {
      if (!MAPDATA) MAPDATA = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
      return { rpc: rpcBest, collection: COLLECTION_ADDR(), tokenMint: ENV.mint,
        assets: () => bot._chain.collectionAssets(COLLECTION_ADDR()),
        tierOf: n => (MAPDATA[n - 1] || [])[0] || "", weightOf: t => WEIGHTS[t] || 0, multFor };
    }
  });
})();

/* ---- the 5-mint bonus: the first wallets to mint 5 are sent $DMT (bonus.js) ---- */
const BONUS = (() => {
  const bot = require("./bot");
  return require("./bonus").create({
    rpc: rpcBest, envVar: bot.envVar, notify: bot.notify, machine: MACHINE, mint: ENV.mint,
    // the team's own wallets never qualify (more can be added with BONUS_EXCLUDE)
    exclude: ["BC5CV6ivBkWW2wL5YMsZovoYXBreM8mgdfL2cSjC45M2", REWARDS,
      "6jaCuULZVctfttpZPipTUVBmGLKr1zQKLYnmbMC3yDfh", "DpJ2kAsjYsJUaiTS9qa4mtozFjCUWbAUv7hLPcDuWfcP",
      "BWu9qgbyaHvL8mUqmXX7ZzQUH5bteFjpYV8zg6VWwGw", "CfH8ApJCzT88LaKUDHsSy5MbF9Sk7cKPVCaT4u5Pj369"].filter(Boolean)
  });
})();

/* ---- REALM Duels ---- */
const DUELS = require("./duels").create({ root: ROOT, beings: chainBeings, envVar: require("./bot").envVar,
  tokensOf, bands: require("./bot").readData(ROOT).TOKEN_BANDS });
/* Wallet sign-in for Duels: the page asks for a one-time message, the wallet
   signs it (a signature, not a transaction: nothing is sent or spent), and the
   server checks the signature against the address. A signed-in wallet gets a
   session for a day; only a signed-in wallet plays as itself or reaches the board. */
const SESS = require("./session").create({ dir: require("./bot").envVar("SNAPSHOT_DIR") || path.join(ROOT, "snapshot-data"),
  domain: require("./bot").envVar("PUBLIC_DOMAIN") || "dmt-realm.dev", log: m => console.log(m) });
const duelNonce = a => SESS.nonce(a), duelVerify = j => SESS.verify(j), duelWalletOf = t => SESS.walletOf(t);
/* a token travels in the Authorization header on GETs (never in a URL, where it ends up in logs) */
const bearer = req => { const m = /^Bearer\s+([0-9a-f]{16,128})$/i.exec(req.headers.authorization || ""); return m ? m[1] : null; };
/* per-caller limits; a full table drops its oldest callers, never all of them */
function limiter(max, perMin) {
  const hits = new Map();
  return key => {
    const now = Date.now(), w = (hits.get(key) || []).filter(t => now - t < 60_000); w.push(now);
    hits.delete(key); hits.set(key, w);
    while (hits.size > max) hits.delete(hits.keys().next().value);
    return w.length <= perMin;
  };
}
const signinAllowed = limiter(5000, 10);
const duelAllowed = limiter(5000, 10);     // ten new runs a minute per caller is plenty for a person

/* the card battler (tcg2/game.js): matches live here; the page only sends moves */
const TCG = require("./tcg2/game").create({ log: m => console.log(m), beings: chainBeings, boostOf: w => DUELS.boostOf(w),
  walletOf: duelWalletOf, dir: require("./bot").envVar("SNAPSHOT_DIR") || path.join(ROOT, "snapshot-data") });
const ARENA = require("./arena/game").create({ log: m => console.log(m), beings: chainBeings, boostOf: w => DUELS.boostOf(w), walletOf: duelWalletOf,
  dir: require("./bot").envVar("SNAPSHOT_DIR") || path.join(ROOT, "snapshot-data") });
/* BREAKTHROUGH (bt/game.js): the trait card game; the page plays, the server replays every run */
const BT = require("./bt/game").create({ log: m => console.log(m), beings: chainBeings, walletOf: duelWalletOf,
  announce: (html, links) => require("./bot").postHtml(html, links),
  dir: require("./bot").envVar("SNAPSHOT_DIR") || path.join(ROOT, "snapshot-data") });
/* REALM Cards (rc/game.js): the card game against the computer; every move checked here */
const RC = require("./rc/game").create({ log: m => console.log(m), beings: chainBeings, boostOf: w => DUELS.boostOf(w), walletOf: duelWalletOf,
  dir: require("./bot").envVar("SNAPSHOT_DIR") || path.join(ROOT, "snapshot-data") });
let RC_POOL = null;
const tcgMoves = limiter(10000, 300), tcgMatches = limiter(10000, 20);   // 300 moves and 20 new matches a minute per caller
const tcgAllowed = (ip, kind) => kind === "move" ? tcgMoves(ip) : tcgMatches(ip + kind);

/* the last 120 pictures fetched, so a busy wallet page costs one fetch each */
const IMGS = new Map();

/* the mint page polls while a mint lands: generous, but not a free RPC */
const rpcHits = new Map();
function rpcAllowed(ip) {
  const now = Date.now(), w = rpcHits.get(ip) || [];
  const recent = w.filter(t => now - t < 60_000); recent.push(now); rpcHits.set(ip, recent);
  if (rpcHits.size > 5000) rpcHits.clear();
  return recent.length <= 240;
}

/* Every JSON POST comes through here. The body must parse to a plain object (null, arrays,
   strings and numbers are refused with 400), and the handler runs inside try/catch, so a
   bad request can never throw out of an event callback and take the whole server down. */
function readJson(req, send, limit, handler, { allowArray = false } = {}) {
  let body = "", dead = false;
  req.on("data", c => { if (dead) return; body += c; if (body.length > limit) { dead = true; send(413, { error: "Too large." }); req.destroy(); } });
  req.on("end", () => {
    if (dead) return;
    let j; try { j = JSON.parse(body || "{}"); } catch { return send(400, { error: "Bad request." }); }
    const ok = j && typeof j === "object" && (allowArray ? true : !Array.isArray(j));
    if (!ok) return send(400, { error: "Bad request." });
    try {
      const r = handler(j);
      if (r && typeof r.then === "function") r.catch(e => { console.error("handler", req.url, e); send(500, { error: "Something went wrong." }); });
    } catch (e) { console.error("handler", req.url, e); send(500, { error: "Something went wrong." }); }
  });
  req.on("error", () => { dead = true; });
}
/* a reply that is safe to call twice: the second call is ignored */
function replier(res) {
  return (code, obj) => { if (res.headersSent || res.writableEnded) return; res.writeHead(code, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(obj)); };
}

let CODEX = null;
const server = http.createServer((req, res) => {
  try { route(req, res); }
  catch (e) { console.error("route", req.url, e); if (!res.headersSent) res.writeHead(500).end(); }
});
function route(req, res) {
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
  if (urlPath === "/left" || urlPath === "/tracker") urlPath = "/left.html";
  if (urlPath === "/breakthrough" || urlPath === "/bt") urlPath = "/bt.html";
  if (urlPath === "/league") urlPath = "/league.html";
  if (urlPath === "/map") urlPath = "/map.html";
  if (urlPath === "/mint") urlPath = "/mint.html";
  if (urlPath === "/owner") urlPath = "/owner.html";
  if (urlPath === "/wallet") urlPath = "/wallet.html";
  if (urlPath === "/payout") urlPath = "/payout.html";
  // one game: /duels is the Arena. The card games are kept in the code but put away for now
  if (urlPath === "/duels" || urlPath === "/arena") urlPath = "/arena.html";
  if (urlPath === "/battler" || urlPath === "/duels-classic" || urlPath === "/cards") { res.writeHead(302, { Location: "/duels" }).end(); return; }
  if (urlPath === "/codex") urlPath = "/codex.html";
  if (urlPath === "/duels-beta" || urlPath === "/duels-beta.html" || urlPath === "/rc.html" || urlPath === "/duels.html") { res.writeHead(302, { Location: "/duels" }).end(); return; }
  // the saved snapshot is served through /api/snapshot only, after its hash is checked. Checked on the
  // normalised path (so //snapshot-data/, /./snapshot-data/ and the like are caught) and again on disk below.
  if (path.posix.normalize(urlPath.replace(/\\/g, "/")).replace(/^\/+/, "/").toLowerCase().startsWith("/snapshot-data")) { res.writeHead(404).end(); return; }

  /* ---- the mint page's line to Solana ----
     The page in the visitor's browser reads the candy machine and sends the
     transactions their wallet has signed. It goes through here so it can use
     the paid RPC (whose key stays in Railway) instead of the public one, which
     turns browsers away. Only the calls minting needs are let through. */
  if (urlPath === "/api/rpc" && req.method === "POST") {
    const ALLOW = new Set(["getAccountInfo", "getMultipleAccounts", "getLatestBlockhash", "sendTransaction",
      "getSignatureStatuses", "getBalance", "getMinimumBalanceForRentExemption", "simulateTransaction", "getSlot", "getBlockHeight",
      "isBlockhashValid", "getEpochInfo"]);
    const sendR = replier(res);
    readJson(req, sendR, 200_000, j => {
      const body = JSON.stringify(j);
      const calls = Array.isArray(j) ? j : [j];
      if (!calls.length || calls.length > 20 || calls.some(c => !c || !ALLOW.has(c.method))) return res.writeHead(403).end();
      const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
      if (!rpcAllowed(ip)) return res.writeHead(429).end();
      // ?net=devnet is the rehearsal on Solana's free test network
      const target = /[?&]net=devnet\b/.test(req.url) ? "https://api.devnet.solana.com"
        : ENV.key ? `https://mainnet.helius-rpc.com/?api-key=${ENV.key}` : "https://api.mainnet-beta.solana.com";
      // if the paid RPC turns us away (a bad or missing key), fall back to the public one
      const PUBLIC = /[?&]net=devnet\b/.test(req.url) ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
      const go = (url, retry) => {
        const out = https.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 20_000 },
          r => {
            if (retry && (r.statusCode === 401 || r.statusCode === 403 || r.statusCode === 429)) { r.resume(); return go(PUBLIC, false); }
            res.writeHead(r.statusCode || 502, { "Content-Type": "application/json", "Cache-Control": "no-store" }); r.pipe(res);
          });
        out.on("timeout", () => out.destroy()).on("error", () => { if (retry) return go(PUBLIC, false); if (!res.headersSent) res.writeHead(502).end(); });
        out.end(body);
      };
      go(target, target !== PUBLIC);
    }, { allowArray: true });
    return;
  }

  if (urlPath === "/api/map") {
    const send = (code, obj) => res.writeHead(code, {
      "Content-Type": TYPES[".json"], "Cache-Control": "no-store"
    }).end(JSON.stringify(obj));
    if (!COLLECTION_ADDR()) return send(503, { ready: false });
    if (mapData && Date.now() - mapAt < MAP_MS) return send(200, mapData);
    mapBusy = mapBusy || readMap()
      .then(d => { mapData = d; mapAt = Date.now(); return d; })
      .finally(() => { mapBusy = null; });
    mapBusy.then(d => send(200, d))
           .catch(() => mapData ? send(200, mapData) : send(502, { error: "Could not read the chain just now." }));
    return;
  }

  if (urlPath === "/api/holders") {
    const send = (code, obj) => res.writeHead(code, {
      "Content-Type": TYPES[".json"], "Cache-Control": "no-store"
    }).end(JSON.stringify(obj));
    if (!COLLECTION_ADDR()) return send(503, { ready: false });
    if (board && Date.now() - boardAt < BOARD_MS) return send(200, board);
    boardBusy = boardBusy || holders()
      .then(d => { board = d; boardAt = Date.now(); return d; })
      .finally(() => { boardBusy = null; });
    boardBusy.then(d => send(200, d))
             .catch(() => board ? send(200, board) : send(502, { error: "Could not read the chain just now." }));
    return;
  }

  /* what's left: every tier's count still unminted, and which of the rarest beings have been found */
  if (urlPath === "/api/left") {
    const send = replier(res);
    if (!COLLECTION_ADDR()) return send(503, { ready: false });
    chainBeings().then(all => {
      if (!MAPDATA) MAPDATA = JSON.parse(fs.readFileSync(path.join(ROOT, "map-data.json"))).beings;
      const minted = new Set(all.map(b => b.n));
      const D = require("./bot").readData(ROOT);
      const tiers = D.TIERS.map(t => {
        const got = all.filter(b => b.tier === t.name).length;
        return { name: t.name, weight: t.weight, total: t.count, minted: got, left: t.count - got, color: t.color };
      });
      const rare = [];
      MAPDATA.forEach(([tier, being], i) => { if (tier === "God" || tier === "Entity" || tier === "Source") rare.push({ n: i + 1, tier, name: being || tier + " #" + (i + 1), minted: minted.has(i + 1) }); });
      send(200, { at: Date.now(), total: D.TOTAL_BEINGS, minted: minted.size, left: D.TOTAL_BEINGS - minted.size, tiers, rare });
    }).catch(() => send(502, { error: "Could not read the chain just now." }));
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

  /* does the Helius key in Railway work? Says yes or no, never shows the key */
  if (urlPath === "/api/helius-check") {
    const send = o => res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(o));
    if (!ENV.key) return send({ helius: "not set" });
    rpc("getSlot", []).then(slot => send({ helius: "works", slot }))
      .catch(e => send({ helius: "rejected", reason: String(e.message || e).replace(ENV.key, "…").slice(0, 120) }));
    return;
  }

  if (urlPath === "/api/bot-announce") {
    const id = new URL(req.url, "http://x").searchParams.get("asset") || "";
    if (!ADDRESS.test(id)) return res.writeHead(400).end();
    require("./bot").announce(ROOT, id)
      .then(r => res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(r, null, 2)))
      .catch(e => res.writeHead(502, { "Content-Type": TYPES[".json"] }).end(JSON.stringify({ ok: false, problem: e.message })));
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

  /* ---- the snapshot and the payout, for anyone to check ---- */
  if (urlPath === "/api/snapshot") {
    const snap = PAYOUT.snapshot();
    if (!snap) return res.writeHead(404, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify({ ready: false }));
    return res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="realm-snapshot.json"' }).end(JSON.stringify(snap, null, 1));
  }
  if (urlPath === "/api/payout") {
    const a = new URL(req.url, "http://x").searchParams.get("address") || "";
    if (a && !ADDRESS.test(a)) return res.writeHead(400).end();
    PAYOUT.status(a || null)
      .then(d => res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(d)))
      .catch(() => res.writeHead(502, { "Content-Type": TYPES[".json"] }).end(JSON.stringify({ error: "Could not read the payout just now." })));
    return;
  }

  /* ---- REALM Arena: the page plays, the server replays and decides ---- */
  if (urlPath.startsWith("/api/arena/")) {
    const send = replier(res);
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (urlPath === "/api/arena/board") return send(200, ARENA.board({ token: bearer(req) }));
    const fn = { "/api/arena/start": ARENA.start, "/api/arena/finish": ARENA.finish, "/api/arena/me": ARENA.me }[urlPath];
    if (!fn) return send(404, { error: "Not found." });
    if (req.method !== "POST") return send(405, { error: "POST" });
    readJson(req, send, 40000, j => {
      if (!tcgAllowed(ip, urlPath === "/api/arena/me" ? "move" : "arena")) return send(429, { error: "Too fast. Take a breath and try again in a minute." });
      Promise.resolve().then(() => fn({ ...j, ip })).then(d => send(d.status || (d.error ? 400 : 200), d))
        .catch(e => { console.error("arena", e); send(500, { error: "Something went wrong. Start a new match." }); });
    });
    return;
  }

  /* ---- BREAKTHROUGH: the page plays, the server replays the moves and decides ---- */
  if (urlPath.startsWith("/api/bt/")) {
    const send = replier(res);
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (urlPath === "/api/bt/cards") {
      const c = BT.cards(), gz = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "public, max-age=600", "Vary": "Accept-Encoding", ...(gz ? { "Content-Encoding": "gzip" } : {}) });
      return res.end(gz ? c.gz : c.json);
    }
    if (urlPath === "/api/bt/league") return send(200, BT.league({ token: bearer(req) }));
    if (urlPath === "/api/bt/board") { const pid = new URL(req.url, "http://x").searchParams.get("pid"); return send(200, BT.board({ token: bearer(req), pid })); }
    if (urlPath === "/api/bt/summons") { BT.summonable().then(d => send(200, d)).catch(() => send(503, { error: "Couldn't read the chain just now." })); return; }
    const fn = { "/api/bt/start": BT.start, "/api/bt/finish": BT.finish, "/api/bt/me": BT.me }[urlPath];
    if (!fn) return send(404, { error: "Not found." });
    if (req.method !== "POST") return send(405, { error: "POST" });
    readJson(req, send, 40000, j => {
      if (!tcgAllowed(ip, urlPath === "/api/bt/start" ? "bt" : "move")) return send(429, { error: "Too fast. Take a breath and try again in a minute." });
      Promise.resolve().then(() => fn({ ...j, ip })).then(d => send(d.status || (d.error ? 400 : 200), d))
        .catch(e => { console.error("breakthrough", e); send(500, { error: "Something went wrong. Start a new run." }); });
    });
    return;
  }

  /* ---- the card battler: every move checked, every result decided here ---- */
  if (urlPath.startsWith("/api/tcg/")) {
    const send = replier(res);
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (urlPath === "/api/tcg/map") return send(200, TCG.map());
    if (urlPath === "/api/tcg/board") return send(200, TCG.board({ token: bearer(req) }));
    if (req.method !== "POST") return send(405, { error: "POST" });
    readJson(req, send, 4000, j => {
      const kind = urlPath === "/api/tcg/act" || urlPath === "/api/tcg/view" || urlPath === "/api/tcg/hint" ? "move" : "match";
      if (!tcgAllowed(ip, kind)) return send(429, { error: "Too fast. Take a breath and try again in a minute." });
      const fn = { "/api/tcg/deal": TCG.deal, "/api/tcg/start": TCG.start, "/api/tcg/act": TCG.act, "/api/tcg/view": TCG.view, "/api/tcg/hint": TCG.hint, "/api/tcg/team": TCG.team }[urlPath];
      if (!fn) return send(404, { error: "Not found." });
      Promise.resolve().then(() => fn({ ...j, ip }))
        .then(d => send(d.status || (d.error ? 400 : 200), d))
        .catch(e => { console.error("tcg", e); send(500, { error: "Something went wrong. Start a new match." }); });
    });
    return;
  }

  /* ---- REALM Cards: every move checked, every result decided here ---- */
  if (urlPath.startsWith("/api/rc/")) {
    const send = replier(res);
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (urlPath === "/api/rc/cards") {
      if (!RC_POOL) { const json = Buffer.from(JSON.stringify(RC.pool())); RC_POOL = { json, gz: require("zlib").gzipSync(json) }; }
      const gz = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "public, max-age=600", "Vary": "Accept-Encoding", ...(gz ? { "Content-Encoding": "gzip" } : {}) });
      return res.end(gz ? RC_POOL.gz : RC_POOL.json);
    }
    if (req.method !== "POST") return send(405, { error: "POST" });
    readJson(req, send, 4000, j => {
      const kind = urlPath === "/api/rc/start" || urlPath === "/api/rc/build" ? "rc" : "move";
      if (!tcgAllowed(ip, kind)) return send(429, { error: "Too fast. Take a breath and try again in a minute." });
      const fn = { "/api/rc/start": RC.start, "/api/rc/act": RC.act, "/api/rc/view": RC.view, "/api/rc/hint": RC.hint, "/api/rc/build": RC.build, "/api/rc/me": RC.me }[urlPath];
      if (!fn) return send(404, { error: "Not found." });
      Promise.resolve().then(() => fn({ ...j, ip }))
        .then(d => send(d.status || (d.error ? 400 : 200), d))
        .catch(e => { console.error("rc", e); send(500, { error: "Something went wrong. Start a new match." }); });
    });
    return;
  }

  /* ---- REALM Duels (duels.js): every result decided here ---- */
  if (urlPath.startsWith("/api/duel/")) {
    const send = replier(res);
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    const q = new URL(req.url, "http://x").searchParams;
    if (urlPath === "/api/duel/board") return send(200, { week: DUELS.week(), top: DUELS.top() });
    if (urlPath === "/api/duel/cards") {
      const a = duelWalletOf(bearer(req));
      if (!a) return send(401, { error: "Connect your wallet first." });
      if (!allowed(ip)) return send(429, { error: "Too many checks. Wait a minute." });
      Promise.all([chainBeings(), DUELS.boostOf(a)]).then(([all, boost]) => send(200, { boost,
        cards: all.filter(b => b.owner === a).map(b => DUELS.card(b.n, boost.boost)).map(c => boost.boost > 1 ? { ...c, boost: Math.round((boost.boost - 1) * 100) } : c).sort((x, y) => y.total - x.total) }))
        .catch(() => send(502, { error: "Could not read the realm just now." }));
      return;
    }
    if (req.method !== "POST") return send(405, { error: "POST" });
    readJson(req, send, 4000, j => {
      if (urlPath === "/api/duel/nonce") {
        if (!duelAllowed(ip)) return send(429, { error: "Too many tries. Wait a minute." });
        if (!ADDRESS.test(j.wallet || "")) return send(400, { error: "That is not a Solana address." });
        return send(200, duelNonce(j.wallet));
      }
      if (urlPath === "/api/duel/signin") {
        if (!signinAllowed(ip)) return send(429, { error: "Too many tries. Wait a minute." });
        const v = duelVerify(j);
        return v ? send(200, v) : send(401, { error: "The signature did not check out. Connect and try again." });
      }
      if (urlPath === "/api/duel/start") {
        if (!duelAllowed(ip)) return send(429, { error: "Too many runs. Take a breath and try again in a minute." });
        // a wallet plays as itself only when signed in; a pasted address is never trusted
        let wallet = null;
        if (j.token) { wallet = duelWalletOf(j.token); if (!wallet) return send(401, { error: "Your sign-in has expired. Connect your wallet again." }); }
        return DUELS.start({ wallet }).then(d => send(d.error ? 400 : 200, d)).catch(() => send(502, { error: "Could not read the realm just now." }));
      }
      if (urlPath === "/api/duel/signout") { SESS.end(typeof j.token === "string" ? j.token : ""); return send(200, { ok: true }); }
      if (urlPath === "/api/duel/play") { const d = DUELS.play(j); return send(d.error ? 400 : 200, d); }
      send(404, { error: "Not found." });
    });
    return;
  }

  /* ---- the Card Codex: every being's card, worked out once ---- */
  if (urlPath === "/api/codex") {
    if (!CODEX) {
      const C = require("./tcg2/cards");
      const list = C.all().map(c => ({ n: c.n, name: c.name, being: c.being || null, tier: c.tier, cost: c.cost, essence: c.essence,
        power: c.power, health: c.health, kw: c.kw, text: c.text, legendary: c.legendary, unique: c.uniqueName || null, stats: c.stats,
        traits: Object.fromEntries(Object.entries(c.traits).filter(([, v]) => v && v !== "None")) }));
      const json = Buffer.from(JSON.stringify({ v: 1, cards: list }));
      CODEX = { json, gz: require("zlib").gzipSync(json) };
    }
    const gz = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "public, max-age=600", "Vary": "Accept-Encoding", ...(gz ? { "Content-Encoding": "gzip" } : {}) });
    return res.end(gz ? CODEX.gz : CODEX.json);
  }

  if (urlPath === "/api/bonus") {
    return res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(BONUS.status()));
  }

  /* ---- being pictures, served from our own address ----
     The Arweave gateway redirects to CDN hosts some browsers, blockers and
     mobile networks refuse, so the pictures come through here instead. An
     Arweave id never changes what it points to, so it can be cached forever. */
  const img = urlPath.match(/^\/img\/([A-Za-z0-9_-]{43,44})$/);
  if (img) {
    const id = img[1], hit = IMGS.get(id);
    const send = (buf, type) => res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" }).end(buf);
    if (hit) return send(hit.buf, hit.type);
    (async () => {
      for (const base of ["https://gateway.irys.xyz/", "https://arweave.net/"]) {
        try {
          const r = await fetch(base + id, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
          const type = r.headers.get("content-type") || "";
          if (!r.ok || !/^image\//.test(type)) continue;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 3_000_000) continue;
          IMGS.set(id, { buf, type }); if (IMGS.size > 120) IMGS.delete(IMGS.keys().next().value);
          return send(buf, type);
        } catch { /* try the next gateway */ }
      }
      res.writeHead(502).end();
    })();
    return;
  }

  /* ---- the checker ---- */
  if (urlPath === "/api/holdings") {
    const send = (code, obj) => res.writeHead(code, {
      "Content-Type": TYPES[".json"], "Cache-Control": "no-store"
    }).end(JSON.stringify(obj));

    const address = new URL(req.url, "http://x").searchParams.get("address") || "";

    if (!COLLECTION_ADDR()) return send(503, { ready: false });
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
  const SNAPDIR = path.join(ROOT, "snapshot-data");
  if (filePath === SNAPDIR || filePath.startsWith(SNAPDIR + path.sep) || /(^|[\\/])\.(env|git)/.test(urlPath)) { res.writeHead(404).end(); return; }
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
}

/* a last line of defence: log anything that slips through and keep serving (the mint page lives here too) */
process.on("uncaughtException", e => console.error("uncaught", e));
/* on a redeploy Railway sends SIGTERM: save what's in memory, then go */
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { for (const f of [() => SESS.flush(), () => TCG.flush(), () => DUELS.flush(), () => RC.flush(), () => ARENA.flush(), () => BT.flush()]) { try { f(); } catch (e) { console.error("flush", e); } } process.exit(0); });
process.on("unhandledRejection", e => console.error("unhandled rejection", e));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`REALM is live on port ${PORT}`);
  // posts every new mint to Telegram; sleeps unless its variables are set
  require("./bot").start({ root: ROOT, rpc, holdings, env: ENV });
  PAYOUT.start();
  BONUS.start();
});
