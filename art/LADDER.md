# The ladder

Rarity is carried by how finely a being is drawn. A Common is a chunky
sprite you can count the pixels on. A God is dense. Every rung is about
half again as fine as the one below, which is the smallest step that can
actually be seen.

| Tier | Across | What the step does |
|------|--------|--------------------|
| Common | 96 | blocks, plainly |
| Uncommon | 128 | blocks, a little finer |
| Rare | 180 | detail starts to hold |
| Epic | 260 | ornament becomes readable |
| Legendary | 380 | fine linework survives |
| Mythic | 500 | — |
| Entity | 640 | — |
| God | 800 | — |

**Raised once already.** The first ladder topped out at 600 and the masters
are 1,408 across, so scales, feathers and filigree were being thrown away
before anything was coloured. Everything moved up; the God gained a third.
The Mythic now warns that it carries almost nothing at 500 — it is the
softest piece in the cast and genuinely has less to give.

## Where the ladder stops working, and what carries it after that

Tested on the crowned Epic at every rung: **above about 300 pixels the
steps stop being visible.** 300, 440, 640 and 900 look the same at any size
anyone will view them. Density does real work from Common to Legendary and
then it saturates.

So the top four tiers do not get their rank from resolution. They get it
from what is drawn — more ornament, a bigger presence in the frame, rarer
fields and lights behind them, a frame only they wear. The numbers above
still climb past Legendary, but gently, and mostly so the files hold up
when someone zooms in rather than to signal anything.

If a Mythic and a Legendary end up looking equally fine, that is correct.
The Mythic should be recognisable as rarer because of what it *is*.

## You never draw anything twice

Draw every piece as large and as detailed as you like. It is cut to its
rung here, by box-averaging, which is why the Epic came down from 1,244
pixels to 200 without falling apart.

- `masters/` — exactly as drawn, untouched. Everything is cut from these.
- `beings/` — cut to the rung, black keyed to transparent, squared.

Nothing is ever upscaled, because coming down is reversible and inventing
detail is not. That means a piece can be re-cut to a different rung at any
time if a being changes tier, and nothing is lost.

## Files are named for what they are, not what rank they hold

`grey-winged.png`, not `rare-winged.png`. Ranks move; drawings do not. Which
being holds which rank lives in `tiers.json`, one line each, and changing a
line there plus a re-cut is the whole job.

## Keying

All of them sit on pure black with nothing bleeding, so black is keyed to
transparent and each one is squared on its own centre. Soft edges survive
as partial transparency: the Epic's starfield haze blends over whatever
field is behind it rather than sitting in a black box.

## The cast, and why it is ordered this way

| Rank | Drawing | What it gains |
|------|---------|---------------|
| Common | `grey-plain` | — |
| Uncommon | `grey-fourarm` | a third eye, four arms |
| Rare | `grey-winged` | and wings |
| Epic | `crowned` | a cloak and a crown |
| Legendary | `crowned-flame` | a crown of flame, and an aura |
| Mythic | `dread-winged` | opens the third eye, and sits in cloud |
| Entity | `crowned-entity` | a crown, thorn hands, and rises out of the rock |
| God | `god-serpent` | one eye, bone wings, and a serpent coiled beneath |

All eight tiers are drawn.

It is one being ascending, which is why the order is what it is rather than
what each piece was called when it arrived. Three of them moved down a rank
to make room: the plain grey was an Uncommon, the crowned one a Rare, the
flame-crowned one an Epic.

The two crowned ones still share a body below the neck. The crown and the
aura are the tells. Now that they sit a rank apart rather than adjacent,
that matters less than it did — but it is still the pair most likely to be
mistaken for each other.

## Two ways to colour a being

Which one a being uses depends on how it was drawn, and getting it wrong is
visible immediately.

**Stencil.** The drawn greys become how much colour lands, and whatever is
behind shows through the dark parts. Right for white line art on black,
where the dark *is* the background — the crowned pair, the grey sprites.

**Shaded.** The silhouette is filled in solid and the drawn brightness is
mapped along a shadow-to-light ramp instead. Right for a being with real
tonal modelling.

