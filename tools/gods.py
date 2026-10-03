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
# Ten figures for the ten Gods, one each: every God is a one-of-one figure
# as well as a one-of-one colourway. (The first five, two each, are kept
# as masters but no longer dealt.)
_GOD = ["Sun Wraith", "Jelly Sovereign", "Throne Watcher", "Crystal Kraken", "Nebula Tree",
        "Veiled Sage", "Shell Seer", "Seraph of the Spiral", "Moon Serpent", "Root Crown"]
GOD_FIGURES = {n: (f"god2-{n.lower().replace(' ', '-')}.jpg", 0.07, 10, None) for n in _GOD}

# Twenty figures for the twenty Entities, one each. (The first five, four
# each, are kept as masters but no longer dealt.)
_ENT = ["Tide Priest", "Veil Medusa", "Horned Oracle", "Spore Sovereign", "Feather Herald",
        "Throne Mystic", "Mist Dragon", "Cloud Isle", "Lotus Flame", "Many-Armed Elder",
        "Elder Tree", "Diamond Sigil", "Void Spiral", "Bone Knight", "Winged Haloed",
        "Smoke Phantom", "Black Sun", "Crystal Mandala", "Coil Warden", "Thorn Spire"]
ENTITY_FIGURES = {n: (f"entities2/{n.lower().replace(' ', '-')}.png", 0.07, 8, None) for n in _ENT}
# Forty figures for the forty Mythics, one each. (The first four, ten
# each, are kept as masters but no longer dealt.)
MYTHIC_FIGURES = {f"Mythic {i:02d}": (f"mythics2/mythic-{i:02d}.png", 0.07, 8, None)
                  for i in range(1, 41)}
_LEG = ["Crystal Warden", "Jester of Tides", "Jelly Cap", "Pyramid Seer",
        "Veiled Oracle", "Vine Queen", "Scale Drake", "Tendril Eye", "Heart Flare",
        "Crystal Spire", "Root Child", "Eye Sigil", "Coil Spirit",
        "Laughing Jester", "Eye Citadel", "Lotus Sprite", "World Tree", "Smoke Serpent"]
LEGENDARY_FIGURES = {n: (f"legendary-{n.lower().replace(' ', '-')}.jpg", 0.06, 8, None)
                     for n in _LEG}
# The Commons are mushrooms: fifty-two of them, cut from four sheets.
COMMON_FIGURES = {f"Mushroom {i:02d}": (f"commons/mushroom-{i:02d}.png", 0.06, 6, None)
                  for i in range(1, 53)}
# The Uncommons are the folk: elves, gnomes and goblins, sixty-two of them.
UNCOMMON_FIGURES = {f"Folk {i:02d}": (f"uncommons/folk-{i:02d}.png", 0.06, 6, None)
                    for i in range(1, 63)}
# The Epics are the deep: jellyfish, octopi, eye-stars, moths, seventy-one.
EPIC_FIGURES = {f"Deep {i:02d}": (f"epics/epic-{i:02d}.png", 0.06, 6, None)
                for i in range(1, 72)}
# The Rares are the shallows: ninety-two creatures of the same sea.
RARE_FIGURES = {f"Shoal {i:02d}": (f"rares/rare-{i:02d}.png", 0.06, 6, None)
                for i in range(1, 93)}
FIGURES = {**GOD_FIGURES, **ENTITY_FIGURES, **MYTHIC_FIGURES, **LEGENDARY_FIGURES,
           **COMMON_FIGURES, **UNCOMMON_FIGURES, **EPIC_FIGURES, **RARE_FIGURES}

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

RAMPS.update({
    "Regalia": [D, (40, 20, 90), (130, 80, 230), (255, 200, 90), (255, 246, 210)],
    "Verdant": [D, (10, 50, 36), (30, 170, 120), (130, 240, 190), (240, 255, 220)],
})
# Six for the seventy: four of the Mythics' (Eclipse kept for the higher
# tiers' silver) and two of the general set's warmest.
LEGENDARY_COLOURWAYS = ["Regalia", "Verdant", "Furnace", "Abyss", "Auric", "Bloom"]

# Eight for the four hundred: the general set's commonest five and three
# more, so a Common is never in a colour only the top tiers wear.
RAMPS.update({
    "Amethyst": [D, (40, 16, 70), (130, 60, 200), (200, 150, 255), (246, 230, 255)],
    "Moss":     [D, (24, 40, 10), (90, 140, 40), (180, 220, 100), (246, 255, 210)],
    "Coral":    [D, (70, 20, 24), (220, 90, 80), (255, 170, 140), (255, 240, 226)],
})
COMMON_COLOURWAYS = ["Regalia", "Verdant", "Furnace", "Abyss", "Ossuary",
                     "Amethyst", "Moss", "Coral"]

