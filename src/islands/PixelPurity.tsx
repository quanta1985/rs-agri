import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import data from '../../public/data/data-purity.json';
import { REGIONS } from './layers';
import LineChart, { Legend, type Marker, type Series } from './LineChart';

/** Ch.2: share of "pure" cells (one WorldCover class >= 90 %) against cell size at the five sites (data-purity.json). */
const TXT = {
  vi: { title: 'Tỉ lệ ô thuần một lớp phủ theo kích thước ô', x: 'Kích thước ô (m, thang log)', y: '% ô thuần',
    hover: 'Di chuột trên biểu đồ để đọc số liệu.', table: 'Bảng số liệu (% ô thuần)', site: 'Điểm', crop: '% đất trồng trọt' },
  en: { title: 'Share of cells covered by a single land-cover class, by cell size', x: 'Cell size (m, log scale)', y: '% pure cells',
    hover: 'Hover the chart to read values.', table: 'Data table (% pure cells)', site: 'Site', crop: '% cropland' },
};
// Okabe-Ito data colours + marker shapes, one per site
const STYLE: Record<string, { color: string; marker: Marker; dash?: string }> = {
  namdinh: { color: '#0072B2', marker: 'circle' }, angiang: { color: '#E69F00', marker: 'square', dash: '6 3' },
  thapmuoi: { color: '#009E73', marker: 'triangle' }, bentre: { color: '#CC79A7', marker: 'diamond', dash: '2 3' },
  camau: { color: '#D55E00', marker: 'circle', dash: '8 3 2 3' },
};
const RES = data.res_m;
const SITES = Object.keys(data.sites) as (keyof typeof data.sites)[];
const SENSORS: [number, string][] = [[10, 'S2'], [30, 'Landsat'], [250, 'MODIS']];

export default function PixelPurity({ lang }: { lang: Lang }) {
  const T = TXT[lang];
  const [hx, setHx] = useState<number | null>(null);
  const series: Series[] = SITES.map((s) => ({
    id: s, label: REGIONS[s].name[lang], ...STYLE[s], width: 2,
    points: data.sites[s].pure.map((v, i) => [Math.log10(RES[i]), v * 100] as [number, number]),
  }));
  const pct = (v: number) => fmtNum(lang, v * 100, 0);
  const i = hx == null ? -1 : RES.map((r) => Math.abs(Math.log10(r) - hx)).reduce((b, d, k, a) => (d < a[b] ? k : b), 0);
  return (
    <div className="viz">
      <p className="chart-title">{T.title}</p>
      <LineChart title={T.title} series={series} x={[0.95, 2.75]} y={[0, 100]} xLabel={T.x} yLabel={T.y}
        xTicks={RES.map(Math.log10)} xFormat={(v) => String(Math.round(10 ** v))} yFormat={(v) => v.toFixed(0)}
        vline={i >= 0 ? Math.log10(RES[i]) : null} onHover={setHx} height={320}
        spans={SENSORS.map(([r, l]) => ({ x0: Math.log10(r) - 0.01, x1: Math.log10(r) + 0.01, label: l }))} />
      <Legend items={series} />
      <p className="readout num">
        {i >= 0 ? `${RES[i]} m: ` + SITES.map((s) => `${REGIONS[s].name[lang].split(' (')[0]} ${pct(data.sites[s].pure[i])} %`).join(' · ') : T.hover}
      </p>
      <details>
        <summary>{T.table}</summary>
        <div className="table-wrap"><table className="num">
          <thead><tr><th>{T.site}</th>{RES.map((r) => <th key={r}>{r} m</th>)}<th>{T.crop}</th></tr></thead>
          <tbody>{SITES.map((s) => (
            <tr key={s}><td>{REGIONS[s].name[lang]}</td>{data.sites[s].pure.map((v, k) => <td key={k}>{pct(v)}</td>)}<td>{pct(data.sites[s].cropland)}</td></tr>
          ))}</tbody>
        </table></div>
      </details>
    </div>
  );
}
