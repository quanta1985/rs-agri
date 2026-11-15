import type { Bi } from '../i18n/ui';

export type Part = 'A' | 'B' | 'C' | 'D';
/** `short` is the ribbon label. `n` is the display number (array position); slugs are stable ids. */
export type ChapterInfo = { n: number; slug: string; part: Part; title: Bi; short: Bi };
/** `tab` is the ribbon tab label, `title` the part heading, `desc` the home-page blurb. */
export type PartInfo = { p: Part; tab: Bi; title: Bi; desc: Bi };

export const PARTS: PartInfo[] = [
  { p: 'A', tab: { vi: 'Nền tảng', en: 'Foundations' }, title: { vi: 'Phần A · Nền tảng', en: 'Part A · Foundations' },
    desc: { vi: 'Hai châu thổ nhìn từ vệ tinh, dữ liệu mở, Google Earth Engine, mây và chi phí.', en: 'The two deltas seen from space, open data, Google Earth Engine, clouds and costs.' } },
  { p: 'B', tab: { vi: 'Đất & cây trồng', en: 'Land & crops' }, title: { vi: 'Phần B · Đất đai & cây trồng', en: 'Part B · Land & crops' },
    desc: { vi: 'Lớp phủ đất, bản đồ lúa và lịch mùa vụ, khung mẫu, ước lượng diện tích, năng suất và cảnh báo sớm.', en: 'Land cover, rice mapping and crop calendars, sampling frames, area estimation, yield and early warning.' } },
  { p: 'C', tab: { vi: 'Môi trường', en: 'Environment' }, title: { vi: 'Phần C · Môi trường & yếu tố tự nhiên', en: 'Part C · Environment & natural factors' },
    desc: { vi: 'Khí hậu, lũ, hạn, mặn, đất và sụt lún, vùng ven biển, phát thải và rủi ro tổng hợp cho nông nghiệp hai châu thổ.', en: 'Climate, floods, drought, salinity, soils and subsidence, the coast, emissions and combined risk for farming in the two deltas.' } },
  { p: 'D', tab: { vi: 'Thực hành', en: 'Practice' }, title: { vi: 'Phần D · Thực hành & tra cứu', en: 'Part D · Practice & reference' },
    desc: { vi: 'Bài thực hành Python / GEE, bảng công thức và tài liệu tham khảo.', en: 'Python / GEE labs, formula sheet and references.' } },
];

const raw: Omit<ChapterInfo, 'n'>[] = [
  { slug: 'deltas', part: 'A', short: { vi: 'Hai châu thổ', en: 'Two deltas' }, title: { vi: 'Viễn thám cho nông nghiệp & môi trường: hai châu thổ', en: 'Remote sensing for agriculture & environment: two deltas' } },
  { slug: 'data', part: 'A', short: { vi: 'Dữ liệu', en: 'Data' }, title: { vi: 'Dữ liệu mở, Google Earth Engine, mây & chi phí', en: 'Open data, Google Earth Engine, clouds & costs' } },
  { slug: 'landcover', part: 'B', short: { vi: 'Lớp phủ', en: 'Land cover' }, title: { vi: 'Lớp phủ đất & đất nông nghiệp', en: 'Land cover & agricultural land' } },
  { slug: 'rice', part: 'B', short: { vi: 'Lúa & mùa vụ', en: 'Rice' }, title: { vi: 'Lúa & lịch mùa vụ', en: 'Rice & crop calendars' } },
  { slug: 'area-stats', part: 'B', short: { vi: 'Diện tích', en: 'Area' }, title: { vi: 'Khung mẫu & ước lượng diện tích', en: 'Sampling frames & area estimation' } },
  { slug: 'yield', part: 'B', short: { vi: 'Năng suất', en: 'Yield' }, title: { vi: 'Năng suất & cảnh báo sớm', en: 'Yield & early warning' } },
  { slug: 'climate', part: 'C', short: { vi: 'Khí hậu', en: 'Climate' }, title: { vi: 'Khí hậu nông nghiệp: mưa, nhiệt, bốc thoát hơi', en: 'Agro-climate: rain, heat, evapotranspiration' } },
  { slug: 'flood', part: 'C', short: { vi: 'Lũ', en: 'Floods' }, title: { vi: 'Nước mặt & lũ', en: 'Surface water & floods' } },
  { slug: 'drought', part: 'C', short: { vi: 'Hạn hán', en: 'Drought' }, title: { vi: 'Hạn hán & độ ẩm đất', en: 'Drought & soil moisture' } },
  { slug: 'salinity', part: 'C', short: { vi: 'Mặn', en: 'Salinity' }, title: { vi: 'Xâm nhập mặn', en: 'Salinity intrusion' } },
  { slug: 'soil-terrain', part: 'C', short: { vi: 'Đất & sụt lún', en: 'Soil & subsidence' }, title: { vi: 'Đất, phèn, địa hình, sụt lún & nước biển dâng', en: 'Soils, acid sulfate, terrain, subsidence & sea-level rise' } },
  { slug: 'coast', part: 'C', short: { vi: 'Ven biển', en: 'Coast' }, title: { vi: 'Ven biển: tôm–lúa, rừng ngập mặn, xói lở', en: 'The coast: shrimp–rice, mangroves, erosion' } },
  { slug: 'emissions', part: 'C', short: { vi: 'Phát thải', en: 'Emissions' }, title: { vi: 'Đốt rơm, CH₄ ruộng lúa & phát thải', en: 'Straw burning, paddy CH₄ & emissions' } },
  { slug: 'risk', part: 'C', short: { vi: 'Rủi ro', en: 'Risk' }, title: { vi: 'Đa rủi ro & phân vùng thích ứng', en: 'Multi-hazard risk & adaptation zoning' } },
  { slug: 'labs', part: 'D', short: { vi: 'Thực hành', en: 'Labs' }, title: { vi: 'Bài thực hành Python / GEE', en: 'Python / GEE labs' } },
  { slug: 'reference', part: 'D', short: { vi: 'Tra cứu', en: 'Reference' }, title: { vi: 'Công thức & tài liệu tham khảo', en: 'Formulas & references' } },
];

/** Roadmap in reading order. A chapter is "ready" when src/content/chapters/<lang>/<slug>.mdx exists. */
export const CHAPTERS: ChapterInfo[] = raw.map((c, i) => ({ ...c, n: i + 1 }));
