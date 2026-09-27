#!/usr/bin/env python3
"""
REALM — things living in the background.

Patterns are geometry. These are creatures and objects: eyes that look back,
hands, moths, moons. They are what stop a background being wallpaper.

Each is drawn as a small sprite on the art grid and scattered at several
sizes, the far ones dimmer and cooler, so the field has depth.
"""
import numpy as np


def _blank(s):
    return np.zeros((s, s, 4), np.uint8)


def _edge(sp, ink):
    """A dark rim, so the thing reads against whatever it sits on.

    Without it these were shapes of roughly the right colour dissolving into
    the pattern behind them, which is not a creature, it is a stain.
    """
    from scipy import ndimage
    a = sp[:, :, 3] > 40
    grown = ndimage.binary_dilation(a, iterations=1)
    out = sp.copy()
    out[grown & ~a] = list(ink) + [255]
    return out


def _disc(sp, cx, cy, r, col, a=255):
    s = sp.shape[0]
    y, x = np.mgrid[0:s, 0:s]
    m = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    sp[m] = list(col) + [a]
    return m


def _ring(sp, cx, cy, r, col, a=255, t=0.7):
    s = sp.shape[0]
    y, x = np.mgrid[0:s, 0:s]
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    sp[np.abs(d - r) <= t] = list(col) + [a]


def eye(s, pal, rng):
    """One that looks back. Sclera, veins, iris, pupil, glint."""
    sp = _blank(s)
    c = (s - 1) / 2
    y, x = np.mgrid[0:s, 0:s]
    # almond, not a circle
    alm = ((x - c) / (s * 0.48)) ** 2 + ((y - c) / (s * 0.34)) ** 2 <= 1
    sp[alm] = list(pal["sclera"]) + [255]

    for _ in range(int(s * 0.5)):               # veins
        a = rng.uniform(0, 6.28)
        px, py = c + np.cos(a) * s * 0.44, c + np.sin(a) * s * 0.30
        for k in range(int(s * 0.22)):
            px -= np.cos(a) * 0.9 + rng.uniform(-.5, .5)
            py -= np.sin(a) * 0.9 + rng.uniform(-.5, .5)
            ix, iy = int(px), int(py)
            if 0 <= ix < s and 0 <= iy < s and alm[iy, ix]:
                sp[iy, ix] = list(pal["vein"]) + [255]

    r = s * 0.20
    _disc(sp, c, c, r, pal["iris"])
    _ring(sp, c, c, r * 0.72, pal["iris_dark"])
    _disc(sp, c, c, r * 0.46, (8, 5, 12))
    gx, gy = int(c - r * 0.42), int(c - r * 0.42)
    if 0 <= gx < s and 0 <= gy < s:
        sp[gy, gx] = [255, 255, 255, 255]
    sp[alm & (sp[:, :, 3] == 0)] = list(pal["sclera"]) + [255]
    return sp


def moth(s, pal, rng):
    sp = _blank(s)
    c = (s - 1) / 2
    y, x = np.mgrid[0:s, 0:s]
    for side in (-1, 1):
        for rx, ry, oy in ((0.30, 0.27, -0.14), (0.19, 0.20, 0.18)):
            cx = c + side * s * rx * 0.92
            cy = c + s * oy
            m = ((x - cx) / (s * rx)) ** 2 + ((y - cy) / (s * ry)) ** 2 <= 1
            sp[m] = list(pal["wing"]) + [255]
            m2 = ((x - cx) / (s * rx * 0.55)) ** 2 + ((y - cy) / (s * ry * 0.55)) ** 2 <= 1
            sp[m2] = list(pal["wing_in"]) + [255]
            # an eyespot, which is what makes a moth read as a moth
            _disc(sp, cx, cy, s * ry * 0.26, pal["body"])
            _ring(sp, cx, cy, s * ry * 0.40, pal["wing_in"])
    body = (np.abs(x - c) < max(1, s * 0.05)) & (np.abs(y - c) < s * 0.36)
    sp[body] = list(pal["body"]) + [255]
    for side in (-1, 1):                          # antennae
        for k in range(int(s * 0.22)):
            ix = int(c + side * k * 0.6); iy = int(c - s * 0.34 - k * 0.5)
            if 0 <= ix < s and 0 <= iy < s:
                sp[iy, ix] = list(pal["body"]) + [255]
    return sp


