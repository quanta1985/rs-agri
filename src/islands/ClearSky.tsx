import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import data from '../../public/data/data-clearsky.json';
import { REGIONS } from './layers';
import LineChart, { Legend, type Marker, type Series } from './LineChart';
import { Pills } from './VizUi';

/** Ch.2: how often the sky is clear enough for Sentinel-2 at the five sites (view "s2", by month, 2019-2024),
 *  and how many Sentinel-1 dates each site gets per year (view "s1", 2015-2025). Data: data-clearsky.json. */
type Site = keyof typeof data.sites;
type Props = { lang: Lang; view?: 's2' | 's1'; site?: Site };

const TXT = {
  vi: { site: 'Điểm', month: 'Tháng', year: 'Năm', looks: 'Ngày có ảnh S2', usable: 'Ngày dùng được (≥ 80 % quang đãng)', range: 'Ít nhất – nhiều nhất trong 6 năm',
    t2: 'Số ngày Sentinel-2 mỗi tháng (trung bình 2019–2024)', t1: 'Số ngày có ảnh Sentinel-1 mỗi năm', y2: 'ngày/tháng', y1: 'ngày/năm',
    hover: 'Di chuột trên biểu đồ để đọc số liệu.', table: 'Bảng số liệu: ngày dùng được theo tháng', clear: 'trung bình phần trời quang',
    rLooks: 'có ảnh', rUse: 'dùng được' },
  en: { site: 'Site', month: 'Month', year: 'Year', looks: 'Days with an S2 image', usable: 'Usable days (≥ 80 % clear)', range: 'Fewest – most in the 6 years',
    t2: 'Sentinel-2 days per month (2019–2024 mean)', t1: 'Sentinel-1 days per year', y2: 'days/month', y1: 'days/year',
    hover: 'Hover the chart to read values.', table: 'Data table: usable days per month', clear: 'mean clear share',
    rLooks: 'image days', rUse: 'usable' },
};
const SITES = Object.keys(data.sites) as Site[];
const STYLE: Record<string, { color: string; marker: Marker; dash?: string }> = {
  namdinh: { color: '#0072B2', marker: 'circle' }, angiang: { color: '#E69F00', marker: 'square', dash: '6 3' },
  thapmuoi: { color: '#009E73', marker: 'triangle' }, bentre: { color: '#CC79A7', marker: 'diamond', dash: '2 3' },
  camau: { color: '#D55E00', marker: 'circle', dash: '8 3 2 3' },
};
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const col = (m: number[][], j: number) => m.map((r) => r[j]);
const short = (s: Site, lang: Lang) => REGIONS[s].name[lang].split(' (')[0];

export default function ClearSky({ lang, view = 's2', site = 'namdinh' }: Props) {
  const T = TXT[lang];
  const [s, setS] = useState<Site>(site);
  const [hx, setHx] = useState<number | null>(null);
  const n1 = (v: number) => fmtNum(lang, v, 1);

  if (view === 's1') {
    const YRS = data.s1_years;
    const series: Series[] = SITES.map((k) => ({ id: k, label: short(k, lang), ...STYLE[k], width: 2,
      points: YRS.map((y, i) => [y, data.sites[k].s1_dates_per_year[i]] as [number, number]) }));
    const top = Math.ceil(Math.max(...SITES.flatMap((k) => data.sites[k].s1_dates_per_year)) / 20) * 20 + 10;
    const yi = hx == null ? -1 : YRS.indexOf(Math.round(hx));
    return (
      <div className="viz">
        <p className="chart-title">{T.t1}</p>
        <LineChart title={T.t1} series={series} x={[YRS[0] - 0.5, YRS[YRS.length - 1] + 0.5]} y={[0, top]} xLabel={T.year} yLabel={T.y1}
          xTicks={YRS} yFormat={(v) => v.toFixed(0)} vline={yi >= 0 ? YRS[yi] : null} onHover={setHx} height={300} />
        <Legend items={series} />
        <p className="readout num">{yi >= 0 ? `${YRS[yi]}: ` + SITES.map((k) => `${short(k, lang)} ${data.sites[k].s1_dates_per_year[yi]}`).join(' · ') : T.hover}</p>
      </div>
    );
  }

  const d = data.sites[s];
  const looks = MONTHS.map((_, j) => mean(col(d.s2_dates, j)));
  const use = MONTHS.map((_, j) => col(d.s2_usable, j));
  const series: Series[] = [
    { id: 'looks', label: T.looks, color: '#999999', dash: '5 3', marker: 'square', width: 1.5, points: MONTHS.map((m, j) => [m, looks[j]]) },
    { id: 'use', label: T.usable, color: STYLE[s].color, marker: 'circle', width: 2.5, points: MONTHS.map((m, j) => [m, mean(use[j])]) },
  ];
  const ribbon = { color: STYLE[s].color, points: MONTHS.map((m, j) => ({ x: m, lo: Math.min(...use[j]), hi: Math.max(...use[j]) })) };
  const top = Math.ceil(Math.max(...SITES.flatMap((k) => data.sites[k].s2_dates.flat())) / 2) * 2;
  const mi = hx == null ? -1 : MONTHS.indexOf(Math.round(hx));
  return (
    <div className="viz">
      <div className="controls">
        <Pills label={T.site} value={s} options={SITES.map((k) => ({ v: k, label: short(k, lang) }))} onChange={(v) => { setS(v); setHx(null); }} />
      </div>
      <p className="chart-title">{T.t2} · {REGIONS[s].name[lang]}</p>
      <LineChart title={T.t2} series={series} ribbons={[ribbon]} x={[0.5, 12.5]} y={[0, top]} xLabel={T.month} yLabel={T.y2}
        xTicks={MONTHS} yFormat={(v) => v.toFixed(0)} vline={mi >= 0 ? MONTHS[mi] : null} onHover={setHx} height={300} />
      <Legend items={[...series, { id: 'r', label: T.range, color: STYLE[s].color, width: 8 }]} />
      <p className="readout num">{mi >= 0
        ? `${T.month} ${mi + 1}: ${T.rLooks} ${n1(looks[mi])} · ${T.rUse} ${n1(mean(use[mi]))} (${Math.min(...use[mi])}–${Math.max(...use[mi])}) · ${T.clear} ${fmtNum(lang, d.s2_clear_mean[mi] * 100, 0)} %`
        : T.hover}</p>
      <details>
        <summary>{T.table}</summary>
        <div className="table-wrap"><table className="num">
          <thead><tr><th>{T.year}</th>{MONTHS.map((m) => <th key={m}>{m}</th>)}</tr></thead>
          <tbody>{data.years.map((y, i) => <tr key={y}><td>{y}</td>{d.s2_usable[i].map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}
