"""Layers and numbers for the Flood chapter (8). Run from the repo root, WITHOUT -I; pick parts by name:

    python scripts/data/export_flood.py season     # flood-gswseason-{red,mekong}: JRC GSW seasonality (months of water, 2021), 250 m
    python scripts/data/export_flood.py monthly    # Mekong Sentinel-1 water share per 250 m cell, Jul-Dec 2016-2025:
                                                   #   layers flood-s1-{2018,2024}-mekong + flood-s1-area-mekong.json (ha per month, region + provinces)
    python scripts/data/export_flood.py yagi       # Red River Delta before/after typhoon Yagi (S1 orbit 91, 31 Aug / 12 Sep 2024):
                                                   #   layer flood-yagi-red + flood-yagi-red.json (new water on cropland, ha per province)
    python scripts/data/export_flood.py mndwi      # s2mndwi-angiang-2024: Sentinel-2 MNDWI on 26 Oct 2024 (same day as an S1 orbit-26 pass)

Water from radar: VV < WATER_DB on the monthly median (monthly) or on the single date (yagi), slope < 5 deg (SRTM) so hill
shadow is not water. Flooded paddies count as water: in Jul-Aug much of it is the rice calendar, not the river flood.
Water masks (10 m for yagi, ~100 m for monthly) are averaged to 250 m with small request chunks (max_rows).
"""
import json
import sys
from datetime import datetime, timezone

import ee
import numpy as np

from layerkit import DATA, ROOT, export_layer, fetch_raw, grid, init, region_geom, to_values, write_layer

WATER_DB = -18.0
RES = 250
FRAC = {"dtype": "uint8", "scale": 0.5, "nodata": 255}  # water share of the cell, 0 .. 100 % in 0.5 % steps
MONTHS = list(range(7, 13))
YEARS = list(range(2016, 2026))
LAYER_YEARS = (2018, 2024)
YAGI = ("2024-08-31", "2024-09-12")
YAGI_ORBIT = 91
CACHE = ROOT / "scripts" / "data"
S1_ATTR = "Contains modified Copernicus Sentinel data {y}"
NL = "\n"


def provinces(region: str) -> ee.FeatureCollection:
    fc = json.loads((DATA / "boundaries" / "provinces.json").read_text("utf-8"))
    feats = [f for f in fc["features"] if f["properties"]["region"] == region and f["properties"]["kind"] == "province"]
    return ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"name": f["properties"]["name"], "idx": i + 1})
                                 for i, f in enumerate(feats)])


def flat() -> ee.Image:
    return ee.Terrain.slope(ee.Image("USGS/SRTMGL1_003")).lt(5)


def s1(geom: ee.Geometry) -> ee.ImageCollection:
    return (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geom).filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV")).select("VV"))


def water10(vv: ee.Image, proj: ee.Projection) -> ee.Image:
    return vv.lt(WATER_DB).updateMask(flat()).setDefaultProjection(proj)


def to_250(img: ee.Image) -> ee.Image:
    return img.multiply(100).reduceResolution(ee.Reducer.mean(), maxPixels=1024)


def write_json(name: str, obj: dict) -> None:
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8", newline=NL)
    print("wrote", name)


def stamp(extra: dict) -> dict:
    return {**extra, "exported": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "script": "scripts/data/export_flood.py"}


def season() -> None:
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    img = gsw.select("seasonality").unmask(0).reduceResolution(ee.Reducer.mean(), maxPixels=1024)
    for region in ("red", "mekong"):
        export_layer(
            f"flood-gswseason-{region}", img, region, RES, times=["2021"], dtype="uint8", scale=0.05, nodata=255,
            title={"vi": "Số tháng có nước mặt (2021)", "en": "Months with surface water (2021)"},
            units={"vi": "tháng", "en": "months"}, palette="water", range_=[0, 12],
            provenance={"source": "JRC/GSW1_4/GlobalSurfaceWater band seasonality (Landsat, year 2021)",
                        "processing": "no water = 0; mean of the 30 m cells in each ~250 m cell",
                        "attribution": "EC JRC / Google, Pekel et al. (2016) Nature 540"})


