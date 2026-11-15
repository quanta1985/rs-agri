# Viễn thám Nông nghiệp & Môi trường / Remote Sensing for Agriculture & Environment

Sổ tay tương tác song ngữ (Việt–Anh) về viễn thám cho nông nghiệp, tập trung vào môi trường và các yếu tố tự nhiên: khí hậu, lũ, hạn, xâm nhập mặn, đất, sụt lún, ven biển, phát thải. Ví dụ trên dữ liệu vệ tinh thật của Đồng bằng sông Hồng và Đồng bằng sông Cửu Long.

A bilingual (Vietnamese–English) interactive handbook on remote sensing for agriculture, focused on the environment and natural factors: climate, floods, drought, salinity intrusion, soils, subsidence, the coast and emissions. Examples use real satellite data of the Red River and Mekong deltas.

**Website:** https://quanta1985.github.io/rs-agri/ (sắp có / coming soon)

## Chạy cục bộ / Run locally

```bash
npm install
npm run dev        # http://localhost:4321/rs-agri/
npm test           # unit tests (node:test)
npm run build      # static site + Pagefind search index in dist/
```

Dữ liệu được tạo lại bằng / Data is regenerated with `scripts/data/*.py` (cần tài khoản Google Earth Engine / needs a GEE account).

## Giấy phép & ghi công / License & attribution

- © 2026 Trần Anh Quân · quantrananh.humg@gmail.com. Nội dung / content: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
- Phát triển từ / Developed from: FAO (2017). *Handbook on Remote Sensing for Agricultural Statistics*. Global Strategy to improve Agricultural and Rural Statistics, Rome.
- Ảnh vệ tinh / imagery: *Contains modified Copernicus Sentinel data (2023–2024).* MODIS courtesy of NASA LP DAAC.
- Ứng dụng anh em / sister app: [GIS and Remote Sensing Knowledge](https://quanta1985.github.io/rs-knowledge/).
