"""Chapter 3 (landcover): ESA WorldCover, Google Dynamic World and Esri/Impact Observatory LULC, all for 2021.

    python scripts/data/export_landcover.py [asset|layers|sites|stats|series]   (no argument = all)

asset  : the three maps harmonised to 7 shared classes, 10 m, one EE asset per delta (computing the Dynamic World
         yearly mode on the fly over a whole delta times out). Written once, reused by the other parts.
layers : lc-agree-{red,mekong} (which products call a cell cropland, 250 m), lc-cropfrac-{red,mekong} (cropland share
         of each ~250 m cell in each product, 3 steps).
sites  : lc3-{bentre,namdinh} (the three harmonised maps at 10 m, 3 steps).
stats  : landcover-stats.json: class areas per product and delta (10 m), crop-agreement areas, pairwise agreement.
series : Esri cropland / trees / built-up area per year 2017-2025 (30 m), into landcover-stats.json.
"""
import json
import sys
import time

import ee

from layerkit import DATA, REGIONS, export_layer, init, region_geom, region_outline

YEAR = 2021
ASSET = "projects/claudev1-503808/assets/rs_agri_lc3_2021_{}"
PRODUCTS = ["WorldCover", "Dynamic World", "Esri"]
BANDS = ["wc", "dw", "esri"]
SITES = ["bentre", "namdinh"]
OUT = DATA / "landcover-stats.json"
STRIPS = {"red": 2, "mekong": 6}  # latitude strips for the 10 m statistics
ESRI = "projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS"
# shared classes: 1 water, 2 trees (incl. WorldCover mangroves), 3 crops, 4 built-up, 5 grass / shrub / rangeland,
# 6 flooded vegetation / herbaceous wetland, 7 bare; 0 = snow / cloud / no data
CLASSES = [
    (1, "#419bdf", "Mặt nước", "Water"), (2, "#397d49", "Cây gỗ", "Trees"), (3, "#e49635", "Cây trồng", "Crops"),
    (4, "#c4281b", "Xây dựng", "Built-up"), (5, "#e3e2c3", "Cỏ, cây bụi", "Grass / shrub"),
    (6, "#7a87c6", "Thực vật ngập nước", "Flooded vegetation"), (7, "#a59b8f", "Đất trống", "Bare"),
]
REMAP = {  # source code -> shared class
    "wc": ([10, 20, 30, 40, 50, 60, 80, 90, 95, 100], [2, 5, 5, 3, 4, 7, 1, 6, 2, 5]),
    "dw": ([0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 5, 6, 3, 5, 4, 7]),
    "esri": ([1, 2, 4, 5, 7, 8, 11], [1, 2, 6, 3, 4, 7, 5]),
}
# crop agreement code = WorldCover crop x1 + Dynamic World crop x2 + Esri crop x4
AGREE = [
    (0, "#f2f2f2", "Không sản phẩm nào", "None"), (1, "#e69f00", "Chỉ WorldCover", "WorldCover only"),
    (2, "#56b4e9", "Chỉ Dynamic World", "Dynamic World only"), (3, "#0072b2", "WorldCover + Dynamic World", "WorldCover + Dynamic World"),
    (4, "#cc79a7", "Chỉ Esri", "Esri only"), (5, "#d55e00", "WorldCover + Esri", "WorldCover + Esri"),
    (6, "#7b3294", "Dynamic World + Esri", "Dynamic World + Esri"), (7, "#009e73", "Cả ba", "All three"),
]
ATTR = ("ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022); Dynamic World V1 (Brown et al. 2022); Esri 10 m Annual "
        "Land Use Land Cover, Impact Observatory (Karra et al. 2021); all CC BY 4.0; contains modified Copernicus "
        "Sentinel data")


def harmonised(geom: ee.Geometry) -> ee.Image:
    """wc, dw, esri bands of shared class codes (0 = no data) for YEAR."""
    wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    dw = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(geom)
          .filterDate(f"{YEAR}-01-01", f"{YEAR + 1}-01-01").select("label").mode())
    esri = ee.ImageCollection(ESRI).filterBounds(geom).filterDate(f"{YEAR}-01-01", f"{YEAR + 1}-01-01").mosaic()
    out = [img.remap(*REMAP[b], 0).rename(b) for img, b in ((wc, "wc"), (dw, "dw"), (esri, "esri"))]
    return ee.Image.cat(out).toUint8()


