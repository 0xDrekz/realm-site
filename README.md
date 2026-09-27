# REALM

1,111 beings of the DMT realm, max 5 per wallet, on Solana.

**One drop.** Every being mints at once, at one price. There are no rounds,
no phases and no sectors: a being is its tier and its traits, and that is
the whole of it.

It was ten rounds of 111 at a rising price, then briefly ten sectors that
beings were counted in. Both are gone. The rounds fragmented the collection
into ten cohorts with separate pools and separate floors, and needed ten
marketing pushes over a year to work. The sectors were what survived of
them, and they earned nothing — they divided 1,111 beings into ten boxes
that changed no payout, no rarity and no picture, and every line explaining
them was a line a buyer had to read before understanding something that did
not matter.

The ten chapters of story survive, because they were never the counting.

One page. No build step, no framework, nothing to install.

---

## How the site is shaped

Everything happens on `index.html`, in three states:

1. **The door** — the tree, the doorway in its trunk, and one way in.
2. **The tunnel** — you are rushed through that doorway.
3. **The chamber** — the room you come out into, with five ways on.

Each of the four opens a panel over the room: Mint, The Beings, Rewards
and Lore. Nothing navigates away.

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

The `CHAPTERS` list holds each chapter's name and text. Edit the text between
the quotes. Keep all ten entries — a chapter opens for every tenth of the
drop that mints, so ten chapters is what makes that come out even.

They are lore and nothing else. No being belongs to a chapter and nothing is
counted in them.

### Changing the rarity split

The `TIERS` list holds the nine tiers, and `count` is how many exist in the
whole collection. **The counts must add up to 1,111.** `TOTAL_BEINGS` is
their sum rather than a number typed in, so it cannot disagree with them.

### The Source

The 1,111th being: one in the collection, 111 weight points, and the only
being that is not one of a set. It is also the one picture that was composed
by hand rather than assembled from traits — see `art/LADDER.md`.

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
| **`data.js`** | **the only file you edit** — minted, mint link, chapters, rarity |
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
| `tools/drop.py` | generates the whole collection — run this one |
| `tools/round.py` | the machinery it calls; not run directly |
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

The token multiplier scales **your weight, not the pool**. So what it is worth depends entirely on what everybody else is
holding, and a single number would be a lie whichever one was chosen.

- **Even field** — every holder carrying the same multiplier as you. They
  cancel out and your slice is simply your weight over the collection's
  5,431 points. This is the honest baseline.
- **Best case** — you at the top token band with nobody else multiplied at
  all. It falls the moment anyone else buys tokens, so it is a ceiling and
  not a forecast.

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

---

## Why the pilgrim multiplier was removed

A holder's slice used to be three things multiplied: their beings, their
tokens, and a bonus for holding across sectors. When the sectors went there
was nothing left to rebase that bonus on.

The obvious replacement — a bonus for holding a spread of tiers — was not
taken. Which tier a mint gives you is luck, so a bonus for holding several
different ones is a bonus for being lucky twice. It would have read as a
reward for a decision nobody actually gets to make.

Two things multiplied is also simply easier to explain, and a mechanism that
pays people money has to be explainable.

---

## The reveal, and the provenance hash

**There is no delayed reveal.** You see what you minted the moment you mint it.

The site used to say the beings were sealed until the mint closed, and that
"nobody, including us, knows which tier a mint holds." That second sentence
was not true. `drop.py` makes all 1,111 beings before anyone mints — every
tier is decided and sitting in a folder. It has been removed.

Delayed reveal is not what makes a mint honest. A delay without a published
hash is the *less* trustworthy arrangement, because during the gap the people
running it know the assignment and the buyers do not. That gap is where
insider sniping happens, and it is why people distrust delayed reveals.

Instant reveal also suits this collection specifically: the pool pays on
weight, and weight is public. Somebody who can see what they hold can work
out their slice and decide whether to mint again or buy $DMT. Hiding it
blinds exactly the decision the token depends on.

### The hash

`python3 tools/drop.py` prints it, and writes `provenance.json` with every
image's own hash beside it. Each image is hashed, the hashes are joined in
token order, and that string is hashed again.

Put it in `data.js`:

```js
provenance: "b4be1f3a…",
```

**Publish it before the gate opens** — in `data.js`, on X, anywhere
time-stamped. It is worth nothing published afterwards, because the entire
point is that it existed before anybody could see what they were buying.
While it is `""` the Beings panel says so plainly rather than showing nothing.

### Say only what it proves

It proves **the collection handed out is the collection that was hashed** —
unaltered, unreordered. Change one pixel of one being, or swap two of them
over, and it will not match.

It does **not** prove how mint order was assigned to token number. That is
the launchpad's shuffle, not ours. The site says both halves of this, in the
FAQ and beside the hash itself, and the checker fails if the page shows a
hash without stating the second half.
