# The traits

Not tints over a finished picture. Each of these is a layer of its own that
either appears or does not, and a collector can point at it and name it.

## The background — seven, and only these seven

| Trait | Values |
|-------|--------|
| Stars | None, Sparse, Field, Dense |
| Geometry | None, Mandala, Flower, Yantra, Metatron, Rays, Lattice, Tree, Weird, Rosette, Gatefold, Spiral |
| Smoke | None, Wisp, Rising, Shroud |
| UFOs | None, One, Few, Fleet |
| Planets | None, One, Two, Ringed, Cluster |
| Explosions | None, One, Two, Barrage |
| Lightning | None, Strike, Storm, Tempest |
| Trees | None, One, Copse, Forest |
| Mushrooms | None, Few, Cluster, Grove |

Hands, moths and moons were built and removed. They were never asked for and
they do not belong in this realm — a background of drifting body parts is a
different collection. The list above is the list.

## On the being itself

| Trait | Values |
|-------|--------|
| Colourway | Regalia, Verdant, Furnace, Abyss, Ossuary, Auric, Bloom, Eclipse |
| Eyes | Plain, Slit, Ringed, Spiral, Starburst, Void |

| Moon dust | None, Faint, Drifting, Heavy |

Moon dust sits behind the being with everything else.

## The order they go down in

    black
    stars            far off
    planets          far off
    geometry         in layers, glowing
    lightning
    UFOs
    explosions
    smoke            out of the mouth, rising behind the head
    moon dust
    the being        last, on top of all of it

EVERYTHING goes behind the being. Smoke and dust used to sit in front, which
made them read as weather happening to the picture rather than in it, and put
haze over the face — the one part of a being anybody looks at.

The smoke is still born at the mouth; it is only drawn earlier, so it climbs
from behind the head rather than across the face.

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
- **Height separates an arm from a wing.** Wings sit high, arms hang low.
  Thickness was tried first — a wing is a sheet, an arm is a stick — but the
  bones running through a wing are thin, so one wing came out in two colours.
- **Every part is settled into one solid area.** Each pixel is handed to
  whichever part wins its neighbourhood, so a bone inside a wing joins the
  wing while an arm out in open space stays an arm. Without this the map was
  right about where things were and wrong about what they belonged to, which
  is the one thing a part map cannot be.
- **Hair is kept narrow.** At the full width of the being, the dark inner
  half of a wing fell inside the hair zone and every winged being came out
  with violet wings and a violet base.
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

---

# Colour across a part, and things living in the background

## Wings that change colour along their length

A part can now carry two ramps and a direction, so one wing runs gold at the
top into red at the bottom. However many stops a single ramp has, it can only
ever fade one hue into itself, which is why the wings stayed flat while
everything else improved.

| Scheme | The wing runs |
|--------|---------------|
| Regalia | violet into red |
| Verdant | green into amber |
| Furnace | gold into red |
| Abyss | blue into violet |

## Motifs

Patterns are geometry. These are things: **Eyes** (sclera, veins, iris,
pupil, a glint), **Moths** (eyespots on the wings, antennae), **Hands** (four
fingers, a thumb, an eye in the palm) and **Moons** (cratered crescents).

They are scattered behind the geometry at several sizes, the far ones dimmer,
and kept clear of the middle where the being stands.

Three passes to get them right:

- **Too small and too dim** and they were smudges — shapes of roughly the
  right colour dissolving into the pattern. Every one now gets a dark rim,
  which is what makes a thing read as a thing rather than a stain.
- **Too large and too bright** and they competed with the being, and the
  picture had no subject. They sit at about a sixth of the frame and never
  above 82% brightness.
- **The hand was a blob.** Its fingers started in the middle of the palm and
  were shorter than the palm was wide, so they never emerged.


---

# Explosions and lightning

**Explosions** are a white core, a hot shell cooling outward, a dithered
shockwave thrown out to twice the fireball's width, and shards with trails
behind them.

Fire is hot whatever the colourway is. Keying the colours off the palette's
accent made the Ember explosions come out **cyan**, which is not a thing an
explosion does. Only the outermost ring — the part that is really lit smoke —
takes the palette's colour now.

**Lightning** walks downward in long straight runs with a sharp kink between
them, and forks once per run rather than always.

Wandering a little every step with a branch always possible made a fine web
that read as cracks in glass. A bolt is mostly straight; it is the sudden
angles that make it read as one. The bolts are also drawn thick with a wide
dim halo, because a one-pixel bolt at any distance is a gold thread.


---

# Rarity decides how loud a picture is

Every tier carries a loudness from 0 to 1 — a Common at 0, the God at 1 —
and it does three things.

**It tilts every trait roll toward its louder values.** Each trait's values
are listed quiet first and loud last, and loudness multiplies the odds the
further down that list a value sits. A God lands on Barrage and Tempest
often; a Common almost never does.

**It pushes the colour harder.** The vibrancy figure on a colour scheme rises
with loudness, so the same scheme is richer on a rarer being.

**It makes the being larger.** A Common fills 70% of its frame, the God 85%.

Measured over a generated round, counting how many of explosions, lightning,
UFOs and planets are present:

| Tier | Loud traits, on average |
|------|------------------------|
| Common | 1.00 |
| Uncommon | 1.86 |
| Rare | 2.11 |
| Epic | 2.64 |
| Legendary | 2.57 |
| Mythic | 2.50 |
| Entity | 3.50 |
| God | 4.00 |

The generator refuses to finish if the rare end is not louder than the
common end, because a ladder nobody checked is a ladder that quietly breaks.

## The rarest tiers do not draw from the whole set

Weighting the odds toward rare colourways was tried twice and both times a
God came out in a common colour. At 72% odds of a rare one, a miss is not
unlikely — it is expected once in four. Whether a God wears a rare colour is
a rule, not a probability, so the rarest tiers draw from a restricted pool:
God and Entity from the three rarest colourways, Mythic from four, Legendary
from five.

That has a consequence worth stating: seven Legendaries drawing from five
colourways must repeat twice. The check allows exactly that many and no more.
It failed the first time for measuring against all eight.


---

# The floor

Trees and mushrooms need something to be rooted in, so a floor appears —
but only when something grows on it, and only as a dithered band fading
upward. There is no hard line anywhere and nothing reads as a stage. The
background stays black.

Both are placed far-to-near and pushed out to the sides, because the being
owns the middle of the ground and anything planted there is never seen.

Two passes on the mushrooms. The first crop was too small to make out and
all of it was clumped around one point, which put the whole lot behind the
being. Enlarged, they overshot — a near mushroom stood taller than the trees
and buried them. Mushrooms are ankle height; trees are not.
