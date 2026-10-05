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

### No closing date

The gate stays open until all 1,111 are minted, and the holder pool is paid
once, when the last one goes. The site says so wherever a date used to be.

### Turning the mint on

Paste your launchpad link into `mintLink`. While it is empty the button
reads "The gate is shut" and cannot be clicked, and the chamber says SHUT
next to MINT.

### Editing the story

The `LORE` list holds the story, one paragraph per entry. Edit the text
between the quotes; the site prints it as written.

It used to be ten chapters that unsealed as the mint filled. That was the
staged release wearing its last disguise — it rationed the one thing on the
site that costs nothing to give away, and with nothing minted, nine of the
ten were shut. It is one story now and all of it shows from the first visit.

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
| `door.jpg` | the first screen: the tree, the door and the mushroom forest (`tools/doorscene.py`) |
| `door-mask.png` | the doorway's opening, where the light is drawn |
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

Run `python3 tools/doorscene.py new-picture.jpg`: it writes `door.jpg` and
`door-mask.png` and prints the AIM and GAP lines for `gate.js`.
Two lines at the top of `gate.js` say where things are in it:

```js
const AIM = { x: 0.505, y: 0.700 };   // the doorway — where the zoom goes
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

## The portal in the doorway

The door in the tree is **ajar**, with a carved panel and a gap beside it.
The portal fills that gap, and the panel stays in front of it — which is a
better picture than an empty frame and also less work than removing the door.

`#portal` is its own canvas at the **full screen resolution**, while the tree
draws at half. That is the effect: what is through the doorway carries more
detail than the wood around it, and you can see the grain change at the
threshold. A pattern of six interfering waves drifts through it, cut into
twelve vivid steps — magenta, violet, acid green, red, orange — colours that
appear nowhere else on the screen.

### Why it used to look the same as the tree

`flowDoor` lifted the picture's OWN colours out of the arch, blurred them,
and scrolled them back with `globalCompositeOperation = "lighter"` at half
alpha. Compositing that way can only ever brighten what is already there, so
the doorway could never be any colour but the tree's. The portal is generated
instead, and drawn over rather than added to.

### The mask is measured, and it is alpha

`tools/doormask.py` reads the opening off the artwork — inside the arch the
painter used violet and cyan, outside it the stone is olive, and that one
comparison separates them. A rectangle eyeballed over the arch spills at the
shoulders, where the frame curves in and the opening does not.

Two things it had to be taught:

- **The shape has to be in the ALPHA channel.** A greyscale mask looks
  correct in an image viewer and does nothing in a browser: canvas
  `destination-in` keeps pixels by alpha, and a grey PNG loads fully opaque,
  so every pixel is kept and the portal comes out as its bounding rectangle.
- **The painted light spills left along the step** at the foot of the arch.
  Physically right, and wrong here — it puts the portal outside the doorway,
  on the threshold, which is the one thing it must not do. Below the door
  panel the mask is clipped to the gap's own column.

Measured after: 0 vivid pixels anywhere outside the column, and 55 fps.

## The light, and why the pictures were soft

Both scenes were mush, and the complaint — "more light bulb and better
defined" — was exactly right. Three things were wrong, and only one of them
was the artwork.

**Nothing in either picture was a light.** The brightest pixel in the tree was
240 and there was no white anywhere. Eighteen thousand pixels were *quite
bright* and none of them was a source. A light in pixel art is a hot core and
a few hard steps out of it — it is read by its steps, the way a woodcut is.

**The middle was too bright to have anything stand out from.** The tree
averaged 80 out of 255. It sits near 50 now, so the doorway glows instead of
merely being present.

**And the site was throwing the definition away.** This is the big one. Every
canvas is a third of the screen, so a 460-pixel picture is always being scaled
*down* to be drawn — and both canvases had image smoothing on, so the browser
averaged it. However sharp the art, it arrived soft. `drawTree` in `gate.js`
and `paint` in `journey.js` set `imageSmoothingEnabled = false` now, and the
pixels survive the downscale.

`tools/scene.py` does the first two:

    python3 tools/scene.py

It bands the value into six hard steps with hue kept, deepens the middle, and
puts real lamps at the doorway, the canopy burst, the two eyes and the far
door — each a pure white core with stepped falloff and hard narrow rays.

### Two things it had to be taught

