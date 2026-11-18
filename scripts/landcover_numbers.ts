// Recompute every Chapter 3 (landcover) number quoted in the prose.
//   node scripts/landcover_numbers.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const d = JSON.parse(readFileSync('public/data/landcover-stats.json', 'utf8'));
const k = (ha: number) => (ha / 1000).toFixed(0);
const P = ['wc', 'dw', 'esri'];
const NAME: Record<string, string> = { wc: 'WorldCover', dw: 'Dynamic World', esri: 'Esri' };
const CLS = d.classes as Record<string, { en: string }>;

for (const region of ['mekong', 'red']) {
  const R = d[region];
  const total = Object.values(R.agree_ha as Record<string, number>).reduce((a, b) => a + b, 0);
  console.log(`[3.3] ${region}: compared area (valid in all three) ${k(total)} kha`);
  for (const c of Object.keys(CLS)) {
    console.log(`[3.3] ${region} ${CLS[c].en}: ` + P.map((p) => `${NAME[p]} ${k(R.ha[p][c] ?? 0)}`).join(' / ') + ' kha');
  }
  const cropFlood = P.map((p) => `${NAME[p]} ${k((R.ha[p]['3'] ?? 0) + (R.ha[p]['6'] ?? 0))}`);
  console.log(`[3.3] ${region} crops + flooded vegetation: ${cropFlood.join(' / ')} kha`);
  const A = R.agree_ha as Record<string, number>;
  const pct = (c: string) => (100 * (A[c] ?? 0) / total).toFixed(1);
  console.log(`[3.2] ${region} crop agreement (% of compared area): none ${pct('0')}, all three ${pct('7')}, exactly one ${(+pct('1') + +pct('2') + +pct('4')).toFixed(1)} (WC ${pct('1')}, DW ${pct('2')}, Esri ${pct('4')}), two ${(+pct('3') + +pct('5') + +pct('6')).toFixed(1)} (WC+DW ${pct('3')}, WC+Esri ${pct('5')}, DW+Esri ${pct('6')})`);
  const anyCrop = total - (A['0'] ?? 0);
  console.log(`[3.2] ${region}: of the area any map calls cropland (${k(anyCrop)} kha), all three agree on ${(100 * (A['7'] ?? 0) / anyCrop).toFixed(1)} %`);
  console.log(`[3.2] ${region} pairwise agreement on all 7 classes (% of area): ` + Object.entries(R.pair_agreement).map(([a, b]) => `${a} ${b}`).join(', '));
  if (R.esri_series) {
    const ys = Object.keys(R.esri_series).sort();
    for (const c of ['3', '2', '4', '6']) console.log(`[3.5] ${region} Esri ${CLS[c].en}: ` + ys.map((y) => `${y} ${k(R.esri_series[y][c] ?? 0)}`).join(' '));
    const c0 = R.esri_series[ys[0]]['3'], c24 = R.esri_series['2024']['3'];
    console.log(`[3.5] ${region} Esri crops ${ys[0]} -> 2024: ${k(c0)} -> ${k(c24)} kha (${(100 * (c24 - c0) / c0).toFixed(1)} %)`);
    const jumps = ys.slice(1).map((y, i) => [y, R.esri_series[y]['3'] - R.esri_series[ys[i]]['3']] as [string, number]);
    console.log(`[3.5] ${region} Esri crops year-to-year change (kha): ` + jumps.map(([y, v]) => `${y} ${(v / 1000).toFixed(0)}`).join(' '));
  }
}

// sites at 10 m (3.4): class shares in each product
for (const site of ['bentre', 'namdinh']) {
  const m = JSON.parse(readFileSync(`public/data/lc3-${site}/meta.json`, 'utf8'));
  const b = gunzipSync(readFileSync(`public/data/lc3-${site}/values.binz`));
  const n = m.width * m.height;
  m.times.forEach((t: string, i: number) => {
    const cnt = new Array(8).fill(0);
    for (let j = 0; j < n; j++) cnt[b[i * n + j]]++;
    console.log(`[3.4] ${site} ${t}: ` + Object.keys(CLS).map((c) => `${CLS[c].en} ${(100 * cnt[+c] / n).toFixed(1)}`).join(', ') + ' %');
  });
}