def asset(region: str) -> ee.Image:
    aid = ASSET.format(region)
    try:
        ee.data.getAsset(aid)
        return ee.Image(aid)
    except ee.EEException:
        pass
    geom = region_geom(region)
    proj = ee.ImageCollection("ESA/WorldCover/v200").first().projection().getInfo()
    task = ee.batch.Export.image.toAsset(harmonised(geom), description=f"rs_agri_lc3_{region}", assetId=aid,
                                         region=geom, crs=proj["crs"], crsTransform=proj["transform"],
                                         maxPixels=1e11, pyramidingPolicy={".default": "mode"})
    task.start()
    while (st := task.status()["state"]) in ("READY", "RUNNING"):
        print(f"  {region} asset export", st, end=chr(13), flush=True)
        time.sleep(30)
    if st != "COMPLETED":
        raise RuntimeError(f"{aid} export {st}: {task.status().get('error_message')}")
    print()
    return ee.Image(aid)


def agree_code(a: ee.Image) -> ee.Image:
    c = a.eq(3)
    return c.select("wc").add(c.select("dw").multiply(2)).add(c.select("esri").multiply(4)).updateMask(a.reduce(ee.Reducer.min()).gt(0))


def layers(regions: tuple = ("red", "mekong")) -> None:
    classes = [{"v": v, "color": c, "label": {"vi": vi, "en": en}} for v, c, vi, en in AGREE]
    for region in regions:
        a = asset(region)
        proj = a.projection()
        code = agree_code(a).setDefaultProjection(proj).reduceResolution(ee.Reducer.mode(), maxPixels=1024)
        export_layer(
            f"lc-agree-{region}", code, region, 250, times=[str(YEAR)], dtype="uint8", scale=1, nodata=255,
            max_rows=48, kind="classes", classes=classes, units=None,
            title={"vi": "Sản phẩm nào gọi là đất trồng trọt (2021)", "en": "Which products call it cropland (2021)"},
            provenance={"source": "ESA/WorldCover/v200, GOOGLE/DYNAMICWORLD/V1 (mode of 2021 labels), " + ESRI + " (2021)",
                        "processing": "10 m: cropland flag of each product (WorldCover 40, Dynamic World 4, Esri 5) "
                                      "-> code WC x1 + DW x2 + Esri x4; most frequent code in each ~250 m cell",
                        "attribution": ATTR})
        frac = a.eq(3).multiply(100).updateMask(a.gt(0)).setDefaultProjection(proj).reduceResolution(ee.Reducer.mean(), maxPixels=1024)
        export_layer(
            f"lc-cropfrac-{region}", frac, region, 250, times=PRODUCTS, dtype="uint8", scale=1, nodata=255,
            max_rows=48, palette="viridis", range_=[0, 100], units={"vi": "%", "en": "%"},
            title={"vi": "Tỉ lệ đất trồng trọt trong ô (2021)", "en": "Cropland share of the cell (2021)"},
            provenance={"source": "same as lc-agree", "processing": "share of 10 m cells labelled cropland in each "
                        "~250 m cell, per product (steps: WorldCover, Dynamic World, Esri)", "attribution": ATTR})


def sites() -> None:
    classes = [{"v": v, "color": c, "label": {"vi": vi, "en": en}} for v, c, vi, en in CLASSES]
    for site in SITES:
        export_layer(
            f"lc3-{site}", harmonised(region_geom(site)), site, 10, times=PRODUCTS, dtype="uint8", scale=1, nodata=0,
            kind="classes", classes=classes, units=None,
            title={"vi": "Ba bản đồ lớp phủ 2021, cùng chú giải", "en": "Three 2021 land cover maps, shared legend"},
            provenance={"source": "ESA/WorldCover/v200, GOOGLE/DYNAMICWORLD/V1 (mode of 2021 labels), " + ESRI + " (2021)",
                        "processing": "each product remapped to 7 shared classes (WorldCover mangroves -> trees, "
                                      "shrub + grass + rangeland -> grass / shrub)", "attribution": ATTR})


