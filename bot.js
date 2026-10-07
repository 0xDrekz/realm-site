/* ============================================================
   REALM — the mint bot.

   Every time a being is minted, it is posted to Telegram: the picture,
   who minted it, how many beings and how much $DMT that wallet holds,
   and what its share of the pool would come to at a full mint.

   It runs inside server.js, so there is nothing else to host. It stays
   asleep unless all four are set in Railway's variables:
     HELIUS_KEY, COLLECTION     (already used by the holders page)
     TG_BOT_TOKEN               from @BotFather
     TG_CHAT_ID                 the group or channel to post in

   How it notices a mint. Every POLL_MS it asks for the newest beings in
   the collection and posts any it has not seen. On start it learns
   every being that already exists without posting them, so a restart
   or a deploy never floods the group with old mints. The cost of that:
   a being minted while the server was restarting is not announced.

   The numbers come from data.js, read once at start, so the bot and the
   holders page can never disagree.
   ============================================================ */

const fs    = require("fs");
const path  = require("path");
const vm    = require("vm");
const https = require("https");

const POLL_MS = 6_000;         // how often to look for new mints (cheap: one small read)
const SEND_GAP_MS = 3_500;     // Telegram allows about 20 posts a minute in a group

/* the numbers, out of data.js */
function readData(root) {
  const src = fs.readFileSync(path.join(root, "data.js"), "utf8");
  return vm.runInNewContext(src + "\n;({ TIERS, TOKEN_BANDS, TOKEN_NAME, TOTAL_BEINGS, TOTAL_WEIGHT, POOL_FULL, poolFrom, CONFIG, beingLink });");
}

/* the same three figures as holders.js: low, typical, high */
function range(D, w, m) {
  const W = D.TOTAL_WEIGHT, POOL = D.POOL_FULL;
  const MAXM = D.TOKEN_BANDS[D.TOKEN_BANDS.length - 1].mult;
  w = Math.min(w, W);
  if (!w) return { low: 0, typ: 0, high: 0 };
  const mine = w * m, rest = W - w;
  return {
    low:  POOL * mine / (mine + rest * MAXM),
    typ:  POOL * w / W,
    high: POOL * mine / (mine + rest)
  };
}

const multFor = (D, bal) => D.TOKEN_BANDS.reduce((m, b) => bal >= b.hold ? b.mult : m, 1);
const fmt = n => Math.round(n).toLocaleString("en-GB");
const sol = n => n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);
const short = a => a.slice(0, 4) + "…" + a.slice(-4);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const left = n => n <= 0 ? "the realm is full" : n === 1 ? "1 remains" : `${fmt(n)} remain`;

/* ten blocks filling as the realm does */
function bar(n, total) {
  const k = Math.min(10, Math.floor(10 * n / total));
  return "▰".repeat(k) + "▱".repeat(10 - k);
}

/* the post itself; kept apart so it can be tried without a chain or a bot */
const DOT = { Common: "⚪", Uncommon: "🟢", Rare: "🔵", Epic: "🟣", Legendary: "🟠",
              Mythic: "🔴", Entity: "🩵", God: "🟡", Source: "✨" };

/* the wallet's beings, rarest first: "🟡 1 God" */
function holdingLines(D, tiers) {
  return D.TIERS.slice().reverse()
    .filter(t => tiers[t.name])
    .map(t => `   ${DOT[t.name] || "•"} ${fmt(tiers[t.name])} ${t.name}`);
}

/* One total for the wallet: its beings and its $DMT together. What the
   token is worth depends on everybody else's, so the total is worked out
   against "field": the multiplied weight of every other holder right now,
   with beings not yet minted counted at 1x. Without it (the chain did not
   answer) the field is assumed to match this wallet's band, which gives the
   beings' reward alone. */
