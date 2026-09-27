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


def _ramp(stops, n=17, vivid=1.0):
    """Build a shading ramp from a list of colours, shadow first.

    Two colours per part could only ever fade one hue into itself. A list
    lets a wing run green through red the way a painted one does, which is
    the single biggest thing separating this from hand-painted work.

    The ramp still bends the way paint bends — cooler and richer in shadow,
    warmer and washed in light — and `vivid` pushes saturation past where a
    straight interpolation would leave it.
    """
    stops = [np.array(c, float) for c in stops]
    if len(stops) == 1:
        stops = [stops[0] * 0.25, stops[0]]
    out = []
    for i in range(n):
        t = i / (n - 1)
        pos = t * (len(stops) - 1)
        a = int(np.floor(pos)); b = min(a + 1, len(stops) - 1)
        c = stops[a] + (stops[b] - stops[a]) * (pos - a)
        cool = np.array([-18, -7, 26], float) * (1 - t) ** 2
        warm = np.array([26, 13, -12], float) * (t ** 2)
        grey = c.mean()
        sat = (1.34 - 0.40 * t) * vivid
        out.append(np.clip(grey + (c - grey) * sat + cool + warm, 0, 255))
    return np.array(out)


def sigilry(w, h, kind, pal, seed, under="None"):
    """The geometry, in layers, with colour running along it.

    A single one-pixel outline on black is a diagram. What makes a background
    is depth: a large faint figure behind, a bright one in front, each with
    its own glow, and the colour shifting across the picture rather than being
    one flat line colour everywhere.
    """
    out = np.zeros((h, w, 4), np.uint8)
    cx, cy = w/2, h*0.46

    def lay(m, bright, dim, glow_px, alpha=255):
        halo = ndimage.binary_dilation(m, iterations=glow_px) & ~m
        near = ndimage.binary_dilation(m, iterations=1) & ~m
        g = np.zeros((h, w, 4), np.uint8)
        g[halo] = list(dim) + [150]
        g[near] = list(dim) + [230]
        g[m] = list(bright) + [alpha]
        return g

    if under != "None":
        m0 = patterns.draw(w, h, under, cx, cy, w*0.62, seed + 5)
        out = over(out, lay(m0, pal["sigil_dark"], pal["sigil_glow"], 2, 170))

    m = patterns.draw(w, h, kind, cx, cy, w*0.44, seed)

    # colour swept across the figure rather than one flat line colour
    yy, xx = np.mgrid[0:h, 0:w]
    t = np.clip((xx / w) * 0.6 + (yy / h) * 0.4, 0, 1)
    a = np.array(pal["sigil"], float)
    b = np.array(pal.get("sigil_alt", pal["sigil"]), float)
    swept = (a[None, None, :] * (1 - t)[:, :, None] + b[None, None, :] * t[:, :, None])

    g = lay(m, pal["sigil"], pal["sigil_glow"], 3)
    g[m, :3] = swept[m]
    return over(out, g)


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

    yy, xx = np.mgrid[0:h, 0:w]
    vivid = weave.get("vivid", 1.0)

    def pick(ramp, vals):
        idx = vals * (len(ramp) - 1)
        lo_i = np.floor(idx).astype(int)
        hi_i = np.minimum(lo_i + 1, len(ramp) - 1)
        f = (idx - lo_i)[:, None]
        return ramp[lo_i] * (1 - f) + ramp[hi_i] * f

    col = np.zeros((h, w, 3), float)
    for k, name in enumerate(bodyparts.NAMES):
        m = reg == k
        if not m.any():
            continue
        spec = weave[name]

        if isinstance(spec, dict):
            # A gradient ACROSS the part, not only along its shading. A
            # painted wing goes green at the top and red at the bottom; one
            # ramp per part can never do that, however many stops it has.
            ra = _ramp(spec["a"], vivid=vivid)
            rb = _ramp(spec["b"], vivid=vivid)
            ys, xs = np.where(m)
            axis = spec.get("axis", "y")
            if axis == "x":
                p0, p1, coord = xs.min(), xs.max(), xs
            elif axis == "out":
                cxp = (xs.min() + xs.max()) / 2
                coord = np.abs(xs - cxp); p0, p1 = 0, max(coord.max(), 1)
            else:
                p0, p1, coord = ys.min(), ys.max(), ys
            g = np.clip((coord - p0) / max(p1 - p0, 1), 0, 1)[:, None]
            base = pick(ra, v[m]) * (1 - g) + pick(rb, v[m]) * g
        else:
            ramp = _ramp(spec if isinstance(spec[0], (list, tuple)) else [spec],
                         vivid=vivid)
            base = pick(ramp, v[m])

        col[m] = base + detail[m][:, None] * 210      # put the drawing back

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
        base = over(base, sigilry(w, h, t["Geometry"], pal, seed,
                                  t.get("GeometryUnder", "None")))

    base = over(base, traits.lightning(w, h, t["Lightning"], pal, seed))
    base = over(base, traits.ufos(w, h, t["UFOs"], pal, seed))
    base = over(base, traits.explosions(w, h, t["Explosions"], pal, seed))

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
