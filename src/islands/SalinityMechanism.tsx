import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import { Pills, Slider, StatPanel } from './VizUi';

// Illustrative scaling, NOT a forecast (labelled in the figure):
//   L / L0 = (Q / Q0)^(-1/3) * (H / H0) * tideFactor
// Q^(-1/3): classic exchange-flow theory for partially mixed estuaries (MacCready & Geyer 2010);
// observed exponents are often weaker (-1/7 in San Francisco Bay, Monismith et al. 2002).
// Linear depth factor and the +/-15 % tide factor are illustrative choices.
const Q_EXP = -1 / 3;
const H0 = 15; // m, nominal channel depth (illustrative)
const TIDE = { neap: 0.85, mean: 1, spring: 1.15 } as const;
type Tide = keyof typeof TIDE;

export const intrusionRatio = (qPct: number, slrCm: number, bedM: number, tide: Tide): number =>
  Math.pow(qPct / 100, Q_EXP) * ((H0 + slrCm / 100 + bedM) / H0) * TIDE[tide];

const TXT = {
  vi: { q: 'Lưu lượng mùa khô (% so với bình thường)', slr: 'Nước biển dâng', bed: 'Hạ thấp đáy sông', tide: 'Triều',
    neap: 'Triều kém', mean: 'Trung bình', spring: 'Triều cường', sea: 'Biển', river: 'Sông', fresh: 'nước ngọt', salt: 'nước mặn',
    base: 'Mốc: lưu lượng 100 %, không dâng, không hạ đáy, triều trung bình', ratio: 'Chiều dài xâm nhập so với mốc',
    title: 'Mô hình minh họa', note: 'Minh họa định tính, không phải dự báo, không cho ra km.', mouth: 'cửa sông', reach: 'ranh mặn' },
  en: { q: 'Dry-season discharge (% of normal)', slr: 'Sea-level rise', bed: 'Riverbed lowering', tide: 'Tide',
    neap: 'Neap', mean: 'Mean', spring: 'Spring', sea: 'Sea', river: 'River', fresh: 'fresh water', salt: 'saltwater',
    base: 'Baseline: 100 % discharge, no sea-level rise, no bed lowering, mean tide', ratio: 'Intrusion length vs baseline',
    title: 'Illustrative model', note: 'Qualitative illustration, not a forecast; it gives no km.', mouth: 'river mouth', reach: 'salt limit' },
};

const Hs = 200, X0 = 70;

/** Longitudinal section of an estuary: how discharge, tide, sea level and bed depth move the salt limit (illustrative). */
export default function SalinityMechanism({ lang }: { lang: Lang }) {
  const T = TXT[lang];
  // Track the rendered width so labels keep their pixel size on phones (as in LineChart).
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const XMAX = W - 20;
  const [q, setQ] = useState(100);
  const [slr, setSlr] = useState(0);
  const [bed, setBed] = useState(0);
  const [tide, setTide] = useState<Tide>('mean');
  const r = intrusionRatio(q, slr, bed, tide);
  const base = 0.4 * (XMAX - X0); // baseline intrusion drawn at 40 % of the reach
  const xs = Math.min(XMAX, X0 + base * r);
  const surf = 60 - slr * 0.12 - (tide === 'spring' ? 6 : tide === 'neap' ? -6 : 0);
  const bedY = 160 + bed * 6;
  const pct = (r - 1) * 100;
  const fmt = (v: number, d = 0) => fmtNum(lang, v, d);

  return (
    <div className="viz two chart-wide">
      <div className="controls" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <Slider label={T.q} value={q} min={40} max={160} step={5} fmt={(v) => `${v} %`} onChange={setQ} />
        <Slider label={T.slr} value={slr} min={0} max={100} step={10} fmt={(v) => `${v} cm`} onChange={setSlr} />
        <Slider label={T.bed} value={bed} min={0} max={4} step={0.5} fmt={(v) => `${fmt(v, 1)} m`} onChange={setBed} />
        <Pills label={T.tide} value={tide} onChange={setTide}
          options={(['neap', 'mean', 'spring'] as Tide[]).map((v) => ({ v, label: T[v] }))} />
        <StatPanel title={T.title} rows={[
          { k: T.ratio, v: `${pct >= 0 ? '+' : ''}${fmt(pct)} %`, tone: pct > 0.5 ? 'bad' : pct < -0.5 ? 'ok' : 'muted' },
        ]}>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '6px 0 0' }}>{T.base}. {T.note}</p>
        </StatPanel>
      </div>
      <div ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${Hs + 30}`} width="100%" role="img"
        aria-label={`${T.ratio}: ${fmt(pct)} %`}>
        <defs>
          <linearGradient id="sal-mix" x1="0" x2="1">
            <stop offset="0" stopColor="#0072b2" stopOpacity="0.85" />
            <stop offset="1" stopColor="#56b4e9" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {/* sea */}
        <rect x={0} y={surf} width={X0} height={bedY - surf + 20} fill="#0072b2" opacity={0.85} />
        {/* fresh river */}
        <rect x={X0} y={surf} width={XMAX - X0} height={bedY - surf} fill="#56b4e9" opacity={0.25} />
        {/* salt tongue along the bed, thinning upstream */}
        <path d={`M${X0},${surf + 4} L${xs},${bedY - 6} L${xs},${bedY} L${X0},${bedY} Z`} fill="url(#sal-mix)" />
        {/* bed */}
        <path d={`M0,${bedY + 20} L${X0},${bedY} L${XMAX},${bedY} L${W},${bedY - 8} L${W},${Hs + 30} L0,${Hs + 30} Z`} fill="currentColor" opacity={0.18} />
        <line x1={0} x2={W} y1={surf} y2={surf} stroke="currentColor" strokeDasharray="4 4" opacity={0.6} />
        {/* river discharge arrow, thickness ~ Q */}
        <line x1={XMAX - 10} x2={XMAX - Math.min(100, W * 0.18)} y1={surf + 22} y2={surf + 22} stroke="currentColor" strokeWidth={1 + q / 25} markerEnd="url(#sal-arrow)" opacity={0.7} />
        <marker id="sal-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10Z" fill="currentColor" /></marker>
        <line x1={xs} x2={xs} y1={surf - 30} y2={bedY} stroke="#d55e00" strokeWidth={2} strokeDasharray="5 3" />
        <text x={xs} y={surf - 34} textAnchor="middle" style={{ fontSize: 12 }} fill="#d55e00">{T.reach}</text>
        <text x={X0 / 2} y={surf - 10} textAnchor="middle" style={{ fontSize: 12 }} fill="currentColor">{T.sea}</text>
        <text x={XMAX - 60} y={surf - 10} textAnchor="middle" style={{ fontSize: 12 }} fill="currentColor">← {T.river}</text>
        <text x={X0 + 6} y={bedY - 12} style={{ fontSize: 11 }} fill="currentColor">{T.salt}</text>
        <text x={XMAX - 8} y={bedY - 12} textAnchor="end" style={{ fontSize: 11 }} fill="currentColor">{T.fresh}</text>
        <text x={X0} y={Hs + 24} textAnchor="middle" style={{ fontSize: 11 }} fill="currentColor">{T.mouth}</text>
      </svg>
      </div>
    </div>
  );
}
