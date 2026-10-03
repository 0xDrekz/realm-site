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
        sigil_alt=tuple(min(255, int(c)) for c in (sigil[2], sigil[0], sigil[1])),
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
        # explosions run white-hot in the middle out to the palette's own
        # colour at the edge, so a blast still belongs to its colourway
        # Fire is hot whatever the colourway is. Keying these off the
        # palette's accent made the Ember explosions come out cyan, which is
        # not a thing an explosion does. Only the outermost ring, the part
        # that is really lit smoke, takes the palette's colour.
        burst_core=(255, 255, 248),
        burst_hot=(255, 232, 150),
        burst_mid=(255, 132, 36),
        burst_far=tuple(min(255, int(c*0.55 + 60)) for c in sigil),
        ground=tuple(int(c*0.30) for c in sigil),
        ground_lit=tuple(int(c*0.62) for c in sigil),
        tree_bark=tuple(int(c*0.42 + 24) for c in sigil),
        tree_leaf=tuple(int(c*0.70) for c in sigil),
        tree_leaf_lit=tuple(min(255, int(c*1.15)) for c in sigil),
        shroom_cap=tuple(min(255, int(c*0.85)) for c in sigil),
        shroom_cap_light=tuple(min(255, int(c*1.25 + 30)) for c in sigil),
        shroom_spot=star,
        shroom_gill=tuple(int(c*0.40) for c in sigil),
        shroom_stem=tuple(min(255, int(c*0.60 + 70)) for c in star),
        shroom_stem_dark=tuple(int(c*0.34 + 30) for c in star),
        bolt=(255, 255, 248),
        bolt_glow=tuple(min(255, int(c*1.15)) for c in sigil),
    )
    d.update(kw)
    return d


PALETTES = [
    _p("Void",      26, (150,110,255), None, (226,214,255), (126, 84,210), (255,206, 90), (255,140, 60)),
    _p("Ember",     22, (255,130, 70), None, (255,214,180), (214, 86, 48), (120,255,230), ( 90,220,255)),
    _p("Deep",      20, ( 90,140,255), None, (206,226,255), ( 70, 92,220), (255,214,120), (255,160, 60)),
    _p("Verdigris", 14, ( 60,230,190), None, (206,255,240), ( 46,178,150), (255,140,190), (255, 90,150)),
    _p("Bone",       9, (226,222,230), None, (255,255,255), (168,166,178), (230, 60, 60), (255,120, 90)),
    # The eye was white, and Auric faces are near-white — the eyes were
    # painted on and could not be seen at all. An eye must never be the
    # colour of the face it sits in.
    _p("Aurum",      6, (255,196, 90), None, (255,246,214), (227,186, 92), ( 96, 30,160), (190,110,255)),
    _p("Bloom",      2, (255, 90,200), None, (255,210,245), (220, 70,180), ( 90,255,210), (140,255,240)),
    _p("Eclipse",    1, ( 80, 90,110), None, (255, 60, 60), ( 58, 62, 80), (255, 40, 40), (255,120, 40)),
]
# The skies for the exalted colourways in tools/weaves.py — the three worn
# only by Entities, and the ten worn by one God each. Weight is unused: those
# colourways are dealt, never rolled. The eye colour must stand off the face
# it is painted on (round.py checks), and the sigil is turned off the being's
# hue by the Aura anyway.
PALETTES += [
    _p("Ichor",       1, (120,255, 90), None, (220,255,200), ( 60,140, 50), (255, 60,130), (255,150, 90)),
    _p("Sapphire",    1, ( 70,120,255), None, (214,226,255), ( 40, 70,200), (255,196, 60), (255,140, 40)),
    _p("Molten",      1, (255,120, 30), None, (255,214,170), (120, 50, 20), ( 60,230,255), (140,255,240)),
    _p("Prism",       1, (180,120,255), None, (255,236,255), (130,190,255), (255,220, 80), (255,120,200)),
    _p("Celestial",   1, (150,190,255), None, (240,246,255), (180,200,250), (255,200, 80), (255,150, 50)),
    _p("Obsidian",    1, (170, 80,255), None, (230,200,255), ( 70, 60, 96), (200,120,255), (255,255,255)),
    _p("Nebula",      1, (120, 80,255), None, (220,200,255), (140, 80,230), ( 90,255,220), (200,255,250)),
    _p("Solar",       1, (255,170, 50), None, (255,240,200), (240,170, 60), ( 80, 40,200), (160,100,255)),
    _p("Jade",        1, ( 50,200,140), None, (210,255,230), ( 40,150,100), (255,200, 70), (255,140, 40)),
    _p("Blood Moon",  1, (220, 40, 50), None, (255,200,190), (120, 20, 30), (255,236,200), (255,180, 90)),
    _p("Glacier",     1, (110,190,255), None, (230,248,255), (130,190,240), ( 30, 60,160), ( 80,140,255)),
    _p("Ultraviolet", 1, (130, 70,255), None, (220,210,255), (110, 60,240), (190,255, 60), (120,255,120)),
    _p("Rose Quartz", 1, (255,150,190), None, (255,232,240), (230,150,180), ( 60,150,140), (100,200,190)),
]

for p in PALETTES:
    if p["star_dim"] is None or p["star"] is None:
        pass
BY_NAME = {p["name"]: p for p in PALETTES}
