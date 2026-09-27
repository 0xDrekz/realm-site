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


def dress(drawn, weave):
    """Colour a being part by part.

    The parts are read off the art itself — see tools/parts.py. Inside each
    part the drawn brightness still does the shading, so an arm can be red and
    a face gold without either going flat.
    """
    h, w = drawn.shape
    reg = bodyparts.split(drawn)
    body = reg >= 0

    v = drawn.astype(float)
    inside = v[body]
    if inside.size:
        lo, hi = np.percentile(inside, 3), np.percentile(inside, 97)
        v = np.clip((v - lo) / max(hi - lo, 1e-6), 0, 1)

    col = np.zeros((h, w, 3), float)
    for k, name in enumerate(bodyparts.NAMES):
        m = reg == k
        if not m.any():
            continue
        dark, light = (np.array(c, float) for c in weave[name])
        col[m] = dark[None, :] + (light - dark)[None, :] * v[m][:, None]

    return np.dstack([col, np.where(body, 255, 0)]).astype(np.uint8)


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
