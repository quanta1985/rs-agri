"""Chapter 11 (soil-terrain): SoilGrids topsoil maps, DeltaDTM / Copernicus DEM elevation, hypsometry.

    python scripts/data/export_soil_terrain.py [soil|dem|hypso]   (no argument = all)

Writes soil-{ph,soc,clay}-{red,mekong}, dem-{dtm,cop,diff}-{red,mekong} (public/data/<id>/) and terrain-hypso.json
(area below each elevation, per delta and DEM, plus point values at named places).
"""
import json
import sys

import ee
import numpy as np

from layerkit import DATA, fetch_raw, init, region_outline, to_raw, to_values, write_layer

sys.stdout.reconfigure(encoding="utf-8")
SG = "projects/soilgrids-isric/{}_mean"
DTM = "projects/sat-io/open-datasets/DELTARES/deltadtm_v1"
COP = "COPERNICUS/DEM/GLO30_2024_1"
SG_ATTR = "SoilGrids 2.0 (Poggio et al. 2021, ISRIC), CC BY 4.0"
DTM_ATTR = ("DeltaDTM v1.0 (Pronk et al. 2024, Deltares), CC BY 4.0; produced using Copernicus WorldDEM-30 "
            "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the EU and ESA")
COP_ATTR = ("Copernicus DEM GLO-30 (2024_1): produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and "
            "© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA")
