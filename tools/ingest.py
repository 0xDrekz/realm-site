#!/usr/bin/env python3
"""
REALM — taking in a drawing.

One job per piece: find the size it was really drawn at, cut it to its rung,
key the black out, work out how it wants to be coloured, and write all of
that down.

    python3 tools/ingest.py <image> <name> <tier>

Masters are kept untouched. Nothing is ever upscaled.
"""
import json, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LADDER = json.load(open(f"{ROOT}/art/ladder.json"))


def carries_detail(src, rung):
    """Does this drawing actually carry detail at the rung it is being cut to?

    Not the same question as "what size was it drawn at". That one turned out
    not to be answerable from a JPEG: measuring it by round-trip error gave
    552 for every piece in the cast, including a chunky sprite, because the
    error falls all the way to full resolution and never bottoms out. Reading
    the block period off the edge energy gave a different wrong answer —
    93 for the finest piece we have.

    So ask the thing that actually matters. Cut the master to the rung. Cut it
    to half the rung and blow that back up. If the two are near enough the
    same, the art has nothing at this rung and the finer cut is wasted; if
    they differ, the rung is earning its place.

    Returns how much is there, 0 to 1 — the difference between the two,
    scaled against the picture's own contrast.
    """
    im = Image.open(src).convert("L")
    W, H = im.size
    m = max(1, round(H * rung / W))
    fine = np.asarray(im.resize((rung, m), Image.BOX)).astype(float)
    half = np.asarray(im.resize((max(1, rung//2), max(1, m//2)), Image.BOX)
                        .resize((rung, m), Image.NEAREST)).astype(float)
    spread = fine.std()
    if spread < 1e-6:
        return 0.0
    return float(np.abs(fine - half).mean() / spread)


def detect_mode(src, thresh=0.30):
    """Stencil or shaded, decided by how much of the ink is mid-grey.

    White line art on black sits around 15%. A being modelled in tone sits
    around 50%. Anything past 30% is drawn in tone and must be filled solid,
    or its dark parts turn see-through and the sky pours through them.
    """
    g = np.asarray(Image.open(src).convert("L")).astype(int)
    ink = g[g > 24]
    if ink.size == 0:
        return "stencil", 0.0
    mid = float(((ink > 64) & (ink < 200)).sum() / ink.size)
    return ("shade" if mid > thresh else "stencil"), mid


def cut(src, n, out):
    """Box-average down to the rung, then key black to transparent."""
    im = Image.open(src).convert("RGB")
    k = n / max(im.size)
    im = im.resize((max(1, round(im.width*k)), max(1, round(im.height*k))), Image.BOX)
    a = np.asarray(im).astype(np.float64)          # float: 255*255 overflows int16
    alpha = a.max(axis=2)
    rgb = np.clip(a * 255.0 / np.clip(alpha, 1, None)[:,:,None], 0, 255).astype(np.uint8)
    q = Image.fromarray(np.dstack([rgb, np.clip(alpha,0,255).astype(np.uint8)]), "RGBA")
    sq = Image.new("RGBA", (n, n), (0,0,0,0))
    sq.paste(q, ((n-q.width)//2, (n-q.height)//2))
    sq.save(out)

    # it has to composite back over black as what went in, or the keying is wrong
    chk = Image.alpha_composite(Image.new("RGBA", q.size, (0,0,0,255)), q).convert("RGB")
    err = float(np.abs(np.asarray(chk).astype(float) - np.asarray(im).astype(float)).max())
    return err


def check_eyes(png, name, extra=None):
    """Count them, and draw what was found so it can be looked at.

    A number on its own is not evidence. The God reported two eyes and was
    pointing at its elbows.
    """
    from compose import eyes
    im = Image.open(png).convert("RGBA")
    a = np.asarray(im)
    m = eyes(a[:,:,3], extra=extra)
    _, n = ndimage.label(m)

    flat = Image.alpha_composite(Image.new("RGBA", im.size, (0,0,0,255)), im).convert("RGB")
    ov = np.asarray(flat).copy()
    ov[m] = [255, 0, 120]
    os.makedirs(f"{ROOT}/art/checks", exist_ok=True)
    Image.fromarray(ov).resize((320, 320), Image.NEAREST).save(f"{ROOT}/art/checks/{name}-eyes.png")
    return n


def ingest(src, name, tier):
    if tier not in LADDER:
        raise SystemExit(f"unknown tier {tier!r} — one of {', '.join(LADDER)}")
    rung = LADDER[tier]
    detail = carries_detail(src, rung)
    mode, mid = detect_mode(src)

    Image.open(src).convert("RGB").save(f"{ROOT}/art/masters/{name}.png")
    out = f"{ROOT}/art/beings/{name}.png"
    err = cut(src, rung, out)
    mf_path = f"{ROOT}/art/beings.json"
    prev_book = json.load(open(mf_path)) if os.path.exists(mf_path) else {}
    n_eyes = check_eyes(out, name, prev_book.get(name, {}).get("extra_eyes"))

    mf = f"{ROOT}/art/beings.json"
    book = json.load(open(mf)) if os.path.exists(mf) else {}
    prev = book.get(name, {})
    book[name] = {"tier": tier, "rung": rung, "detail": round(detail, 3),
                  "mode": mode, "mid_grey": round(mid, 3),
                  "eyes": n_eyes, "key_error": round(err, 2),
                  # set by hand for a being whose eye is drawn rather than
                  # left open; the finder cannot see those
                  "eye_mode": prev.get("eye_mode", "holes"),
                  # eyes that are painted rather than open, named by hand
                  "extra_eyes": prev.get("extra_eyes", [])}
    json.dump(dict(sorted(book.items())), open(mf, "w"), indent=2)

    flags = []
    if detail < 0.06:       flags.append(f"almost nothing at this rung (detail {detail:.3f}) — "
                                        f"it would look the same cut to {rung//2}")
    # Two is no longer the only right answer. Several beings have a third eye
    # and one has six, and the finder was quietly truncating them to two.
    if book[name]["eye_mode"] == "holes" and not (1 <= n_eyes <= 8):
        flags.append(f"found {n_eyes} eye holes — look at art/checks/{name}-eyes.png")
    if err > 2:             flags.append(f"keying is off by {err}")
    print(f"{name:16s} {tier:10s} rung {rung:3d}  detail {detail:.3f}  {mode:8s} "
          f"({mid*100:.0f}% mid)  eyes {n_eyes}")
    for f in flags:
        print(f"  ⚠  {f}")
    return book[name]


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    ingest(*sys.argv[1:])
