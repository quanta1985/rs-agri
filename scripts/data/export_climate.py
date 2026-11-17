"""Chapters 7 (climate) and 9 (drought): monthly climate stacks, SPI-3, VHI, SMAP soil moisture, ONI.

    python scripts/data/export_climate.py [monthly|modis|smap|oni|write]   (no argument = all)

monthly: CHIRPS rain + ERA5-Land t2m / evaporation / potential evaporation, 1981-2025, ~5 km, both deltas (cached .npy)
modis:   MOD13Q1 NDVI (monthly max, SummaryQA <= 1) + MOD11A2 day LST (monthly mean, good QC), 2001-2025, ~1 km (cached)
smap:    SMAP L4 root-zone soil moisture, monthly region mean, Apr 2015-Dec 2025
oni:     NOAA CPC Oceanic Nino Index (downloaded)
write:   layers rain-normal-*, rain-dryanom-*, spi3-*, vhi-dry-mekong and public/data/climate-series.json from the caches
"""
import json
import math
import sys
import urllib.request
import warnings
from pathlib import Path

import ee
import numpy as np
from scipy import stats

from layerkit import DATA, R, fetch_raw, grid, init, region_outline, to_raw, to_values, write_layer

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
REGIONS = ("red", "mekong")
Y0, Y1 = 1981, 2025          # CHIRPS / ERA5-Land monthly record used
M0 = 2001                    # MODIS record used
NORMAL = (1991, 2020)        # WMO climate normal period
CLIM_RES, MODIS_RES = 5000, 1000
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
ERA5 = "ECMWF/ERA5_LAND/MONTHLY_AGGR"
DRY_YEARS = [2016, 2020, 2024]
VHI_YEARS = [2016, 2018, 2020, 2024]
MIN_YEARS = 10             # cloud-free years of a calendar month needed for a VCI/TCI min/max
ATTR_CHIRPS = "CHIRPS v2.0 (Funk et al. 2015, Scientific Data 2:150066), UCSB Climate Hazards Center"
ATTR_ERA5 = "ERA5-Land monthly (Munoz-Sabater et al. 2021), contains modified Copernicus Climate Change Service information"


def cache(name: str) -> Path:
    return HERE / f"cache_{name}.npy"


def month_range(y0: int, y1: int) -> list[tuple[int, int]]:
    return [(y, m) for y in range(y0, y1 + 1) for m in range(1, 13)]


# ---------- monthly climate (5 km) ----------
def chirps_year(y: int) -> ee.Image:
    col = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD")
    return ee.Image.cat([col.filterDate(f"{y}-{m:02d}-01", ee.Date(f"{y}-{m:02d}-01").advance(1, "month")).sum()
                         for m in range(1, 13)])


def era5_year(y: int, band: str, factor: float, add: float) -> ee.Image:
    col = ee.ImageCollection(ERA5).filterDate(f"{y}-01-01", f"{y + 1}-01-01").select(band)
    return col.toBands().multiply(factor).add(add)


VARS = {  # name: (yearly image builder, dtype, scale, offset)
    "rain": (chirps_year, "uint16", 0.1, 0.0),                                                       # mm/month
    "t2m": (lambda y: era5_year(y, "temperature_2m", 1, -273.15), "uint16", 0.01, -10.0),            # degC
    "et": (lambda y: era5_year(y, "total_evaporation_sum", -1000, 0), "uint16", 0.1, -50.0),         # mm/month
    "pet": (lambda y: era5_year(y, "potential_evaporation_sum", -1000, 0), "uint16", 0.1, -50.0),    # mm/month
}


def fetch_years(build, years: list[int], region: str, res: float, dtype: str, scale: float, offset: float,
                max_rows: int = 512) -> np.ndarray:
    """(len(years)*12, h, w) float32 values, fetched one year (12 bands) at a time."""
    nodata = {"uint8": 255, "uint16": 65535}[dtype]
    out = []
    for y in years:
        raw, _ = fetch_raw(build(y), region, res, dtype=dtype, scale=scale, offset=offset, nodata=nodata,
                           max_rows=max_rows)
        out.append(to_values(raw, scale, offset, nodata))
        print(f"  {region} {y}", end="\r")
    print()
    return np.concatenate(out)


