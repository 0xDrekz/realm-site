#!/usr/bin/env python3
"""
REALM — the two scenes: the door in the tree, and the chamber behind it.

    python3 tools/scene.py

Both used to be soft. The brightest pixel in the old tree was 240 and it was
never white anywhere, which is exactly why the light read as a haze rather
than as a light: nothing in the picture was a SOURCE, only things that were
somewhat bright.

Three rules hold the whole thing together.

  1. A light has a hot core. A handful of pure white pixels, then hard steps
     out from it. Not a gradient. Pixel art reads a light by its steps, the
     way a woodcut does, and a smooth falloff just reads as blur.

  2. Everything is banded. A continuous field -- a distance, some noise -- is
     cut into N bands and each band takes one colour from a ramp. Boundaries
     get an ordered dither so they break up on the pixel grid instead of
     making a smooth edge. Nothing here is ever anti-aliased.

  3. The dark has to be dark. The old pictures averaged 80 out of 255; a
     light cannot stand out against that. These sit near 40, so the door
     glows rather than merely being present.
The originals live in art/scenes/. The pass NEVER reads the published
tree.png or chamber.png -- it did once, ran over its own output, and
deepened an already-deepened picture down to a mean of 30. Always from
the source, every time.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TREE    = (460, 680)
CHAMBER = (460, 667)

# where the site aims. gate.js zooms at the doorway and puts its glow at the
# canopy burst; journey.js lights the eyes and the far door. These are the
# same fractions the old pictures used, so nothing in the JS has to move.
GLOW = (0.535, 0.834)      # where the artwork's OWN light already is,
                           # measured as the centroid of its brightest 2%.
                           # Not the same point as the arch centre, and it
                           # should not be: a lamp dropped on the middle of
                           # the doorway sat above the glow already painted
                           # there and read as a ball stuck on the picture.
AIM  = (0.503, 0.745)      # the doorway in the trunk — MEASURED off the
                           # art (the violet centroid), not guessed. It had
                           # been 0.545, nineteen pixels to the right of the
                           # real arch, which is why the glow sat off-centre.
SUN  = (0.513, 0.436)      # the burst through the canopy
EYE_HIGH = (0.500, 0.094)
EYE_BIG  = (0.500, 0.358)
DOOR     = (0.500, 0.655)
FLOOR    = 0.735


# ---------------------------------------------------------------- the grid
def bayer(n=8):
    """Ordered dither. Boundaries between bands break up on this rather than
    fading, which is what keeps every edge on the pixel grid."""
    m = np.array([[0]])
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return m / m.size


def tile(mask_shape, n=8):
    b = bayer(n)
    return np.tile(b, (mask_shape[0] // n + 1, mask_shape[1] // n + 1))[
        :mask_shape[0], :mask_shape[1]]


def band(field, ramp, lo=0.0, hi=1.0, dither=0.5):
    """Cut a continuous field into len(ramp) hard bands.

    `dither` is how much of one band's width the ordered pattern can pull a
    pixel across the boundary. 0 gives a clean hard edge, 1 gives a fully
    broken one. Somewhere near a half is what looks hand-placed.
    """
    n = len(ramp)
    t = np.clip((field - lo) / max(hi - lo, 1e-9), 0, 1)
    t = t + (tile(field.shape) - 0.5) * (dither / n)
    idx = np.clip((t * n).astype(int), 0, n - 1)
    return np.array(ramp, dtype=np.uint8)[idx]


def ramp(*stops, steps=6):
    """A few colours, spread into `steps` hard ones."""
    stops = np.array(stops, dtype=float)
    out = []
    for i in range(steps):
        p = i / max(steps - 1, 1) * (len(stops) - 1)
        a, b = int(p), min(int(p) + 1, len(stops) - 1)
        out.append(tuple((stops[a] + (stops[b] - stops[a]) * (p - a)).astype(int)))
    return out


def grid(shape):
    h, w = shape
    y, x = np.mgrid[0:h, 0:w]
    return x.astype(float), y.astype(float)


def fbm(shape, octaves=5, seed=0, lac=2.0):
    """Value noise, for bark grain and leaf clumping. Built from small
    integer grids blown up with nearest so it stays chunky."""
    rng = np.random.default_rng(seed)
    h, w = shape
    out = np.zeros(shape)
    amp, size = 1.0, 4
    total = 0.0
    for _ in range(octaves):
        g = rng.random((max(2, int(size)), max(2, int(size * w / h))))
        up = np.asarray(Image.fromarray((g * 255).astype(np.uint8))
                        .resize((w, h), Image.BILINEAR)) / 255.0
        out += up * amp
        total += amp
        amp *= 0.5
        size *= lac
    return out / total


# ------------------------------------------------------------- the light
def source(canvas, cx, cy, r, core, mid, far, rays=0, ray_len=2.4,
           seed=0, aspect=1.0):
    """A light with a hot core and hard steps out of it.

    This is the piece the old pictures were missing. The centre is pure
    white -- actually white, not nearly -- and the falloff is a handful of
    discrete rings, so the eye reads a bulb rather than a smudge.
    """
    h, w = canvas.shape[:2]
    x, y = grid((h, w))
    dx, dy = (x - cx) / aspect, y - cy
    d = np.sqrt(dx * dx + dy * dy)

    glow = np.clip(1 - d / (r * 6.0), 0, 1) ** 2.2

    if rays:
        ang = np.arctan2(dy, dx)
        rng = np.random.default_rng(seed)
        spin = rng.random() * 6.283
        lengths = 0.55 + rng.random(rays) * 0.9
        spoke = np.zeros_like(d)
        for i in range(rays):
            a = spin + i * 6.283 / rays
            # a hard-edged wedge, narrowing as it goes out
            da = np.abs(((ang - a + np.pi) % 6.283) - np.pi)
            width = 0.055 + 0.16 * np.clip(d / (r * 6), 0, 1)
            reach = r * 6 * ray_len * lengths[i]
            spoke = np.maximum(spoke,
                               np.clip(1 - da / width, 0, 1)
                               * np.clip(1 - d / reach, 0, 1) ** 1.5)
        glow = np.maximum(glow, spoke * 0.92)

    pal = [far, far, mid, mid, core, (255, 255, 255)]
    lit = band(glow, pal, 0.06, 1.0, dither=0.65)

    # the core is placed rather than banded, so it is certainly white and
    # certainly small -- that is the whole difference between a lamp and a mist
    hot = d < r * 0.85
    lit[hot] = (255, 255, 255)

    take = glow > 0.06
    canvas[take] = lit[take]
    return glow


def over(canvas, colour, mask):
    canvas[mask] = colour


def save(a, path, small_path, colours=44, cores=()):
    """Write the picture, and make sure the light survives the palette.

    Quantising a mostly-dark picture to 44 colours throws pure white away --
    median cut spends its entries where the pixels are, and a few hundred
    white ones do not earn a slot. The first pass here produced 2,612 white
    pixels and saved 0 of them, which would have made the whole exercise
    pointless and looked exactly like the soft version it replaced.

    So the cores are stamped back after quantising. Each is a couple of
    dozen pixels; it costs one palette entry and it is the entry the
    picture is about.
    """
    im = Image.fromarray(a.astype(np.uint8))

    # Quantise to one short of the budget, then put white in the spare slot
    # and point the cores at it. Stamping white into an RGB image instead
    # cost 274 KB a picture rather than 90 -- a paletted PNG is a third the
    # size, and a phone pays for every one of those bytes.
    q = im.quantize(colors=colours - 1, method=Image.MEDIANCUT,
                    dither=Image.Dither.NONE)
    pal = q.getpalette()[: (colours - 1) * 3]
    white = colours - 1
    pal += [255, 255, 255]
    idx = np.asarray(q).copy()

    h, w = idx.shape
    yy, xx = np.mgrid[0:h, 0:w]
    tiled = tile((h, w))
    for (cx, cy, r) in cores:
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(r, 1e-6)
        idx[(d + (tiled - 0.5) * 0.9) < 1.0] = white

    q = Image.fromarray(idx, mode="P")
    q.putpalette(pal)
    q.save(path, optimize=True)
    out = np.asarray(q.convert("RGB"))
    im = q
    # The small version is what a narrow phone loads, and shrinking threw
    # every white pixel away -- the whole point of the picture, gone on the
    # devices most likely to see it. Its cores are stamped too.
    w, h = im.size
    sw = 240
    sh = round(sw * h / w)
    small = (q.convert("RGB").resize((sw, sh), Image.LANCZOS)
               .quantize(colors=39, method=Image.MEDIANCUT,
                         dither=Image.Dither.NONE))
    spal = small.getpalette()[:39 * 3] + [255, 255, 255]
    sidx = np.asarray(small).copy()
    syy, sxx = np.mgrid[0:sh, 0:sw]
    stile = tile((sh, sw))
    k = sw / w
    for (cx, cy, r) in cores:
        d = np.sqrt((sxx - cx * k) ** 2 + (syy - cy * k) ** 2) / max(r * k, 1e-6)
        sidx[(d + (stile - 0.5) * 0.9) < 1.0] = 39
    small = Image.fromarray(sidx, mode="P")
    small.putpalette(spal)
    small.save(small_path, optimize=True)
    arr = out
    print(f"  {os.path.basename(path)}  {im.size}  "
          f"mean {arr.mean():.0f}  brightest {arr.max()}  "
          f"white pixels {(arr.min(axis=2) > 250).sum()}")


# ============================================ making a picture defined
def posterise(a, bands=6, dither=0.30):
    """Hard value steps, hue kept.

    The complaint was that the pictures were soft, and softness in a picture
    like this is a value problem rather than a colour one: everything sits
    at a slightly different brightness from everything next to it, so no
    edge is anywhere. So the VALUE is cut into a few hard steps and the hue
    and saturation ride along unchanged. Colour survives; mush does not.
    """
    f = a.astype(float)
    v = f.max(axis=2)
    keep = v > 2
    t = np.clip(v / 255.0, 0, 1)
    t = t + (tile(v.shape) - 0.5) * (dither / bands)
    step = np.clip(np.round(t * bands) / bands, 0, 1) * 255.0
    scale = np.where(keep, step / np.maximum(v, 1), 1.0)[..., None]
    return np.clip(f * scale, 0, 255)


def deepen(a, gamma=1.55, floor=0.0):
    """Push the middle down so a light has somewhere to stand out from.

    The old tree averaged 80 out of 255 with nothing above 240 — 18,000
    pixels were "quite bright" and none of them was a source. Darkening the
    middle is most of what makes the light read.
    """
    f = np.clip(a.astype(float) / 255.0, 0, 1)
    return (np.clip(f ** gamma - floor, 0, 1) * 255.0)


def saturate(a, k):
    """Push colour away from grey.

    Banding and a light both pull toward grey and white, and measuring the
    doorway after the first pass showed exactly that: saturation 0.379 down
    to 0.318, and the violet losing to the green around it. The detailed
    region gets its colour pushed back out deliberately rather than merely
    being damaged less.
    """
    g = a.mean(axis=2, keepdims=True)
    return np.clip(g + (a - g) * k, 0, 255)


def add_light(a, glow, colour):
    """Screen a glow over the picture, so it lightens without washing out."""
    g = glow[..., None]
    c = np.array(colour, dtype=float)
    return 255.0 - (255.0 - a) * (255.0 - c * g) / 255.0


def beam(shape, cx, cy, r, rays, ray_len, seed, aspect=1.0, spread=6.0):
    """The shape of a light: a tight falloff, and hard narrow spokes."""
    h, w = shape
    x, y = grid((h, w))
    dx, dy = (x - cx) / aspect, y - cy
    d = np.sqrt(dx * dx + dy * dy)

    glow = np.clip(1 - d / (r * spread), 0, 1) ** 2.4

    if rays:
        ang = np.arctan2(dy, dx)
        rng = np.random.default_rng(seed)
        spin = rng.random() * 6.283
        lens = 0.5 + rng.random(rays) * 1.0
        spoke = np.zeros_like(d)
        for i in range(rays):
            aa = spin + i * 6.283 / rays
            da = np.abs(((ang - aa + np.pi) % 6.283) - np.pi)
            width = 0.012 + 0.030 * np.clip(d / (r * spread), 0, 1)
            reach = r * spread * ray_len * lens[i]
            spoke = np.maximum(spoke, np.clip(1 - da / width, 0, 1) ** 0.7
                                      * np.clip(1 - d / reach, 0, 1) ** 1.7)
        glow = np.maximum(glow, spoke * 0.85)

    # banded, so the falloff is steps rather than a smear
    glow = np.round(glow * 7) / 7
    return glow, d


def lamp(a, cx, cy, r, colour, rays=0, ray_len=2.2, seed=0, aspect=1.0,
         spread=6.0, core=(255, 255, 255)):
    """Put an actual light into the picture: hot white core, hard steps out."""
    glow, d = beam(a.shape[:2], cx, cy, r, rays, ray_len, seed, aspect, spread)
    out = add_light(a, glow, colour)

    # The core's edge is dithered rather than round. A clean circle of white
    # reads as a sticker; a ragged one reads as something too bright to
    # look at, which is what a light is.
    edge = (tile(d.shape) - 0.5) * 0.9
    hot = (d / max(r, 1e-6) + edge) < 1.0
    out[hot] = core
    return out


def focus(shape, cx, cy, r, aspect=1.0, soft=0.5):
    """A hard-edged region of extra detail.

    The edge is dithered rather than faded, so the boundary between the
    detailed part and the chunky part is itself made of pixels — a soft
    vignette would look like a mistake next to everything else here.
    """
    h, w = shape
    x, y = grid((h, w))
    d = np.sqrt(((x - cx) / aspect) ** 2 + (y - cy) ** 2) / r
    t = np.clip(1 - (d - 1) / max(soft, 1e-6), 0, 1)
    return (t + (tile((h, w)) - 0.5) * 0.55) > 0.5


def pass_over(src, lights, gamma, bands, out_name,
              fine=None, fine_bands=20, fine_gamma=1.0, fine_sat=1.0):
    """Two passes, and a region that keeps the finer one.

    Away from the light the picture is cut into a few hard bands and
    darkened, which is what makes a light a light. But the same treatment
    over the doorway flattened the violets and cyans that were the best
    thing in it.

    So the doorway gets its own pass: many more bands, barely darkened,
    almost no dither. Its colour survives and it carries visibly more
    detail than the wood around it — which is the point. You are meant to
    be looking at somewhere you could travel into, not at a hole.
    """
    a = np.asarray(Image.open(f"{ROOT}/{src}").convert("RGB")).astype(float)
    before = a.copy()

    coarse = posterise(deepen(a, gamma), bands)
    out = coarse

    if fine:
        detailed = posterise(saturate(deepen(a, fine_gamma), fine_sat),
                             fine_bands, dither=0.12)
        for spec in fine:
            m = focus(a.shape[:2], **spec)
            out = np.where(m[..., None], detailed, out)

    a = out
    for L in lights:
        a = lamp(a, **L)
    a = np.clip(a, 0, 255)
    print(f"  {out_name}: mean {before.mean():.0f} -> {a.mean():.0f}, "
          f"brightest {int(before.max())} -> {int(a.max())}, "
          f"white pixels {(a.min(axis=2) > 250).sum()}")
    return a


def main():
    W, H = TREE
    print("the door in the tree:")
    t = pass_over("art/scenes/tree-source.png", [
        dict(cx=SUN[0] * W, cy=SUN[1] * H, r=W * 0.017,
             colour=(255, 238, 186), rays=10, ray_len=3.0, seed=5, spread=7.5),
        dict(cx=GLOW[0] * W, cy=GLOW[1] * H, r=W * 0.0085,
             colour=(150, 100, 244), rays=6, ray_len=1.25, seed=9,
             aspect=0.62, spread=4.6),
    ], gamma=1.55, bands=6, out_name="tree.png",
        # the doorway keeps its own colours and carries three times the
        # gradation of the bark around it
        fine=[dict(cx=AIM[0] * W, cy=(AIM[1] + 0.035) * H, r=H * 0.135,
                   aspect=0.55, soft=0.40)],
        fine_bands=22, fine_gamma=0.92, fine_sat=1.45)
    save(t, f"{ROOT}/tree.png", f"{ROOT}/tree-small.png",
         cores=[(SUN[0] * W, SUN[1] * H, W * 0.017),
                (GLOW[0] * W, GLOW[1] * H, W * 0.0085)])

    W, H = CHAMBER
    print("the chamber:")
    c = pass_over("art/scenes/chamber-source.png", [
        dict(cx=DOOR[0] * W, cy=DOOR[1] * H, r=W * 0.014,
             colour=(196, 158, 255), rays=5, ray_len=1.7, seed=17,
             aspect=0.6, spread=7.0),
        dict(cx=EYE_BIG[0] * W, cy=EYE_BIG[1] * H, r=W * 0.010,
             colour=(255, 226, 150), rays=0, spread=5.0),
        dict(cx=EYE_HIGH[0] * W, cy=EYE_HIGH[1] * H, r=W * 0.009,
             colour=(224, 204, 255), rays=8, ray_len=3.4, seed=2, spread=6.0),
    ], gamma=1.45, bands=9, out_name="chamber.png",
        # the far door and both eyes are what you look at, so they keep
        # their detail; the walls stay chunky
        fine=[dict(cx=DOOR[0] * W, cy=DOOR[1] * H, r=H * 0.115, aspect=0.75),
              dict(cx=EYE_BIG[0] * W, cy=EYE_BIG[1] * H, r=H * 0.105, aspect=1.5),
              dict(cx=EYE_HIGH[0] * W, cy=EYE_HIGH[1] * H, r=H * 0.055, aspect=1.5)],
        fine_bands=20, fine_gamma=1.0, fine_sat=1.30)
    save(c, f"{ROOT}/chamber.png", f"{ROOT}/chamber-small.png",
         cores=[(DOOR[0] * W, DOOR[1] * H, W * 0.014),
                (EYE_BIG[0] * W, EYE_BIG[1] * H, W * 0.010),
                (EYE_HIGH[0] * W, EYE_HIGH[1] * H, W * 0.009)])

    print("\ngate.js and journey.js aim at the same fractions, so nothing moves.")


if __name__ == "__main__":
    main()
