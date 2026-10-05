"""The forest either side of the tree, for wide screens (tree-wide.jpg).

    python3 tools/widewood.py

The painting is tall, made for a phone. On a wide screen the tree is sized
to the height and these flanks stand either side of it, so the window is
filled with forest rather than dark.

An interpretation in three depths, as if you stood in the wood:

  far    the painting's own canopy, carried outward and thrown out of
         focus, so the tree is the one sharp thing in the frame
  light  the sun in the canopy, its shafts spilling across the flanks
  near   a few dark faceted boughs close to you, arching in from the
         window's edges and framing the tree

Everything darkens toward the edges and the floor so the eye still goes
to the doorway. The flanks are faded into the painting's outer edge, and
gate.js draws the real, swaying tree over the middle.
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLANK = 760
BLEND = 150
BAND = 170

tree = Image.open(os.path.join(ROOT, "tree.png")).convert("RGB")
TW, TH = tree.size
W = FLANK * 2 + TW
SUN = (FLANK + 0.492 * TW, 0.298 * TH)
rng = np.random.default_rng(1111)
t = np.asarray(tree).astype(float)

# ---------- far: the canopy carried outward, out of focus ----------
def carry(edge):
    """a band of the tree's edge, folded outward until it fills a flank"""
    b = edge
    tile = np.concatenate([b[:, ::-1], b, b[:, ::-1], b, b[:, ::-1], b], axis=1)
    return tile[:, :FLANK]

far = np.zeros((TH, W, 3))
far[:, :FLANK] = carry(t[:, :BAND])[:, ::-1]
far[:, FLANK + TW:] = carry(t[:, TW - BAND:][:, ::-1])
far[:, FLANK:FLANK + TW] = t
farimg = Image.fromarray(far.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))
a = np.asarray(farimg).astype(float) * 0.78

# ---------- light: shafts from the sun ----------
yy, xx = np.mgrid[0:TH, 0:W]
ang = np.arctan2(yy - SUN[1], xx - SUN[0])
dist = np.hypot((xx - SUN[0]) / W, (yy - SUN[1]) / TH)
shafts = np.zeros((TH, W))
for k in range(9):
    a0 = rng.uniform(-math.pi, math.pi)
    width = rng.uniform(.035, .08)
    shafts += np.exp(-((np.angle(np.exp(1j * (ang - a0)))) / width) ** 2) * rng.uniform(.4, 1)
glow = np.exp(-dist * 3.2)
lightmap = (glow * .55 + shafts * glow * .45)[..., None]
a = a + lightmap * np.array([255, 236, 170]) * .32

# ---------- near: dark faceted boughs framing the tree ----------
near = Image.new("RGBA", (W, TH), (0, 0, 0, 0))
d = ImageDraw.Draw(near)

def bough(pts, thick, shade):
    """a tapering bough along a curve, cut into flat facets: lit above, dark below"""
    for k in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[k], pts[k + 1]
        u0, u1 = k / (len(pts) - 1), (k + 1) / (len(pts) - 1)
        ta, tb = thick * (1 - u0 * .82), thick * (1 - u1 * .82)
        nx, ny = -(by - ay), (bx - ax); n = math.hypot(nx, ny) or 1; nx /= n; ny /= n
        if ny > 0: nx, ny = -nx, -ny
        mx, my = (ax + bx) / 2, (ay + by) / 2
        lit = max(0, 1 - math.hypot((mx - SUN[0]) / W, (my - SUN[1]) / TH) * 1.6)
        hi = tuple(int(c * shade * (1 + lit * .9)) for c in (44, 66, 50))
        lo = tuple(int(c * shade) for c in (16, 26, 19))
        d.polygon([(ax + nx * ta, ay + ny * ta), (bx + nx * tb, by + ny * tb), (bx, by), (ax, ay)], fill=hi + (255,))
        d.polygon([(ax, ay), (bx, by), (bx - nx * tb, by - ny * tb), (ax - nx * ta, ay - ny * ta)], fill=lo + (255,))
    # leaves at the tip: a spray of shards
    ex, ey = pts[-1]
    for _ in range(22):
        r = rng.uniform(10, 70); th = rng.uniform(0, 2 * math.pi)
        cx, cy = ex + math.cos(th) * r, ey + math.sin(th) * r * .7
        s = rng.uniform(8, 22)
        tri = [(cx + math.cos(th + q) * s, cy + math.sin(th + q) * s) for q in (0, 2.3, 4.1)]
        g = rng.uniform(.6, 1.25)
        d.polygon(tri, fill=(int(38 * g * shade), int(62 * g * shade), int(30 * g * shade), 255))

def curve(p0, p1, p2, n=14):
    return [((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0],
             (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]) for u in np.linspace(0, 1, n)]

# the canopy close overhead: dark shards hanging into the top corners,
# thinning as they reach toward the tree, and ferns of the same at the floor
def shards(cx, cy, rx, ry, count, size, shade):
    for _ in range(count):
        u = rng.random() ** .6
        th = rng.uniform(0, 2 * math.pi)
        x, y = cx + math.cos(th) * rx * u, cy + math.sin(th) * ry * u
        s_ = size * rng.uniform(.5, 1.3) * (1.2 - u * .5)
        rot = rng.uniform(0, 2 * math.pi)
        tri = [(x + math.cos(rot + q) * s_, y + math.sin(rot + q) * s_ * .8) for q in (0, 2.2, 4.2)]
        lit = max(0, 1 - math.hypot((x - SUN[0]) / W, (y - SUN[1]) / TH) * 1.7)
        g = rng.uniform(.65, 1.2) * (1 + lit * 1.2)
        d.polygon(tri, fill=(int(30 * g * shade), int(50 * g * shade), int(26 * g * shade), 255))

for side in (-1, 1):
    edge = 0 if side < 0 else W
    shards(edge, -40, FLANK * .95, TH * .42, 900, 30, .9)          # overhead
    shards(edge, TH + 30, FLANK * .8, TH * .3, 500, 26, .7)        # the floor

near = near.filter(ImageFilter.GaussianBlur(1.2))
n = np.asarray(near).astype(float)
alpha = n[..., 3:4] / 255
a = a * (1 - alpha * .92) + n[..., :3] * alpha * .92

# ---------- the painting itself in the middle, faded into the flanks ----------
ramp = np.ones(TW)
ramp[:BLEND] = np.linspace(0, 1, BLEND) ** 1.3
ramp[-BLEND:] = np.linspace(1, 0, BLEND) ** 1.3
a[:, FLANK:FLANK + TW] = a[:, FLANK:FLANK + TW] * (1 - ramp[None, :, None]) + t * ramp[None, :, None]

# ---------- darker toward the window's edges and the floor ----------
xs = np.arange(W)
dd = np.clip(np.where(xs < FLANK, (FLANK - xs) / FLANK, (xs - FLANK - TW) / FLANK), 0, 1)
shade = 1 - .6 * dd ** 1.4
floor = 1 - .45 * np.clip((np.arange(TH) / TH - .6) / .4, 0, 1)
mask = (dd > 0).astype(float)
a *= (shade[None, :, None]) * (floor[:, None, None] * mask[None, :, None] + (1 - mask[None, :, None]))

out = Image.fromarray(a.clip(0, 255).astype(np.uint8))
out.save(os.path.join(ROOT, "tree-wide.jpg"), quality=88)
print("tree-wide.jpg", out.size, os.path.getsize(os.path.join(ROOT, "tree-wide.jpg")) // 1024, "KB")
