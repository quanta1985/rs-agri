import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import { SEED, draw, mulberry32, populationFromLayers, simulate, type Method } from '../lib/sampling';
import { useLayer } from './layers';
import { Pills, Slider, StatPanel } from './VizUi';

/**
 * Ch.5: sampling a real map. y = rice area of each ~250 m cell on the 2024 rice-season map (it plays the role of the
 * ground truth), x = cropland area of the cell on Esri LULC 2021 (auxiliary, known everywhere), strata from x.
 * Same estimators and seeds as scripts/area-stats_numbers.ts.
 */
type Region = 'mekong' | 'red';
type Props = { lang: Lang; label: string };
const REPS = 500;
const STRATA_RGB = [[214, 214, 214], [160, 160, 160], [96, 96, 96]];

const TXT = {
  vi: { region: 'Vùng', mekong: 'ĐBSCL', red: 'ĐBSH', method: 'Cách lấy mẫu', n: 'Cỡ mẫu (ô)', one: 'Lấy một mẫu', rep: `Lặp ${REPS} lần`,
    srs: 'Ngẫu nhiên đơn', prop: 'Phân tầng tỉ lệ', neyman: 'Phân tầng Neyman', reg: 'Hồi quy',
    truth: 'Diện tích lúa "thật" (bản đồ 2024)', est: 'Ước lượng từ mẫu này', ci: 'Khoảng tin cậy 95 %', sd: `Độ lệch chuẩn của ${REPS} ước lượng`,
    cv: 'Hệ số biến động', eff: 'Hiệu quả so với ngẫu nhiên đơn', kha: 'nghìn ha', loading: 'Đang tải bản đồ…', error: 'Không tải được dữ liệu',
    hist: `Phân bố ${REPS} ước lượng (vạch đứng = giá trị thật)`, map: 'Ô được chọn (chấm xanh lục = có lúa, chấm cam = không lúa) trên nền tầng: xám nhạt < 25 %, vừa 25–75 %, đậm ≥ 75 % đất trồng trọt (Esri 2021)',
    hint: 'Bấm "Lặp" để thấy sai số thật của cách lấy mẫu.', times: 'lần' },
  en: { region: 'Region', mekong: 'Mekong', red: 'Red River', method: 'Design', n: 'Sample size (cells)', one: 'Draw one sample', rep: `Repeat ${REPS}×`,
    srs: 'Simple random', prop: 'Stratified (proportional)', neyman: 'Stratified (Neyman)', reg: 'Regression',
    truth: '"True" rice area (2024 map)', est: 'Estimate from this sample', ci: '95 % confidence interval', sd: `Std. deviation of ${REPS} estimates`,
    cv: 'Coefficient of variation', eff: 'Efficiency relative to simple random', kha: 'thousand ha', loading: 'Loading the maps…', error: 'Data failed to load',
    hist: `Distribution of ${REPS} estimates (vertical line = true value)`, map: 'Sampled cells (green dot = rice, orange dot = no rice) over the strata: light < 25 %, mid 25–75 %, dark ≥ 75 % cropland (Esri 2021)',
    hint: 'Press "Repeat" to see the real error of the design.', times: 'times' },
};

