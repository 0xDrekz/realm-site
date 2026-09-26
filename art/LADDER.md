# The ladder

Rarity is carried by how finely a being is drawn. A Common is a chunky
sprite you can count the pixels on. A God is dense. Every rung is about
half again as fine as the one below, which is the smallest step that can
actually be seen.

| Tier | Across | What the step does |
|------|--------|--------------------|
| Common | 64 | blocks, plainly |
| Uncommon | 89 | blocks, a little finer |
| Rare | 128 | detail starts to hold |
| Epic | 200 | ornament becomes readable |
| Legendary | 300 | fine linework survives |
| Mythic | 380 | — |
| Entity | 480 | — |
| God | 600 | — |

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

## What the round-trip test is for

Every drawing is checked by cutting it to a size, blowing it back up with
hard edges and comparing to the original. The size where that error bottoms
out is the size it was really drawn at.

It corrected a mistake here. The plain grey alien was read as a native
89-pixel sprite and written up as the one piece that could never move up the
ladder. Searched over a wider range it bottoms out at 183, and at 89 its
mouth and nose were quietly degrading. All three sprites measure 183 to 198,
so the whole sprite family can sit at any rung up to about 190.

## Still to come

| | Drawn | Left |
|---|---|---|
| Beings | 6 | 6 |
| Fields | 0 | 6 |
| Geometries | 0 | 6 |
| Lights | 0 | 5 |
| Frames | 0 | 4 |
| One-of-ones | 0 | 7 |
