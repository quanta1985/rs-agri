"""Home-page hero images: Sentinel-2 dry-season median composites of the two deltas.

Agriculture composite SWIR1/NIR/Red (B11/B8/B4): crops green, water dark blue, bare soil/urban pink-purple.
Cloud Score+ masked (cs_cdf >= 0.6). Output: public/img/hero-{mekong,red}.webp (Web Mercator, ~1024 px).

    python -I scripts/data/export_hero.py
"""
import io
import json
import sys
import urllib.request
from pathlib import Path

import ee
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "img"
PROJECT = "claudev1-503808"
CS_MIN = 0.6
VIS = {"bands": ["B11", "B8", "B4"], "min": 0.02, "max": 0.42, "gamma": 1.1}

# name: (bbox lon/lat, date range). Dates are the clearest season of each delta.
FRAMES = {
    "mekong": ([104.4, 8.5, 106.9, 11.2], "2024-01-01", "2024-04-01"),
    "red": ([105.5, 19.9, 107.0, 21.3], "2023-10-01", "2024-01-01"),
}


def composite(bbox: list[float], start: str, end: str) -> tuple[ee.Image, ee.Number]:
    region = ee.Geometry.Rectangle(bbox)
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(region).filterDate(start, end)
          .linkCollection(cs, ["cs_cdf"]))
    clear = s2.map(lambda im: im.updateMask(im.select("cs_cdf").gte(CS_MIN)).divide(10000))
    return clear.select(VIS["bands"]).median().clip(region), s2.size()


def main() -> None:
    ee.Initialize(project=PROJECT)
    meta = {}
    for name, (bbox, start, end) in FRAMES.items():
        img, n = composite(bbox, start, end)
        url = img.visualize(**VIS).getThumbURL(
            {"region": ee.Geometry.Rectangle(bbox), "dimensions": 1024, "crs": "EPSG:3857", "format": "png"})
        png = urllib.request.urlopen(url, timeout=600).read()
        im = Image.open(io.BytesIO(png)).convert("RGB")
        out = OUT / f"hero-{name}.webp"
        out.parent.mkdir(parents=True, exist_ok=True)
        im.save(out, "WEBP", quality=82, method=6)
        meta[name] = {"bbox": bbox, "start": start, "end": end, "scenes": n.getInfo(), "size": im.size,
                      "bands": VIS["bands"], "cs_cdf_min": CS_MIN}
        print(name, im.size, meta[name]["scenes"], "scenes", out.stat().st_size // 1024, "KB")
    (OUT / "hero.json").write_text(json.dumps(meta, indent=1), "utf-8", newline="\n")


if __name__ == "__main__":
    main()
