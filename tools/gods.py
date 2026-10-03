#!/usr/bin/env python3
"""
REALM — the ten Gods and the twenty Entities.

    python3 tools/gods.py god [out-dir]       the ten Gods and a contact sheet
    python3 tools/gods.py entity [out-dir]    the twenty Entities likewise

The Gods are not line art. Each of the five figures arrives as a finished
greyscale picture with its own halo and its own stars, so they are not put
through the body colouring the lower tiers use. Instead:

  1. the figure is found in its picture: whatever cannot be reached from
     the border through dark sky (stars are taken out first by a median,
     so they cannot wall the sky off) — then holes filled and edges softened;
  2. its greys are mapped onto the God's colourway, a five-stop ramp from
     shadow to light;
  3. the God's traits are drawn behind it — the geometry, planets, UFOs,
     supernovae, lightning, trees — with the collection's own painters;
  4. its own halo rays and stars, outside the silhouette, are laid over that
     background as light, so nothing it was drawn with is lost;
  5. mushrooms grow in front, at the sides.

Ten Gods, two of each figure, and the deal guarantees every God a colourway
AND a geometry no other God has, and that the two Gods sharing a figure
differ in everything else they can.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f"{ROOT}/tools")
import traits
from render import sigilry, _aura_palette, _flora_palette
from compose import over
from palettes import BY_NAME

GRID = 600
# The figures were drawn to fill their pictures, which left the God's own
# traits nowhere to be seen. Held at this size, standing at the bottom, the
# geometry, planets and sky have room round the head and shoulders.
SCALE = 0.84

# name: (master, how dark the sky is, how hard to close the silhouette, where it may be)
GOD_FIGURES = {
    "Star Herald":   ("god-star-herald.jpg",   0.10, 8,  None),
    "Mask Wraith":   ("god-mask-wraith.jpg",   0.045, 26, None),
    "Still One":     ("god-still-one.jpg",     0.05, 8,  None),
    "Temple Warden": ("god-temple-warden.jpg", 0.07, 10, 175),    # inside the pillars
    "Galaxy Weaver": ("god-galaxy-weaver.jpg", 0.06, 8,  None),
}

ENTITY_FIGURES = {
    "Grinning Fractal": ("entity-grinning-fractal.jpg", 0.06, 10, None),
    "Smoke Sprite":     ("entity-smoke-sprite.jpg",     0.07, 10, None),
    "Mushroom Elder":   ("entity-mushroom-elder.jpg",   0.06, 8,  None),
    "Crowned Serpent":  ("entity-crowned-serpent.jpg",  0.06, 8,  None),
    "Deep One":         ("entity-deep-one.jpg",         0.10, 8,  None),
}
MYTHIC_FIGURES = {
    "Cube Sentinel":  ("mythic-cube-sentinel.jpg", 0.10, 10, None),
    "Antler Sprite":  ("mythic-antler-sprite.jpg", 0.06, 8,  None),
    "Shard Knight":   ("mythic-shard-knight.jpg",  0.06, 8,  None),
    "Eye Architect":  ("mythic-eye-architect.jpg", 0.10, 14, None),
}
FIGURES = {**GOD_FIGURES, **ENTITY_FIGURES, **MYTHIC_FIGURES}

# Figures drawn as thin white lines land on the palest stop of every ramp
# and come out white whatever they wear. Their brightness is capped here so
# the lines sit on the colour.
TONE = {"Eye Architect": 0.74, "Cube Sentinel": 0.9}

D = (5, 3, 14)
# shadow to light, five stops each; one colourway per God
RAMPS = {
    "Prism":       [D, (40, 30, 110), (60, 200, 220), (255, 120, 210), (255, 246, 210)],
    "Celestial":   [D, (40, 44, 80), (150, 170, 220), (236, 236, 250), (255, 248, 226)],
    "Obsidian":    [D, (60, 36, 96), (150, 80, 240), (214, 150, 255), (250, 236, 255)],
    "Nebula":      [D, (60, 14, 90), (200, 60, 200), (90, 220, 220), (240, 255, 250)],
    "Solar":       [D, (90, 30, 10), (230, 110, 30), (255, 200, 80), (255, 250, 220)],
    "Jade":        [D, (10, 50, 40), (30, 150, 100), (150, 230, 170), (250, 240, 190)],
    "Blood Moon":  [D, (70, 6, 14), (190, 24, 40), (255, 110, 80), (255, 236, 214)],
    "Glacier":     [D, (16, 40, 90), (60, 150, 230), (170, 236, 255), (250, 255, 255)],
    "Ultraviolet": [D, (40, 10, 110), (110, 50, 255), (170, 255, 80), (246, 255, 220)],
    "Rose Quartz": [D, (70, 30, 50), (220, 120, 160), (255, 196, 210), (255, 246, 236)],
}
GOD_COLOURWAYS = list(RAMPS)

# The Entities' six: three of their own and the three rarest of the general
# set. None is a God's, so every God's colour stays a one-of-one.
RAMPS.update({
    "Ichor":    [D, (20, 60, 20), (90, 200, 50), (190, 255, 110), (245, 255, 220)],
    "Sapphire": [D, (14, 26, 90), (40, 80, 220), (120, 170, 255), (255, 226, 140)],
    "Molten":   [D, (70, 20, 8), (200, 70, 14), (255, 150, 40), (255, 236, 170)],
    "Auric":    [D, (70, 46, 8), (180, 130, 30), (250, 210, 100), (255, 250, 220)],
    "Bloom":    [D, (70, 8, 56), (210, 50, 160), (255, 140, 220), (200, 255, 240)],
    "Eclipse":  [D, (40, 40, 52), (110, 110, 130), (220, 220, 236), (255, 70, 56)],
})
ENTITY_COLOURWAYS = ["Ichor", "Sapphire", "Molten", "Auric", "Bloom", "Eclipse"]

# The Mythics wear the five rarest of the general set; none is a God's or
# an Entity's own.
RAMPS.update({
    "Abyss":   [D, (10, 30, 90), (40, 110, 220), (130, 210, 255), (230, 250, 255)],
    "Ossuary": [D, (50, 48, 56), (140, 136, 150), (226, 222, 230), (255, 252, 240)],
    "Furnace": [D, (80, 16, 8), (210, 70, 24), (255, 160, 50), (255, 236, 180)],
})
# Ossuary was in this list; with Eclipse beside it, four Mythics in every
# ten came out silver-grey. Furnace puts fire in their place.
MYTHIC_COLOURWAYS = ["Abyss", "Furnace", "Auric", "Bloom", "Eclipse"]

PALETTE = {"Auric": "Aurum", "Abyss": "Deep", "Ossuary": "Bone", "Furnace": "Ember"}   # sky palette, where its name differs

GEOMETRY = ["Metatron", "Flower", "Yantra", "Mandala", "Rosette",
            "Gatefold", "Spiral", "Weird", "Lattice", "Rays"]
AURAS = ["Opposed", "Acid", "Cold", "Warm", "Rose"]
# the scene round each God: what each value is called, quiet to loud
EVENTS = {
    "Planets":    ["None", "One", "Two", "Ringed", "Cluster"],
    "UFOs":       ["None", "One", "Few", "Fleet"],
    "Supernova":  ["None", "One", "Two", "Barrage"],
    "Lightning":  ["None", "Strike", "Storm", "Tempest"],
    "Mushrooms":  ["None", "Few", "Cluster", "Grove"],
    "Trees":      ["None", "One", "Copse", "Forest"],
    "Moon Dust":  ["None", "Faint", "Drifting", "Heavy"],
}


def figure(name):
    """The figure's greys on the 600 grid, and a soft silhouette."""
    path, dark_at, close, keep_in = FIGURES[name]
    im = Image.open(f"{ROOT}/art/masters/{path}").convert("L")
    w, h = im.size
    m = int(min(w, h) * 0.02)                         # rounded corners and stray edges
    im = im.crop((m, m, w - m, h - m))
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, h - side, (w - side) // 2 + side, h))
    g = np.asarray(im.resize((GRID, GRID), Image.BOX)).astype(float) / 255
    # Some pictures arrive on dark grey rather than black. The border's own
    # level is taken as black, so the sky reads as sky and not as a slab.
    border = np.concatenate([g[:8].ravel(), g[:, :8].ravel(), g[:, -8:].ravel()])
    bg = float(np.median(border))
    g = np.clip((g - bg) / max(1e-6, 1 - bg), 0, 1)

    s = ndimage.gaussian_filter(ndimage.median_filter(g, 7), 3)
    dark = s < dark_at
    if keep_in:
        xx = np.mgrid[0:GRID, 0:GRID][1]
        dark |= np.abs(xx - GRID / 2) > keep_in
    lab, _ = ndimage.label(dark)
    edge = set(np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))) - {0}
    fig = ~np.isin(lab, list(edge))
    fig = ndimage.binary_opening(fig, iterations=4)
    l2, n2 = ndimage.label(fig)
    if n2:
        sz = ndimage.sum(fig, l2, range(1, n2 + 1))
        fig = np.isin(l2, 1 + np.where(sz > sz.max() * 0.08)[0])
    fig = ndimage.binary_fill_holes(ndimage.binary_closing(fig, iterations=close))
    soft = np.clip(ndimage.gaussian_filter(fig.astype(float), 2.5) * 1.3, 0, 1)

    # smaller, standing on the bottom edge, the sky round it black
    n = int(GRID * SCALE)
    x0 = (GRID - n) // 2
    gs = np.zeros((GRID, GRID)); ss = np.zeros((GRID, GRID))
    gs[GRID - n:, x0:x0 + n] = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BOX)) / 255
    ss[GRID - n:, x0:x0 + n] = np.asarray(Image.fromarray((soft * 255).astype(np.uint8)).resize((n, n), Image.BOX)) / 255
    # the sky the figure was drawn in fades out toward its own edges, so no
    # square shows where it stops
    yy, xx = np.mgrid[0:GRID, 0:GRID]
    fx = np.clip(np.minimum(xx - x0, x0 + n - xx) / (n * 0.12), 0, 1)
    fy = np.clip((yy - (GRID - n)) / (n * 0.12), 0, 1)
    gs = gs * np.maximum(fx * fy, ss)
    return gs, ss


