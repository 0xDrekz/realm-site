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


# The character stands in the middle and owns that column. Nothing is placed
# inside it except high above the head, because anything behind the character
# is simply not seen — it is work done and thrown away.
KEEP_OUT = 0.24            # half-width of the character's column, as a fraction
ABOVE = 0.22               # above this fraction of the height, the middle is free


def clear_column(layer, w, h, soften=0.06, above=None):
    """Erase whatever strayed into the character's column.

    Keeping a thing's BASE outside the column is not enough — a tree rooted
    at the side still throws branches back across the middle, and the trunk
    came up between the character's legs. Placement is a wish; this is the
    guarantee.

    The edge is faded over a few per cent of the width rather than cut
    straight, so nothing ends on a visible line.
    """
    above = ABOVE if above is None else above
    x = np.arange(w)[None, :]
    y = np.arange(h)[:, None]
    off = np.abs(x / w - 0.5)
    keep = np.clip((off - KEEP_OUT) / max(soften, 1e-6), 0, 1)
    keep = np.where(y / h < above, 1.0, keep)     # high above the head is free
    out = layer.copy()
    out[:, :, 3] = (out[:, :, 3].astype(float) * keep).astype(np.uint8)
    return out


def _aside(w, h, r, size, allow_above=True, top=0.0, bottom=0.6):
    """A spot at the side of the character — or above its head.

    Returns a centre. Tries the sides first and falls back to high and
    central, which is the only part of the middle anything can occupy.
    """
    for _ in range(40):
        cx = r.uniform(size * 0.5, w - size * 0.5)
        cy = r.uniform(h * top + size * 0.5, h * bottom)
        off = abs(cx / w - 0.5)
        if off > KEEP_OUT:
            return cx, cy
        if allow_above and (cy + size * 0.5) / h < ABOVE:
            return cx, cy
    side = -1 if r.random() < 0.5 else 1
    cx = float(np.clip(w / 2 + side * w * r.uniform(KEEP_OUT + 0.04, 0.46),
                       size * 0.5, w - size * 0.5))
    return cx, r.uniform(h * top + size * 0.5, h * bottom)


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
        cx, cy = _aside(w, h, r, R * 2, allow_above=True, top=0.02, bottom=0.50)
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
        cx, cy = _aside(w, h, r, S * 2, allow_above=True, top=0.02, bottom=0.38)

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

def breath(w, h, kind, pal, seed, mx, my, phase=0.0):
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
        # phase slides every puff along its path and wraps, so a loop joins
        # back to itself with nothing jumping
        t = ((k + phase * 1.0) % puffs) / max(puffs - 1, 1)
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


def moondust(w, h, kind, pal, seed, phase=0.0):
    """Fine motes hanging in the air, thicker low down, drifting sideways."""
    r = np.random.default_rng(seed + 55)
    out = _rgba(h, w)
    if kind == "None":
        return out
    dens = {"Faint": 0.010, "Drifting": 0.028, "Heavy": 0.060}[kind]
    y, x = np.mgrid[0:h, 0:w]

    low = np.clip(y / h, 0, 1) ** 1.4
    field = (r.random((h, w)) < dens * (0.35 + low))
    if phase:
        field = np.roll(field, int(phase * h) % h, axis=0)
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


# ---------------------------------------------------------------- violence

def explosions(w, h, kind, pal, seed):
    """A burst: white core, a hot shell, a dithered shockwave ring, and
    shards thrown outward with trails behind them."""
    r = np.random.default_rng(seed + 211)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"One": 1, "Two": 2, "Barrage": 4}[kind]
    y, x = np.mgrid[0:h, 0:w]

    for i in range(n):
        R = w * r.uniform(0.07, 0.15)
        cx, cy = _aside(w, h, r, R * 2, allow_above=True, top=0.04, bottom=0.52)
        d = np.sqrt((x-cx)**2 + (y-cy)**2)

        # the shockwave, thrown out well past the fireball
        wave = np.abs(d - R*2.1) < R*0.30
        _put(out, wave & _dither(np.clip(1 - np.abs(d - R*2.1)/(R*0.30), 0, 1)*0.55, seed+i),
             pal["burst_far"], 150)

        # the body of it, hot in the middle and cooling outward
        for k, (frac, col) in enumerate(((1.00, "burst_far"), (0.72, "burst_mid"),
                                         (0.44, "burst_hot"), (0.20, "burst_core"))):
            shell = d <= R*frac
            if k < 3:
                _put(out, shell & _dither(np.clip(1 - d/(R*frac), 0, 1) ** 0.6, seed+i+k),
                     pal[col])
            else:
                _put(out, shell, pal[col])

        for _ in range(int(r.integers(10, 20))):      # shards, with trails
            a = r.uniform(0, 6.28)
            reach = R * r.uniform(1.4, 3.0)
            for t in np.linspace(R*0.7, reach, int(reach)):
                px, py = int(cx + np.cos(a)*t), int(cy + np.sin(a)*t)
                if 0 <= px < w and 0 <= py < h:
                    hot = t < reach*0.55
                    out[py, px] = list(pal["burst_hot" if hot else "burst_far"]) + [255]
    return out