def monthly() -> None:
    for region in REGIONS:
        for name, (build, dtype, scale, offset) in VARS.items():
            if cache(f"clim_{name}_{region}").exists():
                continue
            print("fetch", name, region)
            arr = fetch_years(build, list(range(Y0, Y1 + 1)), region, CLIM_RES, dtype, scale, offset)
            np.save(cache(f"clim_{name}_{region}"), arr.astype(np.float32))


# ---------- MODIS (1 km) ----------
def ndvi_year(y: int) -> ee.Image:
    col = ee.ImageCollection("MODIS/061/MOD13Q1")
    ims = []
    for m in range(1, 13):
        c = col.filterDate(f"{y}-{m:02d}-01", ee.Date(f"{y}-{m:02d}-01").advance(1, "month"))
        ims.append(c.map(lambda i: i.select("NDVI").updateMask(i.select("SummaryQA").lte(1))).max().multiply(0.0001))
    return ee.Image.cat(ims)


def lst_year(y: int) -> ee.Image:
    col = ee.ImageCollection("MODIS/061/MOD11A2")
    ims = []
    for m in range(1, 13):
        c = col.filterDate(f"{y}-{m:02d}-01", ee.Date(f"{y}-{m:02d}-01").advance(1, "month"))
        good = c.map(lambda i: i.select("LST_Day_1km").updateMask(i.select("QC_Day").bitwiseAnd(3).eq(0)))
        ims.append(good.mean().multiply(0.02).subtract(273.15))
    return ee.Image.cat(ims)


def modis() -> None:
    for region in REGIONS:
        for name, build, scale, offset in (("ndvi", ndvi_year, 0.005, -0.2), ("lst", lst_year, 0.25, 0.0)):
            if not cache(f"modis_{name}_{region}").exists():
                print("fetch", name, region)
                arr = fetch_years(build, list(range(M0, Y1 + 1)), region, MODIS_RES, "uint8", scale, offset)
                np.save(cache(f"modis_{name}_{region}"), arr.astype(np.float32))
        if not cache(f"modis_crop_{region}").exists():
            wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").eq(40)
            frac = wc.reduceResolution(ee.Reducer.mean(), maxPixels=65535)
            raw, _ = fetch_raw(frac, region, MODIS_RES, dtype="uint8", scale=0.005, nodata=255, max_rows=16)
            np.save(cache(f"modis_crop_{region}"), to_values(raw, 0.005, 0, 255)[0])


# ---------- SMAP (region means) ----------
def smap() -> None:
    out = {}
    months = [(y, m) for (y, m) in month_range(2015, Y1) if (y, m) >= (2015, 4)]
    col = ee.ImageCollection("NASA/SMAP/SPL4SMGP/008").select("sm_rootzone")
    for region in REGIONS:
        geom = region_outline(region)

        def per_month(ym):
            d0 = ee.Date(ee.String(ym).cat("-01"))
            v = col.filterDate(d0, d0.advance(1, "month")).mean().reduceRegion(ee.Reducer.mean(), geom, 9000)
            return ee.Feature(None, {"ym": ym, "sm": v.get("sm_rootzone")})

        fc = ee.FeatureCollection(ee.List([f"{y}-{m:02d}" for y, m in months]).map(per_month)).getInfo()
        vals = {f["properties"]["ym"]: f["properties"].get("sm") for f in fc["features"]}
        out[region] = [None if vals.get(f"{y}-{m:02d}") is None else round(vals[f"{y}-{m:02d}"], 4) for y, m in months]
        print("smap", region, len(out[region]), "months")
    (HERE / "cache_smap.json").write_text(json.dumps({"start": "2015-04", "regions": out}), "utf-8", newline="\n")


# ---------- ONI ----------
SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]


def oni() -> None:
    req = urllib.request.Request(ONI_URL, headers={"User-Agent": "rs-agri-data-script"})
    text = urllib.request.urlopen(req, timeout=60).read().decode()
    vals = {}
    for line in text.splitlines()[1:]:
        p = line.split()
        if len(p) == 4 and p[0] in SEASONS:
            vals[(int(p[1]), SEASONS.index(p[0]) + 1)] = float(p[3])  # centre month of the 3-month season
    keys = sorted(vals)
    series = [vals.get((y, m)) for y, m in month_range(keys[0][0], keys[-1][0])]
    while series and series[-1] is None:
        series.pop()
    (HERE / "cache_oni.json").write_text(json.dumps({"start": f"{keys[0][0]}-01", "values": series}), "utf-8", newline="\n")
    print("oni", len(series), "months, last", series[-1])


