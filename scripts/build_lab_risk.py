"""Generate labs/risk_overlay.ipynb (Colab) for Chapter 14 (risk).

    cd scripts && python build_lab_risk.py           # write the notebook
    cd scripts && python build_lab_risk.py --run     # also execute the code cells locally (needs EE auth)

The GEE Code Editor version is labs/risk_overlay.js (kept by hand). Section 1 reads the site's own published layers
(public/data, local copy when the notebook runs inside the repository); section 2 rebuilds one indicator in Earth Engine.
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 14 — Chồng lớp rủi ro / Risk overlay

**Viễn thám Nông nghiệp & Môi trường — Chương 14** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/risk/)

1. Chồng lớp có trọng số bốn chỉ số hiểm họa trên đất trồng trọt ĐBSCL, bảng theo tỉnh, hiểm họa trội, thử các bộ trọng số / Weighted overlay of four hazard indicators on Mekong Delta cropland, province table, dominant hazard, weight presets.
2. Dựng lại chỉ số "đất thấp" từ DeltaDTM trong Earth Engine / Rebuild the "low-lying land" indicator from DeltaDTM in Earth Engine.

> Bản đồ này là **hiểm họa** trên đất trồng trọt, chưa phải rủi ro: không có phơi nhiễm theo người, thu nhập hay đê điều (Chương 14.5).
> This map shows **hazard** on cropland, not risk: people, income and dikes are not in it (Chapter 14.5)."""),
    (PY, """import gzip, json, urllib.request
from pathlib import Path
import ee
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit (chỉ cần cho mục 2 / only needed for section 2)
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)"""),
    (MD, """## 1. Chồng lớp có trọng số / Weighted overlay

Dữ liệu là các lớp bản đồ mà trang web hiển thị (`public/data/<id>/`): `meta.json` mô tả lưới, `values.binz` là mảng gzip, mỗi bước thời gian (ở đây: mỗi chỉ số) một băng; giá trị = raw × scale + offset, raw = nodata là không có dữ liệu. Đường dẫn GitHub chỉ dùng được sau khi kho mã được công bố; nếu notebook chạy trong thư mục của kho thì đọc bản cục bộ.

- `risk-mekong`: 4 chỉ số (ngập lũ, thiếu mưa, cây trồng suy giảm, đất thấp), điểm 0–100, chỉ trên ô ~250 m có ≥ 50 % đất trồng trọt WorldCover 2021.
- `prov-mekong`: chỉ số tỉnh của mỗi ô (ranh trước 2025, geoBoundaries).

The data are the map layers the website shows (`public/data/<id>/`): `meta.json` describes the grid, `values.binz` is a gzip array with one band per time step (here: per indicator); value = raw × scale + offset, raw = nodata means no data. The GitHub URL works once the repository is published; when the notebook runs inside the repository it reads the local copy.

- `risk-mekong`: 4 indicators (flooding, dry-season rain deficit, dry-season crop decline, low-lying land), scores 0–100, only on ~250 m cells with ≥ 50 % WorldCover 2021 cropland.
- `prov-mekong`: province index of each cell (pre-2025 boundaries, geoBoundaries)."""),
    (PY, """BASE = 'https://raw.githubusercontent.com/quanta1985/rs-agri/main/public/data/'
LOCAL = next((p for p in (Path('public/data'), Path('../public/data')) if p.is_dir()), None)

def get(path):
    return (LOCAL / path).read_bytes() if LOCAL else urllib.request.urlopen(BASE + path).read()

def load(layer_id):
    \"\"\"(meta, giá trị / values (steps, h, w), NaN = không có dữ liệu / no data).\"\"\"
    meta = json.loads(get(f'{layer_id}/meta.json'))
    dt = {'uint8': '<u1', 'uint16': '<u2', 'int16': '<i2'}[meta['dtype']]
    raw = np.frombuffer(gzip.decompress(get(f'{layer_id}/values.binz')), dt)
    raw = raw.reshape(len(meta['times']), meta['height'], meta['width'])
    return meta, np.where(raw == meta['nodata'], np.nan, raw * meta['scale'] + meta['offset'])

meta, steps = load('risk-mekong')
pmeta, prov = load('prov-mekong')
prov = prov[0]
NAMES = meta['times']                                    # ['flood', 'rain', 'crop', 'low']
LABEL = {k: f"{v['vi']} / {v['en']}" for k, v in meta['indicators'].items()}
PROV = [c['label']['vi'] for c in pmeta['classes']]

# Diện tích mặt đất của mỗi ô: ô Mercator co theo cos(vĩ độ) / ground area per cell: Mercator cells shrink with cos(latitude)
R = 6378137.0
y = meta['origin'][1] - (np.arange(meta['height']) + 0.5) * meta['res']
lat = 2 * np.arctan(np.exp(y / R)) - np.pi / 2
CELL_HA = np.broadcast_to(((meta['res'] * np.cos(lat)) ** 2 / 1e4)[:, None], prov.shape)
print('nguồn / source:', LOCAL or BASE)
print('lưới / grid', meta['width'], 'x', meta['height'], f"ô / cell {meta['ground_res_m']} m;", 'chỉ số / indicators:', NAMES)"""),
    (MD, """Chỉ số tổng hợp của một ô là trung bình có trọng số, **chỉ lấy trên các chỉ số có dữ liệu ở ô đó**: thiếu một chỉ số không bị tính là 0. Hiểm họa trội = chỉ số có w·s lớn nhất. Ngưỡng "cao" = 50.

The composite of a cell is the weighted mean **over the indicators that have data in that cell**: a missing indicator does not count as 0. Dominant hazard = the indicator with the largest w·s. "High" threshold = 50.

$$R = \\frac{\\sum_k w_k s_k}{\\sum_k w_k}$$"""),
    (PY, """HIGH = 50

def composite(w):
    w = np.asarray(w, float)[:, None, None]
    ok = ~np.isnan(steps) & (w > 0)
    s = np.where(ok, w * np.nan_to_num(steps), 0).sum(0)
    ws = np.where(ok, w, 0).sum(0)
    return np.where(ws > 0, s / np.where(ws > 0, ws, 1), np.nan)

def dominant(w):
    c = np.nan_to_num(np.asarray(w, float)[:, None, None] * steps)
    return np.where(c.max(0) > 0, c.argmax(0), -1)         # -1 = mọi điểm có trọng số đều 0 / every weighted score is 0

def run(w, show=True):
    idx, dom = composite(w), dominant(w)
    ok = ~np.isnan(idx)
    a = CELL_HA[ok]
    total = {'kha': a.sum() / 1e3, 'mean': (a * idx[ok]).sum() / a.sum(), 'high': 100 * a[idx[ok] >= HIGH].sum() / a.sum(),
             'dom': {n: 100 * a[dom[ok] == k].sum() / a.sum() for k, n in enumerate(NAMES)}}
    rows = []
    for z, name in enumerate(PROV):
        m = ok & (prov == z)
        if not m.any():
            continue
        a = CELL_HA[m]
        dha = [a[dom[m] == k].sum() for k in range(len(NAMES))]
        rows.append((name, 100 * a[idx[m] >= HIGH].sum() / a.sum(), (a * idx[m]).sum() / a.sum(),
                     NAMES[int(np.argmax(dha))] if max(dha) > 0 else '-', a.sum() / 1e3))
    rows.sort(key=lambda r: -r[1])
    if show:
        print(f"trọng số / weights {dict(zip(NAMES, w))}: trung bình / mean {total['mean']:.1f}, "
              f"R >= {HIGH}: {total['high']:.1f} % của / of {total['kha']:.0f} nghìn ha / kha")
        print('  hiểm họa trội / dominant:', ', '.join(f'{n} {v:.1f} %' for n, v in total['dom'].items()))
        print(f"  {'tỉnh / province':14s} {'R>=50 %':>8s} {'TB/mean':>8s} {'trội/top':>8s} {'kha':>6s}")
        for name, hi, mean, top, kha in rows:
            print(f'  {name:14s} {hi:8.1f} {mean:8.1f} {top:>8s} {kha:6.0f}')
    return idx, dom, total, rows

idx, dom, total, rows = run([1, 1, 1, 1])

fig, ax = plt.subplots(1, 2, figsize=(14, 7), layout='constrained')
im = ax[0].imshow(idx, cmap='YlOrRd', vmin=0, vmax=100, interpolation='nearest')
fig.colorbar(im, ax=ax[0], shrink=0.6, label='R (0–100)')
ax[0].set_title('Chỉ số tổng hợp, trọng số bằng nhau / Composite, equal weights')
OKABE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7']   # lũ xanh, mưa cam, cây trồng lục lam, đất thấp tím / flood, rain, crop, low
dmap = np.where(np.isnan(idx), np.nan, np.where(dom < 0, np.nan, dom))
ax[1].imshow(dmap, cmap=ListedColormap(OKABE), vmin=-0.5, vmax=3.5, interpolation='nearest')
ax[1].legend(handles=[plt.Rectangle((0, 0), 1, 1, color=c) for c in OKABE], labels=[LABEL[n] for n in NAMES], loc='lower left', fontsize=8)
ax[1].set_title('Hiểm họa trội / Dominant hazard')
for a in ax:
    a.set_axis_off()
plt.show()"""),
    (MD, """Chương 14 (trọng số bằng nhau): trung bình 45,6; 35,2 % trong 1 940 nghìn ha có R ≥ 50; đứng đầu Hậu Giang 52,6 %, Long An 48,6 %, Kiên Giang 43,9 %; cuối bảng Trà Vinh 6,4 %; hiểm họa trội: đất thấp 39,3 %, thiếu mưa 26,0 %, cây trồng 17,7 %, lũ 17,0 %. Notebook dùng đúng dữ liệu và cùng công thức với hình 14.1 (`src/lib/risk.ts`), nên các số in ra phải trùng khớp.

Chapter 14 (equal weights): mean 45.6; 35.2 % of 1,940 kha with R ≥ 50; top Hau Giang 52.6 %, Long An 48.6 %, Kien Giang 43.9 %; bottom Tra Vinh 6.4 %; dominant hazard: low land 39.3 %, rain 26.0 %, crop 17.7 %, flood 17.0 %. The notebook uses the same data and the same formula as Figure 14.1 (`src/lib/risk.ts`), so the printed numbers must match."""),
    (MD, """### Thử các bộ trọng số / Weight presets

Không dữ liệu nào nói lũ "nặng" gấp mấy lần đất thấp: trọng số là một phán đoán. Phân tích độ nhạy = thử nhiều bộ trọng số, rồi xem tỉnh nào luôn đứng đầu.

No data says how much "heavier" flooding is than low land: weights are a judgement. Sensitivity analysis = try many weight sets and see which provinces stay on top."""),
    (PY, """PRESETS = {'bằng nhau / equal': [1, 1, 1, 1], 'bỏ mưa / no rain': [1, 0, 1, 1], 'mưa x3 / rain x3': [1, 3, 1, 1],
           'lũ x3 / flood x3': [3, 1, 1, 1], 'đất thấp x3 / low x3': [1, 1, 1, 3]}
table = {}
for name, w in PRESETS.items():
    _, _, t, r = run(w, show=False)
    table[name] = (t, r)
    top3 = ', '.join(p for p, *_ in r[:3])
    ranks = {p: i + 1 for i, (p, *_) in enumerate(r)}
    print(f"{name:22s} {'/'.join(map(str, w))}: R>=50 {t['high']:5.1f} %, TB/mean {t['mean']:.1f}; đầu / top: {top3}; "
          f"Bến Tre {dict((p, h) for p, h, *_ in r)['Bến Tre']:.1f} % (hạng / rank {ranks['Bến Tre']}), "
          f"Cà Mau hạng / rank {ranks['Cà Mau']}, An Giang hạng / rank {ranks['An Giang']}")

# Thứ hạng tỉnh theo từng bộ trọng số / province rank under each preset
names = [p for p, *_ in table['bằng nhau / equal'][1]]
rank = np.array([[[p for p, *_ in table[k][1]].index(n) + 1 for k in PRESETS] for n in names])
fig, ax = plt.subplots(figsize=(9, 5), layout='constrained')
for i, n in enumerate(names):
    ax.plot(range(len(PRESETS)), rank[i], marker='o')
    ax.text(len(PRESETS) - 0.9, rank[i, -1], n, va='center', fontsize=8)
ax.set_xticks(range(len(PRESETS)), [k.split(' / ')[1] for k in PRESETS])
ax.invert_yaxis(); ax.set_ylabel('hạng / rank (1 = R≥50 nhiều nhất / largest high share)')
ax.set_xlim(-0.3, len(PRESETS) + 0.5)
ax.set_title('Thứ hạng tỉnh đổi theo trọng số / Province ranks change with the weights')
plt.show()"""),
    (MD, """Chương 14: bỏ mưa 29,8 %; mưa ×3 48,3 % (Cà Mau từ hạng 9 lên hạng 4, ba tỉnh đầu vẫn là Hậu Giang, Kiên Giang, Long An); lũ ×3 28,5 % (Long An, Đồng Tháp dẫn đầu, Bến Tre 0,0 %); đất thấp ×3 49,6 % (Hậu Giang 75,3 %, Cà Mau 75,2 %, An Giang cuối bảng 21,7 %).

Chỉ số thiếu mưa gần như bằng nhau khắp vùng (52–72 điểm ở 2 % đến 98 % các ô): tăng trọng số của nó chỉ đẩy nhiều ô qua ngưỡng 50 mà không thêm thông tin nơi nào hơn nơi nào.

Chapter 14: no rain 29.8 %; rain ×3 48.3 % (Ca Mau from 9th to 4th, the top three stay Hau Giang, Kien Giang, Long An); flood ×3 28.5 % (Long An, Dong Thap lead, Ben Tre 0.0 %); low ×3 49.6 % (Hau Giang 75.3 %, Ca Mau 75.2 %, An Giang last at 21.7 %).

The rain indicator is almost the same everywhere (52–72 points from the 2nd to the 98th percentile of cells): raising its weight only pushes many cells over 50 without adding any information on which place is worse."""),
    (MD, """## 2. Dựng lại chỉ số "đất thấp" trong Earth Engine / Rebuild the low-land indicator in Earth Engine

Quy tắc của Chương 14: độ cao mặt đất DeltaDTM (m trên EGM2008, trung bình các ô ~30 m trong mỗi ô ~250 m) cho 100 điểm khi ≤ 1 m, 0 điểm khi ≥ 3 m, tuyến tính ở giữa; chỉ trên ô có ≥ 50 % đất trồng trọt WorldCover 2021 (tỉ lệ ô 10 m). Lấy cả hai về **đúng lưới của lớp `risk-mekong`** (Web Mercator, ~250 m) để so từng ô. Mất khoảng 1–2 phút (tỉ lệ đất trồng trọt từ ô 10 m là bước chậm).

Chapter 14 rule: DeltaDTM ground elevation (m above EGM2008, mean of the ~30 m cells in each ~250 m cell) scores 100 at ≤ 1 m, 0 at ≥ 3 m, linear in between; only on cells with ≥ 50 % WorldCover 2021 cropland (share of 10 m cells). Both are fetched on **exactly the grid of the `risk-mekong` layer** (Web Mercator, ~250 m) so the cells compare one to one. Takes about 1–2 minutes (the 10 m cropland share is the slow step)."""),
    (PY, """from concurrent.futures import ThreadPoolExecutor

W, H, RES = meta['width'], meta['height'], meta['res']
X0, Y1 = meta['origin']

def pixels(img, r0, n):
    \"\"\"Hàng r0..r0+n của lưới risk-mekong / rows r0..r0+n of the risk-mekong grid.\"\"\"
    arr = ee.data.computePixels({'expression': img, 'fileFormat': 'NUMPY_NDARRAY',
        'grid': {'dimensions': {'width': W, 'height': n}, 'crsCode': 'EPSG:3857',
                 'affineTransform': {'scaleX': RES, 'shearX': 0, 'translateX': X0, 'shearY': 0, 'scaleY': -RES,
                                     'translateY': Y1 - r0 * RES}}})
    return arr[arr.dtype.names[0]].astype(float)

def fetch(img, rows):
    \"\"\"Tải theo dải hàng, song song: EE giới hạn kích thước mỗi yêu cầu / row strips in parallel (EE caps each request).\"\"\"
    with ThreadPoolExecutor(8) as ex:
        return np.concatenate(list(ex.map(lambda r: pixels(img, r, min(rows, H - r)), range(0, H, rows))))

dtm = ee.Image('projects/sat-io/open-datasets/DELTARES/deltadtm_v1')            # band b1, m trên / above EGM2008, nước bị che / water masked
z = fetch(dtm.reduceResolution(ee.Reducer.mean(), maxPixels=1024).unmask(-999), 128)
z[z <= -999] = np.nan
wc = ee.ImageCollection('ESA/WorldCover/v200').first()                              # 2021
crop = fetch(wc.eq(40).multiply(100).reduceResolution(ee.Reducer.mean(), maxPixels=1024).unmask(-1), 48)   # 10 m -> 250 m: dải hẹp / thin strips
crop[crop < 0] = np.nan

low = np.clip(100 * (3 - z) / 2, 0, 100)
farm = ~np.isnan(prov) & (crop >= 50)          # trong vùng ĐBSCL (ranh tỉnh của trang) / inside the Mekong region (the site's provinces)
ok = farm & ~np.isnan(low)
a = CELL_HA[ok]
print(f'đất trồng trọt có DeltaDTM / cropland with DeltaDTM: {a.sum() / 1e3:.0f} nghìn ha / kha')
print(f'điểm đất thấp >= 50 (DeltaDTM <= 2 m): {100 * a[low[ok] >= 50].sum() / a.sum():.1f} % ; trung bình / mean {(a * low[ok]).sum() / a.sum():.1f}')

pub = steps[NAMES.index('low')]
both = ok & ~np.isnan(pub)
d = np.abs(low - pub)[both]
print(f'so với lớp của trang / vs the site layer: {100 * (d <= 1).mean():.1f} % ô lệch <= 1 điểm / of cells within 1 point, lệch lớn nhất / max {d.max():.1f}')
low_r = np.floor(low + 0.5)                     # trang lưu điểm dạng số nguyên / the site stores integer scores
print(f'làm tròn như trang / rounded like the site: >= 50 trên / on {100 * a[low_r[ok] >= 50].sum() / a.sum():.1f} %')

fig, ax = plt.subplots(1, 2, figsize=(14, 7), layout='constrained')
im = ax[0].imshow(np.where(farm, z, np.nan), cmap='viridis', vmin=0, vmax=4, interpolation='nearest')
fig.colorbar(im, ax=ax[0], shrink=0.6, label='DeltaDTM (m, EGM2008)')
ax[0].set_title('Độ cao đất trồng trọt / Cropland elevation')
im = ax[1].imshow(np.where(farm, low, np.nan), cmap='YlOrRd', vmin=0, vmax=100, interpolation='nearest')
fig.colorbar(im, ax=ax[1], shrink=0.6, label='điểm / score')
ax[1].set_title('Điểm đất thấp / Low-land score')
for a_ in ax:
    a_.set_axis_off()
plt.show()"""),
    (MD, """Chương 14: 68,4 % đất trồng trọt ĐBSCL có điểm đất thấp ≥ 50, tức thấp hơn 2 m theo DeltaDTM. Notebook tính trực tiếp từ dữ liệu gốc nên cho số thấp hơn một chút. Lý do: trang lưu điểm dạng số nguyên, nên ô có điểm 49,5–49,99 (DeltaDTM khoảng 2,00–2,01 m) được làm tròn lên 50. Làm tròn như trang thì số in ra gần như trùng với chương; phần chênh còn lại là các ô có tỉ lệ đất trồng trọt sát 50 % (trang cũng lưu tỉ lệ này dạng số nguyên) và độ cao được lưu theo bước 0,01 m. Diện tích đất trồng trọt có DeltaDTM cũng nhỏ hơn chương (1 939 nghìn ha) vì cùng lý do: ô 49,5–49,99 % đất trồng trọt được trang làm tròn thành 50 %. Bài học: một ngưỡng cứng (50 điểm, 50 % đất trồng trọt) làm kết quả nhạy với cả cách làm tròn.

Chapter 14: 68.4 % of Mekong cropland scores ≥ 50 on low land, i.e. lies below 2 m on DeltaDTM. The notebook works from the raw data and gets slightly less. The reason: the site stores integer scores, so cells scoring 49.5–49.99 (DeltaDTM about 2.00–2.01 m) round up to 50. Rounded like the site, the printed share is almost the chapter's; the rest of the gap are cells with a cropland share right at 50 % (the site stores that share as an integer too) and elevations stored in 0.01 m steps. The cropland area with DeltaDTM is also smaller than the chapter's (1,939 kha) for the same reason: cells with 49.5–49.99 % cropland are rounded to 50 % on the site. The lesson: a hard threshold (50 points, 50 % cropland) makes the result sensitive even to rounding.

## Bài tập / Exercises

1. Đổi thang điểm đất thấp sang min–max của vùng (ô thấp nhất 100, cao nhất 0). Tỷ lệ R ≥ 50 với trọng số bằng nhau đổi thế nào? Vì sao thang cố định theo mét so sánh được giữa hai châu thổ còn min–max thì không? / Rescale low land to the region's min–max (lowest cell 100, highest 0). How does the high share with equal weights change? Why does a fixed metre scale compare across deltas while min–max does not?
2. Chạy 200 bộ trọng số ngẫu nhiên (`np.random.default_rng(2026).integers(0, 6, (200, 4))`, bỏ bộ toàn 0). Tỉnh nào nằm trong ba tỉnh đầu ở hơn một nửa số lần? / Run 200 random weight sets. Which provinces are in the top three more than half of the time?
3. Tải `risk-red` và `prov-red` (chỉ có lũ và đất thấp). Vì sao gần như không ô nào vượt 50 (chương: 1,1 %)? / Load `risk-red` and `prov-red` (flood and low land only). Why does almost no cell exceed 50 (chapter: 1.1 %)?

*DeltaDTM v1.0 (Pronk et al. 2024, Scientific Data 11:273), CC BY 4.0. ESA WorldCover 10 m 2021 v200, CC BY 4.0. Contains modified Copernicus Sentinel data. CHIRPS (UCSB CHC). MODIS (NASA LP DAAC). Ranh tỉnh / province boundaries: geoBoundaries gbOpen ADM1 (Public Domain).*"""),
]

if __name__ == "__main__":
    main(CELLS, "risk_overlay")