def lightning(w, h, kind, pal, seed):
    """Forked bolts that fall.

    Two things were wrong before. The heading was free to accumulate, so a
    bolt would curve away sideways and read as a contrail rather than a
    strike — the heading is clamped near straight down now, and it is the
    sharp angles inside that cone that make it read. And it was drawn at one
    thickness the whole way, where a bolt is thick where it starts and thin
    where it ends, and a fork is always thinner than what it left.
    """
    r = np.random.default_rng(seed + 307)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"Strike": 1, "Storm": 2, "Tempest": 4}[kind]
    core, glow = pal["bolt"], pal["bolt_glow"]
    DOWN = np.pi / 2
    CONE = 0.62                     # never more than this far from straight down

    def stroke(x0, y0, x1, y1, thick, alpha_core=255):
        steps = int(max(abs(x1-x0), abs(y1-y0))) + 1
        for i in range(steps + 1):
            t = i / max(steps, 1)
            ix, iy = int(round(x0 + (x1-x0)*t)), int(round(y0 + (y1-y0)*t))
            g = thick + 3
            for dx in range(-g, g+1):
                for dy in range(-g, g+1):
                    if dx*dx + dy*dy > g*g:
                        continue
                    X, Y = ix+dx, iy+dy
                    if 0 <= X < w and 0 <= Y < h and out[Y, X, 3] < 120:
                        out[Y, X] = list(glow) + [90]
            for dx in range(-thick, thick+1):
                for dy in range(-thick, thick+1):
                    X, Y = ix+dx, iy+dy
                    if 0 <= X < w and 0 <= Y < h:
                        out[Y, X] = list(core) + [alpha_core]

    def bolt(px, py, length, thick, depth):
        gone = 0.0
        while gone < length and 0 <= px < w and py < h:
            ang = DOWN + r.uniform(-CONE, CONE)     # always downward
            run = length * r.uniform(0.10, 0.22)
            nx_ = px + np.cos(ang) * run
            ny_ = py + np.sin(ang) * run
            t = gone / max(length, 1)
            stroke(px, py, nx_, ny_, max(0, int(round(thick * (1 - t*0.72)))))
            px, py = nx_, ny_
            gone += run
            if depth > 0 and r.random() < 0.40:     # a fork, always thinner
                bolt(px, py, length * r.uniform(0.22, 0.45),
                     max(0, thick - 1), depth - 1)

    for i in range(n):
        side = -1 if i % 2 == 0 else 1
        sx = w/2 + side * r.uniform(w * (KEEP_OUT + 0.04), w*0.48)
        bolt(float(np.clip(sx, 6, w-7)), r.uniform(-h*0.02, h*0.06),
             h * r.uniform(0.55, 0.95), 2, 3)
    return out
    n = {"Strike": 1, "Storm": 2, "Tempest": 4}[kind]
    core, glow = pal["bolt"], pal["bolt_glow"]

    def walk(px, py, ang, length, depth, thick):
        """Long straight runs with sharp kinks between them.

        Wandering a little every step, with a branch always possible, made a
        fine web that read as cracks in glass rather than lightning. A bolt is
        mostly straight; it is the sudden angles that make it read.
        """
        travelled = 0.0
        while travelled < length:
            ang += r.uniform(-0.55, 0.55)             # one sharp kink
            run = r.uniform(length * 0.12, length * 0.30)
            for t in np.arange(0, run, 1.0):
                px += np.cos(ang); py += np.sin(ang)
                ix, iy = int(px), int(py)
                if not (0 <= ix < w and 0 <= iy < h):
                    return
                for dx in range(-thick-3, thick+4):
                    for dy in range(-thick-3, thick+4):
                        X, Y = ix+dx, iy+dy
                        if 0 <= X < w and 0 <= Y < h and out[Y, X, 3] == 0:
                            out[Y, X] = list(glow) + [100]
                for dx in range(-thick, thick+1):
                    for dy in range(-thick, thick+1):
                        X, Y = ix+dx, iy+dy
                        if 0 <= X < w and 0 <= Y < h:
                            out[Y, X] = list(core) + [255]
            travelled += run
            if depth > 0 and r.random() < 0.55:       # one fork, not a web
                walk(px, py, ang + r.choice([-1, 1]) * r.uniform(0.6, 1.2),
                     length * r.uniform(0.30, 0.55), depth-1, max(0, thick-1))

    for i in range(n):
        side = -1 if i % 2 == 0 else 1
        sx = w/2 + side * r.uniform(w*0.18, w*0.48)
        walk(float(np.clip(sx, 4, w-5)), r.uniform(0, h*0.08),
             np.pi/2 + r.uniform(-0.45, 0.45), h * r.uniform(0.45, 0.85), 2, 2)
    return out


