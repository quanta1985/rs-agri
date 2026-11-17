// Recompute every Chapter 11 (soil-terrain) number quoted in the prose from public/data.
//   node scripts/soil-terrain_numbers.ts
// Published numbers (acid sulfate area, Minderhoud et al. 2017/2019/2020, Erban et al. 2014, IPCC 2021, DeltaDTM MAE)
// are cited in the chapter text, not computed here.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decode, mercToLonLat, type LayerMeta } from '../src/lib/layer.ts';

const values = (id: string) => {
  const meta: LayerMeta = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
  const buf = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  const raw = meta.dtype === 'uint8' ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { meta, v: Float64Array.from(raw, (r) => decode(meta, r)) };
};
const f = (v: number, k = 1) => v.toFixed(k);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// --- 11.1 SoilGrids ---
for (const r of ['red', 'mekong']) {
  for (const p of ['ph', 'soc', 'clay']) {
    const { meta, v } = values(`soil-${p}-${r}`);
    const ok = Array.from(v).filter(Number.isFinite);
    let iMin = -1, iMax = -1;
    v.forEach((x, i) => { if (!Number.isFinite(x)) return; if (iMin < 0 || x < v[iMin]) iMin = i; if (iMax < 0 || x > v[iMax]) iMax = i; });
    const ll = (i: number) => mercToLonLat(meta.origin[0] + ((i % meta.width) + 0.5) * meta.res, meta.origin[1] - (Math.floor(i / meta.width) + 0.5) * meta.res).map((x) => x.toFixed(2)).join(', ');
    let extra = '';
    if (p === 'ph') extra = `; share < 5.5: ${f(100 * ok.filter((x) => x < 5.5).length / ok.length)} %, < 4.5: ${f(100 * ok.filter((x) => x < 4.5).length / ok.length, 2)} %`;
    console.log(`[11.1] ${r} ${p}: median ${f(median(ok))}, min ${f(v[iMin])} at ${ll(iMin)}, max ${f(v[iMax])} at ${ll(iMax)}${extra}`);
  }
}

// --- 11.3 points, 11.4 hypsometry ---
const h = JSON.parse(readFileSync('public/data/terrain-hypso.json', 'utf8'));
for (const [k, p] of Object.entries(h.points) as [string, { name: { vi: string }; dtm: number; cop: number; ph: number }][]) {
  console.log(`[11.3] ${k} (${p.name.vi}): DeltaDTM ${p.dtm} m, Copernicus ${p.cop} m, difference ${f(p.cop - p.dtm, 2)} m, SoilGrids pH ${p.ph}`);
}
const LO = h.bins_dm[0];
for (const r of ['mekong', 'red']) {
  const R = h.regions[r];
  for (const d of ['dtm', 'cop']) {
    const b: number[] = R[d].below;
    const sh = (m: number) => f(100 * b[Math.round(m * 10) - LO - 1] / R[d].valid_ha);
    const med = (LO + b.findIndex((x) => x >= R[d].valid_ha / 2) + 1) / 10;
    console.log(`[11.4] ${r} ${d}: below 0 m ${sh(0)} %, 0.5 m ${sh(0.5)}, 1 m ${sh(1)}, 1.5 m ${sh(1.5)}, 2 m ${sh(2)}, 3 m ${sh(3)}, 5 m ${sh(5)} %; median ~${f(med)} m; area used ${f(R[d].valid_ha / 1e6, 2)} M ha of ${f(R.area_ha / 1e6, 2)} M ha`);
  }
}
for (const id of ['dem-dtm-mekong', 'dem-cop-mekong', 'dem-dtm-red']) {
  const { v } = values(id);
  console.log(`[11.3] ${id} 250 m cells: median ${f(median(Array.from(v).filter(Number.isFinite)), 2)} m`);
}

// --- 11.5 arithmetic in the Predict ---
const sub = 1.1, yrs = 2050 - 2025, slr = 10;
console.log(`[11.5] subsidence ${sub} cm/yr x ${yrs} yr = ${f(sub * yrs)} cm vs ${slr} cm SLR (ratio ${f(sub * yrs / slr)}); relative rise ${f(sub * yrs + slr)} cm; 1.1 cm/yr vs 3.7 mm/yr = ${f(11 / 3.7)}x`);
console.log(`[11.5] Minderhoud 2020: share above sea level 2100, M3 - B1 = ${57 - 32} points`);
