"""Chapter 13 (emissions): MODIS active fires, Sentinel-5P NO2 / CO / CH4.

    python scripts/data/export_emissions.py [fire|air|ch4|ch4map]   (no argument = all)

fire: FIRMS (MODIS Terra + Aqua active fire, ~1 km, daily) fire-days per month 2001-2025 per delta and land class
      (WorldCover 2021 cropland / forest + wetland / other), and layers fire-{red,mekong} = fire-days per year per
      1 km cell, four 5-year periods 2006-2025
air:  S5P OFFL L3 tropospheric NO2 and CO, monthly region means 2019-2025; layers no2-{red,mekong} (mean 2019-2025)
ch4:  S5P OFFL L3 XCH4 (bias corrected), monthly region means + number of valid looks 2019-2025 (L3 grid)
ch4map: mean XCH4 + looks 2019-2025 exported once to an EE asset (CH4_ASSET), then ch4-vietnam, ch4looks-vietnam
      (10 km, frame 'vietnam') and the delta vs same-latitude comparison
All series go to public/data/emissions-series.json (merged, so parts can be re-run alone).
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import ee
import numpy as np

from layerkit import DATA, REGIONS as REGIONS_JSON, fetch_raw, init, region_geom, region_outline, write_layer

REGIONS = ("red", "mekong")
OUT = DATA / "emissions-series.json"
Y0, Y1 = 2001, 2025            # full FIRMS years (record starts Nov 2000)
S0, S1 = 2019, 2025            # full Sentinel-5P OFFL years
PERIODS = [(2006, 2010), (2011, 2015), (2016, 2020), (2021, 2025)]  # Terra + Aqua all years (Aqua from Jul 2002)
CLASSES = ["crop", "forest", "other"]
FIRE_RES, AIR_RES, CH4_RES = 1000, 1000, 10000
FRAME = "vietnam"            # regions.json frame for the CH4 map
MIN_LOOKS = 10
CH4_ASSET = "projects/claudev1-503808/assets/rs_agri_xch4_2019_2025"
NO2 = "tropospheric_NO2_column_number_density"
CO = "CO_column_number_density"
CH4 = "CH4_column_volume_mixing_ratio_dry_air_bias_corrected"
ATTR_FIRMS = "NASA FIRMS, MODIS Collection 6.1 active fire (Giglio et al. 2016), Terra (+ Aqua from Jul 2002), 1 km daily raster"
ATTR_S5P = "Copernicus Sentinel-5P TROPOMI OFFL L3 (contains modified Copernicus Sentinel data)"


def firms() -> ee.ImageCollection:
    return ee.ImageCollection("FIRMS").select("T21")


def land_class() -> ee.Image:
    """1 crop / 2 forest + wetland / 3 other, by the dominant (>= 50 %) WorldCover 2021 share of each FIRMS cell."""
    wc = ee.Image("ESA/WorldCover/v200/2021")
    proj = firms().first().projection()

    def frac(m):  # 100 m first: a 10 m -> 1 km reduceResolution over a delta is "Reprojection output too large"
        return m.reproject("EPSG:4326", None, 100).reduceResolution(ee.Reducer.mean(), maxPixels=65535).reproject(proj)
    crop = frac(wc.eq(40))
    forest = frac(wc.eq(10).Or(wc.eq(90)).Or(wc.eq(95)))
    return ee.Image(3).where(forest.gte(0.5), 2).where(crop.gte(0.5), 1).rename("cls").toInt()


def fire_days(start: str, end: str) -> ee.Image:
    """Days with at least one MODIS fire detection in each 1 km cell."""
    return firms().filterDate(start, end).map(lambda i: i.gt(0).selfMask()).count().unmask(0)


def fire_months(region: str, year: int, cls: ee.Image) -> dict:
    img = ee.Image.cat([fire_days(f"{year}-{m:02d}-01", ee.Date(f"{year}-{m:02d}-01").advance(1, "month"))
                        for m in range(1, 13)]).addBands(cls)
    red = ee.Reducer.sum().unweighted().repeat(12).group(12, "cls")
    r = img.reduceRegion(red, region_outline(region), crs=firms().first().projection(), maxPixels=1e10).getInfo()
    out = {c: [0] * 12 for c in CLASSES}
    for grp in r["groups"]:
        out[CLASSES[int(grp["cls"]) - 1]] = [round(v) for v in grp["sum"]]
    return out


def fire() -> None:
    cls = land_class()
    series = {}
    for region in REGIONS:
        with ThreadPoolExecutor(8) as ex:
            yrs = list(ex.map(lambda y: fire_months(region, y, cls), range(Y0, Y1 + 1)))
        series[region] = {c: [v for y in yrs for v in y[c]] for c in CLASSES}
        cells = cls.reduceRegion(ee.Reducer.frequencyHistogram().unweighted(), region_outline(region),
                                 crs=firms().first().projection(), maxPixels=1e10).get("cls").getInfo()
        series[region]["cells"] = {CLASSES[int(k) - 1]: v for k, v in cells.items()}
        print(region, {c: sum(series[region][c]) for c in CLASSES}, series[region]["cells"])

        img = ee.Image.cat([fire_days(f"{a}-01-01", f"{b + 1}-01-01").divide(b - a + 1) for a, b in PERIODS])
        raw, clipped = fetch_raw(img, region, FIRE_RES, dtype="uint8", scale=0.2, nodata=255)
        write_layer(f"fire-{region}", raw, region, FIRE_RES, times=[f"{a}–{b}" for a, b in PERIODS], dtype="uint8",
                    scale=0.2, nodata=255, clipped=clipped,
                    title={"vi": "Số ngày có điểm cháy mỗi năm (MODIS)", "en": "Fire days per year (MODIS)"},
                    units={"vi": "ngày/năm", "en": "days/yr"}, palette="ylorrd", range_=[0, 4],
                    provenance={"source": ATTR_FIRMS, "method": "days with >= 1 detection per cell, mean per year "
                                "of each 5-year period; nearest-neighbour onto the 1 km Mercator grid; capped at 50.8"})
    merge({"fire": {"years": [Y0, Y1], "classes": CLASSES, "landcover": "ESA WorldCover 2021, dominant (>= 50 %) "
                    "share per 1 km cell: crop = cropland, forest = trees + herbaceous wetland + mangrove",
                    "source": ATTR_FIRMS, "monthly": series}})


def monthly_mean(cid: str, band: str, region: str, factor: float, native: bool = False) -> tuple[list, list]:
    """Region mean and mean number of valid looks per cell, each month S0..S1. Default: sampled at 7 km (the TROPOMI
    footprint). native: on the L3 grid (~1.1 km) itself, because EE counts looks on coarse pyramid levels too high."""
    col = ee.ImageCollection(cid).select(band)
    g = region_outline(region)
    proj = col.first().projection()
    where = dict(crs=proj, scale=proj.nominalScale()) if native else dict(scale=7000)

    def one(y):
        imgs = []
        for m in range(1, 13):
            s = ee.Date.fromYMD(y, m, 1)
            c = col.filterDate(s, s.advance(1, "month"))
            imgs += [c.mean().multiply(factor).rename(f"m{m:02d}"), c.count().rename(f"n{m:02d}")]
        r = ee.Image.cat(imgs).reduceRegion(ee.Reducer.mean(), g, maxPixels=1e10, **where).getInfo()
        return [r.get(f"m{m:02d}") for m in range(1, 13)], [r.get(f"n{m:02d}") for m in range(1, 13)]
    with ThreadPoolExecutor(7) as ex:
        res = list(ex.map(one, range(S0, S1 + 1)))
    rnd = lambda v, d: None if v is None else round(v, d)
    return [rnd(v, 2) for r in res for v in r[0]], [rnd(v, 1) for r in res for v in r[1]]


def air() -> None:
    out = {}
    for region in REGIONS:
        no2, no2_n = monthly_mean("COPERNICUS/S5P/OFFL/L3_NO2", NO2, region, 1e6)   # umol/m2
        co, co_n = monthly_mean("COPERNICUS/S5P/OFFL/L3_CO", CO, region, 1e3)       # mmol/m2
        out[region] = {"no2": no2, "no2_n": no2_n, "co": co, "co_n": co_n}
        print(region, "NO2 mean", round(np.nanmean([v for v in no2 if v is not None]), 1))
        img = (ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2").select(NO2)
               .filterDate(f"{S0}-01-01", f"{S1 + 1}-01-01").mean().multiply(1e6))
        raw, clipped = fetch_raw(img, region, AIR_RES, dtype="uint16", scale=0.1, nodata=65535)
        write_layer(f"no2-{region}", raw, region, AIR_RES, times=[f"{S0}–{S1}"], dtype="uint16", scale=0.1,
                    nodata=65535, clipped=clipped,
                    title={"vi": "NO₂ tầng đối lưu, trung bình (Sentinel-5P)", "en": "Tropospheric NO₂, mean (Sentinel-5P)"},
                    units={"vi": "µmol/m²", "en": "µmol/m²"}, palette="ylorrd", range_=[20, 120],
                    provenance={"source": ATTR_S5P, "method": f"mean of all OFFL L3 NO2 images {S0}-{S1} "
                                "(L3 grid ~1.1 km, native footprint 5.5 x 3.5 km), nearest sampling onto the 1 km Mercator grid"})
    merge({"air": {"months": [S0, S1], "units": {"no2": "umol/m2", "co": "mmol/m2"}, "source": ATTR_S5P, **out}})


def ch4_col() -> ee.ImageCollection:
    return ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_CH4").select(CH4).filterDate(f"{S0}-01-01", f"{S1 + 1}-01-01")


def ch4() -> None:
    """Monthly XCH4 region means and looks per cell, on the L3 grid (written first: the map part is slow)."""
    old = json.loads(OUT.read_text("utf-8")).get("ch4", {}) if OUT.exists() else {}
    out = {}
    for region in REGIONS:
        v, n = monthly_mean("COPERNICUS/S5P/OFFL/L3_CH4", CH4, region, 1, native=True)
        out[region] = {**old.get(region, {}), "xch4": v, "n": n}  # keep ch4map's comparison and looks
        print(region, "XCH4 months with data:", sum(x is not None for x in v))
    merge({"ch4": {"months": [S0, S1], "units": "ppb", "min_looks_map": MIN_LOOKS, "source": ATTR_S5P, **out}})


def ch4_asset() -> ee.Image:
    """Mean XCH4 and number of valid looks S0..S1 on the ~1.1 km L3 grid, exported once as an EE asset: computed on
    the fly over the frame it times out, and coarse-scale count() reads pyramid levels and inflates the looks."""
    try:
        ee.data.getAsset(CH4_ASSET)
        return ee.Image(CH4_ASSET)
    except ee.EEException:
        pass
    col = ch4_col()
    proj = col.first().projection().getInfo()
    img = col.mean().addBands(col.count()).rename(["xch4", "looks"]).toFloat()
    task = ee.batch.Export.image.toAsset(img, description="rs_agri_xch4", assetId=CH4_ASSET, region=region_geom(FRAME),
                                         crs=proj["crs"], crsTransform=proj["transform"], maxPixels=1e10)
    task.start()
    while (st := task.status()["state"]) in ("READY", "RUNNING"):
        print("  asset export", st, end=chr(13), flush=True)
        time.sleep(30)
    if st != "COMPLETED":
        raise RuntimeError(f"XCH4 asset export {st}: {task.status().get('error_message')}")
    print()
    return ee.Image(CH4_ASSET)


def ch4map() -> None:
    a = ch4_asset()
    proj = a.projection()
    looks = a.select("looks")
    mean = a.select("xch4").updateMask(looks.gte(MIN_LOOKS))
    d = json.loads(OUT.read_text("utf-8"))
    for region in REGIONS:
        g = region_outline(region)
        lat0, lat1 = REGIONS_JSON[region]["bbox"][1], REGIONS_JSON[region]["bbox"][3]
        band = ee.Geometry.Rectangle([100, lat0, 112, lat1], None, False).difference(g, 1000)
        at = dict(crs=proj, scale=proj.nominalScale(), maxPixels=1e10)
        cmp = ee.Dictionary({k: mean.reduceRegion(ee.Reducer.mean(), geom, **at).get("xch4")
                             for k, geom in (("delta", g), ("band", band))}).getInfo()
        lk = looks.reduceRegion(ee.Reducer.percentile([10, 50, 90]).combine(ee.Reducer.mean(), None, True), g, **at).getInfo()
        d["ch4"][region]["mean_2019_2025"] = {k: round(x, 1) for k, x in cmp.items()}
        d["ch4"][region]["looks_per_cell"] = {k.replace("looks_", ""): round(x, 1) for k, x in lk.items()}
        print(region, "XCH4 delta vs same-latitude band:", d["ch4"][region]["mean_2019_2025"], "looks:", d["ch4"][region]["looks_per_cell"])
    merge({"ch4": d["ch4"]})
    for lid, img, kw in (
            (f"ch4-{FRAME}", mean, dict(dtype="uint16", scale=0.1, offset=1800, nodata=65535, palette="ylorrd",
                                        range_=[1890, 1960], units={"vi": "ppb", "en": "ppb"},
                                        title={"vi": "CH₄ cột khí (XCH₄), trung bình 2019–2025", "en": "Column CH₄ (XCH₄), mean 2019–2025"})),
            (f"ch4looks-{FRAME}", looks, dict(dtype="uint16", scale=0.1, offset=0, nodata=65535, palette="viridis",
                                              range_=[0, 200], units={"vi": "lần đo", "en": "looks"},
                                              title={"vi": "Số lần đo CH₄ hợp lệ mỗi ô 1,1 km, 2019–2025", "en": "Valid CH₄ looks per 1.1 km cell, 2019–2025"}))):
        img10 = img.reduceResolution(ee.Reducer.mean(), maxPixels=65535)
        raw, clipped = fetch_raw(img10, FRAME, CH4_RES, dtype=kw["dtype"], scale=kw["scale"], offset=kw["offset"],
                                 nodata=kw["nodata"], clip=False)
        write_layer(lid, raw, FRAME, CH4_RES, times=[f"{S0}–{S1}"], clipped=clipped, **{k: kw[k] for k in
                    ("dtype", "scale", "offset", "nodata", "title", "units", "palette", "range_")},
                    provenance={"source": ATTR_S5P, "method": f"OFFL L3 XCH4 bias corrected, all daily images {S0}-{S1}; "
                                f"looks counted and XCH4 averaged on the ~1.1 km L3 grid (EE asset), XCH4 kept where "
                                f">= {MIN_LOOKS} looks, then mean of the 1.1 km cells to ~{CH4_RES // 1000} km"})


def merge(part: dict) -> None:
    d = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {}
    d.update(part)
    OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")


if __name__ == "__main__":
    init()
    parts = sys.argv[1:] or ["fire", "air", "ch4", "ch4map"]
    for p in parts:
        {"fire": fire, "air": air, "ch4": ch4, "ch4map": ch4map}[p]()
