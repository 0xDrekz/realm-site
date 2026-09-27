# REALM

10 sectors of the DMT realm. 1,111 beings, max 3 per wallet, on Solana.
Nine rounds of 111 and a tenth of 112.

One page. No build step, no framework, nothing to install.

---

## How the site is shaped

Everything happens on `index.html`, in three states:

1. **The door** — the tree, the doorway in its trunk, and one way in.
2. **The tunnel** — you are rushed through that doorway.
3. **The chamber** — the room you come out into, with five ways on.

Each of the five opens a panel over the room: Mint, The Beings, Rewards,
Lore, The Rounds. Nothing navigates away.

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
  currentRound: 1,      // 1-10. Unlocks sectors and lore automatically.
  minted: 0,            // how many of this round's 111 are gone
  mintLink: "",         // your launchpad mint page URL
  links: {
    x: "https://x.com/yourhandle",
    telegram: "https://t.me/yourgroup",
    marketplace: ""     // leave "" to hide the link
  }
};
```

### Opening a new round

Change one number:

```js
currentRound: 2,
```

That single edit will:

- name sector 2 as the live round, on the door and in the chamber
- unlock lore chapter 2 (3 onward stay sealed)
- move the marker down the rounds list

Commit it, and Railway redeploys in about a minute.

### Turning the mint on

Paste your launchpad link into `mintLink`. While it is empty the button
reads "The gate is shut" and cannot be clicked, and the chamber says SHUT
next to MINT.

### Editing the story

The `SECTORS` list holds each sector's name, lore and colour. Edit the text
between the quotes. Keep all ten entries.

### Changing the rarity split

The `TIERS` list holds the eight tiers. **The counts must add up to 111.**

### Why the tenth round is 112

Ten rounds of 111 is 1,110. The tenth holds one extra so the total is 1,111.
Two lines in `data.js` do it:

```js
const EXTRA_IN_FINAL_ROUND = 1;
const TOTAL_BEINGS = SUPPLY_PER_ROUND * 10 + EXTRA_IN_FINAL_ROUND;   // 1,111
```

Set `EXTRA_IN_FINAL_ROUND` to 0 and everything on the site goes back to 1,110
on its own — the door, the FAQ, the rounds list and the mint counter all read
from it.

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
| **`data.js`** | **the only file you edit** — round, mint link, sectors, rarity |
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