PALETTE = {"Auric": "Aurum", "Abyss": "Deep", "Ossuary": "Bone", "Furnace": "Ember",
           "Regalia": "Void", "Verdant": "Verdigris",
           "Amethyst": "Void", "Moss": "Verdigris", "Coral": "Ember"}   # sky palette, where its name differs

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
    if t["Geometry"] != "None":
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
    beings = list(GOD_FIGURES)
    cws = list(GOD_COLOURWAYS); rng.shuffle(cws)
    geos = list(GEOMETRY); rng.shuffle(geos)
    gods = []
    for i, b in enumerate(beings):
        t = {"Being": b, "Colourway": cws[i], "Geometry": geos[i],
             "Aura": AURAS[int(rng.integers(len(AURAS)))]}
        # three or four things happening round each God, never the same set
        # as another God's
        seen = [frozenset(e for e in EVENTS if g[e] != "None") for g in gods]
        for _ in range(200):
            on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(3, 5)), replace=False))
            if on not in seen:
                break
        for e, vals in EVENTS.items():
            t[e] = vals[int(rng.integers(1, len(vals)))] if e in on else "None"
        gods.append(t)
    return gods


def deal_entities(seed=2020):
    """Twenty Entities, one of each figure. The six Entity colourways are
    dealt round so each is worn three or four times; no two Entities share
    a colourway AND a geometry; two or three scene traits each, never the
    loudest value."""
    rng = np.random.default_rng(seed)
    names = list(ENTITY_FIGURES)
    cws = (ENTITY_COLOURWAYS * 4)[:len(names)]; rng.shuffle(cws)
    out, used = [], set()
    for b, cw in zip(names, cws):
        geos = list(GEOMETRY); rng.shuffle(geos)
        g = next(x for x in geos if (cw, x) not in used)
        used.add((cw, g))
        on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(2, 4)), replace=False))
        t = {"Being": b, "Colourway": cw, "Geometry": g,
             "Aura": AURAS[int(rng.integers(len(AURAS)))]}
        for e, vals in EVENTS.items():
            t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
        out.append(t)
    return out


def deal_mythics(seed=3030):
    """Forty Mythics, one of each figure. The five Mythic colourways are
    worn eight times each; no two Mythics share colourway and geometry;
    one to three scene traits, quieter than an Entity."""
    rng = np.random.default_rng(seed)
    names = list(MYTHIC_FIGURES)
    cws = MYTHIC_COLOURWAYS * 8; rng.shuffle(cws)
    out, used = [], set()
    for b, cw in zip(names, cws):
        geos = list(GEOMETRY); rng.shuffle(geos)
        g = next(x for x in geos if (cw, x) not in used)
        used.add((cw, g))
        on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(1, 4)), replace=False))
        t = {"Being": b, "Colourway": cw, "Geometry": g,
             "Aura": AURAS[int(rng.integers(len(AURAS)))]}
        for e, vals in EVENTS.items():
            t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
        out.append(t)
    return out


def deal_legendaries(seed=4040, total=70):
    """Seventy Legendaries across eighteen figures: four of most, three of
    the last two. Within a figure no colourway and no geometry repeats;
    nought to two scene traits each, the quietest of the hand-drawn tiers."""
    rng = np.random.default_rng(seed)
    names = list(LEGENDARY_FIGURES)
    base, extra = divmod(total, len(names))
    out = []
    for i, b in enumerate(names):
        n = base + (1 if i < extra else 0)
        cws = list(LEGENDARY_COLOURWAYS); rng.shuffle(cws)
        geos = list(GEOMETRY); rng.shuffle(geos)
        seen = []
        for k in range(n):
            t = {"Being": b, "Colourway": cws[k], "Geometry": geos[k],
                 "Aura": AURAS[int(rng.integers(len(AURAS)))]}
            for _ in range(200):
                on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(0, 3)), replace=False))
                if on not in seen:
                    break
            seen.append(on)
            for e, vals in EVENTS.items():
                t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
            out.append(t)
    return out


def deal_commons(seed=5050, total=400):
    """Four hundred mushrooms across fifty-two: seven or eight of each.
    Within a mushroom no colourway repeats; the geometry may be absent
    (a Common need not have one); nought to two scene traits, never loud,
    and mushrooms never grown round a mushroom."""
    rng = np.random.default_rng(seed)
    names = list(COMMON_FIGURES)
    base, extra = divmod(total, len(names))
    out, seen = [], set()
    for i, b in enumerate(names):
        n = base + (1 if i < extra else 0)
        cws = list(COMMON_COLOURWAYS); rng.shuffle(cws)
        for k in range(n):
            for _ in range(500):
                g = GEOMETRY[int(rng.integers(len(GEOMETRY)))] if rng.random() < 0.6 else "None"
                ev = [e for e in EVENTS if e != "Mushrooms"]
                on = frozenset(rng.choice(ev, size=int(rng.integers(0, 3)), replace=False))
                t = {"Being": b, "Colourway": cws[k], "Geometry": g,
                     "Aura": AURAS[int(rng.integers(len(AURAS)))]}
                for e, vals in EVENTS.items():
                    t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
                key = tuple(sorted(t.items()))
                if key not in seen:
                    seen.add(key); break
            out.append(t)
    return out


