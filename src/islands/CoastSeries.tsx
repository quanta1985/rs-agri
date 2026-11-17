import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import { theilSen } from '../lib/change';
import data from '../../public/data/coast-series.json';
import LineChart, { Legend, type Series } from './LineChart';

/** Ch.12 coast charts from coast-series.json. view "shore": land gained or lost per coastal stretch each year against
 *  the Theil-Sen fit at 1990 (Landsat, median-tide shoreline; single years swing with the tide), with the trend line;
 *  "mangrove": GMW v3 mangrove area per epoch. */
type Props = { lang: Lang; view: 'shore' | 'mangrove' };
type Stretch = { name: { vi: string; en: string }; area_ha: number; length_km: number | null; land_valid_ha: [number, number][] };

const TXT = {
  vi: { year: 'Năm', ha: 'ha so với 1990', tShore: 'Đất được (+) hay mất (−) theo từng đoạn bờ, so với năm 1990', perYr: 'ha/năm', trend: 'xu thế',
    tMg: 'Diện tích rừng ngập mặn theo Global Mangrove Watch', kha: 'nghìn ha', hover: 'Di chuột trên biểu đồ để đọc số liệu.',
    regions: { red: 'ĐB sông Hồng', mekong: 'ĐB sông Cửu Long', ndcoast: 'khung bờ biển Nam Định', cmcoast: 'khung Mũi Cà Mau' } },
  en: { year: 'Year', ha: 'ha vs 1990', tShore: 'Land gained (+) or lost (−) per stretch of coast, against 1990', perYr: 'ha/yr', trend: 'trend',
    tMg: 'Mangrove area in Global Mangrove Watch', kha: 'thousand ha', hover: 'Hover the chart to read values.',
    regions: { red: 'Red River Delta', mekong: 'Mekong Delta', ndcoast: 'Nam Dinh coast frame', cmcoast: 'Ca Mau Cape frame' } },
};
const COLORS = ['#009E73', '#D55E00', '#0072B2', '#E69F00', '#CC79A7', '#56B4E9'];
const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'circle', 'square'] as const;
const VALID = 0.95; // a year counts only if >= 95 % of the stretch had enough clear looks
const X0 = 1990; // reference year for the plotted change

const years: number[] = data.years;
const land = data.land as unknown as Record<string, Stretch>; // JSON infers number[][] for the [land, valid] pairs

/** Land area (ha) per year where the year is well observed, else NaN. */
export const landSeries = (s: Stretch): number[] =>
  s.land_valid_ha.map(([l, v]) => (v >= VALID * s.area_ha ? l : NaN));

export default function CoastSeries({ lang, view }: Props) {
  const T = TXT[lang];
  const [hx, setHx] = useState<number | null>(null);
  const n0 = (v: number) => fmtNum(lang, v, 0), n1 = (v: number) => fmtNum(lang, v, 1);

  if (view === 'shore') {
    const keys = Object.keys(land);
    const fits = keys.map((k) => theilSen(years, landSeries(land[k])));
    const pts: Series[] = keys.map((k, i) => {
      const ls = landSeries(land[k]), base = fits[i].intercept + fits[i].slope * X0;
      return { id: k, label: `${land[k].name[lang]}: ${fits[i].slope >= 0 ? '+' : ''}${n0(fits[i].slope)} ${T.perYr}`, color: COLORS[i % COLORS.length],
        marker: MARKERS[i % MARKERS.length], width: 1.5, maxGap: 3,
        points: years.map((y, j) => [y, ls[j] - base] as [number, number]).filter(([, v]) => Number.isFinite(v)) };
    });
    const lines: Series[] = keys.map((k, i) => ({ id: `${k}-t`, label: `${T.trend} ${land[k].name[lang]}`, color: COLORS[i % COLORS.length], dash: '6 4', width: 2,
      points: [years[0], years[years.length - 1]].map((y) => [y, fits[i].slope * (y - X0)] as [number, number]) }));
    const series = [...pts, ...lines];
    const all = pts.flatMap((s) => s.points.map((p) => p[1]));
    const lim = Math.ceil(Math.max(...all.map(Math.abs)) / 500) * 500;
    const y = hx == null ? null : Math.round(hx);
    const at = (s: Series) => s.points.find((p) => p[0] === y)?.[1];
    return (
      <div className="viz">
        <p className="chart-title">{T.tShore}</p>
        <LineChart title={T.tShore} series={series} x={[years[0] - 0.5, years[years.length - 1] + 0.5]} y={[-lim, lim]}
          xLabel={T.year} yLabel={T.ha} yFormat={(v) => v.toFixed(0)} hline={0} vline={y} onHover={setHx} height={320} />
        <Legend items={pts} />
        <p className="readout num">{y == null ? T.hover : `${y}: ` + pts.map((s) => { const v = at(s); return `${s.label.split(':')[0]} ${v == null ? '–' : (v >= 0 ? '+' : '') + n0(v)} ha`; }).join(' · ')}</p>
      </div>
    );
  }

  const mg = data.mangrove as { years: number[]; ha: Record<string, number[]> };
  const keys = ['mekong', 'cmcoast', 'red', 'ndcoast'] as const;
  const series: Series[] = keys.map((k, i) => ({
    id: k, label: T.regions[k], color: COLORS[i], marker: MARKERS[i], dash: k.endsWith('coast') ? '6 3' : undefined, width: 2, maxGap: 1, // epochs only: no line across 1997-2006, 2011-2014
    points: mg.years.map((y, j) => [y, mg.ha[k][j] / 1000] as [number, number]) }));
  const top = Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) / 20) * 20;
  const yi = hx == null ? -1 : mg.years.reduce((b, y, j) => (Math.abs(y - hx) < Math.abs(mg.years[b] - hx) ? j : b), 0);
  return (
    <div className="viz">
      <p className="chart-title">{T.tMg}</p>
      <LineChart title={T.tMg} series={series} x={[1995, 2021]} y={[0, top]} xLabel={T.year} yLabel={T.kha}
        yFormat={(v) => v.toFixed(0)} vline={yi >= 0 ? mg.years[yi] : null} onHover={setHx} height={300} />
      <Legend items={series} />
      <p className="readout num">{yi < 0 ? T.hover : `${mg.years[yi]}: ` + keys.map((k) => `${T.regions[k]} ${n1(mg.ha[k][yi] / 1000)} ${T.kha}`).join(' · ')}</p>
    </div>
  );
}
