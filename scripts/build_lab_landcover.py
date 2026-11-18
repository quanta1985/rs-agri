"""Generate labs/landcover_compare.ipynb (Colab) for Chapter 3 (landcover); Chapter 1 (deltas) links to it too.

    cd scripts && python build_lab_landcover.py           # write the notebook
    cd scripts && python build_lab_landcover.py --run     # also execute the code cells locally (needs EE auth)

The GEE Code Editor version of the same steps is labs/landcover_compare.js (kept by hand).
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 3 — So sánh ba bản đồ lớp phủ / Comparing three land cover maps

**Viễn thám Nông nghiệp & Môi trường — Chương 3** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/landcover/) · Chương 1 / Chapter 1: [Hai châu thổ / Two deltas](https://quanta1985.github.io/rs-agri/vi/deltas/)

1. ESA WorldCover, Dynamic World và Esri 10 m năm 2021, đưa về 7 lớp chung, ở Bến Tre và Nam Định / ESA WorldCover, Dynamic World and Esri 10 m for 2021, mapped to 7 shared classes, at Ben Tre and Nam Dinh.
2. Bản đồ đồng thuận: sản phẩm nào gọi một pixel là đất trồng trọt / Agreement map: which products call a pixel cropland.
3. Đất trồng trọt Esri từng năm 2017–2025 ở khung Bến Tre và cả tỉnh Bến Tre / Esri cropland per year 2017–2025 in the Ben Tre frame and the whole province.
4. Diện tích các lớp WorldCover của ĐBSCL (Chương 1) / WorldCover class areas of the Mekong Delta (Chapter 1).

> Ba bản đồ không "sai" theo cùng một kiểu: chúng định nghĩa lớp khác nhau và xử lý pixel hỗn hợp khác nhau. Đừng lấy hai bản đồ (hay hai năm) trừ nhau để tính thay đổi.
> The three maps are not wrong in the same way: they define classes differently and resolve mixed pixels differently. Do not subtract two maps (or two years) to measure change."""),
    (PY, """import ee
import gzip
import json
import math
import urllib.request
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)

R = 6378137.0

def site_grid(lon, lat, ground_res=10, size_m=10240):
    \"\"\"Lưới Web Mercator của khung (giống trang web) / the frame's Web Mercator grid (as on the website): x0, y1, res, n.\"\"\"
    res = ground_res / math.cos(math.radians(lat))
    n = round(size_m / ground_res)
    mx, my = R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    x0 = math.floor((mx - n * res / 2) / res) * res
    y1 = math.ceil((my + n * res / 2) / res) * res
    return x0, y1, res, n

def grid_box(x0, y1, res, n):
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
        return r.read()

def site_layer(layer_id):
    \"\"\"Lớp bản đồ của trang: meta + mảng (bước, hàng, cột) giá trị thô / a site layer: meta + raw array (steps, rows, cols).\"\"\"
    meta = json.loads(site_file(f'{layer_id}/meta.json'))
    raw = np.frombuffer(gzip.decompress(site_file(f'{layer_id}/values.binz')), np.dtype(meta['dtype']).newbyteorder('<'))
    return meta, raw.reshape(len(meta['times']), meta['height'], meta['width'])"""),
    (MD, """## 1. Ba bản đồ, một chú giải / Three maps, one legend

Mỗi sản phẩm có chú giải riêng. Chương 3 đưa cả ba về 7 lớp chung: 1 mặt nước, 2 cây gỗ (kể cả rừng ngập mặn WorldCover), 3 cây trồng, 4 xây dựng, 5 cỏ / cây bụi, 6 thực vật ngập nước, 7 đất trống; 0 = không có dữ liệu. Dynamic World là nhãn thường gặp nhất trong năm 2021 (mode). Esri lấy từ bộ sưu tập sat-io trên Earth Engine.

Each product has its own legend. Chapter 3 maps all three to 7 shared classes: 1 water, 2 trees (incl. WorldCover mangroves), 3 crops, 4 built-up, 5 grass / shrub, 6 flooded vegetation, 7 bare; 0 = no data. Dynamic World is the most frequent label of 2021 (mode). Esri comes from the sat-io collection on Earth Engine."""),
    (PY, """YEAR = 2021
ESRI = 'projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS'
NAMES = ['Mặt nước/Water', 'Cây gỗ/Trees', 'Cây trồng/Crops', 'Xây dựng/Built-up', 'Cỏ, cây bụi/Grass, shrub',
         'Ngập nước/Flooded veg.', 'Đất trống/Bare']
COLORS = ['#419bdf', '#397d49', '#e49635', '#c4281b', '#e3e2c3', '#7a87c6', '#a59b8f']
REMAP = {  # mã gốc -> lớp chung / source code -> shared class
    'wc': ([10, 20, 30, 40, 50, 60, 80, 90, 95, 100], [2, 5, 5, 3, 4, 7, 1, 6, 2, 5]),
    'dw': ([0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 5, 6, 3, 5, 4, 7]),
    'esri': ([1, 2, 4, 5, 7, 8, 11], [1, 2, 6, 3, 4, 7, 5]),
}
PRODUCTS = {'wc': 'WorldCover', 'dw': 'Dynamic World', 'esri': 'Esri'}
SITES = {'Bến Tre': ('bentre', 106.5, 10.1), 'Nam Định': ('namdinh', 106.42, 20.22)}

def harmonised(geom, year=YEAR):
    wc = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map')
    dw = (ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(geom)
          .filterDate(f'{year}-01-01', f'{year + 1}-01-01').select('label').mode())
    esri = ee.ImageCollection(ESRI).filterBounds(geom).filterDate(f'{year}-01-01', f'{year + 1}-01-01').mosaic()
    return ee.Image.cat([img.remap(*REMAP[b], 0).rename(b) for img, b in ((wc, 'wc'), (dw, 'dw'), (esri, 'esri'))]).toUint8()

maps = {}
for site, (sid, lon, lat) in SITES.items():
    x0, y1, res, n = site_grid(lon, lat)
    px = pixels(harmonised(grid_box(x0, y1, res, n)), 'EPSG:3857', x0, y1, n, n, res)
    maps[site] = px
    ok = (px['wc'] > 0) & (px['dw'] > 0) & (px['esri'] > 0)
    print(f'\\n{site} — % khung / of the frame ({ok.sum():,} pixel)')
    print(f'{"":26s}' + ''.join(f'{p:>15s}' for p in PRODUCTS.values()))
    for c, name in enumerate(NAMES, 1):
        print(f'{name:26s}' + ''.join(f'{100 * (px[b][ok] == c).mean():15.1f}' for b in PRODUCTS))

cmap = ListedColormap(['white'] + COLORS)
fig, ax = plt.subplots(len(SITES), 3, figsize=(15, 5 * len(SITES)), layout='constrained', squeeze=False)
for i, (site, px) in enumerate(maps.items()):
    for j, (b, prod) in enumerate(PRODUCTS.items()):
        ax[i, j].imshow(px[b], cmap=cmap, vmin=0, vmax=7, interpolation='nearest')
        ax[i, j].set_title(f'{site} — {prod} {YEAR}'); ax[i, j].set_axis_off()
handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in COLORS]
fig.legend(handles, NAMES, loc='outside lower center', ncol=7)
plt.show()"""),
    (MD, """Đối chiếu với lớp `lc3-bentre` / `lc3-namdinh` của Hình 3.3: cùng lưới nên từng pixel phải trùng.

Check against the `lc3-bentre` / `lc3-namdinh` layers of Figure 3.3: same grid, so every pixel should match."""),
    (PY, """for site, (sid, lon, lat) in SITES.items():
    if sid not in ('bentre', 'namdinh'):
        continue   # trang chỉ có lớp 10 m cho hai khung này / the site has 10 m layers for these two frames only
    meta, raw = site_layer(f'lc3-{sid}')
    same = [(raw[k] == maps[site][b]).mean() for k, b in enumerate(PRODUCTS)]   # bước = sản phẩm / steps = products
    print(site, 'pixel trùng với lớp của trang / pixels equal to the site layer:',
          ', '.join(f'{p} {100 * s:.2f} %' for p, s in zip(PRODUCTS.values(), same)))"""),
    (MD, """Chương 3: khung Bến Tre (xóm vườn dừa, cây ăn trái xen nhà và mương) có cây gỗ 75,3 / 53,1 / 25,4 % và xây dựng 3,3 / 29,3 / 43,3 % theo WorldCover / Dynamic World / Esri; Esri còn gọi 28,7 % là cây trồng. Khung Nam Định: mặt nước 38,7–47,6 % (kể cả biển), cây trồng từ 22,4 % (Dynamic World) đến 32,9 % (WorldCover), xây dựng 15,2–27,4 %. Cùng lưới, cùng dữ liệu nên bảng trên phải ra đúng các số này.

Chapter 3: the Ben Tre frame (coconut and fruit gardens mixed with houses and ditches) has trees 75.3 / 53.1 / 25.4 % and built-up 3.3 / 29.3 / 43.3 % on WorldCover / Dynamic World / Esri; Esri also calls 28.7 % crops. The Nam Dinh frame: water 38.7–47.6 % (sea included), crops from 22.4 % (Dynamic World) to 32.9 % (WorldCover), built-up 15.2–27.4 %. Same grid, same data, so the table above should give exactly these numbers."""),
    (MD, """## 2. Bản đồ đồng thuận về đất trồng trọt / Cropland agreement map

Mã = WorldCover ×1 + Dynamic World ×2 + Esri ×4 (mỗi sản phẩm cộng điểm nếu gọi pixel là cây trồng). 0 = không sản phẩm nào, 7 = cả ba.

Code = WorldCover ×1 + Dynamic World ×2 + Esri ×4 (each product adds its weight if it calls the pixel crops). 0 = none, 7 = all three."""),
    (PY, """AGREE = ['Không / None', 'Chỉ / Only WC', 'Chỉ / Only DW', 'WC + DW', 'Chỉ / Only Esri', 'WC + Esri', 'DW + Esri', 'Cả ba / All three']
AGREE_COLORS = ['#f2f2f2', '#e69f00', '#56b4e9', '#0072b2', '#cc79a7', '#d55e00', '#7b3294', '#009e73']
fig, ax = plt.subplots(1, len(SITES), figsize=(6.5 * len(SITES), 6.5), layout='constrained', squeeze=False)
ax = ax[0]
for a, (site, px) in zip(ax, maps.items()):
    ok = (px['wc'] > 0) & (px['dw'] > 0) & (px['esri'] > 0)
    code = (px['wc'] == 3) * 1 + (px['dw'] == 3) * 2 + (px['esri'] == 3) * 4
    sh = np.bincount(code[ok], minlength=8) / ok.sum() * 100
    any_crop = sh[1:].sum()
    print(f'{site}: cả ba gọi là cây trồng / all three call it crops {sh[7]:.1f} % khung / of the frame; '
          f'ít nhất một / at least one {any_crop:.1f} %; đồng thuận trong số đó / agreement within that {100 * sh[7] / any_crop:.1f} %')
    a.imshow(np.where(ok, code, 0), cmap=ListedColormap(AGREE_COLORS), vmin=0, vmax=7, interpolation='nearest')
    a.set_title(f'{site}: sản phẩm nào gọi là cây trồng / who calls it crops'); a.set_axis_off()
fig.legend([plt.Rectangle((0, 0), 1, 1, color=c) for c in AGREE_COLORS], AGREE, loc='outside lower center', ncol=4)
plt.show()"""),
    (MD, """Chương 3 tính cùng chỉ số cho cả châu thổ (lưới 10 m, năm 2021): ở ĐBSCL cả ba bản đồ cùng gọi là đất trồng trọt trên 32,4 % diện tích so sánh, tức 52,8 % phần mà ít nhất một bản đồ gọi là đất trồng trọt; ĐBSH 28,3 % và 58,2 %. Ở khung Bến Tre, nơi vườn xen nhà, mức đồng thuận thấp hơn nhiều: lần chạy khi soạn bài cho 35,2 % (Nam Định 59,6 %).

Chapter 3 computes the same for whole deltas (10 m grid, 2021): in the Mekong Delta all three maps call 32.4 % of the compared area cropland, i.e. 52.8 % of what at least one map calls cropland; Red River Delta 28.3 % and 58.2 %. In the Ben Tre frame, where gardens and houses mix, agreement is much lower: the run made while writing this lab gave 35.2 % (Nam Dinh 59.6 %)."""),
    (MD, """## 3. Đất trồng trọt Esri từng năm / Esri cropland year by year

Esri có một bản đồ mỗi năm từ 2017. Tính tỉ lệ cây trồng của khung Bến Tre (10 m), và diện tích cây trồng của cả tỉnh Bến Tre (ở 30 m cho nhanh). Ranh tỉnh: geoBoundaries v6 ADM1 trên Earth Engine (cùng nguồn gbOpen với trang web), chọn bằng một điểm nằm trong tỉnh.

Esri has one map a year since 2017. Compute the crop share of the Ben Tre frame (10 m) and the crop area of the whole Ben Tre province (at 30 m, for speed). Province outline: geoBoundaries v6 ADM1 on Earth Engine (the same gbOpen source as the website), picked with a point inside the province."""),
    (PY, """YEARS = list(range(2017, 2026))
sid, lon, lat = SITES['Bến Tre']
x0, y1, res, n = site_grid(lon, lat)
esri_col = ee.ImageCollection(ESRI)

def esri_year(y, geom):
    return esri_col.filterBounds(geom).filterDate(f'{y}-01-01', f'{y + 1}-01-01').mosaic().remap(*REMAP['esri'], 0)

stack = ee.Image.cat([esri_year(y, grid_box(x0, y1, res, n)).rename(f'y{y}') for y in YEARS]).toUint8()
px = pixels(stack, 'EPSG:3857', x0, y1, n, n, res)
frame_crop = [100 * (px[f'y{y}'] == 3).mean() for y in YEARS]

# Tên tỉnh trong geoBoundaries trên EE mất dấu tiếng Việt (vd. 'B?n Tre'), nên chọn tỉnh bằng một điểm.
# Province names in the EE copy of geoBoundaries lose Vietnamese letters (e.g. 'B?n Tre'), so pick provinces with a point.
ADM1 = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'))
bentre = ADM1.filterBounds(ee.Geometry.Point(106.52, 10.07)).first().geometry()
area = ee.Image.pixelArea().divide(1e4)
prov_ha = ee.List([area.updateMask(esri_year(y, bentre).eq(3)).reduceRegion(ee.Reducer.sum(), bentre, 30, maxPixels=1e10, tileScale=4).get('area')
                   for y in YEARS]).getInfo()

print('năm/year  khung/frame %  tỉnh/province kha  thay đổi/change kha')
for k, y in enumerate(YEARS):
    d = '' if k == 0 else f'{(prov_ha[k] - prov_ha[k - 1]) / 1000:+.1f}'
    print(f'{y}      {frame_crop[k]:6.1f}         {prov_ha[k] / 1000:6.1f}          {d}')

fig, ax1 = plt.subplots(figsize=(8, 3.8))
ax1.plot(YEARS, [v / 1000 for v in prov_ha], 'o-', color='#e49635', label='tỉnh Bến Tre / province (kha)')
ax1.set_ylabel('nghìn ha / thousand ha'); ax1.set_ylim(0, None)
ax2 = ax1.twinx()
ax2.plot(YEARS, frame_crop, 's--', color='#555555', label='khung / frame (%)'); ax2.set_ylabel('% khung / of the frame'); ax2.set_ylim(0, None)
fig.legend(loc='lower left'); ax1.set_title('Cây trồng theo Esri / Esri crops, 2017–2025')
plt.show()"""),
    (MD, """Đọc chuỗi này như Chương 3 (mục 3.5) đọc chuỗi của cả châu thổ: theo Esri, đất trồng trọt ĐBSCL giảm từ 2 289 nghìn ha (2017) xuống 2 024 nghìn ha (2024), −11,6 %, nhưng từng bước nhảy +89, −135, −116 rồi +81 nghìn ha (2025). Đất trồng trọt không lên xuống cả trăm nghìn ha mỗi năm như vậy. Chuỗi in ở trên chỉ là của Bến Tre (khung và cả tỉnh), dao động vài nghìn ha mỗi năm. Một phần xu hướng có thể là thật (vườn, nhà lấn ruộng), một phần là khác biệt giữa các lần chạy mô hình và điều kiện ảnh từng năm. Chương này không có số cấp tỉnh: các số tỉnh Bến Tre ở đây chỉ do bài thực hành tính.

Read this series the way Chapter 3 (section 3.5) reads the delta series: on Esri, Mekong Delta cropland fell from 2,289 thousand ha (2017) to 2,024 thousand ha (2024), −11.6 %, but year to year it jumps +89, −135, −116 and then +81 thousand ha (2025). Cropland does not swing by a hundred thousand hectares a year. The series printed above is Ben Tre only (frame and province), moving a few thousand ha a year. Part of the trend may be real (gardens and houses replacing fields), part is differences between model runs and image conditions from year to year. The chapter has no province figures: the Ben Tre province numbers here come only from this lab."""),
    (MD, """## 4. WorldCover của ĐBSCL / WorldCover in the Mekong Delta

Diện tích từng lớp WorldCover 2021 trong 13 tỉnh ĐBSCL (geoBoundaries v6 trên EE, mỗi tỉnh chọn bằng một điểm), tính ở 30 m như Chương 1, rồi so với `deltas-stats.json` của chương.

Area of each WorldCover 2021 class in the 13 Mekong Delta provinces (geoBoundaries v6 on EE, each picked with a point), computed at 30 m as in Chapter 1, then compared with the chapter's `deltas-stats.json`."""),
    (PY, """MEKONG_POINTS = {  # một điểm trong mỗi tỉnh / one point inside each province
    'Long An': (106.10, 10.71), 'Tiền Giang': (106.13, 10.41), 'Bến Tre': (106.52, 10.07), 'Trà Vinh': (106.30, 9.82),
    'Vĩnh Long': (105.97, 10.12), 'Đồng Tháp': (105.72, 10.55), 'An Giang': (105.16, 10.58), 'Kiên Giang': (105.28, 9.98),
    'Cần Thơ': (105.52, 10.12), 'Hậu Giang': (105.63, 9.77), 'Sóc Trăng': (105.90, 9.61), 'Bạc Liêu': (105.55, 9.36),
    'Cà Mau': (105.10, 9.08)}
mekong = ADM1.filterBounds(ee.Geometry.MultiPoint(list(MEKONG_POINTS.values())))
print(mekong.size().getInfo(), 'tỉnh / provinces')
wc = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map')
res = area.addBands(wc).reduceRegion(ee.Reducer.sum().group(groupField=1, groupName='c'), mekong.geometry(), 30,
                                     maxPixels=1e11, tileScale=4).getInfo()
lab = {str(int(g['c'])): g['sum'] for g in res['groups']}
st = json.loads(site_file('deltas-stats.json'))
ch = st['regions']['mekong']['wc_ha']
lab_tot, ch_tot = sum(lab.values()), sum(ch.values())
print(f'{"lớp / class":32s}{"lab kha":>9s}{"lab %":>7s}{"chương kha":>12s}{"chương %":>9s}')
for code, name in st['wc_classes'].items():
    print(f'{name["vi"] + " / " + name["en"]:32s}{lab.get(code, 0) / 1000:9.0f}{100 * lab.get(code, 0) / lab_tot:7.1f}'
          f'{ch.get(code, 0) / 1000:12.0f}{100 * ch.get(code, 0) / ch_tot:9.1f}')
print(f'{"Tổng / Total":32s}{lab_tot / 1000:9.0f}{"":7s}{ch_tot / 1000:12.0f}')"""),
    (MD, """Khi soạn bài, bảng này cho tổng 3 829 nghìn ha, ít hơn 3 987 nghìn ha của Chương 1 khoảng 4 %. Chương 1 dùng ranh vùng của trang web (file geoBoundaries gbOpen tải về, `public/data/boundaries/provinces.json`), đó là bản đã đơn giản hóa; bản trên Earth Engine là bản đầy đủ của cùng bộ geoBoundaries, đường bờ biển chi tiết hơn: phần chênh chủ yếu là mặt nước ven biển (409 so với 495 nghìn ha) và rừng ngập mặn (78 so với 98). Tỉ lệ đất trồng trọt vì vậy cao hơn một chút ở đây (50,4 % so với 49,0 %), cây gỗ 26,4 so với 25,9 %, xây dựng 4,5 so với 4,4 %.

When this lab was written, the table gave a total of 3,829 thousand ha, about 4 % less than the 3,987 thousand ha of Chapter 1. Chapter 1 uses the website's region outline (a downloaded geoBoundaries gbOpen file, `public/data/boundaries/provinces.json`), which is the simplified file; Earth Engine holds the full-resolution file of the same geoBoundaries set, with a more detailed coastline: the gap is mostly coastal water (409 against 495 thousand ha) and mangroves (78 against 98). So the cropland share is a little higher here (50.4 % against 49.0 %), trees 26.4 against 25.9 %, built-up 4.5 against 4.4 %.

## Bài tập / Exercises

1. Đổi `YEAR` thành 2023 ở mục 1. Dynamic World và Esri đổi năm, WorldCover vẫn là 2021 (`v200`; chỉ có thêm 2020 là `v100`). Ở Bến Tre, hai bản đồ kia thay đổi bao nhiêu sau hai năm? / Set `YEAR` to 2023 in section 1. Dynamic World and Esri change year, WorldCover stays 2021 (`v200`; only 2020 exists besides, as `v100`). How much do the other two maps change at Ben Tre in two years?
2. Thêm khung Cà Mau vào `SITES`: `'Cà Mau': ('camau', 105.0, 8.75)`. Ao tôm thuộc lớp nào trong từng bản đồ? / Add the Ca Mau frame to `SITES`: `'Cà Mau': ('camau', 105.0, 8.75)`. Which class do shrimp ponds fall in on each map?
3. Lập ma trận nhầm lẫn 7×7 giữa WorldCover và Esri ở Bến Tre (`np.bincount(a * 8 + b, minlength=64)`). Phần lớn "cây gỗ" của WorldCover thành gì trong Esri? / Build the 7×7 confusion matrix between WorldCover and Esri at Ben Tre. What does most WorldCover "trees" become on Esri?

*ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022); Dynamic World V1 (Brown et al. 2022); Esri 10 m Annual Land Use Land Cover, Impact Observatory (Karra et al. 2021); all CC BY 4.0. Contains modified Copernicus Sentinel data. geoBoundaries (Runfola et al. 2020).*"""),
]

if __name__ == "__main__":
    main(CELLS, "landcover_compare")