def _ramp(stops, v):
    stops = np.array(stops, float)
    idx = np.clip(v, 0, 1) * (len(stops) - 1)
    lo = np.floor(idx).astype(int)
    hi = np.minimum(lo + 1, len(stops) - 1)
    f = (idx - lo)[..., None]
    return stops[lo] * (1 - f) + stops[hi] * f


def render_god(t, seed):
    g, soft = figure(t["Being"])
    cw = t["Colourway"]
    pal = _flora_palette(_aura_palette(dict(BY_NAME[PALETTE.get(cw, cw)]), t["Aura"]), "Golden")
    w = h = GRID

    bg = np.zeros((h, w, 4), np.uint8); bg[..., 3] = 255
    bg = over(bg, traits.stars(w, h, "Dense", pal, seed))
    bg = over(bg, traits.planets(w, h, t["Planets"], pal, seed))
    bg = over(bg, sigilry(w, h, t["Geometry"], pal, seed, "None"))
    bg = over(bg, traits.lightning(w, h, t["Lightning"], pal, seed))
    bg = over(bg, traits.ufos(w, h, t["UFOs"], pal, seed))
    bg = over(bg, traits.explosions(w, h, t["Supernova"], pal, seed))
    bg = over(bg, traits.moondust(w, h, t["Moon Dust"], pal, seed))
    if t["Mushrooms"] != "None" or t["Trees"] != "None":
        bg = over(bg, traits.ground(w, h, "Floor", pal, seed))
    bg = over(bg, traits.trees(w, h, t["Trees"], pal, seed))
    back = bg[..., :3].astype(float)

    col = _ramp(RAMPS[cw], g * TONE.get(t["Being"], 1.0))
    # outside the figure its own halo and stars are kept, as light over the scene
    lit = 255 - (255 - back) * (255 - col * 0.7) / 255
    out = col * soft[..., None] + lit * (1 - soft[..., None])

    img = np.dstack([np.clip(out, 0, 255), np.full((h, w), 255)]).astype(np.uint8)
    img = over(img, traits.mushrooms(w, h, t["Mushrooms"], pal, seed))
    pic = Image.fromarray(img[..., :3])
    pic = pic.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    return pic.resize((w * 4, h * 4), Image.NEAREST)


