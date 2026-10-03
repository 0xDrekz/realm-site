"""
REALM — finishes: a rare treatment laid over a finished being.

The colourway decides what colours a being wears. A finish decides what it
is MADE of — foil, gold leaf, light — the way a foil card turns up in a pack.
None of these needs a new drawing: each works from the being's own pixels
and its silhouette, at the art grid, before the picture is cut to its
palette, so the result is still pixel art on the same grid as everything
else.

    being(hold, kind, seed)          the being's own layer, before it is laid down
    picture(base, kind, seed, skin)  the whole picture, after
"""
import colorsys
import numpy as np
from scipy import ndimage

FINISHES = ["None", "Foil", "Gilded", "Spectral", "Inverted", "Void", "Glitch"]


def _lum(rgb):
    return rgb[..., 0] * 0.30 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11


def _bayer4():
    b = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float)
    return (b + 0.5) / 16


def being(hold, kind, seed=0):
    if kind in (None, "None"):
        return hold
    out = hold.copy()
    a = out[..., 3] > 40
    if not a.any():
        return out
    rgb = out[..., :3].astype(float)
    L = _lum(rgb) / 255.0
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]

    if kind == "Foil":
        # a rainbow that runs diagonally across the being and shifts with
        # how bright each pixel is, like holographic foil catching light;
        # the drawing's own light and shade is kept underneath
        t = (xx / w * 0.9 + yy / h * 0.6 + L * 1.4) % 1.0
        hsv = np.stack([t, np.full_like(t, 0.62), 0.35 + L * 0.65], -1)
        foil = np.array([colorsys.hsv_to_rgb(*p) for p in hsv[a]]) * 255
        rgb[a] = rgb[a] * 0.25 + foil * 0.75
        # glints, sparse and on the brightest pixels
        rng = np.random.default_rng(seed + 31)
        g = a & (L > 0.62) & (rng.random(a.shape) < 0.035)
        rgb[g] = 255

    elif kind == "Gilded":
        # the whole being in gold leaf: brightness mapped onto a gold ramp
        ramp = np.array([(34, 18, 4), (110, 66, 10), (196, 138, 30),
                         (246, 204, 92), (255, 246, 206)], float)
        idx = np.clip(L, 0, 1) * (len(ramp) - 1)
        lo = np.floor(idx).astype(int); hi = np.minimum(lo + 1, len(ramp) - 1)
        f = (idx - lo)[..., None]
        gold = ramp[lo] * (1 - f) + ramp[hi] * f
        rgb[a] = gold[a]

    elif kind == "Spectral":
        # a ghost: the being turned to pale cyan light, the background
        # showing through it in a dithered pattern, with a halo round it
        ghost = np.stack([L * 150 + 60, L * 200 + 55, L * 120 + 135], -1)
        rgb[a] = ghost[a]
        b = np.tile(_bayer4(), (h // 4 + 1, w // 4 + 1))[:h, :w]
        hole = a & (b > 0.45 + L * 0.5)
        out[..., 3][hole] = 0
        halo = ndimage.binary_dilation(a, iterations=3) & ~a
        rgb[halo] = (120, 230, 255)
        out[..., 3][halo] = 120

    elif kind == "Inverted":
        # a negative: every colour turned to its opposite, the dark lines
        # coming out as light — the being looks lit from inside
        rgb[a] = 255 - rgb[a]

    elif kind == "Void":
        # the being as a hole in the picture: black all through, its own
        # shape traced in a single line of light and its eyes left burning
        core = ndimage.binary_erosion(a, iterations=1)
        eyes = a & (L > 0.82)
        rgb[core] = (4, 2, 10)
        edge = a & ~core
        rgb[edge] = (200, 150, 255)
        rgb[eyes & core] = (255, 240, 255)

    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def picture(base, kind, seed=0, skin=None):
    if kind != "Glitch":
        return base
    # Glitch: the whole picture torn into bands slid sideways, the colour
    # channels pulled apart, and scanlines — a transmission breaking up
    out = base.copy()
    h, w = out.shape[:2]
    rng = np.random.default_rng(seed + 97)
    y = 0
    while y < h:
        bh = int(rng.integers(2, 14))
        if rng.random() < 0.28:
            out[y:y + bh] = np.roll(out[y:y + bh], int(rng.integers(-18, 19)), axis=1)
        y += bh
    out[..., 0] = np.roll(out[..., 0], 3, axis=1)
    out[..., 2] = np.roll(out[..., 2], -3, axis=1)
    out[::3, :, :3] = (out[::3, :, :3].astype(float) * 0.62).astype(np.uint8)
    return out
