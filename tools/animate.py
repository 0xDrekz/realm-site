#!/usr/bin/env python3
"""
REALM — the rarest ones move.

Nothing else in a marketplace grid moves, so a God that does is seen first.

The smoke climbs, the dust drifts, the lightning flashes and goes dark
between. Everything is driven by one phase running 0 to 1 and back to 0, so
the loop joins to itself with nothing jumping.
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
from render import render


def frames(being_png, pal, t, canvas, scale, seed, n=16, **kw):
    out = []
    for i in range(n):
        out.append(render(being_png, pal, t, canvas, scale, seed,
                          phase=i / n, **kw))
    return out


def gif(path, imgs, ms=110, size=None):
    if size:
        imgs = [im.resize((size, size), Image.NEAREST) for im in imgs]
    # one palette for every frame, or the colours crawl between them
    base = imgs[0].quantize(colors=128, method=Image.MEDIANCUT)
    rest = [im.quantize(palette=base, dither=Image.Dither.NONE) for im in imgs]
    rest[0].save(path, save_all=True, append_images=rest[1:],
                 duration=ms, loop=0, optimize=True, disposal=2)
    return path
