"""Rice at the 10 m sites An Giang (3 seasons) and Nam Dinh (2 seasons). Run from the repo root, WITHOUT -I:

    python scripts/data/export_rice_site.py

1. rice-dvh-<site>: seasonal range of Sentinel-1 VH, p90 - p10 of the season's acquisitions (one relative orbit,
   3x3 focal mean in linear power against speckle, then dB). Rice goes from flooded (VH about -22 dB) to a full
   canopy (about -14 dB), so its range is large; orchards, towns and permanent water stay flat. Threshold it in
   ThresholdLab (above).
2. rice-series-<site>.json: Sentinel-2 NDVI / EVI / LSWI and Sentinel-1 VH / VV over one 500 m x 500 m box, Sep 2023 -
   Dec 2024. The box is the 50 x 50 pixel window with the highest mean seasonal VH range (a large uniform rice
   block), chosen automatically from layer 1. S2 dates kept when >= 80 % of the box is clear (Cloud Score+ >= 0.6).
"""
import gzip
import json
import math
from datetime import datetime, timezone

import ee
import numpy as np

from layerkit import DATA, export_layer, grid, init, region_geom, to_values

SITES = {
    "angiang": {"orbit": 26, "season": ("2023-11-01", "2024-04-01"), "label": "Đông Xuân 2023–24 / winter-spring 2023-24"},
    "namdinh": {"orbit": 91, "season": ("2024-01-15", "2024-07-01"), "label": "Xuân 2024 / spring 2024"},
}
SERIES = ("2023-09-01", "2025-01-01")
BOX = 50  # pixels of 10 m
NL = "\n"


def db_to_lin(img: ee.Image) -> ee.Image:
    """10^(dB/10), keeping band names."""
    return img.multiply(math.log(10) / 10).exp()


def s1(site: str) -> ee.ImageCollection:
    return (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(region_geom(site))
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.eq("relativeOrbitNumber_start", SITES[site]["orbit"]))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH")))


def dvh(site: str) -> dict:
    col = s1(site).filterDate(*SITES[site]["season"])
    n = col.size().getInfo()
    lin = col.map(lambda im: db_to_lin(im.select("VH")).focalMean(1, "square", "pixels"))
    pc = lin.reduce(ee.Reducer.percentile([10, 90]))
    rng = pc.select("VH_p90").log10().subtract(pc.select("VH_p10").log10()).multiply(10)
    meta = export_layer(
        f"rice-dvh-{site}", rng.setDefaultProjection(col.first().select("VH").projection()), site, 10,
        times=[SITES[site]["season"][0][:7] + "/" + SITES[site]["season"][1][:7]],
        dtype="uint8", scale=0.1, nodata=255,
        title={"vi": "Biên độ VH trong vụ (Sentinel-1)", "en": "Seasonal VH range (Sentinel-1)"},
        units={"vi": "dB", "en": "dB"}, palette="viridis", range_=[0, 15],
        provenance={"source": f"COPERNICUS/S1_GRD IW VH, relative orbit {SITES[site]['orbit']}, {n} acquisitions "
                              f"{SITES[site]['season'][0]} .. {SITES[site]['season'][1]} ({SITES[site]['label']})",
                    "processing": "3x3 focal mean in linear power, p90 - p10 over the season, in dB",
                    "attribution": "Contains modified Copernicus Sentinel data 2023-2024"})
    print(site, n, "S1 scenes")
    return meta


def best_box(meta: dict) -> list[float]:
    """Lon/lat rectangle of the BOX x BOX window with the highest mean range."""
    data = np.frombuffer(gzip.decompress((DATA / meta["id"] / "values.binz").read_bytes()), np.uint8)
    v = to_values(data.reshape(meta["height"], meta["width"]), meta["scale"], meta["offset"], meta["nodata"])
    v = np.nan_to_num(v, nan=0.0)
    c = np.cumsum(np.cumsum(np.pad(v, ((1, 0), (1, 0))), 0), 1)
    s = c[BOX:, BOX:] - c[:-BOX, BOX:] - c[BOX:, :-BOX] + c[:-BOX, :-BOX]
    r, k = np.unravel_index(np.argmax(s), s.shape)
    g = grid(meta["region"], 10)
    x0, y1 = g["origin"][0] + k * g["res"], g["origin"][1] - r * g["res"]
    x1, y0 = x0 + BOX * g["res"], y1 - BOX * g["res"]
    lon = lambda x: math.degrees(x / 6378137.0)  # noqa: E731
    lat = lambda y: math.degrees(2 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2)  # noqa: E731
    print(meta["region"], "box mean range", round(float(s[r, k]) / BOX**2, 2), "dB")
    return [round(lon(x0), 5), round(lat(y0), 5), round(lon(x1), 5), round(lat(y1), 5)]


