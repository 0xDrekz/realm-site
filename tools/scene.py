#!/usr/bin/env python3
"""
REALM — putting a being somewhere.

Everything before this floated a being on a gradient. This builds a place for
it to stand in: a sky with weather, a horizon, ground running away from you, a
gate behind, and the being outlined against it.

All of it is drawn at the being's own grid so nothing is smoother than
anything else, and blown up by a whole number at the end.
"""
import os
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

from compose import _bayer, _dither, eyes, over, tint, shade
import patterns


# ---------------------------------------------------------------- the sky

def sky(w, h, horizon, pal, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w, 3), np.uint8)
    top, low = np.array(pal["sky_top"], float), np.array(pal["sky_low"], float)

    for y in range(h):
        t = min(1.0, y / max(horizon, 1))
        out[y, :] = top * (1 - t) + low * t

    # banded, not a smooth ramp — bands are what make it read as drawn
    band = (np.arange(h)[:, None] / max(horizon, 1) * 7) % 1.0
    out = np.clip(out + _dither(np.tile(band, (1, w)), seed)[:, :, None] * 10, 0, 255)

    # a low sun, and cloud bars lying across it
    sx, sy = int(w * r.uniform(0.2, 0.8)), int(horizon * r.uniform(0.25, 0.55))
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - sx) / (w * 0.09)) ** 2 + ((yy - sy) / (w * 0.09)) ** 2)
    out[d < 1] = pal["sun"]
    glow = np.clip(1 - d / 3.2, 0, 1) ** 2
    out = np.clip(out + _dither(glow, seed + 1)[:, :, None] * np.array(pal["sun"]) * 0.30, 0, 255)

    for _ in range(r.integers(3, 7)):
        cy = int(r.uniform(0.15, 0.9) * horizon)
        ch = max(1, int(r.integers(1, 4)))
        x0 = int(r.uniform(-0.2, 0.9) * w); cw = int(r.uniform(0.25, 0.7) * w)
        band_col = np.array(pal["cloud"], float)
        seg = out[cy:cy+ch, max(0,x0):min(w,x0+cw)].astype(float)
        if seg.size:
            out[cy:cy+ch, max(0,x0):min(w,x0+cw)] = np.clip(seg*0.35 + band_col*0.65, 0, 255)
    return out.astype(np.uint8)


# ---------------------------------------------------------------- the ground

def ground(w, h, horizon, pal, seed):
    r = np.random.default_rng(seed + 7)
    out = np.zeros((h, w, 4), np.uint8)
    near, far = np.array(pal["ground_near"], float), np.array(pal["ground_far"], float)
    depth = max(h - horizon, 1)

    for y in range(horizon, h):
        t = (y - horizon) / depth
        out[y, :, :3] = far * (1 - t) + near * t
        out[y, :, 3] = 255

    # tiles, spaced further apart the nearer they are — that is the whole
    # illusion of depth, and it costs nothing
    line = np.array(pal["ground_line"], float)
    y = horizon + 1
    gap = 1.0
    while y < h:
        out[y, :, :3] = np.clip(out[y, :, :3] * 0.45 + line * 0.55, 0, 255)
        gap *= 1.34
        y += max(1, int(gap))

    # and lines running away to a point, which is what actually sells it
    vx = w // 2
    for k in range(-9, 10):
        if k == 0: continue
        for yy in range(horizon + 1, h):
            t = (yy - horizon) / max(h - horizon, 1)
            xx = int(vx + k * (w * 0.055) * (t ** 1.7) * 6)
            if 0 <= xx < w:
                out[yy, xx, :3] = np.clip(out[yy, xx, :3] * 0.55 + line * 0.45, 0, 255)

    # scatter, thinning toward the horizon
    for _ in range(int(w * 0.5)):
        t = r.random() ** 0.5
        gy = horizon + int(t * depth)
        gx = int(r.random() * w)
        if gy < h:
            out[gy, gx, :3] = np.clip(out[gy, gx, :3].astype(float) * 1.35 + 20, 0, 255)
    return out


