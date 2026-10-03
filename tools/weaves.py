"""
REALM — colour schemes, part by part.

Each part is a LIST of colours, shadow first, light last. A list rather than
a pair, because two colours can only fade one hue into itself: a painted wing
runs green through red, and a pair cannot do that at all.

The drawn brightness picks a place along the list, and the drawing's own
detail is added back on top, so the art survives being coloured.
"""

WEAVES = {
 "Regalia": dict(weight=18, vivid=1.10,
   Crown=[(58,30,4),(150,98,14),(255,206,96),(255,246,196)],
   Hair =[(24,6,52),(78,26,150),(168,92,255),(226,180,255)],
   Face =[(64,40,6),(178,128,28),(255,222,130),(255,250,226)],
   Wings=dict(axis="y",
              a=[(30,6,44),(96,18,120),(190,60,230),(250,170,255)],
              b=[(40,4,10),(140,16,30),(240,60,50),(255,180,140)]),
   Arms =[(48,4,10),(150,20,26),(255,80,62),(255,190,150)],
   Body =[(20,10,46),(72,44,140),(150,120,230),(226,214,255)],
   Base =[(14,6,38),(52,28,112),(118,84,204),(196,176,255)]),

 "Verdant": dict(weight=16, vivid=1.14,
   Crown=[(54,44,4),(148,124,16),(255,232,110),(255,252,210)],
   Hair =[(4,30,22),(12,96,68),(58,196,140),(184,255,224)],
   Face =[(52,46,12),(150,140,44),(255,244,170),(255,255,238)],
   Wings=dict(axis="y",
              a=[(2,34,26),(8,118,70),(90,220,60),(220,255,150)],
              b=[(36,10,2),(126,44,6),(232,120,20),(255,214,120)]),
   Arms =[(44,6,34),(140,20,96),(244,96,170),(255,200,230)],
   Body =[(4,34,26),(14,110,80),(74,210,158),(200,255,236)],
   Base =[(2,24,20),(10,84,62),(54,168,126),(160,244,214)]),

 "Furnace": dict(weight=15, vivid=1.16,
   Crown=[(56,30,2),(156,98,8),(255,208,72),(255,248,194)],
   Hair =[(34,4,4),(116,16,10),(214,60,28),(255,160,110)],
   Face =[(56,26,8),(166,96,40),(255,206,148),(255,248,228)],
   Wings=dict(axis="y",
              a=[(48,26,2),(150,84,6),(255,186,40),(255,244,180)],
              b=[(30,4,4),(118,10,6),(226,44,20),(255,140,110)]),
   Arms =[(52,20,2),(166,78,6),(255,158,36),(255,236,160)],
   Body =[(30,6,4),(122,26,12),(222,80,34),(255,176,120)],
   Base =[(20,4,4),(88,18,8),(172,54,22),(240,130,78)]),

 "Abyss": dict(weight=13, vivid=1.12,
   Crown=[(6,30,54),(18,96,150),(96,204,255),(220,248,255)],
   Hair =[(4,6,40),(10,26,110),(48,86,210),(170,200,255)],
   Face =[(10,30,58),(40,110,166),(150,214,255),(238,250,255)],
   Wings=dict(axis="y",
              a=[(2,14,46),(8,56,140),(40,170,236),(160,246,255)],
              b=[(28,2,50),(92,10,140),(180,60,240),(238,190,255)]),
   Arms =[(30,4,54),(96,16,150),(190,80,255),(240,200,255)],
   Body =[(4,12,46),(12,48,132),(56,124,228),(176,214,255)],
   Base =[(2,8,36),(8,34,100),(38,90,186),(140,180,246)]),

 "Ossuary": dict(weight=10, vivid=1.04,
   Crown=[(48,44,38),(140,132,116),(238,232,214),(255,255,250)],
   Hair =[(10,10,14),(44,42,52),(118,114,130),(206,202,216)],
   Face =[(52,48,44),(150,144,136),(244,240,232),(255,255,255)],
   Wings=[(14,14,18),(58,56,68),(150,146,162),(230,228,240)],
   Arms =[(42,4,6),(132,14,14),(232,58,48),(255,170,150)],
   Body =[(20,20,26),(76,74,88),(178,174,190),(242,240,248)],
   Base =[(12,12,16),(48,46,56),(126,122,138),(210,206,220)]),

 "Auric": dict(weight=7, vivid=1.18,
   Crown=[(60,42,4),(164,124,14),(255,226,120),(255,252,228)],
   Hair =[(38,22,2),(120,80,8),(214,158,42),(255,226,140)],
   Face =[(62,48,8),(170,136,32),(255,232,140),(255,254,236)],
   Wings=[(44,28,2),(140,94,10),(238,180,54),(255,240,168)],
   Arms =[(58,38,2),(162,110,8),(255,198,70),(255,246,190)],
   Body =[(36,24,2),(112,78,8),(206,152,40),(252,222,130)],
   Base =[(26,16,2),(84,56,6),(160,114,28),(232,188,96)]),

 "Bloom": dict(weight=3, vivid=1.22,
   Crown=[(56,40,6),(152,120,20),(255,226,120),(255,250,220)],
   Hair =[(38,2,30),(124,8,94),(236,58,176),(255,176,236)],
   Face =[(52,20,42),(154,70,124),(255,190,226),(255,246,252)],
   Wings=[(2,34,30),(8,116,96),(60,232,190),(198,255,244)],
   Arms =[(40,4,56),(122,14,162),(214,80,255),(248,200,255)],
   Body =[(44,4,36),(140,16,108),(248,88,196),(255,196,238)],
   Base =[(28,2,26),(96,10,80),(190,52,156),(246,158,220)]),

 "Eclipse": dict(weight=1, vivid=1.26,
   Crown=[(40,2,2),(132,8,8),(255,66,52),(255,190,150)],
   Hair =[(4,4,8),(18,18,26),(62,62,78),(140,140,160)],
   Face =[(20,20,28),(72,72,88),(176,176,196),(246,246,252)],
   Wings=[(4,4,8),(22,22,30),(78,78,96),(170,170,190)],
   Arms =[(38,2,2),(124,6,6),(238,44,32),(255,170,140)],
   Body =[(8,8,12),(34,34,44),(102,102,122),(196,196,214)],
   Base =[(4,4,8),(20,20,28),(64,64,80),(148,148,168)]),
}


