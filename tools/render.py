#!/usr/bin/env python3
"""
REALM — one being, one set of traits, one picture.

The order the layers go down in is the whole job. EVERYTHING goes behind the
being, so the being is never competed with:

    black
    stars            far off
    planets          far off
    geometry         in layers, glowing
    lightning
    UFOs
    explosions
    smoke            out of the mouth, rising behind the head
    moon dust
    the floor        a dithered hint, only when something grows on it
    trees            rooted on it, far ones first
    mushrooms        in front of the trees
    the being        last, on top of all of it

Smoke and dust used to sit in front. It made them read as weather happening
to the picture, and it put haze over the face — the one part of a being
anybody looks at.

Everything is drawn at the art grid and blown up by a whole number at the end.
"""
import os, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

import patterns, traits, finishes, parts as bodyparts
from compose import over, tint, shade, eyes
from inking import outline


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


def _volume(drawn, body, strength=1.0):
    """Give a flat drawing form, without touching one that already has it.

    The simple beings are drawn as flat blocks: a silhouette, a couple of
    lines, no modelling. The elaborate ones are shaded in every scale. Put
    side by side at the same resolution, the flat ones look unfinished next
    to them.

    The silhouette itself carries enough to fix that. Distance from the edge
    is a height field: high in the middle of a limb, zero at its outline.
    Light that height field and a flat arm becomes a round one.

    Applied in proportion to how flat each place already is, measured as
    local variation in the drawing, so it builds up the plain beings and
    leaves the modelled ones alone.
    """
    h, w = drawn.shape
    dist = ndimage.distance_transform_edt(body)
    if dist.max() <= 0:
        return np.zeros_like(dist)

    height = np.sqrt(dist / dist.max())
    height = ndimage.gaussian_filter(height, sigma=max(1.0, min(h, w) * 0.006))
    gy, gx = np.gradient(height)

    # a normal from that height, lit from up and to the left
    nz = 0.16
    norm = np.sqrt(gx*gx + gy*gy + nz*nz) + 1e-6
    lx, ly, lz = -0.52, -0.62, 0.59
    lam = (-gx*lx + -gy*ly + nz*lz) / norm
    lam = np.clip(lam, -1, 1)

    # how flat is it here already?
    v = drawn.astype(float) / 255.0
    local = ndimage.uniform_filter(v*v, size=max(3, int(min(h, w)*0.035)))           - ndimage.uniform_filter(v, size=max(3, int(min(h, w)*0.035))) ** 2
    flat = np.clip(1.0 - np.sqrt(np.clip(local, 0, None)) * 7.0, 0, 1)

    return lam * flat * strength * body


def dress(drawn, weave, rim=True, volume=1.0, tone=None):
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

    # The plain beings are drawn nearly white all over, so every colourway
    # landed on the palest stop of its ramp and four hundred Commons came out
    # white with a tint. A tone range pulls the drawing down into the middle
    # of the ramp, where the colour actually is.
    if tone:
        v = tone[0] + v * (tone[1] - tone[0])

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

    if volume:
        vol = _volume(drawn, body, volume)
        col += vol[:, :, None] * 66

    if rim:
        # lift the lit edge, which is what stops a flat fill reading as flat
        edge = body & ~ndimage.binary_erosion(body, iterations=1)
        up = np.zeros_like(body); up[1:, :] = body[:-1, :]
        col[edge & ~up] = np.clip(col[edge & ~up] * 1.35 + 34, 0, 255)

    return np.dstack([np.clip(col, 0, 255), np.where(body, 255, 0)]).astype(np.uint8)


