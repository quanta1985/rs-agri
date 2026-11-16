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
4. Viết ch.4, 8, 10 (vi + en), quiz, glossary, số liệu từ `*_numbers.ts`.
5. Trang chủ + mục lục 16 chương (chương chưa có hiện "sắp có").
6. Lab cho 3 chương.
7. Kiểm tra Playwright (vi/en, sáng/tối, 1600/390 px), `code-reviewer`.
8. Anh/chị duyệt → đợt 2.

## 7. Rủi ro / việc cần xác minh

- **Độ mặn**: không có sản phẩm vệ tinh đo trực tiếp; số liệu trạm (SIWRR, Tổng cục Thủy lợi) không mở. Ch.10 dựa vào chỉ số gián tiếp + số liệu công bố. Nếu anh/chị có dữ liệu trạm thì bổ sung.
- **Sụt lún**: InSAR toàn vùng quá nặng để tự xử lý; dùng kết quả công bố (trích dẫn), không phân phối lại bản đồ gốc nếu không có quyền.
- **Sentinel-1**: chỉ còn S1A trong 2022–2024 (lặp 12 ngày), S1C từ 2025; chuỗi lũ có mật độ không đều, phải ghi rõ.
- **Mây**: ĐBSH tháng 1–4 rất ít ảnh quang học sạch → lúa vụ Xuân dựa vào S1.
- **Ranh tỉnh**: sáp nhập tỉnh 2025 — dùng ranh cũ cho số liệu lịch sử, ghi chú.
- **Bản quyền FAO 2017**: xác minh trang bản quyền trong PDF.
