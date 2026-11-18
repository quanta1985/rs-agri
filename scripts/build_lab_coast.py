"""Generate labs/coast_shoreline.ipynb (Colab) for Chapter 12 (coast).

    cd scripts && python build_lab_coast.py           # write the notebook
    cd scripts && python build_lab_coast.py --run     # also execute the code cells locally (needs EE auth)

The GEE Code Editor version of the same steps is labs/coast_shoreline.js (kept by hand).
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 12 — Đường bờ & rừng ngập mặn / Shoreline & mangroves

**Viễn thám Nông nghiệp & Môi trường — Chương 12** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/coast/)

1. Đất và nước 1988–92 so với 2021–25 từ Landsat (MNDWI) trong một khung 30 × 27 km quanh Mũi Cà Mau / Land and water, 1988–92 against 2021–25, from Landsat (MNDWI) in a 30 × 27 km box around Ca Mau Cape.
2. Diện tích đất mỗi năm 1988–2025 và xu thế Theil–Sen ở bờ Biển Đông và mũi Cà Mau / Yearly land area 1988–2025 and the Theil–Sen trend on the East Sea coast and at the Cape.
3. Rừng ngập mặn Global Mangrove Watch 1996 và 2020 trong khung / Global Mangrove Watch mangroves 1996 and 2020 in the box.

> Mỗi ảnh Landsat chụp ở một mức triều khác nhau. Một ảnh không đo được đường bờ trên bờ bùn; nhiều năm ảnh thì đo được.
> Every Landsat image is taken at a different tide. One image cannot measure a muddy shoreline; many years of images can."""),
    (PY, """import ee
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from concurrent.futures import ThreadPoolExecutor

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)"""),
    (MD, """## 0. Nước từ Landsat / Water from Landsat

Landsat 5, 7, 8, 9 Collection 2 Level-2. Ba điều dễ sai khi gộp bốn bộ ảnh:
- Hệ số: phản xạ = DN × 0,0000275 − 0,2. Băng lục và SWIR1 là B2/B5 ở Landsat 5, 7 nhưng B3/B6 ở Landsat 8, 9.
- `QA_PIXEL` bit 0–4 (fill, mây giãn, cirrus, mây, bóng mây) phải bằng 0. Bit 0 (fill) loại cả các dải trống của Landsat 7 sau 2003.
- Lọc ngày và vùng **trước** `.map()`, và giữ `system:time_start` trong hàm map, nếu không lọc theo ngày về sau sẽ ra rỗng.

Nước = MNDWI = (lục − SWIR1)/(lục + SWIR1) > 0. Với mỗi pixel, tần suất nước = số lần là nước / số lần chụp không mây.

Landsat 5, 7, 8, 9 Collection 2 Level-2. Three easy mistakes when merging the four sets:
- Scaling: reflectance = DN × 0.0000275 − 0.2. Green and SWIR1 are B2/B5 on Landsat 5, 7 but B3/B6 on Landsat 8, 9.
- `QA_PIXEL` bits 0–4 (fill, dilated cloud, cirrus, cloud, shadow) must be 0. Bit 0 (fill) also removes the Landsat 7 gaps after 2003.
- Filter by date and region **before** `.map()`, and keep `system:time_start` in the mapped function, or later date filters silently return nothing.

Water = MNDWI = (green − SWIR1)/(green + SWIR1) > 0. Per pixel, water frequency = water looks / clear looks."""),
    (PY, """SPEC = [('LANDSAT/LT05/C02/T1_L2', 'SR_B2', 'SR_B5'), ('LANDSAT/LE07/C02/T1_L2', 'SR_B2', 'SR_B5'),
        ('LANDSAT/LC08/C02/T1_L2', 'SR_B3', 'SR_B6'), ('LANDSAT/LC09/C02/T1_L2', 'SR_B3', 'SR_B6')]
UTM = ee.Projection('EPSG:32648').atScale(30)          # UTM 48N, 30 m

def water_look(img, green, swir):
    ok = img.select('QA_PIXEL').bitwiseAnd(0b11111).eq(0)
    g = img.select(green).multiply(0.0000275).add(-0.2)
    s = img.select(swir).multiply(0.0000275).add(-0.2)
    return g.subtract(s).divide(g.add(s)).gt(0).rename('w').updateMask(ok).copyProperties(img, ['system:time_start'])

def looks(y0, y1, geom):
    \"\"\"Mỗi ảnh một mặt nạ nước (1 nước, 0 đất, che = mây) / one water mask per image (1 water, 0 land, masked = cloud).\"\"\"
    out = None
    for cid, g, s in SPEC:
        c = (ee.ImageCollection(cid).filterDate(f'{y0}-01-01', f'{y1 + 1}-01-01').filterBounds(geom)
             .map(lambda i, g=g, s=s: water_look(i, g, s)))
        out = c if out is None else out.merge(c)
    return out

def freq(y0, y1, geom):
    \"\"\"(tần suất nước, số lần chụp không mây) / (water frequency, number of clear looks).\"\"\"
    col = looks(y0, y1, geom)
    return col.mean().setDefaultProjection(UTM), col.count().setDefaultProjection(UTM)"""),
    (MD, """## 1. Đất và nước 1988–92 so với 2021–25 / Land and water, 1988–92 vs 2021–25

Khung 30 × 27 km (UTM 48N, 30 m), góc trên trái ~104,70° E, 8,80° N: mũi Cà Mau phía vịnh Thái Lan và đầu phía tây của bờ Biển Đông. Chương 12 dùng khung 72 km (`cmcoast`); khung đó quá chậm cho Colab, nên ở đây chỉ lấy một góc của nó. Pixel là nước khi tần suất nước ≥ 50 % (đường bờ ở mức triều trung vị); bỏ pixel có < 5 lần chụp không mây ở một trong hai giai đoạn. Tải mất khoảng một phút.

A 30 × 27 km box (UTM 48N, 30 m), upper-left ~104.70° E, 8.80° N: the Gulf of Thailand side of the Cape and the western end of the East Sea coast. Chapter 12 uses a 72 km frame (`cmcoast`), too slow for Colab, so this is one corner of it. A pixel is water when its water frequency is ≥ 50 % (a median-tide shoreline); pixels with < 5 clear looks in either period are left out. The download takes about a minute."""),
    (PY, """X0, Y1, RES, W, H = 466980, 972780, 30, 1000, 900      # UTM 48N: 30 km x 27 km
BOX = ee.Geometry.Rectangle([X0, Y1 - H * RES, X0 + W * RES, Y1], 'EPSG:32648', False)
EARLY, LATE, MIN_LOOKS = (1988, 1992), (2021, 2025), 5

def pixels(img, r0, n):
    arr = ee.data.computePixels({'expression': img, 'fileFormat': 'NUMPY_NDARRAY',
        'grid': {'dimensions': {'width': W, 'height': n}, 'crsCode': 'EPSG:32648',
                 'affineTransform': {'scaleX': RES, 'shearX': 0, 'translateX': X0, 'shearY': 0, 'scaleY': -RES,
                                     'translateY': Y1 - r0 * RES}}})
    return arr

def fetch(img, rows=150):
    \"\"\"Tải theo dải 150 hàng, song song / 150-row strips, in parallel.\"\"\"
    with ThreadPoolExecutor(6) as ex:
        return np.concatenate(list(ex.map(lambda r: pixels(img, r, min(rows, H - r)), range(0, H, rows))))

(f1, n1), (f2, n2) = freq(*EARLY, BOX), freq(*LATE, BOX)
a = fetch(ee.Image.cat([f1.multiply(100).round().unmask(255).toUint8().rename('f1'),
                        f2.multiply(100).round().unmask(255).toUint8().rename('f2'),
                        n1.unmask(0).toUint16().rename('n1'), n2.unmask(0).toUint16().rename('n2')]))
ok = (a['n1'] >= MIN_LOOKS) & (a['n2'] >= MIN_LOOKS) & (a['f1'] <= 100) & (a['f2'] <= 100)
w1, w2 = a['f1'] >= 50, a['f2'] >= 50
cls = np.where(~ok, -1, np.select([~w1 & ~w2, w1 & w2, ~w1 & w2, w1 & ~w2], [0, 1, 2, 3]))
HA = RES * RES / 1e4
print(f"số lần chụp không mây (trung vị) / clear looks (median): {EARLY}: {np.median(a['n1'])}, {LATE}: {np.median(a['n2'])}")
for k, name in enumerate(['đất cả hai / land in both', 'nước cả hai / water in both', 'đất → nước / land → water',
                          'nước → đất / water → land']):
    print(f'{name:28s} {(cls == k).sum() * HA:9.0f} ha')

COLORS = ['#f0f0f0', '#56B4E9', '#D55E00', '#009E73']
plt.figure(figsize=(9, 8))
plt.imshow(np.where(cls < 0, np.nan, cls), cmap=ListedColormap(COLORS), vmin=-0.5, vmax=3.5, interpolation='nearest',
           extent=[X0, X0 + W * RES, Y1 - H * RES, Y1])
plt.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=c) for c in COLORS], loc='lower left', fontsize=8,
           labels=['Đất cả hai / Land in both', 'Nước cả hai / Water in both', 'Đất → nước / Land → water', 'Nước → đất / Water → land'])
plt.title(f'{EARLY[0]}–{EARLY[1] % 100:02d} → {LATE[0]}–{LATE[1] % 100:02d}, UTM 48N (m)')
plt.show()"""),
    (MD, """Đọc bản đồ bằng hình dạng và vị trí: dải cam liền dọc bờ phía nam (bờ Biển Đông) là bờ bị xói; các ô vuông cam trong đất liền phần lớn là ao tôm đào sau 1992 (hoặc ruộng ngập lâu hơn, Chương 12.2); dải xanh lục phía tây là bãi bồi và rừng mới trên bãi bùn. Bản đồ chỉ biết đất và nước, không biết vì sao. Giai đoạn đầu chỉ có Landsat 5 nên ít ảnh hơn nhiều (in ra ở trên). Số ha ở đây là của khung nhỏ này, không so trực tiếp được với khung 72 km của chương (chương: 122 600 ha đất → nước, 20 500 ha nước → đất).

Read the map by shape and position: the continuous orange strip along the southern shore (the East Sea coast) is eroded coast; the orange rectangles inland are mostly shrimp ponds dug after 1992 (or fields flooded longer, Chapter 12.2); the green strip in the west is new land and young forest on the mud flats. The map knows land and water, not why. The early period has Landsat 5 only, so far fewer looks (printed above). The hectares are for this small box and do not compare with the chapter's 72 km frame (chapter: 122,600 ha land → water, 20,500 ha water → land)."""),
    (MD, """## 2. Đất được, đất mất mỗi năm / Land gained and lost each year

Hai đoạn bờ của Chương 12, đúng hình học của chương:
- **Bờ Biển Đông** (Đất Mũi – Rạch Gốc): đường bờ 1988–92 vẽ tay, dài 66,6 km, đệm 1,5 km hai bên.
- **Mũi Cà Mau** phía vịnh Thái Lan: hình chữ nhật 104,70–104,83° E, 8,60–8,80° N.

Mỗi năm, đất = pixel có nước trong < 50 % số lần chụp không mây của năm; chỉ tính pixel có ≥ 3 lần chụp. Năm có < 95 % diện tích đạt điều kiện đó bị bỏ. Xu thế Theil–Sen = trung vị độ dốc của mọi cặp năm, ít bị kéo bởi năm triều thấp hay nhiều mây. Chia cho chiều dài bờ ra tốc độ dịch chuyển đường bờ (m/năm). Mỗi đoạn là một yêu cầu `reduceRegion` (~10 giây).

The two Chapter 12 stretches, with the chapter's exact geometry:
- **East Sea coast** (Dat Mui – Rach Goc): the hand-traced 1988–92 shoreline, 66.6 km long, buffered 1.5 km on both sides.
- **Ca Mau Cape**, Gulf of Thailand side: the rectangle 104.70–104.83° E, 8.60–8.80° N.

Each year, land = pixels that are water in < 50 % of the year's clear looks; only pixels with ≥ 3 looks count. Years where < 95 % of the area meets that are dropped. Theil–Sen trend = median slope over all pairs of years, robust to a low-tide or cloudy year. Divided by the shore length it gives the mean shoreline shift (m/yr). Each stretch is one `reduceRegion` request (~10 s)."""),
    (PY, """EAST = [[104.86, 8.565], [105.00, 8.592], [105.12, 8.655], [105.165, 8.705], [105.21, 8.75], [105.30, 8.808], [105.35, 8.88]]
STRETCHES = {'Bờ Biển Đông / East Sea coast': (ee.Geometry.LineString(EAST).buffer(1500), 66.6),
             'Mũi Cà Mau / Ca Mau Cape': (ee.Geometry.Rectangle([104.70, 8.60, 104.83, 8.80]), None)}
YEARS = list(range(1988, 2026))
PX_HA = ee.Image.pixelArea().divide(1e4)

def yearly_land(geom):
    bands = []
    for y in YEARS:
        f, n = freq(y, y, geom)
        ok = n.gte(3)
        bands += [PX_HA.updateMask(f.lt(0.5).And(ok)).rename(f'l{y}'), PX_HA.updateMask(ok).rename(f'v{y}')]
    r = ee.Image.cat(bands + [PX_HA.rename('area')]).reduceRegion(ee.Reducer.sum(), geom, 30, maxPixels=1e10, tileScale=8).getInfo()
    land = np.array([r.get(f'l{y}') or 0 for y in YEARS], float)
    valid = np.array([r.get(f'v{y}') or 0 for y in YEARS], float)
    return np.where(valid >= 0.95 * r['area'], land, np.nan)

def theil_sen(x, y):
    m = ~np.isnan(y)
    x, y = np.asarray(x, float)[m], y[m]
    i, j = np.triu_indices(len(x), 1)
    slope = np.median((y[j] - y[i]) / (x[j] - x[i]))
    return slope, np.median(y - slope * x)

with ThreadPoolExecutor(2) as ex:
    LAND = dict(zip(STRETCHES, ex.map(lambda k: yearly_land(STRETCHES[k][0]), STRETCHES)))

fig, ax = plt.subplots(figsize=(10, 4.5), layout='constrained')
for (name, (geom, km)), color in zip(STRETCHES.items(), ['#D55E00', '#009E73']):
    land = LAND[name]
    slope, icpt = theil_sen(YEARS, land)
    good = ~np.isnan(land)
    rate = f' = {slope * 1e4 / (km * 1000):.1f} m/năm / m/yr trên / over {km} km' if km else ''
    print(f'{name}: Theil–Sen {slope:.1f} ha/năm / ha/yr{rate}; {good.sum()}/{len(YEARS)} năm đủ ảnh / well-observed years')
    print(f'   dao động trung vị giữa hai năm liền / median year-to-year swing: {np.median(np.abs(np.diff(land[good]))):.0f} ha')
    ref = slope * 1990 + icpt
    ax.plot(np.array(YEARS)[good], land[good] - ref, 'o-', color=color, ms=3, label=f'{name}: {slope:+.0f} ha/yr')
    ax.plot(YEARS, slope * np.array(YEARS) + icpt - ref, '--', color=color)
ax.axhline(0, color='grey', lw=0.5)
ax.set_ylabel('đất so với 1990 / land vs 1990 (ha)'); ax.legend(fontsize=8)
ax.set_title('Đất trong mỗi đoạn bờ, nét đứt = Theil–Sen / Land in each stretch, dashed = Theil–Sen')
plt.show()"""),
    (MD, """Chương 12: bờ Biển Đông −198,1 ha/năm = −29,7 m/năm trên 66,6 km (32/38 năm đủ ảnh); mũi Cà Mau +143,6 ha/năm (36/38 năm). Cùng hình học, cùng quy tắc nên số in ra trùng với chương, có thể lệch ở chữ số cuối (khi viết notebook: −198,2 ha/năm, −29,8 m/năm) vì trang lưu diện tích từng năm đã làm tròn đến ha. Tran Thi và cs. (2014) đo bờ Biển Đông lùi 33,2 m/năm (bản đồ và ảnh 1953–2011), và bờ vịnh Thái Lan ở mũi bồi 40,7 m/năm.

Nhìn đồ thị: từng năm lên xuống hàng trăm ha theo triều và số ảnh (năm 1992 thấp ở mọi nơi). So hai năm bất kỳ có thể cho kết quả sai dấu; xu thế qua mọi năm thì ổn định. Đây vẫn chỉ là **trung bình cả đoạn bờ**: muốn biết chỗ nào lùi nhanh nhất phải đo theo mặt cắt vuông góc với bờ.

Chapter 12: East Sea coast −198.1 ha/yr = −29.7 m/yr over 66.6 km (32/38 well-observed years); Ca Mau Cape +143.6 ha/yr (36/38 years). Same geometry, same rules, so the printed numbers match the chapter up to the last digit (when this notebook was written: −198.2 ha/yr, −29.8 m/yr), because the site stores the yearly areas rounded to whole hectares. Tran Thi et al. (2014) measured the East Sea coast retreating 33.2 m/yr (maps and images 1953–2011) and the Gulf of Thailand side of the Cape advancing 40.7 m/yr.

Look at the plot: single years swing by hundreds of hectares with the tide and the number of images (1992 is low everywhere). Comparing any two years can even give the wrong sign; the trend over all years is stable. It is still only the **mean over the whole stretch**: to find where the shore retreats fastest, measure along transects perpendicular to the shore."""),
    (MD, """## 3. Rừng ngập mặn: Global Mangrove Watch / Mangroves: Global Mangrove Watch

GMW v3 (Bunting và cs., 2022): 11 năm từ 1996 đến 2020, 25 m, từ radar ALOS PALSAR và Landsat. Ảnh của năm Y có `system:index` = `gmw_v3_Y`. So 1996 với 2020 trong khung của mục 1, trên cùng lưới 30 m (lấy ô gần nhất).

GMW v3 (Bunting et al., 2022): 11 years from 1996 to 2020, 25 m, from ALOS PALSAR radar and Landsat. The image of year Y has `system:index` = `gmw_v3_Y`. Compare 1996 and 2020 in the section 1 box, on the same 30 m grid (nearest cell)."""),
    (PY, """GMW = ee.ImageCollection('projects/sat-io/open-datasets/GMW/extent/GMW_V3')

def gmw(year):
    # b1 = 1 trên rừng, che ở chỗ khác / 1 on mangrove, masked elsewhere. Ngưỡng tính trong numpy: qua computePixels,
    # .gt(0).unmask(0) trả về toàn 0 trong lần thử / thresholded in numpy: through computePixels .gt(0).unmask(0) came back all 0 when tried
    return GMW.filter(ee.Filter.eq('system:index', f'gmw_v3_{year}')).first().select('b1').unmask(0)

g = fetch(ee.Image.cat([gmw(1996).rename('g96'), gmw(2020).rename('g20')]).toUint8())
m96, m20 = g['g96'] > 0, g['g20'] > 0
mg = np.select([m96 & m20, m96 & ~m20, ~m96 & m20], [1, 2, 3], 0)
print(f'rừng ngập mặn 1996 / mangroves 1996: {m96.sum() * HA:.0f} ha, 2020: {m20.sum() * HA:.0f} ha')
print(f'còn / kept {(mg == 1).sum() * HA:.0f} ha, mất / lost {(mg == 2).sum() * HA:.0f} ha, mới / new {(mg == 3).sum() * HA:.0f} ha')
lost_coast = (mg == 2) & (cls == 2)
print(f'phần mất nằm trên pixel "đất → nước" của mục 1 / lost area on section 1 "land → water" pixels: '
      f'{100 * lost_coast.sum() / max((mg == 2).sum(), 1):.0f} %')

MCOL = ['#ffffff', '#009E73', '#D55E00', '#F0E442']
plt.figure(figsize=(9, 8))
plt.imshow(mg, cmap=ListedColormap(MCOL), vmin=-0.5, vmax=3.5, interpolation='nearest', extent=[X0, X0 + W * RES, Y1 - H * RES, Y1])
plt.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=c) for c in MCOL[1:]], loc='lower left', fontsize=8,
           labels=['1996 và 2020 / 1996 and 2020', 'Mất sau 1996 / Lost since 1996', 'Mới từ 1996 / New since 1996'])
plt.title('Global Mangrove Watch v3')
plt.show()"""),
    (MD, """Chương 12, cả khung 72 km: 7 700 ha rừng năm 1996 không còn năm 2020, 2 300 ha rừng mới; phần mất là một dải liền dọc bờ Biển Đông, đúng nơi đường bờ lùi: rừng không bị chặt mà đất dưới rừng bị sóng cuốn đi. Khung nhỏ ở đây gồm cả bờ bồi phía tây, nên diện tích gần như không đổi (khi viết notebook: 33 152 ha năm 1996, 33 285 ha năm 2020; mất 1 970 ha, mới 2 103 ha), và khoảng một nửa phần mất nằm trên pixel "đất → nước" của mục 1. Các năm GMW không dựng từ cùng một bộ radar, nên một phần chênh lệch có thể đến từ dữ liệu chứ không phải thay đổi thật.

Chapter 12, whole 72 km frame: 7,700 ha of 1996 forest gone by 2020, 2,300 ha new; the loss is a continuous strip along the East Sea coast, exactly where the shoreline retreats: the forest was not cut, the ground under it was washed away. The small box here also holds the accreting west side, so its mangrove area hardly changes (when this notebook was written: 33,152 ha in 1996, 33,285 ha in 2020; 1,970 ha lost, 2,103 ha new), and about half of the loss lies on section 1 "land → water" pixels. GMW epochs are not built from the same radar data, so part of a difference can come from the data rather than real change.

## Bài tập / Exercises

1. Đổi `EARLY` thành (1996, 2000). Bản đồ mục 1 thay đổi thế nào ở bờ Biển Đông và trong vùng ao tôm? / Set `EARLY` to (1996, 2000). How does the section 1 map change on the East Sea coast and in the pond area?
2. Tính lại xu thế bờ Biển Đông chỉ với các năm từ 2000 (`land[:12] = np.nan`). Bờ lùi nhanh hơn hay chậm hơn? / Recompute the East Sea trend from 2000 only. Is the retreat faster or slower?
3. Thêm đoạn Hải Hậu (Nam Định) của chương: đường `[[106.20, 20.006], [106.25, 20.058], [106.30, 20.117], [106.35, 20.177]]`, 24,6 km. Chương: +10,0 ha/năm (+4,1 m/năm), dao động giữa hai năm thường khoảng 130 ha. Xu thế có rõ không? / Add the chapter's Hai Hau stretch (line above, 24.6 km). Chapter: +10.0 ha/yr (+4.1 m/yr), with year-to-year swings of about 130 ha. Is there a clear trend?

*Landsat 5/7/8/9 Collection 2 Level-2 courtesy of the U.S. Geological Survey. Global Mangrove Watch v3.0 (Bunting et al. 2022), CC BY 4.0. Tran Thi et al. (2014); xem tài liệu tham khảo Chương 12 / see the Chapter 12 references.*"""),
]

if __name__ == "__main__":
    main(CELLS, "coast_shoreline")
