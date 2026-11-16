"""Province lines of the two deltas from geoBoundaries VNM ADM1 (gbOpen, Public Domain, 2008 boundaries = 63 provinces).

Download the simplified GeoJSON into its own folder first, then pass its path:
    https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM1/geoBoundaries-VNM-ADM1_simplified.geojson
    python -I scripts/data/export_boundaries.py <path/to/adm1.geojson>

Writes public/data/boundaries/provinces.json (provinces of both statistical regions + one outline per region)
and prints each region's raster bbox for src/data/regions.json.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "boundaries" / "provinces.json"
DIGITS = 4  # ~11 m, finer than the simplified source

# GSO statistical regions (pre-2025 provinces).
REGIONS = {
    "red": ["Hà Nội", "Vĩnh Phúc", "Bắc Ninh", "Quảng Ninh", "Hải Dương", "Hải Phòng", "Hưng Yên",
            "Thái Bình", "Hà Nam", "Nam Định", "Ninh Bình"],
    "mekong": ["Long An", "Tiền Giang", "Bến Tre", "Trà Vinh", "Vĩnh Long", "Đồng Tháp", "An Giang",
               "Kiên Giang", "Cần Thơ", "Hậu Giang", "Sóc Trăng", "Bạc Liêu", "Cà Mau"],
}
# Raster extent of the Red River Delta leaves out Quang Ninh (mostly hills and sea, not delta farmland).
RASTER_EXCLUDE = {"Quảng Ninh"}


def rounded(geom: dict) -> dict:
    def r(c):
        return [round(c[0], DIGITS), round(c[1], DIGITS)] if isinstance(c[0], float) else [r(x) for x in c]
    return {"type": geom["type"], "coordinates": r(geom["coordinates"])}


def main(src: Path) -> None:
    feats = json.loads(src.read_text("utf-8"))["features"]
    by_name = {f["properties"]["shapeName"].strip(): shape(f["geometry"]) for f in feats}
    out = []
    for region, names in REGIONS.items():
        missing = [n for n in names if n not in by_name]
        if missing:
            raise SystemExit(f"missing provinces in source: {missing}")
        for n in names:
            out.append({"type": "Feature", "properties": {"name": n, "region": region, "kind": "province"},
                        "geometry": rounded(mapping(by_name[n]))})
        outline = unary_union([by_name[n] for n in names])
        out.append({"type": "Feature", "properties": {"name": region, "region": region, "kind": "region"},
                    "geometry": rounded(mapping(outline.simplify(0.002)))})
        farm = unary_union([by_name[n] for n in names if n not in RASTER_EXCLUDE])
        print(region, "raster bbox", [round(v, 2) for v in farm.bounds])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = {"type": "FeatureCollection", "features": out,
           "provenance": {"source": "geoBoundaries gbOpen VNM ADM1 (2008 boundaries), Public Domain",
                          "url": "https://www.geoboundaries.org/", "script": "scripts/data/export_boundaries.py",
                          "exported": datetime.now(timezone.utc).isoformat(timespec="seconds")}}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")
    print("wrote", OUT, OUT.stat().st_size // 1024, "KB,", len(out), "features")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