export default function SamplingLab({ lang, label }: Props) {
  const T = TXT[lang];
  const [region, setRegion] = useState<Region>('mekong');
  const [method, setMethod] = useState<Method>('srs');
  const [n, setN] = useState(200);
  const [seed, setSeed] = useState(SEED);
  const [rep, setRep] = useState<{ key: string; totals: number[]; sd: number; srsSd: number } | null>(null);
  const rice = useLayer(`rice-seasons-${region}`);
  const crop = useLayer(`lc-cropfrac-${region}`);
  const pop = useMemo(() => (rice.layer && crop.layer ? populationFromLayers(rice.layer, crop.layer) : null), [rice.layer, crop.layer]);
  const one = useMemo(() => (pop ? draw(pop.p, pop.q, method, n, mulberry32(seed)) : null), [pop, method, n, seed]);
  const key = `${region}|${method}|${n}`;
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !pop || !one) return;
    cv.width = pop.width;
    cv.height = pop.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(pop.width, pop.height);
    pop.cell.forEach((i, k) => {
      const rgb = STRATA_RGB[pop.p.stratum[k]];
      img.data.set([rgb[0], rgb[1], rgb[2], 255], 4 * i);
    });
    ctx.putImageData(img, 0, 0);
    const r = Math.max(3, pop.width / 180);
    for (const k of one.idx) {
      const i = pop.cell[k];
      ctx.beginPath();
      ctx.arc(i % pop.width, Math.floor(i / pop.width), r, 0, 2 * Math.PI);
      ctx.fillStyle = pop.p.y[k] > 0 ? '#009e73' : '#d55e00';
      ctx.fill();
    }
  }, [pop, one]);

  const repeat = () => {
    if (!pop) return;
    const s = simulate(pop.p, pop.q, method, n, REPS, SEED);
    const srsSd = method === 'srs' ? s.sd : simulate(pop.p, pop.q, 'srs', n, REPS, SEED).sd;
    setRep({ key, totals: s.totals, sd: s.sd, srsSd });
  };

  const err = rice.error || crop.error;
  const kha = (ha: number, d = 0) => fmtNum(lang, ha / 1000, d);
  const cur = rep && rep.key === key ? rep : null;
  const truth = pop?.q.yTotal ?? 0;

  return (
    <div className="viz two" role="group" aria-label={label}>
      <div>
        <div className="controls">
          <Pills label={T.region} value={region} onChange={(v) => { setRegion(v); setRep(null); }} options={[{ v: 'mekong', label: T.mekong }, { v: 'red', label: T.red }]} />
          <Pills label={T.method} value={method} onChange={setMethod} options={(['srs', 'prop', 'neyman', 'reg'] as Method[]).map((v) => ({ v, label: T[v] }))} />
          <Slider label={T.n} value={n} min={30} max={1000} step={10} fmt={(v) => String(v)} onChange={setN} />
          <button type="button" className="btn" onClick={() => setSeed((s) => s + 1)}>{T.one}</button>
          <button type="button" className="btn primary" onClick={repeat} disabled={!pop}>{T.rep}</button>
        </div>
        {pop && <canvas ref={canvas} aria-label={T.map} style={{ aspectRatio: `${pop.width} / ${pop.height}` }} />}
        <p className="muted" style={{ fontSize: '0.8rem' }}>{T.map}</p>
      </div>
      {err ? <p className="status">{T.error}</p> : !pop || !one ? <p className="status">{T.loading}</p> : (
        <div>
          <StatPanel rows={[
            { k: T.truth, v: `${kha(truth)} ${T.kha}` },
            { k: T.est, v: `${kha(one.total)} ${T.kha}`, tone: 'accent' },
            { k: T.ci, v: `± ${kha(1.96 * one.se)} ${T.kha}` },
            ...(cur ? [
              { k: T.sd, v: `${kha(cur.sd, 1)} ${T.kha}` },
              { k: T.cv, v: `${fmtNum(lang, (100 * cur.sd) / truth, 1)} %` },
              { k: T.eff, v: `${fmtNum(lang, (cur.srsSd / cur.sd) ** 2, 2)} ×`, tone: 'ok' as const },
            ] : []),
          ]} />
          {cur ? <Histogram values={cur.totals} truth={truth} title={T.hist} fmt={(v) => kha(v)} /> : <p className="readout">{T.hint}</p>}
        </div>
      )}
    </div>
  );
}

/** Histogram of repeated estimates with the true value marked. */
function Histogram({ values, truth, title, fmt }: { values: number[]; truth: number; title: string; fmt: (v: number) => string }) {
  const W = 360, H = 170, B = 24, pad = 8;
  const lo = Math.min(truth, ...values), hi = Math.max(truth, ...values);
  const span = hi - lo || 1;
  const bins = new Array(B).fill(0);
  for (const v of values) bins[Math.min(B - 1, Math.floor(((v - lo) / span) * B))]++;
  const top = Math.max(...bins);
  const sx = (v: number) => pad + ((v - lo) / span) * (W - 2 * pad);
  const bw = (W - 2 * pad) / B;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto' }}>
        {bins.map((c, k) => (
          <rect key={k} x={pad + k * bw + 0.5} y={H - (c / top) * (H - 10)} width={bw - 1} height={(c / top) * (H - 10)} fill="var(--chart-1)" />
        ))}
        <line x1={sx(truth)} x2={sx(truth)} y1={0} y2={H} stroke="var(--fg)" strokeWidth={2} />
        <text x={pad} y={H + 16} fontSize={11} fill="var(--fg-muted)">{fmt(lo)}</text>
        <text x={W - pad} y={H + 16} fontSize={11} fill="var(--fg-muted)" textAnchor="end">{fmt(hi)}</text>
      </svg>
      <figcaption className="muted" style={{ fontSize: '0.8rem' }}>{title}</figcaption>
    </figure>
  );
}
