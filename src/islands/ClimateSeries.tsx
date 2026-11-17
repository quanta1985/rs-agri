import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import { theilSen } from '../lib/change';
import data from '../../public/data/climate-series.json';
import { REGIONS } from './layers';
import LineChart, { Legend, type Series, type Span } from './LineChart';
import { Pills } from './VizUi';

/** Ch.7 / ch.9 climate charts from climate-series.json (region means of CHIRPS, ERA5-Land, MODIS, SMAP; NOAA ONI).
 *  view "normals": 1991-2020 monthly rain / ET / PET and air / surface temperature; "dry": dry-season rain and
 *  temperature anomalies per year with El Nino seasons; "warming": annual mean temperature with a Theil-Sen trend;
 *  "drought": SPI-3, VHI and SMAP root-zone soil-moisture anomaly, 2015-2025. */
type Region = 'red' | 'mekong';
type Props = { lang: Lang; view: 'normals' | 'dry' | 'warming' | 'drought'; region?: Region };
type Vals = (number | null)[];

const TXT = {
  vi: { region: 'Vùng', month: 'Tháng', year: 'Năm', mm: 'mm/tháng', degC: '°C', pct: '% so với TB 1991–2020',
    rain: 'Mưa (CHIRPS)', et: 'Bốc thoát hơi thực (ERA5-Land)', pet: 'Bốc thoát hơi tiềm năng (ERA5-Land)',
    t2m: 'Nhiệt độ không khí 2 m (ERA5-Land)', lst: 'Nhiệt độ bề mặt ban ngày, đất trồng trọt (MODIS, 2001–2024)',
    tW: 'Mưa và bốc thoát hơi trung bình tháng, 1991–2020', tT: 'Nhiệt độ trung bình tháng',
    tDry: 'Mưa mùa khô (tháng 12–4) so với trung bình 1991–2020', tDryT: 'Nhiệt độ tháng 2–4 so với trung bình 1991–2020',
    tWarm: 'Nhiệt độ không khí trung bình năm (ERA5-Land)', trend: 'xu thế', perDec: '°C/10 năm',
    nino: 'El Niño (ONI tháng 12–2 ≥ 1,0)', oni: 'ONI', dry: 'Mùa khô',
    spi: 'SPI-3 (mưa CHIRPS)', vhi: 'VHI đất trồng trọt (MODIS)', sm: 'Độ ẩm đất vùng rễ, chênh lệch (SMAP)',
    smU: 'm³/m³', hover: 'Di chuột trên biểu đồ để đọc số liệu.', nodata: 'không có' },
  en: { region: 'Region', month: 'Month', year: 'Year', mm: 'mm/month', degC: '°C', pct: '% vs 1991–2020 mean',
    rain: 'Rain (CHIRPS)', et: 'Actual evapotranspiration (ERA5-Land)', pet: 'Potential evapotranspiration (ERA5-Land)',
    t2m: 'Air temperature at 2 m (ERA5-Land)', lst: 'Daytime land surface temperature, cropland (MODIS, 2001–2024)',
    tW: 'Mean monthly rain and evapotranspiration, 1991–2020', tT: 'Mean monthly temperature',
    tDry: 'Dry-season rain (Dec–Apr) against the 1991–2020 mean', tDryT: 'Feb–Apr temperature against the 1991–2020 mean',
    tWarm: 'Annual mean air temperature (ERA5-Land)', trend: 'trend', perDec: '°C/decade',
    nino: 'El Niño (Dec–Feb ONI ≥ 1.0)', oni: 'ONI', dry: 'Dry season',
    spi: 'SPI-3 (CHIRPS rain)', vhi: 'Cropland VHI (MODIS)', sm: 'Root-zone soil moisture anomaly (SMAP)',
    smU: 'm³/m³', hover: 'Hover the chart to read values.', nodata: 'n/a' },
};
const C = { blue: '#0072B2', green: '#009E73', orange: '#E69F00', verm: '#D55E00', pink: '#CC79A7' }; // Okabe-Ito data colours
const RC: Record<Region, string> = { red: C.verm, mekong: C.blue };
const RD = data.regions as Record<Region, Record<string, Vals>>;
const NR = data.normals as Record<Region, Record<string, Vals>>;
const [Y0] = data.start.split('-').map(Number);
const [MY0] = data.modis_start.split('-').map(Number);
const [SY0, SM0] = data.smap.start.split('-').map(Number);
const [OY0] = data.oni.start.split('-').map(Number);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const N1 = data.normal[0], N2 = data.normal[1];
const YN = Math.floor(RD.red.rain.length / 12) + Y0 - 1; // last full year
const at = (arr: Vals, y0: number, y: number, m: number, m0 = 1) => arr[(y - y0) * 12 + (m - m0)] ?? null;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const ok = (v: number | null): v is number => v != null && Number.isFinite(v);
/** LineChart draws every point it gets: drop missing values (lines then break only where maxGap says). */
const fin = (pts: [number, number][]) => pts.filter(([, y]) => Number.isFinite(y));

