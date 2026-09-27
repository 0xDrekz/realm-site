"""
REALM — the colourways, and how rare each one is.

The weight is how often it comes up. Rare colours are rare because of this
number and nothing else, so a colour can be made rarer without touching a
picture.
"""

def _p(name, weight, sigil, glow, star, being, eyec, iris_c, **kw):
    dark = tuple(int(c*0.35) for c in sigil)
    d = dict(
        name=name, weight=weight,
        sigil=sigil, sigil_glow=tuple(int(c*0.22) for c in sigil), sigil_dark=dark,
        star=star, star_dim=tuple(int(c*0.42) for c in star),
        planet_lit=tuple(int(c*0.80) for c in sigil),
        planet_dark=tuple(int(c*0.22) for c in sigil),
        planet_band=tuple(int(c*0.55) for c in sigil),
        planet_rim=star,
        ufo=tuple(int(c*0.55) for c in star), ufo_dome=sigil,
        ufo_dark=tuple(int(c*0.22) for c in star), ufo_light=eyec,
        smoke=tuple(int(c*0.70) for c in star),
        dust=tuple(int(c*0.55) for c in star), dust_bright=star,
        ink=(8, 5, 12),
        being_top=tuple(min(255, int(c*1.25)) for c in being), being_bottom=being,
        shadow=tuple(int(c*0.22) for c in being), mid=being,
        light=tuple(min(255, int(c*1.45)) for c in being),
        eye=eyec, iris=iris_c, pupil=(10, 6, 14), glint=(255, 255, 255),
    )
    d.update(kw)
    return d


PALETTES = [
    _p("Void",      26, (150,110,255), None, (226,214,255), (126, 84,210), (255,206, 90), (255,140, 60)),
    _p("Ember",     22, (255,130, 70), None, (255,214,180), (214, 86, 48), (120,255,230), ( 90,220,255)),
    _p("Deep",      20, ( 90,140,255), None, (206,226,255), ( 70, 92,220), (255,214,120), (255,160, 60)),
    _p("Verdigris", 14, ( 60,230,190), None, (206,255,240), ( 46,178,150), (255,140,190), (255, 90,150)),
    _p("Bone",       9, (226,222,230), None, (255,255,255), (168,166,178), (230, 60, 60), (255,120, 90)),
    _p("Aurum",      6, (255,196, 90), None, (255,246,214), (227,186, 92), (255,255,255), (255,230,150)),
    _p("Bloom",      2, (255, 90,200), None, (255,210,245), (220, 70,180), ( 90,255,210), (140,255,240)),
    _p("Eclipse",    1, ( 80, 90,110), None, (255, 60, 60), ( 58, 62, 80), (255, 40, 40), (255,120, 40)),
]
for p in PALETTES:
    if p["star_dim"] is None or p["star"] is None:
        pass
BY_NAME = {p["name"]: p for p in PALETTES}
