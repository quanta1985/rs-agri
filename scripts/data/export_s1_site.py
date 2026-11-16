"""Sentinel-1 VV backscatter (dB) at the An Giang site, 10 m: one dry-season and one flood-season acquisition, 2024.

Single relative orbit (26, as the rs-knowledge An Giang series) so the viewing geometry is fixed. The flood date is the
orbit-26 acquisition of Sep-Nov 2024 with the lowest median VV over the frame (most open water); the dry date is the
first March 2024 acquisition; the third date, 26 Oct 2024, is the day of a cloud-free Sentinel-2 pass (MNDWI layer
s2mndwi-angiang-2024 in export_flood.py), for an optical vs radar comparison on the same day.

    python scripts/data/export_s1_site.py
"""
import ee

from layerkit import export_layer, init, region_geom

SITE = "angiang"
ORBIT = 26


def pick(col: ee.ImageCollection, geom: ee.Geometry) -> list[ee.Image]:
    dry = col.filterDate("2024-03-01", "2024-04-01").sort("system:time_start").first()
    wet = col.filterDate("2024-09-01", "2024-12-01").map(
        lambda im: im.set("med", im.select("VV").reduceRegion(ee.Reducer.median(), geom, 100).get("VV")))
    same_day_s2 = col.filterDate("2024-10-26", "2024-10-27").first()
    return [dry, wet.sort("med").first(), same_day_s2]


def main() -> None:
    init()
    geom = region_geom(SITE)
    col = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geom)
           .filter(ee.Filter.eq("instrumentMode", "IW")).filter(ee.Filter.eq("relativeOrbitNumber_start", ORBIT))
           .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV")))
    imgs = pick(col, geom)
    dates = [ee.Date(im.get("system:time_start")).format("YYYY-MM-dd").getInfo() for im in imgs]
    print("dates", dates)
    img = ee.Image.cat([im.select("VV") for im in imgs])
    export_layer(
        f"s1-{SITE}-2024", img, SITE, 10, times=dates,
        dtype="uint8", scale=0.15, offset=-35, nodata=255,  # -35 .. +3.1 dB in 0.15 dB steps
        title={"vi": "Tán xạ ngược Sentinel-1 VV", "en": "Sentinel-1 VV backscatter"},
        units={"vi": "dB", "en": "dB"}, palette="gray", range_=[-25, 0],
        provenance={"source": f"COPERNICUS/S1_GRD IW, VV, relative orbit {ORBIT} (sigma0, dB as distributed)",
                    "processing": "no speckle filter; nearest resampling to the 10 m Web Mercator grid",
                    "attribution": "Contains modified Copernicus Sentinel data 2024"})


if __name__ == "__main__":
    main()
