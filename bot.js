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

const POLL_MS = 20_000;        // how often to look for new mints
const SEND_GAP_MS = 3_500;     // Telegram allows about 20 posts a minute in a group

/* the numbers, out of data.js */
function readData(root) {
  const src = fs.readFileSync(path.join(root, "data.js"), "utf8");
  return vm.runInNewContext(src + "\n;({ TIERS, TOKEN_BANDS, TOKEN_NAME, TOTAL_BEINGS, TOTAL_WEIGHT, POOL_FULL, poolFrom });");
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

/* the post itself; kept apart so it can be tried without a chain or a bot */
function caption(D, { name, tier, owner, count, weight, tokens, minted }) {
  const m = multFor(D, tokens);
  const r = range(D, weight, m);
  const t = D.TIERS.find(x => x.name === tier);
  return [
    `🌀 <b>A being has crossed</b>  ·  ${fmt(minted)} of ${fmt(D.TOTAL_BEINGS)}`,
    ``,
    `<b>${esc(name)}</b>  ·  ${esc(tier)}${t ? ` (weight ${t.weight})` : ""}`,
    `Minted by <a href="https://solscan.io/account/${esc(owner)}">${esc(short(owner))}</a>`,
    ``,
    `Beings held: <b>${fmt(count)}</b>  ·  weight ${fmt(weight)}`,
    `${esc(D.TOKEN_NAME)} held: <b>${fmt(tokens)}</b>  ·  ${m}×`,
    ``,
    `Est. share at a full mint: <b>~${sol(r.typ)} SOL</b>`,
    `<i>range ${sol(r.low)} – ${sol(r.high)} SOL, depending on what everyone holds at the snapshot</i>`,
    `Pool so far: ${sol(D.poolFrom(minted))} SOL`,
    ``,
    `<i>An estimate, not a promise.</i> Check any wallet: dmt-realm.dev/holders`
  ].join("\n");
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

function start({ root, rpc, holdings, env }) {
  const token = process.env.TG_BOT_TOKEN || "", chat = process.env.TG_CHAT_ID || "";
  if (!token || !chat || !env.key || !env.col) {
    console.log("mint bot: asleep (needs TG_BOT_TOKEN, TG_CHAT_ID, HELIUS_KEY and COLLECTION)");
    return;
  }
  const D = readData(root);
  const seen = new Set();
  const queue = [];

  async function newest(page, limit, dir) {
    const res = await rpc("getAssetsByGroup", {
      groupKey: "collection", groupValue: env.col, page, limit,
      sortBy: { sortBy: "created", sortDirection: dir }
    });
    return (res && res.items) || [];
  }

  async function learn() {                 // everything already minted, posted to nobody
    for (let page = 1; page <= 10; page++) {
      const items = await newest(page, 1000, "asc");
      items.forEach(a => seen.add(a.id));
      if (items.length < 1000) break;
    }
    console.log(`mint bot: awake, ${seen.size} beings already minted`);
  }

  async function poll() {
    const items = await newest(1, 100, "desc");
    const fresh = items.filter(a => !seen.has(a.id)).reverse();     // oldest first
    for (const a of fresh) { seen.add(a.id); queue.push({ a, minted: seen.size }); }
  }

  async function post({ a, minted }) {
    const owner = a.ownership && a.ownership.owner;
    if (!owner) return;
    const h = await holdings(owner);
    const weight = h.beings.reduce((s, b) => s + ((D.TIERS.find(t => t.name === b.tier) || {}).weight || 0), 0);
    const text = caption(D, {
      name: (a.content && a.content.metadata && a.content.metadata.name) || "A being",
      tier: attr(a, "Tier") || "", owner, count: h.beings.length, weight, tokens: h.tokens, minted
    });
    const img = imageOf(a);
    const reply = /^https:\/\//.test(img)
      ? await telegram(token, "sendPhoto", { chat_id: chat, photo: img, caption: text, parse_mode: "HTML" })
      : await telegram(token, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true });
    if (!reply.ok && reply.parameters && reply.parameters.retry_after) {
      await wait(reply.parameters.retry_after * 1000);
      throw new Error("rate limited");
    }
    if (!reply.ok) console.log("mint bot: telegram said", reply.description);
  }

  (async () => {
    for (;;) {                             // keep trying until the chain answers once
      try { await learn(); break; } catch (e) { console.log("mint bot: waiting for the chain:", e.message); await wait(60_000); }
    }
    setInterval(() => poll().catch(e => console.log("mint bot: poll failed:", e.message)), POLL_MS);
    for (;;) {                             // one post at a time, spaced out
      const job = queue.shift();
      if (!job) { await wait(1_000); continue; }
      try { await post(job); }
      catch (e) {
        job.tries = (job.tries || 0) + 1;
        if (job.tries < 3) queue.unshift(job);
        console.log("mint bot: post failed:", e.message);
      }
      await wait(SEND_GAP_MS);
    }
  })();
}

module.exports = { start, caption, readData, range };
