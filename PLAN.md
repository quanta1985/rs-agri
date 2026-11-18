# rs-agri — Kế hoạch xây dựng

**Viễn thám Nông nghiệp & Môi trường / Remote Sensing for Agriculture & Environment**
Sổ tay tương tác song ngữ (vi/en), dựa trên FAO (2017) *Handbook on Remote Sensing for Agricultural Statistics* (`ca6394en.md`), lấy **môi trường và các yếu tố tự nhiên phục vụ nông nghiệp** làm trục, ví dụ trên dữ liệu thật của Đồng bằng sông Hồng (ĐBSH) và Đồng bằng sông Cửu Long (ĐBSCL).

## 1. Quyết định đã chốt (2026-11-15)

| Mục | Quyết định |
|---|---|
| Cấu trúc | Môi trường làm trục. Sách FAO lồng vào Phần B (đất & cây trồng, thống kê ở mức vừa). Phần C (môi trường) lớn nhất. |
| Dự án | Site riêng, cùng stack với `L:\Remote Sensing and GIS` (rs-knowledge). Kiến thức nền (phổ, SAR, phân loại, tiền xử lý) **không viết lại**, link sang rs-knowledge. |
| Ngôn ngữ | vi + en ngay từ đầu. |
| Phạm vi | MVP trước: bộ khung + trang chủ + 3 chương **Lúa**, **Lũ**, **Mặn**. Duyệt xong mới làm tiếp. |
| Khu vực | 2 vùng toàn châu thổ + 5 điểm chi tiết 10 m (mục 4). |
| Dữ liệu | Xuất từ GEE (project `claudev1-503808`) + số liệu công bố có trích dẫn. Sơ đồ/preset minh họa phải ghi "minh họa". |
| Tên/deploy | `rs-agri`. GitHub Pages `quanta1985.github.io/rs-agri/` + bản sao `remosat.usth.edu.vn/~quanta/rs-agri/`. Chỉ push khi được yêu cầu. |

**Bản quyền nguồn:** sách FAO 2017 không phải CC BY (trang bản quyền là ảnh, cần xác minh trên PDF trang 2–4). Mặc định: viết lại, không dịch nguyên văn; trích bảng/hình phải ghi nguồn; ghi công FAO ở chương Tra cứu và trang chủ. App giữ giấy phép CC BY-NC 4.0 cho nội dung (khác rs-knowledge) cho tới khi xác minh xong.

## 2. Kiến trúc (sao từ rs-knowledge)

**Giữ nguyên:** Astro 7 + MDX + React islands; `AppBar` ribbon (tab Phần A/B/C/D, Tra cứu, Xem); `Base.astro` (theme, depth, present mode); components `Figure`, `Note`, `Tiles`, `Stats`, `Steps`, `Formula`/`M`, `Term`, `Depth`, `LabLinks`, `RefList`; islands `MapStage`, `VizUi`, `LineChart`, `Predict`, `Quiz`, `FormulaTable`; `src/lib/{geo,raster,chart}.ts` + test; i18n `ui.ts`; design tokens (teal `--primary`, ochre `--accent`, Chakra Petch / Be Vietnam Pro / JetBrains Mono); quy ước sovereignty (Hoàng Sa, Trường Sa); Pagefind; workflow deploy.

**Bỏ:** toàn bộ island Phần A (quỹ đạo, phóng, tín hiệu, GNSS, Cesium globe), `cube.ts` khung Hà Nội.

**Mới:**

- **Định dạng lớp dữ liệu vùng** `public/data/<layer>/`:
  - `meta.json`: bbox, kích thước, EPSG:3857 (để image quad của MapLibre khớp đúng, không méo), `scale/offset/nodata`, đơn vị, palette, danh sách thời điểm, nguồn + ngày xuất.
  - `values.u8z` / `values.u16z`: lưới gzip (giữ đuôi riêng như `.u16z` cũ), nhiều thời điểm xếp BSQ. Tô màu phía client, hover ra giá trị thật.
  - Ngân sách: ĐBSCL ~275×300 km ở 250 m ≈ 1,3 Mpx/lớp (u8 gzip ~0,3–0,8 MB). Toàn vùng dùng 250–500 m (MODIS) hoặc 5–11 km (khí hậu); 10 m chỉ dùng ở điểm chi tiết (1024×1024 ≈ 10 km).
