"""The map's sprite sheet: every being at CELL px in one image, plus a small
JSON of what each one is (tier, being and traits), so the map can draw all
1,111 without loading 1,111 full-size pictures.

    python3 tools/atlas.py [path-to-realm-collection]

Rerun whenever the collection's images change. The map versions both files
with the provenance hash, so browsers pick up the new ones."""
import json, sys, math
from pathlib import Path
from PIL import Image

COL = Path(sys.argv[1] if len(sys.argv) > 1 else "../realm-collection")
OUT = Path(__file__).resolve().parent.parent
CELL = 48

drop = {t["id"]: t for t in json.load(open(COL / "drop.json"))}
n = len(drop)
cols = math.ceil(math.sqrt(n))
rows = math.ceil(n / cols)
sheet = Image.new("RGB", (cols * CELL, rows * CELL))
data = []
for i in range(1, n + 1):
    t = drop[i]
    im = Image.open(COL / "images" / f"{i}.png").convert("RGB").resize((CELL, CELL), Image.LANCZOS)
    sheet.paste(im, (((i - 1) % cols) * CELL, ((i - 1) // cols) * CELL))
    traits = {k: v for k, v in t.items() if k not in ("id", "png", "Being", "Tier")}
    data.append([t["Tier"], t["Being"], traits])
sheet.save(OUT / "map-atlas.webp", quality=88, method=6)
json.dump({"cell": CELL, "cols": cols, "beings": data}, open(OUT / "map-data.json", "w"), separators=(",", ":"))
print("map-atlas.webp", sheet.size, (OUT / "map-atlas.webp").stat().st_size // 1024, "KB;",
      "map-data.json", (OUT / "map-data.json").stat().st_size // 1024, "KB")
