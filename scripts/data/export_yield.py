"""Chapter 6 (yield): MODIS EVI of the main rice season per province and year, for yield models and early warning.

    python scripts/data/export_yield.py [peaks|late|curves|official]   (no argument = all)

peaks  : peak EVI of the main season per province and region, 2001-2025, on cells with >= 50 % WorldCover cropland:
         Mekong winter-spring (Dong Xuan, 15 Nov of the previous year - 31 Mar), Red River spring (Xuan, 15 Feb - 31 May).
late   : Mekong mean EVI 1 Feb - 31 Mar per province (late-season stress such as the 2016 / 2020 salinity).
official: NSO winter-spring yield + area per province (scripts/data/nso_rice_dong_xuan.csv), no EE.
curves : mean EVI over the region's cropland cells for every 8-day composite of each season (the season curve).
Writes public/data/yield-series.json (merged, so the parts can run in any order).
"""
import json
from pathlib import Path
import sys

import ee

from layerkit import DATA, init, region_outline

COLS = ["MODIS/061/MOD13Q1", "MODIS/061/MYD13Q1"]
YEARS = list(range(2001, 2026))
SEASON = {"mekong": ("{p}-11-15", "{y}-04-01"), "red": ("{y}-02-15", "{y}-06-01")}  # filterDate end is exclusive: through 31 Mar / 31 May
OUT = DATA / "yield-series.json"
ATTR = "MODIS MOD13Q1/MYD13Q1 v061 (NASA LP DAAC); ESA WorldCover 10 m 2021 v200 (CC BY 4.0)"


def provinces(region: str) -> ee.FeatureCollection:
    fc = json.loads((DATA / "boundaries" / "provinces.json").read_text("utf-8"))
    return ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"name": f["properties"]["name"]})
                                 for f in fc["features"]
                                 if f["properties"]["region"] == region and f["properties"]["kind"] == "province"])


def season_col(region: str, y: int) -> ee.ImageCollection:
    a, b = SEASON[region]
    start, end = a.format(p=y - 1, y=y), b.format(p=y - 1, y=y)
    geom = region_outline(region)
    cols = [ee.ImageCollection(c).filterDate(start, end).filterBounds(geom) for c in COLS]
    return cols[0].merge(cols[1]).sort("system:time_start").map(
        lambda im: im.select("EVI").multiply(0.0001).updateMask(im.select("SummaryQA").lte(1))
        .copyProperties(im, ["system:time_start"]))


def crop_mask(proj: ee.Projection) -> ee.Image:
    wc = ee.ImageCollection("ESA/WorldCover/v200").first()
    # 10 m -> 100 m first, else 'Reprojection output too large' over the Red River provinces
    frac = wc.eq(40).reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(proj.atScale(100))
    return frac.reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(proj).gte(0.5)


def write(update: dict) -> None:
    d = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {}
    for region, v in update.items():
        d.setdefault(region, {}).update(v)
    d["attribution"] = ATTR
    d["season"] = {k: {"vi": vi, "en": en} for k, vi, en in (
        ("mekong", "Đông Xuân: 15/11 năm trước – 31/3", "winter-spring: 15 Nov of the previous year - 31 Mar"),
        ("red", "vụ Xuân: 15/2 – 31/5", "spring: 15 Feb - 31 May"))}
    OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")


def peaks() -> None:
    for region in ("mekong", "red"):
        fc = provinces(region)
        res = {"years": YEARS, "provinces": {}, "region": [], "region_valid": []}
        for y in YEARS:
            col = season_col(region, y)
            proj = ee.ImageCollection(COLS[0]).first().select("EVI").projection()
            crop = crop_mask(proj)
            peak = col.max().setDefaultProjection(proj).updateMask(crop).rename("peak")
            ok = peak.mask().rename("ok").unmask(0).updateMask(crop)
            img = peak.addBands(ok)
            red = ee.Reducer.mean()
            per = img.reduceRegions(fc, red, crs=proj, scale=proj.nominalScale(), tileScale=16).getInfo()
            reg = img.reduceRegion(red, region_outline(region), crs=proj, scale=proj.nominalScale(), maxPixels=1e10, tileScale=16).getInfo()
            for f in per["features"]:
                p = f["properties"]
                res["provinces"].setdefault(p["name"], []).append(
                    [round(p["peak"], 4) if p.get("peak") is not None else None, round(p.get("ok") or 0, 3)])
            res["region"].append(round(reg["peak"], 4) if reg.get("peak") is not None else None)
            res["region_valid"].append(round(reg.get("ok") or 0, 3))
            print(region, y, res["region"][-1], res["region_valid"][-1], flush=True)
        write({region: {"peaks": res}})