- **`DeltaMap.tsx`** (bọc `MapStage`): chọn vùng ĐBSH/ĐBSCL/điểm, chọn lớp, thanh trượt thời gian, so sánh vuốt (swipe) hai lớp/hai năm, hover giá trị + đơn vị, chú giải liên tục/phân lớp, ranh tỉnh, ghi nguồn.
- **`SeriesChart.tsx`**: chuỗi thời gian nhiều đường + dải phần vị, đánh dấu sự kiện (đợt mặn, lũ), không nối qua khoảng trống > 40 ngày.
- **`ThresholdLab.tsx`**: ngưỡng tương tác (Otsu/thủ công) trên lớp điểm chi tiết, đếm diện tích theo ngưỡng.
- Ranh giới tỉnh: geoBoundaries ADM1 (Public Domain, ranh 2008 = 63 tỉnh cũ, khớp số liệu lịch sử; ghi chú sáp nhập 2025). Không dùng GADM vì giấy phép cấm phân phối lại.

## 3. Mục lục 16 chương

Cột "Sách" = mục FAO dùng làm nguồn. "Mới" = viết ngoài sách, phải có trích dẫn.

### Phần A — Nền tảng (ngắn)
| # | slug | Chương | Sách | Hình chính |
|---|---|---|---|---|
| 1 | `deltas` | Viễn thám cho nông nghiệp & môi trường: hai châu thổ | Overview, 8.1, 9.1 | Bản đồ so sánh ĐBSH–ĐBSCL: độ cao, lớp phủ, mật độ lúa, dân số; thẻ "con số" |
| 2 | `data` | Dữ liệu mở, GEE, mây ở châu thổ, chi phí | 1.2–1.5, 8.3, 9.3 | Số ảnh S2 không mây theo tháng ở 5 điểm; bảng cảm biến; máy tính chi phí ảnh thương mại vs mở |

### Phần B — Đất & cây trồng (từ sách FAO)
| # | slug | Chương | Sách | Hình chính |
|---|---|---|---|---|
| 3 | `landcover` | Lớp phủ đất & đất nông nghiệp | 2.2–2.5 | So sánh WorldCover / Dynamic World / ESRI LULC trên hai châu thổ, chỗ bất đồng |
| 4 | `rice` | **Lúa & lịch mùa vụ** (MVP) | 2.5.3, 4.2–4.3, 5.2.3, Annex | xem mục 5 |
| 5 | `area-stats` | Khung mẫu & ước lượng diện tích | 3, 5.2–5.5 | Mô phỏng lấy mẫu điểm/ô trên bản đồ lúa: sai số chuẩn theo cỡ mẫu, phân tầng, ước lượng hồi quy |
| 6 | `yield` | Năng suất & cảnh báo sớm | 6 | Bất thường NDVI/EVI theo vụ, mô hình năng suất đơn giản, GEOGLAM/Asia-RiCE |

### Phần C — Môi trường & yếu tố tự nhiên (trọng tâm, phần lớn là "Mới")
| # | slug | Chương | Dữ liệu GEE | Hình chính |
|---|---|---|---|---|
| 7 | `climate` | Khí hậu nông nghiệp: mưa, nhiệt, LST, bốc thoát hơi, ENSO | CHIRPS, ERA5-Land, MOD11A2, MOD16A2 | Khí hậu tháng hai vùng, bất thường năm El Niño 2015–16, 2019–20, 2023–24 |
| 8 | `flood` | **Nước mặt & lũ** (MVP) | S1 GRD, JRC GSW, S2 | xem mục 5 |
| 9 | `drought` | Hạn hán & độ ẩm đất | SMAP L4, MOD13Q1, MOD11A2, CHIRPS | VCI/TCI/VHI, SPI-3, độ ẩm đất mùa khô 2016 vs 2020 |
| 10 | `salinity` | **Xâm nhập mặn** (MVP) | MOD13Q1, S2, Dynamic World | xem mục 5 |
| 11 | `soil-terrain` | Đất, phèn, địa hình, sụt lún, nước biển dâng | SoilGrids, FABDEM/Copernicus DEM | Bản đồ pH/SOC/sét; phèn Đồng Tháp Mười & Tứ giác Long Xuyên; diện tích dưới mỗi mức nước biển dâng; sụt lún (số liệu Minderhoud et al., trích dẫn) |
| 12 | `coast` | Ven biển: tôm–lúa, rừng ngập mặn, xói lở/bồi tụ | GMW, Hansen GFC, S2, Landsat | Đường bờ Cà Mau & Nam Định (Hải Thịnh xói, Giao Thủy bồi), chuyển đổi lúa→tôm |
| 13 | `emissions` | Đốt rơm, CH₄ ruộng lúa, NO₂, phát thải | FIRMS, S5P CH₄/NO₂/CO | Điểm cháy theo tháng sau thu hoạch; CH₄ mùa vụ; liên hệ tưới ướt-khô xen kẽ (AWD) |
| 14 | `risk` | Đa rủi ro & phân vùng thích ứng | tổng hợp ch.7–13 | Trọng số đa tiêu chí tương tác (người dùng chỉnh trọng số), Nghị quyết 120 |

