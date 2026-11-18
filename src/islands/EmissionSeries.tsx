import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import data from '../../public/data/emissions-series.json';
import { REGIONS } from './layers';
import LineChart, { Legend, type Series } from './LineChart';
import { Pills } from './VizUi';

/** Ch.13 charts from emissions-series.json. "fire-months": MODIS fire-days per calendar month per 1,000 cells of
 *  each land class (2003-2025 mean); "fire-years": cropland fire-days per year; "ch4": Sentinel-5P XCH4 monthly
 *  region means; "air": tropospheric NO2 or CO monthly region means. */
type Region = 'red' | 'mekong';
type Cls = 'crop' | 'forest' | 'other';
type Props = { lang: Lang; view: 'fire-months' | 'fire-years' | 'ch4' | 'air'; region?: Region };

const TXT = {
  vi: { region: 'Vùng', month: 'Tháng', year: 'Năm', per1k: 'ngày cháy / 1 000 ô 1 km', hover: 'Di chuột trên biểu đồ để đọc số liệu.',
    tMonths: 'Ngày có điểm cháy theo tháng, trung bình 2003–2025, trên 1 000 ô 1 km mỗi loại đất',
    tYears: 'Ngày có điểm cháy trên đất trồng trọt mỗi năm, trên 1 000 ô 1 km',
    cls: { crop: 'Đất trồng trọt', forest: 'Rừng, đất ngập nước', other: 'Đất khác (đô thị, công nghiệp, hỗn hợp)' },
    tCh4: 'CH₄ cột khí (XCH₄) trung bình tháng, Sentinel-5P', ppb: 'ppb',
    tAir: 'Trung bình tháng trên toàn vùng, Sentinel-5P', no2: 'NO₂ tầng đối lưu (µmol/m²)', co: 'CO cột khí (mmol/m²)', none: 'không có số đo', gas: 'Khí' },
  en: { region: 'Region', month: 'Month', year: 'Year', per1k: 'fire days / 1,000 1 km cells', hover: 'Hover the chart to read values.',
    tMonths: 'Days with a fire detection per month, 2003–2025 mean, per 1,000 1 km cells of each land class',
    tYears: 'Days with a fire detection on cropland per year, per 1,000 1 km cells',
    cls: { crop: 'Cropland', forest: 'Forest, wetland', other: 'Other land (urban, industry, mixed)' },
    tCh4: 'Monthly mean column CH₄ (XCH₄), Sentinel-5P', ppb: 'ppb',
    tAir: 'Monthly region mean, Sentinel-5P', no2: 'Tropospheric NO₂ (µmol/m²)', co: 'Column CO (mmol/m²)', none: 'no data', gas: 'Gas' },
};
const RC: Record<Region, string> = { red: '#D55E00', mekong: '#0072B2' };
const CC: Record<Cls, string> = { crop: '#E69F00', forest: '#009E73', other: '#999999' };
const CM = { crop: 'circle', forest: 'triangle', other: 'square' } as const;
const CLASSES: Cls[] = ['crop', 'forest', 'other'];
const REG: Region[] = ['mekong', 'red'];

type Fire = { years: [number, number]; monthly: Record<Region, Record<Cls, number[]> & { cells: Record<Cls, number> }> };
const fire = data.fire as unknown as Fire;
const F0 = fire.years[0], A0 = 2003; // FIRMS has Terra only until Jul 2002: compare from 2003
type Monthly = { months: [number, number] } & Record<Region, Record<string, (number | null)[]>>;
const ch4 = data.ch4 as unknown as Monthly;
const air = data.air as unknown as Monthly;

/** Fire-days in month m (1-12) of year y for a class. */
const fd = (r: Region, c: Cls, y: number, m: number) => fire.monthly[r][c][(y - F0) * 12 + m - 1];
const per1k = (r: Region, c: Cls) => 1000 / fire.monthly[r].cells[c];
const years = Array.from({ length: fire.years[1] - A0 + 1 }, (_, i) => A0 + i);

/** Monthly fire-day climatology (A0..end) per 1,000 cells of the class. */
export const fireClim = (r: Region, c: Cls): number[] =>
  Array.from({ length: 12 }, (_, i) => years.reduce((s, y) => s + fd(r, c, y, i + 1), 0) / years.length * per1k(r, c));
/** Cropland fire-days per year per 1,000 cropland cells. */
export const fireYear = (r: Region, y: number): number =>
  Array.from({ length: 12 }, (_, i) => fd(r, 'crop', y, i + 1)).reduce((a, b) => a + b, 0) * per1k(r, 'crop');

/** Monthly series (decimal year, value) of a Sentinel-5P product, dropping months with no value. */
const monthlyPts = (m: Monthly, r: Region, key: string): [number, number][] =>
  (m[r][key] ?? []).map((v, i) => [m.months[0] + i / 12 + 1 / 24, v] as [number, number | null])
    .filter((p): p is [number, number] => p[1] != null);