# ---------------------------------------------------------------- the floor

FLOOR = 0.80                 # where the ground is, as a fraction of height


def ground(w, h, kind, pal, seed):
    """A hint of floor, not a painted one.

    Enough for something to be rooted in. The background stays black — this
    is a dithered band that fades out upward, so there is no hard line
    anywhere and nothing reads as a stage.
    """
    out = _rgba(h, w)
    if kind == "None":
        return out
    y, x = np.mgrid[0:h, 0:w]
    f = h * FLOOR
    depth = np.clip((y - f) / max(h - f, 1), 0, 1)
    _put(out, _dither(0.18 + depth * 0.45, seed + 71) & (y >= f), pal["ground"], 220)
    _put(out, _dither(depth * 0.22, seed + 72) & (y >= f), pal["ground_lit"], 170)
    # a line of grit where the ground begins, so it reads as ground rather
    # than as the picture getting slightly lighter toward the bottom
    # Softer than it was: a solid line at half density read as the edge of
    # a stage. A sparse scatter still says "ground starts here".
    lip = (y >= f) & (y < f + max(1, h * 0.006))
    _put(out, lip & _dither(np.full((h, w), 0.28), seed + 73), pal["ground_lit"], 150)
    return out


def trees(w, h, kind, pal, seed):
    """Trees rooted on the floor.

    Grown, not drawn: a trunk that tapers, splitting into thinner limbs until
    they are a pixel, with dithered foliage gathered at the ends. Far ones are
    smaller, dimmer and drawn first.
    """
    r = np.random.default_rng(seed + 811)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"One": 1, "Copse": 3, "Forest": 6}[kind]
    y, x = np.mgrid[0:h, 0:w]
    f = h * FLOOR

    stand = []
    for i in range(n):
        near = r.random() ** 0.8
        # pushed out to the sides: the being owns the middle of the floor
        side = -1 if i % 2 == 0 else 1
        cx = w/2 + side * r.uniform(w * (KEEP_OUT + 0.03), w*0.50)
        stand.append((near, float(np.clip(cx, 4, w-5))))
    stand.sort()

    for near, cx in stand:
        H = h * (0.14 + near * 0.30) * r.uniform(0.85, 1.2)
        base = f + (h - f) * near * r.uniform(0.2, 0.9)
        dim = 0.45 + near * 0.55
        bark = tuple(int(c * dim) for c in pal["tree_bark"])
        leaf = tuple(int(c * dim) for c in pal["tree_leaf"])
        leaf_lit = tuple(int(c * dim) for c in pal["tree_leaf_lit"])

        def limb(px, py, ang, length, thick, depth):
            if depth == 0 or length < 2:
                # foliage gathers where the twigs end
                rad = max(2.0, H * 0.055)
                blob = np.exp(-(((x - px) / rad) ** 2 + ((y - py) / rad) ** 2))
                _put(out, _dither(blob * 0.95, seed + int(px) + int(py)), leaf)
                _put(out, _dither(blob * 0.42, seed + int(px) * 3), leaf_lit)
                return
            steps = int(length)
            for t in range(steps):
                nx_ = px + np.cos(ang) * 1.0
                ny_ = py + np.sin(ang) * 1.0
                ix, iy = int(nx_), int(ny_)
                for d in range(-thick, thick + 1):
                    for e in range(-thick, thick + 1):
                        X, Y = ix + d, iy + e
                        if 0 <= X < w and 0 <= Y < h:
                            out[Y, X] = list(bark) + [255]
                px, py = nx_, ny_
                ang += r.uniform(-0.05, 0.05)
            for s_ in (-1, 1):
                # lean away from the middle: a branch that would head back
                # across the character is turned outward instead
                outward = 1.0 if px > w / 2 else -1.0
                bias = 0.30 * outward * (1.0 - min(abs(px / w - 0.5) / 0.5, 1.0))
                limb(px, py, ang + s_ * r.uniform(0.35, 0.72) + bias,
                     length * r.uniform(0.58, 0.76),
                     max(0, thick - 1), depth - 1)

        limb(cx, base, -np.pi/2, H * 0.34, max(1, int(H * 0.018)), 5)
    return clear_column(out, w, h)