def late() -> None:
    """Mekong only: mean EVI of the good composites 1 Feb - 31 Mar (grain filling to harvest of the winter-spring crop,
    when the 2016 and 2020 salinity struck) per province, on the same cropland cells as peaks()."""
    fc = provinces("mekong")
    proj = ee.ImageCollection(COLS[0]).first().select("EVI").projection()
    crop = crop_mask(proj)
    res = {"years": YEARS, "window": "01-02..31-03", "provinces": {}}
    for y in YEARS:
        cols = [ee.ImageCollection(c).filterDate(f"{y}-02-01", f"{y}-04-01").filterBounds(region_outline("mekong")) for c in COLS]
        col = cols[0].merge(cols[1]).map(lambda im: im.select("EVI").multiply(0.0001).updateMask(im.select("SummaryQA").lte(1)))
        img = col.mean().setDefaultProjection(proj).updateMask(crop).rename("late")
        per = img.reduceRegions(fc, ee.Reducer.mean(), crs=proj, scale=proj.nominalScale(), tileScale=16).getInfo()
        for f in per["features"]:
            p = f["properties"]
            res["provinces"].setdefault(p["name"], []).append(round(p["mean"], 4) if p.get("mean") is not None else None)
        print("late", y, flush=True)
    write({"mekong": {"late": res}})


def curves() -> None:
    for region in ("mekong", "red"):
        g = region_outline(region)
        proj = ee.ImageCollection(COLS[0]).first().select("EVI").projection()
        crop = crop_mask(proj)
        res = {}
        for y in YEARS:
            col = season_col(region, y)

            def stat(im: ee.Image) -> ee.Feature:
                v = im.updateMask(crop)
                r = v.addBands(v.mask().rename("ok").unmask(0).updateMask(crop)).reduceRegion(
                    ee.Reducer.mean(), g, crs=proj, scale=proj.nominalScale(), maxPixels=1e10, tileScale=16)
                return ee.Feature(None, {"t": im.get("system:time_start"), "evi": r.get("EVI"), "ok": r.get("ok")})

            fs = ee.FeatureCollection(col.map(stat)).getInfo()["features"]
            res[str(y)] = [[p["t"] // 1000 // 86400 + 8, round(p["evi"], 4) if p.get("evi") is not None else None,
                            round(p.get("ok") or 0, 3)] for p in (f["properties"] for f in fs)]
            print(region, y, len(res[str(y)]), flush=True)
        write({region: {"curves": res, "curves_doc": "[day since 1970-01-01 (16-day composite start + 8 d), mean EVI of good "
                                                     "cropland cells, share of cropland cells with a good value]"}})


def official() -> None:
    """Winter-spring yield and sown area per province from scripts/data/nso_rice_dong_xuan.csv (NSO PX-Web)."""
    import csv
    path = Path(__file__).with_name("nso_rice_dong_xuan.csv")
    rows = [r for r in csv.DictReader(line for line in path.open(encoding="utf-8") if not line.startswith("#"))]
    out = {}
    for region in ("mekong", "red"):
        prov: dict = {}
        for r in rows:
            if r["delta"] != region or not (YEARS[0] <= int(r["year"]) <= YEARS[-1]):
                continue
            prov.setdefault(r["name"], {})[r["year"]] = [float(r["yield_t_ha"]) if r["yield_t_ha"] else None,
                                                      float(r["area_kha"]) if r["area_kha"] else None]
        # match today's outlines: Ha Noi absorbed Ha Tay in Aug 2008 (area-weighted yield before), and Can Tho included
        # Hau Giang until 2004 (no comparable value before)
        if region == "red":
            ht = prov.pop("Hà Tây")
            for y, (yv, av) in ht.items():
                y0, a0 = prov["Hà Nội"][y]
                prov["Hà Nội"][y] = [round((y0 * a0 + yv * av) / (a0 + av), 3), round(a0 + av, 2)]
        else:
            for y in [k for k in prov["Cần Thơ"] if int(k) < 2004]:
                prov["Cần Thơ"][y] = [None, None]
        out[region] = {"official": prov}
    write(out)
    d = json.loads(OUT.read_text("utf-8"))
    d["official_source"] = ("NSO (Cuc Thong ke) PX-Web, tables V06.16-V06.18 'Lua dong xuan phan theo dia phuong', "
                            "https://pxweb.nso.gov.vn/pxweb/vi/ (downloaded 2026-11-18; 2025 preliminary); yield per sown area, t/ha")
    OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")


PARTS = {"peaks": peaks, "late": late, "curves": curves, "official": official}

if __name__ == "__main__":
    init()
    for part in sys.argv[1:] or list(PARTS):
        PARTS[part]()