export default function EmissionSeries({ lang, view, region = 'mekong' }: Props) {
  const T = TXT[lang];
  const [reg, setReg] = useState<Region>(region);
  const [prod, setProd] = useState<'no2' | 'co'>('no2');
  const [hx, setHx] = useState<number | null>(null);
  const n1 = (v: number) => fmtNum(lang, v, 1), n0 = (v: number) => fmtNum(lang, v, 0);
  const nm = (r: Region) => REGIONS[r].name[lang];
  const regionPills = <Pills label={T.region} value={reg} onChange={setReg}
    options={REG.map((r) => ({ v: r, label: nm(r) }))} />;

  if (view === 'fire-months') {
    const series: Series[] = CLASSES.map((c) => ({ id: c, label: T.cls[c], color: CC[c], marker: CM[c], width: 2,
      points: fireClim(reg, c).map((v, i) => [i + 1, v] as [number, number]) }));
    const top = Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) / 10) * 10);
    const m = hx == null ? null : Math.min(12, Math.max(1, Math.round(hx)));
    return (
      <div className="viz">
        {regionPills}
        <p className="chart-title">{T.tMonths}</p>
        <LineChart title={T.tMonths} series={series} x={[0.5, 12.5]} y={[0, top]} xTicks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
          xLabel={T.month} yLabel={T.per1k} yFormat={(v) => v.toFixed(0)} vline={m} onHover={setHx} height={300} />
        <Legend items={series} />
        <p className="readout num">{m == null ? T.hover : `${T.month} ${m}: ` + series.map((s) => `${s.label} ${n1(s.points[m - 1][1])}`).join(' · ')}</p>
      </div>
    );
  }

  if (view === 'fire-years') {
    const series: Series[] = REG.map((r) => ({ id: r, label: nm(r), color: RC[r], marker: r === 'red' ? 'square' : 'circle', width: 2,
      points: years.map((y) => [y, fireYear(r, y)] as [number, number]) }));
    const top = Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) / 100) * 100;
    const y = hx == null ? null : Math.round(hx);
    const at = (s: Series) => s.points.find((p) => p[0] === y)?.[1];
    return (
      <div className="viz">
        <p className="chart-title">{T.tYears}</p>
        <LineChart title={T.tYears} series={series} x={[A0 - 0.5, years[years.length - 1] + 0.5]} y={[0, top]}
          xLabel={T.year} yLabel={T.per1k} yFormat={(v) => v.toFixed(0)} vline={y} onHover={setHx} height={300} />
        <Legend items={series} />
        <p className="readout num">{y == null || at(series[0]) == null ? T.hover : `${y}: ` + series.map((s) => `${s.label} ${n0(at(s)!)}`).join(' · ')}</p>
      </div>
    );
  }

  const src = view === 'ch4' ? ch4 : air;
  const key = view === 'ch4' ? 'xch4' : prod;
  const series: Series[] = REG.map((r) => ({ id: r, label: nm(r), color: RC[r], marker: r === 'red' ? 'square' : 'circle', width: 1.5,
    maxGap: 0.1, points: monthlyPts(src, r, key) }));
  const vals = series.flatMap((s) => s.points.map((p) => p[1]));
  const step = view === 'ch4' ? 10 : prod === 'no2' ? 10 : 5;
  const lo = Math.floor(Math.min(...vals) / step) * step, hi = Math.ceil(Math.max(...vals) / step) * step;
  const x0 = src.months[0], x1 = src.months[1] + 1;
  const i = hx == null ? null : Math.floor((hx - x0) * 12);
  const ok = i != null && i >= 0 && i < (x1 - x0) * 12;
  const label = ok ? `${String(i! % 12 + 1).padStart(2, '0')}/${x0 + Math.floor(i! / 12)}` : '';
  const title = view === 'ch4' ? T.tCh4 : `${T.tAir}: ${T[prod]}`;
  const unit = view === 'ch4' ? T.ppb : T[prod];
  const fmt = (r: Region) => {
    const v = src[r][key]?.[i!];
    return `${nm(r)} ${v == null ? T.none : (view === 'ch4' ? n0(v) : n1(v))}`;
  };
  return (
    <div className="viz">
      {view === 'air' && <Pills label={T.gas} value={prod} onChange={setProd}
        options={[{ v: 'no2' as const, label: 'NO₂' }, { v: 'co' as const, label: 'CO' }]} />}
      <p className="chart-title">{title}</p>
      <LineChart title={title} series={series} x={[x0, x1]} y={[lo, hi]} xLabel={T.year} yLabel={unit}
        yFormat={(v) => v.toFixed(0)} vline={ok ? hx : null} onHover={setHx} height={300} />
      <Legend items={series} />
      <p className="readout num">{!ok ? T.hover : `${label}: ` + REG.map(fmt).join(' · ')}</p>
    </div>
  );
}