def ha_by(img: ee.Image, geom: ee.Geometry, scale: float, proj=None) -> dict:
    kw = dict(crs=proj, scale=scale) if proj else dict(scale=scale)
    r = ee.Image.pixelArea().addBands(img).reduceRegion(
        ee.Reducer.sum().group(groupField=1, groupName="c"), geom, maxPixels=1e11, tileScale=16, **kw)
    return r


def stats(regions: tuple = ("red", "mekong")) -> None:
    d = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {}
    d["classes"] = {str(v): {"vi": vi, "en": en} for v, _, vi, en in CLASSES}
    d["agree_classes"] = {str(v): {"vi": vi, "en": en} for v, _, vi, en in AGREE}
    d["year"] = YEAR
    for region in regions:
        a = asset(region)
        proj = a.projection()
        valid = a.reduce(ee.Reducer.min()).gt(0)
        same = a.select("wc").eq(a.select("dw")).addBands(a.select("wc").eq(a.select("esri"))) \
            .addBands(a.select("dw").eq(a.select("esri"))).rename(["wc_dw", "wc_esri", "dw_esri"])
        pair_img = ee.Image.pixelArea().multiply(same).addBands(ee.Image.pixelArea().rename("all")).updateMask(valid)
        ha = {k: {} for k in BANDS + ["agree"]}
        pair = {}
        # 10 m sums over a whole delta time out: sum over latitude strips (sums are additive)
        lon0, lat0, lon1, lat1 = REGIONS[region]["bbox"]
        n = STRIPS[region]
        for k in range(n):
            g = region_outline(region).intersection(
                ee.Geometry.Rectangle([lon0 - 1, lat0 + (lat1 - lat0) * k / n, lon1 + 1, lat0 + (lat1 - lat0) * (k + 1) / n]), 100)
            req = {b: ha_by(a.select(b), g, 10, proj) for b in BANDS}
            req["agree"] = ha_by(agree_code(a), g, 10, proj)
            req["pair"] = pair_img.reduceRegion(ee.Reducer.sum(), g, crs=proj, scale=10, maxPixels=1e11, tileScale=16)
            res = {key: v.getInfo() for key, v in req.items()}
            for key in BANDS + ["agree"]:
                for x in res[key]["groups"]:
                    c = str(int(x["c"]))
                    ha[key][c] = ha[key].get(c, 0) + x["sum"] / 1e4
            for key, v in res["pair"].items():
                pair[key] = pair.get(key, 0) + (v or 0)
            print(f"  {region} strip {k + 1}/{n}", flush=True)
        rd = d.setdefault(region, {})
        rd["ha"] = {b: {c: round(v) for c, v in sorted(ha[b].items(), key=lambda t: int(t[0]))} for b in BANDS}
        rd["agree_ha"] = {c: round(v) for c, v in sorted(ha["agree"].items(), key=lambda t: int(t[0]))}
        rd["pair_agreement"] = {k: round(100 * pair[k] / pair["all"], 1) for k in ("wc_dw", "wc_esri", "dw_esri")}
        print(region, json.dumps(rd, ensure_ascii=False))
    OUT.write_text(json.dumps(d, ensure_ascii=False, indent=1), "utf-8", newline="\n")


def series(regions: tuple = ("red", "mekong")) -> None:
    d = json.loads(OUT.read_text("utf-8"))
    years = list(range(2017, 2026))
    for region in regions:
        g = region_outline(region)
        col = ee.ImageCollection(ESRI).filterBounds(g)
        req = {}
        for y in years:
            img = col.filterDate(f"{y}-01-01", f"{y + 1}-01-01").mosaic().remap(*REMAP["esri"], 0)
            req[str(y)] = ha_by(img, g, 30)
        res = {k: v.getInfo() for k, v in req.items()}
        d.setdefault(region, {})["esri_series"] = {y: {str(int(x["c"])): round(x["sum"] / 1e4) for x in res[y]["groups"]} for y in res}
        print(region, {y: d[region]["esri_series"][y].get("3") for y in d[region]["esri_series"]})
    OUT.write_text(json.dumps(d, ensure_ascii=False, indent=1), "utf-8", newline="\n")


PARTS = {"asset": lambda: [asset(r) for r in ("red", "mekong")], "layers": layers, "sites": sites, "stats": stats,
         "series": series}

if __name__ == "__main__":
    init()
    for part in sys.argv[1:] or list(PARTS):
        PARTS[part]()