The Mythic is the first that needs the second one. Its wings and
dreadlocks are dark on purpose, and as a stencil they turn see-through and
the sky pours straight through them. Half its ink is mid-grey; on every
other being so far it is about fifteen per cent.

`mode: "shade"` in a recipe picks it, with `shadow`, `mid` and `light`
instead of `being_top` and `being_bottom`.

## Taking a drawing in

    python3 tools/ingest.py <image> <name> <tier>

It keeps the master, cuts to the rung, keys the black out, decides stencil
or shaded, counts the eyes, and writes the lot to `beings.json`. It warns
rather than fails, so nothing is silently wrong.

Three of its checks exist because something went wrong first:

- **the keying is checked** by laying the cut back over black and comparing
  to the master. The alpha was once computed in a number format too small to
  hold 255 × 255, so every being came out inverted.
- **the eyes are counted, and drawn.** Two is right — but a count on its own
  is not evidence. The God reported two eyes while pointing at the gaps in
  its elbows, and the check passed because there happened to be two of them.
  So every being also gets an overlay in `art/checks/`, with whatever was
  found painted pink, and it gets looked at.

  Confining the search to the top third fixed seven of the eight. It cannot
  fix the God, whose eye is drawn — a white and a pupil — rather than left
  open. Nothing that looks for holes can ever find it. That being is marked
  `eye_mode: "drawn"` in `beings.json` and its eye is left to the shading
  ramp, which suits it.
- **detail at the rung is measured** — the art cut to the rung, against the
  art cut to half the rung and blown back up. If those match, there is
  nothing at this rung and the finer cut is wasted.

That last one replaced a worse question. "What size was this drawn at" is
not answerable from a JPEG, and two honest attempts both lied: measuring by
round-trip error said 552 for every piece including a chunky sprite, because
the error falls all the way to full resolution and never bottoms out; reading
the block period off the edge energy said 93 for the finest piece we have.
Whether the rung is earning its place can actually be measured, so that is
what gets measured.

## Still to come

| | Drawn | Left |
|---|---|---|
| Beings | 8 | 0 — all eight tiers drawn |
| Fields | 0 | 6 |
| Geometries | 0 | 6 |
| Lights | 0 | 5 |
| Frames | 0 | 4 |
| One-of-ones | 0 | 7 |

---

# Generating a round

    python3 tools/round.py <round-number> [out-dir]

111 beings, a PNG and a Metaplex JSON each, then it checks its own work and
refuses to finish if anything is off. The same round number always gives the
same round.

Every image is 1200 × 1200, about 68 KB — 7.5 MB for a whole round.

## The tier counts are dealt, not rolled

40 Common, 28 Uncommon, 18 Rare, 11 Epic, 7 Legendary, 4 Mythic, 2 Entity,
1 God. The list is built to those exact counts and then shuffled, so a round
cannot come out with two Gods or none.

## Whole-number scaling

Each tier has its own canvas in art pixels and its own scale, chosen so they
all land on 1200 with a whole number: 80×15, 100×12, 150×8, 240×5, 300×4,
400×3, 600×2. A fractional scale would make some pixel rows wider than
others, which is obvious the moment you see a grid of them.

A rarer being sits on a canvas closer to its own size, so it fills more of
the picture. The God fills it entirely.

## A unique combination is not enough at the top

The first round generated had two Entities that were both Deep, two Mythics
both Void, and two Legendaries both Bone. Every one was a unique combination
— they differed by a frame or a piece of geometry — and every one read as the
same picture as its twin. These are the pieces meant to feel singular.

So for any tier with seven or fewer in a round, the colourway is dealt
without replacement. Seven Legendaries against six fields means exactly one
repeat is forced, and the check allows exactly that many and no more.

## What is checked before it will finish

- 111 beings, and the tier counts exactly as above
- every combination of being, field, geometry, light and frame unique
- no avoidable repeated colourway in a scarce tier
- every image present, 1200 × 1200, and not blank
- every being matched to the tier it was assigned

It prints the problems and exits rather than writing a round that is wrong.
