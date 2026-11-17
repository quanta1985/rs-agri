"""Chapter 12 (coast): shoreline change, mangroves, dry-season ponds from Landsat, GMW and the GSO-region outlines.

    python scripts/data/export_coast.py [shore|mangrove|ponds|series]   (no argument = all)

Writes coast-change-{ndcoast,cmcoast} (30 m, land/water 1988-92 vs 2021-25), mangrove-change-{ndcoast,cmcoast}
(GMW v3 1996 vs 2020), ponds-dry-mekong (share of each 250 m cell under water in >= 75 % of clear Jan-Apr Landsat
looks, three periods) and coast-series.json (yearly land area per coastal stretch, GMW mangrove area, pond area per
province).

Water = MNDWI > 0 on Landsat 5/7/8/9 Collection 2 L2 surface reflectance (fill, cloud, shadow, cirrus masked). Tide:
Landsat passes at ~10:00 local time at random tide stages, so "water in >= 50 % of the looks" is a median-tide
shoreline; mud flats that dry at low tide sit near that line and move it by tens of metres.
"""
import json
import math
import sys

import ee
import numpy as np

from layerkit import DATA, grid, init, pfetch_raw, region_outline, write_layer
from export_flood import cell_ha, province_grid

sys.stdout.reconfigure(encoding="utf-8")
FRAMES = ("ndcoast", "cmcoast")
EPOCHS = ((1988, 1992), (2021, 2025))
POND_EPOCHS = ((1993, 1997), (2003, 2007), (2021, 2025))
MIN_LOOKS = 5
LS_ATTR = "Landsat 5/7/8/9 Collection 2 Level-2 courtesy of the U.S. Geological Survey"
GMW = "projects/sat-io/open-datasets/GMW/extent/GMW_V3"
GMW_ATTR = "Global Mangrove Watch v3.0 (Bunting et al. 2022), CC BY 4.0"
UTM48 = ("EPSG:32648", 30)  # both deltas lie in UTM zone 48N
SHORE_CLASSES = [
    {"v": 1, "color": "#56B4E9", "label": {"vi": "Nước cả hai thời kỳ", "en": "Water in both periods"}},
    {"v": 2, "color": "#D55E00", "label": {"vi": "Đất → nước (bờ xói, ao mới)", "en": "Land → water (eroded shore, new ponds)"}},
    {"v": 3, "color": "#009E73", "label": {"vi": "Nước → đất (bãi bồi, ao lấp)", "en": "Water → land (new land, filled ponds)"}},
]
MANGROVE_CLASSES = [
    {"v": 1, "color": "#009E73", "label": {"vi": "Rừng ngập mặn 1996 và 2020", "en": "Mangrove in 1996 and 2020"}},
    {"v": 2, "color": "#D55E00", "label": {"vi": "Mất sau 1996", "en": "Lost since 1996"}},
    {"v": 3, "color": "#F0E442", "label": {"vi": "Mới từ 1996", "en": "New since 1996"}},
]
# Coastal stretches for the yearly land-area series, picked on the coast-change maps. "line": the 1988-92 shoreline
# traced by hand (lon, lat), buffered by BUF metres on both sides so inland pond changes stay out; "box": a rectangle
# (lon0, lat0, lon1, lat1) around river-mouth islands. Land change / line length = mean shoreline shift.
BUF = 1500
STRETCHES = {
    "hai_hau": ("line", [[106.20, 20.006], [106.25, 20.058], [106.30, 20.117], [106.35, 20.177]],
                "Hải Hậu (Thịnh Long – Hải Lý)", "Hai Hau (Thinh Long – Hai Ly)"),
    "giao_thuy": ("line", [[106.36, 20.18], [106.40, 20.21], [106.46, 20.225]],
                  "Giao Thủy (Quất Lâm – Giao Phong)", "Giao Thuy (Quat Lam – Giao Phong)"),
    "ba_lat": ("box", [106.47, 20.17, 106.62, 20.27], "Cửa Ba Lạt (Cồn Lu, Cồn Ngạn)", "Ba Lat mouth (Con Lu, Con Ngan)"),
    "camau_east": ("line", [[104.86, 8.565], [105.00, 8.592], [105.12, 8.655], [105.165, 8.705], [105.21, 8.75],
                            [105.30, 8.808], [105.35, 8.88]], "Bờ Biển Đông (Đất Mũi – Rạch Gốc)",
                   "East Sea coast (Dat Mui – Rach Goc)"),
    "camau_cape": ("box", [104.70, 8.60, 104.83, 8.80], "Mũi Cà Mau (bờ vịnh Thái Lan)", "Ca Mau Cape (Gulf of Thailand side)"),
}


