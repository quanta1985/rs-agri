// Recompute every Chapter 4 (rice) number quoted in the prose, with the same code the figures run.
//   node scripts/rice_numbers.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { areaWhere, decodeFrame, frameOf, type LayerMeta, type Raw } from '../src/lib/layer.ts';
import { otsu } from '../src/lib/raster.ts';
import { estimateArea } from '../src/lib/accuracy.ts';

const load = (id: string): { m: LayerMeta; data: Raw } => {
  const m = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8')) as LayerMeta;
  const b = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  const T = m.dtype === 'uint8' ? Uint8Array : m.dtype === 'uint16' ? Uint16Array : Int16Array;
  return { m, data: new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT) };
};
const kha = (ha: number) => (ha / 1000).toFixed(0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const day = (d: number) => new Date(Date.UTC(2024, 0, 1 + d)).toISOString().slice(0, 10);

// 4.1 seasons per year: cells and area per class, and "season-area" (each cell counted once per season, 3+ as 3).
for (const r of ['red', 'mekong']) {
  const { m, data } = load(`rice-seasons-${r}`);
  m.times.forEach((year, t) => {
    const v = decodeFrame(m, frameOf(m, data, t));
    const cells = [0, 1, 2, 3].map((c) => v.filter((x) => x === c).length);
    const ha = [0, 1, 2, 3].map((c) => areaWhere(m, v, (x) => x === c).ha);
    const crop = ha.reduce((a, b) => a + b, 0), rice = ha[1] + ha[2] + ha[3];
    const seasonHa = ha[1] + 2 * ha[2] + 3 * ha[3];
    console.log(`seasons ${r} ${year}: cells ${cells.join('/')}; kha ${ha.map(kha).join('/')}; cropland ${kha(crop)} kha;`,
      `share ${ha.map((h) => (100 * h / crop).toFixed(0) + '%').join('/')}; >=1 season ${kha(rice)} kha; season-area ${kha(seasonHa)} kha`);
  });
}

// 4.3 start of season: medians (days from 1 Jan 2024) and the date they correspond to.
for (const r of ['red', 'mekong']) {
  const { m, data } = load(`rice-sos-2024-${r}`);
  m.times.forEach((lab, t) => {
    const v = Array.from(decodeFrame(m, frameOf(m, data, t))).filter((x) => !Number.isNaN(x));
    const p = (q: number) => [...v].sort((a, b) => a - b)[Math.floor(q * (v.length - 1))];
    console.log(`sos ${r} ${lab}: n ${v.length} median ${median(v)} (${day(median(v))}) p10 ${p(0.1)} (${day(p(0.1))}) p90 ${p(0.9)} (${day(p(0.9))})`);
  });
}

// 4.4 seasonal VH range at the two 10 m sites: Otsu as ThresholdLab computes it (range [0, 20] dB, step 0.5), rice area above it.
for (const s of ['angiang', 'namdinh']) {
  const { m, data } = load(`rice-dvh-${s}`);
  const v = decodeFrame(m, frameOf(m, data, 0));
  const th = Math.round(otsu(v, 0, 20) / 0.5) * 0.5;
  for (const t of [th, 5, 8]) {
    const { ha, validHa } = areaWhere(m, v, (x) => x > t);
    console.log(`dvh ${s}: threshold ${t} dB -> ${ha.toFixed(0)} ha of ${validHa.toFixed(0)} (${(100 * ha / validHa).toFixed(1)} %)${t === th ? ' [Otsu]' : ''}`);
  }
}

// 4.2 point series: troughs and peaks quoted in the text.
type S2 = { d: string; ndvi: number; evi: number; lswi: number };
type S1 = { d: string; vh: number; vv: number };
for (const s of ['angiang', 'namdinh']) {
  const j = JSON.parse(readFileSync(`public/data/rice-series-${s}.json`, 'utf8')) as { s2: S2[]; s1: S1[]; bbox: number[] };
  const minVh = j.s1.reduce((a, b) => (b.vh < a.vh ? b : a));
  const maxNdvi = j.s2.reduce((a, b) => (b.ndvi > a.ndvi ? b : a));
  const in24 = (d: string, a: string, b: string) => d >= a && d < b;
  const vh = (a: string, b: string) => j.s1.filter((p) => in24(p.d, a, b)).map((p) => `${p.d}:${p.vh}`).join(' ');
  console.log(`series ${s}: ${j.s2.length} S2 dates, ${j.s1.length} S1 dates; min VH ${minVh.vh} on ${minVh.d}; max NDVI ${maxNdvi.ndvi} on ${maxNdvi.d}`);
  console.log(`  S1 Dec 2023-Mar 2024: ${vh('2023-12-01', '2024-03-31')}`);
  console.log(`  S1 Jun-Aug 2024: ${vh('2024-06-01', '2024-08-31')}`);
  const gaps = j.s2.slice(1).map((p, i) => ({ from: j.s2[i].d, to: p.d, days: (Date.parse(p.d) - Date.parse(j.s2[i].d)) / 864e5 })).filter((g) => g.days > 40);
  console.log(`  S2 gaps > 40 days: ${gaps.map((g) => `${g.from}..${g.to} (${g.days} d)`).join(', ') || 'none'}`);
}

// 4.5 illustrative confusion matrix (the same numbers as AreaCorrection's default) on the 2024 Mekong map.
for (const r of ['mekong', 'red']) {
  const { m, data } = load(`rice-seasons-${r}`);
  const v = decodeFrame(m, frameOf(m, data, 1));
  const mappedRice = areaWhere(m, v, (x) => x >= 1).ha, mappedOther = areaWhere(m, v, (x) => x === 0).ha;
  const est = estimateArea([[88, 12], [9, 91]], [mappedRice, mappedOther]);
  console.log(`area 4.5 ${r}: mapped rice ${kha(mappedRice)} kha, other ${kha(mappedOther)} kha;`,
    `estimated rice ${kha(est.area[0])} ± ${kha(1.96 * est.se[0])} kha (95 %), UA ${(100 * est.user[0]).toFixed(1)} %, PA ${(100 * est.producer[0]).toFixed(1)} %, OA ${(100 * est.overall).toFixed(1)} %`);
}