def deal(seed=1010):
    """Ten Gods: unique colourway and geometry each, and the two of a figure
    as unlike each other as the lists allow."""
    rng = np.random.default_rng(seed)
    beings = [b for b in GOD_FIGURES for _ in range(2)]
    cws = list(GOD_COLOURWAYS); rng.shuffle(cws)
    geos = list(GEOMETRY); rng.shuffle(geos)
    gods = []
    for i, b in enumerate(beings):
        t = {"Being": b, "Colourway": cws[i], "Geometry": geos[i],
             "Aura": AURAS[int(rng.integers(len(AURAS)))]}
        # three or four things happening round each God, never the same set
        # as its twin, and always at least one of them loud
        twin = gods[-1] if i % 2 else None
        for _ in range(200):
            k = int(rng.integers(3, 5))
            on = set(rng.choice(list(EVENTS), size=k, replace=False))
            if twin and len(on & {e for e in EVENTS if twin[e] != "None"}) > 1:
                continue
            break
        for e, vals in EVENTS.items():
            t[e] = vals[int(rng.integers(1, len(vals)))] if e in on else "None"
        gods.append(t)
    return gods


def deal_entities(seed=2020):
    """Twenty Entities, four of each figure. Within a figure no two share a
    colourway or a geometry; across all twenty no two share a colourway AND
    a geometry; two or three things happen round each, never the same set
    as another of its figure."""
    rng = np.random.default_rng(seed)
    out, used = [], set()
    for b in ENTITY_FIGURES:
        cws = list(ENTITY_COLOURWAYS); rng.shuffle(cws)
        geos = list(GEOMETRY); rng.shuffle(geos)
        mine = []
        for k in range(4):
            cw = cws[k]
            g = next(x for x in geos if (cw, x) not in used and x not in [m["Geometry"] for m in mine])
            used.add((cw, g))
            t = {"Being": b, "Colourway": cw, "Geometry": g,
                 "Aura": AURAS[int(rng.integers(len(AURAS)))]}
            seen = [frozenset(e for e in EVENTS if m[e] != "None") for m in mine]
            for _ in range(200):
                on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(2, 4)), replace=False))
                if on not in seen:
                    break
            for e, vals in EVENTS.items():
                # one step quieter than a God's: never the loudest value
                t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
            mine.append(t)
        out += mine
    return out