# A step up from the Commons: the general set's colours and two of the
# Legendaries', none of the three that are only the Commons'.
UNCOMMON_COLOURWAYS = ["Regalia", "Verdant", "Furnace", "Abyss", "Ossuary", "Auric", "Bloom"]


EPIC_COLOURWAYS = ["Regalia", "Verdant", "Furnace", "Abyss", "Auric", "Bloom", "Eclipse"]


def deal_epics(seed=7070, total=110):
    """A hundred and ten across seventy-one: one or two of each, the pair
    never sharing a colourway or a geometry; one to three scene traits."""
    rng = np.random.default_rng(seed)
    names = list(EPIC_FIGURES)
    base, extra = divmod(total, len(names))
    out = []
    for i, b in enumerate(names):
        n = base + (1 if i < extra else 0)
        cws = list(EPIC_COLOURWAYS); rng.shuffle(cws)
        geos = list(GEOMETRY); rng.shuffle(geos)
        for k in range(n):
            on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(1, 4)), replace=False))
            t = {"Being": b, "Colourway": cws[k], "Geometry": geos[k],
                 "Aura": AURAS[int(rng.integers(len(AURAS)))]}
            for e, vals in EVENTS.items():
                t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
            out.append(t)
    return out


# Between the folk and the Epics: no Eclipse, which stays a mark of the top.
RARE_COLOURWAYS = ["Regalia", "Verdant", "Furnace", "Abyss", "Ossuary", "Auric", "Bloom"]


def deal_rares(seed=8080, total=180):
    """A hundred and eighty across ninety-two: one or two each, a pair never
    sharing a colourway; geometry on most; nought to two scene traits."""
    rng = np.random.default_rng(seed)
    names = list(RARE_FIGURES)
    base, extra = divmod(total, len(names))
    out = []
    for i, b in enumerate(names):
        n = base + (1 if i < extra else 0)
        cws = list(RARE_COLOURWAYS); rng.shuffle(cws)
        geos = list(GEOMETRY); rng.shuffle(geos)
        for k in range(n):
            on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(0, 3)), replace=False))
            t = {"Being": b, "Colourway": cws[k],
                 "Geometry": geos[k] if rng.random() < 0.85 else "None",
                 "Aura": AURAS[int(rng.integers(len(AURAS)))]}
            for e, vals in EVENTS.items():
                t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
            out.append(t)
    return out


def deal_uncommons(seed=6060, total=280):
    """Two hundred and eighty of the folk across sixty-two: four or five
    each. No colourway repeats within one; geometry on most; nought to two
    scene traits; every combination unique."""
    rng = np.random.default_rng(seed)
    names = list(UNCOMMON_FIGURES)
    base, extra = divmod(total, len(names))
    out, seen = [], set()
    for i, b in enumerate(names):
        n = base + (1 if i < extra else 0)
        cws = list(UNCOMMON_COLOURWAYS); rng.shuffle(cws)
        for k in range(n):
            for _ in range(500):
                g = GEOMETRY[int(rng.integers(len(GEOMETRY)))] if rng.random() < 0.75 else "None"
                on = frozenset(rng.choice(list(EVENTS), size=int(rng.integers(0, 3)), replace=False))
                t = {"Being": b, "Colourway": cws[k], "Geometry": g,
                     "Aura": AURAS[int(rng.integers(len(AURAS)))]}
                for e, vals in EVENTS.items():
                    t[e] = vals[int(rng.integers(1, len(vals) - 1))] if e in on else "None"
                key = tuple(sorted(t.items()))
                if key not in seen:
                    seen.add(key); break
            out.append(t)
    return out


def main():
    tier = sys.argv[1] if len(sys.argv) > 1 else "god"
    out = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/out/{tier}"
    os.makedirs(out, exist_ok=True)
    rows = {"god": deal, "entity": deal_entities, "mythic": deal_mythics,
            "legendary": deal_legendaries, "common": deal_commons,
            "uncommon": deal_uncommons, "epic": deal_epics, "rare": deal_rares}[tier]()
    per = {"god": 1, "entity": 1, "mythic": 10, "legendary": 10, "common": 20, "uncommon": 20, "epic": 10, "rare": 15}[tier]
    pics = []
    for i, t in enumerate(rows, 1):
        p = render_god(t, seed={"god": 7000, "entity": 8000, "mythic": 9000, "legendary": 10000, "common": 20000, "uncommon": 30000, "epic": 40000, "rare": 50000}[tier] + i)
        p.save(f"{out}/{tier}-{i}.png", optimize=True)
        pics.append(p)
        print(i, t)
    json.dump(rows, open(f"{out}/{tier}s.json", "w"), indent=2)
    size = {"god": 480, "entity": 360, "mythic": 240, "legendary": 200, "common": 120, "uncommon": 120, "epic": 160, "rare": 140}[tier]
    cols = -(-len(rows) // per)
    if tier in ("mythic", "legendary", "common", "uncommon", "epic", "rare"):            # one row per figure reads better than a tall column
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
