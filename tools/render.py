#!/usr/bin/env python3
"""
REALM — one being, one set of traits, one picture.

The order the layers go down in is the whole job:

    black
    stars            far off
    planets          far off
    geometry         behind the being, glowing
    UFOs             between the geometry and the being
    the being        outlined, with its eyes drawn into
    smoke            in front of the being's feet
    moon dust        in front of everything, thin

Everything is drawn at the art grid and blown up by a whole number at the end.
"""
import os, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

import patterns, traits, parts as bodyparts
from compose import over, tint, shade, eyes
from scene import outline


def _ramp(dark, light, stops=5):
    """A ramp from dark to light that bends the way paint does.

    A straight line between two colours goes through mud in the middle.
    Real shading is cooler and more saturated in shadow and warmer and less
    saturated in light, so the ramp is pushed that way as it climbs.
    """
    dark, light = np.array(dark, float), np.array(light, float)
    out = []
    for i in range(stops):
        t = i / (stops - 1)
        c = dark + (light - dark) * t
        # shadows cool and rich, highlights warm and washed
        cool = np.array([-16, -6, 22], float) * (1 - t) ** 2
        warm = np.array([20, 10, -10], float) * (t ** 2)
        grey = c.mean()
        sat = 1.22 - 0.42 * t                 # let the colour go in the dark
        c = grey + (c - grey) * sat + cool + warm
        out.append(np.clip(c, 0, 255))
    return np.array(out)


def dress(drawn, weave, rim=True):
    """Colour a being part by part, keeping the drawing's own shading.

    The parts come from tools/parts.py. Two colours per part was not enough:
    it flattened hand-drawn shading into a single gradient and the result
    looked like a colouring book. Each part now runs through a five-stop
    ramp, the art's own local contrast is kept on top of it, and the light
    side of every edge is lifted.
    """
    h, w = drawn.shape
    reg = bodyparts.split(drawn)
    body = reg >= 0

    v = drawn.astype(float)
    inside = v[body]
    if inside.size:
        lo, hi = np.percentile(inside, 2), np.percentile(inside, 98)
        v = np.clip((v - lo) / max(hi - lo, 1e-6), 0, 1)

    # what the artist drew that a smooth ramp throws away: every line, scale
    # and crease is a local departure from the surrounding tone
    blur = ndimage.uniform_filter(v, size=max(3, int(min(h, w) * 0.05)))
    detail = np.clip(v - blur, -0.5, 0.5)

    col = np.zeros((h, w, 3), float)
    for k, name in enumerate(bodyparts.NAMES):
        m = reg == k
        if not m.any():
            continue
        ramp = _ramp(*weave[name])
        idx = v[m] * (len(ramp) - 1)
        lo_i = np.floor(idx).astype(int)
        hi_i = np.minimum(lo_i + 1, len(ramp) - 1)
        f = (idx - lo_i)[:, None]
        base = ramp[lo_i] * (1 - f) + ramp[hi_i] * f
        col[m] = base + detail[m][:, None] * 190      # put the drawing back

    if rim:
        # lift the lit edge, which is what stops a flat fill reading as flat
        edge = body & ~ndimage.binary_erosion(body, iterations=1)
        up = np.zeros_like(body); up[1:, :] = body[:-1, :]
        col[edge & ~up] = np.clip(col[edge & ~up] * 1.35 + 34, 0, 255)

    return np.dstack([np.clip(col, 0, 255), np.where(body, 255, 0)]).astype(np.uint8)


def render(being_png, pal, t, canvas, scale, seed, mode="stencil",
           eye_mode="holes", fill=0.82):
    w = h = canvas
    base = np.zeros((h, w, 4), np.uint8); base[:, :, 3] = 255

    base = over(base, traits.stars(w, h, t["Stars"], pal, seed))
    base = over(base, traits.planets(w, h, t["Planets"], pal, seed))

    if t["Geometry"] != "None":
        m = patterns.draw(w, h, t["Geometry"], w/2, h*0.46, w*0.44, seed)
        halo = ndimage.binary_dilation(m, iterations=3) & ~m
        near = ndimage.binary_dilation(m, iterations=1) & ~m
        g = np.zeros((h, w, 4), np.uint8)
        g[halo] = list(pal["sigil_glow"]) + [190]
        g[near] = list(pal["sigil_dark"]) + [255]
        g[m]    = list(pal["sigil"]) + [255]
        base = over(base, g)

    base = over(base, traits.ufos(w, h, t["UFOs"], pal, seed))

    # ---- the being
    art = Image.open(being_png).convert("RGBA")
    s = int(canvas * fill)
    fd, tmp = tempfile.mkstemp(suffix=".png"); os.close(fd)
    art.resize((s, s), Image.NEAREST).save(tmp)
    drawn = np.asarray(Image.open(tmp).convert("RGBA"))[:, :, 3]
    if pal.get("weave"):
        lay = dress(drawn, pal["weave"])
    elif mode == "shade":
        lay = shade(tmp, pal["shadow"], pal["mid"], pal["light"], None)
    else:
        lay = tint(tmp, pal["being_top"], pal["being_bottom"], None, solid=2.2)
    os.unlink(tmp)

    if eye_mode != "drawn":
        lay = traits.iris(lay, eyes(drawn), t["Eyes"], pal, seed)
    lay = outline(lay, pal["ink"])

    nx, ny = w//2 - s//2, int(h * 1.02) - s
    hold = np.zeros((h, w, 4), np.uint8)
    y0, x0, y1, x1 = max(0,ny), max(0,nx), min(h,ny+s), min(w,nx+s)
    hold[y0:y1, x0:x1] = lay[y0-ny:y1-ny, x0-nx:x1-nx]
    base = over(base, hold)

    mx, my = bodyparts.mouth(drawn)
    base = over(base, traits.breath(w, h, t["Smoke"], pal, seed,
                                    nx + mx, ny + my))
    base = over(base, traits.moondust(w, h, t["Dust"], pal, seed))

    return Image.fromarray(base, "RGBA").convert("RGB").resize((w*scale, h*scale), Image.NEAREST)