def deal_mythics(seed=3030):
    """Forty Mythics, ten of each figure. Within a figure every geometry
    once and every colourway twice, never the same pairing twice anywhere;
    one to three scene traits each, quieter again than an Entity."""
    rng = np.random.default_rng(seed)
    out, used = [], set()
    for b in MYTHIC_FIGURES:
        geos = list(GEOMETRY); rng.shuffle(geos)
        cws = MYTHIC_COLOURWAYS * 2; rng.shuffle(cws)
        mine = []
        for k in range(10):
            cw, g = cws[k], geos[k]
            used.add((b, cw, g))
            t = {"Being": b, "Colourway": cw, "Geometry": g,
                 "Aura": AURAS[int(rng.integers(len(AURAS)))]}
            seen = [frozenset(e for e in EVENTS if m[e] != "None") for m in mine]
            for _ in range(200):
                on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(1, 4)), replace=False))
                if on not in seen:
                    break
            for e, vals in EVENTS.items():
                t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
            mine.append(t)
        out += mine
    return out


def main():
    tier = sys.argv[1] if len(sys.argv) > 1 else "god"
    out = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/out/{tier}"
    os.makedirs(out, exist_ok=True)
    rows = {"god": deal, "entity": deal_entities, "mythic": deal_mythics}[tier]()
    per = {"god": 2, "entity": 4, "mythic": 10}[tier]
    pics = []
    for i, t in enumerate(rows, 1):
        p = render_god(t, seed={"god": 7000, "entity": 8000, "mythic": 9000}[tier] + i)
        p.save(f"{out}/{tier}-{i}.png", optimize=True)
        pics.append(p)
        print(i, t)
    json.dump(rows, open(f"{out}/{tier}s.json", "w"), indent=2)
    size = {"god": 480, "entity": 360, "mythic": 240}[tier]
    cols = len(rows) // per
    if tier == "mythic":            # one row per figure reads better than a tall column
        sheet = Image.new("RGB", (per * size, cols * size))
        for i, p in enumerate(pics):
            sheet.paste(p.resize((size, size), Image.BOX), ((i % per) * size, (i // per) * size))
    else:
        sheet = Image.new("RGB", (cols * size, per * size))
        for i, p in enumerate(pics):
            # each column one figure, its beings above each other
            sheet.paste(p.resize((size, size), Image.BOX), ((i // per) * size, (i % per) * size))
    sheet.save(f"{out}/sheet.png")


if __name__ == "__main__":
    main()
