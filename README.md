# Viễn thám Nông nghiệp & Môi trường / Remote Sensing for Agriculture & Environment

Sổ tay tương tác song ngữ (Việt–Anh) về viễn thám cho nông nghiệp, tập trung vào môi trường và các yếu tố tự nhiên: khí hậu, lũ, hạn, xâm nhập mặn, đất, sụt lún, ven biển, phát thải. Ví dụ trên dữ liệu vệ tinh thật của Đồng bằng sông Hồng và Đồng bằng sông Cửu Long.

A bilingual (Vietnamese–English) interactive handbook on remote sensing for agriculture, focused on the environment and natural factors: climate, floods, drought, salinity intrusion, soils, subsidence, the coast and emissions. Examples use real satellite data of the Red River and Mekong deltas.

**Website:** https://quanta1985.github.io/rs-agri/ (sắp có / coming soon)

## Trạng thái / Status (2026-11-18)

16/16 chương đã viết (vi + en) / chapters written:

- Phần A / Part A: 1 Hai châu thổ / Two deltas, 2 Dữ liệu / Data
- Phần B / Part B: 3 Lớp phủ / Land cover, 4 Lúa & lịch mùa vụ / Rice & crop calendar, 5 Khung mẫu & diện tích / Sampling & area, 6 Năng suất & cảnh báo sớm / Yield & early warning
- Phần C / Part C: 7 Khí hậu / Climate, 8 Lũ / Floods, 9 Hạn / Drought, 10 Xâm nhập mặn / Salinity, 11 Đất & địa hình / Soils & terrain, 12 Ven biển / The coast, 13 Phát thải / Emissions, 14 Đa rủi ro / Multi-hazard risk
- Phần D / Part D: 15 Bài thực hành / Labs (Colab + GEE cho chương 4, 8, 10), 16 Công thức & tài liệu tham khảo / Formulas & references

Còn lại / still planned: bài thực hành cho các chương đợt 2 / labs for the batch-2 chapters. Lộ trình / roadmap: [PLAN.md](PLAN.md).

## Chạy cục bộ / Run locally

```bash
npm install
npm run dev        # http://localhost:4321/rs-agri/
npm test           # unit tests (node:test)
npm run build      # static site + Pagefind search index in dist/
```

Dữ liệu được tạo lại bằng / Data is regenerated with `scripts/data/*.py` (cần tài khoản Google Earth Engine / needs a GEE account; chạy từ thư mục gốc, không dùng `python -I` / run from the repo root without `-I`). Mọi con số trong bài được in lại bằng / every number quoted in a chapter is printed by `node scripts/<slug>_numbers.ts`.

## Giấy phép & ghi công / License & attribution

- © 2026 Trần Anh Quân · quantrananh.humg@gmail.com. Nội dung / content: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
- Phát triển từ / Developed from: FAO (2017). *Handbook on Remote Sensing for Agricultural Statistics*. Global Strategy to improve Agricultural and Rural Statistics, Rome.
- Ảnh vệ tinh / imagery: *Contains modified Copernicus Sentinel data (2015–2025)* (Sentinel-1, -2, -5P). Landsat courtesy of the U.S. Geological Survey. MODIS courtesy of NASA LP DAAC; active fires from NASA FIRMS. SMAP from NASA.
- Khí hậu / climate: CHIRPS v2.0 (UCSB Climate Hazards Center); ERA5-Land, *contains modified Copernicus Climate Change Service information*; NOAA CPC ONI.
- Lớp phủ, đất, địa hình / land cover, soils, terrain: ESA WorldCover (CC BY 4.0), Dynamic World (CC BY 4.0), Esri / Impact Observatory 10 m Annual LULC (CC BY 4.0), GHSL (European Commission JRC), JRC Global Surface Water, SoilGrids 2.0 (ISRIC, CC BY 4.0), DeltaDTM (Deltares, CC BY 4.0), Copernicus DEM GLO-30, Global Mangrove Watch v3 (CC BY 4.0).
- Thống kê / statistics: năng suất và diện tích lúa theo tỉnh của Cục Thống kê (PX-Web, bảng V06.16–V06.18) / provincial rice yield and area from the National Statistics Office.
- Ranh giới / boundaries: geoBoundaries gbOpen ADM1 (không dùng GADM / GADM not used).
- Ứng dụng anh em / sister app: [GIS and Remote Sensing Knowledge](https://quanta1985.github.io/rs-knowledge/).
