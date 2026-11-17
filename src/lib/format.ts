// Number/date formatting shared by the map figures (pure, tested in format.test.ts).
import type { Lang } from '../i18n/ui.ts';

const LOCALE: Record<Lang, string> = { vi: 'vi-VN', en: 'en-GB' };

/** Number with the layer's precision in the reader's locale. */
export const fmtNum = (lang: Lang, v: number, digits: number): string =>
  v.toLocaleString(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Decimal places that resolve one raw step (scale 0.005 -> 3, 0.5 -> 1, 1 -> 0). */
export const digitsFor = (scale: number): number => Math.max(0, Math.ceil(-Math.log10(scale) - 1e-9));

/** "2024-03" -> "03/2024", "2024-10-14" -> "14/10/2024" (vi) / "14 Oct 2024" (en); other labels unchanged. */
export const fmtTime = (lang: Lang, s: string): string => {
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return s;
  const [, y, mo, d] = m;
  if (lang === 'vi') return d ? `${d}/${mo}/${y}` : `${mo}/${y}`;
  const name = new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return d ? `${+d} ${name} ${y}` : `${name} ${y}`;
};

/** Vietnamese place name for the page language: English pages drop the diacritics ("Đồng Tháp" -> "Dong Thap"). */
export const placeName = (lang: Lang, s: string): string =>
  lang === 'vi' ? s : s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D').replace(/đ/g, 'd');
