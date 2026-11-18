"""Chapter 14 (risk): hazard indicators on the cropland of each delta, built from layers already exported for ch.7-13.

No Earth Engine: reads public/data/<id>/ and writes
  risk-<region>  : one step per hazard indicator, score 0-100 on cells with >= 50 % WorldCover cropland (nodata elsewhere)
  prov-<region>  : province index of each ~250 m cell (classes = provinces.json names), for per-province tables

Indicators (score 0-100, scaling stated in the chapter):
  flood   Mekong: largest monthly water share Jul-Dec 2018 (S1, flood-s1-2018-mekong)
          Red   : new water after typhoon Yagi, 12 Sep minus 31 Aug 2024 (flood-yagi-red), >= 0
  rain    Mekong only: mean Feb-Apr SPI-3 of the dry seasons 2016 / 2020 / 2024: 0 at >= 0, 100 at <= -2 (spi3-mekong, 5 km,
          nearest). Not for the Red River: those three dry seasons were wetter than normal there (spi3-red means +1.36 / +1.31 / +0.38).
  crop    Mekong only: share of those dry seasons with Feb-Apr EVI anomaly <= -0.05 (sal-evianom-mekong, ch.10 threshold)
  low     DeltaDTM ground elevation: 100 at <= 1 m, 0 at >= 3 m, linear between (dem-dtm-*)

  python scripts/data/export_risk.py
"""
import gzip
import json
import sys

import numpy as np
from matplotlib.path import Path as MPath

from layerkit import DATA, write_layer

sys.stdout.reconfigure(encoding="utf-8")
CROP_MIN = 50          # % WorldCover cropland in the cell (same mask as the ch.4 rice maps)
SPI_FULL = -2.0        # mean SPI-3 at or below = score 100 (extreme drought every season)
EVI_LOSS = -0.05       # ch.10 threshold on the dry-season EVI anomaly
LOW_FULL, LOW_ZERO = 1.0, 3.0   # m above EGM2008: score 100 at or below LOW_FULL, 0 at or above LOW_ZERO
NAMES = {
    "flood": {"vi": "Ngập lũ", "en": "Flooding"},
    "rain": {"vi": "Thiếu mưa mùa khô", "en": "Dry-season rain deficit"},
    "crop": {"vi": "Cây trồng suy giảm mùa khô", "en": "Dry-season crop decline"},
    "low": {"vi": "Đất thấp", "en": "Low-lying land"},
}
INDICATORS = {"mekong": ["flood", "rain", "crop", "low"], "red": ["flood", "low"]}


def load(layer_id: str) -> tuple[dict, np.ndarray]:
    """Physical values (steps, h, w) as float32, NaN = nodata."""
    meta = json.loads((DATA / layer_id / "meta.json").read_text("utf-8"))
    dt = {"uint8": "<u1", "uint16": "<u2", "int16": "<i2"}[meta["dtype"]]
    raw = np.frombuffer(gzip.decompress((DATA / layer_id / "values.binz").read_bytes()), dt)
    raw = raw.reshape(len(meta["times"]), meta["height"], meta["width"])
    val = raw.astype(np.float32) * meta["scale"] + meta["offset"]
    val[raw == meta["nodata"]] = np.nan
    return meta, val


def onto(src: tuple[dict, np.ndarray], dst: dict) -> np.ndarray:
    """Nearest-neighbour sample of src (steps, h, w) at the cell centres of the dst grid (both EPSG:3857)."""
    m, v = src
    if m["res"] == dst["res"] and m["origin"] == dst["origin"]:
        return v
    xs = dst["origin"][0] + (np.arange(dst["width"]) + 0.5) * dst["res"]
    ys = dst["origin"][1] - (np.arange(dst["height"]) + 0.5) * dst["res"]
    cols = np.floor((xs - m["origin"][0]) / m["res"]).astype(int)
    rows = np.floor((m["origin"][1] - ys) / m["res"]).astype(int)
    ok_c, ok_r = (cols >= 0) & (cols < m["width"]), (rows >= 0) & (rows < m["height"])
    out = v[:, np.clip(rows, 0, m["height"] - 1)][:, :, np.clip(cols, 0, m["width"] - 1)]
    out[:, ~ok_r, :] = np.nan
    out[:, :, ~ok_c] = np.nan
    return out


def share_of_years(v: np.ndarray, test) -> np.ndarray:
    """100 x share of the steps (years) where test holds; NaN where any year is missing."""
    s = 100 * test(v).sum(0) / v.shape[0]
    return np.where(np.isnan(v).any(0), np.nan, s)


