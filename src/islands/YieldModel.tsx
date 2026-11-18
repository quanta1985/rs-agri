import { useMemo, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum, placeName } from '../lib/format';
import { detrend, fit, looBaseline, looRmse } from '../lib/yieldmodel';
import data from '../../public/data/yield-series.json';
import LineChart, { Legend, type Series } from './LineChart';
import { Pills, StatPanel } from './VizUi';

/**
 * Ch.6: official winter-spring rice yield (NSO) against the seasonal peak EVI (MODIS) per province, 2001-2024.
 * view "trend": yield per year with its linear trend; "scatter": peak EVI vs yield (raw or both detrended) with the
 * least-squares line, R^2 and leave-one-out error. Same maths as scripts/yield_numbers.ts.
 */
type Region = 'mekong' | 'red';
type Props = { lang: Lang; view: 'trend' | 'scatter' | 'curves'; region?: Region; label: string };
type RegionData = {
  peaks: { years: number[]; provinces: Record<string, [number | null, number][]> };
  late?: { years: number[]; provinces: Record<string, (number | null)[]> };
  official: Record<string, Record<string, [number | null, number | null]>>;
  curves: Record<string, [number, number | null, number][]>;
};
const D = data as unknown as Record<Region, RegionData>;
export const YEARS: [number, number] = [2001, 2024];
export const MIN_YEARS = 12;

export type Index = 'peak' | 'late';
/** Paired (year, EVI index, yield) for one province, final statistics only (2025 is preliminary).
 *  peak = seasonal peak EVI; late = mean EVI 1 Feb - 31 Mar (Mekong only). */
export const pairs = (region: Region, prov: string, index: Index = 'peak') => {
  const r = D[region];
  const xAt = (i: number) => (index === 'late' ? r.late?.provinces[prov]?.[i] : r.peaks.provinces[prov]?.[i]?.[0]) ?? null;
  return r.peaks.years.map((y, i) => ({ year: y, x: xAt(i), y: r.official[prov]?.[String(y)]?.[0] ?? null }))
    .filter((p): p is { year: number; x: number; y: number } => p.year >= YEARS[0] && p.year <= YEARS[1] && p.x != null && p.y != null);
};

const TXT = {
  vi: { prov: 'Tỉnh', raw: 'Số gốc', det: 'Đã bỏ xu thế', mode: 'Dạng số liệu', year: 'Năm', yield: 'Năng suất Đông Xuân (tấn/ha)', peak: 'EVI cực đại của vụ',
    dYield: 'Năng suất lệch khỏi xu thế (tấn/ha)', dPeak: 'EVI cực đại lệch khỏi xu thế', trend: 'Xu thế tuyến tính', obs: 'Từng năm', fitL: 'Đường hồi quy',
    slope: 'Xu thế', r2: 'R²', loo: 'Sai số dự báo bỏ-một-năm (RMSE)', base: 'Sai số nếu chỉ đoán trung bình', n: 'Số năm', tha: 'tấn/ha', perYr: 'tấn/ha/năm',
    few: `Tỉnh này có dưới ${MIN_YEARS} năm đủ cả hai số liệu.`, table: 'Bảng số liệu',
    region: 'Vùng', mekong: 'ĐBSCL', red: 'ĐBSH', show: 'Năm', cmp: 'So với', day: 'Ngày từ đầu vụ', evi: 'EVI trung bình đất trồng trọt', others: 'Các năm khác',
    start: { mekong: 'đầu vụ = 15/11 năm trước', red: 'đầu vụ = 15/2' }, dropped: (k: number, n: number) => `${k}/${n} ảnh bị bỏ vì dưới 50 % ô có số liệu tốt (mây)`,
    index: 'Chỉ số', peakShort: 'EVI cực đại', lateShort: 'EVI tháng 2–3', late: 'EVI trung bình 1/2–31/3', dLate: 'EVI tháng 2–3 lệch khỏi xu thế' },
  en: { prov: 'Province', raw: 'Raw values', det: 'Detrended', mode: 'Values', year: 'Year', yield: 'Winter–spring yield (t/ha)', peak: 'Seasonal peak EVI',
    dYield: 'Yield minus trend (t/ha)', dPeak: 'Peak EVI minus trend', trend: 'Linear trend', obs: 'One year', fitL: 'Regression line',
    slope: 'Trend', r2: 'R²', loo: 'Leave-one-year-out error (RMSE)', base: 'Error of just guessing the mean', n: 'Years', tha: 't/ha', perYr: 't/ha per year',
    few: `This province has fewer than ${MIN_YEARS} years with both values.`, table: 'Data table',
    region: 'Region', mekong: 'Mekong', red: 'Red River', show: 'Year', cmp: 'Compare with', day: 'Days from season start', evi: 'Mean EVI of cropland', others: 'Other years',
    start: { mekong: 'season start = 15 Nov of the previous year', red: 'season start = 15 Feb' }, dropped: (k: number, n: number) => `${k}/${n} composites dropped: under 50 % of cells with good data (cloud)`,
    index: 'Index', peakShort: 'Peak EVI', lateShort: 'Feb–Mar EVI', late: 'Mean EVI 1 Feb – 31 Mar', dLate: 'Feb–Mar EVI minus trend' },
};

