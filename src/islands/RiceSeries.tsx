import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import angiang from '../../public/data/rice-series-angiang.json';
import namdinh from '../../public/data/rice-series-namdinh.json';
import LineChart, { Legend, type Series, type Span } from './LineChart';
import { Pills } from './VizUi';

type Site = 'angiang' | 'namdinh';
type S2 = { d: string; ndvi: number; evi: number; lswi: number; clear: number };
type S1 = { d: string; vh: number; vv: number };
const DATA = { angiang, namdinh } as Record<Site, { s2: S2[]; s1: S1[]; bbox: number[] }>;

const DAY = 86_400_000;
const GAP = 40 * DAY; // never connect points across longer gaps (cloud or missing passes)
const X0 = Date.UTC(2023, 8, 1), X1 = Date.UTC(2025, 0, 1);
const TICKS = Array.from({ length: 6 }, (_, i) => Date.UTC(2023, 8 + i * 3, 1));
const t = (d: string) => Date.parse(d);

// Stages read off these two series by the author (not field records): start = first low-VH / low-NDVI date, end = harvest drop.
type Stage = [string, string, { vi: string; en: string }];
const STAGES: Record<Site, Stage[]> = {
  angiang: [
    ['2023-09-14', '2023-11-25', { vi: 'Lũ', en: 'Flood' }],
    ['2023-12-07', '2024-03-15', { vi: 'Đông Xuân', en: 'Winter–spring' }],
    ['2024-04-05', '2024-08-15', { vi: 'Hè Thu', en: 'Summer–autumn' }],
    ['2024-09-08', '2024-11-19', { vi: 'Lũ', en: 'Flood' }],
  ],
  namdinh: [
    ['2023-09-01', '2023-10-30', { vi: 'Mùa 2023', en: 'Main 2023' }],
    ['2024-01-16', '2024-06-13', { vi: 'Xuân', en: 'Spring' }],
    ['2024-07-02', '2024-10-26', { vi: 'Mùa', en: 'Main season' }],
  ],
};

const C = { ndvi: '#009E73', evi: '#E69F00', lswi: '#0072B2', vh: '#D55E00', vv: '#56B4E9' }; // Okabe-Ito

const TXT = {
  vi: { site: 'Ruộng', angiang: 'An Giang (2 vụ + lũ)', namdinh: 'Nam Định (2 vụ)', opt: 'Chỉ số quang học Sentinel-2', sar: 'Tán xạ ngược Sentinel-1',
    x: 'Thời gian', yo: 'Giá trị chỉ số', ys: 'σ⁰ (dB)', hover: 'Di chuột trên biểu đồ để đọc số liệu.', table: 'Bảng số liệu', date: 'Ngày', clear: 'không mây',
    s2none: 'không có ảnh S2 trong ±6 ngày', s1none: 'không có ảnh S1 trong ±6 ngày' },
  en: { site: 'Field', angiang: 'An Giang (2 crops + flood)', namdinh: 'Nam Dinh (2 crops)', opt: 'Sentinel-2 optical indices', sar: 'Sentinel-1 backscatter',
    x: 'Date', yo: 'Index value', ys: 'σ⁰ (dB)', hover: 'Hover a chart to read the values.', table: 'Data table', date: 'Date', clear: 'clear',
    s2none: 'no S2 image within ±6 days', s1none: 'no S1 image within ±6 days' },
};

const nearest = <T extends { d: string }>(xs: T[], x: number): T | null => {
  const best = xs.reduce((a, b) => (Math.abs(t(b.d) - x) < Math.abs(t(a.d) - x) ? b : a));
  return Math.abs(t(best.d) - x) <= 6 * DAY ? best : null;
};

