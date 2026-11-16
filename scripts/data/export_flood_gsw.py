"""Surface-water occurrence 1984-2021 (JRC Global Surface Water v1.4) for both deltas at ~250 m (mean of 30 m pixels).

    python -I scripts/data/export_flood_gsw.py
"""
import ee

from layerkit import export_layer, init

GSW = "JRC/GSW1_4/GlobalSurfaceWater"


def main() -> None:
    init()
    occ = ee.Image(GSW).select("occurrence").unmask(0)  # masked = never observed as water -> 0 %
    occ = occ.reduceResolution(ee.Reducer.mean(), maxPixels=1024)
    for region in ("red", "mekong"):
        export_layer(
            f"flood-gsw-{region}", occ, region, 250, times=["1984–2021"],
            dtype="uint8", scale=0.5, nodata=255,
            title={"vi": "Tần suất có nước mặt 1984–2021", "en": "Surface-water occurrence 1984–2021"},
            units={"vi": "% số lần quan sát", "en": "% of observations"},
            palette="water", range_=[0, 100],
            provenance={"source": f"{GSW} (Pekel et al. 2016, Nature 540:418–422), band occurrence",
                        "processing": "mean of 30 m pixels to ~250 m; never-water pixels = 0 %",
                        "attribution": "Source: EC JRC/Google (Copernicus Landsat-derived)"})


if __name__ == "__main__":
    main()
