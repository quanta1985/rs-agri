"""Chapters 1 (deltas) and 2 (data): land cover, population, region statistics, clear-sky and pixel-purity statistics.

    python scripts/data/export_deltas.py [volume|landcover|pop|stats|clearsky|purity]   (no argument = all)

Writes lc-wc2021-{red,mekong}, pop-2020-{red,mekong} (public/data/<id>/), deltas-stats.json, data-clearsky.json,
data-purity.json, data-volume.json (public/data/).
"""
import json
import sys

import ee
import numpy as np

from layerkit import DATA, REGIONS, export_layer, fetch_raw, init, region_geom, region_outline

sys.stdout.reconfigure(encoding="utf-8")
WC = "ESA/WorldCover/v200"
GHSL = "JRC/GHSL/P2023A/GHS_POP"
SITES = [k for k, v in REGIONS.items() if v["kind"] == "site"]
WC_CLASSES = [  # value, official colour, vi, en
    (10, "#006400", "Cây gỗ", "Tree cover"), (20, "#ffbb22", "Cây bụi", "Shrubland"),
    (30, "#ffff4c", "Cỏ", "Grassland"), (40, "#f096ff", "Đất trồng trọt", "Cropland"),
    (50, "#fa0000", "Xây dựng", "Built-up"), (60, "#b4b4b4", "Đất trống", "Bare / sparse"),
    (80, "#0064c8", "Mặt nước", "Permanent water"), (90, "#0096a0", "Đất ngập nước", "Herbaceous wetland"),
    (95, "#00cf75", "Rừng ngập mặn", "Mangroves"),
]
WC_ATTR = "ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022), CC BY 4.0"
GHSL_ATTR = "GHS-POP R2023A (Schiavina et al. 2023, European Commission JRC), CC BY 4.0"


def write_json(name: str, obj: dict) -> None:
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")
    print("wrote", name)


def landcover() -> None:
    wc = ee.ImageCollection(WC).first().select("Map")
    img = wc.reduceResolution(ee.Reducer.mode(), maxPixels=1024)
    classes = [{"v": v, "color": c, "label": {"vi": vi, "en": en}} for v, c, vi, en in WC_CLASSES]
    for region in ("red", "mekong"):
        export_layer(
            f"lc-wc2021-{region}", img, region, 250, times=["2021"], dtype="uint8", scale=1, nodata=255,
            max_rows=48, kind="classes", classes=classes, units=None,
            title={"vi": "Lớp phủ đất ESA WorldCover 2021", "en": "ESA WorldCover 2021 land cover"},
            provenance={"source": f"{WC} band Map (Sentinel-1 + Sentinel-2, 10 m)",
                        "processing": "most frequent 10 m class in each ~250 m cell (small classes such as "
                                      "village ribbons and canals disappear)", "attribution": WC_ATTR})


def ghsl(year: int) -> ee.Image:
    return ee.Image(f"{GHSL}/{year}").select("population_count")


def pop() -> None:
    p = ghsl(2020)
    proj = p.projection()
    dens = p.divide(ee.Image.pixelArea().reproject(proj).divide(1e6)).setDefaultProjection(proj)
    img = dens.reduceResolution(ee.Reducer.mean(), maxPixels=1024)
    for region in ("red", "mekong"):
        export_layer(
            f"pop-2020-{region}", img, region, 250, times=["2020"], dtype="uint16", scale=1, nodata=65535,
            title={"vi": "Mật độ dân số 2020 (GHSL)", "en": "Population density 2020 (GHSL)"},
            units={"vi": "người/km²", "en": "people/km²"}, palette="ylorrd", range_=[0, 3000],
            provenance={"source": f"{GHSL}/2020 band population_count (100 m, Mollweide)",
                        "processing": "people per 100 m cell / cell area -> people per km², mean to ~250 m",
                        "attribution": GHSL_ATTR})