RES = 250
CAP = 10.0  # DeltaDTM is clipped at 10 m above mean sea level (EGM2008)
DEM_ENC = {"dtype": "uint16", "scale": 0.01, "offset": -5.0, "nodata": 65535}
# depth weights of the SoilGrids 0-5, 5-15, 15-30 cm layers for a 0-30 cm mean
DEPTHS = [("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15)]
# (prop, scale to physical units, layer encoding, palette, range, vi title, en title, units vi/en)
SOIL = [
    ("phh2o", 0.1, {"dtype": "uint8", "scale": 0.05, "offset": 3.0, "nodata": 255}, "brbg", [4.5, 7.5],
     "pH đất tầng mặt 0–30 cm (SoilGrids)", "Topsoil pH 0–30 cm (SoilGrids)", {"vi": "pH (H₂O)", "en": "pH (H₂O)"}),
    ("soc", 0.1, {"dtype": "uint8", "scale": 0.5, "offset": 0.0, "nodata": 255}, "viridis", [5, 40],
     "Cacbon hữu cơ đất 0–30 cm (SoilGrids)", "Soil organic carbon 0–30 cm (SoilGrids)", {"vi": "g/kg", "en": "g/kg"}),
    ("clay", 0.1, {"dtype": "uint8", "scale": 0.5, "offset": 0.0, "nodata": 255}, "ylorrd", [20, 60],
     "Hàm lượng sét 0–30 cm (SoilGrids)", "Clay content 0–30 cm (SoilGrids)", {"vi": "%", "en": "%"}),
]
SOIL_ID = {"phh2o": "ph", "soc": "soc", "clay": "clay"}
POINTS = {  # named places for the DEM / soil comparison (1 km disc means)
    "thapmuoi": ([105.83, 10.55], "Tháp Mười (Đồng Tháp)", "Thap Muoi (Dong Thap)"),
    "longxuyen": ([105.00, 10.30], "Tứ giác Long Xuyên (Kiên Giang)", "Long Xuyen Quadrangle (Kien Giang)"),
    "cantho": ([105.75, 10.03], "Cần Thơ", "Can Tho"),
    "bentre": ([106.50, 10.10], "Giồng Trôm (Bến Tre)", "Giong Trom (Ben Tre)"),
    "camau": ([105.00, 8.75], "Năm Căn (Cà Mau)", "Nam Can (Ca Mau)"),
    "namdinh": ([106.42, 20.22], "Giao Thủy (Nam Định)", "Giao Thuy (Nam Dinh)"),
    "thaibinh": ([106.35, 20.45], "Thái Bình", "Thai Binh"),
}


def soil_img(prop: str, k: float) -> ee.Image:
    img = ee.Image(SG.format(prop))
    tot = sum(w for _, w in DEPTHS)
    return ee.Image.cat([img.select(f"{prop}_{d}_mean").multiply(w / tot) for d, w in DEPTHS]).reduce("sum").multiply(k)


def soil() -> None:
    for prop, k, enc, pal, rng, tvi, ten, units in SOIL:
        img = soil_img(prop, k)
        for region in ("red", "mekong"):
            raw, clipped = fetch_raw(img, region, RES, **enc)
            write_layer(f"soil-{SOIL_ID[prop]}-{region}", raw, region, RES, times=["SoilGrids 2.0"], **enc,
                        title={"vi": tvi, "en": ten}, units=units, palette=pal, range_=rng, clipped=clipped,
                        provenance={"source": f"{SG.format(prop)}, depths 0-5, 5-15, 15-30 cm (predicted mean, 250 m)",
                                    "processing": "thickness-weighted mean of the three layers (5:10:15), nearest "
                                                  "cell on the 250 m Mercator grid", "attribution": SG_ATTR})


def dem_imgs() -> dict[str, ee.Image]:
    dtm = ee.Image(DTM).rename("h")
    cop = ee.ImageCollection(COP).select("DEM").mosaic().setDefaultProjection(
        ee.ImageCollection(COP).first().select("DEM").projection()).rename("h")
    return {"dtm": dtm, "cop": cop}


def dem() -> None:
    imgs = dem_imgs()
    meta = {
        "dtm": ({"vi": "Độ cao mặt đất DeltaDTM", "en": "DeltaDTM ground elevation"},
                {"source": f"{DTM} (1 arc-second, m above EGM2008, clipped at 10 m)",
                 "processing": "mean of ~30 m cells in each ~250 m cell; 10 = 10 m or higher", "attribution": DTM_ATTR}),
        "cop": ({"vi": "Độ cao bề mặt Copernicus DEM", "en": "Copernicus DEM surface elevation"},
                {"source": f"{COP} band DEM (1 arc-second, m above EGM2008; X-band radar surface: trees and roofs included)",
                 "processing": "mean of ~30 m cells in each ~250 m cell", "attribution": COP_ATTR}),
    }
    for region in ("red", "mekong"):
        vals = {}
        for key, img in imgs.items():
            raw, clipped = fetch_raw(img.reduceResolution(ee.Reducer.mean(), maxPixels=1024), region, RES,
                                     max_rows=128, **DEM_ENC)
            title, prov = meta[key]
            write_layer(f"dem-{key}-{region}", raw, region, RES, times=["2024" if key == "cop" else "v1.0"], **DEM_ENC,
                        title=title, units={"vi": "m trên mực nước biển (EGM2008)", "en": "m above sea level (EGM2008)"},
                        palette="viridis", range_=[0, 8], clipped=clipped, provenance=prov)
            vals[key] = to_values(raw, DEM_ENC["scale"], DEM_ENC["offset"], DEM_ENC["nodata"])
        cop_land, _ = fetch_raw(imgs["cop"].updateMask(imgs["dtm"].mask()).reduceResolution(ee.Reducer.mean(), maxPixels=1024),
                                region, RES, max_rows=128, **DEM_ENC)  # same land cells as DeltaDTM: rivers out
        diff = to_values(cop_land, DEM_ENC["scale"], DEM_ENC["offset"], DEM_ENC["nodata"])[0:1] - np.minimum(vals["dtm"], CAP)
        diff[vals["dtm"] >= CAP - 0.01] = np.nan  # DeltaDTM clipped: difference unknown
        enc = {"dtype": "uint8", "scale": 0.05, "offset": -2.0, "nodata": 255}
        write_layer(f"dem-diff-{region}", to_raw(diff, **enc), region, RES, times=["2024 − v1.0"], **enc,
                    title={"vi": "Copernicus DEM trừ DeltaDTM", "en": "Copernicus DEM minus DeltaDTM"},
                    units={"vi": "m", "en": "m"}, palette="ylorrd", range_=[0, 6], clipped=True,
                    provenance={"source": f"{COP} and {DTM}", "processing": "difference of the two 250 m means, both on "
                                "the ~30 m cells DeltaDTM covers (open water out); "
                                "left out where DeltaDTM is clipped at 10 m", "attribution": f"{COP_ATTR}; {DTM_ATTR}"})


def hypso() -> None:
    """Area (ha) below each 0.1 m elevation step, -3 .. 10 m, inside each delta outline, at 30 m."""
    imgs = dem_imgs()
    imgs["cop"] = imgs["cop"].updateMask(imgs["dtm"].mask())  # same land cells for both curves (DeltaDTM masks water)
    lo, hi = -30, 100  # decimetres
    out = {"bins_dm": [lo, hi], "datum": "EGM2008", "regions": {}, "points": {}}
    for region in ("red", "mekong"):
        geom = region_outline(region)
        total = ee.Image.pixelArea().divide(1e4).reduceRegion(ee.Reducer.sum(), geom, 30, maxPixels=1e11, tileScale=4)
        rec = {"area_ha": round(total.getInfo()["area"])}
        for key, img in imgs.items():
            b = img.multiply(10).floor().clamp(lo, hi).int().rename("bin")
            area = ee.Image.pixelArea().divide(1e4).rename("ha").updateMask(img.mask())
            res = area.addBands(b).reduceRegion(ee.Reducer.sum().group(1, "bin"), geom, 30, maxPixels=1e11, tileScale=8)
            groups = {g["bin"]: g["sum"] for g in res.getInfo()["groups"]}
            per = [groups.get(i, 0.0) for i in range(lo, hi + 1)]
            rec[key] = {"valid_ha": round(sum(per)), "below": [round(float(v)) for v in np.cumsum(per)]}
            print(region, key, "valid ha", rec[key]["valid_ha"], "of", rec["area_ha"], flush=True)
        out["regions"][region] = rec
    stack = ee.Image.cat(imgs["dtm"].rename("dtm"), imgs["cop"].rename("cop"),
                         soil_img("phh2o", 0.1).rename("ph"))
    for k, ((x, y), vi, en) in POINTS.items():
        v = stack.reduceRegion(ee.Reducer.mean(), ee.Geometry.Point([x, y]).buffer(1000), 30).getInfo()
        out["points"][k] = {"lonlat": [x, y], "name": {"vi": vi, "en": en},
                            **{b: (round(v[b], 2) if v.get(b) is not None else None) for b in ("dtm", "cop", "ph")}}
        print(k, out["points"][k], flush=True)
    out["provenance"] = {"dtm": DTM_ATTR, "cop": COP_ATTR, "soil": SG_ATTR,
                         "method": "pixelArea summed per 0.1 m bin at 30 m inside the geoBoundaries region outline, on the cells "
                                   "DeltaDTM covers (open water masked) for both DEMs; "
                                   "below[i] = area with elevation < (bins_dm[0] + i + 1) / 10 m; values >= 10 m in the "
                                   "last bin; points = 1 km disc means"}
    (DATA / "terrain-hypso.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8",
                                             newline="\n")
    print("wrote terrain-hypso.json")


if __name__ == "__main__":
    init()
    parts = sys.argv[1:] or ["soil", "dem", "hypso"]
    for p in parts:
        {"soil": soil, "dem": dem, "hypso": hypso}[p]()
