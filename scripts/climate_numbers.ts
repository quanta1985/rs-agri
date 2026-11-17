// Recompute every Chapter 7 (climate) and Chapter 9 (drought) number quoted in the prose.
//   node scripts/climate_numbers.ts
import { readFileSync } from 'node:fs';
import { theilSen } from '../src/lib/change.ts';

type V = (number | null)[];
const d = JSON.parse(readFileSync('public/data/climate-series.json', 'utf8'));
const meta = (id: string) => JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
const Y0 = +d.start.slice(0, 4), MY0 = +d.modis_start.slice(0, 4), OY0 = +d.oni.start.slice(0, 4);
const [SY0, SM0] = d.smap.start.split('-').map(Number);
const at = (a: V, y0: number, y: number, m: number, m0 = 1) => a[(y - y0) * 12 + (m - m0)] ?? null;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const ok = (v: number | null): v is number => v != null && Number.isFinite(v);
const f = (v: number | null, k = 1) => (v == null ? 'n/a' : v.toFixed(k));
const YN = Y0 + Math.floor(d.regions.red.rain.length / 12) - 1;
const N1 = d.normal[0], N2 = d.normal[1];

const oni = (y: number, m: number) => at(d.oni.values, OY0, y, m);
console.log(`[7.5] ONI DJF: 2016 ${f(oni(2016, 1), 2)}, 2020 ${f(oni(2020, 1), 2)}, 2024 ${f(oni(2024, 1), 2)}; peak NDJ 2015 ${f(oni(2015, 12), 2)}, NDJ 2023 ${f(oni(2023, 12), 2)}`);
const lastI = d.oni.values.length - 1;
const big = Array.from({ length: 2026 - 1950 + 1 }, (_, i) => 1950 + i).filter((y) => (oni(y, 1) ?? -9) >= 2);
console.log(`[7.5] seasons with DJF ONI >= 2 since 1950: ${big.map((y) => `${y} ${f(oni(y, 1), 2)}`).join(', ')}`);
const i16 = (2016 - OY0) * 12 + 5;
console.log(`[7.5] max ONI from Jun 2016 to the previous month: ${f(Math.max(...(d.oni.values.slice(i16, lastI) as number[]).filter(ok)), 2)}`);
console.log(`[7.5] latest ONI ${f(d.oni.values[lastI], 2)} centred on ${OY0 + Math.floor(lastI / 12)}-${String((lastI % 12) + 1).padStart(2, '0')}`);