def facet(drawn, weave, seed=0):
    """Colour line art that is not a body: a crystal, a lotus, an eye.

    dress() reads a figure as crown, face, wings, arms and body by where each
    part sits, which is right for a creature and wrong for a gem: a crystal
    came out patchy, with its lines left white. Here the drawn lines are the
    edges and every closed shape between them is a facet. Each facet is
    filled with its own step of the colourway's ramp, lighter toward the top
    left, so it reads as cut stone catching light; the lines run in the
    colourway's bright colours top to bottom; and an enclosed shape at the
    very centre (an eye, usually) is lit.

    Expects the drawing's lines at full strength and its solid body, if
    any, faint: lines 255, body around 70.
    """
    h, w = drawn.shape
    line = drawn > 160
    body = drawn > 20
    vivid = weave.get("vivid", 1.0)

    def col(name, k):
        spec = weave[name]
        if isinstance(spec, dict):
            spec = spec["a"]
        r = _ramp(spec, vivid=vivid)
        return r[int(np.clip(k, 0, 1) * (len(r) - 1))]

    out = np.zeros((h, w, 3), float)
    yy, xx = np.mgrid[0:h, 0:w]
    ys, xs = np.where(body) if body.any() else np.where(line)
    top, bot = ys.min(), max(ys.max(), ys.min() + 1)
    left, right = xs.min(), max(xs.max(), xs.min() + 1)

    # facets: the closed shapes inside the body, between the lines
    inner = body & ~line
    lab, n = ndimage.label(inner)
    rng = np.random.default_rng(seed + 404)
    cy0, cx0 = (top + bot) / 2, (left + right) / 2
    centre = None
    if n:
        com = ndimage.center_of_mass(inner, lab, range(1, n + 1))
        sizes = ndimage.sum(inner, lab, range(1, n + 1))
        # the facet whose middle is nearest the middle of the figure, if it
        # is small, is its eye
        d = [np.hypot(cy - cy0, cx - cx0) for cy, cx in com]
        k = int(np.argmin(d))
        if sizes[k] < inner.sum() * 0.03 and com[k][0] < top + (bot - top) * 0.55:
            centre = k + 1
        for i, (cy, cx) in enumerate(com, start=1):
            m = lab == i
            # lit from the upper left, plus a little of each facet's own
            lit = 1 - (0.55 * (cy - top) / (bot - top) + 0.45 * (cx - left) / (right - left))
            k = np.clip(0.18 + lit * 0.55 + rng.uniform(-0.12, 0.12), 0.08, 0.85)
            part = "Wings" if (cy - top) / (bot - top) > 0.5 else "Body"
            out[m] = col(part, k)
            # a dithered sheen across the top of each facet
            fy = (yy - cy) / max(1, np.sqrt(m.sum()))
            sheen = m & (fy < -0.15) & (((yy + xx) % 3) == 0)
            out[sheen] = np.minimum(out[sheen] * 1.35 + 20, 255)

    # the lines: bright, running from the crown colour at the top to the
    # arms colour at the bottom
    g = np.clip((yy - top) / (bot - top), 0, 1)
    a = np.array([col("Crown", 0.82)]) ; b = np.array([col("Arms", 0.72)])
    lines_rgb = a[0] * (1 - g[..., None]) + b[0] * g[..., None]
    out[line] = lines_rgb[line]

    if centre is not None:
        m = lab == centre
        out[m] = col("Face", 0.95)
        core = ndimage.binary_erosion(m, iterations=2)
        out[core] = (255, 255, 255)

    alpha = np.where(body | line, 255, 0)
    return np.dstack([np.clip(out, 0, 255), alpha]).astype(np.uint8)


def _hue_shift(rgb, deg):
    """Rotate a colour's hue, keeping how light and how saturated it is."""
    import colorsys
    r, g, b = [c / 255.0 for c in rgb]
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb((hh + deg / 360.0) % 1.0, ll, ss)
    return (int(r * 255), int(g * 255), int(b * 255))


SPORES = {"Matching": 0, "Golden": 40, "Complementary": 180,
          "Opposed": 120, "Cold": -110}

# The geometry's own colour, as a turn away from the character's.
#
# It used to be drawn from the same palette as the being, so a violet being
# stood in front of a violet figure and the whole picture was one hue. None
# of these is zero: the figure behind is never the colour of the thing in
# front of it.
# Measured across all eight colourways: with no turn the gap ran 0 to 20
# degrees — on Regalia and Bloom the figure behind was the character's exact
# hue. Warm was the tightest turn at 30 degrees on Eclipse, so it is widened.
AURAS = {"Opposed": 180, "Acid": 120, "Cold": -105, "Warm": 68, "Rose": -72}


def _hue_of(rgb):
    import colorsys
    return colorsys.rgb_to_hls(*[c / 255.0 for c in rgb])[0] * 360.0


def _hue_gap(a, b):
    d = abs(_hue_of(a) - _hue_of(b)) % 360.0
    return min(d, 360.0 - d)


def _aura_palette(pal, aura):
    """Turn the geometry — and the things that share its colour — off the
    character's hue."""
    deg = AURAS.get(aura)
    if deg is None:
        return pal
    out = dict(pal)
    for k in ("sigil", "sigil_alt", "sigil_glow", "sigil_dark",
              "planet_lit", "planet_dark", "planet_band", "ufo_dome"):
        if k in out:
            out[k] = _hue_shift(out[k], deg)
    return out


