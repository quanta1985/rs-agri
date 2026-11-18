"""Generate labs/flood_water.ipynb (Colab) for Chapter 8 (flood). The GEE twin is labs/flood_water.js (hand-written).

    cd scripts && python build_lab_flood.py           # write the notebook
    cd scripts && python build_lab_flood.py --run     # also execute the code cells locally (needs EE auth)
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 8 — Nước mặt & lũ / Surface water & floods

**Viễn thám Nông nghiệp & Môi trường — Chương 8** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/flood/)

1. Tần suất và tính mùa của nước (JRC GSW) ở khung Tri Tôn, An Giang / Water occurrence and seasonality (JRC GSW), Tri Ton frame.
2. Nước từ quang học (MNDWI) và radar (VV) cùng ngày 26/10/2024, ngưỡng Otsu / Optical (MNDWI) vs radar (VV) water on the same day, Otsu threshold.
3. Diện tích nước theo tháng, tỉnh An Giang, 2018 và 2024 / Monthly water area, An Giang province, 2018 and 2024.
4. Bão Yagi: nước mới trên đất canh tác ở Nho Quan – Gia Viễn (Ninh Bình) / Typhoon Yagi: new water on cropland in Nho Quan – Gia Vien (Ninh Binh)."""),
    (PY, """import ee
import numpy as np
import matplotlib.pyplot as plt

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)"""),
    (MD, """## 0. Khung ảnh và công cụ / Frames and helpers

Khung 10,24 × 10,24 km trên lưới Web Mercator (EPSG:3857), giống hệt các bản đồ trong chương, nên số ha so được với chương.
Diện tích mặt đất của một pixel giảm theo cos²(vĩ độ). / Same 10.24 km Web Mercator frames as the chapter's maps, so the
hectares compare; a pixel's ground area shrinks with cos²(latitude)."""),
    (PY, """R = 6378137.0
SITES = {'angiang': (105.08, 10.45), 'ninhbinh': (105.795, 20.329)}   # tâm khung / frame centre (lon, lat)

def frame(site, ground_res=10, size_m=10240):
    lon, lat = SITES[site]
    res = ground_res / np.cos(np.radians(lat))           # bước lưới Mercator / Mercator step
    n = round(size_m / ground_res)
    mx, my = R * np.radians(lon), R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    x0 = np.floor((mx - n * res / 2) / res) * res
    y1 = np.ceil((my + n * res / 2) / res) * res
    y = y1 - (np.arange(n) + 0.5) * res
    row_lat = 2 * np.arctan(np.exp(y / R)) - np.pi / 2
    return {'x0': x0, 'y1': y1, 'res': res, 'n': n, 'ha': ((res * np.cos(row_lat)) ** 2 / 1e4)[:, None],
            'geom': ee.Geometry.Rectangle([x0, y1 - n * res, x0 + n * res, y1], 'EPSG:3857', False)}

def pixels(img, f):
    arr = ee.data.computePixels({'expression': img, 'fileFormat': 'NUMPY_NDARRAY',
        'grid': {'dimensions': {'width': f['n'], 'height': f['n']}, 'crsCode': 'EPSG:3857',
                 'affineTransform': {'scaleX': f['res'], 'shearX': 0, 'translateX': f['x0'],
                                     'shearY': 0, 'scaleY': -f['res'], 'translateY': f['y1']}}})
    return {b: arr[b].astype('float32') for b in arr.dtype.names}

def ha(mask, f):
    return float((mask * f['ha']).sum())

def otsu(v, lo, hi, bins=256):
    h, _ = np.histogram(v[np.isfinite(v)], bins, (lo, hi))
    i = np.arange(bins); w0 = np.cumsum(h); w1 = h.sum() - w0
    m0 = np.cumsum(h * i) / np.maximum(w0, 1); m1 = ((h * i).sum() - np.cumsum(h * i)) / np.maximum(w1, 1)
    k = np.argmax(np.where((w0 > 0) & (w1 > 0), w0 * w1 * (m0 - m1) ** 2, -1))
    return lo + (k + 1) * (hi - lo) / bins

AG = frame('angiang')
print('khung An Giang / An Giang frame:', round(AG['ha'].sum() * AG['n']), 'ha')"""),
    (MD, """## 1. Nước có thường xuyên không? JRC Global Surface Water / How often is there water?

`occurrence` = % số tháng có quan sát mà ô có nước (1984–2021); `seasonality` = số tháng có nước trong năm 2021.
/ `occurrence` = % of observed months with water (1984–2021); `seasonality` = months with water in 2021."""),
    (PY, """AG30 = frame('angiang', 30)
gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select(['occurrence', 'seasonality']).unmask(0)
g = pixels(gsw, AG30)
occ, sea = g['occurrence'], g['seasonality']
total = AG30['ha'].sum() * AG30['n']
print(f'từng có nước / ever water: {100 * ha(occ > 0, AG30) / total:.1f} % khung / of frame')
print(f'nước thường xuyên (occurrence ≥ 90 %) / permanent water: {ha(occ >= 90, AG30):.0f} ha')
print(f'nước theo mùa 2021 (1–9 tháng) / seasonal water 2021 (1–9 months): {ha((sea >= 1) & (sea < 10), AG30):.0f} ha')

fig, ax = plt.subplots(1, 2, figsize=(12, 5.5), layout='constrained')
for a, v, t, vmax in [(ax[0], occ, 'occurrence (%)', 100), (ax[1], sea, 'seasonality 2021 (tháng / months)', 12)]:
    im = a.imshow(np.where(v > 0, v, np.nan), cmap='Blues', vmin=0, vmax=vmax); a.set_title(t); a.set_axis_off()
    fig.colorbar(im, ax=a, shrink=0.7)
plt.show()"""),
    (MD, """## 2. MNDWI và radar cùng ngày 26/10/2024 / MNDWI vs radar on 26 Oct 2024

MNDWI = (Lục − SWIR) / (Lục + SWIR) = (B3 − B11) / (B3 + B11): nước > ngưỡng. Radar VV: nước phẳng phản xạ gương nên tối, < ngưỡng.
Ngưỡng tìm bằng Otsu, làm tròn như hình 8.2 của chương (0,02 cho MNDWI, 0,25 dB cho VV).
/ Water is above the MNDWI threshold and below the VV threshold. Otsu thresholds, rounded as in the chapter's Figure 8.2."""),
    (PY, """cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
s2 = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(AG['geom'])
      .filterDate('2024-10-26', '2024-10-27').linkCollection(cs, ['cs_cdf']).mosaic())
mndwi = s2.normalizedDifference(['B3', 'B11']).updateMask(s2.select('cs_cdf').gte(0.6)).rename('mndwi')
s1 = (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(AG['geom']).filterDate('2024-10-26', '2024-10-27')
      .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.eq('relativeOrbitNumber_start', 26))
      .mosaic().select('VV'))
p = pixels(ee.Image.cat([mndwi, s1]).unmask(-999), AG)
m = np.where(p['mndwi'] < -998, np.nan, p['mndwi']); vv = np.where(p['VV'] < -998, np.nan, p['VV'])

tM = round(otsu(m, -0.8, 0.8) / 0.02) * 0.02
tV = round(otsu(vv, -30, 0) / 0.25) * 0.25
wM, wV = m > tM, vv < tV
ok = np.isfinite(m) & np.isfinite(vv)
print(f'MNDWI: Otsu {tM:.2f} -> {ha(wM, AG):.0f} ha nước / water')
print(f'VV   : Otsu {tV:.2f} dB -> {ha(wV, AG):.0f} ha nước / water')
print(f'trùng khớp / agreement: {100 * (wM == wV)[ok].mean():.1f} %  '
      f'(chỉ MNDWI / MNDWI only {100 * (wM & ~wV)[ok].mean():.1f} %, chỉ radar / radar only {100 * (~wM & wV)[ok].mean():.1f} %)')

fig, ax = plt.subplots(1, 3, figsize=(16, 5.5), layout='constrained')
ax[0].imshow(m, cmap='gray', vmin=-0.6, vmax=0.6); ax[0].set_title('MNDWI 2024-10-26')
ax[1].imshow(vv, cmap='gray', vmin=-25, vmax=0); ax[1].set_title('S1 VV (dB) 2024-10-26')
agree = np.full(m.shape + (3,), 0.9); agree[wM & wV] = [0, 0.45, 0.7]; agree[wM & ~wV] = [0.9, 0.62, 0]; agree[~wM & wV] = [0.8, 0.47, 0.65]
ax[2].imshow(agree); ax[2].set_title('xanh: cả hai / blue: both · cam: MNDWI · hồng: radar')
for a in ax: a.set_axis_off()
plt.show()"""),
    (MD, """Hình 8.2 của chương cho 5 855 ha (MNDWI, ngưỡng 0,06), 5 980 ha (VV, −15,5 dB) và 85,1 % trùng khớp. MNDWI ở đây trùng
đúng. VV lệch một chút (ngưỡng −15,25 dB, khoảng 6 200 ha, 84,7 %) vì lớp radar trên trang web được làm tròn theo bước 0,15 dB
để nhẹ hơn, làm histogram và ngưỡng Otsu dịch nhẹ. Bài học: ngưỡng Otsu nhạy với cách lượng tử hóa và khoảng histogram.
/ The chapter's Figure 8.2 gives 5,855 ha (MNDWI, 0.06), 5,980 ha (VV, −15.5 dB) and 85.1 % agreement. MNDWI matches exactly.
VV differs slightly (−15.25 dB, about 6,200 ha, 84.7 %) because the web layer stores radar in 0.15 dB steps, which shifts the
histogram and the Otsu threshold. Lesson: Otsu thresholds are sensitive to quantisation and the histogram range."""),
    (MD, """## 3. Diện tích nước theo tháng, tỉnh An Giang / Monthly water area, An Giang province

Phiên bản thu nhỏ của chuỗi toàn ĐBSCL 2016–2025 trong mục 8.3: một tỉnh, hai năm. Trung vị VV mọi quỹ đạo trong tháng,
VV < −18 dB, độ dốc < 5°, ở ~100 m. Ruộng lúa đang ngập cũng là "nước".
/ A small version of the chapter's delta-wide 2016–2025 series (section 8.3): one province, two years. Monthly median VV of
all orbits, VV < −18 dB, slope < 5°, at ~100 m. Flooded paddies count as water."""),
    (PY, """prov = (ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1')
        .filter(ee.Filter.eq('shapeGroup', 'VNM')).filter(ee.Filter.eq('shapeName', 'An Giang')).geometry())
flat = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003')).lt(5)
col = (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(prov).filter(ee.Filter.eq('instrumentMode', 'IW'))
       .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')).select('VV'))
proj = col.first().projection().atScale(100)
YEARS, MONTHS = [2018, 2024], list(range(7, 13))

def water_ha(y, mo):
    start = ee.Date.fromYMD(y, mo, 1)
    w = col.filterDate(start, start.advance(1, 'month')).median().lt(-18).updateMask(flat).setDefaultProjection(proj)
    return w.multiply(ee.Image.pixelArea()).divide(1e4).reduceRegion(ee.Reducer.sum(), prov, 100, maxPixels=1e9).get('VV')

area = np.array(ee.List([water_ha(y, mo) for y in YEARS for mo in MONTHS]).getInfo()).reshape(len(YEARS), -1) / 1000
for y, row in zip(YEARS, area):
    print(y, 'nghìn ha / thousand ha:', ' '.join(f'{v:.0f}' for v in row), '| đỉnh / peak', f'{row.max():.0f}')

plt.figure(figsize=(8, 3.5))
for y, row, s in zip(YEARS, area, ['o-', 's--']):
    plt.plot(MONTHS, row, s, label=str(y))
plt.xticks(MONTHS); plt.xlabel('tháng / month'); plt.ylabel('nghìn ha / thousand ha')
plt.title('An Giang: nước mặt theo tháng (radar) / monthly surface water'); plt.legend(); plt.grid(alpha=.3); plt.show()"""),
    (MD, """Chương (Hình 8.4) cho đỉnh An Giang 81 nghìn ha năm 2018 và 62 nghìn ha năm 2024, tính từ ô 250 m với ranh tỉnh năm 2008.
Ở đây tổng trực tiếp ở 100 m trong ranh geoBoundaries của Earth Engine nên số thấp hơn khoảng 10 % (đỉnh 73 và 56 nghìn ha);
điều đáng so là hình dạng mùa lũ và chênh lệch giữa hai năm.
/ The chapter (Figure 8.4) gives An Giang peaks of 81 thousand ha (2018) and 62 thousand ha (2024), from 250 m cells and the 2008
outline. Here the sum is taken at 100 m within the geoBoundaries outline in Earth Engine, so the values are about 10 % lower
(peaks of 73 and 56 thousand ha); compare the shape of the season and the gap between the years."""),
    (MD, """## 4. Bão Yagi: nước mới trên đất canh tác / Typhoon Yagi: new water on cropland

Hai ảnh cùng quỹ đạo 91 (xuống), 31/8 và 12/9/2024. Nước mới = nước ngày sau, không phải nước ngày trước. Đất canh tác =
lớp 40 của ESA WorldCover 2021. Khung có núi đá vôi nên bỏ vùng dốc > 5° (bóng radar trông như nước).
/ Same orbit 91 (descending), 31 Aug and 12 Sep 2024. New water = water after, not before. Cropland = ESA WorldCover 2021
class 40. The frame has limestone hills, so slopes > 5° are dropped (radar shadow looks like water)."""),
    (PY, """ND = frame('ninhbinh')
def s1_day(day):
    d = ee.Date(day)
    return (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(ND['geom']).filterDate(d, d.advance(1, 'day'))
            .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.eq('relativeOrbitNumber_start', 91))
            .mosaic().select('VV'))
crop = ee.ImageCollection('ESA/WorldCover/v200').first().eq(40).rename('crop')
y = pixels(ee.Image.cat([s1_day('2024-08-31').rename('pre'), s1_day('2024-09-12').rename('post'), crop,
                       flat.rename('flat')]).unmask(-999), ND)
ok = (y['pre'] > -998) & (y['post'] > -998) & (y['flat'] == 1)
before, after = ok & (y['pre'] < -18), ok & (y['post'] < -18)
new = after & ~before
on_crop = new & (y['crop'] == 1)
print(f'nước trước / water before: {ha(before, ND):.0f} ha; sau / after: {ha(after, ND):.0f} ha')
print(f'nước mới / new water: {ha(new, ND):.0f} ha, trên đất canh tác / on cropland: {ha(on_crop, ND):.0f} ha '
      f'({100 * ha(on_crop, ND) / max(ha(new, ND), 1):.0f} %)')

rgb = np.dstack([np.clip((np.where(ok, y['post'], -25) + 25) / 25, 0, 1)] * 3)
rgb[before] = [0, 0.45, 0.7]; rgb[new] = [0.9, 0.62, 0]; rgb[on_crop] = [0.84, 0.37, 0]
plt.figure(figsize=(7, 7)); plt.imshow(rgb); plt.axis('off')
plt.title('Nho Quan – Gia Viễn: xanh = nước trước, cam = nước mới (đậm: trên đất canh tác)\\nblue = water before, orange = new water (dark: on cropland)')
plt.show()"""),
    (MD, """Khung này không có trong chương: đây là ô 10 km có nhiều nước mới nhất trong đồng bằng (trừ vùng triều ven biển Hải Phòng),
dọc sông Hoàng Long. Mục 8.5 tính cả 11 tỉnh châu thổ (51 501 ha nước mới, 23 430 ha trên đất canh tác; Ninh Bình 4 262 ha).
Thử chuyển khung sang ruộng lúa ven biển Nam Định (106,42; 20,22): gần như không có nước mới trên ruộng, vì lúa đang trổ làm
radar **sáng lên** (mục 8.6).
/ This frame is not in the chapter: it is the 10 km window with the most new water in the delta (apart from the Hai Phong tidal
coast), along the Hoang Long river. Section 8.5 covers the 11 delta provinces (51,501 ha new water, 23,430 ha on cropland; Ninh
Binh 4,262 ha). Try the coastal Nam Dinh rice frame (106.42, 20.22): almost no new water on the paddies, because heading rice
makes the radar **brighter** (section 8.6)."""),
    (MD, """## Bài tập / Exercises

1. Ở mục 2, thay ngày 26/10 bằng 14/10/2024 (chỉ radar). Ngưỡng Otsu và diện tích nước thay đổi bao nhiêu? Chương cho −16,5 dB và 6 045 ha.
   / In section 2, use 14 Oct 2024 (radar only). How do the Otsu threshold and the water area change? The chapter gives −16.5 dB and 6,045 ha.
2. Ở mục 3, đổi tỉnh sang `'Long An'` và thêm năm 2017, 2021. Năm nào lũ lớn nhất, nhỏ nhất? (Bản geoBoundaries trên Earth Engine lưu chữ có dấu tiếng Việt thành '?', ví dụ 'Đồng Tháp' thành '??ng Tháp': tỉnh có tên như vậy phải lọc theo tên đã hỏng hoặc chọn bằng một điểm `filterBounds`.) / Switch to Long An and add 2017 and 2021: which year floods most and least? (The geoBoundaries copy in Earth Engine stores Vietnamese letters as '?', e.g. 'Đồng Tháp' becomes '??ng Tháp': select such provinces by the corrupted name or with a point and `filterBounds`.)
3. Ở mục 4, thay ngưỡng −18 dB bằng phát hiện thay đổi (`post − pre < −3 dB`). Nước mới trên đất canh tác khác bao nhiêu? Vì sao lúa đang trổ bông có thể làm radar sáng lên chứ không tối đi?
   / In section 4, replace the −18 dB threshold with change detection (`post − pre < −3 dB`). How much does new water on cropland change? Why can heading rice make the radar brighter rather than darker?

*Contains modified Copernicus Sentinel data 2018–2024. JRC Global Surface Water (Pekel et al. 2016); ESA WorldCover 2021; geoBoundaries (CC BY 4.0).*"""),
]

if __name__ == "__main__":
    main(CELLS, "flood_water")