# ---------- derived products ----------
def row_weights(region: str, res: float, h: int, w: int) -> np.ndarray:
    """Ground-area weight of each cell (Mercator cell area shrinks with cos^2 lat)."""
    g = grid(region, res)
    y = g["origin"][1] - (np.arange(h) + 0.5) * g["res"]
    lat = np.degrees(2 * np.arctan(np.exp(y / R)) - math.pi / 2)
    return np.repeat((np.cos(np.radians(lat)) ** 2)[:, None], w, axis=1)


def region_mean(stack: np.ndarray, wts: np.ndarray, mask: np.ndarray | None = None, min_valid: float = 0.0) -> list:
    """Area-weighted mean of each frame over valid (and masked-in) cells; None when the valid share < min_valid."""
    base = np.isfinite(stack[0]) if mask is None else mask
    out = []
    for f in stack:
        ok = np.isfinite(f) & base
        share = (wts * ok).sum() / (wts * base).sum()
        out.append(None if share < max(min_valid, 1e-9) else float((f[ok] * wts[ok]).sum() / wts[ok].sum()))
    return out


def spi(series: np.ndarray, months: list[tuple[int, int]], k: int = 3, cal_months=range(1, 13)) -> np.ndarray:
    """SPI-k of monthly totals (last axis = time): gamma fit per calendar month on the normal period, zeros mixed in."""
    acc = np.full(series.shape, np.nan)
    for t in range(k - 1, series.shape[-1]):
        acc[..., t] = series[..., t - k + 1:t + 1].sum(-1)
    out = np.full(series.shape, np.nan)
    ref = np.array([NORMAL[0] <= y <= NORMAL[1] for y, _ in months])
    cal = np.array([m for _, m in months])
    flat, oflat = acc.reshape(-1, acc.shape[-1]), out.reshape(-1, out.shape[-1])
    for m in cal_months:
        sel, fit = cal == m, (cal == m) & ref
        for i in range(flat.shape[0]):
            x = flat[i, fit]
            if not np.isfinite(x).all() or (x > 0).sum() < 10:
                continue
            q = (x == 0).mean()
            a, _, scale = stats.gamma.fit(x[x > 0], floc=0)
            p = q + (1 - q) * stats.gamma.cdf(flat[i, sel], a, scale=scale)
            oflat[i, sel] = np.clip(stats.norm.ppf(np.clip(p, 1e-6, 1 - 1e-6)), -3.5, 3.5)
    return out


def r2(v):
    return None if v is None or not np.isfinite(v) else round(float(v), 2)


