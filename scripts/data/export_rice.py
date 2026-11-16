"""Seasons per year (2016, 2024) and start of the winter-spring season (2024), both deltas, 250 m.

Red River Delta: Sentinel-1 VH (orbit 91, 12-day), see rice_s1(): MODIS has too few clear observations in the rainy
season there. Mekong Delta: MODIS EVI, as follows.

Input: Terra MOD13Q1 + Aqua MYD13Q1 v061 (16-day composites offset by 8 days, so one EVI value every 8 days), only
SummaryQA <= 1, on cropland (ESA WorldCover 2021 class 40 covering >= 50 % of the 250 m cell). Each composite is
dated at its mid-point (start + 8 days): timing error up to about +-8 days.

Per pixel (numpy, here, not in EE): linear gap filling in time, Savitzky-Golay smoothing (5 samples = 40 days,
order 2), then a peak = local maximum that is the highest value within +-3 samples (+-24 days), reaches EVI >= PEAK_MIN
and rises at least AMP_MIN above the higher of the minima in the 8 samples before and the 6 after. Peaks dated in the
calendar year are counted (3 or more -> class 3). Pixels with fewer than MIN_VALID good observations in the year are
no data.

Start of season (SOS) of the winter-spring crop (Dong Xuan in the Mekong, peak Dec-Mar; Xuan in the Red River Delta,
peak mid-Mar to mid-Jun): highest detected peak in that window, trough = minimum in the 12 samples before it,
SOS(f) = first time the smoothed curve reaches trough + f * (peak - trough), linearly interpolated between samples;
f = 0 is the trough itself (sowing / transplanting on flooded or bare fields), f = 20 % (TIMESAT-style), f = 50 %.

Fetched stacks are cached in scripts/data/cache_*.npy (gitignored). Run from the repo root, WITHOUT -I:

    python scripts/data/export_rice.py            # fetch (first run, several minutes) + write the layers
"""
from datetime import datetime, timedelta, timezone

import ee
import numpy as np
from scipy.signal import savgol_filter

from layerkit import ROOT, fetch_raw, init, region_geom, to_raw, to_values, write_layer

COLS = ["MODIS/061/MOD13Q1", "MODIS/061/MYD13Q1"]
RES = 250
ENC = {"dtype": "uint8", "scale": 0.005, "offset": -0.25, "nodata": 255}  # EVI -0.25 .. 1.02
CACHE = ROOT / "scripts" / "data"
PEAK_MIN, AMP_MIN, MIN_VALID = 0.35, 0.15, 0.4
YEARS = (2016, 2024)
SOS_YEAR = 2024
SOS_WINDOW = {"mekong": (-31, 74)}  # EVI peak window, days from 1 Jan: 1 Dec .. 15 Mar
S1_ORBIT = 91  # descending, covers ~96 % of the Red River Delta, 12-day repeat in 2016 (three 24-day gaps) and 2024
S1_ENC = {"dtype": "uint8", "scale": 0.15, "offset": -35.0, "nodata": 255}
TROUGH_MAX, RISE_MIN = -17.0, 2.5  # dB at 250 m: mixing with villages and dykes makes the 10 m troughs (~ -22 dB) shallower
MIN_SEP = 7  # S1 samples (84 days) between two counted seasons
S1_SOS_WINDOW = (0, 90)  # transplanting trough of the spring rice, 1 Jan .. 31 Mar (inside the year it is counted in)
FRACS = (0.0, 0.2, 0.5)
SOS_OFFSET = -128  # uint8 code 0 = 128 days before 1 Jan
CLASSES = [
    {"v": 0, "color": "#bbbbbb", "label": {"vi": "Không phát hiện vụ", "en": "No season detected"}},
    {"v": 1, "color": "#e69f00", "label": {"vi": "1 vụ", "en": "1 season"}},
    {"v": 2, "color": "#009e73", "label": {"vi": "2 vụ", "en": "2 seasons"}},
    {"v": 3, "color": "#0072b2", "label": {"vi": "3 vụ trở lên", "en": "3 or more seasons"}},
]
CLASSES_S1 = [
    {"v": 0, "color": "#bbbbbb", "label": {"vi": "Không thấy vụ lúa", "en": "No rice season detected"}},
    {"v": 1, "color": "#e69f00", "label": {"vi": "1 vụ lúa", "en": "1 rice season"}},
    {"v": 2, "color": "#009e73", "label": {"vi": "2 vụ lúa", "en": "2 rice seasons"}},
    {"v": 3, "color": "#0072b2", "label": {"vi": "3 vụ lúa trở lên", "en": "3 or more rice seasons"}},
]
ATTR = "MODIS MOD13Q1/MYD13Q1 v061, NASA LP DAAC; ESA WorldCover 10 m 2021 v200"