def stretch_geom(kind: str, coords: list) -> ee.Geometry:
    return ee.Geometry.LineString(coords).buffer(BUF) if kind == "line" else ee.Geometry.Rectangle(coords)


def line_km(coords: list) -> float:
    r = 6371.0
    return sum(2 * r * math.asin(math.sqrt(math.sin(math.radians(b[1] - a[1]) / 2) ** 2 + math.cos(math.radians(a[1]))
               * math.cos(math.radians(b[1])) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2)) for a, b in zip(coords, coords[1:]))


def _prep(img: ee.Image, green: str, swir: str) -> ee.Image:
    qa = img.select("QA_PIXEL")
    ok = qa.bitwiseAnd(0b11111).eq(0)  # fill, dilated cloud, cirrus, cloud, shadow
    g = img.select(green).multiply(0.0000275).add(-0.2)
    s = img.select(swir).multiply(0.0000275).add(-0.2)
    return g.subtract(s).divide(g.add(s)).gt(0).rename("w").updateMask(ok).copyProperties(img, ["system:time_start"])


def landsat_water(y0: int, y1: int, geom: ee.Geometry, months: tuple[int, int] | None = None) -> ee.ImageCollection:
    """Per-look water masks (1 water, 0 land, masked = cloud/fill), years y0..y1, optional calendar months."""
    spec = [("LANDSAT/LT05/C02/T1_L2", "SR_B2", "SR_B5"), ("LANDSAT/LE07/C02/T1_L2", "SR_B2", "SR_B5"),
            ("LANDSAT/LC08/C02/T1_L2", "SR_B3", "SR_B6"), ("LANDSAT/LC09/C02/T1_L2", "SR_B3", "SR_B6")]
    out = None
    for cid, g, s in spec:
        c = ee.ImageCollection(cid).filterDate(f"{y0}-01-01", f"{y1 + 1}-01-01").filterBounds(geom)
        if months:
            c = c.filter(ee.Filter.calendarRange(months[0], months[1], "month"))
        c = c.map(lambda i, g=g, s=s: _prep(i, g, s))
        out = c if out is None else out.merge(c)
    return out


def freq(y0: int, y1: int, geom: ee.Geometry, months=None) -> tuple[ee.Image, ee.Image]:
    col = landsat_water(y0, y1, geom, months)
    proj = ee.Projection(UTM48[0]).atScale(UTM48[1])
    return col.mean().setDefaultProjection(proj), col.count().setDefaultProjection(proj)


def frame_geom(frame: str) -> ee.Geometry:
    g = grid(frame, 30)
    x0, y1 = g["origin"]
    return ee.Geometry.Rectangle([x0, y1 - g["height"] * g["res"], x0 + g["width"] * g["res"], y1],
                                 "EPSG:3857", False).transform("EPSG:4326", 1)


def pexport(layer_id: str, img: ee.Image, region: str, res: float, *, times: list[str], dtype: str, scale: float,
            nodata: int, clip: bool, offset: float = 0.0, **kw) -> None:
    """export_layer with parallel row requests (multi-year Landsat stacks take minutes per request)."""
    raw, clipped = pfetch_raw(img, region, res, dtype=dtype, scale=scale, offset=offset, nodata=nodata, clip=clip)
    write_layer(layer_id, raw, region, res, times=times, dtype=dtype, scale=scale, offset=offset, nodata=nodata,
                clipped=clipped, **kw)


