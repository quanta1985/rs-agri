// Recompute every Chapter 2 (data) number quoted in the prose.
//   node scripts/data_numbers.ts
import { readFileSync } from 'node:fs';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const sky = read('data-clearsky.json'), pur = read('data-purity.json'), vol = read('data-volume.json'), st = read('deltas-stats.json');
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const col = (m: number[][], j: number) => m.map((r) => r[j]);

// 2.2 pixel purity at 30 m and 250 m
for (const [s, v] of Object.entries<{ pure: number[]; cropland: number }>(pur.sites)) {
  const at = (r: number) => (100 * v.pure[pur.res_m.indexOf(r)]).toFixed(1);
  console.log(`[2.2] ${s}: pure cells 30 m ${at(30)} %, 250 m ${at(250)} %, 500 m ${at(500)} %; cropland ${(100 * v.cropland).toFixed(1)} %`);
}

// 2.3 usable Sentinel-2 days, 2.4 Sentinel-1 days
for (const [s, v] of Object.entries<{ s2_dates: number[][]; s2_usable: number[][]; s1_dates_per_year: number[] }>(sky.sites)) {
  const m = Array.from({ length: 12 }, (_, j) => mean(col(v.s2_usable, j)));
  const zeroMonths = v.s2_usable.flat().filter((x) => x === 0).length;
  const yr = v.s2_usable.map((r) => r.reduce((a, b) => a + b, 0));
  const looks = v.s2_dates.map((r) => r.reduce((a, b) => a + b, 0));
  const lk = Array.from({ length: 12 }, (_, j) => mean(col(v.s2_dates, j)));
  const share = (ms: number[]) => ((100 * ms.reduce((a, j) => a + m[j], 0)) / ms.reduce((a, j) => a + lk[j], 0)).toFixed(0);
  console.log(`[2.3] ${s}: usable share of looks Jan-Apr ${share([0, 1, 2, 3])} %, Dec-Apr ${share([11, 0, 1, 2, 3])} %, May-Nov ${share([4, 5, 6, 7, 8, 9, 10])} %`);
  const s1 = (y: number) => v.s1_dates_per_year[sky.s1_years.indexOf(y)];
  console.log(`[2.3] ${s}: usable/month ${m.map((x) => x.toFixed(1)).join(' ')}; Jan-Apr ${mean(m.slice(0, 4)).toFixed(1)}, May-Nov ${mean(m.slice(4, 11)).toFixed(1)}, Dec-Apr ${mean([m[11], ...m.slice(0, 4)]).toFixed(1)};`,
    `usable/yr ${mean(yr).toFixed(1)} of ${mean(looks).toFixed(0)} looks; months with 0 usable days ${zeroMonths}/72`);
  console.log(`[2.4] ${s}: S1 days 2021 ${s1(2021)} -> 2022 ${s1(2022)} (${((100 * (s1(2022) - s1(2021))) / s1(2021)).toFixed(0)} %), 2025 ${s1(2025)}`);
}

// 2.5 WorldView coverage of the Mekong region at the FAO (2017, section 9.1) reference price
const km2 = st.regions.mekong.area_ha / 100;
console.log(`[2.5] Mekong ${Math.round(km2)} km² x US$20 = US$${Math.round(km2 * 20).toLocaleString('en')}`);

// 2.6 data volume 2024 with the per-scene sizes of FAO (2017, section 1.5): S2 tile 0.5 GB, S1 frame 1 GB, Landsat scene 1 GB
for (const [r, n] of Object.entries<Record<string, number>>(vol.regions)) {
  const gb = { s2: n.s2 * 0.5, s1: n.s1 * 1, landsat: n.landsat * 1 };
  console.log(`[2.6] ${r}: S2 ${n.s2} tiles (${n.s2_tiles} MGRS) ${gb.s2} GB, S1 ${n.s1} ${gb.s1} GB, Landsat ${n.landsat} ${gb.landsat} GB, total ${(gb.s2 + gb.s1 + gb.landsat).toFixed(0)} GB`);
}