/** S2 NDVI/EVI/LSWI and S1 VH/VV of one 500 m rice box on a shared time axis, with the author's reading of the crop stages. */
export default function RiceSeries({ lang }: { lang: Lang }) {
  const T = TXT[lang];
  const [site, setSite] = useState<Site>('angiang');
  const [hx, setHx] = useState<number | null>(null);
  const d = DATA[site];
  const loc = lang === 'vi' ? 'vi-VN' : 'en-US';
  const fmtTick = (v: number) => new Date(v).toLocaleDateString(loc, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const nf = (v: number, k = 2) => v.toLocaleString(loc, { minimumFractionDigits: k, maximumFractionDigits: k });
  const spans: Span[] = STAGES[site].map(([a, b, l]) => ({ x0: t(a), x1: t(b), label: l[lang] }));

  const opt: Series[] = [
    { id: 'ndvi', label: 'NDVI', color: C.ndvi, marker: 'circle', maxGap: GAP, points: d.s2.map((p) => [t(p.d), p.ndvi]) },
    { id: 'evi', label: 'EVI', color: C.evi, marker: 'square', dash: '6 3', maxGap: GAP, points: d.s2.map((p) => [t(p.d), p.evi]) },
    { id: 'lswi', label: 'LSWI', color: C.lswi, marker: 'triangle', dash: '2 3', maxGap: GAP, points: d.s2.map((p) => [t(p.d), p.lswi]) },
  ];
  const sar: Series[] = [
    { id: 'vh', label: 'VH', color: C.vh, marker: 'diamond', maxGap: GAP, points: d.s1.map((p) => [t(p.d), p.vh]) },
    { id: 'vv', label: 'VV', color: C.vv, marker: 'circle', dash: '6 3', maxGap: GAP, points: d.s1.map((p) => [t(p.d), p.vv]) },
  ];
  const n2 = hx == null ? null : nearest(d.s2, hx);
  const n1 = hx == null ? null : nearest(d.s1, hx);
  const day = (x: number) => new Date(x).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const common = { x: [X0, X1] as [number, number], xLabel: T.x, xTicks: TICKS, xFormat: fmtTick, height: 240, vline: hx, onHover: setHx, spans };

  return (
    <div className="viz">
      <div className="controls">
        <Pills label={T.site} value={site} onChange={(s) => { setSite(s); setHx(null); }}
          options={[{ v: 'angiang', label: T.angiang }, { v: 'namdinh', label: T.namdinh }]} />
      </div>
      <p className="mono-label" style={{ margin: 0 }}>{T.opt}</p>
      <LineChart title={`${T.opt} — ${T[site]}`} y={[-0.6, 1]} yLabel={T.yo} yFormat={(v) => nf(v, 1)} series={opt} {...common} />
      <Legend items={opt} />
      <p className="mono-label" style={{ margin: 0 }}>{T.sar}</p>
      <LineChart title={`${T.sar} — ${T[site]}`} y={[-32, -4]} yLabel={T.ys} yFormat={(v) => nf(v, 0)} series={sar} {...common} />
      <Legend items={sar} />
      <p className="readout num" aria-live="off">
        {hx == null ? T.hover : `${day(hx)} · ${n2 ? `NDVI ${nf(n2.ndvi)} · EVI ${nf(n2.evi)} · LSWI ${nf(n2.lswi)}` : T.s2none} · ${n1 ? `VH ${nf(n1.vh, 1)} dB · VV ${nf(n1.vv, 1)} dB` : T.s1none}`}
      </p>
      <details>
        <summary>{T.table}</summary>
        <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
          <table className="num">
            <thead><tr><th>{T.date}</th><th>NDVI</th><th>EVI</th><th>LSWI</th><th>% {T.clear}</th></tr></thead>
            <tbody>{d.s2.map((p) => <tr key={p.d}><td>{p.d}</td><td>{nf(p.ndvi)}</td><td>{nf(p.evi)}</td><td>{nf(p.lswi)}</td><td>{Math.round(p.clear * 100)}</td></tr>)}</tbody>
          </table>
          <table className="num">
            <thead><tr><th>{T.date}</th><th>VH (dB)</th><th>VV (dB)</th></tr></thead>
            <tbody>{d.s1.map((p) => <tr key={p.d}><td>{p.d}</td><td>{nf(p.vh, 1)}</td><td>{nf(p.vv, 1)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
