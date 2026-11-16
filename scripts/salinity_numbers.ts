// Recompute every Chapter 10 (salinity) number quoted in the prose from public/data.
//   node scripts/salinity_numbers.ts
// Published numbers (intrusion lengths, damage, dates) are not computed here: each is cited in the chapter text,
// the Figure 10.2 source line and src/islands/IntrusionChart.tsx (Nguyen Ngoc Anh 2017; MARD 2020; SGGP 20/6/2020;
// Bao Chinh phu 23/2/2024; Bao Nong nghiep 22/3/2024; SGGP 5/3/2022).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { areaWhere, decodeFrame, frameOf, mercToLonLat, type LayerMeta, type Raw } from '../src/lib/layer.ts';

const load = (id: string): { meta: LayerMeta; data: Raw } => {
  const meta: LayerMeta = JSON.parse(readFileSync(`public/data/${id}/meta.json`, 'utf8'));
  const buf = gunzipSync(readFileSync(`public/data/${id}/values.binz`));
  if (meta.dtype !== 'uint8') throw new Error(`${id}: expected uint8`);
  return { meta, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
};
const pct = (a: number, b: number) => (100 * a / b).toFixed(1);
const kha = (ha: number) => (ha / 1000).toFixed(0);

// --- 10.3 dry-season EVI anomaly (Feb-Apr, minus the 2010-2024 median) ---
type Ring = number[][];
const prov = JSON.parse(readFileSync('public/data/boundaries/provinces.json', 'utf8')).features
  .filter((f: { properties: { region: string; kind: string } }) => f.properties.region === 'mekong' && f.properties.kind === 'province');
const polys = (g: { type: string; coordinates: unknown }): Ring[][] => (g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.coordinates as Ring[][]);
const inRing = (r: Ring, x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPoly = (ps: Ring[][], x: number, y: number) => ps.some((p) => inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)));
// Coastal = provinces with a sea coast (salinity enters through the estuaries); inland = the rest.
const COASTAL = new Set(['Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau', 'Kiên Giang']);

const an = load('sal-evianom-mekong');
const m = an.meta;
const owner = new Int16Array(m.width * m.height).fill(-1);
const shapes = prov.map((f: { geometry: { type: string; coordinates: unknown } }) => polys(f.geometry));
for (let row = 0; row < m.height; row++) for (let col = 0; col < m.width; col++) {
  const i = row * m.width + col;
  if (an.data[i] === m.nodata) continue;
  const [lon, lat] = mercToLonLat(m.origin[0] + (col + 0.5) * m.res, m.origin[1] - (row + 0.5) * m.res);
  owner[i] = shapes.findIndex((s: Ring[][]) => inPoly(s, lon, lat));
}
console.log('provinces', prov.map((f: { properties: { name: string } }) => f.properties.name).join(', '));
m.times.forEach((year, t) => {
  const v = decodeFrame(m, frameOf(m, an.data, t));
  const all = areaWhere(m, v, (x) => x <= -0.05);
  const strong = areaWhere(m, v, (x) => x <= -0.1);
  const mask = (keep: (k: number) => boolean) => v.map((x, i) => (owner[i] >= 0 && keep(owner[i]) ? x : NaN));
  const isC = (k: number) => COASTAL.has(prov[k].properties.name);
  const c = areaWhere(m, mask(isC), (x) => x <= -0.05), inl = areaWhere(m, mask((k) => !isC(k)), (x) => x <= -0.05);
  console.log(`${year}: EVI anomaly <= -0.05 on ${pct(all.ha, all.validHa)} % of the delta (${kha(all.ha)} kha), <= -0.10 on ${pct(strong.ha, strong.validHa)} %;`,
    `coastal provinces ${pct(c.ha, c.validHa)} %, inland ${pct(inl.ha, inl.validHa)} %; median ${m.stats[t].p50}`);
  const per = prov.map((f: { properties: { name: string } }, k: number) => {
    const r = areaWhere(m, mask((j) => j === k), (x) => x <= -0.05);
    return `${f.properties.name} ${pct(r.ha, r.validHa)}`;
  });
  console.log('   per province (% <= -0.05):', per.join(' | '));
});

// --- 10.4 NDVI vs SI at the Ben Tre site ---
const nd = load('sal-ndvi-bentre-2024'), si = load('sal-si-bentre-2024');
const ndv = decodeFrame(nd.meta, nd.data), siv = decodeFrame(si.meta, si.data);
let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
for (let i = 0; i < ndv.length; i++) {
  const x = ndv[i], y = siv[i];
  if (Number.isNaN(x) || Number.isNaN(y)) continue;
  n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
}
const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
console.log(`Ben Tre 2024: NDVI median ${nd.meta.stats[0].p50}, SI median ${si.meta.stats[0].p50}, Pearson r(NDVI, SI) = ${r.toFixed(2)} (n = ${n})`);
const low = areaWhere(nd.meta, ndv, (x) => x < 0.2), hiSi = areaWhere(si.meta, siv, (x) => x > 0.1);
console.log(`  NDVI < 0.2 on ${pct(low.ha, low.validHa)} % of the frame; SI > 0.10 on ${pct(hiSi.ha, hiSi.validHa)} %`);

// --- 10.5 Dynamic World class shares 2018 vs 2024 ---
for (const id of ['dw-bentre', 'dw-camau']) {
  const L = load(id);
  const names = (L.meta.classes ?? []).map((c) => [c.v, c.label.en] as const);
  const shares = L.meta.times.map((_, t) => {
    const v = decodeFrame(L.meta, frameOf(L.meta, L.data, t));
    return Object.fromEntries(names.map(([k, lab]) => { const a = areaWhere(L.meta, v, (x) => x === k); return [lab, Number(pct(a.ha, a.validHa))]; }));
  });
  console.log(id, L.meta.times.join(' -> '));
  for (const [, lab] of names) console.log(`  ${lab.padEnd(20)} ${String(shares[0][lab]).padStart(5)} % -> ${String(shares[1][lab]).padStart(5)} %`);
  // transitions from crops (4) and to water (0)
  const a = frameOf(L.meta, L.data, 0), b = frameOf(L.meta, L.data, 1);
  let crop0 = 0, cropToWater = 0, cropToTrees = 0, cropToBuilt = 0, valid = 0, toWater = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === L.meta.nodata || b[i] === L.meta.nodata) continue;
    valid++;
    if (a[i] !== 0 && b[i] === 0) toWater++;
    if (a[i] !== 4) continue;
    crop0++;
    if (b[i] === 0) cropToWater++; else if (b[i] === 1) cropToTrees++; else if (b[i] === 6) cropToBuilt++;
  }
  console.log(`  of 2018 crops: -> water ${pct(cropToWater, crop0)} %, -> trees ${pct(cropToTrees, crop0)} %, -> built ${pct(cropToBuilt, crop0)} %; any -> water ${pct(toWater, valid)} % of frame`);
}

// --- 10.1 Predict: L ~ Q^(-1/3) and Q^(-1/7) when the discharge halves ---
console.log(`halving Q: +${((0.5 ** (-1 / 3) - 1) * 100).toFixed(0)} % (exp -1/3), +${((0.5 ** (-1 / 7) - 1) * 100).toFixed(0)} % (exp -1/7)`);