**The palette was eating the light.** Quantising a dark picture to 44 colours
throws pure white away: median cut spends its entries where the pixels are,
and a few hundred white ones do not earn a slot. The first run produced 2,612
white pixels and saved none of them. The cores are stamped back after
quantising now — one palette entry, and it is the entry the picture is about.

**The doorway was not where the site thought it was.** `AIM.x` was 0.545. The
violet centroid of the actual artwork is 0.503 — nineteen pixels out, which is
why the first pass put the glow off to one side of the arch. Measured now,
in `tools/scene.py` and in `gate.js`, rather than guessed.

### Detail where you are going, not everywhere

The doorway gets its own pass. Away from it the picture is six hard bands
and darkened, which is what makes a light a light — but the same treatment
over the doorway flattened the violets and cyans that were the best thing in
it. Measured: saturation fell from 0.379 to 0.318 and the violet started
losing to the green around it.

So inside a focus region the picture is **22 bands rather than 6**, barely
darkened, almost undithered, and its colour is pushed back out — it now
reads more saturated than the original, not less. The boundary between the
two is dithered rather than faded, so it is made of pixels like everything
else. The chamber does the same around its far door and both eyes.

The effect is that the place you are travelling into carries visibly more
detail than the wood around it, which is the point of a doorway.

### The lamp goes where the light already is

Not on the arch centre. The artwork has its own glow painted into the
doorway, and dropping a lamp on the geometric middle put a white ball above
it that read as a sticker. The centroid of the doorway's brightest 2% is at
(0.535, 0.834); the arch centre is (0.503, 0.745). They are different points
and should be — `AIM` aims the tunnel zoom at the arch, `GLOW` puts the lamp
on the light.

The core's edge is dithered rather than round, too. A clean white circle
reads as a sticker; a ragged one reads as something too bright to look at.

### PX went from 3 to 2

The canvases draw at 1/PX of the screen. At 3, a phone's canvas was about
390 pixels across — **narrower than the 460-pixel artwork**, so the site was
throwing away detail the picture already had, and the result looked like an
old console rather than like pixel art. At 2 the canvas is wider than the
source and everything in it survives. It costs a quarter of the drawing work
rather than a ninth, which is still cheap.

### Keeping the file small enough for a phone

Stamping white into an RGB image cost 274 KB a picture. Quantising to one
short of the budget and putting white in the spare palette slot costs 94 KB
for the same result. The small versions used on narrow screens get their
cores stamped as well — shrinking had been throwing every white pixel away,
losing the whole point of the picture on exactly the devices most likely to
see it.

### The pass never reads its own output

The source images live in `art/scenes/`. The pass ran over a published
`tree.png` once and deepened an already-deepened picture to a mean of 30.
It reads from the source every time now.

### The redraw that did not work

The first attempt drew both scenes from scratch, procedurally. It was worse
than what it replaced: the canopy came out a flat green blob and the light's
rays rendered as fat brown petals — a flower, not a burst. The existing art
has real structure that is not worth losing to prove a point. What it lacked
was contrast, hard edges and an actual light, and those can be added to it.

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

## The wallet checker

`wallet.js`, and `/api/holdings` in `server.js`.

**The site never asks anyone to connect a wallet.** You paste an address and
it says what that address holds: which beings, what they weigh, what $DMT sits
with them, and what that comes to — the same two figures the Rewards chart
gives, because a holder reading one number here and two there would rightly
wonder which is real.

It used to be a connect button, using the Wallet Standard. The checker is
better in every direction that matters:

- **No permission prompt** for something the site does not need. Rewards are
  paid from a snapshot, so a holder who never opens this page still gets
  theirs — connecting was never load-bearing.
- **It works on a phone** with no wallet extension installed.
- **Anybody can check anybody.** A mechanism that claims to be checkable
  should be checkable by people who have not bought in.

### The key lives on the server

Reading the chain needs an RPC key, and a key in a file the site serves is a
key handed to every visitor. `/api/holdings` reads `HELIUS_KEY`, `COLLECTION`
and `TOKEN_MINT` from the environment — set them in **Railway's variables**.

Until `HELIUS_KEY` and `COLLECTION` are set the endpoint answers
`{"ready": false}` and the sheet says there is nothing minted yet, which is
true rather than broken.

### What guards it

| | |
|---|---|
| address shape | base58, 32–44 characters, checked in the browser **and** on the server |
| rate limit | 30 checks a minute per caller, then 429 |
| cache | one answer per address for 30 seconds |
| both maps | cleared if they ever grow past a sane size, so neither leaks memory |

