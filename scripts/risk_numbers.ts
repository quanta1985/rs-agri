// Recompute every Chapter 14 (risk) number quoted in the prose (same code as the RiskLab figure).
//   node scripts/risk_numbers.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeFrame, frameOf, pixelAreaHa, type LayerMeta, type Raw } from '../src/lib/layer.ts';
import { HIGH, composite, dominant, zoneTable } from '../src/lib/risk.ts';

type M = LayerMeta & { indicators?: Record<string, { vi: string; en: string }> };
const load = (id: string): { meta: M; data: Raw } => {
  const meta: M = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
  const b = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  return { meta, data: new Uint8Array(b.buffer, b.byteOffset, b.byteLength) };
};
const kha = (ha: number) => (ha / 1000).toFixed(0);
const pct = (x: number) => (100 * x).toFixed(1);

for (const region of ['mekong', 'red']) {
  const spi = load(`spi3-${region}`);
  console.log(`[14.2] ${region} spi3 layer mean per dry season ${spi.meta.times.join(' / ')}: ${spi.meta.stats.map((s) => (s.mean ?? NaN).toFixed(2)).join(' / ')}`);
  const { meta, data } = load(`risk-${region}`);
  const prov = load(`prov-${region}`);
  const names = meta.times;
  const steps = names.map((_, k) => decodeFrame(meta, frameOf(meta, data, k)));
  const rowHa = (r: number) => pixelAreaHa(meta, r);
  const run = (w: number[]) => {
    const idx = composite(steps, w);
    const dom = dominant(steps, w);
    const all = zoneTable(idx, dom, new Uint8Array(idx.length), meta.width, rowHa, 1, names.length)[0];
    const rows = zoneTable(idx, dom, prov.data, meta.width, rowHa, prov.meta.classes!.length, names.length);
    // area dominated by each indicator over the whole region
    const domHa = names.map(() => 0);
    for (let i = 0; i < dom.length; i++) if (dom[i] >= 0 && !Number.isNaN(idx[i])) domHa[dom[i]] += rowHa(Math.floor(i / meta.width));
    return { all, rows, domHa };
  };
  // indicator summaries (cropland cells)
  for (const [k, s] of steps.entries()) {
    let ha = 0, sum = 0, hi = 0, zero = 0;
    for (let i = 0; i < s.length; i++) {
      if (Number.isNaN(s[i])) continue;
      const a = rowHa(Math.floor(i / meta.width));
      ha += a; sum += a * s[i];
      if (s[i] >= HIGH) hi += a;
      if (s[i] === 0) zero += a;
    }
    console.log(`[14.2] ${region} ${names[k]}: cropland ${kha(ha)} kha, mean score ${(sum / ha).toFixed(1)}, >= ${HIGH}: ${pct(hi / ha)} %, = 0: ${pct(zero / ha)} %, p2-p98 ${meta.stats[k].p2}-${meta.stats[k].p98}`);
  }
  const label = (rows: ReturnType<typeof run>['rows']) => rows.slice().sort((a, b) => b.highShare - a.highShare)
    .map((r) => `${prov.meta.classes![r.zone].label.en} ${pct(r.highShare)} % (mean ${r.mean.toFixed(0)}, top ${r.top >= 0 ? names[r.top] : '-'}, ${kha(r.ha)} kha)`).join('; ');
  const presets: Record<string, number[]> = region === 'mekong'
    ? { equal: [1, 1, 1, 1], 'no rain': [1, 0, 1, 1], 'rain x3': [1, 3, 1, 1], 'flood x3': [3, 1, 1, 1], 'low x3': [1, 1, 1, 3] }
    : { equal: [1, 1], 'flood x3': [3, 1], 'low x3': [1, 3] };
  for (const [p, w] of Object.entries(presets)) {
    const r = run(w);
    console.log(`[14.3] ${region} weights ${p} (${w.join('/')}): mean ${r.all.mean.toFixed(1)}, high (>= ${HIGH}) ${pct(r.all.highShare)} % of ${kha(r.all.ha)} kha; dominant ` +
      names.map((n, k) => `${n} ${pct(r.domHa[k] / r.all.ha)} %`).join(', '));
    console.log(`[14.4] ${region} ${p} provinces by high share: ${label(r.rows)}`);
  }
}
