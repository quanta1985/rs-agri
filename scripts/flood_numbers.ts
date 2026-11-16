// Recompute every Chapter 8 (flood) number quoted in the prose, with the same code the figures run.
//   node scripts/flood_numbers.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { areaWhere, decodeFrame, frameOf, pixelAreaHa, type LayerMeta, type Raw } from '../src/lib/layer.ts';
import { otsu } from '../src/lib/raster.ts';

const ARR = { uint8: Uint8Array, uint16: Uint16Array, int16: Int16Array };
const load = (id: string) => {
  const meta = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8')) as LayerMeta;
  const buf = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  const data = new ARR[meta.dtype](buf.buffer, buf.byteOffset, buf.byteLength / ARR[meta.dtype].BYTES_PER_ELEMENT) as Raw;
  return { meta, frame: (t: number) => decodeFrame(meta, frameOf(meta, data, t)) };
};
const k = (ha: number) => Math.round(ha / 1000); // thousand ha
const pct = (a: number, b: number) => ((100 * a) / b).toFixed(1);

// 8.1 JRC GSW occurrence and 2021 seasonality, both deltas
for (const r of ['red', 'mekong']) {
  const occ = load(`flood-gsw-${r}`), sea = load(`flood-gswseason-${r}`);
  const o = occ.frame(0), s = sea.frame(0);
  const any = areaWhere(occ.meta, o, (v) => v > 0);
  const perm = areaWhere(occ.meta, o, (v) => v >= 90);
  // weighted water area = sum(share x cell area): occurrence is already a cell mean of 30 m pixels
  const mean = areaWhere(occ.meta, o, () => true);
  let wHa = 0;
  for (let row = 0; row < occ.meta.height; row++) for (let c = 0; c < occ.meta.width; c++) {
    const v = o[row * occ.meta.width + c]; if (!Number.isNaN(v)) wHa += (v / 100) * pixelAreaHa(occ.meta, row);
  }
  const s1 = areaWhere(sea.meta, s, (v) => v >= 1), s10 = areaWhere(sea.meta, s, (v) => v >= 10);
  const sSeasonal = areaWhere(sea.meta, s, (v) => v >= 1 && v < 10);
  console.log(`[8.1] ${r}: region ${k(mean.validHa)}k ha; cells ever water ${pct(any.ha, any.validHa)} %; occurrence>=90 % cells ${k(perm.ha)}k ha;`,
    `occurrence-weighted water ${k(wHa)}k ha (${pct(wHa, mean.validHa)} %);`,
    `2021 seasonality: cells mean>=1 month ${k(s1.ha)}k ha (${pct(s1.ha, s1.validHa)} %), >=10 months ${k(s10.ha)}k ha, 1-10 months ${k(sSeasonal.ha)}k ha`);
}

// 8.2 An Giang frame: MNDWI 26 Oct 2024 vs S1 VV 14 and 26 Oct 2024 (ThresholdLab settings of the figures)
const snap = (v: number, step: number) => Math.round(v / step) * step;
const mn = load('s2mndwi-angiang-2024'), s1 = load('s1-angiang-2024');
const m = mn.frame(0);
const tM = snap(otsu(m, -0.8, 0.8), 0.02);
const wM = areaWhere(mn.meta, m, (v) => v > tM);
console.log(`[8.2] MNDWI 2024-10-26 Otsu ${tM.toFixed(2)} -> ${Math.round(wM.ha)} ha (${pct(wM.ha, wM.validHa)} %), frame ${Math.round(wM.validHa)} ha`);
for (const t of [0, 1, 2]) {
  const v = s1.frame(t), th = snap(otsu(v, -30, 0), 0.25);
  const w = areaWhere(s1.meta, v, (x) => x < th);
  console.log(`[8.2] S1 VV ${s1.meta.times[t]} Otsu ${th.toFixed(2)} dB -> ${Math.round(w.ha)} ha (${pct(w.ha, w.validHa)} %)`);
  if (t === 2) { // same-day agreement, pixel by pixel (same 10 m grid)
    let both = 0, onlyS2 = 0, onlyS1 = 0, n = 0;
    for (let i = 0; i < v.length; i++) {
      if (Number.isNaN(v[i]) || Number.isNaN(m[i])) continue;
      n++; const a = m[i] > tM, b = v[i] < th;
      if (a && b) both++; else if (a) onlyS2++; else if (b) onlyS1++;
    }
    console.log(`[8.2] same day 26/10: both ${pct(both, n)} %, MNDWI only ${pct(onlyS2, n)} %, radar only ${pct(onlyS1, n)} %, agree ${pct(n - onlyS1 - onlyS2, n)} %`);
  }
}

