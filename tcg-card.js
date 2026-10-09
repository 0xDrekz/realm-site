/* ============================================================
   REALM — one card, drawn the same everywhere (the Codex, the game).
   window.RealmCard.html(card) gives the card; .art(card) its picture.
   Beings use their /thumbs picture. Spirits, rituals and tokens from the
   shared deck have no being, so they get a drawn sigil instead.
   ============================================================ */
(() => {
  "use strict";
  const ESS_COL = { magic: "#d65cff", spirit: "#43e0a8", knowledge: "#4fa8ff", light: "#ffd65c", dark: "#ff5470" };
  const TIER_COL = { Common: "#9ca3af", Uncommon: "#34d399", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b", Mythic: "#ef4444", Entity: "#a5f3fc", God: "#fde68a", Source: "#f4efe4" };
  const FOIL = new Set(["Mythic", "Entity", "God", "Source"]);
  const KWS = ["Flying", "Haste", "Veiled", "Unblockable", "Lifelink", "Poison", "Freeze", "First strike", "Double strike"];
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : "";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SWORD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2 22 2 22 9.5 11 20.5 12.5 22 11 23.5 7.5 20 3.5 24 0 20.5 4 16.5 .5 13 2 11.5 3.5 13z"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22 2.6 12.6A6 6 0 0 1 12 4.9a6 6 0 0 1 9.4 7.7z"/></svg>';

  /* ---------- sigils for the shared deck ---------- */
  const G = {   // line drawings on a 100x100 field
    "s-wisp": '<path d="M28 52a22 22 0 0 1 44 0z"/><path d="M44 52v22m12-22v22M40 74h20"/><circle cx="40" cy="42" r="3"/><circle cx="56" cy="38" r="3"/><circle cx="50" cy="46" r="2"/>',
    "s-moth": '<path d="M50 30v42"/><path d="M50 40C38 22 18 26 22 44s22 12 28 4M50 40c12-18 32-14 28 4S56 56 50 48"/><path d="M50 52c-8 6-18 16-10 22 6 4 10-8 10-14m0 0c0 6 4 18 10 14 8-6-2-16-10-22"/><path d="M46 30l-6-8m14 8 6-8"/>',
    "s-root": '<path d="M50 22v30"/><path d="M30 30h40v18c0 14-10 22-20 26-10-4-20-12-20-26z"/><path d="M50 52c-6 10-14 14-22 30M50 52c6 10 14 14 22 30M50 60v24"/>',
    "s-scribe": '<path d="M50 18l7 17 18 1-14 11 5 18-16-10-16 10 5-18-14-11 18-1z"/><path d="M30 82l40-14"/><path d="M62 70l12-6-4 10"/>',
    "s-hound": '<path d="M56 16 34 52h16l-8 32 26-40H52z"/><path d="M22 70c6-4 10-4 14 0M70 26c4 4 4 8 0 12"/>',
    "s-halo": '<ellipse cx="50" cy="26" rx="18" ry="6"/><circle cx="50" cy="44" r="8"/><path d="M34 82c0-18 6-26 16-26s16 8 16 26"/><path d="M28 60l-8 10m52-10 8 10"/>',
    "s-lurker": '<path d="M14 50c12-18 24-24 36-24s24 6 36 24c-12 18-24 24-36 24S26 68 14 50z"/><circle cx="50" cy="50" r="12"/><path d="M50 40v20"/><path d="M24 78l-6 8m58-8 6 8M38 80l-2 10m26-10 2 10"/>',
    "r-strike": '<path d="M58 10 30 54h18L38 90l34-46H54z"/><circle cx="50" cy="50" r="38" opacity=".35"/>',
    "r-nova": '<circle cx="50" cy="50" r="10"/><path d="M50 12v20m0 36v20M12 50h20m36 0h20M23 23l14 14m26 26 14 14M77 23 63 37M37 63 23 77"/><circle cx="50" cy="50" r="30" opacity=".35"/>',
    "r-halo": '<ellipse cx="50" cy="50" rx="32" ry="12"/><ellipse cx="50" cy="50" rx="20" ry="7" opacity=".5"/><path d="M50 18v8m0 48v8M22 34l6 4m44-4-6 4"/>',
    "r-geo": '<path d="M50 14 81 68H19z"/><path d="M50 86 19 32h62z"/><circle cx="50" cy="50" r="36" opacity=".45"/><circle cx="50" cy="50" r="6"/>',
    "r-eclipse": '<circle cx="50" cy="50" r="28"/><path d="M62 26a28 28 0 0 1 0 48 24 24 0 0 0 0-48z" fill="currentColor"/><path d="M50 10v6m0 68v6M10 50h6m68 0h6"/>',
    "r-ward": '<circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="22"/><circle cx="50" cy="50" r="10"/><path d="M50 16v68M16 50h68M26 26l48 48M74 26 26 74" opacity=".5"/>',
    "r-aura": '<path d="M50 14c8 14 22 22 22 42a22 22 0 0 1-44 0c0-10 6-16 10-22 2 8 6 12 10 12-2-12 0-22 2-32z"/><path d="M50 62c4 4 6 8 6 12a6 6 0 0 1-12 0c0-4 2-8 6-12z"/>',
    "r-dust": '<path d="M62 18a32 32 0 1 0 20 50 26 26 0 1 1-20-50z"/><circle cx="30" cy="30" r="2"/><circle cx="74" cy="34" r="2"/><circle cx="66" cy="80" r="2"/><circle cx="22" cy="70" r="1.5"/>',
    "t-spore": '<path d="M30 54a20 20 0 0 1 40 0z"/><path d="M46 54v20m8-20v20"/><circle cx="42" cy="46" r="3"/><circle cx="56" cy="44" r="3"/>',
    "t-jelly": '<path d="M28 52a22 22 0 0 1 44 0c-6 4-38 4-44 0z"/><path d="M34 54c0 10-4 18 0 26m10-26c0 10 4 18 0 26m12-26c0 10-4 18 0 26m10-26c0 10 4 18 0 26"/>',
    "t-seed": '<path d="M50 18c18 12 22 30 16 46S38 82 34 64s0-34 16-46z"/><path d="M50 22c-4 18-4 36 0 56"/>',
    "t-feather": '<path d="M70 16C40 22 26 46 28 74l8-8c20-6 32-24 34-50z"/><path d="M22 84l40-52"/>',
    "t-husk": '<path d="M30 46a20 20 0 0 1 40 0v12l-6 4v12H36V62l-6-4z"/><circle cx="42" cy="48" r="5"/><circle cx="58" cy="48" r="5"/><path d="M44 74v-6m6 6v-6m6 6v-6"/>',
    "t-cloud": '<path d="M28 66a14 14 0 0 1 4-27 20 20 0 0 1 38 4 12 12 0 0 1 2 23z"/><path d="M36 76l-4 8m18-8-4 8m18-8-4 8"/>',
  };
  function sigil(id, essence) {
    const col = ESS_COL[(essence && essence[0]) || "light"] || "#ffd65c";
    const g = G[id] || G["r-geo"];
    return `<svg class="cc-sigil" viewBox="0 0 100 100" aria-hidden="true" style="--sc:${col}">
<defs><radialGradient id="sg-${id}" cx="50%" cy="45%" r="72%"><stop offset="0" stop-color="${col}" stop-opacity=".8"/><stop offset=".6" stop-color="#2a1250"/><stop offset="1" stop-color="#0b0418"/></radialGradient></defs>
<rect width="100" height="100" fill="url(#sg-${id})"/>
<g fill="none" stroke="${col}" stroke-opacity=".18" stroke-width=".6"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="34"/><path d="M50 4v92M4 50h92M17 17l66 66M83 17 17 83"/></g>
<g fill="none" stroke="#fffaf0" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px ${col})">${g}</g></svg>`;
  }
  const artId = c => c.n ? null : (c.id || "").replace(/^t-/, "t-");
  function art(c, lazy = true) {
    if (c.n) return `<img src="/thumbs/${c.n}.webp" alt="" ${lazy ? 'loading="lazy" ' : ""}decoding="async" width="224" height="224">`;
    return sigil(artId(c), c.essence);
  }

  function rulesHtml(t) {
    let h = esc(t);
    h = h.replace(/\b(Arrive|Attuned|When it attacks|When it dies|At the start of your turn|At the end of your turn)(:|,)/g, "<em>$1</em>$2");
    for (const k of KWS) h = h.replace(new RegExp("(^|[.\\s,])(" + k + ")(?=[.,\\s]|$)", "gi"), "$1<b>$2</b>");
    return h;
  }
  const typeOf = c => c.n ? (c.unique || c.tier) : c.kind === "ritual" ? "Ritual" : c.kind === "token" ? "Token" : "Spirit";
  const frameOf = c => c.n ? "t-" + c.tier.toLowerCase() : c.kind === "ritual" ? "t-ritual" : "t-spiritk";

  /* the full card. opts.cost overrides the printed cost (a champion's tax) */
  function html(c, opts = {}) {
    const ess = c.essence && c.essence.length ? c.essence : ["light"];
    const cls = ["cc", frameOf(c)];
    if (c.n && FOIL.has(c.tier)) cls.push("foil");
    if (c.legendary) cls.push("legend");
    if (opts.cls) cls.push(opts.cls);
    const e1 = ESS_COL[ess[0]], e2 = ESS_COL[ess[1] || ess[0]];
    const text = c.text || "";
    const size = text.length > 150 ? " tiny" : text.length > 92 ? " small" : "";
    const cost = opts.cost != null ? opts.cost : c.cost;
    const unit = c.kind !== "ritual";
    return `<div class="${cls.join(" ")}" style="--e1:${e1};--e2:${e2}">
<div class="cc-in">
<div class="cc-head"><span class="cc-cost${opts.cost != null && opts.cost !== c.cost ? " up" : ""}" aria-label="Cost ${cost}">${cost}</span><span class="cc-name">${esc(c.name)}</span></div>
<div class="cc-art">${art(c, opts.lazy !== false)}</div>
<div class="cc-type"><span>${esc(typeOf(c))}</span><span class="cc-dots">${ess.map(e => `<b style="--d:${ESS_COL[e]}" title="${cap(e)}"></b>`).join("")}</span></div>
<div class="cc-text${size}">${text ? rulesHtml(text) : '<i style="opacity:.55">' + (c.n ? "A plain being. Its strength is its body." : "A spirit of the realm.") + "</i>"}</div>
<div class="cc-foot">${unit ? `<span class="cc-pt p" aria-label="Power ${c.power}">${SWORD}${c.power}</span>` : "<span></span>"}<span class="cc-no">${c.n ? "#" + c.n : ""}</span>${unit ? `<span class="cc-pt h" aria-label="Health ${c.health}">${HEART}${c.health}</span>` : "<span></span>"}</div>
</div></div>`;
  }

  window.RealmCard = { html, art, sigil, rulesHtml, esc, cap, ESS_COL, TIER_COL, FOIL, KWS, SWORD, HEART };
})();