def series(site: str, bbox: list[float]) -> None:
    box = ee.Geometry.Rectangle(bbox)
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(box).filterDate(*SERIES)
          .linkCollection(cs, ["cs_cdf"]))

    def s2_row(im: ee.Image) -> ee.Feature:
        r = im.select(["B2", "B4", "B8", "B11"]).divide(10000)
        b, red, nir, sw = (r.select(x) for x in ("B2", "B4", "B8", "B11"))
        idx = ee.Image.cat([
            nir.subtract(red).divide(nir.add(red)).rename("ndvi"),
            nir.subtract(red).multiply(2.5).divide(nir.add(red.multiply(6)).subtract(b.multiply(7.5)).add(1)).rename("evi"),
            nir.subtract(sw).divide(nir.add(sw)).rename("lswi")])
        ok = im.select("cs_cdf").gte(0.6)
        st = idx.updateMask(ok).reduceRegion(ee.Reducer.mean(), box, 10)
        clear = ok.reduceRegion(ee.Reducer.mean(), box, 10).get("cs_cdf")
        return ee.Feature(None, st.set("clear", clear).set("t", im.date().format("YYYY-MM-dd")))

    rows = s2.map(s2_row).filter(ee.Filter.gte("clear", 0.8)).getInfo()["features"]
    by_day: dict[str, dict] = {}
    for f in rows:  # one row per date (tiles overlap)
        p = f["properties"]
        by_day.setdefault(p["t"], {"d": p["t"], **{k: round(p[k], 3) for k in ("ndvi", "evi", "lswi")}, "clear": round(p["clear"], 2)})

    def s1_row(im: ee.Image) -> ee.Feature:
        lin = db_to_lin(im.select(["VH", "VV"]))
        m = lin.reduceRegion(ee.Reducer.mean(), box, 10)
        return ee.Feature(None, {"t": im.date().format("YYYY-MM-dd"), "VH": m.get("VH"), "VV": m.get("VV")})

    r1 = s1(site).filterDate(*SERIES).map(s1_row).getInfo()["features"]
    s1_rows = sorted(({"d": f["properties"]["t"], "vh": round(10 * math.log10(f["properties"]["VH"]), 2),
                       "vv": round(10 * math.log10(f["properties"]["VV"]), 2)} for f in r1), key=lambda x: x["d"])
    out = {"site": site, "bbox": bbox, "s2": sorted(by_day.values(), key=lambda x: x["d"]), "s1": s1_rows,
           "provenance": {
               "s2": "COPERNICUS/S2_SR_HARMONIZED, box mean of clear pixels (Cloud Score+ cs_cdf >= 0.6), dates with "
                     ">= 80 % of the box clear; EVI = 2.5 (N - R) / (N + 6R - 7.5B + 1), LSWI = (N - SWIR1) / (N + SWIR1)",
               "s1": f"COPERNICUS/S1_GRD IW, relative orbit {SITES[site]['orbit']}, box mean in linear power, then dB",
               "box": f"{BOX} x {BOX} pixels of 10 m with the highest mean seasonal VH range (layer rice-dvh-{site})",
               "attribution": "Contains modified Copernicus Sentinel data 2023-2024",
               "exported": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "script": "scripts/data/export_rice_site.py"}}
    (DATA / f"rice-series-{site}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8", newline=NL)
    print(site, "series:", len(out["s2"]), "S2 dates,", len(s1_rows), "S1 dates")


def main() -> None:
    init()
    for site in SITES:
        meta = dvh(site)
        series(site, best_box(meta))


if __name__ == "__main__":
    main()
