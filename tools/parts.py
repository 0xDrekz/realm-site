#!/usr/bin/env python3
"""
REALM — working out which part of a being is which.

The beings are line art: bright shapes divided by dark lines. Labelling the
bright areas gives hundreds of fragments, not parts — 435 on the Entity. But
every fragment knows where it sits, and that is enough: each one is handed to
a part by where its middle falls inside the being's own box, anchored on the
eyes so it works whatever the proportions are.

The dark areas INSIDE the silhouette are not background. On these beings they
are hair — 58% of the Entity, 40% of the Mythic, 15% of the plain sprite,
which tracks exactly with how much hair each one has.

Nothing here needs a second drawing. It reads the art we already have.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

from compose import eyes

NAMES = ["Crown", "Hair", "Face", "Wings", "Arms", "Body", "Base"]
CROWN, HAIR, FACE, WINGS, ARMS, BODY, BASE = range(7)


def split(alpha, dark_at=90, bright_at=150):
    """Return one part number per pixel, and -1 outside the being."""
    h, w = alpha.shape
    body = ndimage.binary_fill_holes(alpha > 20)
    if not body.any():
        return np.full((h, w), -1, np.int8)

    ys, xs = np.where(body)
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    bh, bw = max(y1 - y0, 1), max(x1 - x0, 1)

    # where the eyes are tells us where the head is, whatever the proportions
    e = eyes(alpha)
    if e.any():
        ey = (np.where(e)[0].mean() - y0) / bh
    else:
        ey = 0.18                      # no open eyes: assume a head up top
    brow = max(0.05, ey - 0.10)        # above this is crown
    chin = min(0.95, ey + 0.22)        # below this the head has ended

    out = np.full((h, w), -1, np.int8)

    # hair first: dark, but inside the being
    hair = body & (alpha <= dark_at)
    out[hair] = HAIR

    # Per pixel, not per fragment. Handing a whole fragment to one part put
    # a crown and the face it touches into the same bucket, because their
    # shared blob had one middle and it landed on the face.
    yy, xx = np.mgrid[0:h, 0:w]
    ny = (yy - y0) / bh
    nx = (xx - x0) / bw
    side = np.abs(nx - 0.5)

    # how broad the being is at each pixel. A wing is a sheet; an arm is a
    # stick. Without this the arms of a wingless alien were called wings,
    # because all the rule had to go on was "far from the middle".
    thick = ndimage.distance_transform_edt(body)
    broad = thick > max(2.0, np.percentile(thick[body], 88) * 0.45)

    bright = body & (alpha > bright_at)
    out[bright & (ny < brow)] = CROWN
    out[bright & (ny >= brow) & (ny < chin) & (side < 0.20)] = FACE
    outer = bright & (ny >= brow) & (side > 0.24) & (ny < 0.80)
    out[outer & broad] = WINGS
    out[outer & ~broad] = ARMS
    rest = bright & (out < 0)
    out[rest & (ny > 0.66)] = BASE
    out[rest & (out < 0)] = BODY

    # whatever is left inside the being — the mid greys, the drawn lines
    # themselves — takes the part of its nearest labelled neighbour rather
    # than a catch-all, so a line between two parts belongs to one of them
    gap = body & (out < 0)
    if gap.any():
        known = out >= 0
        if known.any():
            _, idx = ndimage.distance_transform_edt(~known, return_indices=True)
            out[gap] = out[idx[0][gap], idx[1][gap]]
        else:
            out[gap] = BODY
    return out


def mouth(alpha):
    """Where smoke should come from.

    Below the eyes, on the line between them. The gap between the eyes sets
    the scale, so it lands right on a wide face and a narrow one alike.
    """
    h, w = alpha.shape
    e = eyes(alpha)
    if e.any():
        lab, n = ndimage.label(e)
        cs = ndimage.center_of_mass(e, lab, range(1, n+1))
        ey = float(np.mean([c[0] for c in cs]))
        ex = float(np.mean([c[1] for c in cs]))
        if n >= 2:
            span = abs(cs[0][1] - cs[1][1])
        else:
            span = w * 0.12
        return ex, ey + span * 0.95

    body = ndimage.binary_fill_holes(alpha > 20)
    ys, xs = np.where(body)
    if not len(ys):
        return w / 2, h / 2
    y0, y1 = ys.min(), ys.max()
    return float(xs.mean()), float(y0 + (y1 - y0) * 0.30)


def preview(alpha, regions):
    """A picture of the map, for looking at rather than trusting."""
    KEY = [(255, 90, 90), (170, 90, 255), (255, 214, 120), (90, 200, 255),
           (120, 255, 170), (255, 150, 220), (200, 200, 210)]
    h, w = alpha.shape
    img = np.zeros((h, w, 3), np.uint8)
    for k in range(len(NAMES)):
        img[regions == k] = KEY[k]
    return Image.fromarray(img)
