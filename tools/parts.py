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

    yy, xx = np.mgrid[0:h, 0:w]
    ny = (yy - y0) / bh
    nx = (xx - x0) / bw
    side = np.abs(nx - 0.5)

    # Where things are, for every pixel of the being — dark ones included.
    # Judging only the bright pixels and calling everything dark "hair" gave
    # the Entity violet wings and a violet base, because its wings and the
    # coil under it are dark too.
    out[body] = BODY
    out[body & (ny > 0.66)] = BASE
    # Wings sit high and arms hang low. Thickness was tried first — a wing is
    # a sheet, an arm is a stick — but the bones running through a wing are
    # thin, so a single wing came out in two colours, which is the one thing
    # a part map cannot do.
    outer = body & (side > 0.24) & (ny >= brow) & (ny < 0.82)
    out[outer & (ny < 0.50)] = WINGS
    out[outer & (ny >= 0.50)] = ARMS
    out[body & (ny >= brow) & (ny < chin) & (side < 0.20)] = FACE
    out[body & (ny < brow)] = CROWN

    # Hair is the dark, but only where hair can be: around the head and down
    # the middle. Dark out at the edges is a wing, dark at the bottom is
    # whatever the being is standing in.
    # Kept narrow on purpose. At 0.40 the dark inner half of a wing fell
    # inside the hair zone and every winged being came out with violet wings.
    hair = body & (alpha <= dark_at) & (ny < 0.62) & (side < 0.25)
    out[hair] = HAIR

    # Make each part one solid area.
    #
    # Deciding pixel by pixel is right about WHERE things are and wrong about
    # what they belong to: the bones running through a wing are thin, so the
    # thickness rule called them arms and the wing came out in two colours.
    # A part has to be one colour or the whole idea falls apart.
    #
    # So every pixel is handed to whichever part wins its neighbourhood. A
    # bone sitting inside a wing is surrounded by wing and joins it; a real
    # arm out in open space is surrounded by arm and stays.
    out = _settle(out, body, max(3, int(min(h, w) * 0.055)))

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


def _settle(out, body, radius):
    """Give every pixel the part that wins its neighbourhood."""
    h, w = out.shape
    best = np.full((h, w), -np.inf)
    win = np.full((h, w), -1, np.int8)
    for k in range(len(NAMES)):
        share = ndimage.uniform_filter((out == k).astype(np.float32), size=radius)
        take = share > best
        best = np.where(take, share, best)
        win = np.where(take, np.int8(k), win)
    return np.where(body & (best > 0), win, np.int8(-1))


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