def stats() -> None:
    wc = ee.ImageCollection(WC).first().select("Map")
    out = {"wc_classes": {str(v): {"vi": vi, "en": en} for v, _, vi, en in WC_CLASSES}, "regions": {}}
    for region in ("red", "mekong"):
        geom = region_outline(region)
        area = ee.Image.pixelArea().addBands(wc).reduceRegion(
            ee.Reducer.sum().group(groupField=1, groupName="c"), geom, 30, maxPixels=1e11, tileScale=4).getInfo()
        ha = {str(int(g["c"])): round(g["sum"] / 1e4) for g in area["groups"]}
        pops = {}
        for y in (2000, 2020):
            img = ghsl(y)
            pops[str(y)] = round(img.reduceRegion(ee.Reducer.sum(), geom, crs=img.projection(), maxPixels=1e11,
                                                  tileScale=4).getInfo()["population_count"])
        total = sum(ha.values())
        out["regions"][region] = {"area_ha": total, "wc_ha": ha, "pop": pops}
        print(region, f"{total:,} ha", {k: f"{v / total:.1%}" for k, v in ha.items()}, pops)
    out["provenance"] = {"area": f"{WC} pixel areas sampled at 30 m inside the region outline (geoBoundaries ADM1, 2008)",
                         "pop": f"{GHSL} 2000 and 2020, sum inside the outline", "attribution": f"{WC_ATTR}; {GHSL_ATTR}"}
    write_json("deltas-stats.json", out)


def s2_dates(site: str, start: str, end: str) -> list[dict]:
    """One row per Sentinel-2 date over the site frame: share of the frame imaged, share of it clear (Cloud Score+)."""
    box = region_geom(site)
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(box).filterDate(start, end)
           .linkCollection(cs, ["cs_cdf"]))
    total = ee.Image.constant(1).reduceRegion(ee.Reducer.count(), box, 60).get("constant")
    days = col.aggregate_array("system:time_start").map(lambda t: ee.Date(t).format("YYYY-MM-dd")).distinct()

    def per_day(d):
        d0 = ee.Date.parse("YYYY-MM-dd", d)
        m = col.filterDate(d0, d0.advance(1, "day")).select("cs_cdf").mosaic().gte(0.6)
        st = m.reduceRegion(ee.Reducer.mean().combine(ee.Reducer.count(), sharedInputs=True), box, 60)
        return ee.Feature(None, {"d": d, "clear": st.get("cs_cdf_mean"),
                                 "cover": ee.Number(st.get("cs_cdf_count")).divide(total)})

    fc = ee.FeatureCollection(days.map(per_day)).getInfo()
    return [f["properties"] for f in fc["features"]]


def s1_dates(site: str, start: str, end: str) -> list[str]:
    box = region_geom(site)
    col = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(box).filterDate(start, end)
           .filter(ee.Filter.eq("instrumentMode", "IW")))
    return sorted(set(col.aggregate_array("system:time_start").map(
        lambda t: ee.Date(t).format("YYYY-MM-dd")).getInfo()))


def clearsky() -> None:
    years = list(range(2019, 2025))
    out = {"years": years, "s1_years": list(range(2015, 2026)), "sites": {},
           "rule": {"cover": 0.95, "clear": 0.8, "cs_cdf": 0.6}}
    for site in SITES:
        rows = s2_dates(site, f"{years[0]}-01-01", f"{years[-1] + 1}-01-01")
        dates = np.zeros((len(years), 12), int)
        usable = np.zeros((len(years), 12), int)
        frac = [[[] for _ in range(12)] for _ in years]
        for r in rows:
            y, m = int(r["d"][:4]) - years[0], int(r["d"][5:7]) - 1
            if r["cover"] is None or r["cover"] < 0.5:  # tile edge grazing the frame: not a real look
                continue
            dates[y, m] += 1
            frac[y][m].append(r["clear"] or 0)
            usable[y, m] += r["cover"] >= 0.95 and (r["clear"] or 0) >= 0.8
        s1 = s1_dates(site, "2015-01-01", "2026-01-01")
        s1_year = [sum(d.startswith(str(y)) for d in s1) for y in out["s1_years"]]
        out["sites"][site] = {
            "s2_dates": dates.tolist(), "s2_usable": usable.tolist(),
            "s2_clear_mean": [round(float(np.mean(sum((frac[y][m] for y in range(len(years))), []) or [0])), 3)
                              for m in range(12)],
            "s1_dates_per_year": s1_year}
        print(site, "S2 looks/yr", dates.sum(1).tolist(), "usable/yr", usable.sum(1).tolist(), "S1/yr", s1_year)
    out["provenance"] = {
        "s2": "COPERNICUS/S2_SR_HARMONIZED + GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED over each 10.24 km site frame; "
              "one row per date (tiles mosaicked); a look = >= 50 % of the frame imaged; usable = >= 95 % imaged "
              "and >= 80 % of it clear (cs_cdf >= 0.6), at 60 m",
        "s1": "COPERNICUS/S1_GRD IW, distinct dates with a scene touching the frame (any orbit)",
        "attribution": "Contains modified Copernicus Sentinel data 2015-2025"}
    write_json("data-clearsky.json", out)


