"""Generate labs/yield_evi.ipynb (Colab) for Chapter 6 (yield).

    cd scripts && python build_lab_yield.py           # write the notebook
    cd scripts && python build_lab_yield.py --run     # also execute the code cells locally (needs EE auth)

The GEE Code Editor version of the same steps is labs/yield_evi.js (kept by hand).
"""
from labkit import MD, PY, main

CELLS = [
    (MD, """# Lab 6 — EVI và năng suất lúa / EVI and rice yield

**Viễn thám Nông nghiệp & Môi trường — Chương 6** · [Mở chương / Open chapter](https://quanta1985.github.io/rs-agri/vi/yield/)

1. EVI cực đại vụ Đông Xuân trên đất trồng trọt của Long An và An Giang, 2001–2025 (MODIS) / Peak EVI of the winter-spring season on the cropland of Long An and An Giang, 2001–2025 (MODIS).
2. Năng suất chính thức và xu thế / Official yields and their trend.
3. Hồi quy năng suất theo EVI: số gốc và đã bỏ xu thế, kiểm định chéo bỏ-một-năm / Yield regressed on EVI: raw and detrended, leave-one-out cross-validation.
4. Thử dự báo năm 2025 / A forecast for 2025.

> Năng suất tăng đều nhờ giống và kỹ thuật, EVI cũng tăng theo thời gian. Hai chuỗi cùng đi lên nên R² trên số gốc trông rất đẹp. Phải bỏ xu thế rồi mới biết vệ tinh nói được gì về **năm tốt, năm xấu**.
> Yields rise steadily with new varieties and practices, and EVI also rises over time. Both series go up, so the R² on raw numbers looks very good. Only after removing the trend do we learn what the satellite says about **good and bad years**."""),
    (PY, """import ee
import numpy as np
import matplotlib.pyplot as plt

PROJECT = 'YOUR-CLOUD-PROJECT-ID'  # <-- sửa / edit
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)

# Bản geoBoundaries trong Earth Engine mất các chữ ngoài bảng Latin-1 ('Hậu Giang' -> 'H?u Giang'): đổi tên theo cùng cách.
# The Earth Engine copy of geoBoundaries lost the letters outside Latin-1 ('Hậu Giang' -> 'H?u Giang'): convert names the same way.
def gb_name(s):
    return s.encode('latin-1', 'replace').decode('latin-1')

GB = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'))

def provinces(names):
    \"\"\"Tỉnh theo tên, khớp cả tên đúng lẫn tên bị lỗi / provinces by name, matching the correct and the corrupted spelling.\"\"\"
    fc = GB.filter(ee.Filter.inList('shapeName', list(names) + [gb_name(n) for n in names]))
    n = fc.size().getInfo()
    assert n == len(names), f'tìm thấy / found {n} of {len(names)} provinces'
    return fc"""),
    (MD, """## 1. EVI cực đại của vụ / Peak EVI of the season

Vụ Đông Xuân ở ĐBSCL: 15/11 năm trước – 31/3. Gộp MODIS Terra (MOD13Q1) và Aqua (MYD13Q1), mỗi loại 16 ngày, lệch nhau 8 ngày; chỉ giữ pixel SummaryQA ≤ 1 (không mây). Mỗi pixel lấy giá trị EVI lớn nhất trong vụ, rồi lấy trung bình trên các ô 250 m có ≥ 50 % đất trồng trọt ESA WorldCover 2021 trong ranh tỉnh.

Winter-spring season in the Mekong Delta: 15 Nov of the previous year – 31 Mar. MODIS Terra (MOD13Q1) and Aqua (MYD13Q1) are merged, 16-day composites each, 8 days apart; only SummaryQA ≤ 1 pixels (no cloud) are kept. Each pixel takes its highest EVI of the season, then the values are averaged over the 250 m cells with ≥ 50 % ESA WorldCover 2021 cropland inside the province."""),
    (PY, """PROVS = ['Long An', 'An Giang']
YEARS = list(range(2001, 2026))   # năm thu hoạch / harvest year (2001 = vụ 15/11/2000 – 31/3/2001)
fc = provinces(PROVS)

COLS = ['MODIS/061/MOD13Q1', 'MODIS/061/MYD13Q1']
proj = ee.ImageCollection(COLS[0]).first().select('EVI').projection()   # lưới sin MODIS 250 m / MODIS sinusoidal 250 m grid
wc = ee.ImageCollection('ESA/WorldCover/v200').first()
# 10 m -> 100 m -> 250 m: tỷ lệ đất trồng trọt (lớp 40) / cropland share (class 40)
frac = wc.eq(40).reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(proj.atScale(100))
crop = frac.reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(proj).gte(0.5)

def peak(y):
    col = (ee.ImageCollection(COLS[0]).merge(ee.ImageCollection(COLS[1]))
           .filterDate(f'{y - 1}-11-15', f'{y}-04-01').filterBounds(fc.geometry()))
    good = col.map(lambda im: im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1)))
    return good.max().rename(f'y{y}')

img = ee.Image.cat([peak(y) for y in YEARS]).setDefaultProjection(proj).updateMask(crop)
res = img.reduceRegions(fc, ee.Reducer.mean(), crs=proj, scale=proj.nominalScale(), tileScale=16).getInfo()
by_gb = {f['properties']['shapeName']: f['properties'] for f in res['features']}
EVI = {p: np.array([by_gb.get(p, by_gb.get(gb_name(p)))[f'y{y}'] for y in YEARS]) for p in PROVS}

for p in PROVS:
    print(p, ' '.join(f'{y}:{v:.3f}' for y, v in zip(YEARS, EVI[p])))
plt.figure(figsize=(9, 3.5))
for p, m in zip(PROVS, 'os'):
    plt.plot(YEARS, EVI[p], marker=m, label=p)
plt.ylabel('EVI cực đại / peak EVI'); plt.legend(); plt.grid(alpha=0.3)
plt.title('EVI cực đại vụ Đông Xuân trên đất trồng trọt / winter-spring peak EVI on cropland')
plt.show()"""),
    (MD, """Chương 6 tính cùng chỉ số với ranh tỉnh trong `provinces.json` của trang: cũng là geoBoundaries gbOpen (ranh trước 2025), nhưng bản **đã đơn giản hóa**. Ở đây Earth Engine dùng bản đầy đủ, nên vài ô ven ranh tỉnh vào hoặc ra. Giá trị lệch chương khoảng 0,001 EVI ở Long An và tới 0,007 ở An Giang (nhiều nhất vào 2001–2004).

Chapter 6 computes the same index with the province lines in the site's `provinces.json`: also geoBoundaries gbOpen (pre-2025 lines), but the **simplified** version. Here Earth Engine uses the full version, so a few cells along the province edges come in or drop out. The values differ from the chapter's by about 0.001 EVI in Long An and up to 0.007 in An Giang (most in 2001–2004)."""),
    (MD, """## 2. Năng suất chính thức / Official yields

Năng suất lúa Đông Xuân (tấn/ha, trên diện tích **gieo trồng**) từ Cục Thống kê (NSO), PX-Web bảng V06.16–V06.18 "Lúa đông xuân phân theo địa phương", https://pxweb.nso.gov.vn/pxweb/vi/ (tải ngày 18/11/2026). Năm 2025 là số **sơ bộ**: dùng ở mục 4, không dùng để khớp mô hình.

Winter-spring rice yield (t/ha, per **sown** area) from the National Statistics Office (NSO), PX-Web tables V06.16–V06.18, https://pxweb.nso.gov.vn/pxweb/vi/ (downloaded 18 Nov 2026). The 2025 value is **preliminary**: it is used in section 4, not to fit the model."""),
    (PY, """YIELD = {   # 2001 ... 2025, t/ha (NSO V06.17; 2025 sơ bộ / preliminary)
    'Long An': [4.35, 4.87, 5.02, 5.05, 5.33, 5.1, 5.21, 5.4, 5.31, 5.72, 5.85, 6.09, 6.35, 6.71, 6.71, 6.05, 5.59,
                6.12, 6.34, 6.49, 6.65, 6.45, 6.78, 6.606, 6.749],
    'An Giang': [5.56, 6.54, 6.41, 6.52, 6.93, 6.81, 7.11, 7.31, 7.16, 7.3, 7.51, 7.4, 7.35, 7.74, 7.56, 7.19, 7.03,
                 7.35, 7.1, 7.17, 7.69, 7.34, 7.55, 7.444, 7.38],
}
YIELD = {p: np.array(v) for p, v in YIELD.items()}
T = np.array(YEARS)
FIT = T <= 2024          # năm dùng để khớp / years used to fit (2001–2024, as in the chapter)

def ols(x, y):
    \"\"\"y = a + b x; trả về / returns a, b, R².\"\"\"
    b, a = np.polyfit(x, y, 1)
    r2 = 1 - ((y - a - b * x) ** 2).sum() / ((y - y.mean()) ** 2).sum()
    return a, b, r2

def detrend(t, v):
    a, b, _ = ols(t, v)
    return v - (a + b * t)

fig, ax = plt.subplots(1, len(PROVS), figsize=(6 * len(PROVS), 3.8), layout='constrained', squeeze=False)
ax = ax[0]
for i, p in enumerate(PROVS):
    a, b, r2 = ols(T[FIT], YIELD[p][FIT])
    print(f'{p}: năng suất / yield {YIELD[p][0]:.2f} (2001) -> {YIELD[p][FIT][-1]:.2f} (2024) t/ha; '
          f'xu thế / trend {b:.3f} t/ha/năm (R² {r2:.2f})')
    ax[i].plot(T[FIT], YIELD[p][FIT], 'o-', label='NSO')
    ax[i].plot(T[FIT], a + b * T[FIT], '--', label=f'xu thế / trend {b:.3f} t/ha/yr')
    ax[i].plot(2025, YIELD[p][-1], 'o', mfc='none', label='2025 sơ bộ / preliminary')
    ax[i].set_title(p); ax[i].set_ylabel('t/ha'); ax[i].legend(fontsize=8); ax[i].grid(alpha=0.3)
plt.show()"""),
    (MD, """Chương 6: Long An 4,35 → 6,61 tấn/ha, xu thế 0,089 tấn/ha/năm (R² 0,80); An Giang 5,56 → 7,44 tấn/ha, xu thế 0,049 (R² 0,50). Số liệu giống nhau nên kết quả ở đây phải trùng.

Chapter 6: Long An 4.35 → 6.61 t/ha, trend 0.089 t/ha/yr (R² 0.80); An Giang 5.56 → 7.44 t/ha, trend 0.049 (R² 0.50). The data are the same, so the results here must match."""),
    (MD, """## 3. Mô hình năng suất: số gốc và đã bỏ xu thế / Yield model: raw and detrended

ΔY = a + b·ΔEVI, với ΔY, ΔEVI là phần lệch khỏi đường xu thế theo năm. Kiểm định chéo **bỏ-một-năm** (LOO): mỗi năm được dự báo bằng đường hồi quy khớp trên các năm còn lại. Mô hình chỉ có ích nếu sai số LOO nhỏ hơn sai số của cách đơn giản nhất: đoán bằng trung bình các năm khác.

ΔY = a + b·ΔEVI, where ΔY and ΔEVI are departures from a linear trend in time. **Leave-one-out** (LOO) cross-validation: each year is predicted by the line fitted to all other years. The model is useful only if its LOO error is smaller than that of the simplest guess: the mean of the other years."""),
    (PY, """def loo_rmse(x, y):
    err = []
    for i in range(len(y)):
        k = np.arange(len(y)) != i
        a, b, _ = ols(x[k], y[k])
        err.append(y[i] - (a + b * x[i]))
    return np.sqrt(np.mean(np.square(err)))

def loo_mean(y):
    n = len(y)
    return np.sqrt(np.mean((y - (y.sum() - y) / (n - 1)) ** 2))

fig, ax = plt.subplots(2, len(PROVS), figsize=(5.5 * len(PROVS), 8), layout='constrained', squeeze=False)
for i, p in enumerate(PROVS):
    x, y, t = EVI[p][FIT], YIELD[p][FIT], T[FIT]
    _, b_raw, r2_raw = ols(x, y)
    dx, dy = detrend(t, x), detrend(t, y)
    _, b_det, r2_det = ols(dx, dy)
    print(f'{p}: n = {len(y)}; R² số gốc / raw {r2_raw:.2f}; R² đã bỏ xu thế / detrended {r2_det:.2f} (b = {b_det:.1f} t/ha per EVI); '
          f'LOO RMSE {loo_rmse(dx, dy):.2f} t/ha so với / vs đoán trung bình / mean {loo_mean(dy):.2f} t/ha')
    ax[0, i].scatter(x, y, c=t, cmap='viridis'); ax[0, i].set_title(f'{p}: số gốc / raw, R² = {r2_raw:.2f}')
    ax[0, i].set_xlabel('EVI cực đại / peak EVI'); ax[0, i].set_ylabel('t/ha')
    ax[1, i].scatter(dx, dy, c=t, cmap='viridis'); ax[1, i].set_title(f'{p}: đã bỏ xu thế / detrended, R² = {r2_det:.2f}')
    ax[1, i].set_xlabel('ΔEVI'); ax[1, i].set_ylabel('ΔY (t/ha)')
    for j in (0, 1):
        ax[j, i].grid(alpha=0.3)
    for tt, xx, yy in zip(t, dx, dy):
        if tt in (2016, 2017):
            ax[1, i].annotate(str(tt), (xx, yy), fontsize=8)
plt.show()"""),
    (MD, """Chương 6 (Hình 6.3, `node scripts/yield_numbers.ts`):

| Tỉnh / Province | R² số gốc / raw | R² bỏ xu thế / detrended | LOO RMSE | Đoán trung bình / mean |
|---|---|---|---|---|
| Long An | 0,74 | 0,14 | 0,30 t/ha | 0,32 t/ha |
| An Giang | 0,43 | 0,29 | 0,31 t/ha | 0,35 t/ha |

Lần chạy kiểm tra của notebook này cho Long An: 0,74 / 0,14 / LOO 0,31 so với 0,32; An Giang: 0,39 / 0,28 / LOO 0,31 so với 0,35. R² số gốc của An Giang thấp hơn chương (0,39 thay vì 0,43) vì EVI những năm đầu ở đây cao hơn tới 0,007 (mục 1), làm xu thế EVI thoải hơn; sau khi bỏ xu thế, hai kết quả gần như trùng.

R² số gốc của Long An cao vì cả năng suất và EVI cùng tăng theo năm, không phải vì EVI "biết" năm nào tốt. Sau khi bỏ xu thế, An Giang là tỉnh tốt nhất trong 13 tỉnh của chương, và mô hình chỉ bớt được khoảng 0,04 tấn/ha sai số.

The test run of this notebook gave Long An: 0.74 / 0.14 / LOO 0.31 vs 0.32; An Giang: 0.39 / 0.28 / LOO 0.31 vs 0.35. The raw R² of An Giang is lower than the chapter's (0.39 instead of 0.43) because the early-year EVI here is up to 0.007 higher (section 1), which flattens the EVI trend; after detrending the two results nearly coincide.

R² on raw numbers is high in Long An because yield and EVI both rise over the years, not because EVI "knows" which year was good. After detrending, An Giang is the best of the chapter's 13 provinces, and the model removes only about 0.04 t/ha of error."""),
    (MD, """## 4. Thử dự báo năm 2025 / A forecast for 2025

Khớp mô hình trên 2001–2024, kéo dài xu thế đến 2025, rồi cộng b·ΔEVI của năm 2025. So với năng suất **sơ bộ** 2025 của NSO. Đây chỉ là một năm: đúng hay sai một lần không chứng minh được gì; con số đáng tin hơn là sai số LOO ở mục 3.

Fit the model on 2001–2024, extend the trend to 2025, and add b·ΔEVI of 2025. Compare with the NSO **preliminary** 2025 yield. This is one year only: being right or wrong once proves nothing; the LOO error in section 3 is the number to trust."""),
    (PY, """for p in PROVS:
    t, x, y = T[FIT], EVI[p][FIT], YIELD[p][FIT]
    ax_, bx, _ = ols(t, x)          # xu thế EVI / EVI trend
    ay, by, _ = ols(t, y)           # xu thế năng suất / yield trend
    a, b, _ = ols(x - (ax_ + bx * t), y - (ay + by * t))
    dx25 = EVI[p][-1] - (ax_ + bx * 2025)
    trend25 = ay + by * 2025
    pred = trend25 + a + b * dx25
    print(f'{p} 2025: EVI {EVI[p][-1]:.3f} (ΔEVI {dx25:+.3f}); chỉ xu thế / trend only {trend25:.2f}, '
          f'mô hình / model {pred:.2f}, NSO sơ bộ / preliminary {YIELD[p][-1]:.2f} t/ha')"""),
    (MD, """Lần chạy kiểm tra: Long An, mô hình 6,81 tấn/ha so với số sơ bộ 6,75 (chỉ xu thế: 6,95), tức EVI giúp đúng hướng. An Giang, mô hình 7,92 so với 7,38 (chỉ xu thế: 7,74): EVI 2025 cao nhưng năng suất lại thấp, nên mô hình sai nhiều hơn cả đường xu thế. Một năm đúng, một năm sai: đúng như sai số LOO dự báo.

Test run: Long An, model 6.81 t/ha against the preliminary 6.75 (trend only: 6.95), so EVI pointed the right way. An Giang, model 7.92 against 7.38 (trend only: 7.74): EVI was high in 2025 but the yield was low, so the model missed by more than the trend line. One year right, one wrong: just what the LOO error suggests."""),
    (MD, """## Bài tập / Exercises

1. Thêm Kiên Giang và Sóc Trăng (tên vào `PROVS`, một dãy năng suất 2001–2025 vào `YIELD`, lấy từ `scripts/data/nso_rice_dong_xuan.csv` của kho mã). Chương 6: Kiên Giang R² 0,75 → 0,22, Sóc Trăng 0,73 → 0,14. / Add Kien Giang and Soc Trang (names in `PROVS`, a 2001–2025 yield array in `YIELD`, from `scripts/data/nso_rice_dong_xuan.csv` in the repository). Chapter 6: Kien Giang R² 0.75 → 0.22, Soc Trang 0.73 → 0.14.
2. Thay EVI cực đại bằng EVI trung bình 1/2–31/3 (giai đoạn chín, lúc mặn 2016 và 2020 gây hại). Với Long An, R² đã bỏ xu thế đổi thế nào (chương: 0,01)? / Replace peak EVI with the mean EVI of 1 Feb – 31 Mar (ripening, when the 2016 and 2020 salinity struck). How does the detrended R² of Long An change (chapter: 0.01)?
3. Bỏ bước nhân `crop` (lấy mọi pixel trong tỉnh). R² có giảm không? Vì sao vườn cây, làng mạc làm loãng tín hiệu? / Drop the `crop` mask (every pixel in the province). Does R² fall? Why do orchards and villages dilute the signal?

*MODIS MOD13Q1/MYD13Q1 v061, NASA LP DAAC. ESA WorldCover 10 m 2021 v200, CC BY 4.0. geoBoundaries (Runfola et al. 2020), CC BY 4.0. Năng suất / Yields: Cục Thống kê (NSO) PX-Web V06.16–V06.18.*"""),
]

if __name__ == "__main__":
    main(CELLS, "yield_evi")
