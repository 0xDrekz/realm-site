# The traits

Not tints over a finished picture. Each of these is a layer of its own that
either appears or does not, and a collector can point at it and name it.

| Trait | Values | Rarest |
|-------|--------|--------|
| Colourway | Void, Ember, Deep, Verdigris, Bone, Aurum, Bloom, Eclipse | Eclipse |
| Geometry | None, Mandala, Flower, Yantra, Metatron, Rays, Lattice, Tree, Weird | — |
| Stars | None, Sparse, Field, Dense | Dense |
| Planets | None, One, Two, Ringed, Cluster | Ringed |
| UFOs | None, One, Few, Fleet | Fleet |
| Smoke | None, Wisp, Rising, Shroud | Shroud |
| Moon dust | None, Faint, Drifting, Heavy | Heavy |
| Eyes | Plain, Slit, Ringed, Spiral, Starburst, Void | Void |

## The order they go down in

    black
    stars            far off
    planets          far off
    geometry         behind the being, glowing in three passes
    UFOs             between the geometry and the being
    the being        outlined, with its eyes drawn into
    smoke            in front of the being's feet
    moon dust        in front of everything, thin

That order is the job. Smoke behind the being is wallpaper; in front of its
feet it is smoke.

## Colour carries rarity on its own

Each colourway has a weight — how often it comes up — and nothing else. Void
at 26 against Eclipse at 1 means Eclipse turns up about once in a round.
A colour can be made rarer or commoner by changing one number, with no
picture touched.

## The eyes are drawn into, not filled

Each eye is found as its own blob and the design is fitted to that blob's own
box, so it works at any size or shape: a slit, concentric rings, a spiral, a
starburst, or Void, which inverts it. Every one gets a single-pixel glint.

A being whose eye was drawn rather than left open — the God — is marked
`eye_mode: drawn` and skips this entirely.

## Three of these were wrong first time

- **UFOs were drawn behind the being.** Four were being rendered and one was
  visible. They are kept out of the centre column now, where the being
  stands.
- **Smoke was a dithered column,** which through an ordered dither comes out
  as regular diagonal hatching — it read as crosshatch texture, not smoke. It
  is built from overlapping round puffs climbing and spreading now.
- **The tree grew off the bottom of the canvas** and all that showed was its
  stem.

None of the three would have failed loudly. They would have shipped.

---

# Colour, part by part

The being is split into seven parts — crown, hair, face, wings, arms, body,
base — and each gets its own colour. Purple hair, gold face, red arms.

Inside each part the drawn brightness still does the shading, so a red arm
has a dark red and a bright red rather than being a flat block.

| Scheme | How often | Reads as |
|--------|-----------|----------|
| Regalia | 20 | purple hair, gold face, red arms |
| Verdant | 18 | green and gold, pink arms |
| Furnace | 16 | fire all the way through |
| Abyss | 14 | blue, with violet arms |
| Ossuary | 10 | bone white, red arms |
| Auric | 7 | gold throughout |
| Bloom | 3 | magenta and mint |
| Eclipse | 1 | grey, with blood |

## The parts are read off the art, not marked by hand

No second drawing, no colour key. `tools/parts.py` works them out from what
is already there:

- **Hair is the dark inside the silhouette.** Not background — on these
  beings, dark enclosed by the body is hair. It comes to 58% of the Entity,
  40% of the Mythic and 15% of the plain sprite, which is exactly how much
  hair each one has.
- **The eyes anchor the head.** Everything above the brow is crown, between
  brow and chin and near the middle is face. Because it keys off the eyes, it
  works whatever the proportions are.
- **Thickness separates an arm from a wing.** A wing is a sheet, an arm is a
  stick. Position alone called the arms of a wingless alien its wings, since
  all the rule had to go on was "far from the middle".
- **Assignment is per pixel, not per fragment.** Labelling the bright areas
  gives 435 fragments on the Entity, and handing a whole fragment to one part
  put a crown and the face it touches in the same bucket — their shared
  fragment had one middle and it landed on the face.

`tools/parts.py preview()` draws the map. It is meant to be looked at.

## Smoke comes out of the mouth

The mouth is found below the eyes, on the line between them, with the gap
between the eyes setting the scale so it lands right on a wide face and a
narrow one alike. A being with no open eyes falls back to a fraction down
from the top of its silhouette.

The plume starts tight at the mouth and opens as it climbs. Its first puffs
were three pixels across and disappeared, which made the smoke look like it
began somewhere above the head.
