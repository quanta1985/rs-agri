import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import data from '../../public/data/landcover-stats.json';
import LineChart, { Legend, type Series } from './LineChart';
import { Pills } from './VizUi';

/**
 * Ch.3 (landcover-stats.json). view "classes": area of each shared class in WorldCover / Dynamic World / Esri (2021),
 * as a table-like bar chart; view "series": Esri cropland, trees, built-up and flooded vegetation per year 2017-2025.
 */
type Region = 'mekong' | 'red';
type Props = { lang: Lang; view: 'classes' | 'series' };
type RegionStats = { ha: Record<string, Record<string, number>>; esri_series: Record<string, Record<string, number>> };
const D = data as unknown as Record<Region, RegionStats> & { classes: Record<string, { vi: string; en: string }> };
const PRODUCTS: [string, string][] = [['wc', 'WorldCover'], ['dw', 'Dynamic World'], ['esri', 'Esri']];
// fixed class colours (shared legend of export_landcover.py) + marker shapes so colour is never the only cue
const CLS: Record<string, { color: string; marker: 'circle' | 'square' | 'triangle' | 'diamond'; dash?: string }> = {
  '3': { color: '#e49635', marker: 'circle' }, '2': { color: '#397d49', marker: 'square', dash: '6 3' },
  '4': { color: '#c4281b', marker: 'triangle' }, '6': { color: '#7a87c6', marker: 'diamond', dash: '2 3' },
};
// shared-legend colours of export_landcover.py for the bars
const BAR: Record<string, string> = { '1': '#419bdf', '2': '#397d49', '3': '#e49635', '4': '#c4281b', '5': '#c9c7a0', '6': '#7a87c6', '7': '#a59b8f' };
const TXT = {
  vi: { region: 'Vùng', mekong: 'ĐBSCL', red: 'ĐBSH', title: 'Diện tích mỗi lớp theo ba bản đồ, 2021', series: 'Diện tích theo bản đồ Esri từng năm',
    kha: 'nghìn ha', unit: 'Đơn vị: nghìn ha, ô 10 m.', year: 'Năm', cls: 'Lớp', table: 'Bảng số liệu (nghìn ha)' },
  en: { region: 'Region', mekong: 'Mekong', red: 'Red River', title: 'Area of each class in the three maps, 2021', series: 'Area per year on the Esri map',
    kha: 'thousand ha', unit: 'Unit: thousand ha, 10 m cells.', year: 'Year', cls: 'Class', table: 'Data table (thousand ha)' },
};

export default function LandcoverChart({ lang, view }: Props) {
  const T = TXT[lang];
  const [region, setRegion] = useState<Region>('mekong');
  const R = D[region];
  const k = (ha: number | undefined) => fmtNum(lang, (ha ?? 0) / 1000, 0);
  const pills = <div className="controls"><Pills label={T.region} value={region} onChange={setRegion} options={[{ v: 'mekong', label: T.mekong }, { v: 'red', label: T.red }]} /></div>;

  if (view === 'series') {
    const years = Object.keys(R.esri_series).map(Number).sort((a, b) => a - b);
    const series: Series[] = Object.keys(CLS).map((c) => ({
      id: c, label: D.classes[c][lang], ...CLS[c], width: 2, maxGap: 1.5,
      points: years.map((y) => [y, (R.esri_series[String(y)][c] ?? 0) / 1000] as [number, number]),
    }));
    const hi = Math.max(...series.flatMap((s) => s.points.map((p) => p[1])));
    return (
      <div className="viz">
        {pills}
        <p className="chart-title">{T.series}</p>
        <LineChart title={T.series} series={series} x={[years[0] - 0.3, years[years.length - 1] + 0.3]} y={[0, Math.ceil(hi / 500) * 500]}
          xLabel={T.year} yLabel={T.kha} xTicks={years} xFormat={(v) => String(Math.round(v))} yFormat={(v) => fmtNum(lang, v, 0)} height={300} />
        <Legend items={series} />
        <details><summary>{T.table}</summary><div className="table-wrap"><table className="num">
          <thead><tr><th>{T.year}</th>{series.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
          <tbody>{years.map((y) => <tr key={y}><td>{y}</td>{series.map((s) => <td key={s.id}>{k(R.esri_series[String(y)][s.id])}</td>)}</tr>)}</tbody>
        </table></div></details>
      </div>
    );
  }

  const classes = Object.keys(D.classes);
  const max = Math.max(...PRODUCTS.flatMap(([p]) => classes.map((c) => R.ha[p][c] ?? 0)));
  return (
    <div className="viz">
      {pills}
      <div className="table-wrap"><table className="num lc-bars" aria-label={T.title}>
        <thead><tr><th>{T.cls}</th>{PRODUCTS.map(([p, name]) => <th key={p}>{name}</th>)}</tr></thead>
        <tbody>{classes.map((c) => (
          <tr key={c}>
            <th scope="row" style={{ textAlign: 'left' }}>{D.classes[c][lang]}</th>
            {PRODUCTS.map(([p]) => (
              <td key={p}>
                <span style={{ display: 'inline-block', verticalAlign: 'middle', height: 10, marginRight: 6, borderRadius: 2,
                  width: `${Math.round((60 * (R.ha[p][c] ?? 0)) / max)}px`, background: BAR[c] }} aria-hidden="true" />
                {k(R.ha[p][c])}
              </td>
            ))}
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted" style={{ fontSize: '0.8rem' }}>{T.unit}</p>
    </div>
  );
}