def evi_collection(region: str, start: str, end: str) -> ee.ImageCollection:
    geom = region_geom(region)
    cols = [ee.ImageCollection(c).filterDate(start, end).filterBounds(geom) for c in COLS]
    return cols[0].merge(cols[1]).sort("system:time_start")


def stack(region: str, year: int) -> tuple[np.ndarray, np.ndarray]:
    """EVI (T, h, w) float32 with NaN, and composite mid-dates (datetime64[D]), Sep 1 of year-1 .. Mar 1 of year+1."""
    f_v, f_d = CACHE / f"cache_evi_{region}_{year}.npy", CACHE / f"cache_evi_{region}_{year}_dates.npy"
    if f_v.exists() and f_d.exists():
        return to_values(np.load(f_v), ENC["scale"], ENC["offset"], ENC["nodata"]), np.load(f_d)
    col = evi_collection(region, f"{year - 1}-09-01", f"{year + 1}-03-01")
    starts = col.aggregate_array("system:time_start").getInfo()
    good = col.map(lambda im: im.select("EVI").multiply(0.0001).updateMask(im.select("SummaryQA").lte(1)))
    img = good.toBands().setDefaultProjection(col.first().select("EVI").projection())
    print(f"{region} {year}: {len(starts)} composites, fetching ...", flush=True)
    raw, _ = fetch_raw(img, region, RES, **ENC, clip=False)  # sinusoidal clip fails in EE; cropland mask clips
    dates = np.array([datetime.fromtimestamp(s / 1000, timezone.utc).date() + timedelta(days=8) for s in starts],
                     "datetime64[D]")
    np.save(f_v, raw)
    np.save(f_d, dates)
    return to_values(raw, ENC["scale"], ENC["offset"], ENC["nodata"]), dates


def cropland(region: str) -> np.ndarray:
    """Share of WorldCover 2021 cropland in each 250 m cell (h, w), cached."""
    f = CACHE / f"cache_crop_{region}.npy"
    if not f.exists():
        wc = ee.ImageCollection("ESA/WorldCover/v200").first()
        frac = wc.eq(40).reduceResolution(ee.Reducer.mean(), maxPixels=1024)
        np.save(f, fetch_raw(frac, region, RES, dtype="uint8", scale=0.01, nodata=255, max_rows=64)[0][0])
    return to_values(np.load(f), 0.01, 0, 255)


def fill_gaps(y: np.ndarray) -> np.ndarray:
    """Linear interpolation over NaN along axis 0 (T, N); ends take the nearest valid value; all-NaN stays NaN."""
    t_n = y.shape[0]
    idx = np.arange(t_n)[:, None]
    ok = ~np.isnan(y)
    prv = np.maximum.accumulate(np.where(ok, idx, -1), axis=0)
    nxt = np.minimum.accumulate(np.where(ok, idx, t_n)[::-1], axis=0)[::-1]
    yp = np.take_along_axis(y, np.clip(prv, 0, t_n - 1), 0)
    yn = np.take_along_axis(y, np.clip(nxt, 0, t_n - 1), 0)
    w = np.where((prv >= 0) & (nxt < t_n), (idx - prv) / np.maximum(nxt - prv, 1), 0.0)
    out = np.where(prv < 0, yn, np.where(nxt >= t_n, yp, yp + w * (yn - yp)))
    return np.where(ok, y, out).astype(np.float32)


def peaks(s: np.ndarray) -> np.ndarray:
    """Boolean (T, N): season peaks of smoothed EVI s (T, N), see the module docstring."""
    t_n = s.shape[0]
    pad = np.pad(s, ((8, 8), (0, 0)), mode="edge")
    win = lambda a, b: np.stack([pad[8 + k: 8 + k + t_n] for k in range(a, b + 1)])  # noqa: E731 shifts a..b
    local_max = s >= win(-3, 3).max(0)
    rising = s > pad[7:7 + t_n]  # strictly above the previous sample (flat tops count once)
    trough = np.maximum(win(-8, -1).min(0), win(1, 6).min(0))
    return local_max & rising & (s >= PEAK_MIN) & (s - trough >= AMP_MIN)


