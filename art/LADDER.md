# One quality for everything

Every tier's drawing is cut at **480 pixels**, onto a **600-pixel canvas at
scale 4**, landing on 2400. Every picture in the collection is made the same
way at the same resolution.

## Rarity is carried by the traits, not by the resolution

| Tier | Traits firing, on average |
|------|---------------------------|
| Common | 4.5 |
| Uncommon | 6.0 |
| Rare | 6.8 |
| Epic | 8.0 |
| Legendary | 8.6 |
| Mythic | 9.0 |
| Entity | 9.0 |
| God | 11.0 |

Plus which colourway is worn — the rarest tiers draw from a restricted pool —
and how elaborate the drawing itself is, which is the artist's doing and
needs no help from the renderer.

## Why the density ladder was wrong

Rarity used to be carried by how finely a being was drawn: a Common cut at 84
pixels, the God at 680. The idea was that a Common should look like a chunky
sprite and a God should not.

What it actually did was **draw the Common's whole picture at a fifth of the
resolution.** The canvas is shared: at 120 art pixels the mandala behind the
Common had 120 pixels to live in, and so did its stars, its mushrooms and its
floor. The character was never the problem. The two tiers looked like two
different collections, one of them badly made.

It also never worked on its own terms. Tested early on, the steps stopped
being visible above about 300 pixels — 300, 440, 640 and 900 were the same
picture at any size anyone would view them at. Half the ladder was doing
nothing even then.

A Common is still plainly a Common: it is a simpler drawing, it wears a
commoner colour, and four or five things happen in its picture instead of
eleven. None of that needs the picture to be worse.

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