/* rarity rank by number (rarity.json, made by tools/rarity.py) */
let RANKS = null;
function rankOf(name) {
  if (!RANKS) { try { RANKS = JSON.parse(fs.readFileSync(path.join(__dirname, "rarity.json"), "utf8")); } catch { RANKS = {}; } }
  return RANKS[(String(name).match(/#(\d+)/) || [])[1]] || null;
}

function caption(D, { name, tier, owner, tiers, tokens, minted, field }) {
  const count = Object.values(tiers).reduce((a, n) => a + n, 0);
  const weight = D.TIERS.reduce((a, t) => a + t.weight * (tiers[t.name] || 0), 0);
  const m = multFor(D, tokens);
  const mine = weight * m;
  const others = field == null ? (D.TOTAL_WEIGHT - weight) * m : field;
  const total = mine ? D.POOL_FULL * mine / (mine + others) : 0;
  const t = D.TIERS.find(x => x.name === tier);
  return [
    `🌀 <b>A being has crossed</b>`,
    `${bar(minted, D.TOTAL_BEINGS)}  <b>${fmt(minted)} / ${fmt(D.TOTAL_BEINGS)}</b> minted  ·  ${left(D.TOTAL_BEINGS - minted)}`,
    ``,
    `<b>${esc(name)}</b>  ·  ${esc(tier)}${t ? ` (weight ${t.weight})` : ""}${rankOf(name) ? `  ·  Rank #${fmt(rankOf(name))} of ${fmt(D.TOTAL_BEINGS)}` : ""}`,
    `Minted by <a href="https://dmt-realm.dev/wallet?a=${esc(owner)}">${esc(short(owner))}</a>`,
    ``,
    `Beings held: <b>${fmt(count)}</b>  ·  weight ${fmt(weight)}`,
    ...holdingLines(D, tiers),
    ``,
    `${esc(D.TOKEN_NAME)} held: <b>${fmt(tokens)}</b>  ·  ${m}×`,
    ``,
    `💰 Total at full mint: <b>${sol(total)} SOL</b>`,
    `<i>beings + ${esc(D.TOKEN_NAME)} together, worked out from what every holder holds right now</i>`,
    `Pool so far: ${sol(D.poolFrom(minted))} SOL`,
    ``,
    `<i>Paid once, when all ${fmt(D.TOTAL_BEINGS)} are minted. Moves as holders buy or sell ${esc(D.TOKEN_NAME)}.</i>`
  ].join("\n");
}

/* The buttons under every mint post. "Mint now" goes to the launchpad once
   CONFIG.mintLink is set in data.js, and to the site until then. */
function buttons(D, a) {
  const link = (D.CONFIG && /^https:\/\//.test(D.CONFIG.mintLink || "")) ? D.CONFIG.mintLink : "https://dmt-realm.dev";
  // a being's own post gets a button to its art (wallet page now, the marketplace once listed)
  const view = a && a.owner && D.beingLink ? [{ text: "View this being", url: D.beingLink(a.id, a.owner, (String(a.name).match(/#(\d+)/) || [])[1]) }] : [];
  return { inline_keyboard: [[
    { text: "🌀 Mint now", url: link },
    ...(view.length ? view : [{ text: "Check a wallet", url: "https://dmt-realm.dev/wallet" }])
  ]] };
}

function telegram(token, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = https.request(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      timeout: 20_000
    }, resp => {
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("bad telegram reply")); } });
    });
    r.on("timeout", () => r.destroy(new Error("telegram timeout")));
    r.on("error", reject);
    r.end(data);
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const attr = (a, k) => ((a.content && a.content.metadata && a.content.metadata.attributes) || [])
  .find(t => t.trait_type === k)?.value;
const imageOf = a => (a.content && a.content.links && a.content.links.image)
  || (a.content && a.content.files && a.content.files[0] && a.content.files[0].uri) || "";

/* Railway variable names typed on a phone pick up stray spaces and odd
   capitals; look them up forgivingly. */
function envVar(name) {
  if (process.env[name]) return process.env[name].trim();
  const k = Object.keys(process.env).find(k => k.trim().toUpperCase() === name);
  return k ? String(process.env[k]).trim() : "";
}

/* ---- the chain, read with the free public RPC: no paid API ----
   The candy machine's minted count is a u64 at byte 104 of its account.
   Every REALM being is a Metaplex Core asset whose update authority is the
   collection: [0] key=1, [1..33] owner, [33] authority kind, [34..66]
   collection, then name and uri as length-prefixed strings. */
const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = BigInt("0x" + (buf.toString("hex") || "0")), s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x) break; s = "1" + s; }
  return s;
}
/* Helius when its key is set (faster, higher limits), the public RPC if Helius
   is missing or refuses. HELIUS_KEY may hold the key or the whole RPC URL. */
function heliusUrl() {
  const raw = envVar("HELIUS_KEY");
  const key = ((raw.match(/api-key=([A-Za-z0-9-]+)/) || [])[1] || raw).trim();
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : "";
}
function rpcAt(url, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 20_000 },
      resp => { let d = ""; resp.on("data", c => d += c); resp.on("end", () => {
        try { const j = JSON.parse(d); j.error ? reject(new Error(j.error.message)) : resolve(j.result); } catch { reject(new Error("bad rpc reply " + resp.statusCode)); } }); });
    r.on("timeout", () => r.destroy(new Error("rpc timeout"))); r.on("error", reject); r.end(body);
  });
}
async function pub(method, params) {
  const h = heliusUrl();
  if (h) { try { return await rpcAt(h, method, params); } catch { /* fall back */ } }
  return rpcAt(PUBLIC_RPC, method, params);
}
function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15_000 }, resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) return getJSON(resp.headers.location).then(resolve, reject);
      let d = ""; resp.on("data", c => d += c); resp.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("bad json")); } });
    }).on("timeout", function () { this.destroy(new Error("timeout")); }).on("error", reject);
  });
}
async function mintedCount(machine) {
  const r = await pub("getAccountInfo", [machine, { encoding: "base64", dataSlice: { offset: 104, length: 8 } }]);
  return Number(Buffer.from(r.value.data[0], "base64").readBigUInt64LE(0));
}
async function collectionAssets(collection) {
  /* with Helius: its index of a collection's NFTs (one fast call per 1,000) */
  const h = heliusUrl();
  if (h) {
    try {
      const out = [];
      for (let page = 1; page <= 3; page++) {
        const r = await rpcAt(h, "getAssetsByGroup", { groupKey: "collection", groupValue: collection, page, limit: 1000 });
        const items = (r && r.items) || [];
        for (const a of items) out.push({ id: a.id, owner: a.ownership && a.ownership.owner,
          name: (a.content && a.content.metadata && a.content.metadata.name) || "", uri: (a.content && a.content.json_uri) || "" });
        if (items.length < 1000) break;
      }
      return out;
    } catch { /* fall back to reading the accounts directly */ }
  }
  const res = await rpcAt(PUBLIC_RPC, "getProgramAccounts", [CORE, { encoding: "base64", filters: [{ memcmp: { offset: 0, bytes: "2" } }, { memcmp: { offset: 34, bytes: collection } }] }]);
  return res.map(({ pubkey, account }) => {
    const d = Buffer.from(account.data[0], "base64");
    const owner = b58(d.subarray(1, 33));
    let o = 66; const nl = d.readUInt32LE(o); const name = d.subarray(o + 4, o + 4 + nl).toString("utf8"); o += 4 + nl;
    const ul = d.readUInt32LE(o); const uri = d.subarray(o + 4, o + 4 + ul).toString("utf8");
    return { id: pubkey, owner, name, uri };
  });
}

