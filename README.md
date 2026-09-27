# REALM

10 sectors of the DMT realm. 1,111 beings, max 5 per wallet, on Solana.

**One drop.** Every being mints at once, at one price. The ten sectors are
still here — they are what a being belongs to and how the story is told —
but they are not a release schedule. Nine hold 111 beings each; the tenth
holds 112, because the Source is counted there.

It used to be ten rounds of 111 at a rising price. That was abandoned for
three reasons: ten cohorts with separate reward pools fragments the
collection and its floor, ten sell-outs needs ten marketing pushes over a
year or more, and stalling at round three would have left 800 unminted
beings and no clean way out. One drop is worth less on paper if all ten
rounds sell — and more than the first six of them combined if they do not.

One page. No build step, no framework, nothing to install.

---

## How the site is shaped

Everything happens on `index.html`, in three states:

1. **The door** — the tree, the doorway in its trunk, and one way in.
2. **The tunnel** — you are rushed through that doorway.
3. **The chamber** — the room you come out into, with five ways on.

Each of the five opens a panel over the room: Mint, The Beings, Rewards,
Lore, The Sectors. Nothing navigates away.

---

## Deploy on Railway

1. Push these files to the GitHub repository.
2. Railway reads `package.json`, runs `npm start`, and the site is live.

Nothing to configure — Railway sets `PORT` and `server.js` uses it.
If a push doesn't appear, check **Source → auto deploy is enabled** in Railway.

---

## Changing the site

Everything you will ever need to edit is in **`data.js`**.

```js
const CONFIG = {
  minted: 0,            // how many of the 1,111 are gone
  mintCloses: "",       // when the gate shuts, sold out or not
  mintLink: "",         // your launchpad mint page URL
  links: {
    x: "https://x.com/yourhandle",
    telegram: "https://t.me/yourgroup",
    marketplace: ""     // leave "" to hide the link
  }
};
```

### As the mint fills

Change one number:

```js
minted: 340,
```

That single edit will:

- move the mint bar and the count on the door
- open lore chapters — one for every tenth of the drop that goes
- light the sectors that have been reached

Commit it, and Railway redeploys in about a minute.

### The closing date

```js
mintCloses: "2026-11-30",
```

**This has to be decided and published before the mint opens.** The pool is
a share of what the mint actually took, so it can be paid on a part mint —
but only if people were told the closing date going in. While it is `""` the
site says the date is still to be announced rather than inventing one.

### Turning the mint on

Paste your launchpad link into `mintLink`. While it is empty the button
reads "The gate is shut" and cannot be clicked, and the chamber says SHUT
next to MINT.

### Editing the story

The `SECTORS` list holds each sector's name, lore and colour. Edit the text
between the quotes. Keep all ten entries.

### Changing the rarity split

The `TIERS` list holds the nine tiers. `perSector` is how many of that tier
live in **each** of the ten sectors, and it is the old per-round table
unchanged — the same 111 beings, ten times over. **The per-sector counts must
add up to 111**, and the whole collection then lands on 1,110 plus the Source.

### Why there are 1,111 and not 1,110

Ten sectors of 111 is 1,110. The Source is the 1,111th: one in the whole
collection, 111 weight points, and the only being that is not one of ten of
its kind. It is the `only: 1` entry at the bottom of `TIERS`, and the tenth
sector is counted as holding 112 because of it.

### The top bar, and the X link

The bar across the top reads REALM and then whatever `TOKEN_NAME` is set to
in `data.js`. The links on the right come from `CONFIG.links`.

**A link only appears once it goes somewhere.** The placeholders
(`https://x.com/`, `https://t.me/`) are treated as blanks and stay hidden,
so nobody is sent to an empty profile. To show the X link, put the real
address in:

```js
links: {
  x: "https://x.com/yourhandle",
  ...
}
```

Telegram and a marketplace link appear the same way when they are real.

---

## Files

