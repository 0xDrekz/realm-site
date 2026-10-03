#!/usr/bin/env python3
"""
REALM — geometric beings, drawn by code.

    python3 tools/sigilforms.py [count] [out-dir]

Beings in the style of the hand-made geometric figures (the Eye Architect,
the Cube Sentinel): mirrored down the middle, built of straight lines,
diamonds, chevrons and an eye, with shards floating round them.

Each one is assembled from parts — head, eye, crown, body, arms or wings,
base, floaters — every part with its own variants and proportions, all
chosen from one seed, so the same seed always draws the same being and
there are tens of thousands of distinct ones.

Drawn at 160 pixels and blown up three times, so every line is a clean
three-pixel pixel-art stroke, and saved the way the collection reads line
art: lines at full strength, the solid body faint behind them, so the
'facet' colouring in render.py fills every closed shape as a lit facet.
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw

N = 160            # drawing grid
C = N // 2         # the mirror line
LINE, BODY = 255, 70

PREFIX = ["Hex", "Prism", "Lattice", "Axiom", "Vertex", "Cipher", "Glyph",
          "Obelisk", "Monolith", "Tesseract", "Facet", "Quartz", "Echo",
          "Null", "Zenith", "Aether", "Rune", "Spire", "Fractal", "Halo"]
NOUN = ["Sentinel", "Warden", "Architect", "Seer", "Herald", "Watcher",
        "Oracle", "Keeper", "Templar", "Sovereign", "Envoy", "Monk",
        "Regent", "Pilgrim", "Arbiter", "Choir", "Engine", "Idol"]


class Pen:
    """Draws everything twice, once on each side of the mirror line."""

    def __init__(self):
        self.im = Image.new("L", (N, N), 0)
        self.d = ImageDraw.Draw(self.im)
        self.fills = []           # filled first, faint
        self.lines = []           # drawn last, full

    def poly(self, pts, fill=True, mirror=True):
        for p in ([pts, [(2 * C - 1 - x, y) for x, y in pts]] if mirror else [pts]):
            if fill:
                self.fills.append(("poly", p))
            self.lines.append(("poly", p))

    def line(self, pts, mirror=True):
        for p in ([pts, [(2 * C - 1 - x, y) for x, y in pts]] if mirror else [pts]):
            self.lines.append(("line", p))

    def ellipse(self, box, fill=True):
        if fill:
            self.fills.append(("ell", box))
        self.lines.append(("ell", box))

    def done(self):
        for kind, p in self.fills:
            if kind == "poly":
                self.d.polygon(p, fill=BODY)
            else:
                self.d.ellipse(p, fill=BODY)
        for kind, p in self.lines:
            if kind == "poly":
                self.d.polygon(p, outline=LINE)
            elif kind == "line":
                self.d.line(p, fill=LINE)
            else:
                self.d.ellipse(p, outline=LINE)
        return self.im


def r(rng, a, b):
    return int(rng.integers(a, b + 1))


# ---------------------------------------------------------------- parts

def head(pen, rng, cy, s):
    kind = rng.choice(["diamond", "hexagon", "circle", "lancet", "triangle", "mask"])
    if kind == "diamond":
        pen.poly([(C, cy - s), (C - s, cy), (C, cy + s), (C - 1, cy + s)], mirror=True)
        pen.poly([(C, cy - s), (C + s - 1, cy), (C, cy + s), (C - s, cy)], mirror=False)
    elif kind == "hexagon":
        h = int(s * 0.87)
        pen.poly([(C - s // 2, cy - h), (C + s // 2, cy - h), (C + s, cy),
                  (C + s // 2, cy + h), (C - s // 2, cy + h), (C - s, cy)], mirror=False)
        pen.line([(C - s // 2, cy - h), (C, cy), (C - s // 2, cy + h)])
    elif kind == "circle":
        pen.ellipse((C - s, cy - s, C + s - 1, cy + s))
        pen.ellipse((C - s + 3, cy - s + 3, C + s - 4, cy + s - 3), fill=False)
    elif kind == "lancet":
        pen.poly([(C, cy - int(s * 1.5)), (C - s, cy - s // 3), (C - int(s * 0.7), cy + s),
                  (C, cy + int(s * 1.2)), (C + int(s * 0.7) - 1, cy + s),
                  (C + s - 1, cy - s // 3)], mirror=False)
    elif kind == "triangle":
        pen.poly([(C, cy - int(s * 1.3)), (C - int(s * 1.2), cy + s), (C + int(s * 1.2) - 1, cy + s)],
                 mirror=False)
        pen.line([(C - int(s * 0.6), cy - s // 6), (C, cy + s)])
    else:   # mask: a face plate with brow and cheek planes
        pen.poly([(C, cy - s), (C - s, cy - s // 2), (C - int(s * 0.8), cy + s // 2),
                  (C, cy + int(s * 1.3)), (C + int(s * 0.8) - 1, cy + s // 2),
                  (C + s - 1, cy - s // 2)], mirror=False)
        pen.line([(C - s, cy - s // 2), (C, cy - s // 6)])
        pen.line([(C - int(s * 0.8), cy + s // 2), (C, cy + s // 3)])
    return kind


def eye(pen, rng, cy, s):
    kind = rng.choice(["almond", "almond", "ring", "slit", "triple", "star"])
    w = max(4, int(s * 0.62)); h = max(2, int(s * 0.3))
    if kind == "almond":
        pen.poly([(C - w, cy), (C - w // 2, cy - h), (C, cy - h - 1), (C + w // 2 - 1, cy - h),
                  (C + w - 1, cy), (C + w // 2 - 1, cy + h), (C, cy + h + 1), (C - w // 2, cy + h)],
                 mirror=False)
        pen.ellipse((C - h + 1, cy - h + 1, C + h - 2, cy + h - 1))
    elif kind == "ring":
        pen.ellipse((C - w + 2, cy - w + 2, C + w - 3, cy + w - 2))
        pen.ellipse((C - 2, cy - 2, C + 1, cy + 2))
    elif kind == "slit":
        pen.poly([(C, cy - h * 2), (C - 2, cy), (C, cy + h * 2), (C + 1, cy)], mirror=False)
    elif kind == "triple":
        for dx, dy in ((0, -h - 3), (-w // 2 - 1, h), (w // 2, h)):
            pen.ellipse((C + dx - 2, cy + dy - 2, C + dx + 1, cy + dy + 1))
    else:
        for a in range(8):
            t = a * np.pi / 4
            L = w if a % 2 == 0 else w // 2
            pen.line([(C, cy), (C + int(np.cos(t) * L), cy + int(np.sin(t) * L))], mirror=False)
    return kind


def crown(pen, rng, top, s):
    kind = rng.choice(["rays", "spikes", "halo", "chevrons", "antlers", "orbs", "none"])
    if kind == "rays":
        n = r(rng, 3, 5)
        for i in range(n):
            t = -np.pi / 2 - (i + 1) * (np.pi / 2.4) / (n + 1)
            L = r(rng, s, int(s * 1.8))
            pen.line([(C + int(np.cos(t) * s * 0.6), top + int(np.sin(t) * s * 0.4)),
                      (C + int(np.cos(t) * L), top + int(np.sin(t) * L))])
        pen.line([(C, top - 2), (C, top - int(s * 1.9))], mirror=False)
    elif kind == "spikes":
        n = r(rng, 2, 3)
        for i in range(n):
            x = C - (i + 1) * max(3, s // 2)
            h = int(s * (1.3 - i * 0.3))
            pen.poly([(x - 2, top + 1), (x, top - h), (x + 2, top + 1)])
        pen.poly([(C - 2, top + 1), (C, top - int(s * 1.6)), (C + 1, top + 1)], mirror=False)
    elif kind == "halo":
        R = int(s * 1.6)
        pen.ellipse((C - R, top - R // 2 - R, C + R - 1, top - R // 2 + R), fill=False)
    elif kind == "chevrons":
        for i in range(r(rng, 2, 4)):
            y = top - 3 - i * 4
            pen.line([(C - s + i * 2, y + 3), (C, y - 2)])
    elif kind == "antlers":
        base = (C - s // 2, top + 2)
        tip = (C - s - r(rng, 4, 10), top - r(rng, s, int(s * 1.7)))
        pen.line([base, tip])
        for k in range(r(rng, 2, 3)):
            f = (k + 1) / 4
            px = int(base[0] + (tip[0] - base[0]) * f); py = int(base[1] + (tip[1] - base[1]) * f)
            pen.line([(px, py), (px + r(rng, -6, 2), py - r(rng, 4, 8))])
    elif kind == "orbs":
        for i in range(r(rng, 2, 3)):
            x = C - (i + 1) * (s // 2 + 2); y = top - r(rng, 3, int(s * 1.2))
            pen.ellipse((x - 2, y - 2, x + 1, y + 1))
            pen.ellipse((2 * C - 1 - x - 2, y - 2, 2 * C - 1 - x + 1, y + 1))
    return kind


def body(pen, rng, top, bottom, ws, wb):
    kind = rng.choice(["robe", "column", "pyramid", "hex", "armour"])
    if kind == "robe":
        pen.poly([(C, top), (C - ws, top + 4), (C - wb, bottom), (C, bottom)])
        for i in range(r(rng, 2, 4)):
            y = top + 8 + i * (bottom - top - 10) // 4
            pen.line([(C - int(ws * 0.8), y), (C, y + (bottom - top) // 6)])
        pen.line([(C, top), (C, bottom)], mirror=False)
    elif kind == "column":
        y = top; s = max(5, ws // 2 + 1)
        while y + 2 * s <= bottom + 2:
            pen.poly([(C, y), (C - s, y + s), (C, y + 2 * s), (C + s - 1, y + s)], mirror=False)
            pen.line([(C - s, y + s), (C + s - 1, y + s)], mirror=False)
            y += 2 * s - 1
            s = max(4, s - r(rng, 0, 1))
        pen.poly([(C - 2, top), (C - ws, top + 6), (C - ws + 3, top + 10), (C - 3, top + 6)])
    elif kind == "pyramid":
        pen.poly([(C, top), (C - wb, bottom), (C, bottom)])
        for i in range(1, r(rng, 3, 4)):
            y = top + i * (bottom - top) // 4
            x = C - int(wb * i / 4)
            pen.line([(x, y), (C, y + (bottom - top) // 8)])
        pen.line([(C, top), (C, bottom)], mirror=False)
    elif kind == "hex":
        h = (bottom - top) // 2
        pen.poly([(C, top), (C - ws, top + h // 2), (C - ws, top + h + h // 2 - 4),
                  (C, top + 2 * h - 4), (C, top)])
        pen.line([(C - ws, top + h // 2), (C, top + h), (C, top + 2 * h - 4)])
        pen.line([(C - ws // 2, top + 2 * h - 8), (C - ws // 2 - 3, bottom)])
    else:   # armour: stacked plates
        n = r(rng, 3, 5); step = (bottom - top) // n
        for i in range(n):
            y = top + i * step
            w = int(ws + (wb - ws) * i / max(1, n - 1))
            pen.poly([(C, y), (C - w, y + 3), (C - w + 2, y + step), (C, y + step - 2)])
    return kind


def arms(pen, rng, y, ws, s):
    kind = rng.choice(["stairs", "wings", "blades", "staff", "rings", "none"])
    if kind == "stairs":
        x, yy = C - ws, y
        for i in range(r(rng, 3, 5)):
            pen.poly([(x, yy), (x - 6, yy), (x - 6, yy + 5), (x, yy + 5)])
            pen.line([(x - 6, yy), (x - 3, yy - 2), (x + 3, yy - 2), (x, yy)])
            x -= 6; yy += r(rng, -6, 6)
            yy = int(np.clip(yy, 20, N - 30))
    elif kind == "wings":
        span = r(rng, 26, 44); h = r(rng, 16, 30); up = r(rng, -18, 6)
        p = [(C - ws, y), (C - ws - span, y + up - h // 2), (C - ws - span + 6, y + up + h // 3),
             (C - ws - span // 2, y + h // 2), (C - ws, y + h)]
        pen.poly(p)
        for k in range(1, 3):
            f = k / 3
            pen.line([(C - ws, y + int(h * f * 0.6)), (int(p[1][0] + (p[3][0] - p[1][0]) * f), int(p[1][1] + (p[3][1] - p[1][1]) * f))])
    elif kind == "blades":
        L = r(rng, 30, 50)
        pen.poly([(C - ws, y), (C - ws - 6, y + 3), (C - ws - 14, y + L), (C - ws - 2, y + 8)])
    elif kind == "staff":
        x = C - ws - 8
        pen.line([(x, y - 30), (x, y + 60)])
        pen.poly([(x, y - 38), (x - 4, y - 32), (x, y - 26), (x + 4, y - 32)])
        pen.line([(C - ws, y + 6), (x, y + 4)])
    elif kind == "rings":
        R = r(rng, 7, 11); x = C - ws - R - 2
        pen.ellipse((x - R, y - R, x + R, y + R), fill=False)
        pen.ellipse((x - 2, y - 2, x + 2, y + 2))
        pen.ellipse((2 * C - 1 - x - R, y - R, 2 * C - 1 - x + R, y + R), fill=False)
        pen.ellipse((2 * C - 1 - x - 2, y - 2, 2 * C - 1 - x + 2, y + 2))
    return kind


def base(pen, rng, y, wb):
    kind = rng.choice(["diamond", "chevron", "plinth", "none"])
    if kind == "diamond":
        s = r(rng, 5, 8)
        pen.poly([(C, y), (C - s, y + s), (C, y + 2 * s), (C + s - 1, y + s)], mirror=False)
    elif kind == "chevron":
        for i in range(2):
            pen.line([(C - 8 + i * 2, y + i * 4), (C, y + 5 + i * 4)])
    elif kind == "plinth":
        pen.poly([(C, y), (C - wb - 2, y), (C - wb + 2, y + 5), (C, y + 5)])
    return kind


def floaters(pen, rng, n):
    for _ in range(n):
        x = r(rng, 10, 34); y = r(rng, 30, 130); s = r(rng, 3, 6)
        if rng.random() < 0.6:
            pen.poly([(x, y - s * 2), (x - s, y), (x, y + s * 2), (x + s, y)])
        else:
            pen.poly([(x - s, y - s), (x + s, y - s), (x + s, y + s), (x - s, y + s)])


def make(seed):
    rng = np.random.default_rng(seed)
    pen = Pen()
    s = r(rng, 12, 19)                    # head size
    hy = r(rng, 40, 54)                   # head centre
    ws = r(rng, 14, 26); wb = r(rng, ws + 6, 52)
    btop = hy + s + r(rng, 1, 4)
    bbot = r(rng, 128, 142)
    parts = {}
    parts["arms"] = arms(pen, rng, btop + r(rng, 2, 10), ws, s)
    parts["body"] = body(pen, rng, btop, bbot, ws, wb)
    parts["head"] = head(pen, rng, hy, s)
    parts["eye"] = eye(pen, rng, hy, s)
    parts["crown"] = crown(pen, rng, hy - s, s)
    parts["base"] = base(pen, rng, bbot + 1, wb)
    floaters(pen, rng, r(rng, 2, 6))
    im = pen.done()

    # on a 480 canvas, standing on the bottom, a little room above
    a = np.asarray(im)
    ys, xs = np.where(a > 0)
    a = a[ys.min():ys.max() + 1, :]
    out = np.zeros((N, N), np.uint8)
    h = a.shape[0]
    out[N - h - 2:N - 2, :] = a
    big = Image.fromarray(out).resize((N * 3, N * 3), Image.NEAREST)
    rgba = np.zeros((N * 3, N * 3, 4), np.uint8)
    rgba[..., 3] = np.asarray(big)
    nr = np.random.default_rng(seed + 99991)
    name = f"{PREFIX[int(nr.integers(len(PREFIX)))]} {NOUN[int(nr.integers(len(NOUN)))]}"
    return Image.fromarray(rgba), name, parts


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 16
    out = sys.argv[2] if len(sys.argv) > 2 else "out/sigilforms"
    os.makedirs(out, exist_ok=True)
    meta = []
    for seed in range(1, count + 1):
        im, name, parts = make(seed)
        im.save(f"{out}/{seed}.png")
        meta.append({"seed": seed, "name": name, **parts})
    json.dump(meta, open(f"{out}/forms.json", "w"), indent=1)
