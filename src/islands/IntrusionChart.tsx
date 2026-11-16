import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { Key } from './VizUi';

type Bi = { vi: string; en: string };
/** One published 4 g/L intrusion length (or range) with its date and source; `peak` = season maximum, else a mid-season value. */
type Bar = { season: string; lo: number; hi: number; peak: boolean; when: Bi; src: string };
type Group = { area: Bi; bars: Bar[]; dots?: { label: string; km: number }[] };

// Every number is quoted in the chapter's references; see scripts/salinity_numbers.ts header for the list.
const DATA: Group[] = [
  { area: { vi: 'Sông Vàm Cỏ Tây', en: 'Vam Co Tay River' }, bars: [
    { season: '2015–16', lo: 135, hi: 135, peak: true, when: { vi: 'cuối 3/2016', en: 'late Mar 2016' }, src: 'Nguyễn Ngọc Anh 2017' },
    { season: '2019–20', lo: 130, hi: 130, peak: true, when: { vi: '5/2020', en: 'May 2020' }, src: 'Tổng cục Thủy lợi, 20/6/2020' },
    { season: '2023–24', lo: 60, hi: 64, peak: false, when: { vi: '8–14/2/2024 (Vàm Cỏ)', en: '8–14 Feb 2024 (Vam Co)' }, src: 'Cục Thủy lợi, 23/2/2024' },
  ] },
  { area: { vi: 'Các cửa sông Cửu Long', en: 'Mekong (Cuu Long) estuaries' }, dots: [
    { label: 'Tiền', km: 79 }, { label: 'Hàm Luông', km: 78 }, { label: 'Cổ Chiên', km: 81 }, { label: 'Hậu', km: 70 },
  ], bars: [
    { season: '2015–16', lo: 70, hi: 81, peak: true, when: { vi: 'cuối 3/2016', en: 'late Mar 2016' }, src: 'Nguyễn Ngọc Anh 2017' },
    { season: '2019–20', lo: 45, hi: 66, peak: false, when: { vi: '6–13/1/2020', en: '6–13 Jan 2020' }, src: 'Bộ NN-PTNT 2020' },
    { season: '2023–24', lo: 40, hi: 66, peak: true, when: { vi: '8–13/3/2024, toàn vùng', en: '8–13 Mar 2024, delta-wide' }, src: 'Đài KTTV Nam Bộ, 22/3/2024' },
  ] },
];
const COLORS: Record<string, string> = { '2015–16': '#d55e00', '2019–20': '#e69f00', '2023–24': '#0072b2' };

const TXT = {
  vi: { axis: 'Khoảng cách từ cửa sông (km)', peak: 'đỉnh mùa', mid: 'giữa mùa, chưa phải đỉnh',     title: 'Chiều dài xâm nhập ranh mặn 4 g/L theo các nguồn công bố', table: 'Bảng số liệu', area: 'Khu vực', season: 'Mùa khô', km: 'km', when: 'Thời điểm', src: 'Nguồn' },
  en: { axis: 'Distance from the river mouth (km)', peak: 'season peak', mid: 'mid-season, not the peak',     title: 'Published 4 g/L intrusion lengths', table: 'Data table', area: 'Area', season: 'Dry season', km: 'km', when: 'When', src: 'Source' },
};

const ML = 10, MR = 16, ROW = 32, KM = 150;

/** Range bars of published 4 g/L intrusion lengths per area and dry season; dashed hollow bars = mid-season values. */
export default function IntrusionChart({ lang }: { lang: Lang }) {
  const T = TXT[lang];
  // Track the rendered width so text stays at true pixel size (same approach as LineChart).
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sx = (km: number) => ML + (km / KM) * (W - ML - MR);
  let y = 0;
  const rows = DATA.map((g) => {
    const top = y; y += 24 + g.bars.length * ROW + (g.dots ? (W < 480 ? 48 : 34) : 0) + 8;
    return { g, top };
  });
  const H = y + 34;
  const ticks = W < 480 ? [0, 50, 100, 150] : [0, 25, 50, 75, 100, 125, 150];
  const fmtR = (b: Bar) => (b.lo === b.hi ? `${b.lo}` : `${b.lo}–${b.hi}`);

  return (
    <div ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={T.title}>
        <title>{T.title}</title>
        <g className="grid">{ticks.map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={0} y2={H - 34} />)}</g>
        {rows.map(({ g, top }) => (
          <g key={g.area.en}>
            <text x={ML} y={top + 15} style={{ fontSize: 13, fontWeight: 600 }} fill="currentColor">{g.area[lang]}</text>
            {g.bars.map((b, i) => {
              const yy = top + 24 + i * ROW, c = COLORS[b.season];
              const one = b.lo === b.hi;
              return (
                <g key={b.season}>
                  <text x={ML} y={yy + 10} style={{ fontSize: 11 }} fill="currentColor">{b.season}: {fmtR(b)} km · {b.when[lang]}</text>
                  <rect x={sx(b.lo) - (one ? 2 : 0)} y={yy + 15} width={one ? 4 : Math.max(4, sx(b.hi) - sx(b.lo))} height={11} rx={2}
                    fill={b.peak ? c : 'none'} stroke={c} strokeWidth={2} strokeDasharray={b.peak ? undefined : '4 2'} />
                </g>
              );
            })}
            {g.dots && (() => {
              const yy = top + 24 + g.bars.length * ROW + 6;
              return (
                <g>
                  {g.dots.map((d) => <circle key={d.label} cx={sx(d.km)} cy={yy} r={3.5} fill={COLORS['2015–16']} />)}
                  {(W < 480 ? [g.dots.slice(0, 2), g.dots.slice(2)] : [g.dots]).map((part, k) => (
                    <text key={k} x={ML} y={yy + 20 + k * 14} style={{ fontSize: 11 }} fill="currentColor">
                      {k === 0 ? '● 2016: ' : ''}{part.map((d) => `${d.label} ${d.km} km`).join(' · ')}
                    </text>
                  ))}
                </g>
              );
            })()}
          </g>
        ))}
        {ticks.map((t) => <text key={t} x={sx(t)} y={H - 18} textAnchor="middle" style={{ fontSize: 11 }} fill="currentColor">{t}</text>)}
        <text x={W / 2} y={H - 3} textAnchor="middle" style={{ fontSize: 11 }} fill="currentColor">{T.axis}</text>
      </svg>
      <div className="legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.85rem' }}>
        {Object.entries(COLORS).map(([s, c]) => <Key key={s} color={c}>{s}</Key>)}
        <Key color="currentColor">{T.peak}</Key>
        <Key color="currentColor" hollow>{T.mid}</Key>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary>{T.table}</summary>
        <div className="table-wrap"><table>
          <thead><tr><th>{T.area}</th><th>{T.season}</th><th>{T.km}</th><th>{T.when}</th><th>{T.src}</th></tr></thead>
          <tbody>{DATA.flatMap((g) => g.bars.map((b) => (
            <tr key={g.area.en + b.season}><td>{g.area[lang]}</td><td>{b.season}</td><td>{fmtR(b)}{b.peak ? '' : ' *'}</td><td>{b.when[lang]}</td><td>{b.src}</td></tr>
          )))}</tbody>
        </table></div>
        <p className="muted" style={{ fontSize: '0.8rem' }}>* {T.mid}</p>
      </details>
    </div>
  );
}
