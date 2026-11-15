export const LANGS = ['vi', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export type Bi = Record<Lang, string>;

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** Language of the page being rendered, from its URL (/rs-agri/<lang>/...). */
export const langFromUrl = (u: URL): Lang => (u.pathname.includes('/en/') ? 'en' : 'vi');

/** Prefix an internal path with the deploy base (/rs-agri/). */
export const url = (path: string): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

export const UI = {
  siteTitle: { vi: 'Viễn thám Nông nghiệp & Môi trường', en: 'Remote Sensing for Agriculture & Environment' },
  tagline: {
    vi: 'Lúa, nước, đất, khí hậu và rủi ro thiên tai ở Đồng bằng sông Hồng và sông Cửu Long — mỗi khái niệm kèm bản đồ tương tác trên dữ liệu vệ tinh thật.',
    en: 'Rice, water, soils, climate and hazards in the Red River and Mekong deltas — every concept comes with an interactive map on real satellite data.',
  },
  chapters: { vi: 'Mục lục', en: 'Contents' },
  onThisPage: { vi: 'Trong trang này', en: 'On this page' },
  chapter: { vi: 'Chương', en: 'Chapter' },
  planned: { vi: 'Sắp có', en: 'Planned' },
  depth: { vi: 'Độ sâu', en: 'Depth' },
  depthBasic: { vi: 'Cơ bản', en: 'Basic' },
  depthAdvanced: { vi: 'Nâng cao', en: 'Advanced' },
  depthRef: { vi: 'Tra cứu', en: 'Reference' },
  present: { vi: 'Trình chiếu', en: 'Present' },
  presentHint: {
    vi: '← → chuyển mục · Esc thoát',
    en: '← → next/prev section · Esc to exit',
  },
  theme: { vi: 'Đổi giao diện sáng/tối', en: 'Toggle light/dark' },
  search: { vi: 'Tìm kiếm', en: 'Search' },
  glossary: { vi: 'Thuật ngữ', en: 'Glossary' },
  otherLang: { vi: 'English', en: 'Tiếng Việt' },
  footer: {
    vi: 'Dữ liệu ảnh: chứa dữ liệu Copernicus Sentinel đã xử lý; MODIS: NASA LP DAAC. Phát triển từ FAO (2017), Handbook on Remote Sensing for Agricultural Statistics.',
    en: 'Imagery: contains modified Copernicus Sentinel data; MODIS courtesy of NASA LP DAAC. Developed from FAO (2017), Handbook on Remote Sensing for Agricultural Statistics.',
  },
  homepage: { vi: 'Trang chủ của tác giả', en: "Author's homepage" },
  glossaryMore: { vi: 'Xem trong bảng thuật ngữ', en: 'See glossary' },
} satisfies Record<string, Bi>;

export const t = (lang: Lang, key: keyof typeof UI): string => UI[key][lang];
