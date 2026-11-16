"""Monthly mean MODIS EVI (MOD13Q1 v061, 16-day 250 m composites) for both deltas, 2024, at ~500 m.

Only good-quality pixels (SummaryQA 0 = good, 1 = marginal) enter the monthly mean; a 16-day composite counts for
the month of its start date. Months without a good pixel are no-data.

    python scripts/data/export_evi_monthly.py
"""
import ee

from layerkit import export_layer, init

COL = "MODIS/061/MOD13Q1"
YEAR = 2024


def monthly(year: int) -> ee.Image:
    col = ee.ImageCollection(COL).filterDate(f"{year}-01-01", f"{year + 1}-01-01")
    good = col.map(lambda im: im.select("EVI").multiply(0.0001).updateMask(im.select("SummaryQA").lte(1))
                   .copyProperties(im, ["system:time_start"]))
    bands = [good.filter(ee.Filter.calendarRange(m, m, "month")).mean().rename(f"m{m:02d}") for m in range(1, 13)]
    proj = col.first().select("EVI").projection()  # a collection mean has no default projection
    img = ee.Image.cat(bands).setDefaultProjection(proj)
    return img.reduceResolution(ee.Reducer.mean(), maxPixels=64)


def main() -> None:
    init()
    img = monthly(YEAR)
    for region in ("red", "mekong"):
        export_layer(
            f"evi-{YEAR}-{region}", img, region, 500, times=[f"{YEAR}-{m:02d}" for m in range(1, 13)],
            dtype="uint8", scale=0.005, offset=-0.25, nodata=255,
            title={"vi": f"Chỉ số EVI trung bình tháng {YEAR}", "en": f"Monthly mean EVI {YEAR}"},
            units={"vi": "EVI", "en": "EVI"}, palette="evi", range_=[-0.1, 0.8],
            provenance={"source": f"{COL} band EVI × 0.0001", "mask": "SummaryQA <= 1",
                        "processing": "monthly mean of 16-day composites (by start date), mean to ~500 m",
                        "attribution": "MODIS MOD13Q1 v061, NASA LP DAAC"})


if __name__ == "__main__":
    main()
