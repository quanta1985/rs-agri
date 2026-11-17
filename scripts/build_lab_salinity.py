"""Generate labs/salinity_indicators.ipynb (Colab) for Chapter 10 (salinity).

    cd scripts && python build_lab_salinity.py           # write the notebook
    cd scripts && python build_lab_salinity.py --run     # also execute the code cells locally (needs EE auth)

The GEE Code Editor version of the same steps is labs/salinity_indicators.js (kept by hand).
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 10 — Xâm nhập mặn / Salinity intrusion

**Viễn thám Nông nghiệp & Môi trường — Chương 10** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/salinity/)

1. Dị thường EVI mùa khô 2020 so với trung vị 2010–2024, ven biển và nội đồng / Dry-season EVI anomaly 2020 against the 2010–2024 median, coastal versus inland provinces.
2. NDVI, chỉ số mặn SI và NDSI ở Bến Tre / NDVI, the salinity index SI and NDSI at Ben Tre.
3. Lớp phủ Dynamic World 2018 và 2024 ở Bến Tre, Cà Mau / Dynamic World land cover 2018 and 2024 at Ben Tre and Ca Mau.
4. Chiều dài xâm nhập mặn 4 g/L theo số liệu công bố / Published 4 g/L intrusion lengths.

> **Không chỉ số nào ở đây đo được độ mặn.** Vệ tinh chỉ thấy cây trồng và mặt đất. Hạn hán, lịch thời vụ né mặn, ruộng bỏ hoang và chuyển đổi sử dụng đất đều làm các chỉ số này thay đổi.
> **None of these indices measures salinity.** Satellites see plants and the ground. Drought, sowing dates shifted to dodge salt, fallow fields and land-use change all move them."""),
    (PY, """import ee
import numpy as np
import matplotlib.pyplot as plt

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)

def pixels(img, crs, x0, y1, n_x, n_y, res):
    \"\"\"Tải ảnh về numpy trên một lưới cố định / fetch an image as numpy on a fixed grid (upper-left x0, y1).\"\"\"
    arr = ee.data.computePixels({'expression': img, 'fileFormat': 'NUMPY_NDARRAY',
        'grid': {'dimensions': {'width': n_x, 'height': n_y}, 'crsCode': crs,
                 'affineTransform': {'scaleX': res, 'shearX': 0, 'translateX': x0, 'shearY': 0, 'scaleY': -res, 'translateY': y1}}})
    return {b: arr[b] for b in arr.dtype.names}"""),
    (MD, """## 1. Dị thường EVI mùa khô / Dry-season EVI anomaly

EVI trung bình tháng 2–4 của năm 2020 trừ trung vị các năm 2010–2024 (MODIS Terra + Aqua, chỉ giữ SummaryQA ≤ 1). Chương 10 dùng lưới 250 m Web Mercator và ranh tỉnh geoBoundaries. Ở đây dùng lưới 0,0025° (~280 m) và ranh FAO GAUL 2015 (63 tỉnh, trước sáp nhập 2025), nên tỷ lệ phần trăm thấp hơn chương khoảng 1 điểm.

Feb–Apr mean EVI of 2020 minus the 2010–2024 median (MODIS Terra + Aqua, SummaryQA ≤ 1 only). Chapter 10 uses a 250 m Web Mercator grid and geoBoundaries province lines. Here a 0.0025° grid (~280 m) and FAO GAUL 2015 provinces (63 provinces, before the 2025 mergers) are used, so the percentages come out about 1 point lower than the chapter's."""),
    (PY, """YEAR = 2020
COASTAL = ['Long An', 'Tien Giang', 'Ben Tre', 'Tra Vinh', 'Soc Trang', 'Bac Lieu', 'Ca Mau', 'Kien Giang']
INLAND = ['Vinh Long', 'Dong Thap', 'An Giang', 'Can Tho city', 'Hau Giang']
gaul = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM0_NAME', 'Viet Nam'))
zone = (ee.Image(0).paint(gaul.filter(ee.Filter.inList('ADM1_NAME', INLAND)), 1)
        .paint(gaul.filter(ee.Filter.inList('ADM1_NAME', COASTAL)), 2))   # 0 ngoài / outside, 1 nội đồng / inland, 2 ven biển / coastal

MODIS = ee.ImageCollection('MODIS/061/MOD13Q1').merge(ee.ImageCollection('MODIS/061/MYD13Q1'))

def dry_evi(year):
    col = MODIS.filterDate(f'{year}-02-01', f'{year}-05-01')
    return col.map(lambda im: im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1))).mean()

base = ee.ImageCollection([dry_evi(y) for y in range(2010, 2025)]).median()
anom_img = ee.Image.cat([dry_evi(YEAR).subtract(base).unmask(-9).rename('anom'), zone.rename('zone')])
STEP = 0.0025   # độ / degrees (~280 m)
px = pixels(anom_img, 'EPSG:4326', 104.4, 11.05, 980, 1020, STEP)   # khung ĐBSCL / Mekong Delta frame 104.4–106.85 E, 8.5–11.05 N
anom = np.where((px['zone'] > 0) & (px['anom'] > -9), px['anom'], np.nan)

def share(mask):
    ok = mask & ~np.isnan(anom)
    return 100 * (anom[ok] <= -0.05).mean()

print(f'{YEAR}: EVI anomaly <= -0.05 trên / on {share(px["zone"] > 0):.1f} % ĐBSCL / of the delta')
print(f'  ven biển / coastal {share(px["zone"] == 2):.1f} %, nội đồng / inland {share(px["zone"] == 1):.1f} %')

plt.figure(figsize=(7, 7))
plt.imshow(anom, cmap='BrBG', vmin=-0.2, vmax=0.2, extent=[104.4, 106.85, 8.5, 11.05])
plt.colorbar(label='EVI anomaly', shrink=0.7)
plt.title(f'Dị thường EVI 2–4/{YEAR} / Feb–Apr {YEAR} EVI anomaly')
plt.show()"""),
    (MD, """Pixel bằng độ nên diện tích mỗi ô giảm nhẹ theo cos(vĩ độ), chênh dưới 1 % trong khung này; ở đây bỏ qua.
Chương 10 (lưới 250 m): năm 2020 dị thường ≤ −0,05 trên 31,1 % châu thổ, ven biển 26,9 %, nội đồng 41,6 %. Dị thường mạnh hơn ở **nội đồng**, nơi mặn không vào tới: đây là dấu vết hạn hán và lịch thời vụ, không phải bản đồ mặn.

Degree pixels shrink slightly with cos(latitude), under 1 % across this frame; ignored here.
Chapter 10 (250 m grid): in 2020 the anomaly is ≤ −0.05 on 31.1 % of the delta, 26.9 % of the coastal provinces and 41.6 % of the inland ones. The anomaly is stronger **inland**, where salt does not reach: it records drought and cropping calendars, not salinity."""),
    (MD, """## 2. NDVI, SI và NDSI ở Bến Tre / NDVI, SI and NDSI at Ben Tre

Trung vị Sentinel-2 tháng 2–4/2024 (Cloud Score+ `cs_cdf ≥ 0,6`) trên khung 10,24 km quanh 106,5° E, 10,1° N, lưới UTM 48N 10 m.
SI = √(B·R) (Khan và cs. 2001); NDSI = (R − NIR)/(R + NIR).

Sentinel-2 Feb–Apr 2024 median (Cloud Score+ `cs_cdf ≥ 0.6`) on the 10.24 km frame around 106.5° E, 10.1° N, UTM 48N 10 m grid.
SI = √(B·R) (Khan et al. 2001); NDSI = (R − NIR)/(R + NIR)."""),
    (PY, """N, RES = 1024, 10
X0, Y1 = 664360 - N * RES // 2, 1116846 + N * RES // 2   # tâm Bến Tre (UTM 48N) / Ben Tre centre
FRAME = ee.Geometry.Rectangle([X0, Y1 - N * RES, X0 + N * RES, Y1], 'EPSG:32648', False)

cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
s2 = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(FRAME).filterDate('2024-02-01', '2024-05-01')
      .linkCollection(cs, ['cs_cdf'])
      .map(lambda im: im.select(['B2', 'B4', 'B8']).divide(10000).updateMask(im.select('cs_cdf').gte(0.6))))
print(s2.size().getInfo(), 'cảnh / scenes')
b = pixels(s2.median().unmask(-1), 'EPSG:32648', X0, Y1, N, N, RES)
ok = (b['B2'] >= 0) & (b['B4'] >= 0) & (b['B8'] >= 0)
B, R, NIR = (np.where(ok, b[k], np.nan).astype('float64') for k in ('B2', 'B4', 'B8'))
ndvi = (NIR - R) / (NIR + R)
si = np.sqrt(B * R)
ndsi = (R - NIR) / (R + NIR)

v = ~np.isnan(ndvi) & ~np.isnan(si)
r = np.corrcoef(ndvi[v], si[v])[0, 1]
print(f'NDVI trung vị / median {np.nanmedian(ndvi):.3f}, SI trung vị / median {np.nanmedian(si):.3f}')
print(f'r(NDVI, SI) = {r:.2f} (n = {v.sum()})')
print(f'NDVI < 0.2: {100 * (ndvi[v] < 0.2).mean():.1f} %, SI > 0.10: {100 * (si[v] > 0.1).mean():.1f} % khung / of the frame')
print('NDSI == -NDVI ?', np.allclose(ndsi[v], -ndvi[v]))

fig, ax = plt.subplots(1, 3, figsize=(16, 5), layout='constrained')
im = ax[0].imshow(ndvi, cmap='RdYlGn', vmin=-0.2, vmax=0.9); ax[0].set_title('NDVI'); fig.colorbar(im, ax=ax[0], shrink=0.7)
im = ax[1].imshow(si, cmap='YlOrRd', vmin=0, vmax=0.15); ax[1].set_title('SI = √(B·R)'); fig.colorbar(im, ax=ax[1], shrink=0.7)
for a in ax[:2]: a.set_axis_off()
ax[2].hexbin(ndvi[v], si[v], gridsize=60, bins='log', cmap='viridis', extent=(-0.2, 0.9, 0, 0.2))
ax[2].set_xlabel('NDVI'); ax[2].set_ylabel('SI'); ax[2].set_title(f'r = {r:.2f}')
plt.show()"""),
    (MD, """NDSI đúng bằng −NDVI, nên không mang thêm thông tin nào. SI cao ở nơi **ít cây**: mặt nước, đất trống, mái nhà. Tương quan âm mạnh cho thấy SI chủ yếu đo "không có thực vật", không đo muối. Chương 10 (lưới 10 m Web Mercator): NDVI trung vị 0,752, SI trung vị 0,043, r = −0,80, NDVI < 0,2 trên 3,5 % khung, SI > 0,10 trên 9,9 %. Lưới khác nhau nên số in ra có thể lệch ở chữ số cuối.

NDSI is exactly −NDVI, so it adds nothing. SI is high where there are **few plants**: water, bare soil, roofs. The strong negative correlation shows SI mostly measures "no vegetation", not salt. Chapter 10 (10 m Web Mercator grid): NDVI median 0.752, SI median 0.043, r = −0.80, NDVI < 0.2 on 3.5 % of the frame, SI > 0.10 on 9.9 %. The grids differ, so the printed numbers may differ in the last digit."""),
    (MD, """## 3. Dynamic World 2018 và 2024 / Dynamic World 2018 and 2024

Nhãn thường gặp nhất trong năm (mode) của mỗi pixel. 2018 là năm đầu: năm 2016–17 Cà Mau chỉ có khoảng 2 nhãn mỗi năm. Ao tôm hiện ra là **nước**.

The most frequent label of the year (mode) in each pixel. 2018 is the first year: in 2016–17 Ca Mau has only about 2 labels a year. Shrimp ponds show as **water**."""),
    (PY, """DW_NAMES = ['Nước/Water', 'Cây gỗ/Trees', 'Cỏ/Grass', 'Ngập/Flooded veg.', 'Cây trồng/Crops',
            'Cây bụi/Shrub', 'Xây dựng/Built', 'Đất trống/Bare', 'Băng/Snow']
SITES = {'Bến Tre': (664360, 1116846), 'Cà Mau': (500000, 967213)}   # tâm khung UTM 48N / frame centres
YEARS = (2018, 2024)
dw_maps = {}
for site, (cx, cy) in SITES.items():
    x0, y1 = cx - N * RES // 2, cy + N * RES // 2
    frame = ee.Geometry.Rectangle([x0, y1 - N * RES, x0 + N * RES, y1], 'EPSG:32648', False)
    dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(frame).select('label')
    img = ee.Image.cat([dw.filterDate(f'{y}-01-01', f'{y + 1}-01-01').mode().unmask(255).rename(f'y{y}') for y in YEARS]).toUint8()
    px = pixels(img, 'EPSG:32648', x0, y1, N, N, RES)
    a, b = px[f'y{YEARS[0]}'], px[f'y{YEARS[1]}']
    dw_maps[site] = (a, b)
    ok = (a < 255) & (b < 255)
    print(f'\\n{site}: {YEARS[0]} -> {YEARS[1]} (% khung / of the frame)')
    for k, name in enumerate(DW_NAMES[:8]):
        p0, p1 = 100 * (a[ok] == k).mean(), 100 * (b[ok] == k).mean()
        if max(p0, p1) >= 0.5:
            print(f'  {name:20s} {p0:5.1f} -> {p1:5.1f}')
    crop0 = ok & (a == 4)
    print(f'  cây trồng 2018 thành / 2018 crops became: nước / water {100 * (b[crop0] == 0).mean():.1f} %, '
          f'cây gỗ / trees {100 * (b[crop0] == 1).mean():.1f} %, xây dựng / built {100 * (b[crop0] == 6).mean():.1f} %')

from matplotlib.colors import ListedColormap
DW_COLORS = ['#419bdf', '#397d49', '#88b053', '#7a87c6', '#e49635', '#dfc35a', '#c4281b', '#a59b8f', '#b39fe1']
cmap = ListedColormap(DW_COLORS + ['white'] * 247)
fig, ax = plt.subplots(2, 2, figsize=(11, 11), layout='constrained')
for i, (site, maps) in enumerate(dw_maps.items()):
    for j, m in enumerate(maps):
        ax[i, j].imshow(m, cmap=cmap, vmin=0, vmax=255, interpolation='nearest')
        ax[i, j].set_title(f'{site} {YEARS[j]}'); ax[i, j].set_axis_off()
plt.show()"""),
    (MD, """Chương 10: Bến Tre cây trồng 19,0 % → 6,0 % (69,1 % số đó thành cây gỗ, tức vườn cây ăn trái), xây dựng 23,7 % → 32,2 %; Cà Mau nước 58,0 % → 47,7 % và thực vật ngập nước 26,9 % → 42,1 %. Ở Cà Mau, tôm–rừng và tôm–lúa đổi qua lại giữa "nước" và "thực vật ngập nước" tùy năm: đó là đặc điểm của nhãn, chưa chắc là thay đổi thật.

Chapter 10: at Ben Tre, crops 19.0 % → 6.0 % (69.1 % of them became trees, i.e. orchards), built area 23.7 % → 32.2 %; at Ca Mau, water 58.0 % → 47.7 % and flooded vegetation 26.9 % → 42.1 %. At Ca Mau, shrimp–mangrove and shrimp–rice farms flip between "water" and "flooded vegetation" from year to year: a property of the labels, not necessarily a real change."""),
    (MD, """## 4. Chiều dài xâm nhập mặn 4 g/L / Published 4 g/L intrusion lengths

Vệ tinh không đo được độ mặn nước sông: các số dưới đây là **số liệu công bố**, mỗi số kèm nguồn. Thanh rỗng = giá trị giữa mùa, chưa phải đỉnh.

Satellites cannot measure river salinity: these are **published numbers**, each with its source. Hollow bars = mid-season values, not the peak."""),
    (PY, """# (khu vực, mùa khô, km thấp, km cao, đỉnh mùa?, thời điểm, nguồn) / (area, dry season, km low, km high, season peak?, when, source)
LENGTHS = [
    ('Vàm Cỏ Tây', '2015–16', 135, 135, True, 'cuối 3/2016 / late Mar 2016', 'Nguyễn Ngọc Anh 2017'),
    ('Vàm Cỏ Tây', '2019–20', 130, 130, True, '5/2020 / May 2020', 'Tổng cục Thủy lợi, 20/6/2020'),
    ('Vàm Cỏ Tây', '2023–24', 60, 64, False, '8–14/2/2024 (Vàm Cỏ)', 'Cục Thủy lợi, 23/2/2024'),
    ('Cửa sông Cửu Long / Mekong estuaries', '2015–16', 70, 81, True, 'cuối 3/2016 / late Mar 2016', 'Nguyễn Ngọc Anh 2017'),
    ('Cửa sông Cửu Long / Mekong estuaries', '2019–20', 45, 66, False, '6–13/1/2020', 'Bộ NN-PTNT 2020'),
    ('Cửa sông Cửu Long / Mekong estuaries', '2023–24', 40, 66, True, '8–13/3/2024', 'Đài KTTV Nam Bộ, 22/3/2024'),
]
ESTUARIES_2016 = {'Tiền': 79, 'Hàm Luông': 78, 'Cổ Chiên': 81, 'Hậu': 70}   # Nguyễn Ngọc Anh 2017
COLORS = {'2015–16': '#d55e00', '2019–20': '#e69f00', '2023–24': '#0072b2'}

fig, ax = plt.subplots(figsize=(10, 4.5), layout='constrained')
for i, (area, season, lo, hi, peak, when, src) in enumerate(LENGTHS):
    c = COLORS[season]
    ax.barh(i, max(hi - lo, 1.5), left=lo - (0.75 if hi == lo else 0), height=0.5,
            color=c if peak else 'none', edgecolor=c, linewidth=2, linestyle='-' if peak else '--')
    ax.text(hi + 2, i, f'{lo}–{hi} km · {when} · {src}' if hi != lo else f'{lo} km · {when} · {src}', va='center', fontsize=8)
for name, km in ESTUARIES_2016.items():
    ax.plot(km, 3, 'o', color=COLORS['2015–16'], ms=5)
ax.set_yticks(range(len(LENGTHS)), [f'{a.split(" /")[0]} {s}' for a, s, *_ in LENGTHS])
ax.invert_yaxis(); ax.set_xlim(0, 230); ax.set_xlabel('km từ cửa sông / km from the river mouth')
ax.set_title('Ranh mặn 4 g/L theo nguồn công bố / Published 4 g/L intrusion lengths')
plt.show()
for row in LENGTHS:
    print(row)"""),
    (MD, """Nguồn đầy đủ / Full references: Nguyễn Ngọc Anh (2017), *Vietnam Journal of Science, Technology and Engineering* 59(1): 93–96; Tổng cục Thủy lợi, hội nghị tổng kết mùa khô (báo SGGP 20/6/2020); Bộ NN-PTNT (2020); Cục Thủy lợi (Báo Chính phủ 23/2/2024); Đài KTTV khu vực Nam Bộ (Báo Nông nghiệp 22/3/2024). Danh sách chi tiết ở cuối Chương 10 / see the end of Chapter 10.

## Bài tập / Exercises

1. Đổi `YEAR` thành 2016 và 2024. Chương 10 cho 22,7 % và 18,6 %. Năm nào nội đồng vẫn mạnh hơn ven biển? / Set `YEAR` to 2016 and 2024 (Chapter 10: 22.7 % and 18.6 %). In which years is inland still stronger than the coast?
2. Dời khung mục 2 vào nội đồng An Giang (105,08° E, 10,45° N; UTM 48N ≈ 618 600, 1 155 300). r(NDVI, SI) có còn âm mạnh không, dù ở đó không có mặn? / Move the section 2 frame inland to An Giang (105.08° E, 10.45° N; UTM 48N ≈ 618,600, 1,155,300). Is r(NDVI, SI) still strongly negative where there is no salt?
3. Lập ma trận chuyển đổi 8×8 lớp Dynamic World 2018 → 2024 cho Cà Mau (`np.bincount(a * 9 + b)`). Bao nhiêu phần trăm "cây trồng" 2018 thành "nước" (chương: 41,6 %)? / Build the 8×8 Dynamic World transition matrix 2018 → 2024 for Ca Mau. What share of 2018 crops became water (chapter: 41.6 %)?

*Contains modified Copernicus Sentinel data 2024. Dynamic World V1 (Brown et al. 2022, Scientific Data 9:251), CC BY 4.0. MODIS MOD13Q1/MYD13Q1 v061, NASA LP DAAC. FAO GAUL 2015.*"""),
]

if __name__ == "__main__":
    main(CELLS, "salinity_indicators")