def monthly_frac(year: int) -> np.ndarray:
    """Water share (%) per 250 m Mekong cell, Jul-Dec of year, (6, h, w) float with NaN; cached."""
    f = CACHE / f"cache_s1water_mekong_{year}.npy"
    if not f.exists():
        geom = region_geom("mekong")
        col = s1(geom)
        # water at ~100 m (S1 pyramid level): a delta-wide 10 m monthly median exceeds EE user memory, 30 m takes >20 min a year
        proj = col.first().projection().atScale(100)
        frames = []
        for m in MONTHS:  # one request series per month, same reason
            start = ee.Date.fromYMD(year, m, 1)
            img = to_250(water10(col.filterDate(start, start.advance(1, "month")).median(), proj))
            print(f"monthly {year}-{m:02d}: fetching ...", flush=True)
            frames.append(fetch_raw(img, "mekong", RES, **FRAC)[0][0])
        np.save(f, np.stack(frames))
    return to_values(np.load(f), FRAC["scale"], 0, FRAC["nodata"])


def province_grid(region: str) -> tuple[np.ndarray, list[str]]:
    """Province index (h, w) on the region grid (0 = none) and names (index - 1)."""
    fc = provinces(region)
    names = fc.aggregate_array("name").getInfo()
    f = CACHE / f"cache_prov_{region}.npy"
    if not f.exists():
        img = fc.reduceToImage(["idx"], ee.Reducer.first()).unmask(0)
        np.save(f, fetch_raw(img, region, RES, dtype="uint8", scale=1, nodata=255, clip=False)[0][0])
    return np.load(f), names


def cell_ha(region: str) -> np.ndarray:
    """Ground area of one cell per row (h, 1), hectares: (res * cos(lat))^2."""
    g = grid(region, RES)
    y = g["origin"][1] - (np.arange(g["height"]) + 0.5) * g["res"]
    lat = 2 * np.arctan(np.exp(y / 6378137.0)) - np.pi / 2
    return ((g["res"] * np.cos(lat)) ** 2 / 1e4)[:, None]


def monthly() -> None:
    prov, names = province_grid("mekong")
    ha = cell_ha("mekong")
    out = {"years": YEARS, "months": MONTHS, "region_ha": [], "valid_share": [], "provinces": {n: [] for n in names}}
    for y in YEARS:
        fr = monthly_frac(y)
        w = np.nan_to_num(fr) / 100 * ha
        out["region_ha"].append([round(float(w[i].sum())) for i in range(len(MONTHS))])
        inside = prov > 0
        out["valid_share"].append([round(float((~np.isnan(fr[i]) & inside).sum() / inside.sum()), 3) for i in range(len(MONTHS))])
        for k, n in enumerate(names):
            out["provinces"][n].append([round(float(w[i][prov == k + 1].sum())) for i in range(len(MONTHS))])
        print(y, "ha (thousand):", [round(v / 1000) for v in out["region_ha"][-1]])
        if y in LAYER_YEARS:
            raw = np.load(CACHE / f"cache_s1water_mekong_{y}.npy")
            raw[:, prov == 0] = FRAC["nodata"]  # same clip as the other delta layers
            write_layer(
                f"flood-s1-{y}-mekong", raw, "mekong", RES, times=[f"{y}-{m:02d}" for m in MONTHS], **FRAC,
                title={"vi": f"Nước mặt theo tháng {y} (radar)", "en": f"Monthly surface water {y} (radar)"},
                units={"vi": "% diện tích ô", "en": "% of cell"}, palette="water", range_=[0, 100], clipped=True,
                provenance={"source": "COPERNICUS/S1_GRD IW VV, all orbits; USGS/SRTMGL1_003 slope",
                            "processing": f"monthly median VV < {WATER_DB} dB and slope < 5 deg at ~100 m, share of "
                                          "water in each ~250 m cell; flooded paddies count as water",
                            "attribution": S1_ATTR.format(y=y)})
    out["provenance"] = stamp({
        "source": "COPERNICUS/S1_GRD IW VV (all orbits), monthly median", "unit": "ha of open water (incl. flooded paddies)",
        "method": f"VV < {WATER_DB} dB, slope < 5 deg, summed from ~250 m water shares x cell ground area; provinces = "
                  "geoBoundaries ADM1 (2008); valid_share = share of region cells with radar data that month",
        "sensors": "S1A+S1B 2016-2021, S1A only 2022-Mar 2025, S1A+S1C from Apr 2025",
        "attribution": "Contains modified Copernicus Sentinel data 2016-2025"})
    write_json("flood-s1-area-mekong.json", out)