def smooth(y: np.ndarray) -> np.ndarray:
    return savgol_filter(fill_gaps(y), 5, 2, axis=0).astype(np.float32)


def seasons(region: str, year: int, crop: np.ndarray) -> np.ndarray:
    evi, dates = stack(region, year)
    t_n, h, w = evi.shape
    in_year = (dates >= np.datetime64(f"{year}-01-01")) & (dates <= np.datetime64(f"{year}-12-31"))
    y = evi.reshape(t_n, -1)
    valid = (~np.isnan(y[in_year])).mean(0)
    sel = (crop.reshape(-1) >= 0.5) & (valid >= MIN_VALID)
    out = np.full(h * w, np.nan, np.float32)
    s = smooth(y[:, sel])
    out[sel] = np.minimum(peaks(s)[in_year].sum(0), 3)
    print(f"{region} {year}: cropland cells {int(((crop >= 0.5)).sum())}, enough data {int(sel.sum())}, "
          f"median valid share {np.median(valid[crop.reshape(-1) >= 0.5]):.2f}, "
          f"classes {np.bincount(out[sel].astype(int), minlength=4).tolist()}")
    return out.reshape(h, w)


def sos(region: str, year: int, crop: np.ndarray) -> np.ndarray:
    """(len(FRACS), h, w) days from 1 Jan of year to SOS(f) of the winter-spring season, NaN where none."""
    evi, dates = stack(region, year)
    t_n, h, w = evi.shape
    jan1 = np.datetime64(f"{year}-01-01")
    lo, hi = (jan1 + np.timedelta64(d, "D") for d in SOS_WINDOW[region])
    days = (dates - np.datetime64(f"{year}-01-01")).astype(np.float32)
    y = evi.reshape(t_n, -1)
    valid = (~np.isnan(y[(dates >= np.datetime64(f"{year}-01-01")) & (dates <= np.datetime64(f"{year}-12-31"))])).mean(0)
    sel = np.flatnonzero((crop.reshape(-1) >= 0.5) & (valid >= MIN_VALID))
    s = smooth(y[:, sel])
    pk = peaks(s) & ((dates >= lo) & (dates <= hi))[:, None]
    has = pk.any(0)
    ip = np.argmax(np.where(pk, s, -np.inf), axis=0)  # highest peak in the window
    out = np.full((len(FRACS), h * w), np.nan, np.float32)
    cols = np.arange(s.shape[1])
    # trough: minimum in the 12 samples before the peak
    back = np.stack([s[np.clip(ip - k, 0, t_n - 1), cols] for k in range(12, 0, -1)])  # (12, N), oldest first
    it = ip - 12 + np.argmin(back, axis=0)
    it = np.maximum(it, 0)
    vp, vt = s[ip, cols], s[it, cols]
    for fi, f in enumerate(FRACS):
        target = vt + f * (vp - vt)
        res = np.full(s.shape[1], np.nan, np.float32)
        todo = has.copy()
        for k in range(0, 13):  # walk forward from the trough to the first sample at/above target
            i1 = np.clip(it + k, 0, t_n - 1)
            hit = todo & (s[i1, cols] >= target)
            i0 = np.clip(i1 - 1, 0, t_n - 1)
            a, b = s[i0, cols], s[i1, cols]
            frac = np.where((k > 0) & (b > a), (target - a) / np.where(b > a, b - a, 1), 0.0)
            t = np.where(k > 0, days[i0] + frac * (days[i1] - days[i0]), days[i1])
            res = np.where(hit, t, res)
            todo &= ~hit
        out[fi, sel] = res
    print(f"{region} SOS {year}: season found in {int(has.sum())} of {sel.size} cells; median days from 1 Jan:",
          [round(float(np.nanmedian(o)), 1) for o in out])
    return out.reshape(len(FRACS), h, w)


def provenance(extra: str) -> dict:
    return {"source": f"{' + '.join(COLS)} band EVI x 0.0001, SummaryQA <= 1; ESA/WorldCover/v200 class 40",
            "processing": extra, "attribution": ATTR}