def _flora_palette(pal, spore):
    """Mushrooms need not match the ground they grow out of.

    Everything took its colour from the same place, so a purple floor grew
    purple mushrooms and the whole lower third was one hue. Their caps are
    rotated away from it here.
    """
    deg = SPORES.get(spore, 0)
    if deg == 0:
        return pal
    out = dict(pal)
    for k in ("shroom_cap", "shroom_cap_light", "shroom_spot",
              "shroom_gill", "tree_leaf", "tree_leaf_lit"):
        if k in out:
            out[k] = _hue_shift(out[k], deg)
    return out


def _limit(img, colours):
    """Cut the picture down to a small palette.

    This is the difference between pixel art and a smooth render with large
    pixels. Gradients and dithering invent thousands of colours; real pixel
    art picks a few dozen and stays inside them, and the banding that leaves
    behind is the look, not a fault.

    Done at the art grid, before anything is blown up, so the bands land on
    pixel edges.

    Set to 48 rather than 32. Thirty-two was chosen by testing on the God,
    which is drawn with shading in every scale and so has plenty of its own
    colours to keep. On a flat drawing it was clipping away the very
    modelling that makes a plain being look finished.
    """
    if not colours:
        return img
    q = img.convert("RGB").quantize(colors=colours, method=Image.MEDIANCUT,
                                    dither=Image.Dither.NONE)
    return q.convert("RGB")


def footing(w, h, cx, fy, rx, pal):
    """Something for the being to stand ON.

    It used to float: the floor was a band behind it and nothing joined the
    two, so it read as cut out and laid over the picture. Two things fix
    that, both dithered so they stay on the pixel grid: a pool of light on
    the ground round its feet in the being's own colour, and a hard contact
    shadow right under them.
    """
    from compose import _dither
    out = np.zeros((h, w, 4), np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]

    weave = pal.get("weave") or {}
    body = weave.get("Body")
    if isinstance(body, dict):
        body = body["a"]
    lit = np.array(body[2] if body else pal.get("ground_lit", (120, 100, 200)), float)
    lit = tuple(int(c) for c in np.clip(lit * 0.75 + 30, 0, 255))

    # the pool of light, wide and flat, fading out from the middle
    ry = rx * 0.26
    d = np.sqrt(((xx - cx) / (rx * 1.7)) ** 2 + ((yy - fy) / (ry * 1.7)) ** 2)
    field = np.clip(1 - d, 0, 1) ** 1.4 * 0.55
    m = _dither(field, 0) & (d < 1)
    out[m] = list(lit) + [150]

    # the shadow, tighter and dark, densest right under the feet
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - fy) / ry) ** 2)
    field = np.clip(1 - d, 0, 1) ** 0.7 * 0.95
    m = _dither(field, 3) & (d < 1)
    out[m] = list(pal.get("ink", (8, 5, 12))) + [235]
    return out


