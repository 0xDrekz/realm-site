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

## The one exception

`uncommon-grey.png` was drawn native, at 89 across, as a true sprite. It is
already at its rung, so its master is just the original file. If it ever
needs to be a Rare, it would have to be redrawn — it is the only piece so
far that cannot be moved up.

## Keying

All three sit on pure black with nothing bleeding, so black is keyed to
transparent and each one is squared on its own centre. Soft edges survive
as partial transparency: the Epic's starfield haze blends over whatever
field is behind it rather than sitting in a black box.

## The Rare and the Epic share a body

They are the same being with a different crown. The Rare wears a solid
blocky one, the Epic a crown of flame, and the Epic carries a starfield
aura the Rare does not. Below the neck they are near enough identical.

That may be exactly right — one entity, higher forms of it, and the aura is
the tell at thumbnail size. But it is worth deciding on purpose rather than
by accident, because the being is the loudest thing in the picture and the
field, light and frame layers behind it cannot do much to separate two
tiers that share a silhouette.

## Still to come

| | Drawn | Left |
|---|---|---|
| Beings | 3 | 9 |
| Fields | 0 | 6 |
| Geometries | 0 | 6 |
| Lights | 0 | 5 |
| Frames | 0 | 4 |
| One-of-ones | 0 | 7 |