def write() -> None:
    months = month_range(Y0, Y1)
    mmonths = month_range(M0, Y1)
    out = {"start": f"{Y0}-01", "modis_start": f"{M0}-01", "normal": list(NORMAL), "regions": {}, "normals": {}}
    for region in REGIONS:
        st = {k: np.load(cache(f"clim_{k}_{region}")) for k in VARS}
        h, w = st["rain"].shape[1:]
        wts = row_weights(region, CLIM_RES, h, w)
        ser = {k: region_mean(v, wts) for k, v in st.items()}
        rain_r = np.array(ser["rain"], float)
        ser["spi3"] = spi(rain_r, months).tolist()
        ref = [i for i, (y, _) in enumerate(months) if NORMAL[0] <= y <= NORMAL[1]]
        nrm = {k: [r2(np.mean([ser[k][i] for i in ref if months[i][1] == m])) for m in range(1, 13)] for k in VARS}

        # MODIS: VCI / TCI / VHI per pixel against the same calendar month of 2001-2025, mean over cropland cells
        nd, ls = np.load(cache(f"modis_ndvi_{region}")), np.load(cache(f"modis_lst_{region}"))
        crop = np.load(cache(f"modis_crop_{region}")) >= 0.5
        mw = row_weights(region, MODIS_RES, *nd.shape[1:])
        cal = np.array([m for _, m in mmonths])
        vci, tci = np.full(nd.shape, np.nan, np.float32), np.full(ls.shape, np.nan, np.float32)
        with np.errstate(invalid="ignore", divide="ignore"), warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            for m in range(1, 13):
                s = cal == m
                lo, hi = np.nanmin(nd[s], 0), np.nanmax(nd[s], 0)
                lo[np.isfinite(nd[s]).sum(0) < MIN_YEARS] = np.nan
                vci[s] = 100 * (nd[s] - lo) / (hi - lo)
                lo, hi = np.nanmin(ls[s], 0), np.nanmax(ls[s], 0)
                lo[np.isfinite(ls[s]).sum(0) < MIN_YEARS] = np.nan
                tci[s] = 100 * (hi - ls[s]) / (hi - lo)
        vhi = 0.5 * vci + 0.5 * tci
        ser["lst"] = region_mean(ls, mw, crop, 0.3)
        ser["vhi"] = region_mean(vhi, mw, crop, 0.3)
        ser["asi"] = [None if not (ok := np.isfinite(f) & crop).sum() or (mw * ok).sum() < 0.3 * (mw * crop).sum()
                      else round(float(100 * (mw * ok * (f < 35)).sum() / (mw * ok).sum()), 1) for f in vhi]  # FAO ASIS: % cropland VHI < 35
        ser["vhi_valid"] = [round(float(((np.isfinite(f) & crop) * mw).sum() / (crop * mw).sum()), 3) for f in vhi]
        mref = [i for i, (y, _) in enumerate(mmonths) if y <= 2024]
        nrm["lst"] = [r2(np.mean([v for i in mref if mmonths[i][1] == m and (v := ser["lst"][i]) is not None])) for m in range(1, 13)]
        out["regions"][region] = {k: [r2(v) for v in vals] for k, vals in ser.items()}
        out["normals"][region] = nrm
        print(region, "normal rain", sum(nrm["rain"]), "mm/yr; t2m", nrm["t2m"])

        # layers
        prov_rain = {"source": "UCSB-CHG/CHIRPS/PENTAD summed per month", "attribution": ATTR_CHIRPS}
        clim = np.stack([np.nanmean(st["rain"][[i for i in ref if months[i][1] == m]], 0) for m in range(1, 13)])
        write_layer(f"rain-normal-{region}", to_raw(clim, "uint8", 4, 0, 255), region, CLIM_RES,
                    times=[f"M{m:02d}" for m in range(1, 13)], dtype="uint8", scale=4, nodata=255, clipped=True,
                    title={"vi": "Lượng mưa trung bình tháng 1991–2020 (CHIRPS)", "en": "Mean monthly rainfall 1991–2020 (CHIRPS)"},
                    units={"vi": "mm/tháng", "en": "mm/month"}, palette="water", range_=[0, 400],
                    provenance={**prov_rain, "processing": "monthly totals, mean of 1991-2020 per calendar month, ~5 km"})
        dry = []
        for y in DRY_YEARS:  # Dec (y-1) to Apr (y) total, % of the 1991-2020 mean of the same window
            idx = [months.index((y - 1, 12))] + [months.index((y, m)) for m in range(1, 5)]
            tot = st["rain"][idx].sum(0)
            base = np.mean([st["rain"][[months.index((b - 1, 12))] + [months.index((b, m)) for m in range(1, 5)]].sum(0)
                            for b in range(NORMAL[0], NORMAL[1] + 1)], 0)
            dry.append(100 * tot / base - 100)
        write_layer(f"rain-dryanom-{region}", to_raw(np.stack(dry), "uint8", 1, -100, 255), region, CLIM_RES,
                    times=[f"{y - 1}–{y % 100:02d}" for y in DRY_YEARS], dtype="uint8", scale=1, offset=-100, nodata=255,
                    clipped=True, title={"vi": "Mưa mùa khô (tháng 12–4) so với trung bình 1991–2020",
                                         "en": "Dry-season rainfall (Dec–Apr) against the 1991–2020 mean"},
                    units={"vi": "% chênh lệch", "en": "% difference"}, palette="brbg", range_=[-100, 100],
                    provenance={**prov_rain, "processing": "Dec-Apr total minus the 1991-2020 mean of the same months, in %"})
        sp = spi(np.moveaxis(st["rain"], 0, -1), months, cal_months=[4])
        sp_frames = np.stack([sp[..., months.index((y, 4))] for y in DRY_YEARS])
        sp_frames[~np.isfinite(st["rain"][0])[None].repeat(len(DRY_YEARS), 0)] = np.nan
        write_layer(f"spi3-{region}", to_raw(sp_frames, "uint8", 0.05, -4, 255), region, CLIM_RES,
                    times=[f"{y}-04" for y in DRY_YEARS], dtype="uint8", scale=0.05, offset=-4, nodata=255, clipped=True,
                    title={"vi": "SPI-3 (tháng 2–4)", "en": "SPI-3 (Feb–Apr)"}, units={"vi": "SPI", "en": "SPI"},
                    palette="brbg", range_=[-2.5, 2.5],
                    provenance={**prov_rain, "processing": "3-month CHIRPS totals ending in April; gamma fit per pixel "
                                "and calendar month on 1991-2020 (zeros mixed in), transformed to a standard normal"})
        if region == "mekong":
            frames = []
            for y in VHI_YEARS:
                idx = [mmonths.index((y, m)) for m in (2, 3, 4)]
                with np.errstate(invalid="ignore"), warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)
                    frames.append(np.nanmean(vhi[idx], 0))
            write_layer("vhi-dry-mekong", to_raw(np.stack(frames), "uint8", 0.5, 0, 255), region, MODIS_RES,
                        times=[str(y) for y in VHI_YEARS], dtype="uint8", scale=0.5, nodata=255, clipped=True,
                        title={"vi": "Chỉ số sức khỏe thực vật VHI, tháng 2–4", "en": "Vegetation Health Index VHI, Feb–Apr"},
                        units={"vi": "VHI (0–100)", "en": "VHI (0–100)"}, palette="brbg", range_=[0, 100],
                        provenance={"source": "MODIS/061/MOD13Q1 NDVI (monthly max, SummaryQA <= 1) and MODIS/061/MOD11A2 "
                                              "LST_Day_1km (monthly mean, QC good), ~1 km",
                                    "processing": "VCI and TCI against the min/max of the same calendar month 2001-2025 (cells with < 10 cloud-free "
                                                  "years of that month left out) "
                                                  "(Kogan 1995), VHI = (VCI + TCI) / 2, mean of Feb-Apr; every land cover",
                                    "attribution": "NASA LP DAAC MODIS Collection 6.1"})
    sm = json.loads((HERE / "cache_smap.json").read_text("utf-8"))
    on = json.loads((HERE / "cache_oni.json").read_text("utf-8"))
    out["smap"] = sm
    out["oni"] = on
    out["provenance"] = {
        "rain": ATTR_CHIRPS, "t2m_et_pet": ATTR_ERA5 + " (temperature_2m, total_evaporation_sum, potential_evaporation_sum)",
        "region_means": "area-weighted means over the region outline on a ~5 km (climate) or ~1 km (MODIS) grid",
        "spi3": "SPI-3 of the region-mean CHIRPS rainfall, gamma fit per calendar month on 1991-2020",
        "lst_vhi": "MODIS MOD11A2 / MOD13Q1 C6.1, mean over cells >= 50 % WorldCover cropland; null when < 30 % of them are cloud-free",
        "asi": "share of those cropland cells with VHI < 35 (FAO ASIS critical value), % of the cloud-free ones",
        "smap": "NASA/SMAP/SPL4SMGP/008 sm_rootzone (m3/m3), monthly mean, region mean at 9 km",
        "oni": f"NOAA CPC Oceanic Nino Index (ERSSTv5), {ONI_URL}, value of the 3-month season centred on each month",
    }
    (DATA / "climate-series.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8", newline="\n")
    print("wrote climate-series.json")


PARTS = {"oni": oni, "smap": smap, "monthly": monthly, "modis": modis, "write": write}

if __name__ == "__main__":
    init()
    for name in sys.argv[1:] or PARTS:
        PARTS[name]()