for (const r of ['red', 'mekong']) {
  const R = d.regions[r], N = d.normals[r];
  const rainYr = N.rain.reduce((s: number, v: number) => s + v, 0);
  const dryN = [12, 1, 2, 3, 4].reduce((s, m) => s + N.rain[m - 1], 0);
  const wet = N.rain.indexOf(Math.max(...N.rain)) + 1, dryM = N.rain.indexOf(Math.min(...N.rain)) + 1;
  console.log(`[7.1] ${r}: normal rain ${Math.round(rainYr)} mm/yr, Dec-Apr ${Math.round(dryN)} mm (${(100 * dryN / rainYr).toFixed(0)} %), wettest month ${wet} (${Math.round(N.rain[wet - 1])}), driest ${dryM} (${Math.round(N.rain[dryM - 1])})`);
  console.log(`[7.1] ${r}: t2m Jan ${f(N.t2m[0])} Apr ${f(N.t2m[3])} Jun ${f(N.t2m[5])} Jul ${f(N.t2m[6])} range ${f(Math.max(...N.t2m) - Math.min(...N.t2m))} °C; LST Jan ${f(N.lst[0])} Mar ${f(N.lst[2])} Apr ${f(N.lst[3])} Jul ${f(N.lst[6])}`);
  console.log(`[7.3] ${r}: LST - air: ` + N.lst.map((v: number, i: number) => `${i + 1}:${f(v - N.t2m[i])}`).join(' '));
  console.log(`[7.4] ${r}: ET ${Math.round(N.et.reduce((s: number, v: number) => s + v, 0))} PET ${Math.round(N.pet.reduce((s: number, v: number) => s + v, 0))} mm/yr; rain - PET by month: ` + N.rain.map((v: number, i: number) => Math.round(v - N.pet[i])).join(' '));
  const dry = (y: number) => { const v = [at(R.rain, Y0, y - 1, 12), ...[1, 2, 3, 4].map((m) => at(R.rain, Y0, y, m))]; return v.every(ok) ? (v as number[]).reduce((s, x) => s + x, 0) : null; };
  const fa = (y: number) => { const v = [2, 3, 4].map((m) => at(R.t2m, Y0, y, m)); return v.every(ok) ? mean(v as number[]) : null; };
  const yrs = Array.from({ length: N2 - N1 + 1 }, (_, i) => N1 + i);
  const b = mean(yrs.map(dry).filter(ok)), bt = mean(yrs.map(fa).filter(ok));
  const all = Array.from({ length: YN - Y0 }, (_, i) => Y0 + 1 + i);
  const an = all.map((y) => [y, 100 * ((dry(y) ?? NaN) / b - 1), (fa(y) ?? NaN) - bt] as [number, number, number]);
  console.log(`[7.5] ${r}: dry-season rain anomaly % / Feb-Apr t2m anomaly: ` + [2016, 2020, 2024, 2019, 2010, 1998].map((y) => { const a = an.find((q) => q[0] === y)!; return `${y} ${f(a[1], 0)} / ${f(a[2], 2)}`; }).join(', '));
  const hottest = [...an].sort((p, q) => q[2] - p[2]).slice(0, 5).map((a) => `${a[0]} ${f(a[2], 2)}`);
  const driest = [...an].sort((p, q) => p[1] - q[1]).slice(0, 5).map((a) => `${a[0]} ${f(a[1], 0)}`);
  console.log(`[7.5] ${r}: dry-season rain in the DJF ONI >= 2 seasons: ${big.filter((y) => y > Y0).map((y) => `${y} ${f(an.find((q) => q[0] === y)![1], 0)} %`).join(', ')}`);
  const def = (y: number, m: number) => N.rain[m - 1] - (at(R.rain, Y0, y, m) ?? NaN);
  const d20 = [[2019, 12], [2020, 1], [2020, 2], [2020, 3], [2020, 4]].map(([y, m]) => def(y, m));
  console.log(`[7.5] ${r}: 2019-20 deficit share in Dec-Jan ${f(100 * (d20[0] + d20[1]) / d20.reduce((s, v) => s + v, 0), 0)} %; coolest month ${N.t2m.indexOf(Math.min(...N.t2m)) + 1}, hottest ${N.t2m.indexOf(Math.max(...N.t2m)) + 1}; May-Oct share of rain ${f(100 * N.rain.slice(4, 10).reduce((s: number, v: number) => s + v, 0) / rainYr, 0)} %`);
  console.log(`[7.5] ${r}: hottest Feb-Apr ${hottest.join(', ')}; driest Dec-Apr ${driest.join(', ')}`);
  const yy = Array.from({ length: YN - Y0 + 1 }, (_, i) => Y0 + i);
  const ann = yy.map((y) => { const v = Array.from({ length: 12 }, (_, m) => at(R.t2m, Y0, y, m + 1)); return v.every(ok) ? mean(v as number[]) : NaN; });
  const ts = theilSen(yy, ann);
  console.log(`[7.6] ${r}: annual t2m ${f(ann[0], 2)} (${yy[0]}) -> ${f(ann[ann.length - 1], 2)} (${YN}); Theil-Sen ${f(ts.slope * 10, 2)} °C/decade, ${f(ts.slope * (YN - Y0), 2)} °C over ${YN - Y0} yr; warmest year ${yy[ann.indexOf(Math.max(...ann))]}`);
  // ch.9
  console.log(`[9.2] ${r}: SPI-3 ending Apr: ` + [2016, 2020, 2024, 2010, 2005, 1998].map((y) => `${y} ${f(at(R.spi3, Y0, y, 4), 2)}`).join(', ') + `; ending Mar 2016 ${f(at(R.spi3, Y0, 2016, 3), 2)}`);
  const fa3 = (k: string, y: number) => { const v = [2, 3, 4].map((m) => at(R[k], MY0, y, m)).filter(ok) as number[]; return v.length ? mean(v) : null; };
  console.log(`[9.3] ${r}: Feb-Apr VHI / ASI(%<35): ` + [2016, 2018, 2020, 2024, 2023].map((y) => `${y} ${f(fa3('vhi', y), 0)} / ${f(fa3('asi', y), 0)}`).join(', '));
  const sm = d.smap.regions[r] as V;
  const clim = Array.from({ length: 12 }, (_, m) => mean(sm.filter((v, i) => ((SM0 - 1 + i) % 12) === m && ok(v)) as number[]));
  const sa = (y: number, m: number) => { const v = at(sm, SY0, y, m, SM0); return v == null ? null : v - clim[m - 1]; };
  const season = (y: number) => { const s: [number, number][] = [[y - 1, 12], [y, 1], [y, 2], [y, 3], [y, 4], [y, 5]]; const v = s.map(([a, b]) => sa(a, b)).filter(ok) as number[]; return v.length ? mean(v) : null; };
  const allA = sm.map((v, i) => (ok(v) ? v - clim[(SM0 - 1 + i) % 12] : Infinity)); const iMin = allA.indexOf(Math.min(...allA));
  console.log(`[9.4] ${r}: Dec-May mean anomaly 2016 ${f(season(2016), 3)}, 2020 ${f(season(2020), 3)}, 2024 ${f(season(2024), 3)}; record min ${f(allA[iMin], 3)} in ${SY0 + Math.floor((SM0 - 1 + iMin) / 12)}-${((SM0 - 1 + iMin) % 12) + 1}; Dec 2019 rain ${f(at(R.rain, Y0, 2019, 12), 0)} vs normal ${f(N.rain[11], 0)} mm`);
  console.log(`[9.4] ${r}: SMAP root-zone clim Apr ${f(clim[3], 3)} Oct ${f(clim[9], 3)}; anomaly Apr 2016 ${f(sa(2016, 4), 3)}, Apr 2020 ${f(sa(2020, 4), 3)}, Apr 2024 ${f(sa(2024, 4), 3)}`);
}
for (const id of ['spi3-mekong', 'spi3-red', 'vhi-dry-mekong', 'rain-dryanom-mekong', 'rain-dryanom-red']) {
  const m = meta(id);
  console.log(`[map] ${id}: ` + m.times.map((t: string, i: number) => `${t} median ${f(m.stats[i].p50, 2)} (p2 ${f(m.stats[i].p2, 2)}, p98 ${f(m.stats[i].p98, 2)})`).join('; '));
}
