// Recompute every Chapter 13 (emissions) number quoted in the prose.
//   node scripts/emissions_numbers.ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decode, mercToLonLat, pixelAt, type LayerMeta } from '../src/lib/layer.ts';
import { CFOA, EFC, GWP_CH4, SEASON_DAYS, SFP, SFW, seasonCH4 } from '../src/lib/methane.ts';

type V = (number | null)[];
const d = JSON.parse(readFileSync('public/data/emissions-series.json', 'utf8'));
const clim = JSON.parse(readFileSync('public/data/climate-series.json', 'utf8'));
const meta = (id: string) => JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
/** Last time step of a layer as physical values (NaN = no data). */
const layer = (id: string) => {
  const m: LayerMeta = meta(id);
  const b = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  const raw = m.dtype === 'uint8' ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  const n = m.width * m.height, t = m.times.length - 1;
  const v = Float64Array.from(raw.subarray(t * n, (t + 1) * n), (r) => decode(m, r));
  const at = (lon: number, lat: number) => { const p = pixelAt(m, lon, lat); return p ? v[p.row * m.width + p.col] : NaN; };
  const top = (k = 1) => Array.from(v.keys()).filter((i) => Number.isFinite(v[i])).sort((a, b) => v[b] - v[a]).slice(0, k).map((i) => {
    const [lon, lat] = mercToLonLat(m.origin[0] + (i % m.width + 0.5) * m.res, m.origin[1] - (Math.floor(i / m.width) + 0.5) * m.res);
    return { lon: +lon.toFixed(2), lat: +lat.toFixed(2), v: +v[i].toFixed(1) };
  });
  return { m, v, at, top };
};
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => sum(a) / a.length;
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const f = (v: number, k = 1) => v.toFixed(k);
const corr = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  const c = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
  return c / Math.sqrt(sum(x.map((v) => (v - mx) ** 2)) * sum(y.map((v) => (v - my) ** 2)));
};

// ---------- fires (13.2, 13.3) ----------
const F = d.fire, F0 = F.years[0], F1 = F.years[1], A0 = 2003; // Aqua from Jul 2002
const years = Array.from({ length: F1 - A0 + 1 }, (_, i) => A0 + i);
const fd = (r: string, c: string, y: number, m: number) => F.monthly[r][c][(y - F0) * 12 + m - 1] as number;
const yr = (r: string, c: string, y: number, ms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) => sum(ms.map((m) => fd(r, c, y, m)));
for (const r of ['mekong', 'red']) {
  const cells = F.monthly[r].cells;
  console.log(`[13.2] ${r}: 1 km cells crop ${cells.crop}, forest/wetland ${cells.forest}, other ${cells.other}`);
  const tot = Object.fromEntries(['crop', 'forest', 'other'].map((c) => [c, sum(years.map((y) => yr(r, c, y)))]));
  const all = tot.crop + tot.forest + tot.other;
  console.log(`[13.2] ${r}: fire-days ${A0}-${F1}: crop ${tot.crop} (${f(100 * tot.crop / all, 0)} %), forest ${tot.forest} (${f(100 * tot.forest / all, 0)} %), other ${tot.other} (${f(100 * tot.other / all, 0)} %)`);
  for (const c of ['crop', 'forest', 'other']) {
    const m = Array.from({ length: 12 }, (_, i) => mean(years.map((y) => fd(r, c, y, i + 1))) * 1000 / cells[c]);
    console.log(`[13.3] ${r} ${c}: per 1000 cells per month ` + m.map((v, i) => `${i + 1}:${f(v)}`).join(' ') + `; per year ${f(sum(m))}`);
  }
  const febApr = sum(years.map((y) => yr(r, 'crop', y, [2, 3, 4]))) / tot.crop;
  const maySep = sum(years.map((y) => yr(r, 'crop', y, [5, 6, 7, 8, 9]))) / tot.crop;
  console.log(`[13.3] ${r}: share of crop fire-days in Feb-Apr ${f(100 * febApr, 0)} %, May-Sep ${f(100 * maySep, 0)} %`);
  const ys = years.map((y) => yr(r, 'crop', y) * 1000 / cells.crop);
  const lo = ys.indexOf(Math.min(...ys)), hi = ys.indexOf(Math.max(...ys));
  console.log(`[13.3] ${r}: crop fire-days per 1000 cells per year: min ${years[lo]} ${f(ys[lo])}, max ${years[hi]} ${f(ys[hi])}; ` +
    `${A0}-07 mean ${f(mean(ys.slice(0, 5)))}, ${F1 - 4}-${F1} mean ${f(mean(ys.slice(-5)))}`);
  const fa = years.map((y) => yr(r, 'crop', y, [2, 3, 4]));
  const i0 = fa.indexOf(Math.min(...fa)), i1 = fa.indexOf(Math.max(...fa));
  console.log(`[13.3] ${r}: Feb-Apr crop fire-days range ${years[i0]} ${fa[i0]} .. ${years[i1]} ${fa[i1]}`);
  console.log(`[13.3] ${r}: crop fire-days per year ` + years.map((y, i) => `${y}:${Math.round(ys[i] * cells.crop / 1000)}`).join(' '));
  // Dry-season rain (Dec-Apr, CHIRPS region mean) vs Feb-Apr cropland fires
  const R0 = +clim.start.slice(0, 4), rain = clim.regions[r].rain as V;
  const dry = (y: number) => { const v = [rain[(y - 1 - R0) * 12 + 11], ...[0, 1, 2, 3].map((m) => rain[(y - R0) * 12 + m])]; return v.every(ok) ? sum(v as number[]) : null; };
  const pairs = years.map((y) => [dry(y), yr(r, 'crop', y, [2, 3, 4])] as [number | null, number]).filter((p): p is [number, number] => ok(p[0]));
  console.log(`[13.3] ${r}: r(Dec-Apr rain, Feb-Apr crop fire-days) = ${f(corr(pairs.map((p) => p[0]), pairs.map((p) => p[1])), 2)} over ${pairs.length} years`);
  if (r === 'mekong') for (const y of [2016, 2017, 2020, 2022, 2024]) console.log(`[13.3] mekong ${y}: Dec-Apr rain ${f(dry(y) ?? NaN, 0)} mm, Feb-Apr crop fire-days ${yr(r, 'crop', y, [2, 3, 4])}`);
}
console.log(`[13.2] mekong forest fire-days 2002 Feb-May ${sum([2, 3, 4, 5].map((m) => fd('mekong', 'forest', 2002, m)))} vs ${A0}-${F1} mean ${f(mean(years.map((y) => yr('mekong', 'forest', y, [2, 3, 4, 5]))), 0)}`);
for (const r of ['red', 'mekong']) {
  console.log(`[13.2] fire-${r} 2021-2025 hottest cells (days/yr): ` + layer(`fire-${r}`).top(3).map((c) => `${c.lon}E ${c.lat}N ${c.v}`).join('; '));
  const m = meta(`fire-${r}`);
  console.log(`[13.2] fire-${r} layer: ` + m.times.map((t: string, i: number) => `${t} mean ${f(m.stats[i].mean, 2)} p98 ${f(m.stats[i].p98, 1)} max ${f(m.stats[i].max, 1)}`).join(' | '));
}