# ---------------------------------------------------------------- the gate

def sigil(w, h, horizon, pal, kind, seed, scale=1.0):
    """The geometry standing behind the being.

    Drawn on the art grid a pixel wide, and laid in twice — once dim and
    offset by one pixel as a shadow, once bright — so it does not vanish
    against a light sky.
    """
    out = np.zeros((h, w, 4), np.uint8)
    if kind is None:
        return out
    cx, cy = w / 2, horizon * 0.72
    R = w * 0.40 * scale
    m = patterns.draw(w, h, kind, cx, cy, R, seed)

    shadow = np.zeros_like(m)
    shadow[1:, 1:] = m[:-1, :-1]
    out[shadow & ~m] = list(pal["sigil_dark"]) + [255]
    out[m] = list(pal["sigil"]) + [255]
    return out


# ---------------------------------------------------------------- outlining

def outline(layer, colour=(10, 6, 16), width=1):
    """A dark edge round whatever is in this layer.

    The reference style has one on everything, and it is what stops a
    character dissolving into a busy background.
    """
    a = layer[:, :, 3] > 40
    grown = ndimage.binary_dilation(a, iterations=width)
    ring = grown & ~a
    out = layer.copy()
    out[ring] = list(colour) + [255]
    return out


# ---------------------------------------------------------------- assembly

def place(being_png, pal, canvas, scale, seed, mode="stencil", eye_mode="holes",
          fill=0.80, echo=True, sigil_kind="Mandala"):
    """Put one being in a place and return the picture."""
    w = h = canvas
    horizon = int(h * 0.56)
    rng = np.random.default_rng(seed)

    base = np.dstack([sky(w, h, horizon, pal, seed), np.full((h, w, 1), 255, np.uint8)])
    base = over(base, sigil(w, h, horizon, pal, sigil_kind, seed))
    base = over(base, ground(w, h, horizon, pal, seed))

    art = Image.open(being_png).convert("RGBA")

    def dressed(size, smooth=False):
        # BOX going down, NEAREST going up — shrinking a sprite with NEAREST
        # throws pixels away and the far one dissolves into noise
        small = art.resize((size, size), Image.BOX if smooth else Image.NEAREST)
        fd, tmp = tempfile.mkstemp(suffix=".png"); os.close(fd)
        small.save(tmp)
        if mode == "shade":
            lay = shade(tmp, pal["shadow"], pal["mid"], pal["light"],
                        None if eye_mode == "drawn" else pal["eye"])
        else:
            lay = tint(tmp, pal["being_top"], pal["being_bottom"],
                       None if eye_mode == "drawn" else pal["eye"], solid=2.2)
        os.unlink(tmp)
        return outline(lay, pal["ink"])

    # a far-off one, standing in the gate
    if echo:
        s = max(12, int(canvas * 0.30))
        far = dressed(s, smooth=True)
        fx, fy = w//2 - s//2 + int(rng.integers(-w//5, w//5 + 1)), horizon - s + int(h*0.015)
        lay = np.zeros((h, w, 4), np.uint8)
        lay[max(0,fy):fy+s, max(0,fx):fx+s] = far[:h-max(0,fy), :w-max(0,fx)]
        lay[:, :, 3] = (lay[:, :, 3].astype(float) * 0.9).astype(np.uint8)
        base = over(base, lay)

    # the one you are looking at, standing on the ground and cropped at the edge
    s = int(canvas * fill)
    near = dressed(s)
    nx = w//2 - s//2 + int(rng.integers(-canvas//14, canvas//14 + 1))
    ny = int(h * 1.06) - s          # runs off the bottom edge, as the style does
    lay = np.zeros((h, w, 4), np.uint8)
    y0, x0 = max(0, ny), max(0, nx)
    y1, x1 = min(h, ny+s), min(w, nx+s)
    lay[y0:y1, x0:x1] = near[y0-ny:y1-ny, x0-nx:x1-nx]
    base = over(base, lay)

    return Image.fromarray(base, "RGBA").convert("RGB").resize((w*scale, h*scale), Image.NEAREST)
