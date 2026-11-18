// Recompute every Chapter 5 (area-stats) number quoted in the prose (same code and seeds as the SamplingLab figure).
//   node scripts/area-stats_numbers.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { LayerMeta, Raw } from '../src/lib/layer.ts';
import { SEED, STRATA_CUTS, allocate, populationFromLayers, simulate, sizeForCv, type Method } from '../src/lib/sampling.ts';

const load = (id: string): { meta: LayerMeta; data: Raw } => {
  const meta: LayerMeta = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
  const b = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  const data = meta.dtype === 'uint8' ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  return { meta, data };
};
const kha = (ha: number, d = 1) => (ha / 1000).toFixed(d);
const REPS = 500;
const METHODS: Method[] = ['srs', 'prop', 'neyman', 'reg'];

for (const region of ['mekong', 'red']) {
  const { p, q } = populationFromLayers(load(`rice-seasons-${region}`), load(`lc-cropfrac-${region}`));
  const cellsRice = p.y.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
  console.log(`[5.3] ${region}: ${q.N} cells, rice cells ${cellsRice} (${(100 * cellsRice / q.N).toFixed(1)} %), rice area ${kha(q.yTotal, 0)} kha, Esri cropland (aux x) ${kha(q.xTotal, 0)} kha`);
  console.log(`[5.2] ${region}: strata (< ${STRATA_CUTS[0]} / ${STRATA_CUTS[0]}-${STRATA_CUTS[1]} / >= ${STRATA_CUTS[1]} % cropland) cells ${q.Nh.join(' / ')}, rice share ` +
    q.members.map((m) => (100 * m.filter((i) => p.y[i] > 0).length / m.length).toFixed(1)).join(' / ') + ' %');
  // correlation y-x
  const my = q.yTotal / q.N, mx = q.xTotal / q.N;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < q.N; i++) { sxy += (p.y[i] - my) * (p.x[i] - mx); sxx += (p.x[i] - mx) ** 2; syy += (p.y[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy);
  console.log(`[5.4] ${region}: r(rice, Esri cropland) per cell = ${r.toFixed(3)}, regression gain 1/(1-r^2) = ${(1 / (1 - r * r)).toFixed(2)}`);
  for (const n of [100, 200, 500]) {
    const res = Object.fromEntries(METHODS.map((m) => [m, simulate(p, q, m, n, REPS, SEED)]));
    const srs = res.srs.sd;
    console.log(`[5.3] ${region} n=${n}: ` + METHODS.map((m) => `${m} mean ${kha(res[m].mean, 0)} sd ${kha(res[m].sd)} kha (CV ${(100 * res[m].sd / q.yTotal).toFixed(1)} %, mean SE ${kha(res[m].meanSe)}, eff ${(srs / res[m].sd) ** 2 > 0 ? ((srs / res[m].sd) ** 2).toFixed(2) : '-'})`).join('; '));
    if (n === 200) console.log(`[5.3] ${region} n=200 allocation prop ${allocate(q.Nh, 200).join('/')} neyman ${allocate(q.Nh, 200, q.Sh).join('/')}`);
  }
  // SRS size for a 5 % / 2 % CV of the total
  const sd = Math.sqrt(syy / (q.N - 1));
  for (const cv of [0.05, 0.02]) console.log(`[5.5] ${region}: SRS cells for CV ${cv * 100} % = ${sizeForCv(q.N, my, sd, cv)}`);
}
