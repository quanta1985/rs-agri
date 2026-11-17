// Recompute every Chapter 12 (coast) number quoted in the prose from public/data.
//   node scripts/coast_numbers.ts
// Published numbers (Anthony et al. 2015, Tran Thi et al. 2014, Nguyen Van Thao et al. 2013, Pham Quang Son &
// Nguyen Duc Anh 2016, Tinh et al. 2022) are cited in the chapter text, not computed here.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { areaWhere, decode, frameOf, type LayerMeta } from '../src/lib/layer.ts';
import { theilSen } from '../src/lib/change.ts';

const load = (id: string) => {
  const meta: LayerMeta = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
  const buf = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  return { meta, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
};
const f = (v: number, k = 0) => v.toFixed(k);
const kha = (ha: number) => (ha / 1000).toFixed(1);

// --- 12.2 land/water change in the two frames, mangrove change ---
for (const fr of ['ndcoast', 'cmcoast']) {
  for (const kind of ['coast-change', 'mangrove-change']) {
    const { meta, data } = load(`${kind}-${fr}`);
    const v = Float64Array.from(frameOf(meta, data, 0), (r) => decode(meta, r));
    const frame = areaWhere(meta, v, () => true).validHa;
    const parts = (meta.classes ?? []).map((c) => `${c.label.en} ${kha(areaWhere(meta, v, (x) => x === c.v).ha)} kha`);
    console.log(`[12.2] ${kind}-${fr}: frame ${kha(frame)} kha valid; ${parts.join('; ')}`);
  }
}

// --- 12.3 yearly land area per stretch ---
type Stretch = { name: { en: string }; area_ha: number; length_km: number | null; land_valid_ha: [number, number][] };
const s = JSON.parse(readFileSync('public/data/coast-series.json', 'utf8'));
const years: number[] = s.years;
for (const [k, st] of Object.entries(s.land) as [string, Stretch][]) {
  const ls = st.land_valid_ha.map(([l, v]) => (v >= 0.95 * st.area_ha ? l : NaN));
  const { slope } = theilSen(years, ls); // single years swing with the tide: robust trend over all well-observed years
  const ok = ls.filter(Number.isFinite).length, dy = 2023 - 1990;
  const rate = st.length_km ? ` = ${f(slope * 10 / st.length_km, 1)} m/yr over ${st.length_km} km` : '';
  const sw = ls.filter(Number.isFinite).map((v, i, a) => (i ? v - a[i - 1] : 0)).slice(1).map(Math.abs).sort((x, y) => x - y);
  console.log(`[12.3] ${k} (${st.name.en}): Theil-Sen ${f(slope, 1)} ha/yr${rate}; x ${dy} yr = ${f(slope * dy)} ha; median year-to-year swing ${f(sw[Math.floor(sw.length / 2)])} ha; ${ok}/${years.length} well-observed years`);
}

// --- 12.4 GMW mangrove area ---
const mg = s.mangrove as { years: number[]; ha: Record<string, number[]> };
for (const [k, v] of Object.entries(mg.ha)) {
  console.log(`[12.4] GMW ${k} (ha): ` + mg.years.map((y, i) => `${y} ${v[i]}`).join(', ') + `; 1996->2020 ${f(100 * (v[v.length - 1] / v[0] - 1), 1)} %; 2015->2020 ${f(v[v.length - 1] - v[mg.years.indexOf(2015)])} ha`);
}

// --- 12.5 dry-season standing water (ponds) ---
if (!s.ponds) console.log('[12.5] ponds not exported yet');
else {
  const p = s.ponds as { periods: string[]; region_ha: number[]; valid_share: number[]; provinces: Record<string, number[]> };
  console.log(`[12.5] Mekong standing dry-season water: ` + p.periods.map((t, i) => `${t} ${kha(p.region_ha[i])} kha (valid ${f(100 * p.valid_share[i])} %)`).join(', '));
  const top = Object.entries(p.provinces).sort((a, b) => (b[1][2] - b[1][0]) - (a[1][2] - a[1][0]));
  for (const [n, v] of top) console.log(`[12.5]   ${n}: ${v.map(kha).join(' -> ')} kha (1->2 ${kha(v[1] - v[0])}, 1->3 ${kha(v[2] - v[0])}, x${(v[1] / v[0]).toFixed(2)})`);
}
