#!/usr/bin/env python3
"""
REALM — the things that vary.

Each of these is a layer of its own that either appears or does not, with its
own rarity. They are not tints over the whole picture; they are drawn objects
that a collector can point at and name.

Everything is rasterised on the art grid at one pixel, then the whole picture
is blown up by a whole number at the very end. Nothing here is drawn large and
shrunk, because shrinking a one-pixel line loses it.
"""
import numpy as np
from scipy import ndimage

from compose import _dither


def _rgba(h, w):
    return np.zeros((h, w, 4), np.uint8)


def _put(layer, mask, colour, alpha=255):
    layer[mask] = list(colour) + [alpha]


# ---------------------------------------------------------------- the sky

def stars(w, h, kind, pal, seed):
    """Not one kind of dot. Faint field, bright scatter, and the odd
    four-pointed one that reads as a real star rather than a speck."""
    r = np.random.default_rng(seed)
    out = _rgba(h, w)
    if kind == "None":
        return out
    dens = {"Sparse": 0.004, "Field": 0.012, "Dense": 0.030}[kind]

    faint = r.random((h, w)) < dens
    _put(out, faint, pal["star_dim"])
    bright = r.random((h, w)) < dens * 0.22
    _put(out, bright, pal["star"])

    for _ in range(int(3 + dens * 400)):
        cy, cx = int(r.random()*h), int(r.random()*w)
        arm = int(r.integers(1, 3))
        for d in range(-arm, arm+1):
            for yy, xx in ((cy+d, cx), (cy, cx+d)):
                if 0 <= yy < h and 0 <= xx < w:
                    out[yy, xx] = list(pal["star"]) + [255]
    return out


def planets(w, h, kind, pal, seed):
    """A disc, shaded from one side, sometimes banded, sometimes ringed."""
    r = np.random.default_rng(seed + 31)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"One": 1, "Two": 2, "Ringed": 1, "Cluster": 3}[kind]
    y, x = np.mgrid[0:h, 0:w]

    for i in range(n):
        R = w * r.uniform(0.06, 0.15)
        cx, cy = r.uniform(R, w-R), r.uniform(R, h*0.55)
        d = np.sqrt((x-cx)**2 + (y-cy)**2)
        disc = d <= R

        # lit from one side: a terminator, dithered so it stays pixel art
        lx, ly = r.uniform(-1, 1), r.uniform(-1, 0.4)
        lit = ((x-cx)*lx + (y-cy)*ly) / max(R, 1)
        shade = _dither(np.clip(0.5 - lit*0.75, 0, 1), seed + i)
        _put(out, disc, pal["planet_lit"])
        _put(out, disc & shade, pal["planet_dark"])

        if r.random() < 0.6:                      # bands
            band = (np.sin((y - cy) / max(2, R*0.22)) > 0.35)
            _put(out, disc & band, pal["planet_band"])

        rim = (np.abs(d - R) < 0.8)
        _put(out, rim, pal["planet_rim"])

        if kind == "Ringed" and i == 0:
            for rr in (R*1.45, R*1.62):
                ring = np.abs(np.sqrt((x-cx)**2 + ((y-cy)*3.1)**2) - rr) < 0.9
                _put(out, ring & ~disc, pal["planet_rim"])
    return out