### Phần D — Thực hành & tra cứu
| # | slug | Chương |
|---|---|---|
| 15 | `labs` | Lab Python (Colab) + script GEE cho từng chương |
| 16 | `reference` | Công thức, thuật ngữ, tài liệu tham khảo, ghi công FAO |

## 4. Khu vực

- **Toàn vùng**: ĐBSH ~105,3–107,0°E, 20,0–21,6°N; ĐBSCL ~104,4–106,9°E, 8,5–11,2°N.
- **5 điểm chi tiết 10 m** (khung ~10×10 km, chốt tọa độ khi xuất):
  1. **Nam Định–Thái Bình** (ven biển Giao Thủy–Hải Hậu): lúa 2 vụ ĐBSH, bồi/xói bờ biển, Yagi 2024.
  2. **An Giang** (Thoại Sơn/Tri Tôn): lúa 3 vụ, đê bao, lũ. Tái dùng `angiang-ndvi.json`, `angiang-s1.json` của rs-knowledge.
  3. **Đồng Tháp Mười** (Tháp Mười/Tân Phước): đất phèn, lũ, tràm.
  4. **Bến Tre–Sóc Trăng** (ven sông Hàm Luông/Hậu): xâm nhập mặn, lúa→tôm, cây ăn trái.
  5. **Cà Mau** (Năm Căn/Ngọc Hiển): rừng ngập mặn, tôm–rừng, xói lở bờ Đông.

## 5. Đợt 1 — chi tiết 3 chương MVP

Mỗi chương: 5–6 mục, hình mở đầu kiểu "hero", 2–3 `<Predict>` + 1 `<Note kind="key">` mỗi mục, quiz, glossary, lab, mọi con số từ script `*_numbers.ts`.

### Chương 4 — Lúa & lịch mùa vụ
| Mục | Nội dung | Hình / island | Dữ liệu |
|---|---|---|---|
| 4.1 | Lúa ở hai châu thổ: vụ Xuân/Mùa (ĐBSH) vs Đông Xuân/Hè Thu/Thu Đông (ĐBSCL) | **Hero** `DeltaMap`: số vụ/năm (1/2/3) cả hai vùng, swipe 2016 vs 2024 | MOD13Q1 EVI 250 m, đếm đỉnh |
| 4.2 | Lúa nhìn từ vệ tinh: ngập → đẻ nhánh → trổ → chín | `SeriesChart`: NDVI/EVI/LSWI + S1 VH cùng trục thời gian, An Giang vs Nam Định | S2 + S1 điểm chi tiết |
| 4.3 | Lịch mùa vụ từ chuỗi ảnh: SOS/POS/EOS | Bản đồ ngày gieo vụ Đông Xuân; thanh trượt ngưỡng SOS | MOD13Q1 |
| 4.4 | Bản đồ lúa bằng Sentinel-1 (Sách 2.5.3, 5.2.3) | `ThresholdLab`: luật "VH thấp lúc ngập + tăng nhanh"; so với WorldCover | S1 điểm An Giang & Nam Định |
| 4.5 | Từ bản đồ đến diện tích: thiên lệch đếm pixel (Sách Annex, 5.2.5) | Ma trận nhầm lẫn tương tác → diện tích đã hiệu chỉnh | điểm kiểm tra tự giải đoán (ghi rõ) |
| 4.6 | Lúa và môi trường: 3 vụ, đê bao, mất phù sa | `Tiles` + link ch.8, ch.13 | trích dẫn |