def shore() -> None:
    for frame in FRAMES:
        geom = frame_geom(frame)
        (f1, n1), (f2, n2) = (freq(a, b, geom) for a, b in EPOCHS)
        w1, w2 = f1.gte(0.5), f2.gte(0.5)
        cls = (w1.And(w2).multiply(1).add(w1.Not().And(w2).multiply(2)).add(w1.And(w2.Not()).multiply(3))
               .updateMask(n1.gte(MIN_LOOKS).And(n2.gte(MIN_LOOKS))))
        p = f"{EPOCHS[0][0]}-{EPOCHS[0][1] % 100:02d}", f"{EPOCHS[1][0]}-{EPOCHS[1][1] % 100:02d}"
        pexport(f"coast-change-{frame}", cls, frame, 30, times=[f"{p[0]} → {p[1]}"], dtype="uint8", scale=1,
                     nodata=255, clip=False, kind="classes", classes=SHORE_CLASSES, units=None,
                     title={"vi": "Đất và nước 1988–92 so với 2021–25", "en": "Land and water, 1988–92 against 2021–25"},
                     provenance={"source": "Landsat 5/7/8/9 C2 L2, all months, MNDWI = (green - SWIR1) / (green + SWIR1)",
                                 "processing": f"water = MNDWI > 0 in >= 50 % of clear looks of each period "
                                               f"({p[0]}, {p[1]}); cells with < {MIN_LOOKS} clear looks in either "
                                               "period left out; land in both periods transparent",
                                 "attribution": LS_ATTR})


def gmw(year: int) -> ee.Image:
    return ee.ImageCollection(GMW).filter(ee.Filter.eq("system:index", f"gmw_v3_{year}")).first().select("b1").gt(0) \
        .unmask(0)


def mangrove() -> None:
    a, b = gmw(1996), gmw(2020)
    cls = a.And(b).multiply(1).add(a.And(b.Not()).multiply(2)).add(a.Not().And(b).multiply(3)).selfMask()
    for frame in FRAMES:
        pexport(f"mangrove-change-{frame}", cls, frame, 30, times=["1996 → 2020"], dtype="uint8", scale=1,
                     nodata=255, clip=False, kind="classes", classes=MANGROVE_CLASSES, units=None,
                     title={"vi": "Rừng ngập mặn GMW 1996 và 2020", "en": "GMW mangroves 1996 and 2020"},
                     provenance={"source": f"{GMW} (25 m, ALOS PALSAR + Landsat), epochs 1996 and 2020",
                                 "processing": "nearest 25 m cell on the 30 m Mercator grid", "attribution": GMW_ATTR})


def ponds() -> None:
    region = "mekong"
    geom = region_outline(region)
    bands, looks = [], []
    for a, b in POND_EPOCHS:
        f, n = freq(a, b, geom, (1, 4))
        bands.append(f.gte(0.75).updateMask(n.gte(MIN_LOOKS)).multiply(100)
                     .reduceResolution(ee.Reducer.mean(), maxPixels=1024))
    times = [f"{a}–{b % 100:02d}" for a, b in POND_EPOCHS]
    enc = {"dtype": "uint8", "scale": 0.5, "offset": 0.0, "nodata": 255}
    raw, clipped = pfetch_raw(ee.Image.cat(bands), region, 250, rows=8, **enc)
    write_layer("ponds-dry-mekong", raw, region, 250, times=times, **enc, clipped=clipped,
                title={"vi": "Mặt nước quanh năm mùa khô (ao tôm, sông, kênh)",
                       "en": "Standing water through the dry season (shrimp ponds, rivers, canals)"},
                units={"vi": "% diện tích ô", "en": "% of the cell"}, palette="water", range_=[0, 100],
                provenance={"source": "Landsat 5/7/8/9 C2 L2, January-April of each period",
                            "processing": "share of 30 m cells under water (MNDWI > 0) in >= 75 % of their clear "
                                          f"Jan-Apr looks (>= {MIN_LOOKS} looks), per ~250 m cell",
                            "attribution": LS_ATTR})
    prov, names = province_grid(region)
    ha = cell_ha(region)
    v = np.where(raw == 255, np.nan, raw * 0.5) / 100 * ha
    out = {"periods": times, "region_ha": [round(float(np.nansum(f[prov > 0]))) for f in v],
           "valid_share": [round(float((~np.isnan(f) & (prov > 0)).sum() / (prov > 0).sum()), 3) for f in v],
           "provinces": {n: [round(float(np.nansum(f[prov == k + 1]))) for f in v] for k, n in enumerate(names)}}
    _merge_series({"ponds": out})