// ---------- NO2, CO (13.4) ----------
if (d.air) {
  const S0 = d.air.months[0];
  for (const r of ['red', 'mekong']) {
    const A = d.air[r];
    for (const k of ['no2', 'co']) {
      const v = A[k] as V;
      const byM = Array.from({ length: 12 }, (_, m) => mean(v.filter((x, i) => i % 12 === m && ok(x)) as number[]));
      console.log(`[13.4] ${r} ${k}: mean ${f(mean(v.filter(ok) as number[]), 2)}; monthly clim ` + byM.map((x, i) => `${i + 1}:${f(x, k === 'co' ? 1 : 0)}`).join(' '));
      const ann = Array.from({ length: d.air.months[1] - S0 + 1 }, (_, i) => mean(v.slice(i * 12, i * 12 + 12).filter(ok) as number[]));
      console.log(`[13.4] ${r} ${k}: annual ` + ann.map((x, i) => `${S0 + i}:${f(x, 1)}`).join(' '));
    }
    const L = layer(`no2-${r}`);
    console.log(`[13.4] no2-${r} highest cells: ` + L.top(2).map((c) => `${c.lon}E ${c.lat}N ${c.v}`).join('; ') +
      (r === 'red' ? `; Ha Noi (105.85E 21.03N) ${f(L.at(105.85, 21.03), 1)}` : ''));
    const m = meta(`no2-${r}`);
    console.log(`[13.4] no2-${r} layer: mean ${f(m.stats[0].mean, 1)} p50 ${f(m.stats[0].p50, 1)} p98 ${f(m.stats[0].p98, 1)} max ${f(m.stats[0].max, 1)} umol/m2`);
  }
}