def render(being_png, pal, t, canvas, scale, seed, mode="stencil",
           eye_mode="holes", fill=0.82, colours=48, phase=None, tone=None):
    finish = t.get("Finish", "None")
    w = h = canvas
    rng = np.random.default_rng(seed ^ 0x5EED)
    pal = _aura_palette(pal, t.get("Aura", "Opposed"))
    pal = _flora_palette(pal, t.get("Spores", "Matching"))
    base = np.zeros((h, w, 4), np.uint8); base[:, :, 3] = 255

    base = over(base, traits.stars(w, h, t["Stars"], pal, seed))
    base = over(base, traits.planets(w, h, t["Planets"], pal, seed))

    if t["Geometry"] != "None":
        base = over(base, sigilry(w, h, t["Geometry"], pal, seed,
                                  t.get("GeometryUnder", "None")))

    # a still picture always has its bolt; a moving one flashes and is dark
    # between, which is what lightning does
    bolt_kind = t["Lightning"]
    bolt_seed = seed
    if phase is not None and bolt_kind != "None":
        fire = (phase * 4.0) % 1.0 < 0.34
        bolt_seed = seed + int(phase * 4.0) * 17
        if not fire:
            bolt_kind = "None"
    base = over(base, traits.lightning(w, h, bolt_kind, pal, bolt_seed))
    base = over(base, traits.ufos(w, h, t["UFOs"], pal, seed))
    base = over(base, traits.explosions(w, h, t["Explosions"], pal, seed))

    # ---- the being, prepared but not laid down yet
    art = Image.open(being_png).convert("RGBA")
    # Close crops in on the being. It is applied here, before the art is
    # resized, so the whole figure is still drawn — it simply runs off the
    # bottom and sides of the frame the way a portrait does.
    s = int(canvas * fill)
    fd, tmp = tempfile.mkstemp(suffix=".png"); os.close(fd)
    art.resize((s, s), Image.NEAREST).save(tmp)
    drawn = np.asarray(Image.open(tmp).convert("RGBA"))[:, :, 3]
    if mode == "own":
        # a drawing that arrives already coloured keeps its own colours;
        # only its silhouette is taken from the alpha
        own = np.asarray(Image.open(tmp).convert("RGBA")).copy()
        own[:, :, 3] = np.where(own[:, :, 3] > 40, 255, 0)
        lay = own
    elif mode == "facet" and pal.get("weave"):
        lay = facet(drawn, pal["weave"], seed)
    elif pal.get("weave"):
        lay = dress(drawn, pal["weave"], volume=t.get("Volume", 1.6), tone=tone)
    elif mode == "shade":
        lay = shade(tmp, pal["shadow"], pal["mid"], pal["light"], None)
    else:
        lay = tint(tmp, pal["being_top"], pal["being_bottom"], None, solid=2.2)
    os.unlink(tmp)

    if eye_mode != "drawn":
        lay = traits.iris(lay, eyes(drawn, extra=t.get("ExtraEyes")),
                          t["Eyes"], pal, seed)
    lay = outline(lay, pal["ink"])

    # Always dead centre. Shifting and cropping was tried and it read as
    # sloppy rather than varied — the variety belongs in what surrounds the
    # character, not in where the character is.
    nx = int(w/2 - s/2)
    ny = int(h * 1.02) - s

    # the air, still born at the being's mouth but laid down before it
    mx, my = bodyparts.mouth(drawn)
    base = over(base, traits.breath(w, h, t["Smoke"], pal, seed,
                                    nx + mx, ny + my, phase or 0.0))
    base = over(base, traits.moondust(w, h, t["Dust"], pal, seed, phase or 0.0))
    # the floor and what grows on it, far to near
    # every being stands on something
    base = over(base, traits.ground(w, h, "Floor", pal, seed))

    # where its feet are: the lowest drawn row, and the middle of what is
    # drawn just above it
    ys, xs = np.where(drawn > 40)
    if ys.size:
        foot = ys.max()
        low = xs[ys > foot - max(2, s * 0.06)]
        fx = nx + (low.min() + low.max()) / 2
        rx = max(6.0, (low.max() - low.min()) * 0.62)
        fy = ny + foot - 1
        if fy < h:
            base = over(base, footing(w, h, fx, fy, rx, pal))
    base = over(base, traits.trees(w, h, t.get("Trees", "None"), pal, seed))
    base = over(base, traits.mushrooms(w, h, t.get("Mushrooms", "None"), pal, seed))

    # and the being last, over everything
    hold = np.zeros((h, w, 4), np.uint8)
    y0, x0, y1, x1 = max(0,ny), max(0,nx), min(h,ny+s), min(w,nx+s)
    if y1 > y0 and x1 > x0:
        hold[y0:y1, x0:x1] = lay[y0-ny:y1-ny, x0-nx:x1-nx]

    # Lit by what is behind it. A being in front of a purple mandala should
    # catch purple down its edge; lit the same whatever was behind, it read
    # as pasted on rather than standing there.
    skin = hold[:, :, 3] > 40
    if skin.any():
        halo = ndimage.binary_dilation(skin, iterations=6) & ~skin
        if halo.any():
            behind = base[:, :, :3][halo].astype(float).mean(axis=0)
            edge = skin & ~ndimage.binary_erosion(skin, iterations=2)
            k = np.clip(behind / max(behind.max(), 1), 0, 1) * 96
            hold[edge, :3] = np.clip(hold[edge, :3].astype(float) + k[None, :],
                                     0, 255).astype(np.uint8)
    hold = finishes.being(hold, finish, seed)
    base = over(base, hold)
    base = finishes.picture(base, finish, seed, skin)

    flat = _limit(Image.fromarray(base, "RGBA").convert("RGB"), colours)
    return flat.resize((w*scale, h*scale), Image.NEAREST)
