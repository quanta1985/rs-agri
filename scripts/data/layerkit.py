"""Shared exporter for map layers: an ee.Image (one band per time step) -> public/data/<id>/{meta.json, values.binz}.

Format (read by src/lib/layer.ts):
- Grid in EPSG:3857 (so MapLibre image quads are exact), north-up, origin = upper-left corner [x0, y1] in metres,
  square pixels of `res` Mercator metres. `ground_res_m` = res * cos(centre latitude), the nominal size on the ground.
- values.binz = gzip of little-endian `dtype` values, band-sequential (time steps in order), row-major.
  Physical value = raw * scale + offset; raw == nodata means no data. (".binz", not ".gz": servers must not add
  Content-Encoding, and the loader checks the gzip magic bytes anyway.)
- meta.json also carries per-step statistics in physical units, for prose numbers and default colour ranges.

Used by the scripts in scripts/data/ (run with python -I from the repo root).
"""
import gzip
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import ee
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
REGIONS = json.loads((ROOT / "src" / "data" / "regions.json").read_text("utf-8"))["regions"]
PROJECT = "claudev1-503808"
R = 6378137.0
MAX_BYTES = 32 * 2**20  # per computePixels request (EE limit 48 MB)
MAX_ROWS = 512  # also bounds reduceResolution input per request ("Reprojection output too large")
DTYPES = {"uint8": (np.uint8, 0, 255), "uint16": (np.uint16, 0, 65535), "int16": (np.int16, -32768, 32767)}


def init() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ee.Initialize(project=PROJECT)


def merc(lon: float, lat: float) -> tuple[float, float]:
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def grid(region: str, ground_res: float) -> dict:
    """Snapped EPSG:3857 grid of a region (delta bbox) or site (square frame) at ~ground_res metres."""
    r = REGIONS[region]
    if r["kind"] == "site":
        lon, lat = r["center"]
        res = ground_res / math.cos(math.radians(lat))
        n = round(r["size_m"] / ground_res)
        mx, my = merc(lon, lat)
        x0 = math.floor((mx - n * res / 2) / res) * res
        y1 = math.ceil((my + n * res / 2) / res) * res
        return {"origin": [x0, y1], "res": res, "width": n, "height": n, "lat_c": lat}
    lon0, lat0, lon1, lat1 = r["bbox"]
    lat_c = (lat0 + lat1) / 2
    res = ground_res / math.cos(math.radians(lat_c))
    (mx0, my0), (mx1, my1) = merc(lon0, lat0), merc(lon1, lat1)
    x0, y1 = math.floor(mx0 / res) * res, math.ceil(my1 / res) * res
    return {"origin": [x0, y1], "res": res, "width": math.ceil((mx1 - x0) / res), "height": math.ceil((y1 - my0) / res),
            "lat_c": lat_c}


def region_geom(region: str) -> ee.Geometry:
    """Lon/lat rectangle covering the grid (for filterBounds / clipping)."""
    g = grid(region, 100)
    x0, y1 = g["origin"]
    x1, y0 = x0 + g["width"] * g["res"], y1 - g["height"] * g["res"]
    return ee.Geometry.Rectangle([x0, y0, x1, y1], "EPSG:3857", False).transform("EPSG:4326", 1)


def region_outline(region: str) -> ee.Geometry | None:
    """Outline of a delta's statistical region (public/data/boundaries/provinces.json), None for sites."""
    if REGIONS[region]["kind"] != "delta":
        return None
    fc = json.loads((DATA / "boundaries" / "provinces.json").read_text("utf-8"))
    geom = next(f["geometry"] for f in fc["features"] if f["properties"] == {"name": region, "region": region, "kind": "region"})
    return ee.Geometry(geom)


def _encode(img: ee.Image, dtype: str, scale: float, offset: float, nodata: int) -> ee.Image:
    _, lo, hi = DTYPES[dtype]
    lo, hi = (lo + 1 if nodata == lo else lo), (hi - 1 if nodata == hi else hi)
    raw = img.subtract(offset).divide(scale).round().clamp(lo, hi).unmask(nodata, False)
    return {"uint8": raw.toUint8, "uint16": raw.toUint16, "int16": raw.toInt16}[dtype]()