def s1_stack(region: str, year: int) -> tuple[np.ndarray, np.ndarray]:
    """Sentinel-1 VH dB (T, h, w) with NaN, one band per orbit-S1_ORBIT date, Oct of year-1 .. Jan of year+1, cached.

    No reduceResolution: EE serves the 250 m request from the S1 pyramid (mean of the 10 m dB values), which also
    removes most of the speckle."""
    f_v, f_d = CACHE / f"cache_s1vh_{region}_{year}.npy", CACHE / f"cache_s1vh_{region}_{year}_dates.npy"
    if not (f_v.exists() and f_d.exists()):
        col = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(region_geom(region))
               .filterDate(f"{year - 1}-10-01", f"{year + 1}-02-01").filter(ee.Filter.eq("instrumentMode", "IW"))
               .filter(ee.Filter.eq("relativeOrbitNumber_start", S1_ORBIT))
               .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH")))
        days = sorted(set(col.aggregate_array("system:time_start").map(
            lambda t: ee.Date(t).format("YYYY-MM-dd")).getInfo()))
        img = ee.Image.cat([col.filterDate(d, ee.Date(d).advance(1, "day")).select("VH").mosaic() for d in days])
        print(f"{region} {year}: {len(days)} S1 dates, fetching ...", flush=True)
        np.save(f_v, fetch_raw(img, region, RES, **S1_ENC, clip=False)[0])
        np.save(f_d, np.array(days, "datetime64[D]"))
    return to_values(np.load(f_v), S1_ENC["scale"], S1_ENC["offset"], S1_ENC["nodata"]), np.load(f_d)


def troughs(s: np.ndarray) -> np.ndarray:
    """Boolean (T, N): transplanting troughs of smoothed VH s (T, N): lowest within +-2 samples (+-24 days),
    <= TROUGH_MAX dB, followed by a rise >= RISE_MIN dB within the next 8 samples (96 days), and at least
    MIN_SEP samples after the previous trough (a mid-season drainage dip is not a new season)."""
    t_n = s.shape[0]
    pad = np.pad(s, ((8, 8), (0, 0)), mode="edge")
    win = lambda a, b: np.stack([pad[8 + k: 8 + k + t_n] for k in range(a, b + 1)])  # noqa: E731
    local_min = (s <= win(-2, 2).min(0)) & (s < pad[7:7 + t_n])  # strictly below the previous sample
    cand = local_min & (s <= TROUGH_MAX) & (win(1, 8).max(0) - s >= RISE_MIN)
    out = np.zeros_like(cand)
    last = np.full(s.shape[1], -MIN_SEP)
    for t in range(t_n):  # keep the earliest trough of each season
        keep = cand[t] & (t - last >= MIN_SEP)
        out[t] = keep
        last = np.where(keep, t, last)
    return out


