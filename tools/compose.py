"""
REALM — building a being from layers.

The drawn art is white on black, cut out so black is transparent. That is
what makes all of this possible: the being is a stencil, so it can be
tinted, and whatever is put behind it shows through every gap in the cloak.

Everything here is drawn at the being's own rung — 89 pixels for an
Uncommon, 128 for a Rare — and only blown up at the very end. That is why
it stays pixel art instead of turning into a smooth picture with big
squares painted on it.
"""

import numpy as np
from PIL import Image
from scipy import ndimage


# ---------------------------------------------------------------- helpers

def _rng(seed):
    return np.random.default_rng(seed)


def _bayer(n=4):
    """An ordered dither matrix — the reason the gradients look drawn
    rather than airbrushed."""
    m = np.array([[0]])
    while m.shape[0] < n:
        m = np.block([[4*m, 4*m+2], [4*m+3, 4*m+1]])
    return (m + 0.5) / m.size


def _dither(field, seed=0):
    """Turn a 0..1 field into a hard on/off mask through an ordered dither."""
    b = _bayer(8)
    t = np.tile(b, (field.shape[0]//b.shape[0]+1, field.shape[1]//b.shape[1]+1))
    return field > t[:field.shape[0], :field.shape[1]]


# ---------------------------------------------------------------- the eyes

def eyes(alpha, thresh=96):
    """The eyes are holes inside the head: transparent, but enclosed by ink
    and not joined to the outside. Find every such hole, keep the two
    largest in the upper half, and that is the pair."""
    ink = alpha > thresh
    gap = ~ink
    lab, n = ndimage.label(gap)
    border = set(lab[0].tolist()) | set(lab[-1].tolist()) \
           | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    h = alpha.shape[0]
    found = []
    for i in range(1, n + 1):
        if i in border:
            continue
        ys, xs = np.where(lab == i)
        if ys.mean() > h * 0.55:          # below the head — not an eye
            continue
        found.append((len(ys), i))
    found.sort(reverse=True)
    mask = np.zeros_like(ink)
    for _, i in found[:2]:
        mask |= (lab == i)
    return mask


# ---------------------------------------------------------------- layers

def field(w, h, top, bottom, seed=0, stars=True):
    """The sky behind — a dithered vertical wash with stars in it."""
    r = _rng(seed)
    y = np.linspace(0, 1, h)[:, None].repeat(w, 1)
    x = np.linspace(0, 1, w)[None, :].repeat(h, 0)

    # a couple of soft blobs so it is not a flat gradient
    n = np.zeros((h, w))
    for _ in range(3):
        cx, cy, rad = r.uniform(.1,.9), r.uniform(.1,.9), r.uniform(.25,.6)
        n += np.exp(-(((x-cx)**2 + (y-cy)**2) / (2*rad*rad)))
    n = (n - n.min()) / (np.ptp(n) + 1e-9)

    t = np.clip(0.65*y + 0.35*(1-n), 0, 1)
    top, bottom = np.array(top, float), np.array(bottom, float)
    img = top[None,None,:]*(1-t)[:,:,None] + bottom[None,None,:]*t[:,:,None]

    # break the ramp into bands with a dither so it reads as pixels
    step = _dither((t*6) % 1.0, seed)
    img = np.clip(img + step[:,:,None]*9, 0, 255)

    if stars:
        s = r.random((h, w)) > 0.992
        img[s] = np.clip(img[s] + 150, 0, 255)
    return img.astype(np.uint8)


def geometry(w, h, colour, kind=0, seed=0):
    """A sacred-geometry figure behind the being, in one flat colour."""
    y = (np.arange(h)[:,None] - h/2) / (h/2)
    x = (np.arange(w)[None,:] - w/2) / (w/2)
    if   kind == 0: d = np.abs(x) + np.abs(y)            # diamond
    elif kind == 1: d = np.sqrt(x*x + y*y)               # circle
    elif kind == 2: d = np.maximum(np.abs(x), np.abs(y)) # square
    else:           d = np.abs(np.sqrt(x*x+y*y) - 0.55)*3 + 0.3

    rings = np.zeros((h, w), bool)
    for k in (0.42, 0.62, 0.82):
        rings |= (np.abs(d - k) < 0.012)
    out = np.zeros((h, w, 4), np.uint8)
    out[rings] = list(colour) + [255]
    return out


def light(w, h, colour, cx=0.5, cy=0.35, power=1.0, seed=0):
    """A bloom the being stands in front of."""
    y = (np.arange(h)[:,None]/h - cy)
    x = (np.arange(w)[None,:]/w - cx)
    d = np.sqrt(x*x + y*y)
    a = np.clip(1 - d/0.55, 0, 1) ** 2 * power
    a = _dither(a, seed) * a                     # dithered, not airbrushed
    out = np.zeros((h, w, 4), np.uint8)
    out[:,:,0], out[:,:,1], out[:,:,2] = colour
    out[:,:,3] = np.clip(a*255, 0, 255).astype(np.uint8)
    return out


def frame(w, h, colour, inset=2, thick=1):
    out = np.zeros((h, w, 4), np.uint8)
    c = list(colour) + [255]
    out[inset:inset+thick, inset:w-inset] = c
    out[h-inset-thick:h-inset, inset:w-inset] = c
    out[inset:h-inset, inset:inset+thick] = c
    out[inset:h-inset, w-inset-thick:w-inset] = c
    return out


# ---------------------------------------------------------------- the being

def tint(png_path, top, bottom, eye=None, solid=1.0):
    """Colour the stencil. The drawn greys become how much of the colour
    lands, so the shading the artist drew is kept exactly."""
    im = Image.open(png_path).convert("RGBA")
    a = np.asarray(im).astype(float)
    drawn = a[:,:,3]                 # the artist's alpha, never touched
    alpha = drawn
    if solid != 1.0:
        # lift the drawn greys so the being sits in front of the sky rather
        # than letting it through. 1.0 leaves the artist's shading alone.
        alpha = 255.0 * (drawn/255.0) ** (1.0/max(solid, 1e-3))
    h, w = alpha.shape

    t = np.linspace(0, 1, h)[:,None].repeat(w, 1)
    top, bottom = np.array(top, float), np.array(bottom, float)
    col = top[None,None,:]*(1-t)[:,:,None] + bottom[None,None,:]*t[:,:,None]

    out = np.dstack([col, alpha]).astype(np.uint8)

    if eye is not None:
        # always found on the drawn alpha — adjusting solidity changes which
        # gaps count as enclosed, and a fold in the cloak starts reading as
        # an eye
        e = eyes(drawn)
        out[e] = list(eye) + [255]
    return out


def shade(png_path, shadow, mid, light, eye=None, floor=20):
    """The other way to colour a being.

    `tint` treats the drawing as a stencil: the drawn greys become how much
    colour lands, so whatever is behind shows through the dark parts. That is
    right for white line art on black, where the darks ARE the background.

    It is wrong for a being with real tonal modelling. The Mythic's wings and
    dreadlocks are dark on purpose, and as a stencil they turn see-through and
    the sky pours through them.

    So: take the silhouette, fill it in solid, and map the drawn brightness
    along a shadow-to-light ramp instead. Dark stays dark.
    """
    im = Image.open(png_path).convert("RGBA")
    a = np.asarray(im).astype(float)
    drawn = a[:,:,3]

    # the silhouette: anything the artist put down at all, holes filled, so
    # the gaps inside the cloak or between the dreadlocks are part of the body
    body = ndimage.binary_fill_holes(drawn > floor)

    # brightness within the body, stretched to use the whole ramp
    v = drawn.copy()
    inside = v[body]
    if inside.size:
        lo, hi = np.percentile(inside, 2), np.percentile(inside, 98)
        v = np.clip((v - lo) / max(hi - lo, 1e-6), 0, 1)
    else:
        v = np.zeros_like(v)

    shadow, mid, light = (np.array(c, float) for c in (shadow, mid, light))
    lower = shadow[None,None,:] + (mid - shadow)[None,None,:] * np.clip(v*2, 0, 1)[:,:,None]
    upper = mid[None,None,:] + (light - mid)[None,None,:] * np.clip(v*2-1, 0, 1)[:,:,None]
    col = np.where((v[:,:,None] < 0.5), lower, upper)

    out = np.dstack([col, np.where(body, 255, 0)]).astype(np.uint8)

    if eye is not None:
        e = eyes(drawn)
        out[e] = list(eye) + [255]
    return out


# ---------------------------------------------------------------- stacking

def over(base, top):
    """Standard alpha compositing, both RGBA uint8."""
    b = base.astype(float); t = top.astype(float)
    ta = t[:,:,3:4]/255.0; ba = b[:,:,3:4]/255.0
    oa = ta + ba*(1-ta)
    rgb = (t[:,:,:3]*ta + b[:,:,:3]*ba*(1-ta)) / np.clip(oa, 1e-6, None)
    return np.dstack([rgb, oa*255]).astype(np.uint8)


def build(being_png, recipe, out_size=512):
    """Stack one being from a recipe and return it at display size."""
    im = Image.open(being_png)
    w, h = im.size

    canvas = np.dstack([field(w, h, recipe["sky_top"], recipe["sky_bottom"],
                              recipe["seed"], recipe.get("stars", True)),
                        np.full((h, w, 1), 255, np.uint8)])
    if recipe.get("geometry") is not None:
        canvas = over(canvas, geometry(w, h, recipe["geometry"],
                                       recipe.get("geo_kind", 0), recipe["seed"]))
    if recipe.get("light") is not None:
        canvas = over(canvas, light(w, h, recipe["light"],
                                    power=recipe.get("light_power", 1.0),
                                    seed=recipe["seed"]))
    if recipe.get("mode") == "shade":
        canvas = over(canvas, shade(being_png, recipe["shadow"], recipe["mid"],
                                    recipe["light"], recipe.get("eye")))
    else:
        canvas = over(canvas, tint(being_png, recipe["being_top"],
                                   recipe["being_bottom"], recipe.get("eye"),
                                   recipe.get("solid", 1.0)))
    if recipe.get("frame") is not None:
        canvas = over(canvas, frame(w, h, recipe["frame"]))

    img = Image.fromarray(canvas, "RGBA").convert("RGB")
    return img.resize((out_size, out_size), Image.NEAREST)