export default function YieldModel(p: Props) {
  return p.view === 'curves' ? <SeasonCurves {...p} /> : <ProvinceModel {...p} />;
}

function ProvinceModel({ lang, view, region: region0 = 'mekong', label }: Props) {
  const T = TXT[lang];
  const [region, setRegion] = useState<Region>(region0);
  const provs = Object.keys(D[region].peaks.provinces).filter((p) => pairs(region, p).length >= MIN_YEARS);
  const [prov0, setProv] = useState('An Giang');
  const prov = provs.includes(prov0) ? prov0 : provs[0];
  const [mode, setMode] = useState<'raw' | 'det'>('det');
  const [index, setIndex] = useState<Index>('peak');
  const hasLate = !!D[region].late;
  const P = useMemo(() => pairs(region, prov, hasLate ? index : 'peak'), [region, prov, index, hasLate]);
  const t = P.map((p) => p.year);
  const yTrend = fit(t, P.map((p) => p.y));
  const xs = mode === 'det' ? detrend(t, P.map((p) => p.x)) : P.map((p) => p.x);
  const ys = mode === 'det' ? detrend(t, P.map((p) => p.y)) : P.map((p) => p.y);
  const f = fit(xs, ys);
  const nm = (p: string) => placeName(lang, p);
  const f2 = (v: number, d = 2) => fmtNum(lang, v, d);

  const pills = (
    <div className="controls">
      <Pills label={T.region} value={region} onChange={(v) => { setRegion(v); setIndex('peak'); }} options={[{ v: 'mekong', label: T.mekong }, { v: 'red', label: T.red }]} />
      <label className="ctl"><span className="ctl-label">{T.prov}</span>
        <select value={prov} onChange={(e) => setProv(e.target.value)}>{provs.map((p) => <option key={p} value={p}>{nm(p)}</option>)}</select>
      </label>
      {view === 'scatter' && hasLate && <Pills label={T.index} value={index} onChange={setIndex} options={[{ v: 'peak', label: T.peakShort }, { v: 'late', label: T.lateShort }]} />}
      {view === 'scatter' && <Pills label={T.mode} value={mode} onChange={setMode} options={[{ v: 'det', label: T.det }, { v: 'raw', label: T.raw }]} />}
    </div>
  );
  if (P.length < MIN_YEARS) return <div className="viz">{pills}<p className="status">{T.few}</p></div>;

  let chart;
  if (view === 'trend') {
    const series: Series[] = [
      { id: 'obs', label: T.yield, color: 'var(--chart-1)', marker: 'circle', width: 2, points: P.map((p) => [p.year, p.y]), maxGap: 1.5 },
      { id: 'trend', label: T.trend, color: 'var(--chart-2)', dash: '6 4', width: 2, points: [[t[0], yTrend.a + yTrend.b * t[0]], [t[t.length - 1], yTrend.a + yTrend.b * t[t.length - 1]]] },
    ];
    const lo = Math.min(...P.map((p) => p.y)), hi = Math.max(...P.map((p) => p.y));
    chart = <>
      <LineChart title={`${nm(prov)}: ${T.yield}`} series={series} x={[YEARS[0] - 0.5, YEARS[1] + 0.5]} y={[Math.floor(lo), Math.ceil(hi)]} xLabel={T.year} yLabel={T.yield}
        xFormat={(v) => String(Math.round(v))} yFormat={(v) => f2(v, 1)} height={300} />
      <Legend items={series} />
    </>;
  } else {
    const xl = [Math.min(...xs), Math.max(...xs)], yl = [Math.min(...ys), Math.max(...ys)];
    const padX = (xl[1] - xl[0]) * 0.08 || 0.01, padY = (yl[1] - yl[0]) * 0.08 || 0.1;
    const series: Series[] = [
      { id: 'obs', label: T.obs, color: 'var(--chart-1)', marker: 'circle', width: 0, points: xs.map((x, i) => [x, ys[i]] as [number, number]) },
      { id: 'fit', label: T.fitL, color: 'var(--chart-2)', dash: '6 4', width: 2, points: [[xl[0], f.a + f.b * xl[0]], [xl[1], f.a + f.b * xl[1]]] },
    ];
    chart = <>
      <LineChart title={`${nm(prov)}: ${T.peak} – ${T.yield}`} series={series} x={[xl[0] - padX, xl[1] + padX]} y={[yl[0] - padY, yl[1] + padY]}
        xLabel={index === 'late' ? (mode === 'det' ? T.dLate : T.late) : (mode === 'det' ? T.dPeak : T.peak)} yLabel={mode === 'det' ? T.dYield : T.yield}
        xFormat={(v) => f2(v, 2)} yFormat={(v) => f2(v, 1)} height={300} />
      <Legend items={series} />
    </>;
  }

  return (
    <div className="viz two chart-wide" role="group" aria-label={label}>
      <div>{pills}
        <StatPanel rows={view === 'trend' ? [
          { k: T.n, v: P.length },
          { k: T.slope, v: `${yTrend.b >= 0 ? '+' : '−'}${f2(Math.abs(yTrend.b), 3)} ${T.perYr}`, tone: 'accent' },
          { k: T.r2, v: f2(yTrend.r2) },
        ] : [
          { k: T.n, v: P.length },
          { k: T.r2, v: f2(f.r2), tone: 'accent' },
          { k: T.loo, v: `${f2(looRmse(xs, ys))} ${T.tha}` },
          { k: T.base, v: `${f2(looBaseline(ys))} ${T.tha}`, tone: 'muted' },
        ]} />
      </div>
      <div>{chart}
        <details><summary>{T.table}</summary>
          <div className="table-wrap"><table className="num">
            <thead><tr><th>{T.year}</th><th>{index === 'late' ? T.late : T.peak}</th><th>{T.yield}</th></tr></thead>
            <tbody>{P.map((p) => <tr key={p.year}><td>{p.year}</td><td>{f2(p.x, 3)}</td><td>{f2(p.y, 2)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </div>
    </div>
  );
}

export const MIN_GOOD = 0.5; // a composite is drawn when >= 50 % of the cropland cells have a good (cloud-free) value
const START = { mekong: [10, 15, -1], red: [1, 15, 0] } as const; // month index, day, year offset of the season start

/** Season EVI curves of one region: two chosen years over all the others (grey). */
function SeasonCurves({ lang, region: region0 = 'mekong', label }: Props) {
  const T = TXT[lang];
  const [region, setRegion] = useState<Region>(region0);
  const C = D[region].curves;
  const years = Object.keys(C).map(Number).sort((a, b) => a - b);
  const [a, setA] = useState(2016);
  const [b, setB] = useState(2015);
  const day0 = (y: number) => {
    const [m, d, off] = START[region];
    return Date.UTC(y + off, m, d) / 86400000;
  };
  const pts = (y: number) => (C[String(y)] ?? []).filter((p) => p[1] != null && p[2] >= MIN_GOOD).map((p) => [p[0] - day0(y), p[1] as number] as [number, number]);
  const dropped = years.reduce((k, y) => k + C[String(y)].filter((p) => p[1] == null || p[2] < MIN_GOOD).length, 0);
  const total = years.reduce((k, y) => k + C[String(y)].length, 0);
  const grey: Series[] = years.filter((y) => y !== a && y !== b).map((y) => ({ id: `g${y}`, label: T.others, color: 'var(--fg-3)', width: 1, points: pts(y), maxGap: 20 }));
  const main: Series[] = [
    { id: 'b', label: String(b), color: 'var(--chart-2)', dash: '6 4', marker: 'square', width: 2.5, points: pts(b), maxGap: 20 },
    { id: 'a', label: String(a), color: 'var(--chart-1)', marker: 'circle', width: 2.5, points: pts(a), maxGap: 20 },
  ];
  const sel = (v: number, set: (n: number) => void, lab: string) => (
    <label className="ctl"><span className="ctl-label">{lab}</span>
      <select value={v} onChange={(e) => set(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
    </label>
  );
  const xMax = region === 'mekong' ? 140 : 110;
  return (
    <div className="viz" role="group" aria-label={label}>
      <div className="controls">
        <Pills label={T.region} value={region} onChange={(v) => { setRegion(v); setA(v === 'mekong' ? 2016 : 2024); setB(v === 'mekong' ? 2015 : 2023); }} options={[{ v: 'mekong', label: T.mekong }, { v: 'red', label: T.red }]} />
        {sel(a, setA, T.show)}{sel(b, setB, T.cmp)}
      </div>
      <LineChart title={label} series={[...grey, ...main]} x={[0, xMax]} y={[0, 0.7]} xLabel={`${T.day} (${T.start[region]})`} yLabel={T.evi}
        xFormat={(v) => String(Math.round(v))} yFormat={(v) => fmtNum(lang, v, 1)} height={300} />
      <Legend items={[main[1], main[0], { id: 'g', label: T.others, color: 'var(--fg-3)', width: 1 }]} />
      <p className="readout">{T.dropped(dropped, total)}</p>
    </div>
  );
}