def rice_s1(region: str, year: int, crop: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Rice seasons in the calendar year (h, w) and the winter-spring transplanting date (h, w, days from 1 Jan)."""
    vh, dates = s1_stack(region, year)
    t_n, h, w = vh.shape
    y = vh.reshape(t_n, -1)
    sel = np.flatnonzero((crop.reshape(-1) >= 0.5) & ((~np.isnan(y)).mean(0) >= 0.8))
    f = fill_gaps(y[:, sel])
    e = np.pad(f, ((1, 1), (0, 0)), mode="edge")
    s = (e[:-2] + f + e[2:]) / 3
    tr = troughs(s)
    jan1 = np.datetime64(f"{year}-01-01")
    in_year = (dates >= jan1) & (dates <= np.datetime64(f"{year}-12-31"))
    n = np.full(h * w, np.nan, np.float32)
    n[sel] = np.minimum(tr[in_year].sum(0), 3)
    lo, hi = (jan1 + np.timedelta64(d, "D") for d in S1_SOS_WINDOW)
    win = tr & ((dates >= lo) & (dates <= hi))[:, None]
    days = (dates - jan1).astype(np.float32)
    first = np.argmax(win, axis=0)
    sos_ = np.full(h * w, np.nan, np.float32)
    sos_[sel] = np.where(win.any(0), days[first], np.nan)
    print(f"{region} {year} (S1): cells {sel.size}, classes {np.bincount(n[sel].astype(int), minlength=4).tolist()}, "
          f"winter-spring trough found {int(win.any(0).sum())}, median day {np.nanmedian(sos_):.0f}")
    return n.reshape(h, w), sos_.reshape(h, w)


def s1_provenance(extra: str) -> dict:
    return {"source": f"COPERNICUS/S1_GRD IW VH, relative orbit {S1_ORBIT} (12-day repeat); ESA/WorldCover/v200 class 40",
            "processing": extra, "attribution": "Contains modified Copernicus Sentinel data; ESA WorldCover 10 m 2021 v200"}


def main() -> None:
    init()
    # Red River Delta: radar. MODIS has 7-12 % good observations in Jun-Jul 2024 (rainy season), which erases the
    # gap between the spring and summer rice and makes EVI peak counting fail there.
    crop = cropland("red")
    res = [rice_s1("red", y, crop) for y in YEARS]
    s1_rule = (f"3-date mean of the VH series; a season = a VH minimum (lowest within +-24 days) <= {TROUGH_MAX} dB "
               f"followed by a rise >= {RISE_MIN} dB within 96 days (flooded transplanting -> canopy), counted per "
               "calendar year; cropland >= 50 % of the cell; >= 80 % of the dates with data")
    write_layer(
        "rice-seasons-red", to_raw(np.stack([r[0] for r in res]), "uint8", 1, 0, 255), "red", RES,
        times=[str(y) for y in YEARS], dtype="uint8", scale=1, nodata=255, kind="classes", classes=CLASSES_S1,
        clipped=True, title={"vi": "Số vụ lúa mỗi năm (radar Sentinel-1)", "en": "Rice seasons per year (Sentinel-1 radar)"},
        units={"vi": "vụ", "en": "seasons"}, provenance=s1_provenance(s1_rule))
    write_layer(
        f"rice-sos-{SOS_YEAR}-red", to_raw(res[YEARS.index(SOS_YEAR)][1][None], "uint8", 1, SOS_OFFSET, 255), "red",
        RES, times=["S1"], dtype="uint8", scale=1, offset=SOS_OFFSET, nodata=255, palette="viridis", range_=[0, 80],
        clipped=True, title={"vi": "Ngày cấy vụ Xuân 2024 (đáy VH)", "en": "Spring 2024 transplanting date (VH minimum)"},
        units={"vi": "ngày so với 1/1/2024", "en": "days from 1 Jan 2024"},
        provenance=s1_provenance(f"first season trough (see rice-seasons-red) between day {S1_SOS_WINDOW[0]} and "
                                 f"{S1_SOS_WINDOW[1]} of 2024; date of the S1 acquisition (12-day steps)"))
    # Mekong Delta: MODIS EVI (cloud gaps are shorter; three-season systems need the 8-day sampling)
    region = "mekong"
    crop = cropland(region)
    sea = np.stack([seasons(region, y, crop) for y in YEARS])
    write_layer(
        f"rice-seasons-{region}", to_raw(sea, "uint8", 1, 0, 255), region, RES, times=[str(y) for y in YEARS],
        dtype="uint8", scale=1, nodata=255, kind="classes", classes=CLASSES, clipped=True,
        title={"vi": "Số vụ cây trồng mỗi năm (chủ yếu lúa)", "en": "Crop seasons per year (mostly rice)"},
        units={"vi": "vụ", "en": "seasons"},
        provenance=provenance(f"8-day EVI series, gap-filled, Savitzky-Golay 5/2, peaks >= {PEAK_MIN} EVI rising "
                              f">= {AMP_MIN} above the neighbouring troughs, counted per calendar year; cropland "
                              f">= 50 % of the cell; >= {int(MIN_VALID * 100)} % good observations in the year"))
    s = sos(region, SOS_YEAR, crop)
    write_layer(
        f"rice-sos-{SOS_YEAR}-{region}", to_raw(s, "uint8", 1, SOS_OFFSET, 255), region, RES,
        times=[f"{int(f * 100)}%" for f in FRACS], dtype="uint8", scale=1, offset=SOS_OFFSET, nodata=255,
        palette="viridis", range_=[-80, 20], clipped=True,
        title={"vi": "Ngày bắt đầu vụ Đông Xuân 2023–24 (EVI)", "en": "Start of the 2023-24 winter-spring season (EVI)"},
        units={"vi": "ngày so với 1/1/2024", "en": "days from 1 Jan 2024"},
        provenance=provenance("highest EVI peak in the winter-spring window, trough = minimum of the 12 samples "
                              "before it, SOS = first crossing of trough + f x amplitude (f = 0, 20, 50 %)"))


if __name__ == "__main__":
    main()