### Chương 8 — Nước mặt & lũ
| Mục | Nội dung | Hình / island | Dữ liệu |
|---|---|---|---|
| 8.1 | Chế độ nước: lũ Mê Kông (8–11) vs sông Hồng điều tiết bởi hồ chứa | **Hero** `DeltaMap`: tần suất ngập JRC GSW + tính mùa | JRC GSW 30 m → 250 m |
| 8.2 | Phát hiện nước: MNDWI vs radar VV | `ThresholdLab` Otsu, An Giang mùa lũ | S2 + S1 |
| 8.3 | Diễn biến lũ ĐBSCL theo tháng | `DeltaMap` thanh trượt tháng 7–12 + biểu đồ diện tích | S1 tổng hợp tháng 2016–2025 |
| 8.4 | Lũ suy giảm & đê bao cao | Diện tích ngập đỉnh lũ theo năm; Tứ giác Long Xuyên trước/sau | S1 + trích dẫn |
| 8.5 | Bão & ngập úng ĐBSH: Yagi 9/2024 | Trước/sau, lúa bị ngập | S1 cặp 31/8 & 12/9/2024 |
| 8.6 | Ước tính thiệt hại lúa | chồng lớp ngập × bản đồ lúa (ch.4) → ha theo tỉnh | tính toán |

### Chương 10 — Xâm nhập mặn
| Mục | Nội dung | Hình / island | Dữ liệu |
|---|---|---|---|
| 10.1 | Cơ chế: dòng chảy mùa khô, triều, nước biển dâng, khai thác cát, đập thượng nguồn | Sơ đồ tương tác (ghi "minh họa") | — |
| 10.2 | Các đợt 2015–16, 2019–20, 2023–24 | `Stats` + biểu đồ chiều dài xâm nhập 4 g/L theo cửa sông | **số liệu công bố**, trích dẫn từng số |
| 10.3 | Vệ tinh thấy gì và không thấy gì | **Hero** `DeltaMap`: bất thường EVI mùa khô 2016 & 2020 so với nền 2010–2024 | MOD13Q1 |
| 10.4 | Chỉ số mặn đất (SI, NDSI): giới hạn | So chỉ số trên điểm Bến Tre–Sóc Trăng, `Note kind="myth"` | S2 |
| 10.5 | Chuyển đổi sử dụng đất ven biển: lúa → tôm/lúa–tôm | swipe 2016/2024 | Dynamic World + S2 |
| 10.6 | Thích ứng: cống Cái Lớn–Cái Bé, lịch xuống giống né mặn, Nghị quyết 120 | `Steps` | trích dẫn |

## 6. Lộ trình đợt 1 (theo thứ tự)

1. ✅ (2026-11-15) Khởi tạo repo `rs-agri`: sao khung rs-knowledge, đổi tên/brand/logo, bỏ island Phần A, `npm test` + build sạch.
2. ✅ (2026-11-16) Định dạng lớp vùng + `DeltaMap`, `ThresholdLab` (+ `src/lib/*.test.ts`). `SeriesChart` không cần: `LineChart` sẵn có đã đủ (ngắt khoảng trống, dải phần vị, sự kiện).
3. ✅ (2026-11-16) Script GEE `export_rice.py`, `export_rice_site.py`, `export_flood.py`, `export_salinity.py` (ranh tỉnh + 5 khung điểm đã có từ bước 2). Khác kế hoạch: số vụ lúa ĐBSH lấy từ Sentinel-1 (MODIS chỉ 7–12 % quan sát tốt tháng 6–7); Dynamic World so 2018↔2024 (2016 thiếu ảnh ở Cà Mau); ô chuỗi thời gian An Giang là ruộng 2 vụ + để lũ (chọn tự động theo biên độ VH lớn nhất); 10.3 chỉ làm ĐBSCL.
4. ✅ (2026-11-16) Viết ch.4, 8, 10 (vi + en), quiz, glossary, số liệu từ `*_numbers.ts`. Khác kế hoạch: ma trận nhầm lẫn 4.5 là số minh họa (chưa có điểm kiểm tra thật) áp lên diện tích bản đồ thật; chiều dài mặn theo cửa sông chỉ xác minh đủ cho 2016; 10.5 ở Bến Tre là lúa → vườn cây, không phải lúa → tôm.
5. ✅ (2026-11-17) Trang chủ + mục lục 16 chương (chương chưa có hiện "sắp có" kèm một dòng mô tả nội dung dự kiến; thống kê "3/16 chương đã viết"; link Bài thực hành/Công thức ẩn tới khi có chương; sửa tiêu đề h1 bị lặp chữ từ bước 1).
6. ✅ (2026-11-17) Lab cho 3 chương (`labs/rice_seasons`, `flood_water`, `salinity_indicators`: notebook Colab + script GEE) và chương 15 `labs`. Khác kế hoạch: phần Yagi của lab lũ dùng khung Nho Quan – Gia Viễn (Ninh Bình) vì khung Nam Định gần như không có nước mới trên ruộng; script JS chưa chạy thử trong Code Editor.
7. ✅ (2026-11-17) Kiểm tra Playwright trên bản build (7 trang × vi/en × sáng/tối × 1600/390 px: 0 lỗi, 0 tràn, mọi island hydrate, link nội bộ đủ), `code-reviewer` (không CRITICAL/HIGH; đã sửa biểu đồ VH trong script GEE lúa, làm tròn ngưỡng Otsu script lũ, lời giới thiệu chương 15).
8. ✅ (2026-11-17) Anh/chị duyệt đợt 1 → làm tiếp đợt 2.