def indicator(name: str, region: str, g: dict) -> np.ndarray:
    if name == "flood" and region == "mekong":
        v = load("flood-s1-2018-mekong")[1]
        return np.where(np.isnan(v).all(0), np.nan, np.nanmax(np.where(np.isnan(v), -1, v), 0))
    if name == "flood":
        v = load("flood-yagi-red")[1]
        return np.clip(v[1] - v[0], 0, 100)
    if name == "rain":
        spi = onto(load(f"spi3-{region}"), g)
        return np.where(np.isnan(spi).any(0), np.nan, np.clip(100 * spi.mean(0) / SPI_FULL, 0, 100))
    if name == "crop":
        return share_of_years(load("sal-evianom-mekong")[1], lambda x: x <= EVI_LOSS)
    if name == "low":
        z = load(f"dem-dtm-{region}")[1][0]
        return np.clip(100 * (LOW_ZERO - z) / (LOW_ZERO - LOW_FULL), 0, 100)
    raise ValueError(name)


def mercator_to_lonlat(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    r = 6378137.0
    return np.degrees(x / r), np.degrees(2 * np.arctan(np.exp(y / r)) - np.pi / 2)


def province_index(region: str, g: dict) -> tuple[np.ndarray, list[str]]:
    fc = json.loads((DATA / "boundaries" / "provinces.json").read_text("utf-8"))
    provs = [f for f in fc["features"] if f["properties"]["region"] == region and f["properties"]["kind"] == "province"]
    xs = g["origin"][0] + (np.arange(g["width"]) + 0.5) * g["res"]
    ys = g["origin"][1] - (np.arange(g["height"]) + 0.5) * g["res"]
    lon, lat = mercator_to_lonlat(*np.meshgrid(xs, ys))
    pts = np.column_stack([lon.ravel(), lat.ravel()])
    idx = np.full(pts.shape[0], 255, np.uint8)
    for k, f in enumerate(provs):
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            inside = MPath(poly[0]).contains_points(pts)
            for hole in poly[1:]:
                inside &= ~MPath(hole).contains_points(pts)
            idx[inside & (idx == 255)] = k
    return idx.reshape(g["height"], g["width"]), [f["properties"]["name"] for f in provs]


def main() -> None:
    for region, names in INDICATORS.items():
        g, crop = load(f"lc-cropfrac-{region}")   # step 0 = WorldCover
        farm = crop[0] >= CROP_MIN
        steps = np.stack([indicator(n, region, g) for n in names])
        steps[:, ~farm] = np.nan
        raw = np.where(np.isnan(steps), 255, np.round(steps)).astype(np.uint8)
        prov = {
            "source": f"layers {', '.join(sorted({'lc-cropfrac', 'dem-dtm'} | ({'flood-s1-2018', 'sal-evianom', 'spi3'} if region == 'mekong' else {'flood-yagi'})))} (this repository)",
            "processing": (f"cells with >= {CROP_MIN} % WorldCover 2021 cropland; flood = "
                           + ("largest monthly S1 water share Jul-Dec 2018" if region == "mekong" else "new S1 water 12 Sep minus 31 Aug 2024 (Yagi; no data outside S1 orbit 91, ~4 % of the delta, where the composite uses low land only)")
                           + (f"; rain = mean Feb-Apr SPI-3 2016/2020/2024, 0 at >= 0, 100 at <= {SPI_FULL} (5 km, nearest)"
                              f"; crop = share of 2016/2020/2024 with Feb-Apr EVI anomaly <= {EVI_LOSS}" if region == "mekong" else "")
                           + f"; low = 100 at DeltaDTM <= {LOW_FULL} m, 0 at >= {LOW_ZERO} m, linear"),
            "attribution": "Contains modified Copernicus Sentinel data; " + ("CHIRPS (UCSB CHC); MODIS (NASA LP DAAC); " if region == "mekong" else "") + "DeltaDTM (Pronk et al. 2024, CC BY 4.0); ESA WorldCover 2021 (CC BY 4.0)",
        }
        write_layer(f"risk-{region}", raw, region, 250, times=names, dtype="uint8", scale=1, offset=0, nodata=255,
                    title={"vi": "Chỉ số hiểm họa trên đất trồng trọt", "en": "Hazard indicators on cropland"},
                    units={"vi": "điểm (0–100)", "en": "score (0–100)"}, palette="ylorrd", range_=[0, 100],
                    provenance=prov, clipped=True)
        meta_path = DATA / f"risk-{region}" / "meta.json"
        meta = json.loads(meta_path.read_text("utf-8"))
        meta["indicators"] = {n: NAMES[n] for n in names}
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8", newline="\n")

        idx, pnames = province_index(region, g)
        write_layer(f"prov-{region}", idx[None], region, 250, times=["2008"], dtype="uint8", scale=1, offset=0, nodata=255,
                    title={"vi": "Tỉnh (ranh giới trước 2025)", "en": "Province (pre-2025 boundaries)"}, units=None,
                    kind="classes", classes=[{"v": k, "color": "#999999", "label": {"vi": n, "en": n}} for k, n in enumerate(pnames)],
                    provenance={"source": "public/data/boundaries/provinces.json (geoBoundaries gbOpen ADM1, Public Domain)",
                                "processing": "province containing each ~250 m cell centre", "attribution": "geoBoundaries"},
                    clipped=True)


if __name__ == "__main__":
    main()