def mushrooms(w, h, kind, pal, seed, horizon=FLOOR):
    """Growing along the bottom of the frame.

    Clustered rather than evenly spread, because things that grow do. Caps
    get spots, stems get a ring, and the nearer ones are larger and lower —
    which is the only depth cue a flat band of ground has.
    """
    r = np.random.default_rng(seed + 613)
    out = _rgba(h, w)
    if kind == "None":
        return out
    n = {"Few": 5, "Cluster": 11, "Grove": 22}[kind]
    y, x = np.mgrid[0:h, 0:w]
    floor = h * horizon

    # Clumps spread right across the floor, and biased outward. All of them
    # near one point put the whole crop behind the being, where nothing is
    # visible — the being's base owns the middle of the ground.
    clumps = []
    for k in range(max(3, n // 3)):
        side = -1 if k % 2 == 0 else 1
        clumps.append(float(np.clip(w/2 + side * r.uniform(w * (KEEP_OUT + 0.02), w*0.52),
                                    4, w-5)))

    order = []
    for i in range(n):
        near = r.random() ** 0.7                    # 0 far, 1 near
        cx = float(np.clip(r.choice(clumps) + r.normal(0, w * 0.05), 2, w - 3))
        if abs(cx / w - 0.5) < KEEP_OUT:          # never under the character
            cx = w/2 + np.sign(cx - w/2 or 1) * w * (KEEP_OUT + 0.02)
        base = floor + (h - floor) * near * r.uniform(0.35, 1.0)
        # Enlarged once because they were invisible, and that overshot — at
        # this width a near mushroom stood taller than the trees and buried
        # them. Mushrooms are ankle height; trees are not.
        size = w * (0.022 + near * 0.042) * r.uniform(0.8, 1.25)
        order.append((near, cx, base, size))
    order.sort()                                     # far ones first

    for near, cx, base, size in order:
        stem_h = size * r.uniform(1.3, 2.2)
        stem_w = max(1, size * 0.17)
        top = base - stem_h

        stem = (np.abs(x - cx) <= stem_w) & (y <= base) & (y >= top)
        _put(out, stem, pal["shroom_stem"])
        _put(out, stem & (x > cx + stem_w * 0.2), pal["shroom_stem_dark"])

        cap_w, cap_h = size, size * 0.62
        cap = (((x - cx) / cap_w) ** 2 + ((y - top) / cap_h) ** 2 <= 1) & (y <= top)
        _put(out, cap, pal["shroom_cap"])
        _put(out, cap & (y < top - cap_h * 0.45), pal["shroom_cap_light"])

        rim = cap & (y >= top - max(1, cap_h * 0.12))
        _put(out, rim, pal["shroom_gill"])

        for _ in range(int(r.integers(2, 6))):       # spots
            sx = cx + r.uniform(-cap_w * 0.72, cap_w * 0.72)
            sy = top - r.uniform(cap_h * 0.15, cap_h * 0.80)
            sr = max(1, size * r.uniform(0.07, 0.14))
            spot = ((x - sx) ** 2 + (y - sy) ** 2 <= sr * sr) & cap
            _put(out, spot, pal["shroom_spot"])

        ring = (np.abs(x - cx) <= stem_w * 2.2) & (np.abs(y - (top + stem_h * 0.30)) <= 0.7)
        _put(out, ring & (y > top), pal["shroom_gill"])

        # what it throws onto the ground under it
        glow = np.exp(-(((x - cx) / (size * 2.2)) ** 2 + ((y - base) / (size * 0.7)) ** 2))
        _put(out, _dither(glow * 0.45, seed + int(cx)) & (y > base - 1),
             pal["shroom_cap_light"], 110)
    return clear_column(out, w, h, above=0.0)