## 6b. Lộ trình đợt 2 (13 chương còn lại)

Mỗi bước giống đợt 1: xuất dữ liệu GEE → viết vi + en → quiz, glossary, `*_numbers.ts` → Playwright + `code-reviewer`. Lab cho các chương mới gom vào bước 15.

9. ✅ (2026-11-17) Phần A: ch.1 `deltas` (lớp phủ WorldCover, mật độ dân GHSL, số vụ lúa; thẻ số liệu tính từ dữ liệu) + ch.2 `data` (tỉ lệ ảnh S2 quang đãng theo tháng ở 5 điểm, số cảnh S1 theo năm, tỉ lệ pixel thuần theo độ phân giải; bảng cảm biến, chi phí ảnh theo sách 1.2.1). Sửa HUD bản tiếng Anh hiện tên tỉnh tiếng Việt.
10. ✅ (2026-11-17) Ch.7 `climate` + ch.9 `drought` (CHIRPS, ERA5-Land, MOD11A2, MOD13Q1, SMAP; chung dữ liệu nền). Khác kế hoạch: bốc thoát hơi lấy từ ERA5-Land (MOD16A2 v061 trên EE chỉ từ 2021); VHI theo cách ASIS của FAO (ngưỡng 35); thêm cảnh báo El Niño 2026 (ONI +2,46).
11. ✅ (2026-11-17) Ch.11 `soil-terrain` + ch.12 `coast`. Khác kế hoạch: DEM dùng DeltaDTM (CC BY 4.0) thay FABDEM (CC BY-NC-SA); SoilGrids không thấy đất phèn nên chương nói rõ giới hạn; đường bờ, ao tôm tự tính từ Landsat (MNDWI nhiều năm) thay vì Hansen GFC; kịch bản nước biển dâng của Bộ chưa dùng (chưa có văn bản gốc).
12. ✅ (2026-11-18) Ch.13 `emissions`: điểm cháy FIRMS MODIS 2001–2025 theo loại đất và theo tháng, NO₂/CO và XCH₄ Sentinel-5P, máy tính CH₄ IPCC Tier 1, AWD và Đề án 1 triệu ha (QĐ 1490). Khác kế hoạch: không dùng VIIRS VNP14A1 (bản 1 km trên EE bắt ít điểm cháy hơn MODIS Terra + Aqua); thêm CO; bản đồ XCH₄ trên khung 1 800 km (`vietnam`) vì CH₄ đo từ vũ trụ quá thưa ở ĐBSCL (không có số đo tháng 9 nào trong 7 năm); ĐBSH gần như không thấy đốt rơm (10 % số ngày cháy trên đất trồng trọt, tháng 1–3 bị mây che), nên lịch đốt rơm chỉ đọc được ở ĐBSCL.
13. ✅ (2026-11-18) Phần B: ch.3 `landcover` (WorldCover / Dynamic World / Esri 2021 đưa về 7 lớp chung, bản đồ đồng thuận đất trồng trọt, hai điểm 10 m, chuỗi Esri 2017–2025), ch.5 `area-stats` (mô phỏng lấy mẫu trên bản đồ lúa 2024: ngẫu nhiên đơn, phân tầng tỉ lệ / Neyman, hồi quy; cỡ mẫu theo CV), ch.6 `yield` (năng suất Đông Xuân 24 tỉnh 2001–2024 của Cục Thống kê với EVI MODIS: xu thế, mô hình bỏ-một-năm, EVI cuối vụ cho năm mặn). Khác kế hoạch: biến phụ của ch.5 là Esri, không phải WorldCover (WorldCover đã làm mặt nạ cho bản đồ lúa nên làm phân tầng tốt giả); ch.6 không có dự báo năng suất 'tốt' để khoe: mô hình EVI chỉ thắng cách đoán trung bình ở 6/13 tỉnh ĐBSCL và 8/11 tỉnh ĐBSH, chương nói thẳng điều đó; chưa có điểm kiểm tra thực địa nào (ch.5 dùng bản đồ làm 'sự thật', ghi rõ mô phỏng).
14. ✅ (2026-11-18) Ch.14 `risk`: chồng lớp có trọng số tự chỉnh trên đất trồng trọt (ngập lũ, thiếu mưa mùa khô, cây trồng suy giảm mùa khô, đất thấp; điểm 0–100 theo thang cố định), bản đồ hiểm họa trội, bảng theo tỉnh, phân tích độ nhạy, Nghị quyết 120 (trích nguyên văn). Ch.16 `reference`: công thức gom tự động từ các chương, bảng dữ liệu và ghi công, đối chiếu với sách FAO, danh mục tài liệu gộp. Khác kế hoạch: không tính được 'rủi ro' đầy đủ (chỉ hiểm họa trên đất trồng trọt; tính dễ bị tổn thương không có trong dữ liệu vệ tinh), chương nói rõ; không có lớp độ mặn nên các tỉnh ven biển bị xếp thấp một cách có hệ thống, chương dùng chính điều đó làm bài học; ĐBSH chỉ có hai chỉ số (lũ Yagi, đất thấp) vì ba mùa khô 2016/2020/2024 ở miền Bắc ẩm hơn bình thường; sụt lún, xói lở chưa đưa vào. Sửa kèm: phần chú giải `where` dạng văn xuôi của 7 công thức (ch.5, 6, 13) trước đây bị `Formula.astro` bỏ mất.
15. ✅ (2026-11-18) 9 lab mới (notebook Colab + script GEE): `data_clearsky` (ch.2), `landcover_compare` (ch.3, dùng chung cho ch.1), `area_sampling` (ch.5), `yield_evi` (ch.6), `drought_spi_vhi` (ch.9, dùng chung cho ch.7), `soil_dem` (ch.11), `coast_shoreline` (ch.12), `emissions_fire` (ch.13), `risk_overlay` (ch.14); mọi chương có dữ liệu đã gắn link lab; ch.15 cập nhật (12 lab). Khác kế hoạch: ch.1 và ch.7 không có lab riêng; lab 5 và phần đầu lab 14 đọc dữ liệu đã xuất của sổ tay (qua GitHub raw, chỉ chạy được trên Colab sau khi repo được công khai) thay vì Earth Engine; lab 12 dùng khung 30 × 27 km quanh Mũi Cà Mau (khung 72 km quá chậm cho Colab). Phát hiện: bản geoBoundaries v6 trên EE lưu chữ có dấu tiếng Việt thành '?', nên các lab chọn tỉnh bằng điểm hoặc tên đã hỏng; sửa bài tập 'Đồng Tháp' của lab lũ. Script JS chưa chạy thử trong Code Editor.
16. Kiểm tra cuối đợt 2 ✅ (2026-11-18): quét bản build 19 trang × vi/en × sáng/tối × 1600/390 (0 lỗi console, 0 tràn, 0 ảnh hỏng, 1 056 island hydrate, 38 link nội bộ mỗi ngôn ngữ đều 200, tìm kiếm chạy); rà repo (không file sách, không email/project id trong phần xuất bản, GADM chỉ nhắc là không dùng); giấy phép dữ liệu đã xác minh và ghi đủ. Còn lại: tạo repo GitHub + deploy khi anh/chị yêu cầu.

