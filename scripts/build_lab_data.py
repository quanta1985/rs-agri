"""Generate labs/data_clearsky.ipynb (Colab) for Chapter 2 (data).

    cd scripts && python build_lab_data.py           # write the notebook
    cd scripts && python build_lab_data.py --run     # also execute the code cells locally (needs EE auth)

The GEE Code Editor version of the same steps is labs/data_clearsky.js (kept by hand).
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 2 — Mây, radar và độ thuần pixel / Clouds, radar and pixel purity

**Viễn thám Nông nghiệp & Môi trường — Chương 2** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/data/)

1. Số ngày Sentinel-2 dùng được mỗi tháng (Cloud Score+) ở Nam Định và An Giang / Usable Sentinel-2 days per month (Cloud Score+) at Nam Dinh and An Giang.
2. Số ngày có ảnh Sentinel-1 mỗi năm, 2015–2025 / Sentinel-1 days per year, 2015–2025.
3. Tỉ lệ ô thuần theo kích thước ô, từ WorldCover 10 m / Share of pure cells by cell size, from WorldCover 10 m.

Hai khung 10,24 × 10,24 km giống trang web: Giao Thủy – Hải Hậu (Nam Định) và Tri Tôn (An Giang).
Two 10.24 × 10.24 km frames, the same as on the website: Giao Thuy – Hai Hau (Nam Dinh) and Tri Ton (An Giang)."""),
    (PY, """import ee
import json
import math
import urllib.request
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)

R = 6378137.0
SITES = {'Nam Định': (106.42, 20.22), 'An Giang': (105.08, 10.45)}   # tâm khung / frame centre (lon, lat)
SITE_IDS = {'Nam Định': 'namdinh', 'An Giang': 'angiang'}           # tên trong dữ liệu của trang / ids in the site's data

def site_grid(lon, lat, ground_res=10, size_m=10240):
    \"\"\"Lưới Web Mercator của khung (giống trang web) / the frame's Web Mercator grid (as on the website): x0, y1, res, n.\"\"\"
    res = ground_res / math.cos(math.radians(lat))   # pixel Mercator co lại theo cos(vĩ độ) / Mercator pixels shrink with cos(lat)
    n = round(size_m / ground_res)
    mx, my = R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    x0 = math.floor((mx - n * res / 2) / res) * res
    y1 = math.ceil((my + n * res / 2) / res) * res
    return x0, y1, res, n

def site_box(lon, lat):
    x0, y1, res, n = site_grid(lon, lat, 100)
    return ee.Geometry.Rectangle([x0, y1 - n * res, x0 + n * res, y1], 'EPSG:3857', False).transform('EPSG:4326', 1)

def pixels(img, crs, x0, y1, n_x, n_y, res):
    \"\"\"Tải ảnh về numpy trên một lưới cố định / fetch an image as numpy on a fixed grid (upper-left x0, y1).\"\"\"
    arr = ee.data.computePixels({'expression': img, 'fileFormat': 'NUMPY_NDARRAY',
        'grid': {'dimensions': {'width': n_x, 'height': n_y}, 'crsCode': crs,
                 'affineTransform': {'scaleX': res, 'shearX': 0, 'translateX': x0, 'shearY': 0, 'scaleY': -res, 'translateY': y1}}})
    return {b: arr[b] for b in arr.dtype.names}

# Dữ liệu đã xuất của trang web: lấy từ GitHub (khi kho mã đã công khai) hoặc thư mục public/data cục bộ
# The website's exported data: from GitHub (once the repository is public) or a local public/data folder
BASE = 'https://raw.githubusercontent.com/quanta1985/rs-agri/main/public/data/'
LOCAL = next((p for p in (Path('public/data'), Path('../public/data')) if p.is_dir()), None)

def site_file(name):
    if LOCAL is not None and (LOCAL / name).exists():
        return (LOCAL / name).read_bytes()
    with urllib.request.urlopen(BASE + name, timeout=60) as r:
        return r.read()"""),
    (MD, """## 1. Ngày Sentinel-2 dùng được / Usable Sentinel-2 days

Cách đếm giống Chương 2: mỗi ngày chụp ghép các cảnh lại thành một ảnh, tính ở 60 m.
- **Lần chụp** (look): ảnh phủ ít nhất 50 % khung (bỏ các cảnh chỉ chạm mép khung).
- **Dùng được** (usable): ảnh phủ ít nhất 95 % khung và ít nhất 80 % phần đó quang đãng, tức Cloud Score+ `cs_cdf ≥ 0,6`.

Chương 2 dùng 6 năm 2019–2024. Ở đây chỉ 3 năm (`YEARS`) cho nhanh, khoảng 1 phút.

Counted as in Chapter 2: the scenes of each date are mosaicked into one image, evaluated at 60 m.
- **Look**: the image covers at least 50 % of the frame (scenes that only graze the frame edge are dropped).
- **Usable**: the image covers at least 95 % of the frame and at least 80 % of that is clear, i.e. Cloud Score+ `cs_cdf ≥ 0.6`.

Chapter 2 uses the 6 years 2019–2024. Only 3 years (`YEARS`) are used here, to keep it fast (about a minute)."""),
    (PY, """YEARS = [2022, 2023, 2024]
CS = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')

def s2_days(box, start, end):
    \"\"\"Mỗi ngày chụp một dòng: phần khung có ảnh, phần quang đãng / one row per date: share imaged, share clear.\"\"\"
    col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(box).filterDate(start, end)
           .linkCollection(CS, ['cs_cdf']))
    total = ee.Image.constant(1).reduceRegion(ee.Reducer.count(), box, 60).get('constant')
    days = col.aggregate_array('system:time_start').map(lambda t: ee.Date(t).format('YYYY-MM-dd')).distinct()

    def per_day(d):
        d0 = ee.Date.parse('YYYY-MM-dd', d)
        clear = col.filterDate(d0, d0.advance(1, 'day')).select('cs_cdf').mosaic().gte(0.6)
        st = clear.reduceRegion(ee.Reducer.mean().combine(ee.Reducer.count(), sharedInputs=True), box, 60)
        return ee.Feature(None, {'d': d, 'clear': st.get('cs_cdf_mean'),
                                 'cover': ee.Number(st.get('cs_cdf_count')).divide(total)})

    return [f['properties'] for f in ee.FeatureCollection(days.map(per_day)).getInfo()['features']]

looks, usable = {}, {}
for site, (lon, lat) in SITES.items():
    lk, us = np.zeros((len(YEARS), 12), int), np.zeros((len(YEARS), 12), int)
    for r in s2_days(site_box(lon, lat), f'{YEARS[0]}-01-01', f'{YEARS[-1] + 1}-01-01'):
        y, m = int(r['d'][:4]) - YEARS[0], int(r['d'][5:7]) - 1
        if r['cover'] is None or r['cover'] < 0.5:
            continue
        lk[y, m] += 1
        us[y, m] += r['cover'] >= 0.95 and (r['clear'] or 0) >= 0.8
    looks[site], usable[site] = lk, us

def share(site, months):
    \"\"\"% số lần chụp dùng được trong các tháng / usable share of looks in these months.\"\"\"
    return 100 * usable[site][:, months].sum() / looks[site][:, months].sum()

JAN_APR, MAY_NOV = [0, 1, 2, 3], [4, 5, 6, 7, 8, 9, 10]
for site in SITES:
    m = usable[site].mean(0)
    print(f'{site} {YEARS[0]}–{YEARS[-1]}: ngày dùng được mỗi tháng / usable days per month', ' '.join(f'{v:.1f}' for v in m))
    print(f'  {looks[site].sum(1).mean():.0f} lần chụp/năm / looks a year, {usable[site].sum(1).mean():.1f} dùng được / usable;'
          f' tháng 1–4 / Jan–Apr {share(site, JAN_APR):.0f} %, tháng 5–11 / May–Nov {share(site, MAY_NOV):.0f} % số lần chụp / of looks')

fig, ax = plt.subplots(1, len(SITES), figsize=(6.5 * len(SITES), 4), layout='constrained', sharey=True, squeeze=False)
ax = ax[0]
mon = np.arange(1, 13)
for a, site in zip(ax, SITES):
    a.bar(mon, looks[site].mean(0), color='#cccccc', label='lần chụp / looks')
    a.bar(mon, usable[site].mean(0), color='#0072b2', label='dùng được / usable')
    a.set_xticks(mon); a.set_xlabel('tháng / month'); a.set_title(f'{site}, {YEARS[0]}–{YEARS[-1]}')
ax[0].set_ylabel('ngày / tháng · days / month'); ax[0].legend()
plt.show()"""),
    (MD, """Đối chiếu năm 2024 với dữ liệu của Hình 2.2 (`data-clearsky.json`). Cùng quy tắc, cùng khung, nên các số phải trùng.

Check 2024 against the data behind Figure 2.2 (`data-clearsky.json`). Same rule, same frames, so the numbers should be identical."""),
    (PY, """sky = json.loads(site_file('data-clearsky.json'))
for site in SITES:
    ch = sky['sites'][SITE_IDS[site]]
    k = sky['years'].index(2024)
    lab_row = usable[site][YEARS.index(2024)].tolist()
    print(f'{site} 2024 dùng được / usable — lab:     ', lab_row)
    print(f'{site} 2024 dùng được / usable — chương:  ', ch['s2_usable'][k], '(trùng / identical)' if ch['s2_usable'][k] == lab_row else '(khác / differs)')"""),
    (MD, """Chương 2 (trung bình 2019–2024): Nam Định có 33,0 ngày dùng được trên 145 lần chụp mỗi năm; tháng 1–4 chỉ 10 % số lần chụp dùng được, tháng 5–11 là 30 %. An Giang có 21,5 ngày trên 72 lần chụp; tháng 1–4 là 42 %, tháng 5–11 là 20 %. Lần chạy 2022–2024 khi soạn bài cho Nam Định 10 % / 30 %, An Giang 46 % / 18 %: số hơi khác vì mây mỗi năm một khác, nhưng mùa mây ngược nhau giữa hai châu thổ vẫn hiện rõ.

Nam Định được chụp gấp đôi An Giang (khoảng 12 lần mỗi tháng so với 6) vì nằm ở chỗ hai quỹ đạo Sentinel-2 chồng nhau. Vì vậy hãy so **tỉ lệ** dùng được, không so số ngày. Quy tắc `cs_cdf ≥ 0,6` cho qua một phần mù và mây mỏng: số ngày tháng 6–7 ở Nam Định có thể hơi lạc quan.

Chapter 2 (2019–2024 means): Nam Dinh has 33.0 usable days out of 145 looks a year; in Jan–Apr only 10 % of the looks are usable, in May–Nov 30 %. An Giang has 21.5 usable days out of 72 looks; Jan–Apr 42 %, May–Nov 20 %. The 2022–2024 run made while writing this lab gave Nam Dinh 10 % / 30 % and An Giang 46 % / 18 %: slightly different because clouds vary from year to year, but the opposite cloud seasons of the two deltas still show.

Nam Dinh is imaged twice as often as An Giang (about 12 looks a month against 6) because it lies where two Sentinel-2 orbits overlap. So compare **shares** of usable looks, not day counts. The `cs_cdf ≥ 0.6` rule lets some haze and thin cloud through: the June–July counts at Nam Dinh may be a little optimistic."""),
    (MD, """## 2. Sentinel-1 mỗi năm / Sentinel-1 days per year

Đếm số ngày có ít nhất một cảnh Sentinel-1 IW chạm khung, mọi quỹ đạo. Sentinel-1B hỏng ngày 23/12/2021; Sentinel-1C bắt đầu cho ảnh năm 2025.

Count the days with at least one Sentinel-1 IW scene touching the frame, all orbits. Sentinel-1B failed on 23 December 2021; Sentinel-1C started delivering images in 2025."""),
    (PY, """S1_YEARS = list(range(2015, 2026))
s1_days = {}
for site, (lon, lat) in SITES.items():
    col = (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(site_box(lon, lat))
           .filterDate('2015-01-01', '2026-01-01').filter(ee.Filter.eq('instrumentMode', 'IW')))
    dates = set(col.aggregate_array('system:time_start').map(lambda t: ee.Date(t).format('YYYY-MM-dd')).getInfo())
    s1_days[site] = [sum(d.startswith(str(y)) for d in dates) for y in S1_YEARS]
    print(site, dict(zip(S1_YEARS, s1_days[site])))

for site in SITES:
    a, b = s1_days[site][S1_YEARS.index(2021)], s1_days[site][S1_YEARS.index(2022)]
    print(f'{site}: 2021 {a} -> 2022 {b} ngày / days ({100 * (b - a) / a:+.0f} %)')

plt.figure(figsize=(8, 3.5))
for site, mk in zip(SITES, ('o-', 's--')):
    plt.plot(S1_YEARS, s1_days[site], mk, label=site)
plt.axvline(2021.98, color='grey', lw=0.8); plt.text(2022.05, 20, 'S1B hỏng / fails', fontsize=8)
plt.ylabel('ngày có ảnh / days with images'); plt.legend(); plt.title('Sentinel-1 IW')
plt.show()"""),
    (MD, """Chương 2: An Giang 92 ngày năm 2021, 58 ngày năm 2022 (−37 %), 84 ngày năm 2025; Nam Định 89 → 87 ngày (−2 %). Mã ở đây đếm giống hệt nên phải ra cùng số. Nam Định gần như không đổi vì Sentinel-1B chưa từng chụp khung này: mọi ảnh đều của Sentinel-1A trên ba quỹ đạo. Khi so hai ảnh radar, hãy dùng ảnh **cùng quỹ đạo** (thuộc tính `relativeOrbitNumber_start`), nên khoảng cách thật giữa hai ảnh so được là 12 ngày.

Chapter 2: An Giang 92 days in 2021, 58 in 2022 (−37 %), 84 in 2025; Nam Dinh 89 → 87 days (−2 %). The count here is the same, so the numbers should match. Nam Dinh hardly changes because Sentinel-1B never imaged this frame: every image is from Sentinel-1A on three orbits. When comparing two radar images, use the **same orbit** (property `relativeOrbitNumber_start`), so the real gap between comparable images is 12 days."""),
    (MD, """## 3. Ô thuần và kích thước ô / Pure cells and cell size

Tải bản đồ ESA WorldCover 2021 (10 m) của mỗi khung, gộp thành ô 2×2 … 50×50 pixel, rồi đếm tỉ lệ ô **thuần**: một lớp chiếm ít nhất 90 % ô. Ô 250 m có cỡ pixel MODIS.

Fetch the ESA WorldCover 2021 map (10 m) of each frame, group it into cells of 2×2 … 50×50 pixels, then count the share of **pure** cells: one class covers at least 90 % of the cell. A 250 m cell is the size of a MODIS pixel."""),
    (PY, """FACTORS = [1, 2, 3, 5, 10, 25, 50]   # pixel 10 m mỗi cạnh ô / 10 m pixels per cell side
wc = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map').unmask(255).toUint8()
purity = {}
for site, (lon, lat) in SITES.items():
    x0, y1, res, n = site_grid(lon, lat)
    a = pixels(wc, 'EPSG:3857', x0, y1, n, n, res)['Map']
    out = []
    for f in FACTORS:
        k = (n // f) * f
        blocks = a[:k, :k].reshape(k // f, f, k // f, f).transpose(0, 2, 1, 3).reshape(-1, f * f)
        top = np.array([np.bincount(b, minlength=256).max() for b in blocks]) / (f * f)   # lớp nhiều nhất / largest class
        out.append(100 * (top >= 0.9).mean())
    purity[site] = out
    print(f'{site}: đất trồng trọt / cropland {100 * (a == 40).mean():.1f} %;',
          ', '.join(f'{10 * f} m {p:.1f} %' for f, p in zip(FACTORS, out)))

plt.figure(figsize=(7, 4))
for site, mk in zip(SITES, ('o-', 's--')):
    plt.plot([10 * f for f in FACTORS], purity[site], mk, label=site)
plt.xscale('log'); plt.xlabel('cạnh ô (m) / cell size (m)'); plt.ylabel('% ô thuần / pure cells')
plt.axvline(250, color='grey', lw=0.8); plt.text(260, 95, 'MODIS', fontsize=8)
plt.ylim(0, 102); plt.legend(); plt.show()"""),
    (MD, """Chương 2: Nam Định 77,8 % ô thuần ở 30 m, 48,9 % ở 250 m, 39,3 % ở 500 m (đất trồng trọt 32,9 % khung); An Giang 91,1 / 76,6 / 70,5 % (đất trồng trọt 88,9 %). Cùng lưới, cùng bản đồ nên số in ra phải trùng, trừ chữ số cuối khi làm tròn (Nam Định 500 m là 39,25 %, in ra 39,2 hay 39,3). Một nửa số ô MODIS ở Nam Định là hỗn hợp ruộng, làng, ao: đó là lý do các chương sau dùng Sentinel ở ĐBSH.

Chapter 2: Nam Dinh 77.8 % pure cells at 30 m, 48.9 % at 250 m, 39.3 % at 500 m (cropland 32.9 % of the frame); An Giang 91.1 / 76.6 / 70.5 % (cropland 88.9 %). Same grid, same map, so the printed numbers should match, except for rounding in the last digit (Nam Dinh at 500 m is 39.25 %, printed as 39.2 or 39.3). Half the MODIS-sized cells at Nam Dinh mix fields, villages and ponds: that is why later chapters use Sentinel in the Red River Delta.

## Bài tập / Exercises

1. Thêm Cà Mau (105,0° E, 8,75° N) vào `SITES` và `'Cà Mau': 'camau'` vào `SITE_IDS`. Chương 2: chỉ khoảng 10 ngày dùng được cả năm, 33 trong 72 tháng không có ngày nào. / Add Ca Mau (105.0° E, 8.75° N) to `SITES` and `'Cà Mau': 'camau'` to `SITE_IDS`. Chapter 2: only about 10 usable days a year, 33 of 72 months with none.
2. Đổi ngưỡng `cs_cdf` thành 0,65 rồi 0,5. Số ngày dùng được tháng 6–7 ở Nam Định thay đổi bao nhiêu? / Change the `cs_cdf` threshold to 0.65, then 0.5. How much do the June–July usable days at Nam Dinh change?
3. Đếm ngày Sentinel-1 theo từng quỹ đạo (`relativeOrbitNumber_start`) ở An Giang năm 2021 và 2022. Quỹ đạo nào mất ảnh? / Count Sentinel-1 days per orbit (`relativeOrbitNumber_start`) at An Giang in 2021 and 2022. Which orbit lost images?

*Contains modified Copernicus Sentinel data 2015–2025. Cloud Score+ (Pasquarella et al. 2023). ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022), CC BY 4.0.*"""),
]

if __name__ == "__main__":
    main(CELLS, "data_clearsky")