/** Dec(y-1)..Apr(y) total of a monthly series starting in January of y0. */
const drySum = (arr: Vals, y: number) => {
  const v = [at(arr, Y0, y - 1, 12), ...[1, 2, 3, 4].map((m) => at(arr, Y0, y, m))];
  return v.every(ok) ? v.reduce((s, x) => s + x, 0) : null;
};
const febApr = (arr: Vals, y: number) => {
  const v = [2, 3, 4].map((m) => at(arr, Y0, y, m));
  return v.every(ok) ? mean(v) : null;
};
const DRY_YEARS = Array.from({ length: YN - Y0 }, (_, i) => Y0 + 1 + i);
const oniDJF = (y: number) => at(data.oni.values as Vals, OY0, y, 1); // DJF season centred on January
const NINO = DRY_YEARS.filter((y) => (oniDJF(y) ?? 0) >= 1.0);
const DRY_SPANS: [number, number][] = [[2015.92, 2016.42], [2019.92, 2020.42], [2023.92, 2024.42]]; // Dec-May

export default function ClimateSeries({ lang, view, region = 'mekong' }: Props) {
  const T = TXT[lang];
  const [reg, setReg] = useState<Region>(region);
  const [hx, setHx] = useState<number | null>(null);
  const n0 = (v: number) => fmtNum(lang, v, 0), n1 = (v: number) => fmtNum(lang, v, 1), n2 = (v: number) => fmtNum(lang, v, 2);
  const regionPills = <Pills label={T.region} value={reg} options={(['red', 'mekong'] as Region[]).map((r) => ({ v: r, label: REGIONS[r].name[lang] }))} onChange={(r) => { setReg(r); setHx(null); }} />;
  const nm = (r: Region) => REGIONS[r].name[lang];

  if (view === 'normals') {
    const N = NR[reg];
    const pts = (k: string) => fin(MONTHS.map((m, i) => [m, N[k][i] ?? NaN] as [number, number]));
    const sW: Series[] = [
      { id: 'rain', label: T.rain, color: C.blue, marker: 'circle', width: 2.5, points: pts('rain') },
      { id: 'et', label: T.et, color: C.green, marker: 'square', dash: '6 3', width: 2, points: pts('et') },
      { id: 'pet', label: T.pet, color: C.orange, marker: 'triangle', dash: '2 3', width: 2, points: pts('pet') },
    ];
    const sT: Series[] = [
      { id: 't2m', label: T.t2m, color: C.verm, marker: 'circle', width: 2.5, points: pts('t2m') },
      { id: 'lst', label: T.lst, color: C.pink, marker: 'diamond', dash: '6 3', width: 2, points: pts('lst') },
    ];
    const top = Math.ceil(Math.max(...['rain', 'et', 'pet'].flatMap((k) => (['red', 'mekong'] as Region[]).flatMap((r) => NR[r][k].filter(ok)))) / 50) * 50;
    const mi = hx == null ? -1 : Math.round(hx) - 1;
    const v = (k: string) => (mi >= 0 && ok(N[k][mi]) ? N[k][mi]! : null);
    return (
      <div className="viz">
        <div className="controls">{regionPills}</div>
        <p className="chart-title">{T.tW} · {nm(reg)}</p>
        <LineChart title={T.tW} series={sW} x={[0.5, 12.5]} y={[0, top]} xLabel={T.month} yLabel={T.mm} xTicks={MONTHS}
          yFormat={(x) => x.toFixed(0)} vline={mi >= 0 ? mi + 1 : null} onHover={setHx} height={260} />
        <Legend items={sW} />
        <p className="chart-title">{T.tT} · {nm(reg)}</p>
        <LineChart title={T.tT} series={sT} x={[0.5, 12.5]} y={[10, 40]} xLabel={T.month} yLabel={T.degC} xTicks={MONTHS}
          yFormat={(x) => x.toFixed(0)} vline={mi >= 0 ? mi + 1 : null} onHover={setHx} height={240} />
        <Legend items={sT} />
        <p className="readout num">{mi >= 0
          ? `${T.month} ${mi + 1}: ${T.rain.split(' (')[0]} ${n0(v('rain') ?? NaN)} · ET ${n0(v('et') ?? NaN)} · PET ${n0(v('pet') ?? NaN)} ${T.mm} · ${n1(v('t2m') ?? NaN)} / ${v('lst') == null ? T.nodata : n1(v('lst')!)} °C`
          : T.hover}</p>
      </div>
    );
  }

  if (view === 'dry' || view === 'warming') {
    const spans: Span[] = NINO.map((y) => ({ x0: y - 0.45, x1: y + 0.45, label: '' }));
    if (view === 'warming') {
      const yrs = Array.from({ length: YN - Y0 + 1 }, (_, i) => Y0 + i);
      const ann = (r: Region) => yrs.map((y) => { const v = MONTHS.map((m) => at(RD[r].t2m, Y0, y, m)); return v.every(ok) ? mean(v as number[]) : NaN; });
      const fits = Object.fromEntries((['red', 'mekong'] as Region[]).map((r) => [r, theilSen(yrs, ann(r))])) as Record<Region, { slope: number; intercept: number }>;
      const series: Series[] = (['red', 'mekong'] as Region[]).flatMap((r) => [
        { id: r, label: nm(r), color: RC[r], marker: 'circle' as const, width: 2, points: fin(yrs.map((y, i) => [y, ann(r)[i]] as [number, number])) },
        { id: `${r}-t`, label: `${T.trend} ${nm(r)}: ${fits[r].slope >= 0 ? '+' : ''}${n2(fits[r].slope * 10)} ${T.perDec}`, color: RC[r], dash: '6 4', width: 1.5,
          points: [yrs[0], yrs[yrs.length - 1]].map((y) => [y, fits[r].intercept + fits[r].slope * y] as [number, number]) },
      ]);
      const yi = hx == null ? -1 : yrs.indexOf(Math.round(hx));
      return (
        <div className="viz">
          <p className="chart-title">{T.tWarm}</p>
          <LineChart title={T.tWarm} series={series} x={[Y0 - 0.5, YN + 0.5]} y={[22, 29]} xLabel={T.year} yLabel={T.degC}
            yFormat={(x) => x.toFixed(0)} vline={yi >= 0 ? yrs[yi] : null} onHover={setHx} height={300} />
          <Legend items={series} />
          <p className="readout num">{yi >= 0 ? `${yrs[yi]}: ` + (['red', 'mekong'] as Region[]).map((r) => `${nm(r)} ${n2(ann(r)[yi])} °C`).join(' · ') : T.hover}</p>
        </div>
      );
    }
    const base = (r: Region) => mean(Array.from({ length: N2 - N1 + 1 }, (_, i) => drySum(RD[r].rain, N1 + i)).filter(ok));
    const baseT = (r: Region) => mean(Array.from({ length: N2 - N1 + 1 }, (_, i) => febApr(RD[r].t2m, N1 + i)).filter(ok));
    const anom = (r: Region, y: number) => { const v = drySum(RD[r].rain, y); return v == null ? NaN : 100 * (v / base(r) - 1); };
    const anomT = (r: Region, y: number) => { const v = febApr(RD[r].t2m, y); return v == null ? NaN : v - baseT(r); };
    const mk = (f: (r: Region, y: number) => number): Series[] => (['red', 'mekong'] as Region[]).map((r, k) => ({
      id: r, label: nm(r), color: RC[r], marker: k ? 'square' as const : 'circle' as const, dash: k ? '6 3' : undefined, width: 2,
      points: fin(DRY_YEARS.map((y) => [y, f(r, y)] as [number, number])) }));
    const sR = mk(anom), sT = mk(anomT);
    const yi = hx == null ? -1 : DRY_YEARS.indexOf(Math.round(hx));
    const y = DRY_YEARS[yi];
    return (
      <div className="viz">
        <p className="chart-title">{T.tDry}</p>
        <LineChart title={T.tDry} series={sR} spans={spans} x={[Y0 + 0.5, YN + 0.5]} y={[-100, 150]} xLabel={T.year} yLabel={T.pct}
          yFormat={(x) => x.toFixed(0)} hline={0} vline={yi >= 0 ? y : null} onHover={setHx} height={260} />
        <p className="chart-title">{T.tDryT}</p>
        <LineChart title={T.tDryT} series={sT} spans={spans} x={[Y0 + 0.5, YN + 0.5]} y={[-2, 2.5]} xLabel={T.year} yLabel={T.degC}
          yFormat={(x) => x.toFixed(1)} hline={0} vline={yi >= 0 ? y : null} onHover={setHx} height={220} />
        <Legend items={[...sR, { id: 'nino', label: T.nino, color: 'currentColor', width: 8 }]} />
        <p className="readout num">{yi >= 0
          ? `${T.dry} ${y - 1}–${y}: ` + (['red', 'mekong'] as Region[]).map((r) => `${nm(r)} ${n0(anom(r, y))} % / ${anomT(r, y) >= 0 ? '+' : ''}${n1(anomT(r, y))} °C`).join(' · ') + ` · ${T.oni} ${oniDJF(y) == null ? T.nodata : n1(oniDJF(y)!)}`
          : T.hover}</p>
      </div>
    );
  }

  // drought: SPI-3, VHI, SMAP anomaly, Apr 2015 - Dec 2025
  const X0 = 2015.25, X1 = YN + 1;
  const xOf = (y: number, m: number) => y + (m - 0.5) / 12;
  const monthly = (arr: Vals, y0: number, m0 = 1) => arr.map((v, i) => {
    const t = (m0 - 1) + i, y = y0 + Math.floor(t / 12), m = (t % 12) + 1;
    return [xOf(y, m), ok(v) ? v : NaN] as [number, number];
  }).filter(([x, v]) => x >= X0 && x <= X1 && Number.isFinite(v));
  const sm = data.smap.regions[reg] as Vals;
  const smClim = MONTHS.map((m) => { const v = sm.filter((x, i) => ((SM0 - 1 + i) % 12) + 1 === m && ok(x)) as number[]; return v.length ? mean(v) : NaN; });
  const smA = sm.map((v, i) => (ok(v) ? v - smClim[(SM0 - 1 + i) % 12] : null));
  const spans: Span[] = DRY_SPANS.map(([a, b]) => ({ x0: a, x1: b, label: T.dry }));
  const charts: { key: string; title: string; s: Series; y: [number, number]; f: (v: number) => string; h?: number }[] = [
    { key: 'spi', title: T.spi, s: { id: 'spi', label: T.spi, color: C.blue, width: 2, maxGap: 0.1, points: monthly(RD[reg].spi3, Y0) }, y: [-3, 3], f: (v) => v.toFixed(0) },
    { key: 'vhi', title: T.vhi, s: { id: 'vhi', label: T.vhi, color: C.green, width: 2, marker: 'circle', maxGap: 0.1, points: monthly(RD[reg].vhi, MY0) }, y: [0, 100], f: (v) => v.toFixed(0) },
    { key: 'sm', title: `${T.sm}, ${T.smU}`, s: { id: 'sm', label: T.sm, color: C.orange, width: 2, maxGap: 0.1, points: monthly(smA, SY0, SM0) }, y: [-0.08, 0.08], f: (v) => v.toFixed(2) },
  ];
  const val = (pts: [number, number][]) => { if (hx == null) return null; const p = pts.reduce((b, q) => (Math.abs(q[0] - hx) < Math.abs(b[0] - hx) ? q : b), pts[0]); return Math.abs(p[0] - hx) < 0.05 ? p : null; };
  const pick = charts.map((c) => val(c.s.points));
  const when = pick.find((p) => p) as [number, number] | undefined;
  const label = when ? (() => { const y = Math.floor(when[0]); const m = Math.round((when[0] - y) * 12 + 0.5); return `${String(m).padStart(2, '0')}/${y}`; })() : '';
  return (
    <div className="viz">
      <div className="controls">{regionPills}</div>
      {charts.map((c) => (
        <div key={c.key}>
          <p className="chart-title">{c.title} · {nm(reg)}</p>
          <LineChart title={c.title} series={[c.s]} spans={spans} x={[X0, X1]} y={c.y} xLabel={T.year} yLabel={c.key === 'sm' ? T.smU : c.key.toUpperCase()}
            xTicks={Array.from({ length: YN - 2015 + 1 }, (_, i) => 2016 + i).filter((x) => x <= X1)} xFormat={(x) => String(x)}
            yFormat={c.f} hline={c.key === 'vhi' ? 35 : 0} vline={hx} onHover={setHx} height={190} />
        </div>
      ))}
      <p className="readout num">{when
        ? `${label}: SPI-3 ${pick[0] && ok(pick[0][1]) ? n1(pick[0][1]) : T.nodata} · VHI ${pick[1] && ok(pick[1][1]) ? n0(pick[1][1]) : T.nodata} · SM ${pick[2] && ok(pick[2][1]) ? (pick[2][1] >= 0 ? '+' : '') + fmtNum(lang, pick[2][1], 3) : T.nodata}`
        : T.hover}</p>
    </div>
  );
}