def _fetch(img: ee.Image, g: dict, names: list[str], np_dtype) -> np.ndarray:
    """Band-sequential array (bands, h, w), fetched in row chunks under the request size limit."""
    w, h, res = g["width"], g["height"], g["res"]
    x0, y1 = g["origin"]
    rows = max(1, min(h, MAX_ROWS, MAX_BYTES // (w * len(names) * np.dtype(np_dtype).itemsize)))
    out = np.empty((len(names), h, w), np_dtype)
    for r0 in range(0, h, rows):
        n = min(rows, h - r0)
        arr = ee.data.computePixels({
            "expression": img, "fileFormat": "NUMPY_NDARRAY",
            "grid": {"dimensions": {"width": w, "height": n}, "crsCode": "EPSG:3857",
                     "affineTransform": {"scaleX": res, "shearX": 0, "translateX": x0,
                                         "shearY": 0, "scaleY": -res, "translateY": y1 - r0 * res}}})
        for i, b in enumerate(names):
            out[i, r0:r0 + n] = arr[b]
    return out


def _stats(raw: np.ndarray, scale: float, offset: float, nodata: int) -> list[dict]:
    out = []
    for frame in raw:
        v = frame[frame != nodata].astype(np.float64) * scale + offset
        if v.size == 0:
            out.append({"valid": 0})
            continue
        p2, p50, p98 = np.percentile(v, [2, 50, 98])
        out.append({"valid": int(v.size), "mean": round(float(v.mean()), 4), "p2": round(float(p2), 4),
                    "p50": round(float(p50), 4), "p98": round(float(p98), 4),
                    "min": round(float(v.min()), 4), "max": round(float(v.max()), 4)})
    return out


def export_layer(layer_id: str, img: ee.Image, region: str, ground_res: float, *, times: list[str],
                 dtype: str, scale: float, offset: float = 0.0, nodata: int, title: dict, units: dict | None,
                 kind: str = "continuous", palette: str | None = None, range_: list[float] | None = None,
                 classes: list[dict] | None = None, provenance: dict, clip: bool = True) -> dict:
    """Export img (len(times) bands) for a region/site and write public/data/<layer_id>/.

    clip: for deltas, mask everything outside the region outline (provinces of the GSO statistical region)."""
    if img.bandNames().size().getInfo() != len(times):
        raise ValueError(f"{layer_id}: band count != len(times)")
    g = grid(region, ground_res)
    names = [f"t{i}" for i in range(len(times))]
    outline = region_outline(region) if clip else None
    if outline is not None:  # deltas: nodata outside the region's provinces (sea, Cambodia, hills)
        img = img.clip(outline)
    enc = _encode(img.rename(names), dtype, scale, offset, nodata)
    raw = _fetch(enc, g, names, DTYPES[dtype][0])
    out = DATA / layer_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "values.binz").write_bytes(gzip.compress(raw.astype(raw.dtype.newbyteorder("<")).tobytes(), 9, mtime=0))
    meta = {
        "id": layer_id, "region": region, "title": title, "units": units, "kind": kind,
        "palette": palette, "range": range_, "classes": classes,
        "crs": "EPSG:3857", "origin": [round(v, 3) for v in g["origin"]], "res": round(g["res"], 6),
        "ground_res_m": ground_res, "width": g["width"], "height": g["height"],
        "dtype": dtype, "scale": scale, "offset": offset, "nodata": nodata, "times": times,
        "clipped_to": "region outline (geoBoundaries ADM1 provinces)" if outline is not None else None,
        "stats": _stats(raw, scale, offset, nodata),
        "provenance": {**provenance, "exported": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                       "script": f"scripts/data/{Path(sys.argv[0]).name}"},
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8", newline="\n")
    kb = (out / "values.binz").stat().st_size // 1024
    print(f"{layer_id}: {g['width']}x{g['height']}x{len(times)} {dtype}, {kb} KB")
    return meta


if __name__ == "__main__":
    # self-check of the grid maths (no EE needed)
    x, y = merc(0, 0)
    assert abs(x) < 1e-9 and abs(y) < 1e-9
    g = grid("angiang", 10)
    assert g["width"] == g["height"] == 1024
    assert abs(g["res"] * math.cos(math.radians(10.45)) - 10) < 1e-9
    gm = grid("mekong", 250)
    assert 1000 < gm["width"] < 1200 and 1000 < gm["height"] < 1200, gm
    print("layerkit grid OK", gm["width"], gm["height"], grid("red", 250)["width"], grid("red", 250)["height"])