// ---------- CH4 (13.5) ----------
if (d.ch4) {
  for (const r of ['red', 'mekong']) {
    const C = d.ch4[r];
    const byM = Array.from({ length: 12 }, (_, m) => {
      const idx = C.xch4.map((_: unknown, i: number) => i).filter((i: number) => i % 12 === m && ok(C.xch4[i]));
      return { v: mean(idx.map((i: number) => C.xch4[i])), n: sum(idx.map((i: number) => C.n[i])), months: idx.length };
    });
    console.log(`[13.5] ${r}: XCH4 by calendar month (mean of monthly means, looks per cell summed over years, months with data): ` +
      byM.map((x, i) => `${i + 1}:${f(x.v, 0)}/${f(x.n, 0)}/${x.months}`).join(' '));
    const withData = C.xch4.filter(ok).length;
    console.log(`[13.5] ${r}: months with any XCH4 ${withData}/${C.xch4.length}; looks per 1.1 km cell ${d.ch4.months[0]}-${d.ch4.months[1]}: ${JSON.stringify(C.looks_per_cell)} (monthly looks are not quoted: EE inflates them)`);
    console.log(`[13.5] ${r}: mean ${d.ch4.months[0]}-${d.ch4.months[1]} XCH4 (cells with >= ${d.ch4.min_looks_map} looks): delta ${C.mean_2019_2025.delta}, same-latitude band 100-112E outside the delta ${C.mean_2019_2025.band}, difference ${f(C.mean_2019_2025.delta - C.mean_2019_2025.band, 1)} ppb`);
  }
  const C = layer('ch4-vietnam'), N = layer('ch4looks-vietnam');
  console.log('[13.5] ch4-vietnam highest 10 km cells (ppb, mean looks per 1.1 km cell): ' + C.top(4).map((c) => `${c.lon}E ${c.lat}N ${c.v} (${f(N.at(c.lon, c.lat), 0)})`).join('; '));
  for (const [nm, lon, lat] of [['NE Thailand', 103, 15], ['central Thailand', 100.5, 14], ['W Mekong', 105.6, 10.0], ['Red delta', 106.2, 20.5]] as const)
    console.log(`[13.5] looks per 1.1 km cell at ${nm}: ${f(N.at(lon, lat), 0)}; XCH4 ${f(C.at(lon, lat), 0)}`);
  for (const r of ['red', 'mekong']) { const x = d.ch4[r].xch4 as V; console.log(`[13.5] ${r} monthly XCH4 Jan-Apr 2019 ${x.slice(0, 4).map((v) => (ok(v) ? f(v, 0) : '-')).join(' ')}; Oct-Dec 2025 ${x.slice(81, 84).map((v) => (ok(v) ? f(v, 0) : '-')).join(' ')}`); }
  const m = meta('ch4-vietnam'), n = meta('ch4looks-vietnam');
  console.log(`[13.5] ch4-vietnam: p2 ${m.stats[0].p2} p50 ${m.stats[0].p50} p98 ${m.stats[0].p98}; looks p2 ${n.stats[0].p2} p50 ${n.stats[0].p50} p98 ${n.stats[0].p98} max ${n.stats[0].max}`);
}

// ---------- IPCC Tier 1 (13.5, 13.6) ----------
const sea = (sfw: number, sfp = SFP.dryShort, am: { rate: number; cfoa: number }[] = []) =>
  seasonCH4(EFC.southeastAsia, SEASON_DAYS.southeastAsia, sfw, sfp, am);
const base = sea(SFW.continuous);
console.log(`[13.5] Tier 1 SE Asia: continuous ${f(base)} kg CH4/ha/season = ${f(base * GWP_CH4 / 1000, 2)} t CO2e; AWD ${f(sea(SFW.multiple))} (${f(100 * (SFW.multiple - 1), 0)} %); single drainage ${f(sea(SFW.single))}`);
for (const rate of [3, 5]) console.log(`[13.5] straw ${rate} t/ha incorporated < 30 d: ${f(sea(SFW.continuous, SFP.dryShort, [{ rate, cfoa: CFOA.strawShort }]))} kg (x${f(sea(SFW.continuous, SFP.dryShort, [{ rate, cfoa: CFOA.strawShort }]) / base, 2)}); > 30 d: x${f(sea(SFW.continuous, SFP.dryShort, [{ rate, cfoa: CFOA.strawLong }]) / base, 2)}`);
console.log(`[13.5] pre-season flooded > 30 d: x${SFP.flooded}`);
console.log(`[13.6] 1 million ha, one season: continuous ${f(base, 0)} kt CH4 = ${f(base * GWP_CH4 / 1000, 2)} Mt CO2e; AWD saves ${f((base - sea(SFW.multiple)) * GWP_CH4 / 1000, 2)} Mt CO2e`);
console.log(`[13.6] GSO winter-spring 2024 Mekong 1,487.7 thousand ha x ${f(base)} kg = ${f(1487.7 * base / 1000, 0)} kt CH4 (Tier 1, continuous)`);
// BUR3 (2016): rice cultivation 1,774.75 kt CH4 = 49,693.02 kt CO2e (AR5 GWP 28); net national 316,734.96 kt CO2e
console.log(`[13.1] BUR3 rice share of agriculture excl. land (livestock 18,513.37 + 3C 65,047.60 kt): ${f(100 * 49693.02 / (18513.37 + 65047.6), 1)} %`);
console.log(`[13.1] BUR3 rice share of the net national total: ${f(100 * 49693.02 / 316734.96, 1)} %; rice CH4 at AR6 GWP 27: ${f(1774.75 * 27 / 1000, 1)} Mt CO2e`);