def ufos(w, h, kind, pal, seed):
    """Saucers. A dome, a hull, lights along the rim, and sometimes a beam."""
    r = np.random.default_rng(seed + 77)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"One": 1, "Few": 2, "Fleet": 4}[kind]
    y, x = np.mgrid[0:h, 0:w]

    # keep out of the middle: the being stands there, and a saucer behind it
    # is a saucer nobody sees. Four were being drawn and one was visible.
    for i in range(n):
        S = w * r.uniform(0.045, 0.085)
        side = -1 if (i % 2 == 0) else 1
        cx = w/2 + side * r.uniform(w*0.20, w*0.42)
        cx = float(np.clip(cx, S, w - S))
        cy = r.uniform(h*0.05, h*0.38)

        hull = (((x-cx)/S)**2 + ((y-cy)/(S*0.30))**2) <= 1
        dome = (((x-cx)/(S*0.46))**2 + ((y-cy+S*0.26)/(S*0.42))**2) <= 1
        _put(out, hull, pal["ufo"])
        _put(out, dome, pal["ufo_dome"])
        _put(out, hull & (y > cy + S*0.10), pal["ufo_dark"])

        for k in range(-2, 3):                    # lights under the rim
            lx = int(cx + k * S*0.36); ly = int(cy + S*0.24)
            if 0 <= ly < h and 0 <= lx < w:
                out[ly, lx] = list(pal["ufo_light"]) + [255]

        if r.random() < 0.45:                     # a beam
            for yy in range(int(cy+S*0.3), h):
                t = (yy - cy) / max(h - cy, 1)
                half = S * (0.25 + t*1.5)
                x0, x1 = int(cx-half), int(cx+half)
                band = np.zeros((h, w), bool)
                band[yy, max(0,x0):min(w,x1)] = True
                keep = band & _dither(np.full((h, w), 0.30*(1-t)), seed+i+yy)
                _put(out, keep, pal["ufo_light"], 150)
    return out


# ---------------------------------------------------------------- the air

def breath(w, h, kind, pal, seed, mx, my):
    """Smoke leaving the mouth.

    It starts small and tight at the mouth and opens out as it climbs, which
    is the difference between smoke being breathed and smoke drifting past.
    """
    r = np.random.default_rng(seed + 91)
    out = _rgba(h, w)
    if kind == "None":
        return out
    puffs = {"Wisp": 9, "Rising": 16, "Shroud": 26}[kind]
    reach = {"Wisp": 0.34, "Rising": 0.58, "Shroud": 0.86}[kind]
    y, x = np.mgrid[0:h, 0:w]
    field = np.zeros((h, w))

    lean = r.uniform(-1, 1)
    top = my - h * reach
    for k in range(puffs):
        t = k / max(puffs - 1, 1)               # 0 at the mouth, 1 at the top
        py = my - t * (my - top)
        px = mx + lean * w * 0.16 * (t ** 1.6) + np.sin(t*7 + seed) * w * 0.02 * t
        # the first puffs were three pixels across and vanished, so the plume
        # looked like it began somewhere above the head
        rad = w * (0.026 + (t ** 0.85) * 0.080) * r.uniform(0.85, 1.15)
        d2 = ((x - px)**2 + (y - py)**2) / max(rad*rad, 1)
        field = np.maximum(field, np.exp(-d2) * (0.95 - t*0.45))

    _put(out, _dither(field, seed), pal["smoke"], 200)
    _put(out, _dither(field * 0.5, seed + 3), pal["dust_bright"], 130)
    return out


def smoke(w, h, kind, pal, seed):
    """Puffs climbing and spreading.

    Built from overlapping round blobs rather than a dithered column. A
    column put through an ordered dither comes out as regular diagonal
    hatching — it reads as a crosshatch texture, not as smoke.
    """
    r = np.random.default_rng(seed + 12)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"Wisp": 2, "Rising": 4, "Shroud": 7}[kind]
    y, x = np.mgrid[0:h, 0:w]
    field = np.zeros((h, w))

    for i in range(n):
        sx = r.uniform(w*0.08, w*0.92)
        amp = w * r.uniform(0.03, 0.09)
        period = h * r.uniform(0.25, 0.55)
        phase = r.uniform(0, 6.28)
        top = h * r.uniform(0.10, 0.45)
        puffs = int(r.integers(7, 14))
        for k in range(puffs):
            t = k / max(puffs-1, 1)              # 0 at the floor, 1 at the top
            py = h - t * (h - top)
            px = sx + amp * np.sin(t * 6.28 * (h/max(period,1)) * 0.25 + phase)
            rad = w * (0.022 + t * 0.075) * r.uniform(0.75, 1.25)
            d2 = ((x - px)**2 + (y - py)**2) / max(rad*rad, 1)
            field = np.maximum(field, np.exp(-d2) * (0.95 - t*0.55))

    _put(out, _dither(field, seed), pal["smoke"], 185)
    _put(out, _dither(field * 0.55, seed + 3), pal["dust_bright"], 120)
    return out