def purity() -> None:
    """Share of grid cells where one WorldCover class covers >= 90 % of the 10 m pixels, by cell size."""
    wc = ee.ImageCollection(WC).first().select("Map")
    factors = [1, 2, 3, 5, 10, 25, 50]
    out = {"res_m": [10 * f for f in factors], "threshold": 0.9, "sites": {}}
    for site in SITES:
        raw, _ = fetch_raw(wc, site, 10, dtype="uint8", scale=1, nodata=255)
        a = raw[0]
        shares = []
        for f in factors:
            n = (a.shape[0] // f) * f
            blocks = a[:n, :n].reshape(n // f, f, n // f, f).transpose(0, 2, 1, 3).reshape(-1, f * f)
            top = np.array([np.bincount(b, minlength=256).max() for b in blocks]) / (f * f)
            shares.append(round(float((top >= 0.9).mean()), 4))
        crop = round(float((a == 40).mean()), 4)
        out["sites"][site] = {"pure": shares, "cropland": crop}
        print(site, dict(zip(out["res_m"], shares)), "cropland", crop)
    out["provenance"] = {"source": f"{WC} band Map at 10 m on each site frame",
                         "processing": "cells of 2x2 ... 50x50 pixels; pure = one class >= 90 % of the cell",
                         "attribution": WC_ATTR}
    write_json("data-purity.json", out)


def volume() -> None:
    """Scenes acquired over each delta in 2024 (the data volume a local workflow would download)."""
    cols = {"s2": ("COPERNICUS/S2_HARMONIZED", None), "s1": ("COPERNICUS/S1_GRD", ee.Filter.eq("instrumentMode", "IW")),
            "landsat": ("LANDSAT/LC08/C02/T1_L2", None), "landsat9": ("LANDSAT/LC09/C02/T1_L2", None)}
    out = {"year": 2024, "regions": {}}
    for region in ("red", "mekong"):
        geom = region_outline(region)
        n = {}
        for k, (cid, f) in cols.items():
            c = ee.ImageCollection(cid).filterBounds(geom).filterDate("2024-01-01", "2025-01-01")
            n[k] = (c.filter(f) if f else c).size().getInfo()
        n["s2_tiles"] = len(ee.ImageCollection(cols["s2"][0]).filterBounds(geom).filterDate("2024-01-01", "2025-01-01")
                            .aggregate_array("MGRS_TILE").distinct().getInfo())
        n["landsat"] += n.pop("landsat9")
        out["regions"][region] = n
        print(region, n)
    out["provenance"] = {"source": "image counts in COPERNICUS/S2_HARMONIZED (L1C tiles), COPERNICUS/S1_GRD (IW), "
                                   "LANDSAT/LC08 + LC09 C02 T1_L2 touching the region outline, 2024"}
    write_json("data-volume.json", out)


PARTS = {"volume": volume, "landcover": landcover, "pop": pop, "stats": stats, "clearsky": clearsky, "purity": purity}

if __name__ == "__main__":
    init()
    for name in sys.argv[1:] or PARTS:
        PARTS[name]()
