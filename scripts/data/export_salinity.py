"""Layers for the Salinity chapter (10). Run from the repo root, WITHOUT -I; pick parts by name:

    python scripts/data/export_salinity.py anomaly   # sal-evianom-mekong: Feb-Apr mean EVI of 2016, 2020, 2024 minus the 2010-2024 median, 250 m
    python scripts/data/export_salinity.py indices   # sal-ndvi-bentre-2024, sal-si-bentre-2024: Sentinel-2 Feb-Apr 2024 median, 10 m
    python scripts/data/export_salinity.py landuse   # dw-{bentre,camau}: Dynamic World most frequent label 2018 and 2024, 10 m

The EVI anomaly is not a salinity measurement: drought, sowing dates shifted to dodge salinity, fallowing and land-use
change all move it. The chapter says so.
"""
import sys

import ee

from layerkit import export_layer, init, region_geom

COLS = ["MODIS/061/MOD13Q1", "MODIS/061/MYD13Q1"]
BASE_YEARS = range(2010, 2025)
EVENT_YEARS = (2016, 2020, 2024)
DRY = (2, 4)  # Feb .. Apr: peak salinity intrusion
DW_YEARS = (2018, 2024)  # 2016-17: Sentinel-2A only, ~2 clear labels a year at Ca Mau -> holes
DW_CLASSES = [  # Dynamic World V1 labels with the dataset's own palette
    (0, "#419bdf", "Nước", "Water"), (1, "#397d49", "Cây gỗ", "Trees"), (2, "#88b053", "Cỏ", "Grass"),
    (3, "#7a87c6", "Thực vật ngập nước", "Flooded vegetation"), (4, "#e49635", "Cây trồng", "Crops"),
    (5, "#dfc35a", "Cây bụi", "Shrub & scrub"), (6, "#c4281b", "Xây dựng", "Built area"),
    (7, "#a59b8f", "Đất trống", "Bare ground")]  # 8 snow & ice: absent here


def dry_evi(year: int) -> ee.Image:
    m0, m1 = DRY
    start, end = ee.Date.fromYMD(year, m0, 1), ee.Date.fromYMD(year, m1 + 1, 1)
    col = ee.ImageCollection(COLS[0]).merge(ee.ImageCollection(COLS[1])).filterDate(start, end)
    return col.map(lambda im: im.select("EVI").multiply(0.0001).updateMask(im.select("SummaryQA").lte(1))).mean()


def anomaly() -> None:
    proj = ee.ImageCollection(COLS[0]).first().select("EVI").projection()
    base = ee.ImageCollection([dry_evi(y) for y in BASE_YEARS]).median()
    img = ee.Image.cat([dry_evi(y).subtract(base) for y in EVENT_YEARS]).setDefaultProjection(proj)
    export_layer(
        "sal-evianom-mekong", img, "mekong", 250, times=[str(y) for y in EVENT_YEARS],
        dtype="uint8", scale=0.002, offset=-0.254, nodata=255,  # -0.254 .. +0.254, code 127 = 0
        title={"vi": "Dị thường EVI mùa khô (tháng 2–4)", "en": "Dry-season EVI anomaly (Feb–Apr)"},
        units={"vi": "EVI", "en": "EVI"}, palette="brbg", range_=[-0.2, 0.2],
        provenance={"source": f"{' + '.join(COLS)} band EVI x 0.0001, SummaryQA <= 1",
                    "processing": "mean of the Feb-Apr composites of the year minus the median of the 2010-2024 "
                                  "Feb-Apr means; MODIS 250 m nearest-resampled to the ~250 m Web Mercator grid",
                    "attribution": "MODIS MOD13Q1/MYD13Q1 v061, NASA LP DAAC"})


def s2_dry(site: str, year: int) -> ee.Image:
    geom = region_geom(site)
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geom)
           .filterDate(f"{year}-{DRY[0]:02d}-01", f"{year}-{DRY[1] + 1:02d}-01").linkCollection(cs, ["cs_cdf"]))
    print(site, year, "S2 scenes:", col.size().getInfo())
    good = col.map(lambda im: im.select(["B2", "B3", "B4", "B8"]).divide(10000).updateMask(im.select("cs_cdf").gte(0.6)))
    return good.median().setDefaultProjection(col.first().select("B4").projection())


def indices() -> None:
    site, year = "bentre", 2024
    s2 = s2_dry(site, year)
    prov = {"source": "COPERNICUS/S2_SR_HARMONIZED, Cloud Score+ cs_cdf >= 0.6, median of Feb-Apr 2024",
            "attribution": "Contains modified Copernicus Sentinel data 2024"}
    export_layer(
        f"sal-ndvi-{site}-{year}", s2.normalizedDifference(["B8", "B4"]), site, 10, times=[f"{year}-02/04"],
        dtype="uint8", scale=0.008, offset=-1.0, nodata=255,
        title={"vi": "NDVI mùa khô 2024 (Sentinel-2)", "en": "Dry-season NDVI 2024 (Sentinel-2)"},
        units={"vi": "NDVI", "en": "NDVI"}, palette="evi", range_=[-0.2, 0.9],
        provenance={**prov, "processing": "(B8 - B4) / (B8 + B4); NDSI = (B4 - B8) / (B4 + B8) is exactly -NDVI"})
    export_layer(
        f"sal-si-{site}-{year}", s2.select("B2").multiply(s2.select("B4")).sqrt(), site, 10, times=[f"{year}-02/04"],
        dtype="uint8", scale=0.001, nodata=255,
        title={"vi": "Chỉ số mặn SI = √(B·R), mùa khô 2024", "en": "Salinity index SI = √(B·R), dry season 2024"},
        units={"vi": "phản xạ", "en": "reflectance"}, palette="ylorrd", range_=[0, 0.15],
        provenance={**prov, "processing": "SI = sqrt(B2 x B4) on surface reflectance (Khan et al. 2001)"})


def landuse() -> None:
    classes = [{"v": v, "color": c, "label": {"vi": vi, "en": en}} for v, c, vi, en in DW_CLASSES]
    for site in ("bentre", "camau"):
        geom = region_geom(site)
        dw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(geom)
        proj = dw.first().select("label").projection()
        img = ee.Image.cat([dw.filterDate(f"{y}-01-01", f"{y + 1}-01-01").select("label").mode() for y in DW_YEARS])
        export_layer(
            f"dw-{site}", img.setDefaultProjection(proj), site, 10, times=[str(y) for y in DW_YEARS],
            dtype="uint8", scale=1, nodata=255, kind="classes", classes=classes,
            title={"vi": "Lớp phủ Dynamic World (nhãn thường gặp nhất trong năm)",
                   "en": "Dynamic World land cover (most frequent label of the year)"},
            units=None,
            provenance={"source": "GOOGLE/DYNAMICWORLD/V1 band label (Sentinel-2 based, near real time)",
                        "processing": "per-pixel mode of all labels in the calendar year; shrimp ponds appear as water",
                        "attribution": "Dynamic World (Brown et al. 2022, Scientific Data 9:251), CC BY 4.0; "
                                       "contains modified Copernicus Sentinel data"})


PARTS = {"anomaly": anomaly, "indices": indices, "landuse": landuse}

if __name__ == "__main__":
    init()
    for part in sys.argv[1:] or list(PARTS):
        PARTS[part]()