# ---------------------------------------------------------------- the exalted
#
# Colourways that exist only at the very top, kept OUT of WEAVES so that no
# lower tier's pool (which takes the rarest N of WEAVES) can ever reach them.
#
# Why they exist: a being is mostly its figure, and the figure is its drawing,
# its colourway and its eyes. The Entity tier has one drawing and drew from
# three colourways, so its twenty pieces could only ever look like three
# beings — eight of them came out as the same red-eyed figure. The God's eyes
# are painted into the drawing, so ten Gods were three looks.
#
# Each part is given by its middle colour and the ramp is built round it,
# shadow to light, the same four stops the hand-written schemes above use.

def _stops(mid):
    m = [float(c) for c in mid]
    return [tuple(int(c * 0.20) for c in m), tuple(int(c * 0.58) for c in m),
            tuple(int(c) for c in m), tuple(int(c + (255 - c) * 0.66) for c in m)]


def _weave(vivid, crown, hair, face, wings, arms, body, base):
    def part(p):
        if isinstance(p, dict):
            return dict(axis=p.get("axis", "y"), a=_stops(p["a"]), b=_stops(p["b"]))
        return _stops(p)
    return dict(weight=1, vivid=vivid, Crown=part(crown), Hair=part(hair),
                Face=part(face), Wings=part(wings), Arms=part(arms),
                Body=part(body), Base=part(base))


# Three for the Entities alone, worn alongside the three rarest of WEAVES.
ENTITY_WEAVES = {
 "Ichor":    _weave(1.20, crown=(170,255,60),  hair=(18,44,20),  face=(204,255,176),
                    wings=(34,74,34),  arms=(150,255,70),  body=(44,92,40),  base=(24,58,26)),
 "Sapphire": _weave(1.18, crown=(255,206,90),  hair=(22,44,150), face=(204,222,255),
                    wings=dict(a=(40,90,220), b=(20,40,140)), arms=(255,200,96),
                    body=(34,66,190), base=(22,42,136)),
 "Molten":   _weave(1.24, crown=(255,186,46),  hair=(60,20,10),   face=(255,212,156),
                    wings=dict(a=(80,30,16), b=(230,80,14)), arms=(255,116,24),
                    body=(124,44,18), base=(160,54,14)),
}

# Ten for the ten Gods: each is worn by exactly one being in the collection.
GOD_WEAVES = {
 "Prism":       _weave(1.26, crown=(255,214,90),  hair=(255,150,60),  face=(236,230,255),
                       wings=dict(a=(60,220,255), b=(255,80,200)), arms=(255,230,90),
                       body=(60,214,196), base=(230,70,190)),
 "Celestial":   _weave(1.06, crown=(255,226,140), hair=(255,232,176), face=(246,246,255),
                       wings=dict(a=(244,244,255), b=(214,200,160)), arms=(255,214,120),
                       body=(232,232,246), base=(206,194,160)),
 "Obsidian":    _weave(1.20, crown=(196,96,255),  hair=(170,80,255),  face=(84,76,108),
                       wings=(52,44,74), arms=(204,84,255), body=(56,48,78), base=(34,28,50)),
 "Nebula":      _weave(1.24, crown=(255,190,240), hair=(60,210,200),  face=(240,200,255),
                       wings=dict(a=(80,230,220), b=(220,70,220)), arms=(90,220,210),
                       body=(220,70,200), base=(120,50,220)),
 "Solar":       _weave(1.22, crown=(255,250,200), hair=(255,150,40),  face=(255,236,180),
                       wings=dict(a=(255,210,80), b=(255,90,30)), arms=(255,120,40),
                       body=(255,190,70), base=(230,110,30)),
 "Jade":        _weave(1.18, crown=(255,210,90),  hair=(22,124,84),   face=(192,240,212),
                       wings=(40,180,120), arms=(255,200,80), body=(40,160,110), base=(24,110,80)),
 "Blood Moon":  _weave(1.22, crown=(255,90,60),   hair=(44,10,14),    face=(240,226,210),
                       wings=(150,16,30), arms=(222,30,40), body=(124,16,28), base=(82,10,20)),
 "Glacier":     _weave(1.14, crown=(226,252,255), hair=(90,190,240),  face=(228,250,255),
                       wings=dict(a=(190,244,255), b=(90,190,240)), arms=(170,236,255),
                       body=(150,230,255), base=(80,180,235)),
 "Ultraviolet": _weave(1.26, crown=(190,255,60),  hair=(150,255,60),  face=(212,182,255),
                       wings=dict(a=(130,60,255), b=(60,90,255)), arms=(180,255,70),
                       body=(110,50,255), base=(56,36,190)),
 "Rose Quartz": _weave(1.14, crown=(255,214,120), hair=(255,150,190), face=(255,228,236),
                       wings=dict(a=(255,190,210), b=(255,160,120)), arms=(255,130,170),
                       body=(250,170,200), base=(210,120,160)),
}

# every colourway there is, for looking one up by name
ALL_WEAVES = {**WEAVES, **ENTITY_WEAVES, **GOD_WEAVES}
