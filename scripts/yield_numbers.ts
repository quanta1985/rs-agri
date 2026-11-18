// Recompute every Chapter 6 (yield) number quoted in the prose (same pairing as YieldModel.tsx).
//   node scripts/yield_numbers.ts
import { readFileSync } from 'node:fs';
import { detrend, fit, looBaseline, looRmse } from '../src/lib/yieldmodel.ts';

const d = JSON.parse(readFileSync('public/data/yield-series.json', 'utf8'));
const f = (v: number, k = 2) => v.toFixed(k);
const Y0 = 2001, Y1 = 2024, MIN_YEARS = 12; // as in YieldModel.tsx
type P = { year: number; x: number; y: number };
const pairs = (region: string, prov: string, index: 'peak' | 'late'): P[] => {
  const r = d[region];
  const xAt = (i: number) => (index === 'late' ? r.late?.provinces[prov]?.[i] : r.peaks.provinces[prov]?.[i]?.[0]) ?? null;
  return r.peaks.years.map((y: number, i: number) => ({ year: y, x: xAt(i), y: r.official[prov]?.[String(y)]?.[0] ?? null }))
    .filter((p: { year: number; x: number | null; y: number | null }) => p.year >= Y0 && p.year <= Y1 && p.x != null && p.y != null);
};

for (const region of ['mekong', 'red']) {
  const R = d[region];
  if (!R.peaks) { console.log(`${region}: no peaks yet`); continue; }
  console.log(`[6.3] ${region}: region peak EVI: ` + R.peaks.years.map((y: number, i: number) => `${y}:${R.peaks.region[i]}`).join(' '));
  const off = R.official[region === 'mekong' ? 'Đồng bằng sông Cửu Long' : 'Đồng bằng sông Hồng'];
  console.log(`[6.3] ${region}: region yield ${Y0} ${off[Y0][0]} -> ${Y1} ${off[Y1][0]} t/ha, sown ${off[Y1][1]} kha in ${Y1}`);
  for (const index of ['peak', 'late'] as const) {
    if (index === 'late' && !R.late) continue;
    const pooled: { x: number[]; y: number[] } = { x: [], y: [] };
    let beat = 0, n = 0;
    for (const prov of Object.keys(R.peaks.provinces)) {
      const Pp = pairs(region, prov, index);
      if (Pp.length < MIN_YEARS) { console.log(`[6.4] ${region} ${index} ${prov}: only ${Pp.length} years`); continue; }
      const t = Pp.map((p) => p.year);
      const yt = fit(t, Pp.map((p) => p.y));
      const xs = detrend(t, Pp.map((p) => p.x)), ys = detrend(t, Pp.map((p) => p.y));
      const raw = fit(Pp.map((p) => p.x), Pp.map((p) => p.y)), det = fit(xs, ys);
      const loo = looRmse(xs, ys), base = looBaseline(ys);
      n++; if (loo < base) beat++;
      pooled.x.push(...xs); pooled.y.push(...ys);
      const minY = Pp.reduce((a, p) => (p.y < a.y ? p : a));
      console.log(`[6.4] ${region} ${index} ${prov}: n ${Pp.length}, yield ${f(Pp[0].y)} (${Pp[0].year}) -> ${f(Pp[Pp.length - 1].y)} (${Pp[Pp.length - 1].year}), ` +
        `trend ${f(yt.b, 3)} t/ha/yr (R² ${f(yt.r2)}), raw R² ${f(raw.r2)}, detrended R² ${f(det.r2)} b ${f(det.b, 1)}, LOO ${f(loo)} vs mean ${f(base)} t/ha, min ${f(minY.y)} in ${minY.year}`);
    }
    const pf = fit(pooled.x, pooled.y);
    console.log(`[6.4] ${region} ${index}: LOO beats the mean in ${beat} of ${n} provinces; pooled detrended n ${pooled.x.length}, R² ${f(pf.r2)}`);
  }
}

// salinity years in the coastal provinces (6.5)
const M = d.mekong;
for (const prov of ['Bến Tre', 'Trà Vinh', 'Sóc Trăng', 'Kiên Giang']) {
  const row = [2015, 2016, 2019, 2020, 2024].map((y) => {
    const i = M.peaks.years.indexOf(y);
    return `${y}: yield ${M.official[prov][String(y)][0]} t/ha (${M.official[prov][String(y)][1]} kha), peak ${M.peaks.provinces[prov][i][0]}, Feb-Mar ${M.late?.provinces[prov][i] ?? '-'}`;
  });
  console.log(`[6.5] ${prov}: ${row.join(' | ')}`);
}

// season curves (6.3): composites dropped for cloud (< 50 % good cells, as in YieldModel.tsx), and when the mean curve peaks
const MIN_GOOD = 0.5;
const START: Record<string, [number, number, number]> = { mekong: [10, 15, -1], red: [1, 15, 0] };
for (const region of ['mekong', 'red']) {
  const C = d[region].curves as Record<string, [number, number | null, number][]>;
  const years = Object.keys(C);
  const all = years.flatMap((y) => C[y]);
  const bad = all.filter((p) => p[1] == null || p[2] < MIN_GOOD).length;
  const meanGood = all.reduce((a, p) => a + p[2], 0) / all.length;
  const peakDay = years.map((y) => {
    const [m, dd, off] = START[region];
    const d0 = Date.UTC(+y + off, m, dd) / 86400000;
    const good = C[y].filter((p) => p[1] != null && p[2] >= MIN_GOOD);
    if (!good.length) return NaN;
    const best = good.reduce((a, p) => ((p[1] as number) > (a[1] as number) ? p : a));
    return best[0] - d0;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  console.log(`[6.3] ${region}: ${all.length} composites ${years[0]}-${years[years.length - 1]}, ${bad} dropped (${(100 * bad / all.length).toFixed(0)} %), mean good-cell share ${(100 * meanGood).toFixed(0)} %; ` +
    `peak day from season start: median ${peakDay[peakDay.length >> 1]}, range ${peakDay[0]}-${peakDay[peakDay.length - 1]}`);
  const firstMonth = all.filter((p) => { const dt = new Date(p[0] * 86400000); return region === 'red' ? dt.getUTCMonth() <= 2 : dt.getUTCMonth() >= 10; });
  console.log(`[6.3] ${region}: first ~6 weeks (red Feb-Mar, mekong Nov-Dec) mean good-cell share ${(100 * firstMonth.reduce((a, p) => a + p[2], 0) / firstMonth.length).toFixed(0)} %`);
}