def yagi() -> None:
    geom = region_geom("red")
    col = s1(geom).filter(ee.Filter.eq("relativeOrbitNumber_start", YAGI_ORBIT))
    proj = col.first().projection()
    days = [col.filterDate(d, ee.Date(d).advance(1, "day")).mosaic() for d in YAGI]
    w = [water10(v, proj) for v in days]
    export_layer(
        "flood-yagi-red", ee.Image.cat([to_250(x) for x in w]), "red", RES, times=list(YAGI), **FRAC, max_rows=64,
        title={"vi": "Nước mặt trước / sau bão Yagi (radar)", "en": "Surface water before / after typhoon Yagi (radar)"},
        units={"vi": "% diện tích ô", "en": "% of cell"}, palette="water", range_=[0, 100],
        provenance={"source": f"COPERNICUS/S1_GRD IW VV, relative orbit {YAGI_ORBIT} (descending), {YAGI[0]} and {YAGI[1]}",
                    "processing": f"VV < {WATER_DB} dB and slope < 5 deg at 10 m, share of water in each ~250 m cell",
                    "attribution": S1_ATTR.format(y=2024)})
    crop = ee.ImageCollection("ESA/WorldCover/v200").first().eq(40)
    new = w[1].And(w[0].Not())
    img = ee.Image.cat([new.rename("new_water"), new.And(crop).rename("new_water_crop"), crop.rename("cropland")])
    img = img.unmask(0).multiply(ee.Image.pixelArea()).divide(1e4)
    res = img.reduceRegions(provinces("red"), ee.Reducer.sum(), scale=20, tileScale=8).getInfo()
    rows = sorted(({"name": f["properties"]["name"], **{k: round(f["properties"][k]) for k in ("new_water", "new_water_crop", "cropland")}}
                   for f in res["features"]), key=lambda r: -r["new_water_crop"])
    for r in rows:
        print(r)
    write_json("flood-yagi-red.json", {"dates": list(YAGI), "provinces": rows, "provenance": stamp({
        "source": f"COPERNICUS/S1_GRD IW VV orbit {YAGI_ORBIT}; ESA/WorldCover/v200 (2021) class 40 cropland",
        "unit": "ha", "method": f"new water = water on {YAGI[1]} and not on {YAGI[0]} (VV < {WATER_DB} dB, slope < 5 deg), "
                                "10 m, summed at 20 m per province (geoBoundaries ADM1, 2008)",
        "attribution": "Contains modified Copernicus Sentinel data 2024; ESA WorldCover 2021 v200"})})


def mndwi() -> None:
    geom = region_geom("angiang")
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geom).filterDate("2024-10-26", "2024-10-27")
           .linkCollection(cs, ["cs_cdf"]))
    im = col.mosaic()
    idx = im.normalizedDifference(["B3", "B11"]).updateMask(im.select("cs_cdf").gte(0.6))
    export_layer(
        "s2mndwi-angiang-2024", idx.setDefaultProjection(col.first().select("B3").projection()), "angiang", 10,
        times=["2024-10-26"], dtype="uint8", scale=0.008, offset=-1.0, nodata=255,
        title={"vi": "Chỉ số nước MNDWI (Sentinel-2)", "en": "MNDWI water index (Sentinel-2)"},
        units={"vi": "MNDWI", "en": "MNDWI"}, palette="gray", range_=[-0.6, 0.6],
        provenance={"source": "COPERNICUS/S2_SR_HARMONIZED 2024-10-26, (B3 - B11) / (B3 + B11); Cloud Score+ cs_cdf >= 0.6",
                    "processing": "B11 (20 m) nearest-resampled to the 10 m Web Mercator grid",
                    "attribution": "Contains modified Copernicus Sentinel data 2024"})


PARTS = {"season": season, "monthly": monthly, "yagi": yagi, "mndwi": mndwi}

if __name__ == "__main__":
    init()
    for part in sys.argv[1:] or list(PARTS):
        PARTS[part]()
