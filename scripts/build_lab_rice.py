"""Generate labs/rice_seasons.ipynb (Colab) for Chapter 4 (rice). The GEE script labs/rice_seasons.js is hand-written.

    cd scripts && python build_lab_rice.py           # write the notebook
    cd scripts && python build_lab_rice.py --run     # also execute the code cells locally (needs EE auth)
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 4 — Lúa & lịch mùa vụ / Rice & crop calendars

**Viễn thám Nông nghiệp & Môi trường — Chương 4** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/rice/)

Khung 10,24 km ở Tri Tôn (An Giang), cùng khung với các hình trong chương. / The 10.24 km Tri Ton (An Giang) frame used by the chapter's figures.

1. Đếm số vụ lúa từ chuỗi EVI MODIS, 2016 so với 2024 / Count rice seasons from the MODIS EVI series, 2016 vs 2024.
2. Chuỗi NDVI, EVI, LSWI (Sentinel-2) và VH (Sentinel-1) của một ô ruộng 500 m / NDVI, EVI, LSWI (Sentinel-2) and VH (Sentinel-1) series of a 500 m field block.
3. Ngày bắt đầu vụ theo ngưỡng biên độ / Start of season from an amplitude threshold.
4. Bản đồ lúa từ biên độ VH trong vụ + ngưỡng Otsu / Rice map from the seasonal VH range + Otsu threshold.
5. Từ bản đồ đến diện tích: ước lượng hiệu chỉnh thiên lệch (Olofsson et al. 2014) / From map to area: bias-corrected estimate."""),
    (PY, """import ee
import math
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import savgol_filter

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)"""),
    (MD, """## 0. Khung và lưới / Frame and grid

Lưới EPSG:3857 (Web Mercator) giống bản đồ trong chương. Một pixel Mercator có cạnh mặt đất = `res × cos(vĩ độ)`.
/ The same EPSG:3857 grid as the chapter's maps. A Mercator pixel's ground side = `res × cos(latitude)`."""),
    (PY, """LON, LAT, SIZE = 105.08, 10.45, 10240   # tâm khung, cạnh (m mặt đất) / frame centre, side (ground m)
R = 6378137.0

def grid(ground_res):
    \"\"\"Snapped Mercator grid of the frame: origin (upper left), res (Mercator m), n pixels per side.\"\"\"
    res = ground_res / math.cos(math.radians(LAT))
    n = round(SIZE / ground_res)
    mx, my = R * math.radians(LON), R * math.log(math.tan(math.pi / 4 + math.radians(LAT) / 2))
    x0 = math.floor((mx - n * res / 2) / res) * res
    y1 = math.ceil((my + n * res / 2) / res) * res
    return x0, y1, res, n

def pixels(img, ground_res, nodata=-999):
    \"\"\"Fetch an image on the frame grid as {band: float32 array (n, n)}, NaN where masked.\"\"\"
    x0, y1, res, n = grid(ground_res)
    arr = ee.data.computePixels({'expression': img.unmask(nodata, False), 'fileFormat': 'NUMPY_NDARRAY',
        'grid': {'dimensions': {'width': n, 'height': n}, 'crsCode': 'EPSG:3857',
                 'affineTransform': {'scaleX': res, 'shearX': 0, 'translateX': x0, 'shearY': 0, 'scaleY': -res, 'translateY': y1}}})
    return {b: np.where(arr[b] == nodata, np.nan, arr[b]).astype('float32') for b in arr.dtype.names}

def pixel_ha(ground_res):
    \"\"\"Ground area (ha) of each pixel row: Mercator pixels shrink by cos²(lat).\"\"\"
    x0, y1, res, n = grid(ground_res)
    y = y1 - (np.arange(n) + 0.5) * res
    lat = np.degrees(2 * np.arctan(np.exp(y / R)) - np.pi / 2)
    return (res * np.cos(np.radians(lat))) ** 2 / 1e4

x0, y1, res, n = grid(10)
FRAME = ee.Geometry.Rectangle([x0, y1 - n * res, x0 + n * res, y1], 'EPSG:3857', False)
print('10 m grid:', n, 'x', n, 'pixels, frame', round(pixel_ha(10).sum() * n), 'ha')"""),
    (MD, """## 1. Số vụ lúa từ EVI MODIS / Rice seasons from MODIS EVI

Terra MOD13Q1 + Aqua MYD13Q1: hai chuỗi 16 ngày lệch nhau 8 ngày, nên có một giá trị EVI mỗi 8 ngày. Chỉ giữ `SummaryQA ≤ 1`.
Mỗi pixel 250 m: lấp khoảng trống, lọc Savitzky–Golay (5 mẫu = 40 ngày), rồi đếm **đỉnh vụ**: cực đại trong ±24 ngày,
EVI ≥ 0,35 và cao hơn đáy hai bên ít nhất 0,15. Chỉ tính pixel có ≥ 50 % đất canh tác (ESA WorldCover 2021).

/ Terra + Aqua 16-day composites offset by 8 days give one EVI value every 8 days. Per 250 m pixel: fill gaps, Savitzky–Golay
(5 samples = 40 days), then count **season peaks**: a maximum within ±24 days, EVI ≥ 0.35, at least 0.15 above the troughs on
both sides. Only pixels with ≥ 50 % cropland (ESA WorldCover 2021)."""),
    (PY, """PEAK_MIN, AMP_MIN, MIN_VALID = 0.35, 0.15, 0.4

def evi_stack(year):
    \"\"\"EVI (T, n, n) and composite mid-dates, 1 Sep of year-1 .. 1 Mar of year+1.\"\"\"
    col = (ee.ImageCollection('MODIS/061/MOD13Q1').merge(ee.ImageCollection('MODIS/061/MYD13Q1'))
           .filterDate(f'{year - 1}-09-01', f'{year + 1}-03-01').filterBounds(FRAME).sort('system:time_start'))
    starts = col.aggregate_array('system:time_start').getInfo()
    good = col.map(lambda im: im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1)))
    bands = pixels(good.toBands().setDefaultProjection(col.first().select('EVI').projection()), 250)
    evi = np.stack(list(bands.values()))
    dates = np.array(starts, 'datetime64[ms]').astype('datetime64[D]') + np.timedelta64(8, 'D')  # giữa kỳ / mid-point
    return evi, dates

def fill_gaps(y):
    \"\"\"Linear interpolation over NaN along axis 0 (T, N); the ends take the nearest valid value.\"\"\"
    out = y.copy()
    t = np.arange(len(y))
    for j in range(y.shape[1]):
        ok = ~np.isnan(y[:, j])
        if ok.any():
            out[:, j] = np.interp(t, t[ok], y[ok, j])
    return out

smooth = lambda y: savgol_filter(fill_gaps(y), 5, 2, axis=0)

def peaks(s):
    \"\"\"Boolean (T, N): season peaks of the smoothed series s (T, N).\"\"\"
    T = len(s)
    pad = np.pad(s, ((8, 8), (0, 0)), mode='edge')
    win = lambda a, b: np.stack([pad[8 + k: 8 + k + T] for k in range(a, b + 1)])
    local_max = s >= win(-3, 3).max(0)
    rising = s > pad[7:7 + T]                                     # đỉnh phẳng chỉ tính một lần / flat tops count once
    trough = np.maximum(win(-8, -1).min(0), win(1, 6).min(0))
    return local_max & rising & (s >= PEAK_MIN) & (s - trough >= AMP_MIN)

crop = pixels(ee.ImageCollection('ESA/WorldCover/v200').first().eq(40)
              .reduceResolution(ee.Reducer.mean(), maxPixels=1024), 250)['Map'] >= 0.5

stacks, counts = {}, {}
for year in (2016, 2024):
    evi, dates = stacks[year] = evi_stack(year)
    y = evi.reshape(len(evi), -1)
    in_year = (dates >= np.datetime64(f'{year}-01-01')) & (dates <= np.datetime64(f'{year}-12-31'))
    sel = crop.ravel() & ((~np.isnan(y[in_year])).mean(0) >= MIN_VALID)
    c = np.full(y.shape[1], np.nan)
    c[sel] = np.minimum(peaks(smooth(y[:, sel]))[in_year].sum(0), 3)
    counts[year] = c.reshape(evi.shape[1:])
    share = [np.mean(c[sel] == k) * 100 for k in range(4)]
    print(f'{year}: {len(dates)} composites, {sel.sum()} cropland pixels; 0/1/2/3+ seasons:',
          ' / '.join(f'{s:.0f} %' for s in share))

cmap = plt.matplotlib.colors.ListedColormap(['#bbbbbb', '#e69f00', '#009e73', '#0072b2'])
fig, ax = plt.subplots(1, 2, figsize=(10, 5), layout='constrained')
for a, year in zip(ax, counts):
    im = a.imshow(counts[year], cmap=cmap, vmin=-0.5, vmax=3.5); a.set_title(f'Số vụ / seasons {year}'); a.set_axis_off()
fig.colorbar(im, ax=ax, ticks=[0, 1, 2, 3], shrink=0.7)
plt.show()"""),
    (MD, """Chương 4 báo tỉ lệ cho **toàn ĐBSCL** (3 vụ trở lên: 25 % năm 2016 → 35 % năm 2024). Khung 10 km này ở vùng đê bao
thượng nguồn: khi chạy (11/2026) nó cho khoảng 36 % pixel 3 vụ ở cả hai năm, tức đã làm 3 vụ từ trước 2016.
/ Chapter 4 quotes shares for the **whole Mekong Delta** (3+ seasons: 25 % in 2016 → 35 % in 2024). This 10 km frame lies in the
upstream dyked zone: when run (Nov 2026) it gave about 36 % three-season pixels in both years, i.e. triple cropping before 2016.

## 2. Chuỗi thời gian một ô ruộng / Time series of one field block

Ô 500 m có biên độ VH lớn nhất trong khung (giống Hình 4.2). Sentinel-2: trung bình ô các pixel không mây (Cloud Score+ `cs_cdf ≥ 0,6`),
chỉ giữ ngày ≥ 80 % ô không mây. Sentinel-1: quỹ đạo 26, trung bình **theo công suất tuyến tính** rồi đổi sang dB.
/ The 500 m block with the largest VH range in the frame (as in Figure 4.2). Sentinel-2: block mean of clear pixels, dates with
≥ 80 % clear. Sentinel-1: orbit 26, averaged **in linear power**, then converted to dB."""),
    (PY, """BOX = ee.Geometry.Rectangle([105.10811, 10.48737, 105.11267, 10.49186])
SERIES = ('2023-09-01', '2025-01-01')

def s2_row(im):
    r = im.select(['B2', 'B4', 'B8', 'B11']).divide(10000)
    b, red, nir, sw = (r.select(x) for x in ('B2', 'B4', 'B8', 'B11'))
    idx = ee.Image.cat([
        nir.subtract(red).divide(nir.add(red)).rename('ndvi'),
        nir.subtract(red).multiply(2.5).divide(nir.add(red.multiply(6)).subtract(b.multiply(7.5)).add(1)).rename('evi'),
        nir.subtract(sw).divide(nir.add(sw)).rename('lswi')])
    ok = im.select('cs_cdf').gte(0.6)
    st = idx.updateMask(ok).reduceRegion(ee.Reducer.mean(), BOX, 10)
    return ee.Feature(None, st.set('clear', ok.reduceRegion(ee.Reducer.mean(), BOX, 10).get('cs_cdf'))
                              .set('t', im.date().format('YYYY-MM-dd')))

cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
s2 = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(BOX).filterDate(*SERIES).linkCollection(cs, ['cs_cdf']))
rows = {}
for f in s2.map(s2_row).filter(ee.Filter.gte('clear', 0.8)).getInfo()['features']:
    rows.setdefault(f['properties']['t'], f['properties'])          # một dòng mỗi ngày (các ô ảnh chồng nhau) / one row per day
s2_rows = [rows[d] for d in sorted(rows)]

def s1_row(im):
    lin = im.select(['VH', 'VV']).multiply(math.log(10) / 10).exp()   # dB → công suất / power
    m = lin.reduceRegion(ee.Reducer.mean(), BOX, 10)
    return ee.Feature(None, {'t': im.date().format('YYYY-MM-dd'), 'VH': m.get('VH'), 'VV': m.get('VV')})

s1 = (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(BOX).filterDate(*SERIES)
      .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.eq('relativeOrbitNumber_start', 26)))
s1_rows = sorted((f['properties'] for f in s1.map(s1_row).getInfo()['features']), key=lambda p: p['t'])
vh = np.array([10 * math.log10(p['VH']) for p in s1_rows])
d1 = np.array([p['t'] for p in s1_rows], 'datetime64[D]')
d2 = np.array([p['t'] for p in s2_rows], 'datetime64[D]')
print(len(s2_rows), 'ngày S2 / S2 dates,', len(s1_rows), 'ngày S1 / S1 dates')
print('VH thấp nhất / lowest VH:', round(vh.min(), 2), 'dB on', d1[vh.argmin()])
k = int(np.argmax([p['ndvi'] for p in s2_rows]))
print('NDVI cao nhất / highest NDVI:', round(s2_rows[k]['ndvi'], 3), 'on', d2[k])

def with_gaps(d, v, gap=40):
    \"\"\"Insert NaN where two dates are > gap days apart, so the line is not drawn across the gap.\"\"\"
    d, v = list(d), list(v)
    for i in range(len(d) - 1, 0, -1):
        if (d[i] - d[i - 1]).astype(int) > gap:
            d.insert(i, d[i - 1] + np.timedelta64(1, 'D')); v.insert(i, np.nan)
    return d, v

fig, ax = plt.subplots(2, 1, figsize=(11, 6), sharex=True, layout='constrained')
for key, c, m in [('ndvi', '#009e73', 'o'), ('evi', '#e69f00', 's'), ('lswi', '#0072b2', '^')]:
    ax[0].plot(*with_gaps(d2, [p[key] for p in s2_rows]), marker=m, ms=4, color=c, label=key.upper())
ax[0].set_ylim(-0.2, 1); ax[0].legend(ncol=3); ax[0].grid(alpha=.3); ax[0].set_title('Sentinel-2')
ax[1].plot(*with_gaps(d1, vh), 's-', ms=4, color='#0072b2'); ax[1].set_ylabel('VH σ⁰ (dB)'); ax[1].grid(alpha=.3)
ax[1].set_title('Sentinel-1, orbit 26')
plt.show()"""),
    (MD, """## 3. Ngày bắt đầu vụ / Start of season (SOS)

Vụ Đông Xuân 2023–24: đỉnh EVI cao nhất trong 1/12/2023 – 15/3/2024, đáy = cực tiểu của 12 mẫu (96 ngày) trước đỉnh,
SOS(f) = lần đầu chuỗi đã làm trơn vượt `đáy + f × (đỉnh − đáy)`, nội suy tuyến tính giữa hai mẫu.
/ Winter–spring 2023–24: highest EVI peak in 1 Dec 2023 – 15 Mar 2024, trough = minimum of the 12 samples before it,
SOS(f) = first time the smoothed curve reaches `trough + f × (peak − trough)`, linearly interpolated."""),
    (PY, """FRACS = (0.0, 0.2, 0.5)
evi, dates = stacks[2024]
days = (dates - np.datetime64('2024-01-01')).astype(float)       # ngày tính từ 1/1/2024 / days from 1 Jan 2024
y = evi.reshape(len(evi), -1)
sel = np.flatnonzero(crop.ravel() & ((~np.isnan(y)).mean(0) >= MIN_VALID))
s = smooth(y[:, sel])
pk = peaks(s) & ((days >= -31) & (days <= 74))[:, None]

def sos_one(v, ip, f):
    it = max(ip - 12, 0) + int(np.argmin(v[max(ip - 12, 0):ip]))   # đáy / trough
    target = v[it] + f * (v[ip] - v[it])
    for i in range(it, ip + 1):
        if v[i] >= target:
            if i == it:
                return days[i]
            return days[i - 1] + (target - v[i - 1]) / (v[i] - v[i - 1]) * (days[i] - days[i - 1])

sos = np.full((len(FRACS), y.shape[1]), np.nan)
for j in range(s.shape[1]):
    if pk[:, j].any():
        ip = int(np.argmax(np.where(pk[:, j], s[:, j], -np.inf)))
        for fi, f in enumerate(FRACS):
            sos[fi, sel[j]] = sos_one(s[:, j], ip, f)
day = lambda d: str(np.datetime64('2024-01-01') + np.timedelta64(int(round(d)), 'D'))
for f, v in zip(FRACS, sos):
    print(f'f = {f}: {np.sum(~np.isnan(v))} pixels, median SOS {day(np.nanmedian(v))}')

fig, ax = plt.subplots(1, 3, figsize=(13, 4.5), layout='constrained')
for a, f, v in zip(ax, FRACS, sos):
    im = a.imshow(v.reshape(evi.shape[1:]), cmap='viridis', vmin=-60, vmax=20); a.set_title(f'SOS, f = {f}'); a.set_axis_off()
fig.colorbar(im, ax=ax, shrink=0.7, label='ngày từ 1/1/2024 / days from 1 Jan 2024')
plt.show()"""),
    (MD, """Chương 4 báo trung vị **toàn ĐBSCL**: 17/11/2023 (f = 0), 9/12 (f = 0,2), 23/12 (f = 0,5). Khung 10 km này cho kết quả rất gần
(17/11, 10/12, 23/12 khi chạy 11/2026); đó là trùng hợp, khung khác sẽ có lịch khác. Khoảng cách giữa f = 0 và f = 0,5 vẫn hơn một tháng.
/ Chapter 4 quotes **delta-wide** medians: 17 Nov 2023 (f = 0), 9 Dec (f = 0.2), 23 Dec (f = 0.5). This frame gives almost the same
(17 Nov, 10 Dec, 23 Dec when run in Nov 2026), by coincidence: other frames have other calendars. The f = 0 to f = 0.5 gap is still over a month.

## 4. Bản đồ lúa từ biên độ VH / Rice map from the seasonal VH range

Lúa đi từ ruộng ngập (VH ≈ −22 dB) tới tán dày (≈ −14 dB), nên **biên độ** VH trong vụ lớn; vườn cây, làng, mặt nước gần như phẳng.
Biên độ = p90 − p10 của các ảnh vụ Đông Xuân (1/11/2023 – 1/4/2024), sau lọc trung bình 3 × 3 theo công suất.
/ Rice goes from flooded (VH ≈ −22 dB) to a full canopy (≈ −14 dB), so its seasonal VH **range** is large; orchards, villages and
water stay flat. Range = p90 − p10 of the winter–spring acquisitions, after a 3 × 3 mean in linear power."""),
    (PY, """season = (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(FRAME).filterDate('2023-11-01', '2024-04-01')
          .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.eq('relativeOrbitNumber_start', 26)))
print(season.size().getInfo(), 'ảnh S1 trong vụ / S1 scenes in the season')
lin = season.map(lambda im: im.select('VH').multiply(math.log(10) / 10).exp().focalMean(1, 'square', 'pixels'))
pc = lin.reduce(ee.Reducer.percentile([10, 90]))
rng = pc.select('VH_p90').log10().subtract(pc.select('VH_p10').log10()).multiply(10).rename('dvh')
dvh = pixels(rng.setDefaultProjection(season.first().select('VH').projection()), 10)['dvh']

def otsu(v, lo, hi, bins=256):
    \"\"\"Otsu threshold on a histogram of v over [lo, hi] (same as the chapter's ThresholdLab).\"\"\"
    h, _ = np.histogram(v[~np.isnan(v)], bins, (lo, hi))
    i = np.arange(bins)
    w0 = np.cumsum(h); w1 = w0[-1] - w0
    s0 = np.cumsum(h * i)
    with np.errstate(divide='ignore', invalid='ignore'):
        between = w0 * w1 * (s0 / w0 - (s0[-1] - s0) / w1) ** 2
    return lo + (np.nanargmax(between) + 1) * (hi - lo) / bins

th = round(otsu(dvh, 0, 20) / 0.5) * 0.5                          # ô 0,5 dB như hình 4.4 / 0.5 dB steps as in Figure 4.4
ha = pixel_ha(10)[:, None] * np.ones_like(dvh)
valid = ~np.isnan(dvh)
for t in (th, 5, 8):
    rice = valid & (dvh > t)
    print(f'ngưỡng / threshold {t} dB: lúa / rice {ha[rice].sum():,.0f} ha of {ha[valid].sum():,.0f} ({100 * ha[rice].sum() / ha[valid].sum():.1f} %)'
          + (' [Otsu]' if t == th else ''))

fig, ax = plt.subplots(1, 3, figsize=(16, 5), layout='constrained')
im = ax[0].imshow(dvh, cmap='viridis', vmin=0, vmax=15); ax[0].set_title('Biên độ VH / VH range (dB)'); fig.colorbar(im, ax=ax[0], shrink=0.7)
ax[1].hist(dvh[valid], 100, (0, 20), color='#888'); ax[1].axvline(th, color='#e69f00', ls='--', label=f'Otsu {th} dB')
ax[1].legend(); ax[1].set_xlabel('dB')
ax[2].imshow(np.where(valid, dvh > th, np.nan), cmap='Blues', vmin=0, vmax=1.4); ax[2].set_title(f'Lúa / rice: VH range > {th} dB')
for a in (ax[0], ax[2]): a.set_axis_off()
plt.show()"""),
    (MD, """Hình 4.4 trong chương cho cùng ngưỡng Otsu 9 dB nhưng 5.934 ha (56,6 %). Lớp bản đồ trên trang web lưu biên độ theo bước 0,1 dB,
nên các pixel ngay trên 9 dB bị làm tròn về 9,0 và rơi ra ngoài lớp lúa: chênh khoảng 40 ha (< 1 %).
/ Figure 4.4 gives the same 9 dB Otsu threshold but 5,934 ha (56.6 %). The web layer stores the range in 0.1 dB steps, so pixels just
above 9 dB round to 9.0 and drop out of the rice class: a difference of about 40 ha (< 1 %).

## 5. Từ bản đồ đến diện tích / From map to area

Đếm pixel cho **diện tích bản đồ**, không phải diện tích thật: lỗi bỏ sót và lỗi gán nhầm không triệt tiêu nhau.
Với một mẫu điểm kiểm tra phân tầng theo lớp bản đồ, ước lượng của Olofsson et al. (2014) sửa thiên lệch và cho sai số chuẩn.

Ma trận dưới đây là **số liệu minh họa** (giống mặc định của Hình 4.6), không phải điểm kiểm tra thực địa.
Diện tích bản đồ là của bản đồ số vụ 2024 toàn ĐBSCL (Chương 4, `scripts/rice_numbers.ts`).

/ Counting pixels gives the **map area**, not the true area: omission and commission errors do not cancel. With a check sample
stratified by map class, the Olofsson et al. (2014) estimator removes the bias and gives a standard error. The matrix below is
**illustrative** (the default of Figure 4.6), not field data. Mapped areas are from the 2024 Mekong seasons map."""),
    (PY, """def estimate_area(n, mapped):
    \"\"\"n[i][j] = points mapped as class i, reference class j; mapped[i] = map area of class i.
    Returns area and SE of each reference class, user's, producer's and overall accuracy.\"\"\"
    n, mapped = np.asarray(n, float), np.asarray(mapped, float)
    W = mapped / mapped.sum()                       # tỉ lệ diện tích bản đồ / map area weights
    ni = n.sum(1, keepdims=True)
    p = W[:, None] * n / ni                         # tỉ lệ diện tích từng ô / cell area proportions
    pj = p.sum(0)
    f = n / ni
    se = np.sqrt((W[:, None] ** 2 * f * (1 - f) / (ni - 1)).sum(0)) * mapped.sum()
    return pj * mapped.sum(), se, np.diag(n) / ni.ravel(), np.diag(p) / pj, np.trace(p)

N = [[88, 12],   # bản đồ = lúa: 88 điểm là lúa, 12 không / map = rice: 88 rice, 12 not  (MINH HỌA / ILLUSTRATIVE)
     [9, 91]]    # bản đồ = khác: 9 điểm là lúa, 91 không / map = other: 9 rice, 91 not
MAPPED = [1_692_000, 170_000]   # ha, ĐBSCL 2024: lúa ≥ 1 vụ, đất canh tác khác / Mekong 2024: rice ≥ 1 season, other cropland
area, se, ua, pa, oa = estimate_area(N, MAPPED)
print(f'diện tích bản đồ / map area: {MAPPED[0] / 1e3:,.0f} thousand ha')
print(f'ước lượng / estimate: {area[0] / 1e3:,.0f} ± {1.96 * se[0] / 1e3:,.0f} thousand ha (95 %)')
print(f'UA {100 * ua[0]:.1f} %, PA {100 * pa[0]:.1f} %, OA {100 * oa:.1f} %')

# cùng ma trận trên bản đồ lúa 10 m của mục 4 / the same matrix on the 10 m rice map of section 4
site = [ha[valid & (dvh > th)].sum(), ha[valid & (dvh <= th)].sum()]
a2, se2, *_ = estimate_area(N, site)
print(f'khung An Giang / An Giang frame: map {site[0]:,.0f} ha -> estimate {a2[0]:,.0f} ± {1.96 * se2[0]:,.0f} ha (95 %)')"""),
    (MD, """## Bài tập / Exercises

1. Đổi khung sang Nam Định (`LON, LAT = 106.42, 20.22`, quỹ đạo Sentinel-1 **91**, vụ Xuân 15/1 – 1/7/2024). Ngưỡng Otsu thay đổi thế nào? Vì sao ruộng nhỏ làm biên độ "pha loãng"? / Move the frame to Nam Dinh (orbit 91, spring season). How does the Otsu threshold change, and why do small fields dilute the range?
2. Ở mục 1, đổi `AMP_MIN` thành 0,10 và 0,20. Tỉ lệ pixel 3 vụ thay đổi bao nhiêu? Ngưỡng nào hợp lý hơn? / Try `AMP_MIN` = 0.10 and 0.20. How much does the 3-season share change?
3. Ở mục 5, giữ nguyên tổng số điểm (200) nhưng chia 50 / 150 thay vì 100 / 100. Sai số chuẩn tăng hay giảm? / Keep 200 points but split them 50 / 150. Does the standard error go up or down?

*Contains modified Copernicus Sentinel data 2023–2024. MODIS MOD13Q1/MYD13Q1 v061: NASA LP DAAC. ESA WorldCover 10 m 2021 v200.*"""),
]

if __name__ == "__main__":
    main(CELLS, "rice_seasons")
