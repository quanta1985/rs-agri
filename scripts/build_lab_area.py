"""Generate labs/area_sampling.ipynb (Colab) for Chapter 5 (area-stats).

    cd scripts && python build_lab_area.py           # write the notebook
    cd scripts && python build_lab_area.py --run     # also execute the code cells locally (the last cell needs EE auth)

The GEE Code Editor version is labs/area_sampling.js (kept by hand; it builds a stand-in population in Earth Engine).
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 5 — Lấy mẫu để ước lượng diện tích / Sampling for area estimation

**Viễn thám Nông nghiệp & Môi trường — Chương 5** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/area-stats/)

1. Tổng thể: các ô ~250 m của ĐBSCL, y = diện tích lúa 2024, x = diện tích đất trồng trọt Esri 2021 / Population: the ~250 m cells of the Mekong Delta, y = 2024 rice area, x = Esri 2021 cropland area.
2. Bốn cách ước lượng từ một mẫu 200 ô / Four estimators from one sample of 200 cells.
3. Lặp 500 lần: độ lệch chuẩn và hiệu quả tương đối / 500 repeats: standard deviation and relative efficiency.
4. Cỡ mẫu cho một hệ số biến động mục tiêu / Sample size for a target coefficient of variation.
5. (Earth Engine) x đến từ đâu / (Earth Engine) where x comes from.

Mục 1–4 chỉ cần numpy, không cần Earth Engine. Bản đồ lúa ở đây đóng vai "sự thật": đây là **mô phỏng**, không có sai số thực địa.
Sections 1–4 need only numpy, no Earth Engine. The rice map plays the role of the "truth": this is a **simulation**, with no field errors."""),
    (PY, """import gzip
import json
import math
import urllib.request
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

# Lớp bản đồ của trang web: lấy từ GitHub (khi kho mã đã công khai) hoặc thư mục public/data cục bộ
# The website's map layers: from GitHub (once the repository is public) or a local public/data folder
BASE = 'https://raw.githubusercontent.com/quanta1985/rs-agri/main/public/data/'
LOCAL = next((p for p in (Path('public/data'), Path('../public/data')) if p.is_dir()), None)

def site_file(name):
    if LOCAL is not None and (LOCAL / name).exists():
        return (LOCAL / name).read_bytes()
    with urllib.request.urlopen(BASE + name, timeout=60) as r:
        return r.read()

def site_layer(layer_id):
    \"\"\"meta + mảng giá trị thô (bước, hàng, cột); giá trị = thô × scale + offset, thô == nodata là không có dữ liệu.
    meta + raw array (steps, rows, cols); value = raw × scale + offset, raw == nodata means no data.\"\"\"
    meta = json.loads(site_file(f'{layer_id}/meta.json'))
    raw = np.frombuffer(gzip.decompress(site_file(f'{layer_id}/values.binz')), np.dtype(meta['dtype']).newbyteorder('<'))
    return meta, raw.reshape(len(meta['times']), meta['height'], meta['width'])

R = 6378137.0

def row_area_ha(meta):
    \"\"\"Diện tích mặt đất của một pixel ở mỗi hàng (pixel Mercator co lại theo cos² vĩ độ).
    Ground area of one pixel in each row (Mercator pixels shrink by cos² of the latitude).\"\"\"
    y = meta['origin'][1] - (np.arange(meta['height']) + 0.5) * meta['res']
    lat = 2 * np.arctan(np.exp(y / R)) - np.pi / 2
    return (meta['res'] * np.cos(lat)) ** 2 / 1e4"""),
    (MD, """## 1. Tổng thể / The population

- `rice-seasons-<vùng>`, bước cuối (2024): số vụ lúa của mỗi ô (Chương 4). y = diện tích ô nếu có ít nhất một vụ, 0 nếu không (ô không có dữ liệu, tức không phải đất trồng trọt, cũng tính là 0).
- `lc-cropfrac-<vùng>`, bước Esri: % đất trồng trọt trong ô theo Esri 2021 (Chương 3). x = % × diện tích ô. Không dùng WorldCover, vì chính WorldCover đã khoanh vùng đất trồng trọt cho bản đồ lúa.
- Tầng theo % đất trồng trọt Esri: < 25, 25–75, ≥ 75. Ô ngoài ranh vùng bị bỏ.

- `rice-seasons-<region>`, last step (2024): rice seasons of each cell (Chapter 4). y = cell area if at least one season, else 0 (no-data cells, i.e. not cropland, also count as 0).
- `lc-cropfrac-<region>`, Esri step: % cropland in the cell on Esri 2021 (Chapter 3). x = % × cell area. WorldCover is not used: it drew the cropland mask of the rice map itself.
- Strata from the Esri cropland %: < 25, 25–75, ≥ 75. Cells outside the region outline are dropped."""),
    (PY, """REGION = 'mekong'   # hoặc / or 'red'
rice_meta, rice = site_layer(f'rice-seasons-{REGION}')
crop_meta, crop = site_layer(f'lc-cropfrac-{REGION}')
assert all(rice_meta[k] == crop_meta[k] for k in ('origin', 'res', 'width', 'height')), 'lưới khác nhau / grids differ'

r_last = rice[-1]                                   # 2024
c_esri = crop[crop_meta['times'].index('Esri')]
area = np.broadcast_to(row_area_ha(rice_meta)[:, None], r_last.shape)
valid = c_esri != crop_meta['nodata']
rice_yes = (r_last != rice_meta['nodata']) & (r_last >= 1)

y = np.where(rice_yes, area, 0.0)[valid]            # ha lúa của ô / rice ha of the cell
pct = c_esri[valid].astype(float)
x = pct / 100 * area[valid]                         # ha đất trồng trọt Esri / Esri cropland ha
stratum = np.digitize(pct, [25, 75])                # 0: < 25 %, 1: 25–75 %, 2: >= 75 %
N = y.size
Y, X = y.sum(), x.sum()
r = np.corrcoef(y, x)[0, 1]
print(f'{REGION}: N = {N:,} ô / cells, có lúa / with rice {100 * (y > 0).mean():.1f} %, '
      f'diện tích lúa / rice area {Y / 1000:,.0f} kha, đất trồng trọt Esri / Esri cropland {X / 1000:,.0f} kha')
for h, name in enumerate(['< 25 %', '25–75 %', '>= 75 %']):
    m = stratum == h
    print(f'  tầng / stratum {name:8s}: {m.sum():7,} ô / cells, {100 * (y[m] > 0).mean():5.1f} % có lúa / with rice')
print(f'r(y, x) = {r:.3f}')

fig, ax = plt.subplots(1, 2, figsize=(12, 6), layout='constrained')
img = np.full(r_last.shape, np.nan); img[valid] = stratum
ax[0].imshow(img, cmap='Greys', vmin=-1, vmax=2, interpolation='nearest'); ax[0].set_title('Tầng / strata (Esri 2021)')
img = np.full(r_last.shape, np.nan); img[valid] = y > 0
ax[1].imshow(img, cmap='YlGn', vmin=0, vmax=1.3, interpolation='nearest'); ax[1].set_title('Có lúa 2024 / rice in 2024 (y > 0)')
for a in ax: a.set_axis_off()
plt.show()"""),
    (MD, """Chương 5 (ĐBSCL): 636 121 ô, 42,7 % có lúa, 1 692 nghìn ha lúa; ba tầng 228 418 / 112 594 / 295 109 ô với 2,2 / 30,9 / 78,4 % ô có lúa; r = 0,72. Cùng dữ liệu, cùng cách tính nên các số in ra phải trùng.

Chapter 5 (Mekong Delta): 636,121 cells, 42.7 % with rice, 1,692 thousand ha of rice; strata of 228,418 / 112,594 / 295,109 cells with 2.2 / 30.9 / 78.4 % rice cells; r = 0.72. Same data and method, so the printed numbers should match."""),
    (MD, """## 2. Bốn cách ước lượng / Four estimators

- **Ngẫu nhiên đơn** (SRS): Ŷ = N·ȳ, SE = N·√((1 − n/N)·s²/n).
- **Phân tầng**: Ŷ = Σ N_h·ȳ_h. Phân bổ **tỉ lệ** (n_h ∝ N_h) hoặc **Neyman** (n_h ∝ N_h·S_h), mỗi tầng ít nhất 2 ô. Neyman ở đây dùng S_h thật của tổng thể, điều mà điều tra thật không biết trước.
- **Hồi quy**: Ŷ = N·(ȳ + b·(X̄ − x̄)), với X̄ = trung bình thật của x, biết được vì bản đồ phủ mọi ô.

- **Simple random** (SRS): Ŷ = N·ȳ, SE = N·√((1 − n/N)·s²/n).
- **Stratified**: Ŷ = Σ N_h·ȳ_h. **Proportional** (n_h ∝ N_h) or **Neyman** (n_h ∝ N_h·S_h) allocation, at least 2 cells per stratum. Neyman here uses the true S_h of the population, which a real survey does not know in advance.
- **Regression**: Ŷ = N·(ȳ + b·(X̄ − x̄)), with X̄ = the true mean of x, known because the map covers every cell."""),
    (PY, """members = [np.flatnonzero(stratum == h) for h in range(3)]
Nh = np.array([m.size for m in members])
Sh = np.array([y[m].std(ddof=1) for m in members])

def srs(idx):
    s = y[idx]; n = idx.size
    return N * s.mean(), N * math.sqrt((1 - n / N) * s.var(ddof=1) / n)

def stratified(samples):
    tot = var = 0.0
    for h, idx in enumerate(samples):
        s = y[idx]; n = idx.size
        tot += Nh[h] * s.mean()
        var += Nh[h] ** 2 * (1 - n / Nh[h]) * s.var(ddof=1) / n
    return tot, math.sqrt(var)

def regression(idx):
    ys, xs = y[idx], x[idx]; n = idx.size
    b = np.cov(ys, xs)[0, 1] / xs.var(ddof=1)
    resid = ys - ys.mean() - b * (xs - xs.mean())
    return N * (ys.mean() + b * (X / N - xs.mean())), N * math.sqrt((1 - n / N) * (resid ** 2).sum() / (n - 2) / n)

def allocate(n, weights):
    \"\"\"n ô chia cho các tầng, mỗi tầng >= 2, theo trọng số; phần dư làm tròn chia theo phần lẻ lớn nhất.
    Split n cells over strata, >= 2 each, by weight; leftovers by largest remainder (as in src/lib/sampling.ts).\"\"\"
    out = np.full(3, 2)
    raw = (n - out.sum()) * weights / weights.sum()
    out += np.floor(raw).astype(int)
    for h in np.argsort(-(raw - np.floor(raw)), kind='stable')[: n - out.sum()]:
        out[h] += 1
    return out

ALLOC = {'prop': allocate(200, Nh.astype(float)), 'neyman': allocate(200, Nh * Sh)}
print('phân bổ / allocation n = 200: tỉ lệ / proportional', ALLOC['prop'], ', Neyman', ALLOC['neyman'])

def draw(method, n, rng):
    if method == 'srs':
        return srs(rng.choice(N, n, replace=False))
    if method == 'reg':
        return regression(rng.choice(N, n, replace=False))
    nh = ALLOC[method] if n == 200 else allocate(n, Nh.astype(float) if method == 'prop' else Nh * Sh)
    return stratified([m[rng.choice(m.size, k, replace=False)] for m, k in zip(members, nh)])

METHODS = {'srs': 'Ngẫu nhiên đơn / Simple random', 'prop': 'Phân tầng tỉ lệ / Stratified (prop.)',
           'neyman': 'Phân tầng Neyman / Stratified (Neyman)', 'reg': 'Hồi quy / Regression'}
rng = np.random.default_rng(2026)
print(f'\\nMột mẫu 200 ô / one sample of 200 cells (giá trị thật / true value {Y / 1000:,.0f} kha):')
for m, name in METHODS.items():
    est, se = draw(m, 200, rng)
    print(f'  {name:40s} {est / 1000:7,.0f} ± {1.96 * se / 1000:5.0f} kha (95 %)')"""),
    (MD, """## 3. Lặp 500 lần / 500 repeats

Một mẫu chỉ cho một ước lượng. Lặp lại 500 lần cho thấy **sai số thật** của mỗi cách lấy mẫu: độ lệch chuẩn của 500 ước lượng. Hiệu quả = (SD ngẫu nhiên đơn / SD cách khác)².

One sample gives one estimate. Repeating it 500 times shows the **real error** of each design: the standard deviation of the 500 estimates. Efficiency = (SD simple random / SD of the design)²."""),
    (PY, """REPS, n = 500, 200
rng = np.random.default_rng(2026)
sim = {m: np.array([draw(m, n, rng) for _ in range(REPS)]) for m in METHODS}
sd_srs = sim['srs'][:, 0].std(ddof=1)
print(f'n = {n}, {REPS} lần / repeats; giá trị thật / true {Y / 1000:,.0f} kha')
print(f'{"":40s}{"TB/mean":>9s}{"SD":>8s}{"CV %":>7s}{"TB SE":>8s}{"hiệu quả/eff":>13s}')
for m, name in METHODS.items():
    est, se = sim[m][:, 0], sim[m][:, 1]
    sd = est.std(ddof=1)
    print(f'{name:40s}{est.mean() / 1000:9,.0f}{sd / 1000:8.1f}{100 * sd / Y:7.1f}{se.mean() / 1000:8.1f}{(sd_srs / sd) ** 2:13.2f}')
print(f'lý thuyết hồi quy / regression theory 1/(1 − r²) = {1 / (1 - r ** 2):.2f}')

fig, ax = plt.subplots(1, 4, figsize=(16, 3.5), layout='constrained', sharex=True, sharey=True)
for a, (m, name) in zip(ax, METHODS.items()):
    a.hist(sim[m][:, 0] / 1000, bins=30, color='#0072b2')
    a.axvline(Y / 1000, color='#d55e00', lw=2)
    a.set_title(name, fontsize=9); a.set_xlabel('nghìn ha / thousand ha')
plt.show()"""),
    (MD, """Chương 5 (ĐBSCL, n = 200, 500 lần, hạt giống 2026 trên bộ sinh số mulberry32 của trang web): SD ngẫu nhiên đơn 141,2 nghìn ha (CV 8,3 %), phân tầng tỉ lệ 97,7, Neyman 88,8 (hiệu quả 2,53), hồi quy 97,0 (hiệu quả 2,12); trung bình sai số chuẩn của mẫu đơn 138,6. Phân bổ cho 200 ô: tỉ lệ 72/36/92, Neyman 34/51/115.

numpy dùng bộ sinh số khác, nên 500 mẫu ở đây khác 500 mẫu của chương. Bản thân SD tính từ 500 lần lặp cũng dao động khoảng ±3 % (1/√(2·499)), và hiệu quả là tỉ số bình phương của hai SD nên dao động cỡ ±10 %. Lần chạy khi soạn bài (numpy, hạt giống 2026) cho SD 139,4 / 100,8 / 93,0 / 95,3 nghìn ha và hiệu quả 1,91 / 2,25 / 2,14: SD lệch chương vài phần trăm, hiệu quả lệch tới khoảng 10 %, nhưng ba cách dùng bản đồ vẫn hiệu quả gấp khoảng 2 lần mẫu ngẫu nhiên đơn. Phân bổ thì xác định, phải trùng.

Chapter 5 (Mekong Delta, n = 200, 500 repeats, seed 2026 on the website's mulberry32 generator): simple random SD 141.2 thousand ha (CV 8.3 %), proportional 97.7, Neyman 88.8 (efficiency 2.53), regression 97.0 (efficiency 2.12); mean standard error of the simple random design 138.6. Allocation of 200 cells: proportional 72/36/92, Neyman 34/51/115.

numpy uses a different random generator, so the 500 samples here are not the chapter's. An SD from 500 repeats itself varies by about ±3 % (1/√(2·499)), and the efficiency, a ratio of two squared SDs, by about ±10 %. The run made while writing this lab (numpy, seed 2026) gave SDs of 139.4 / 100.8 / 93.0 / 95.3 thousand ha and efficiencies of 1.91 / 2.25 / 2.14: SDs a few percent off the chapter, efficiencies up to about 10 %, but the three map-assisted designs are still about twice as efficient as simple random sampling. The allocations are deterministic and should match."""),
    (MD, """## 4. Cỡ mẫu cho một CV mục tiêu / Sample size for a target CV

n₀ = (S_y / (CV·Ȳ))², n = n₀ / (1 + n₀/N), cho mẫu ngẫu nhiên đơn. Phân tầng hay hồi quy chia n cho hiệu quả của chúng.

n₀ = (S_y / (CV·Ȳ))², n = n₀ / (1 + n₀/N), for a simple random sample. Stratification or regression divide n by their efficiency."""),
    (PY, """def size_for_cv(cv):
    n0 = (y.std(ddof=1) / (cv * y.mean())) ** 2
    return math.ceil(n0 / (1 + n0 / N))

eff_reg = (sd_srs / sim['reg'][:, 0].std(ddof=1)) ** 2
for cv in (0.05, 0.02):
    n_srs = size_for_cv(cv)
    print(f'CV {100 * cv:.0f} %: ngẫu nhiên đơn / simple random {n_srs:,} ô / cells; hồi quy / regression ≈ {n_srs / eff_reg:,.0f}')"""),
    (MD, """Chương 5: ở ĐBSCL, CV 5 % cần 538 ô và CV 2 % cần 3 343 ô ngẫu nhiên; ở ĐBSH 1 030 và 6 306 ô. Công thức không có yếu tố ngẫu nhiên nên số cho mẫu ngẫu nhiên đơn phải trùng; số cho hồi quy phụ thuộc hiệu quả mô phỏng ở mục 3.

Chapter 5: in the Mekong Delta a 5 % CV needs 538 random cells and a 2 % CV 3,343; in the Red River Delta 1,030 and 6,306. The formula has no randomness, so the simple random numbers should match; the regression numbers depend on the simulated efficiency of section 3."""),
    (MD, """## 5. (Earth Engine) x đến từ đâu / (Earth Engine) where x comes from

Tính lại % đất trồng trọt Esri 2021 trên một cửa sổ 64 × 64 ô của lưới 250 m, ngay trên Earth Engine, rồi so với lớp `lc-cropfrac` đã tải. Trang web tính từ một bản sao Esri đã đưa về lưới WorldCover, nên có thể lệch vài điểm phần trăm ở vài ô. Mục này cần một Google Cloud project đã đăng ký Earth Engine.

Recompute the Esri 2021 cropland % on a 64 × 64 cell window of the 250 m grid, directly in Earth Engine, and compare with the downloaded `lc-cropfrac` layer. The website computed it from a copy of Esri resampled to the WorldCover grid, so a few cells may differ by a few percentage points. This section needs a Google Cloud project registered for Earth Engine."""),
    (PY, """import ee

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)

ESRI = 'projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS'
ROW0, COL0, W = 560, 500, 64   # cửa sổ trên lưới / window on the grid
res = crop_meta['res']
x0, y1 = crop_meta['origin'][0] + COL0 * res, crop_meta['origin'][1] - ROW0 * res
box = ee.Geometry.Rectangle([x0, y1 - W * res, x0 + W * res, y1], 'EPSG:3857', False).transform('EPSG:4326', 1)
col = ee.ImageCollection(ESRI).filterBounds(box).filterDate('2021-01-01', '2022-01-01')
code = col.mosaic().remap([1, 2, 4, 5, 7, 8, 11], [1, 2, 6, 3, 4, 7, 5], 0)   # 3 = cây trồng / crops
frac = (code.eq(3).multiply(100).updateMask(code.gt(0)).setDefaultProjection(col.first().projection())
        .reduceResolution(ee.Reducer.mean(), maxPixels=1024).unmask(255).round().toUint8().rename('x'))
arr = ee.data.computePixels({'expression': frac, 'fileFormat': 'NUMPY_NDARRAY',
    'grid': {'dimensions': {'width': W, 'height': W}, 'crsCode': 'EPSG:3857',
             'affineTransform': {'scaleX': res, 'shearX': 0, 'translateX': x0, 'shearY': 0, 'scaleY': -res, 'translateY': y1}}})['x']
layer = c_esri[ROW0:ROW0 + W, COL0:COL0 + W]
ok = (arr != 255) & (layer != crop_meta['nodata'])
diff = np.abs(arr[ok].astype(int) - layer[ok].astype(int))
lon, lat = box.centroid(1).coordinates().getInfo()
print(f'cửa sổ quanh / window around {lon:.2f}° E, {lat:.2f}° N: {ok.sum()} ô / cells')
print(f'chênh tuyệt đối trung bình / mean absolute difference {diff.mean():.2f} điểm % / points, '
      f'lớn nhất / max {diff.max()}, r = {np.corrcoef(arr[ok], layer[ok])[0, 1]:.4f}')"""),
    (MD, """Khi soạn bài, chênh trung bình chỉ khoảng 0,2 điểm phần trăm và r gần bằng 1: lớp đã tải đúng là đất trồng trọt Esri 2021 tính theo ô 250 m.

When this lab was written, the mean difference was only about 0.2 percentage points with r close to 1: the downloaded layer is indeed the Esri 2021 cropland share per 250 m cell.

## Bài tập / Exercises

1. Đổi `REGION = 'red'` rồi chạy lại mục 1–4. Chương 5: cùng 200 ô, CV ngẫu nhiên đơn ở ĐBSH là 11,1 % (ĐBSCL 8,3 %) và Neyman đạt hiệu quả 2,77. Vì sao lúa ít và rải rác thì cần nhiều ô hơn? / Set `REGION = 'red'` and run sections 1–4 again. Chapter 5: with the same 200 cells, the simple random CV is 11.1 % in the Red River Delta (Mekong 8.3 %) and Neyman reaches an efficiency of 2.77. Why does sparse, scattered rice need more cells?
2. Đặt `n = 800` ở mục 3. Độ lệch chuẩn có giảm một nửa, như 1/√n dự đoán? / Set `n = 800` in section 3. Does the standard deviation halve, as 1/√n predicts?
3. Thay x bằng bước WorldCover của `lc-cropfrac` (`crop_meta['times'].index('WorldCover')`). Tầng < 25 % còn bao nhiêu ô có lúa, và vì sao phân tầng trông tốt hơn thực tế? / Replace x with the WorldCover step of `lc-cropfrac`. How many rice cells are left in the < 25 % stratum, and why does stratification look better than it really is?

*Bản đồ lúa 2024 / 2024 rice map: Chương 4 / Chapter 4 (MODIS MOD13Q1/MYD13Q1 v061 EVI, NASA LP DAAC, ở ĐBSCL / Mekong; Sentinel-1 ở ĐBSH / Red River). Contains modified Copernicus Sentinel data. Esri 10 m Annual LULC, Impact Observatory (Karra et al. 2021), CC BY 4.0.*"""),
]

if __name__ == "__main__":
    main(CELLS, "area_sampling")
