import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import data from '../../public/data/terrain-hypso.json';
import { REGIONS } from './layers';
import LineChart, { Legend, type Series } from './LineChart';
import { Pills, Slider, StatPanel } from './VizUi';

/** Ch.11 elevation charts from terrain-hypso.json (area below each 0.1 m step, DeltaDTM and Copernicus DEM, 30 m).
 *  view "curve": share of each delta below an elevation, both DEMs; "future": sea-level rise + uniform subsidence
 *  over time against the curve of one delta (illustrative: no dikes, no tides, subsidence everywhere the same). */
type Region = 'red' | 'mekong';
type Dem = 'dtm' | 'cop';
type Props = { lang: Lang; view: 'curve' | 'future'; region?: Region };

const TXT = {
  vi: { region: 'Vùng', elev: 'Độ cao (m trên mực nước biển, EGM2008)', share: '% diện tích có dữ liệu độ cao',
    tCurve: 'Tỉ lệ diện tích thấp hơn mỗi mức độ cao', dtm: 'DeltaDTM (mặt đất trần)', cop: 'Copernicus DEM (bề mặt: cả cây, mái nhà)',
    below: 'thấp hơn', hover: 'Di chuột trên biểu đồ để đọc số liệu.', year: 'Năm', tFut: 'Diện tích thấp hơn mực nước biển tương đối',
    slr: 'Nước biển dâng đến 2100 (cm)', sub: 'Sụt lún (cm/năm, đều toàn vùng)', at: 'Năm', rise: 'Mực nước dâng tương đối',
    of: 'của vùng', ill: 'Minh họa: coi sụt lún đều khắp vùng, bỏ qua đê, thủy triều và sai số DEM.', ha: 'nghìn ha' },
  en: { region: 'Region', elev: 'Elevation (m above sea level, EGM2008)', share: '% of the area with elevation data',
    tCurve: 'Share of the area lower than each elevation', dtm: 'DeltaDTM (bare ground)', cop: 'Copernicus DEM (surface: trees and roofs included)',
    below: 'below', hover: 'Hover the chart to read values.', year: 'Year', tFut: 'Area below relative sea level',
    slr: 'Sea-level rise by 2100 (cm)', sub: 'Subsidence (cm/yr, same everywhere)', at: 'Year', rise: 'Relative sea-level rise',
    of: 'of the region', ill: 'Illustrative: subsidence taken as uniform, dikes, tides and DEM errors ignored.', ha: 'thousand ha' },
};
const RC: Record<Region, string> = { red: '#D55E00', mekong: '#0072B2' };
const [LO] = data.bins_dm;
const R = data.regions as Record<Region, { area_ha: number } & Record<Dem, { valid_ha: number; below: number[] }>>;
const Y0 = 2025, Y1 = 2100;

/** Area (ha) lower than h metres: below[i] holds the area under (LO + i + 1) / 10 m; linear between steps. */
export const areaBelow = (below: number[], h: number): number => {
  const k = h * 10 - LO - 1;
  if (k < 0) return Math.max(0, below[0] * (1 + k));
  if (k >= below.length - 1) return below[below.length - 1];
  const i = Math.floor(k);
  return below[i] + (below[i + 1] - below[i]) * (k - i);
};
const share = (r: Region, d: Dem, h: number) => 100 * areaBelow(R[r][d].below, h) / R[r][d].valid_ha;

export default function TerrainCurve({ lang, view, region = 'mekong' }: Props) {
  const T = TXT[lang];
  const [reg, setReg] = useState<Region>(region);
  const [hx, setHx] = useState<number | null>(null);
  const [slr, setSlr] = useState(50);
  const [sub, setSub] = useState(1.1);
  const [year, setYear] = useState(2050);
  const n0 = (v: number) => fmtNum(lang, v, 0), n1 = (v: number) => fmtNum(lang, v, 1);
  const nm = (r: Region) => REGIONS[r].name[lang];

  if (view === 'curve') {
    const hs = Array.from({ length: 111 }, (_, i) => -1 + i * 0.1);
    const series: Series[] = (['mekong', 'red'] as Region[]).flatMap((r) => (['dtm', 'cop'] as Dem[]).map((d) => ({
      id: `${r}-${d}`, label: `${nm(r)} · ${T[d]}`, color: RC[r], dash: d === 'cop' ? '6 4' : undefined, width: d === 'dtm' ? 2.5 : 2,
      points: hs.map((h) => [h, share(r, d, h)] as [number, number]) })));
    const h = hx == null ? null : Math.round(hx * 10) / 10;
    return (
      <div className="viz">
        <p className="chart-title">{T.tCurve}</p>
        <LineChart title={T.tCurve} series={series} x={[-1, 10]} y={[0, 100]} xLabel={T.elev} yLabel={T.share}
          xTicks={[0, 1, 2, 3, 4, 5, 6, 8, 10]} yFormat={(v) => v.toFixed(0)} vline={h} onHover={setHx} height={320} />
        <Legend items={series} />
        <p className="readout num">{h == null ? T.hover : `${T.below} ${n1(h)} m: ` + (['mekong', 'red'] as Region[]).map((r) =>
          `${nm(r)} ${n0(share(r, 'dtm', h))} % (DeltaDTM) / ${n0(share(r, 'cop', h))} % (Copernicus)`).join(' · ')}</p>
      </div>
    );
  }

  const rise = (y: number) => (slr * (y - Y0)) / (Y1 - Y0) + sub * (y - Y0); // cm
  const years = Array.from({ length: (Y1 - Y0) / 5 + 1 }, (_, i) => Y0 + 5 * i);
  const series: Series[] = (['dtm', 'cop'] as Dem[]).map((d) => ({
    id: d, label: T[d], color: RC[reg], dash: d === 'cop' ? '6 4' : undefined, marker: d === 'dtm' ? 'circle' as const : 'square' as const, width: 2,
    points: years.map((y) => [y, share(reg, d, rise(y) / 100)] as [number, number]) }));
  const r = rise(year) / 100;
  return (
    <div className="viz">
      <div className="controls">
        <Pills label={T.region} value={reg} options={(['mekong', 'red'] as Region[]).map((x) => ({ v: x, label: nm(x) }))} onChange={setReg} />
        <Slider label={T.slr} value={slr} min={0} max={100} step={5} fmt={n0} onChange={setSlr} />
        <Slider label={T.sub} value={sub} min={0} max={4} step={0.1} fmt={n1} onChange={setSub} />
        <Slider label={T.at} value={year} min={Y0} max={Y1} step={5} fmt={String} onChange={setYear} />
      </div>
      <p className="chart-title">{T.tFut} · {nm(reg)}</p>
      <LineChart title={T.tFut} series={series} x={[Y0, Y1]} y={[0, 100]} xLabel={T.year} yLabel={T.share}
        yFormat={(v) => v.toFixed(0)} vline={year} height={280} />
      <Legend items={series} />
      <StatPanel title={`${year} · ${nm(reg)}`} rows={[
        { k: T.rise, v: `${n0(r * 100)} cm`, tone: 'accent' },
        ...(['dtm', 'cop'] as Dem[]).map((d) => ({ k: T[d], v: `${n0(share(reg, d, r))} % · ${n0(areaBelow(R[reg][d].below, r) / 1000)} ${T.ha}` })),
      ]} />
      <p className="readout">{T.ill}</p>
    </div>
  );
}