| File | What it is |
|------|------------|
| **`data.js`** | **the only file you edit** — minted, mint link, sectors, rarity |
| `index.html` | the whole site |
| `styles.css` | the shared look: black, gold hairline, pixel type |
| `landing.css` | the door, the chamber and the panels |
| `gate.js` | the tree, the rush into the doorway, and the tunnel |
| `journey.js` | the chamber — the room, everything alive in it, and the menu |
| `landing.js` | fills the panels from `data.js` |
| `forms.js` | draws a being for a tier |
| `tree.png` | the tree with the door in it, as pixel art |
| `chamber.png` | the room you come out into, as pixel art |
| `logo-bar.png` | the mark in the top bar |
| `favicon-32.png`, `favicon-16.png` | the mark in the browser tab |
| `apple-touch-icon.png` | the mark when the site is saved to a phone's home screen |
| `og.png` | the picture that shows when the link is posted |
| `collection.png` | the collection avatar for the launchpad — not used by the site |
| `preview/` | one being per tier, shown in the Beings panel |
| `tools/drop.py` | generates the whole collection — 1,111 in one pass |
| `art/source.png` | the Source, the one picture that is not generated |
| `server.js` | the tiny server Railway runs |
| `package.json` | tells Railway how to start it |

Each picture also has a `-small` version, used on phones.

---

## Replacing the artwork

Drop in a new `tree.png` (and `tree-small.png`) and the door screen uses it.
Two lines at the top of `gate.js` say where things are in it:

```js
const AIM = { x: 0.545, y: 0.738 };   // the doorway — where the zoom goes
const SUN = { x: 0.513, y: 0.436 };   // the burst of light in the canopy
```

Both are fractions — how far across, how far down. If the new picture's
doorway sits somewhere else, change those two numbers and the rush will aim
at it.

Same for `chamber.png`: the fractions near the top of `journey.js`
(`EYE_HIGH`, `EYE_BIG`, `DOOR`, `FLOOR`) say where the light lands in the
room.

Both pictures are drawn full bleed, so anything tall and centred will work.

## The smoke and the sway

Both live in `gate.js`. The smoke is a handful of tiny sprites — 11, 16 and
21 pixels across — with a dithered edge, drawn much larger than they are
made, so the dither is magnified into the same chunky pixels as everything
else. They rise off the bottom, thickest under the trunk, and they block
light rather than adding it, because additive smoke is invisible against a
lit canopy.

The sway is the picture drawn as 48 bands, each slid sideways. How freely a
band moves falls away as it goes down, so the crown swings and the roots do
not. Three waves at different lengths run through it, each lagging further
down the tree, so what you see is a bend travelling up through the branches;
a slow envelope on top makes it arrive in gusts. Bands never move up or
down — that tears a gap above them.

## The pixel grid

Every canvas on the site is drawn at a third of the screen's size and blown
back up by the browser with hard edges (`image-rendering: pixelated`). One
line, `const PX = 3` at the top of `gate.js` and `journey.js`, sets how chunky
the pixels are — larger number, bigger pixels. It costs a ninth of the drawing
work, which is why the whole site got faster when it went pixel.

Because of that, the two pictures never need to be big: they are 460 pixels
across with a 44-colour palette, about 100 KB each.

---

## The logo

The emblem is used in five places, cut differently for each.

| Where | File | Cut |
|-------|------|-----|
| Top bar | `logo-bar.png` | the letters and the strong linework, 96px so a phone gets it pixel-for-pixel |
| Browser tab | `favicon-32.png`, `favicon-16.png` | **not the emblem** — see below |
| Phone home screen | `apple-touch-icon.png` | the letters, 180px |
| Posted links | `og.png` | the whole emblem, with REALM under it |
| Launchpad avatar | `collection.png` | the whole emblem, 1000px |

**Why the tab icon is different.** A browser tab is 16 pixels across. The
whole emblem shrunk that far is a gold smudge — the letters stop being
letters somewhere around 40 pixels. So the tab icon is the emblem's heart
drawn again from scratch at that size: the gold diamond, the violet ring
inside it, the eye at the centre. It is four shapes, so it survives.