Tested: a bad address never leaves the browser; with a key set it is rejected
before any RPC call; 30 requests pass and the 31st is refused; the rendered
figures match the chart's own sums for the same holding.

## The mint bot

`bot.js`, started by `server.js`. Every new mint is posted to Telegram with
the being's picture, who minted it, how many beings and how much $DMT that
wallet holds, and its estimated share of the pool at a full mint — the same
low / typical / high figures as the holders page, read from the same
`data.js`.

It sleeps until four Railway variables are set:

| Variable | Where it comes from |
|---|---|
| `HELIUS_KEY`, `COLLECTION` | already used by the wallet checker |
| `TG_BOT_TOKEN` | message @BotFather on Telegram, `/newbot` |
| `TG_CHAT_ID` | the group's id (add the bot to the group as an admin first) |

Every 20 seconds it asks for the newest beings and posts the ones it has not
seen, one every 3.5 seconds so a busy mint does not trip Telegram's limit. On
start it learns everything already minted without posting it, so a deploy
never floods the group; a being minted during a restart is not announced.

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

---

## Two things a review caught that the checker had not

Worth recording, because both were the same mistake in different clothes:
**everything computed was verified and everything written by hand was not.**

### A sentence about numbers that was false

The Rewards card said the 400 Commons outweighed every God and the Source
combined. They are 400 points against 661. The earlier version of the line
said forty Commons outweighed a God — 40 against 55 — so a false claim had
already survived one rewrite unchecked, on a page whose entire argument is
that the numbers can be checked.

It is computed from `TIERS` now rather than typed, and the checker asserts
the figures in it and fails if the word "outweigh" comes back.

### An API key in a file every visitor downloads

`data.js` had a `heliusApiKey` field with a comment inviting one to be pasted
in. It was empty, which is the only reason it was not already a leak. Every
visitor downloads that file.

It is gone. If the wallet panel ever needs a paid RPC, it goes behind a small
endpoint in `server.js` reading `process.env`, with the key in Railway's
variables. The checker now fails on any key-shaped field in `data.js`.

### And one the site could not have caught

`og.png` still read "1,111 BEINGS · 10 SECTORS" — baked into the pixels, so it
outlived the sectors by a whole restructure and every posted link advertised a
drop that no longer existed.

`tools/share.py` rebuilds it, and the new one carries **no claim about the
shape of the collection at all** — just the emblem and four beings. Wording
that can go stale belongs in the meta description, where it is text and can
be checked. An image cannot be.

---

## Paying the pool out: the snapshot

    python3 tools/snapshot.py --demo        # prove the arithmetic
    python3 tools/snapshot.py --out payout  # the real list

Nobody connects anything and nobody claims anything. The chain is read at one
moment, every wallet's beings and $DMT are counted, and the list of who gets
how much is written out. A holder who never opens the site again still
receives theirs.

It needs `HELIUS_KEY`, `COLLECTION` and `TOKEN_MINT` **in the environment**.
Never in `data.js` — every visitor downloads that file.

### It pays out to the lamport

Dividing a pool by weight in floating point leaves dust: a few thousand
lamports belonging to nobody. Each wallet takes its floor and the remainder
goes to the largest fractions left over, biggest first, wallet address
breaking ties — so the total paid is exactly the pool and the same snapshot
always gives the same list. `--demo` builds 371 synthetic holders and checks
it: the payouts summed to 208.312500000 SOL, to the lamport.

It also refuses to write a list where a wallet has the wrong multiplier, or
where more weight earns less.

### Two things to settle before you take the snapshot, not after

**A being listed for sale is not held by its owner.** It sits in the
marketplace's escrow, so a naive snapshot pays Magic Eden rather than the
person who listed it. The known escrow programs are in `ESCROW` in the script
and it warns when it sees one — but you have to decide the policy: does a
listed being earn, or not? Publish the answer before the snapshot.

**Announcing the exact moment invites people to borrow tokens for it.**
Somebody can buy 10,000,000 $DMT an hour before, collect the 4x, and sell.
Options: say only the day and not the hour, or take several snapshots across
a window and use the lowest balance. Either is fine. Deciding afterwards is
not, so it goes on the site with everything else.

### What cannot be tested from here

The RPC half. No collection exists yet and this machine cannot reach Helius,
so the chain-reading code is written carefully and unproven. Run it against
the real collection well before you need the list, not on payout day.
