"""Shared exporter for map layers: an ee.Image (one band per time step) -> public/data/<id>/{meta.json, values.binz}.

Format (read by src/lib/layer.ts):
- Grid in EPSG:3857 (so MapLibre image quads are exact), north-up, origin = upper-left corner [x0, y1] in metres,
  square pixels of `res` Mercator metres. `ground_res_m` = res * cos(centre latitude), the nominal size on the ground.
- values.binz = gzip of little-endian `dtype` values, band-sequential (time steps in order), row-major.
  Physical value = raw * scale + offset; raw == nodata means no data. (".binz", not ".gz": servers must not add
  Content-Encoding, and the loader checks the gzip magic bytes anyway.)
- meta.json also carries per-step statistics in physical units, for prose numbers and default colour ranges.

Used by the scripts in scripts/data/ (run them WITHOUT -I, from the repo root, so `import layerkit` works).
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
MAX_BYTES = 16 * 2**20  # per computePixels request: EE limit 48 MB, and it counts uint8 bands as 2 bytes or more
MAX_ROWS = 512  # also bounds reduceResolution input per request ("Reprojection output too large")
DTYPES = {"uint8": (np.uint8, 0, 255), "uint16": (np.uint16, 0, 65535), "int16": (np.int16, -32768, 32767)}


def init() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ee.Initialize(project=PROJECT)


def merc(lon: float, lat: float) -> tuple[float, float]:
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def grid(region: str, ground_res: float) -> dict:
    """Snapped EPSG:3857 grid of a region (delta bbox) or site / frame (square around center) at ~ground_res metres."""
    r = REGIONS[region]
    if r["kind"] in ("site", "frame"):
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


def _fetch(img: ee.Image, g: dict, names: list[str], np_dtype, max_rows: int = MAX_ROWS) -> np.ndarray:
    """Band-sequential array (bands, h, w), fetched in row chunks under the request size limit.

    max_rows: smaller for reduceResolution from 10 m sources (EE caps the reprojected input at roughly 50-80 M pixels)."""
    w, h, res = g["width"], g["height"], g["res"]
    x0, y1 = g["origin"]
    rows = max(1, min(h, max_rows, MAX_BYTES // (w * len(names) * np.dtype(np_dtype).itemsize)))
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
        if h > rows:
            print(f"  rows {r0 + n}/{h}", end=chr(13), flush=True)
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


def fetch_raw(img: ee.Image, region: str, ground_res: float, *, dtype: str, scale: float, offset: float = 0.0,
              nodata: int, clip: bool = True, max_rows: int = MAX_ROWS) -> tuple[np.ndarray, bool]:
    """Encoded raw values (bands, h, w) of img on the region/site grid; clip: deltas masked to the region outline."""
    n = img.bandNames().size().getInfo()
    names = [f"t{i}" for i in range(n)]
    outline = region_outline(region) if clip else None
    if outline is not None:  # deltas: nodata outside the region's provinces (sea, Cambodia, hills)
        img = img.clip(outline)
    enc = _encode(img.rename(names), dtype, scale, offset, nodata)
    return _fetch(enc, grid(region, ground_res), names, DTYPES[dtype][0], max_rows), outline is not None


def _chunk_worker(job: tuple) -> np.ndarray:
    expr, g, names, dtype, rows = job
    for attempt in range(3):  # a transient EE error should not lose a long export
        try:
            return _fetch(ee.deserializer.fromJSON(expr), g, names, DTYPES[dtype][0], rows)
        except ee.EEException:
            if attempt == 2:
                raise


def pfetch_raw(img: ee.Image, region: str, ground_res: float, *, dtype: str, scale: float, offset: float = 0.0,
               nodata: int, clip: bool = True, rows: int = 32, workers: int = 8) -> tuple[np.ndarray, bool]:
    """fetch_raw with the row chunks requested by `workers` processes at once (heavy per-pixel reductions such as
    multi-year Landsat stacks, where one request takes minutes). Call it under `if __name__ == "__main__":`."""
    from concurrent.futures import ProcessPoolExecutor
    n = img.bandNames().size().getInfo()
    names = [f"t{i}" for i in range(n)]
    outline = region_outline(region) if clip else None
    if outline is not None:
        img = img.clip(outline)
    expr = _encode(img.rename(names), dtype, scale, offset, nodata).serialize()
    g = grid(region, ground_res)
    jobs = [(expr, {**g, "origin": [g["origin"][0], g["origin"][1] - r0 * g["res"]], "height": min(rows, g["height"] - r0)},
             names, dtype, rows) for r0 in range(0, g["height"], rows)]
    parts = []
    with ProcessPoolExecutor(workers, initializer=init) as ex:
        for i, part in enumerate(ex.map(_chunk_worker, jobs)):
            parts.append(part)
            print(f"  chunk {i + 1}/{len(jobs)}", end=chr(13), flush=True)
    print()
    return np.concatenate(parts, axis=1), outline is not None


def to_values(raw: np.ndarray, scale: float, offset: float, nodata: int) -> np.ndarray:
    """Raw codes -> float32 physical values, NaN where nodata."""
    v = raw.astype(np.float32) * np.float32(scale) + np.float32(offset)
    v[raw == nodata] = np.nan
    return v


def to_raw(values: np.ndarray, dtype: str, scale: float, offset: float, nodata: int) -> np.ndarray:
    """Float values (NaN = no data) -> raw codes, clamped to the dtype range minus the nodata code."""
    np_t, lo, hi = DTYPES[dtype]
    lo, hi = (lo + 1 if nodata == lo else lo), (hi - 1 if nodata == hi else hi)
    nan = np.isnan(values)
    raw = np.clip(np.round((np.where(nan, offset, values) - offset) / scale), lo, hi).astype(np_t)
    raw[nan] = nodata
    return raw


def write_layer(layer_id: str, raw: np.ndarray, region: str, ground_res: float, *, times: list[str], dtype: str,
                scale: float, offset: float = 0.0, nodata: int, title: dict, units: dict | None,
                kind: str = "continuous", palette: str | None = None, range_: list[float] | None = None,
                classes: list[dict] | None = None, provenance: dict, clipped: bool) -> dict:
    """Write raw (len(times), h, w) codes on the region/site grid to public/data/<layer_id>/."""
    g = grid(region, ground_res)
    if raw.shape != (len(times), g["height"], g["width"]) or raw.dtype != DTYPES[dtype][0]:
        raise ValueError(f"{layer_id}: raw {raw.shape} {raw.dtype} does not match the grid / times / dtype")
    out = DATA / layer_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "values.binz").write_bytes(gzip.compress(raw.astype(raw.dtype.newbyteorder("<")).tobytes(), 9, mtime=0))
    meta = {
        "id": layer_id, "region": region, "title": title, "units": units, "kind": kind,
        "palette": palette, "range": range_, "classes": classes,
        "crs": "EPSG:3857", "origin": [round(v, 3) for v in g["origin"]], "res": round(g["res"], 6),
        "ground_res_m": ground_res, "width": g["width"], "height": g["height"],
        "dtype": dtype, "scale": scale, "offset": offset, "nodata": nodata, "times": times,
        "clipped_to": "region outline (geoBoundaries ADM1 provinces)" if clipped else None,
        "stats": _stats(raw, scale, offset, nodata),
        "provenance": {**provenance, "exported": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                       "script": f"scripts/data/{Path(sys.argv[0]).name}"},
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8", newline="\n")
    kb = (out / "values.binz").stat().st_size // 1024
    print(f"{layer_id}: {g['width']}x{g['height']}x{len(times)} {dtype}, {kb} KB")
    return meta


def export_layer(layer_id: str, img: ee.Image, region: str, ground_res: float, *, times: list[str],
                 dtype: str, scale: float, offset: float = 0.0, nodata: int, clip: bool = True,
                 max_rows: int = MAX_ROWS, **kw) -> dict:
    """Export img (len(times) bands) for a region/site and write public/data/<layer_id>/ (kw: see write_layer)."""
    raw, clipped = fetch_raw(img, region, ground_res, dtype=dtype, scale=scale, offset=offset, nodata=nodata, clip=clip,
                              max_rows=max_rows)
    if raw.shape[0] != len(times):
        raise ValueError(f"{layer_id}: band count != len(times)")
    return write_layer(layer_id, raw, region, ground_res, times=times, dtype=dtype, scale=scale, offset=offset,
                       nodata=nodata, clipped=clipped, **kw)


if __name__ == "__main__":
    # self-check of the grid maths (no EE needed)
    x, y = merc(0, 0)
    assert abs(x) < 1e-9 and abs(y) < 1e-9
    g = grid("angiang", 10)
    assert g["width"] == g["height"] == 1024
    assert abs(g["res"] * math.cos(math.radians(10.45)) - 10) < 1e-9
    gm = grid("mekong", 250)
    assert 1000 < gm["width"] < 1200 and 1000 < gm["height"] < 1200, gm
    v = np.array([[[np.nan, -0.25, 0.1, 2.0]]], np.float32)
    raw = to_raw(v, "uint8", 0.005, -0.25, 255)
    assert raw.tolist() == [[[255, 0, 70, 254]]], raw
    back = to_values(raw, 0.005, -0.25, 255)
    assert np.isnan(back[0, 0, 0]) and abs(back[0, 0, 2] - 0.1) < 1e-6
    print("layerkit grid OK", gm["width"], gm["height"], grid("red", 250)["width"], grid("red", 250)["height"])