def moondust(w, h, kind, pal, seed):
    """Fine motes hanging in the air, thicker low down, drifting sideways."""
    r = np.random.default_rng(seed + 55)
    out = _rgba(h, w)
    if kind == "None":
        return out
    dens = {"Faint": 0.010, "Drifting": 0.028, "Heavy": 0.060}[kind]
    y, x = np.mgrid[0:h, 0:w]

    low = np.clip(y / h, 0, 1) ** 1.4
    field = (r.random((h, w)) < dens * (0.35 + low))
    _put(out, field, pal["dust"], 190)

    for _ in range(int(dens * 300)):              # a few brighter, with a tail
        cy, cx = int(r.random()*h), int(r.random()*w)
        for d in range(int(r.integers(2, 5))):
            xx = cx + d
            if 0 <= cy < h and 0 <= xx < w:
                out[cy, xx] = list(pal["dust_bright"]) + [255 - d*40]
    return out


# ---------------------------------------------------------------- the eyes

IRISES = ["Plain", "Slit", "Ringed", "Spiral", "Starburst", "Void"]


def iris(layer, eye_mask, kind, pal, seed):
    """Draw inside the eye rather than filling it flat.

    Each eye is found as its own blob, and the design is fitted to that blob's
    own box, so it works whatever shape and size the eye is.
    """
    if kind == "Plain" or not eye_mask.any():
        _put(layer, eye_mask, pal["eye"])
        return layer

    h, w = eye_mask.shape
    lab, n = ndimage.label(eye_mask)
    _put(layer, eye_mask, pal["eye"])

    for i in range(1, n+1):
        blob = lab == i
        ys, xs = np.where(blob)
        cy, cx = ys.mean(), xs.mean()
        ry = max(1.0, (ys.max()-ys.min())/2); rx = max(1.0, (xs.max()-xs.min())/2)
        yy, xx = np.mgrid[0:h, 0:w]
        u = (xx - cx) / rx; v = (yy - cy) / ry
        d = np.sqrt(u*u + v*v)
        ang = np.arctan2(v, u)

        if kind == "Slit":
            _put(layer, blob & (np.abs(u) < 0.22), pal["pupil"])
        elif kind == "Ringed":
            _put(layer, blob & (d < 0.75), pal["iris"])
            _put(layer, blob & (np.abs(d-0.52) < 0.14), pal["eye"])
            _put(layer, blob & (d < 0.30), pal["pupil"])
        elif kind == "Spiral":
            s = (ang/(2*np.pi) + d*1.9) % 1.0
            _put(layer, blob & (d < 0.85) & (s < 0.5), pal["iris"])
            _put(layer, blob & (d < 0.22), pal["pupil"])
        elif kind == "Starburst":
            spokes = (np.abs(np.sin(ang*6)) > 0.55)
            _put(layer, blob & (d < 0.85) & spokes, pal["iris"])
            _put(layer, blob & (d < 0.26), pal["pupil"])
        elif kind == "Void":
            _put(layer, blob, pal["pupil"])
            _put(layer, blob & (d > 0.78), pal["iris"])

        gy, gx = int(cy - ry*0.38), int(cx - rx*0.34)   # the glint
        if 0 <= gy < h and 0 <= gx < w and blob[gy, gx]:
            layer[gy, gx] = list(pal["glint"]) + [255]
    return layer