// 8.3 / 8.4 monthly open water, Mekong delta (flood-s1-area-mekong.json)
const A = JSON.parse(readFileSync('public/data/flood-s1-area-mekong.json', 'utf8'));
const MON = A.months as number[];
const peaks = (A.region_ha as number[][]).map((r, i) => { const mx = Math.max(...r); return { y: A.years[i], ha: mx, m: MON[r.indexOf(mx)] }; });
console.log('[8.3] region peak by year:', peaks.map((p) => `${p.y} ${k(p.ha)}k (m${p.m})`).join(', '));
const mean = peaks.reduce((a, p) => a + p.ha, 0) / peaks.length;
console.log(`[8.4] mean peak ${k(mean)}k; max ${peaks.reduce((a, p) => (p.ha > a.ha ? p : a)).y}, min ${peaks.reduce((a, p) => (p.ha < a.ha ? p : a)).y}`);
const peakMonths = peaks.map((p) => p.m); console.log('[8.3] peak months', peakMonths.join(','));
const july = (A.region_ha as number[][]).map((r: number[]) => k(r[0]));
console.log('[8.3] July area by year (k ha):', july.join(', '));
console.log('[8.3] valid share min', Math.min(...(A.valid_share as number[][]).flat()));
const prov = A.provinces as Record<string, number[][]>;
const provPeak = (name: string) => prov[name].map((r) => k(Math.max(...r)));
const ranked = Object.keys(prov).map((n) => ({ n, avg: prov[n].reduce((a, r) => a + Math.max(...r), 0) / prov[n].length }))
  .sort((a, b) => b.avg - a.avg);
console.log('[8.3] provinces by mean peak (k ha):', ranked.map((p) => `${p.n} ${k(p.avg)}`).join(', '));
for (const n of ['An Giang', 'Đồng Tháp', 'Long An', 'Kiên Giang']) console.log(`[8.4] ${n} peak by year:`, provPeak(n).join(', '));

// 8.5 / 8.6 typhoon Yagi, Red River Delta
const Y = JSON.parse(readFileSync('public/data/flood-yagi-red.json', 'utf8'));
const tot = (f: string) => Y.provinces.reduce((a: number, p: Record<string, number>) => a + p[f], 0);
console.log(`[8.5] new water ${tot('new_water')} ha, of which on cropland ${tot('new_water_crop')} ha (${pct(tot('new_water_crop'), tot('new_water'))} %); cropland ${tot('cropland')} ha`);
for (const p of Y.provinces) console.log(`[8.6] ${p.name}: new ${p.new_water}, on cropland ${p.new_water_crop} (${pct(p.new_water_crop, p.cropland)} % of its cropland)`);
const yl = load('flood-yagi-red'), rice = load('rice-seasons-red');
const pre = yl.frame(0), post = yl.frame(1), r24 = rice.frame(1);
let riceHa = 0, riceNew = 0, allNew = 0, preW = 0, postW = 0;
for (let row = 0; row < yl.meta.height; row++) {
  const a = pixelAreaHa(yl.meta, row);
  for (let c = 0, i = row * yl.meta.width; c < yl.meta.width; c++, i++) {
    if (Number.isNaN(pre[i]) || Number.isNaN(post[i])) continue;
    preW += (pre[i] / 100) * a; postW += (post[i] / 100) * a;
    const d = Math.max(0, post[i] - pre[i]) / 100 * a; allNew += d;
    if (r24[i] >= 1) { riceHa += a; riceNew += d; }
  }
}
console.log(`[8.5] 250 m cells: water ${k(preW)}k -> ${k(postW)}k ha; net rise of water share summed ${k(allNew)}k ha`);
console.log(`[8.6] cells with >=1 rice season in 2024 (S1, ch.4): ${k(riceHa)}k ha; rise of water share on them ${Math.round(riceNew)} ha (${pct(riceNew, riceHa)} %)`);
const dry = areaWhere(s1.meta, s1.frame(0), (x) => x < -18);
console.log(`[8.2] S1 VV 2024-03-12 below -18 dB: ${Math.round(dry.ha)} ha (${pct(dry.ha, dry.validHa)} %)`);
const yv = yl.meta.stats[1].valid, rv = load('flood-gswseason-red').meta.stats[0].valid;
console.log(`[8.5] orbit-91 pair covers ${pct(yv, rv)} % of the Red River Delta cells`);