## 7. Rủi ro / việc cần xác minh

- **Độ mặn**: không có sản phẩm vệ tinh đo trực tiếp; số liệu trạm (SIWRR, Tổng cục Thủy lợi) không mở. Ch.10 dựa vào chỉ số gián tiếp + số liệu công bố. Nếu anh/chị có dữ liệu trạm thì bổ sung.
- **Sụt lún**: InSAR toàn vùng quá nặng để tự xử lý; dùng kết quả công bố (trích dẫn), không phân phối lại bản đồ gốc nếu không có quyền.
- **Sentinel-1**: chỉ còn S1A trong 2022–2024 (lặp 12 ngày), S1C từ 2025; chuỗi lũ có mật độ không đều, phải ghi rõ.
- **Mây**: ĐBSH tháng 1–4 rất ít ảnh quang học sạch → lúa vụ Xuân dựa vào S1.
- **Ranh tỉnh**: sáp nhập tỉnh 2025 — dùng ranh cũ cho số liệu lịch sử, ghi chú.
- **Bản quyền FAO 2017**: PDF không có trang bản quyền. Tác giả quyết định (18/11/2026) không cần xét thêm: sổ tay phi thương mại, viết cho giảng dạy (CC BY-NC 4.0), viết lại chứ không dịch nguyên văn, ghi công FAO.
- **Điểm cháy**: MODIS bỏ sót phần lớn đám cháy nhỏ, cháy ngắn, cháy dưới mây (86,2 % so với ASTER); số điểm cháy chỉ là chỉ số tương đối. FIRMS trên EE (bản gần thời gian thực) không gắn nhãn nguồn nhiệt tĩnh: ô > 10 ngày cháy/năm phải tự loại.
- **CH₄ từ vũ trụ**: TROPOMI có rất ít lần đo ở ĐBSCL (trung vị 17 lần mỗi ô 1,1 km trong 2019–2025, không có tháng 9); không dùng để kiểm chứng mức giảm của đề án. Bản đồ XCH₄ dựa trên asset EE `projects/claudev1-503808/assets/rs_agri_xch4_2019_2025` (xóa asset thì phải chạy lại `export_emissions.py ch4map`).
- **Kiểm kê khí nhà kính**: chương 13 dùng BUR3 (kiểm kê 2016, nộp 16/4/2021); chưa xác minh được Việt Nam đã nộp BUR4 hay BTR1 chưa (18/11/2026: chỉ thấy dự án GEF-10963 chuẩn bị BTR1, kết thúc 10/4/2026, chưa thấy bản nộp). Kiểm tra trên trang UNFCCC trước khi xuất bản.
- **Lớp phủ 10 m**: số liệu ch.3 dựa trên asset EE `projects/claudev1-503808/assets/rs_agri_lc3_2021_{red,mekong}` (ba sản phẩm đã hài hòa lớp; mode Dynamic World cả năm tính trực tiếp thì quá thời gian). Khung asset = khung bản đồ vùng, nên ĐBSH bỏ phần lớn Quảng Ninh (so sánh trên 1 659 nghìn ha). Esri định nghĩa ruộng lúa là 'thực vật ngập nước' nhưng thực tế xếp vào cây trồng; xây dựng của Esri/Dynamic World gấp 4 lần WorldCover ở ĐBSCL.
- **Năng suất**: Cục Thống kê (PX-Web) tính trên diện tích gieo trồng; Cà Mau thiếu 2007–2016, 2018; Hà Nội trước 2008 gộp Hà Tây; số 2025 là sơ bộ. Kết quả Son và cs. (2014) chỉ kiểm được ở mức tóm tắt (R² 0,62–0,71), chưa đọc toàn văn.
- **Ghi công dữ liệu**: footer có dòng Copernicus Sentinel và ghi công FAO; danh sách nguồn đầy đủ ở chương 16 `reference` (mục 16.2), README và nguồn từng hình. Đã kiểm (2026-11-18) và ghi vào bảng 16.2: CHIRPS v2.0 phạm vi công cộng; GHS-POP CC BY 4.0; JRC GSW miễn phí, ghi 'Source: EC JRC/Google'; Copernicus DEM giấy phép miễn phí, bắt buộc ghi 'produced using Copernicus WorldDEM-30 © DLR e.V. … all rights reserved' + câu miễn trừ trách nhiệm (đã thêm vào mọi hình dùng Copernicus DEM / DeltaDTM ở ch.11, 14).
- **Chương 14**: chỉ số hiểm họa, không phải rủi ro; thiếu độ mặn (không có sản phẩm vệ tinh), sụt lún, xói lở, tính dễ bị tổn thương. Thang điểm (1–3 m DeltaDTM, SPI −2, EVI −0,05) là lựa chọn của tác giả, ghi trong chương. Nghị quyết 120: chỉ đọc được khoảng 80 % văn bản gốc (hethongphapluat.com); các đoạn trích nằm trong phần đã đọc.
