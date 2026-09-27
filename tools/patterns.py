#!/usr/bin/env python3
"""
REALM — the geometry that stands behind a being.

Every one is rasterised on the art grid, a pixel wide, with hard edges. None
of it is drawn large and shrunk, because shrinking a one-pixel line either
loses it or turns it to mush.

A circle is `|distance - r| < 0.5`. A line is walked one pixel at a time.
That is the whole of it.
"""
import numpy as np


def _canvas(w, h):
    return np.zeros((h, w), bool)


def _ring(m, cx, cy, r, thick=0.5):
    h, w = m.shape
    y, x = np.mgrid[0:h, 0:w]
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    m |= np.abs(d - r) <= thick
    return m


def _disc(m, cx, cy, r):
    h, w = m.shape
    y, x = np.mgrid[0:h, 0:w]
    m |= ((x - cx) ** 2 + (y - cy) ** 2) <= r * r
    return m


def _line(m, x0, y0, x1, y1):
    """One pixel at a time, so it stays one pixel wide."""
    h, w = m.shape
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / max(n, 1)
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        if 0 <= x < w and 0 <= y < h:
            m[y, x] = True
    return m


def _poly(m, cx, cy, r, sides, rot=0.0, close=True):
    pts = [(cx + r * np.cos(rot + k * 2*np.pi/sides),
            cy + r * np.sin(rot + k * 2*np.pi/sides)) for k in range(sides)]
    for i in range(len(pts) if close else len(pts) - 1):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        _line(m, a[0], a[1], b[0], b[1])
    return pts


# ---------------------------------------------------------------- the shapes

def _downward(a, guard=0.44):
    """True if this direction points near enough straight down.

    A spoke that does is a spoke that runs out of the figure, past the
    character's waist and between its legs, and ends on the floor looking
    like something planted there.
    """
    d = (a - np.pi / 2 + np.pi) % (2 * np.pi) - np.pi
    return abs(d) < guard


def mandala(w, h, cx, cy, R, rng):
    m = _canvas(w, h)
    for k in (1.0, 0.82, 0.60, 0.34, 0.16):
        _ring(m, cx, cy, R * k)
    spokes = int(rng.choice([8, 12, 16, 24]))
    for k in range(spokes):
        a = k * 2*np.pi/spokes
        if _downward(a):
            continue
        _line(m, cx + R*0.16*np.cos(a), cy + R*0.16*np.sin(a),
                 cx + R*np.cos(a),      cy + R*np.sin(a))
    for k in range(spokes):
        a = (k + 0.5) * 2*np.pi/spokes
        _ring(m, cx + R*0.71*np.cos(a), cy + R*0.71*np.sin(a), R*0.11)
    return m


def flower(w, h, cx, cy, R, rng):
    """Overlapping circles on a hex lattice — the flower of life."""
    m = _canvas(w, h)
    r = R / 3.0
    _ring(m, cx, cy, r)
    for ring_i in (1, 2, 3):
        n = 6 * ring_i
        for k in range(n):
            a = k * 2*np.pi/n
            d = r * ring_i * (1.0 if ring_i % 2 else 0.866 * 2 / np.sqrt(3))
            px, py = cx + d*np.cos(a), cy + d*np.sin(a)
            if abs(px-cx) < R*1.2 and abs(py-cy) < R*1.2:
                _ring(m, px, py, r)
    _ring(m, cx, cy, R)
    return m


def yantra(w, h, cx, cy, R, rng):
    """Interlocking triangles inside rings."""
    m = _canvas(w, h)
    _ring(m, cx, cy, R)
    _ring(m, cx, cy, R * 0.88)
    for k, s in enumerate((1.0, 0.72, 0.46)):
        _poly(m, cx, cy, R*0.80*s, 3, rot=-np.pi/2)
        _poly(m, cx, cy, R*0.80*s, 3, rot=np.pi/2)
    for k in range(12):
        a = k * 2*np.pi/12
        if _downward(a, 0.30):
            continue
        _line(m, cx + R*np.cos(a), cy + R*np.sin(a),
                 cx + R*1.10*np.cos(a), cy + R*1.10*np.sin(a))
    return m


def metatron(w, h, cx, cy, R, rng):
    """Thirteen points, every one joined to every other."""
    m = _canvas(w, h)
    pts = [(cx, cy)]
    for ring_i, rr in ((6, R*0.5), (6, R)):
        for k in range(ring_i):
            a = k * 2*np.pi/ring_i - np.pi/2
            pts.append((cx + rr*np.cos(a), cy + rr*np.sin(a)))
    for i in range(len(pts)):
        for j in range(i+1, len(pts)):
            _line(m, *pts[i], *pts[j])
    for p in pts:
        _disc(m, p[0], p[1], max(1, R*0.035))
    return m


def rays(w, h, cx, cy, R, rng):
    """A burst, with a horizon ring."""
    m = _canvas(w, h)
    n = int(rng.choice([16, 24, 32]))
    for k in range(n):
        a = k * 2*np.pi/n
        if _downward(a):
            continue
        _line(m, cx + R*0.18*np.cos(a), cy + R*0.18*np.sin(a),
                 cx + R*1.5*np.cos(a),  cy + R*1.5*np.sin(a))
    _ring(m, cx, cy, R*0.18)
    _ring(m, cx, cy, R*0.62)
    return m


