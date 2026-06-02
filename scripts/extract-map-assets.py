#!/usr/bin/env python3
"""
extract-map-assets.py — turn a ripped sprite sheet into individual assets.

The source sheet (`static/maps/3870.png`) is a Pokémon-style tileset/sprite
rip drawn on a solid magenta background (#9933CC). This script:

  1. Removes the background by flood-filling from the image borders, so only
     purple connected to the outer background is cleared — purple *inside* a
     sprite is preserved. Anti-aliased fringe pixels (purple blended with sprite
     colours) are caught by a colour-distance tolerance.
  2. Finds every remaining connected blob of opaque pixels (8-connectivity) —
     each blob is one sprite/tile/piece.
  3. Crops each blob to its tight bounding box and writes it as its own PNG to
     `static/maps/pieces/`.
  4. Writes a manifest to `src/data/map-assets.json` (consumed by the Map Assets
     page) describing every piece: file URL, position in the sheet, and size.

Requires Pillow (`pip install Pillow`).

Usage:
  python scripts/extract-map-assets.py
  python scripts/extract-map-assets.py --dry   # report pieces, write nothing
"""

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "static/maps/3870.png"
PIECES_DIR = ROOT / "static/maps/pieces"
MANIFEST = ROOT / "src/data/map-assets.json"
# Public URL prefix (static/ is served at the web root).
PUBLIC_PREFIX = "/maps/pieces"

BG = (153, 51, 204)        # magenta background, sampled from the sheet corners
BG_TOLERANCE = 64          # colour distance treated as "background" while filling
MIN_AREA = 12              # blobs smaller than this many pixels are dropped as noise
DRY = "--dry" in sys.argv


def color_dist2(a, b):
    """Squared Euclidean distance between two RGB tuples."""
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def remove_background(im):
    """Return a copy with border-connected background pixels made transparent."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    tol2 = BG_TOLERANCE ** 2

    # BFS flood fill from every border pixel that looks like background.
    visited = bytearray(w * h)
    q = deque()

    def consider(x, y):
        if 0 <= x < w and 0 <= y < h and not visited[y * w + x]:
            visited[y * w + x] = 1
            if color_dist2(px[x, y][:3], BG) <= tol2:
                q.append((x, y))
                return True
        return False

    for x in range(w):
        consider(x, 0)
        consider(x, h - 1)
    for y in range(h):
        consider(0, y)
        consider(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)  # clear the background pixel
        consider(x - 1, y)
        consider(x + 1, y)
        consider(x, y - 1)
        consider(x, y + 1)

    return im


def find_components(im):
    """Yield bounding boxes (minx, miny, maxx, maxy) of opaque blobs, 8-connected."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    boxes = []

    for sy in range(h):
        for sx in range(w):
            idx = sy * w + sx
            if seen[idx] or px[sx, sy][3] == 0:
                continue
            # BFS this blob.
            q = deque([(sx, sy)])
            seen[idx] = 1
            minx = maxx = sx
            miny = maxy = sy
            area = 0
            while q:
                x, y = q.popleft()
                area += 1
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            nidx = ny * w + nx
                            if not seen[nidx] and px[nx, ny][3] != 0:
                                seen[nidx] = 1
                                q.append((nx, ny))
            if area >= MIN_AREA:
                boxes.append((minx, miny, maxx, maxy, area))

    # Reading order: top-to-bottom, then left-to-right (banded by ~16px rows).
    boxes.sort(key=lambda b: (round(b[1] / 16), b[0]))
    return boxes


def main():
    if not SRC.exists():
        sys.exit(f"source sheet not found: {SRC}")

    sheet = Image.open(SRC)
    print(f"source: {SRC.name}  {sheet.size[0]}x{sheet.size[1]}")

    cleaned = remove_background(sheet)
    boxes = find_components(cleaned)
    print(f"found {len(boxes)} pieces (min area {MIN_AREA}px)")

    if not DRY:
        # Wipe any previous run so removed pieces don't linger.
        PIECES_DIR.mkdir(parents=True, exist_ok=True)
        for old in PIECES_DIR.glob("piece-*.png"):
            old.unlink()

    manifest = []
    pad = len(str(len(boxes)))
    for i, (minx, miny, maxx, maxy, area) in enumerate(boxes):
        name = f"piece-{str(i + 1).zfill(pad)}.png"
        crop = cleaned.crop((minx, miny, maxx + 1, maxy + 1))
        if not DRY:
            crop.save(PIECES_DIR / name)
        manifest.append(
            {
                "id": i + 1,
                "file": f"{PUBLIC_PREFIX}/{name}",
                "x": minx,
                "y": miny,
                "width": maxx - minx + 1,
                "height": maxy - miny + 1,
            }
        )

    if not DRY:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"wrote {len(manifest)} pieces -> {PIECES_DIR.relative_to(ROOT)}")
        print(f"wrote manifest -> {MANIFEST.relative_to(ROOT)}")
    else:
        for entry in manifest:
            print(f"  {entry['file']}  {entry['width']}x{entry['height']} @ ({entry['x']},{entry['y']})")
        print("[dry] nothing written")


if __name__ == "__main__":
    main()
