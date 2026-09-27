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