def lattice(w, h, cx, cy, R, rng):
    """Wallpaper rather than a medallion — diamonds over the whole sky."""
    m = _canvas(w, h)
    step = max(4, int(R * 0.30))
    y, x = np.mgrid[0:h, 0:w]
    d = (np.abs(x - cx) + np.abs(y - cy)) % step
    m |= d < 1
    e = (np.abs(x - cx) % step < 1) | (np.abs(y - cy) % step < 1)
    m |= e & (((x + y) // step) % 3 == 0)
    return m


def tree(w, h, cx, cy, R, rng):
    """A branching thing, grown rather than drawn — each limb splits into two
    shorter ones until they are a pixel long."""
    m = _canvas(w, h)
    # it grows from the floor of the picture, not from the centre it is
    # nominally placed at — rooted at cy + R it ended up below the canvas and
    # all you saw was its stem
    root_y = h - 1

    def limb(x, y, ang, length, depth):
        if depth == 0 or length < 1.5:
            return
        x2, y2 = x + length*np.cos(ang), y + length*np.sin(ang)
        _line(m, x, y, x2, y2)
        if depth <= 3:
            _ring(m, x2, y2, max(1, length*0.22))
        spread = rng.uniform(0.34, 0.60)
        for s_ in (-spread, spread):
            limb(x2, y2, ang + s_, length*rng.uniform(0.62, 0.78), depth-1)

    limb(cx, root_y, -np.pi/2, (h * 0.30), 8)
    return m


def weird(w, h, cx, cy, R, rng):
    """Interference — two sets of rings crossing, which makes bands nobody
    drew. The pattern comes out of the arithmetic, not a shape."""
    m = _canvas(w, h)
    y, x = np.mgrid[0:h, 0:w]
    out = np.zeros((h, w), bool)
    for k in range(3):
        a = k * 2*np.pi/3
        ox, oy = cx + R*0.42*np.cos(a), cy + R*0.42*np.sin(a)
        d = np.sqrt((x-ox)**2 + (y-oy)**2)
        out ^= (d // max(3, int(R*0.13))).astype(int) % 2 == 0
    edge = np.zeros_like(out)
    edge[1:,:] |= out[1:,:] ^ out[:-1,:]
    edge[:,1:] |= out[:,1:] ^ out[:,:-1]
    # kept inside a disc, or it covers the whole picture and the being
    # disappears into it
    m |= edge & (np.sqrt((x-cx)**2 + (y-cy)**2) < R*1.05)
    return m


SHAPES = {"Mandala": mandala, "Flower": flower, "Yantra": yantra,
          "Metatron": metatron, "Rays": rays, "Lattice": lattice,
          "Tree": tree, "Weird": weird}


def draw(w, h, kind, cx, cy, R, seed):
    rng = np.random.default_rng(seed)
    return SHAPES[kind](w, h, cx, cy, R, rng)


# ---------------------------------------------------------------- layered

def rosette(w, h, cx, cy, R, rng):
    """Rings of circles inside rings of circles."""
    m = _canvas(w, h)
    _ring(m, cx, cy, R); _ring(m, cx, cy, R*0.97)
    for n, rr, cr in ((12, 0.78, 0.20), (18, 0.52, 0.13), (8, 0.28, 0.11)):
        for k in range(n):
            a = k * 2*np.pi/n + (0.3 if n == 18 else 0)
            _ring(m, cx + R*rr*np.cos(a), cy + R*rr*np.sin(a), R*cr)
    _poly(m, cx, cy, R*0.90, 12, rot=-np.pi/2)
    return m


def gatefold(w, h, cx, cy, R, rng):
    """Nested arches, like a doorway seen from straight on."""
    m = _canvas(w, h)
    for k, s in enumerate((1.0, 0.82, 0.64, 0.46, 0.28)):
        rr = R * s
        _ring(m, cx, cy, rr)
        # only the outer arches drop legs. The inner ones stood at a fifth of
        # the width from the middle, which put two posts through the
        # character's legs.
        if s >= 0.64:
            _line(m, cx - rr, cy, cx - rr, cy + R*1.3)
            _line(m, cx + rr, cy, cx + rr, cy + R*1.3)
    for k in range(24):
        a = np.pi + k * np.pi/23
        _line(m, cx + R*np.cos(a), cy + R*np.sin(a),
                 cx + R*1.18*np.cos(a), cy + R*1.18*np.sin(a))
    return m


def spiral(w, h, cx, cy, R, rng):
    """Arms winding out from the middle."""
    m = _canvas(w, h)
    arms = int(rng.choice([3, 5, 6]))
    for a0 in range(arms):
        base = a0 * 2*np.pi/arms + 0.35
        px, py = cx, cy
        for i in range(1, 260):
            t = i / 260
            ang = base + t * 5.6
            rr = R * t
            nx_, ny_ = cx + rr*np.cos(ang), cy + rr*np.sin(ang)
            _line(m, px, py, nx_, ny_)
            px, py = nx_, ny_
    for k in (0.34, 0.66, 1.0):
        _ring(m, cx, cy, R*k)
    return m


# "Tree" is deliberately NOT offered as a background figure any more. It grew
# from the bottom centre, so its trunk came up between the character's legs
# and its canopy spread across the middle — and the flora layer now grows real
# trees, at the sides, where they belong. The function stays for reference.
SHAPES.update({"Rosette": rosette, "Gatefold": gatefold, "Spiral": spiral})
SHAPES.pop("Tree", None)


def layered(w, h, kinds, cx, cy, R, seed):
    """Two or three patterns at different sizes, returned separately so each
    can be given its own colour. One thin outline on black is a diagram; a
    stack with colour running through it is a background."""
    out = []
    for i, (kind, scale) in enumerate(kinds):
        out.append(patterns_draw(w, h, kind, cx, cy, R*scale, seed + i*13))
    return out


def patterns_draw(w, h, kind, cx, cy, R, seed):
    return draw(w, h, kind, cx, cy, R, seed)