def _merge_series(part: dict) -> None:
    f = DATA / "coast-series.json"
    d = json.loads(f.read_text("utf-8")) if f.exists() else {}
    d.update(part)
    f.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")
    print("updated coast-series.json:", list(part))


def series() -> None:
    """Yearly land area per stretch (water in < 50 % of the year's clear looks) and GMW area per epoch."""
    years = list(range(1988, 2026))
    land = {}
    ha = ee.Image.pixelArea().divide(1e4)
    for k, (kind, coords, vi, en) in STRETCHES.items():
        geom = stretch_geom(kind, coords)
        bands = []
        for y in years:
            f, n = freq(y, y, geom)
            ok = n.gte(3)
            bands += [ha.updateMask(f.lt(0.5).And(ok)).rename(f"l{y}"), ha.updateMask(ok).rename(f"v{y}")]
        r = ee.Image.cat(bands + [ha.rename("area")]).reduceRegion(ee.Reducer.sum(), geom, 30, maxPixels=1e10,
                                                                   tileScale=8).getInfo()
        row = [[round(r.get(f"l{y}") or 0), round(r.get(f"v{y}") or 0)] for y in years]
        land[k] = {"kind": kind, "coords": coords, "name": {"vi": vi, "en": en}, "area_ha": round(r["area"]),
                   "length_km": round(line_km(coords), 1) if kind == "line" else None, "land_valid_ha": row}
        print(k, [x[0] for x in row], flush=True)
    gyears = [1996, 2007, 2008, 2009, 2010, 2015, 2016, 2017, 2018, 2019, 2020]
    geoms = {"red": region_outline("red"), "mekong": region_outline("mekong"),
             **{f: frame_geom(f) for f in FRAMES}}
    mg = {}
    for k, geom in geoms.items():
        imgs = ee.Image.cat([ee.Image.pixelArea().divide(1e4).updateMask(gmw(y)).rename(f"y{y}") for y in gyears])
        r = imgs.reduceRegion(ee.Reducer.sum(), geom, 25, maxPixels=1e11, tileScale=8).getInfo()
        mg[k] = [round(r[f"y{y}"]) for y in gyears]
        print("mangrove", k, mg[k], flush=True)
    _merge_series({"years": years, "land": land, "mangrove": {"years": gyears, "ha": mg},
                   "provenance": {"land": f"{LS_ATTR}; stretches = {BUF} m buffers of hand-traced 1988-92 shorelines "
                                          "(line) or rectangles (box); land = water in < 50 % of the year's clear looks, years "
                                          "with < 3 looks per cell count as not valid (valid_ha)",
                                  "mangrove": GMW_ATTR, "ponds": f"{LS_ATTR}; provinces = geoBoundaries ADM1 (2008)"}})


if __name__ == "__main__":
    init()
    for part in sys.argv[1:] or ["shore", "mangrove", "ponds", "series"]:
        {"shore": shore, "mangrove": mangrove, "ponds": ponds, "series": series}[part]()