function start({ root }) {
  const token = envVar("TG_BOT_TOKEN"), chat = envVar("TG_CHAT_ID");
  if (!token || !chat) { console.log("mint bot: asleep (needs TG_BOT_TOKEN and TG_CHAT_ID)"); return; }
  const D = readData(root);
  const machine = envVar("CANDY_MACHINE") || (D.CONFIG.chain && D.CONFIG.chain.machine) || "5qG2B6RssAkpsg3KLJTbgLTbQUc6B6HBroPDh8UoCbd7";
  const collection = envVar("COLLECTION") || D.CONFIG.collectionAddress;
  const tokenMint = envVar("TOKEN_MINT") || ((D.CONFIG && D.CONFIG.tokenMint) || "");
  // a being's tier, from its number: map-data.json lists them in order, #1 first
  let tierOf = () => "";
  try { const md = JSON.parse(fs.readFileSync(path.join(root, "map-data.json"))); tierOf = id => (md.beings[id - 1] || [])[0] || ""; } catch {}
  const idOf = name => Number((name.match(/#(\d+)/) || [])[1] || 0);
  const seen = new Set(); const queue = []; let last = -1;

  async function tokensOf(owner) {
    if (!tokenMint) return 0;
    const r = await pub("getTokenAccountsByOwner", [owner, { mint: tokenMint }, { encoding: "jsonParsed" }]);
    return r.value.reduce((a, x) => a + Number(x.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
  }

  async function learn() {                 // what is already minted, posted to nobody
    last = await mintedCount(machine);
    if (last > 0) (await collectionAssets(collection)).forEach(a => seen.add(a.id));
    console.log(`mint bot: awake (public RPC), ${last} already minted`);
  }

  async function poll() {
    const n = await mintedCount(machine);
    if (n <= last) return;
    const all = await collectionAssets(collection);
    const fresh = all.filter(a => !seen.has(a.id)).sort((a, b) => idOf(a.name) - idOf(b.name));
    let k = last;
    for (const a of fresh) { seen.add(a.id); queue.push({ a, all, minted: Math.min(n, ++k) }); }
    // only what was actually seen counts as handled: an index a few seconds
    // behind the chain just means the rest are picked up on the next look
    last = Math.min(n, k);
  }

  async function post({ a, all, minted }) {
    const tiers = {};
    all.filter(x => x.owner === a.owner).forEach(x => { const t = tierOf(idOf(x.name)); if (t) tiers[t] = (tiers[t] || 0) + 1; });
    // everyone else's weight at 1x (no balance lookups for the whole field on the free RPC), unminted counted too
    const mintedW = all.reduce((s, x) => s + ((D.TIERS.find(t => t.name === tierOf(idOf(x.name))) || {}).weight || 0), 0);
    const mineW = Object.entries(tiers).reduce((s, [t, c]) => s + c * ((D.TIERS.find(x => x.name === t) || {}).weight || 0), 0);
    const field = (D.TOTAL_WEIGHT - mintedW) + (mintedW - mineW);
    const tokens = await tokensOf(a.owner).catch(() => 0);
    const text = caption(D, { name: a.name, tier: tierOf(idOf(a.name)), owner: a.owner, tiers, tokens, minted, field });
    let img = ""; try { img = (await getJSON(a.uri)).image || ""; } catch {}
    const reply = /^https:\/\//.test(img)
      ? await telegram(token, "sendPhoto", { chat_id: chat, photo: img, caption: text, parse_mode: "HTML", reply_markup: buttons(D, a) })
      : await telegram(token, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: buttons(D, a) });
    if (!reply.ok && reply.parameters && reply.parameters.retry_after) { await wait(reply.parameters.retry_after * 1000); throw new Error("rate limited"); }
    if (!reply.ok) console.log("mint bot: telegram said", reply.description);
  }

  (async () => {
    for (;;) { try { await learn(); break; } catch (e) { console.log("mint bot: waiting for the chain:", e.message); await wait(30_000); } }
    setInterval(() => poll().catch(e => console.log("mint bot: poll failed:", e.message)), POLL_MS);
    for (;;) {
      const job = queue.shift();
      if (!job) { await wait(1_000); continue; }
      try { await post(job); }
      catch (e) { job.tries = (job.tries || 0) + 1; if (job.tries < 3) queue.unshift(job); console.log("mint bot: post failed:", e.message); }
      await wait(SEND_GAP_MS);
    }
  })();
}

/* Post one already-minted being by hand (one the bot missed, e.g. minted before it woke).
   Only REALM beings, each at most once per run, at most once a minute. */
const announced = new Set(); let lastAnnounce = 0;
async function announce(root, assetId) {
  const token = envVar("TG_BOT_TOKEN"), chat = envVar("TG_CHAT_ID");
  if (!token || !chat) return { ok: false, problem: "TG_BOT_TOKEN / TG_CHAT_ID not set" };
  if (announced.has(assetId)) return { ok: false, problem: "already posted" };
  if (Date.now() - lastAnnounce < 60_000) return { ok: false, problem: "wait a minute" };
  const D = readData(root);
  const collection = envVar("COLLECTION") || D.CONFIG.collectionAddress;
  const machine = envVar("CANDY_MACHINE") || (D.CONFIG.chain && D.CONFIG.chain.machine) || "5qG2B6RssAkpsg3KLJTbgLTbQUc6B6HBroPDh8UoCbd7";
  const all = await collectionAssets(collection);
  const a = all.find(x => x.id === assetId);
  if (!a) return { ok: false, problem: "not a REALM being" };
  lastAnnounce = Date.now(); announced.add(assetId);
  let tierOf = () => "";
  try { const md = JSON.parse(fs.readFileSync(path.join(root, "map-data.json"))); tierOf = id => (md.beings[id - 1] || [])[0] || ""; } catch {}
  const idOf = name => Number((name.match(/#(\d+)/) || [])[1] || 0);
  const tiers = {};
  all.filter(x => x.owner === a.owner).forEach(x => { const t = tierOf(idOf(x.name)); if (t) tiers[t] = (tiers[t] || 0) + 1; });
  const mintedW = all.reduce((s, x) => s + ((D.TIERS.find(t => t.name === tierOf(idOf(x.name))) || {}).weight || 0), 0);
  const mineW = Object.entries(tiers).reduce((s, [t, c]) => s + c * ((D.TIERS.find(x => x.name === t) || {}).weight || 0), 0);
  const minted = await mintedCount(machine);
  const text = caption(D, { name: a.name, tier: tierOf(idOf(a.name)), owner: a.owner, tiers, tokens: 0, minted, field: (D.TOTAL_WEIGHT - mintedW) + (mintedW - mineW) });
  let img = ""; try { img = (await getJSON(a.uri)).image || ""; } catch {}
  const reply = /^https:\/\//.test(img)
    ? await telegram(token, "sendPhoto", { chat_id: chat, photo: img, caption: text, parse_mode: "HTML", reply_markup: buttons(D, a) })
    : await telegram(token, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: buttons(D, a) });
  return reply.ok ? { ok: true, said: "Posted " + a.name + " to the Telegram group." } : { ok: false, problem: reply.description };
}

/* A one-off check that the token and group id in Railway work: posts a fixed
   line to the group. At most once a minute, whoever asks, so the open
   address cannot be used to spam the group. */
let lastTest = 0;
async function test() {
  const token = envVar("TG_BOT_TOKEN"), chat = envVar("TG_CHAT_ID");
  const seen = Object.keys(process.env).filter(k => /^\s*(TG|TELEGRAM)/i.test(k)).map(k => JSON.stringify(k));
  const names = seen.length ? "Telegram settings I can see: " + seen.join(", ") : "I can see no settings starting with TG.";
  if (!token) return { ok: false, problem: "TG_BOT_TOKEN is not set in Railway.", names };
  if (!chat) return { ok: false, problem: "TG_CHAT_ID is not set in Railway.", names };
  if (Date.now() - lastTest < 60_000) return { ok: false, problem: "Tested less than a minute ago. Wait a minute and try again." };
  lastTest = Date.now();
  const r = await telegram(token, "sendMessage", { chat_id: chat, text: "🌀 REALM mint bot connected. New mints will appear here." });
  if (r.ok) return { ok: true, said: "Sent. Look in your Telegram group." };
  const d = String(r.description || "");
  const why = r.error_code === 401 || r.error_code === 404 ? "The token is wrong. Copy it again from @BotFather into TG_BOT_TOKEN."
    : /migrate|upgraded/i.test(d) ? `The group became a supergroup. Change TG_CHAT_ID to ${(r.parameters || {}).migrate_to_chat_id}.`
    : /chat not found/i.test(d) ? "Group not found. Check TG_CHAT_ID (try the -100 version) and that the bot is in the group."
    : /not a member|kicked|forbidden/i.test(d) ? "The bot is not in the group. Add it as an admin."
    : "Telegram refused it.";
  return { ok: false, problem: why, telegram: d };
}

/* What a mint post will look like, sent once to the group and marked as a
   preview so nobody takes it for a real mint. Shares the once-a-minute
   limit with the connection check. */
const SAMPLES = [
  { pic: "common",   name: "Mushroom 37", tier: "Common",   tokens: 0,        minted: 147,
    tiers: { Common: 1 } },
  { pic: "uncommon", name: "Folk 19",     tier: "Uncommon", tokens: 50000,    minted: 388,
    tiers: { Uncommon: 1, Common: 1 } },
  { pic: "epic",     name: "Deep 30",     tier: "Epic",     tokens: 1000000,  minted: 612,
    tiers: { Epic: 2, Rare: 1, Common: 1 } },
  { pic: "mythic",   name: "Mythic 27",   tier: "Mythic",   tokens: 5000000,  minted: 905,
    tiers: { Mythic: 1, Epic: 1, Rare: 1, Common: 2 } },
  { pic: "entity",   name: "Tide Priest", tier: "Entity",   tokens: 12000000, minted: 1104,
    tiers: { God: 1, Entity: 1, Legendary: 1, Uncommon: 1, Common: 1 } }
];
const FAKE_WALLETS = ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "3Kz9pQ7mHn2aTq8vR4bY6cLw1xFgE5sJ8dUoP2iN7MkA",
  "Hb7t2sKq9VxZ3cL8mN4pR6wY1aE5fG7jD2uQ8iT3oPsX", "5mQ8nR2vT7xZ4cB9kL1pW6yH3aD8fG2jE5uS7iN4oMqV", "Dk4F8hJ2mN6qR9tV3xZ7cB1pL5wY8aE2gS6uI4oT9nMr"];

/* Five mint posts as they will look, one per tier, marked as previews so
   nobody takes them for real mints. The wallets and holdings are made up.
   Shares the once-a-minute limit with the connection check. */
async function sample(root) {
  const token = envVar("TG_BOT_TOKEN"), chat = envVar("TG_CHAT_ID");
  if (!token || !chat) return { ok: false, problem: "TG_BOT_TOKEN and TG_CHAT_ID must both be set in Railway." };
  if (Date.now() - lastTest < 60_000) return { ok: false, problem: "Sent less than a minute ago. Wait a minute and try again." };
  lastTest = Date.now();
  const D = readData(root);
  let sent = 0, last = "";
  for (const [i, x] of SAMPLES.entries()) {
    const w = D.TIERS.reduce((a, t) => a + t.weight * (x.tiers[t.name] || 0), 0);
    const text = "🧪 <b>PREVIEW: not a real mint.</b>\n\n"
      + caption(D, { ...x, owner: FAKE_WALLETS[i], field: (D.TOTAL_WEIGHT - w) * 1.3 });
    const r = await telegram(token, "sendPhoto", {
      chat_id: chat, photo: `https://dmt-realm.dev/preview/mint-sample-${x.pic}.jpg`,
      caption: text, parse_mode: "HTML", reply_markup: buttons(D)
    });
    if (r.ok) sent++; else last = r.description;
    await wait(SEND_GAP_MS);
  }
  return sent ? { ok: true, said: `${sent} previews sent. Look in your Telegram group.` }
              : { ok: false, problem: "Telegram refused them.", telegram: last };
}

/* a plain message to the group, for the snapshot and the payout */
async function notify(text) {
  const token = envVar("TG_BOT_TOKEN"), chat = envVar("TG_CHAT_ID");
  if (!token || !chat) return;
  try { await telegram(token, "sendMessage", { chat_id: chat, text, disable_web_page_preview: true }); } catch { /* the payout carries on regardless */ }
}

module.exports = { start, caption, readData, range, test, sample, announce, notify, envVar, _chain: { mintedCount, collectionAssets, pub } };