Everything from 72 pixels up is the real emblem.

The share picture is built by a script rather than by hand, so it can be
remade if the wording changes. It lives in the scratchpad, not the repo —
ask and it can be rebuilt.

`collection.png` is the only one the site never loads. It is there for the
launchpad, where the collection needs an avatar.

---

## Connecting a wallet

`wallet.js`. It is **read only**. The site never asks anyone to sign a
transaction or approve spending, and the sheet says so before they connect.
The mint happens on the launchpad, not here.

Wallets are found through the **Wallet Standard**, not by reaching for
`window.phantom` or `window.solana`. That is how every Solana wallet
announces itself now, so one piece of code finds Phantom, Solflare,
Backpack and MetaMask alike, and there is no list of wallets to keep up to
date as new ones appear.

Right now connecting shows the address and says plainly that there is
nothing to read. Once the collection exists, put its address and a Helius
key into `data.js` and that panel becomes where a holder sees their beings
and the weight they carry.

---

## Note on the mint

This site does not mint anything itself — the Mint button sends people to
your launchpad, which handles payment, the 111 supply cap and the
3-per-wallet limit. Set the collection up on a Solana launchpad first, then
paste the link into `mintLink`.


---

## The earnings chart

The bottom of the Rewards panel holds two tables: how big the pool is
depending on how much of the drop sells, and what every holding pays.

**Not a single number in it is typed in.** They are all worked out from the
constants in `data.js` when the page loads, so changing the price, a weight,
a tier count or `POOL_PERCENT` moves the whole chart with it.

### Why the pool table exists

One drop has a risk the ten rounds did not: it might not fill. The pool is
75% of what the mint **actually takes**, not a fixed sum, so it scales down
with a part mint. That is printed at the top of the chart rather than left
for somebody to discover, and the FAQ says the same thing in words.

### Why every holding has two figures

The token and pilgrim multipliers scale **your weight, not the pool**. So
what a multiplier is worth depends entirely on what everybody else is
holding, and a single number would be a lie whichever one was chosen.

- **Even field** — every holder carrying the same multiplier as you. They
  cancel out and your slice is simply your weight over the collection's
  5,431 points. This is the honest baseline.
- **Best case** — you at the top token band and the pilgrim ceiling with
  nobody else multiplied at all. It falls the moment anyone else buys
  tokens, so it is a ceiling and not a forecast.

A real outcome lands between them, and nearer the first.

### The line the chart is built around

The first row is what any holding returns **on average**, which is exactly
the 75% coming back. Every holding that beats that line is paid for by one
that does not.

A holding has to weigh 6.5 points to return its own mint price, so Epic is
the first tier that pays for itself. Everything below Epic loses money at
the even field. The chart says so in green and red rather than hiding it,
which is the only defensible way to publish it.

### Why the quantity is chosen rather than listed

Nine tiers times five quantities is forty-five rows, and nobody scrolls
forty-five rows on a phone. Tapping a quantity keeps the table nine rows
long. The even-field column is exactly linear in quantity anyway, so
nothing is lost.

### Checking it

The checker is not in the repo — it lives in the scratchpad — but the method
is worth keeping: open the page, read the numbers back out of the DOM, and
compare them to the same sums done again from scratch. Every quantity of
every tier was checked that way, along with the pool table, and every panel
was swept for language left over from the ten-round structure and measured
for sideways overflow at phone width.

---

## The beings shown on the site

`preview/<tier>.png` — eight pictures, one per tier, shown beside the tier
names in the Beings panel.

They come out of the same pipeline as the collection, but from a seed that
belongs to **no round**, so nothing on the page is a token anybody will be
minted. They show what a tier looks like; they are not the thing being sold,
and which tier a mint holds still is not known until the reveal.

To remake them after the art changes:

```
python3 tools/preview.py
```