def hand(s, pal, rng):
    """A palm with fingers that actually clear it.

    First attempt started the fingers at the middle of the palm and made
    them shorter than the palm was wide, so they never emerged and the whole
    thing was a blob.
    """
    sp = _blank(s)
    c = (s - 1) / 2
    y, x = np.mgrid[0:s, 0:s]

    palm_cy = c + s * 0.22
    palm_rx, palm_ry = s * 0.19, s * 0.21
    palm = ((x - c) / palm_rx) ** 2 + ((y - palm_cy) / palm_ry) ** 2 <= 1
    sp[palm] = list(pal["skin"]) + [255]

    wrist = (np.abs(x - c) < palm_rx * 0.62) & (y > palm_cy)
    sp[wrist] = list(pal["skin"]) + [255]

    top = palm_cy - palm_ry * 0.80
    for k in range(4):                        # four fingers, from the knuckles
        fx = c + (k - 1.5) * palm_rx * 0.58
        ln = s * (0.30 if k in (1, 2) else 0.25)
        wdt = max(1, int(s * 0.035))
        for t in range(int(ln)):
            iy = int(top - t)
            for d in range(-wdt, wdt + 1):
                ix = int(fx + d)
                if 0 <= ix < s and 0 <= iy < s:
                    sp[iy, ix] = list(pal["skin"]) + [255]

    for t in range(int(s * 0.22)):            # thumb, out to the side
        ix = int(c - palm_rx - t * 0.75)
        iy = int(palm_cy - t * 0.55)
        for d in range(0, max(1, int(s * 0.055))):
            if 0 <= ix < s and 0 <= iy + d < s:
                sp[iy + d, ix] = list(pal["skin"]) + [255]

    # an eye in the palm, because this is that kind of realm
    _disc(sp, c, palm_cy, palm_ry * 0.34, pal["sclera"])
    _disc(sp, c, palm_cy, palm_ry * 0.17, (10, 6, 14))
    return sp


def moon(s, pal, rng):
    sp = _blank(s)
    c = (s - 1) / 2
    full = _disc(sp, c, c, s * 0.42, pal["moon"])
    for _ in range(int(s * 0.3)):                 # craters
        cx, cy = rng.uniform(s*0.2, s*0.8), rng.uniform(s*0.2, s*0.8)
        r = rng.uniform(s*0.03, s*0.09)
        y, x = np.mgrid[0:s, 0:s]
        m = ((x-cx)**2 + (y-cy)**2 <= r*r) & full
        sp[m] = list(pal["moon_dark"]) + [255]
    bite = _blank(s)
    _disc(bite, c + s * 0.22, c - s * 0.10, s * 0.38, (0, 0, 0))
    sp[bite[:, :, 3] > 0] = 0
    return sp


KINDS = {"Eyes": eye, "Moths": moth, "Hands": hand, "Moons": moon}


def scatter(w, h, kind, count, pal, seed, avoid=0.26):
    """Lay a field of them down, far ones first and dimmer."""
    out = np.zeros((h, w, 4), np.uint8)
    if kind == "None" or count == 0:
        return out
    rng = np.random.default_rng(seed + 401)
    make = KINDS[kind]

    for i in range(count):
        depth = rng.random()                      # 0 near, 1 far
        # A balance found the hard way. Too small and dim and they are
        # smudges; at a quarter of the frame and full brightness they compete
        # with the being and the picture has no subject.
        s = int(w * (0.17 - depth * 0.085) * rng.uniform(0.8, 1.25))
        if s < 10:
            continue
        sp = make(s, pal, rng)
        sp = _edge(sp, pal.get("ink", (8, 5, 12)))

        # keep clear of the middle, where the being stands
        for _ in range(24):
            cx = rng.uniform(0, w - s); cy = rng.uniform(0, h * 0.82 - s)
            if abs((cx + s/2)/w - 0.5) > avoid or (cy + s/2)/h < 0.30:
                break

        fade = 0.82 - depth * 0.44
        px, py = int(cx), int(cy)
        x0, y0 = max(0, px), max(0, py)
        x1, y1 = min(w, px + s), min(h, py + s)
        if x1 <= x0 or y1 <= y0:
            continue
        cut = sp[y0-py:y1-py, x0-px:x1-px].astype(float)
        cut[:, :, :3] *= fade
        cut[:, :, 3] *= fade
        patch = out[y0:y1, x0:x1].astype(float)
        a = cut[:, :, 3:4] / 255.0
        out[y0:y1, x0:x1, :3] = (cut[:, :, :3] * a + patch[:, :, :3] * (1 - a)).astype(np.uint8)
        out[y0:y1, x0:x1, 3] = np.maximum(patch[:, :, 3], cut[:, :, 3]).astype(np.uint8)
    return out
