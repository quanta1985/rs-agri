import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum, placeName } from '../lib/format';
import data from '../../public/data/flood-s1-area-mekong.json';
import LineChart, { Legend, type Series } from './LineChart';

/** Ch.8: radar open-water area in the Mekong delta (flood-s1-area-mekong.json).
 *  view "months": Jul-Dec curve of every year, two years highlighted; view "years": peak-month area per year. */
type Props = { lang: Lang; view?: 'months' | 'years'; a?: number; b?: number };

const TXT = {
  vi: { area: 'Vùng', all: 'Toàn ĐBSCL', yearA: 'Năm A', yearB: 'Năm B', month: 'Tháng', year: 'Năm', y: 'nghìn ha', others: 'Các năm khác',
    tMonths: 'Diện tích nước mặt theo tháng (radar, tháng 7–12)', tYears: 'Diện tích nước mặt tháng cao nhất mỗi năm (radar)', peak: 'Tháng đỉnh',
    mean: 'trung bình 2016–2025', hover: 'Di chuột trên biểu đồ để đọc số liệu.', table: 'Bảng số liệu (ha)', th: 'Tháng' },
  en: { area: 'Area', all: 'Whole Mekong delta', yearA: 'Year A', yearB: 'Year B', month: 'Month', year: 'Year', y: 'thousand ha', others: 'Other years',
    tMonths: 'Monthly surface-water area (radar, Jul–Dec)', tYears: 'Surface-water area in the peak month of each year (radar)', peak: 'Peak month',
    mean: '2016–2025 mean', hover: 'Hover the chart to read values.', table: 'Data table (ha)', th: 'Month' },
};
const C_A = '#0072B2', C_B = '#E69F00', C_REST = '#999999'; // Okabe-Ito blue / orange, neutral grey (data colours)
const YEARS = data.years, MONTHS = data.months;
const PROV = Object.keys(data.provinces).sort((x, y) => x.localeCompare(y, 'vi'));
const rows = (area: string): number[][] => (area === 'all' ? data.region_ha : (data.provinces as Record<string, number[][]>)[area]);

export default function FloodArea({ lang, view = 'months', a = 2018, b = 2024 }: Props) {
  const T = TXT[lang];
  const [area, setArea] = useState('all');
  const [ya, setYa] = useState(a);
  const [yb, setYb] = useState(b);
  const [hx, setHx] = useState<number | null>(null);
  const R = rows(area);
  const k = (ha: number) => ha / 1000;
  const n0 = (v: number) => fmtNum(lang, v, 0);
  const max = Math.max(...R.flat()) / 1000;
  const yTop = Math.ceil((max * 1.08) / 50) * 50 || 50;
  const picker = (
    <label className="ctl"><span className="ctl-label">{T.area}</span>
      <select value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="all">{T.all}</option>
        {PROV.map((p) => <option key={p} value={p}>{placeName(lang, p)}</option>)}
      </select>
    </label>
  );
  const yearSel = (label: string, v: number, set: (y: number) => void) => (
    <label className="ctl"><span className="ctl-label">{label}</span>
      <select value={v} onChange={(e) => set(Number(e.target.value))}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
    </label>
  );

  if (view === 'years') {
    const peaks = R.map((r) => Math.max(...r));
    const mean = peaks.reduce((s, v) => s + v, 0) / peaks.length;
    const yi = hx == null ? -1 : YEARS.indexOf(Math.round(hx));
    const s: Series[] = [{ id: 'peak', label: area === 'all' ? T.all : placeName(lang, area), color: C_A, marker: 'circle', points: YEARS.map((y, i) => [y, k(peaks[i])]) }];
    return (
      <div className="viz">
        <div className="controls">{picker}</div>
        <p className="chart-title">{T.tYears} · {area === 'all' ? T.all : placeName(lang, area)}</p>
        <LineChart title={T.tYears} series={s} x={[2015.5, 2025.5]} y={[0, yTop]} xLabel={T.year} yLabel={T.y} xTicks={YEARS}
          yFormat={n0} hline={k(mean)} vline={yi >= 0 ? YEARS[yi] : null} onHover={setHx} height={300} />
        <Legend items={[...s, { id: 'mean', label: `${T.mean} (${n0(k(mean))} ${T.y})`, color: 'currentColor', dash: '4 3', width: 1 }]} />
        <p className="readout num">{yi >= 0 ? `${YEARS[yi]}: ${n0(k(peaks[yi]))} ${T.y} · ${T.peak} ${MONTHS[R[yi].indexOf(peaks[yi])]}` : T.hover}</p>
        <Table lang={lang} R={R} />
      </div>
    );
  }

  const ia = YEARS.indexOf(ya), ib = YEARS.indexOf(yb);
  const line = (i: number): [number, number][] => MONTHS.map((m, j) => [m, k(R[i][j])]);
  const series: Series[] = [
    ...YEARS.map((y, i) => ({ id: String(y), label: T.others, color: C_REST, width: 1, points: line(i) })).filter((_, i) => i !== ia && i !== ib),
    { id: 'a', label: String(ya), color: C_A, marker: 'circle', width: 2.5, points: line(ia) },
    { id: 'b', label: String(yb), color: C_B, marker: 'square', dash: '6 3', width: 2.5, points: line(ib) },
  ];
  const mi = hx == null ? -1 : MONTHS.indexOf(Math.round(hx));
  return (
    <div className="viz">
      <div className="controls">{picker}{yearSel(T.yearA, ya, setYa)}{yearSel(T.yearB, yb, setYb)}</div>
      <p className="chart-title">{T.tMonths} · {area === 'all' ? T.all : placeName(lang, area)}</p>
      <LineChart title={T.tMonths} series={series} x={[6.7, 12.3]} y={[0, yTop]} xLabel={T.month} yLabel={T.y} xTicks={MONTHS}
        yFormat={n0} vline={mi >= 0 ? MONTHS[mi] : null} onHover={setHx} height={300} />
      <Legend items={[series[series.length - 2], series[series.length - 1], { id: 'rest', label: T.others, color: C_REST, width: 1 }]} />
      <p className="readout num">{mi >= 0 ? `${T.month} ${MONTHS[mi]}: ${ya} ${n0(k(R[ia][mi]))} · ${yb} ${n0(k(R[ib][mi]))} ${T.y}` : T.hover}</p>
      <Table lang={lang} R={R} />
    </div>
  );
}

function Table({ lang, R }: { lang: Lang; R: number[][] }) {
  const T = TXT[lang];
  return (
    <details>
      <summary>{T.table}</summary>
      <div className="table-wrap"><table className="num">
        <thead><tr><th>{T.year}</th>{MONTHS.map((m) => <th key={m}>{T.th} {m}</th>)}</tr></thead>
        <tbody>{YEARS.map((y, i) => <tr key={y}><td>{y}</td>{R[i].map((v, j) => <td key={j}>{fmtNum(lang, v, 0)}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  );
}
