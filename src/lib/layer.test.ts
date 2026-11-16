import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaWhere, colorize, colorizeValues, decode, decodeFrame, frameOf, layerQuad, lonLatToMerc, mercToLonLat, pixelAreaHa, pixelAt, ramp, swipe, type LayerMeta } from './layer.ts';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

// 4 x 3 grid of 10 m (ground) pixels at the An Giang site latitude, uint8 with nodata 255
const lat = 10.45, res = 10 / Math.cos((lat * Math.PI) / 180);
const [mx, my] = lonLatToMerc(105.08, lat);
const meta: LayerMeta = {
  id: 't', region: 'angiang', title: { vi: '', en: '' }, units: null, kind: 'continuous', palette: 'gray', range: [0, 10], classes: null,
  crs: 'EPSG:3857', origin: [mx, my], res, ground_res_m: 10, width: 4, height: 3,
  dtype: 'uint8', scale: 0.5, offset: -1, nodata: 255, times: ['a', 'b'], stats: [], provenance: {},
};

test('Web Mercator round-trips and matches the EPSG:3857 definition', () => {
  const [x, y] = lonLatToMerc(106.85, 10.8);
  // pyproj EPSG:4326 -> EPSG:3857 for (106.85, 10.8)
  near(x, 11894487.591, 0.01); near(y, 1209433.842, 0.01);
  const [lon, la] = mercToLonLat(x, y);
  near(lon, 106.85, 1e-9); near(la, 10.8, 1e-9);
});

test('quad corners are UL, UR, LR, LL and pixelAt inverts them', () => {
  const q = layerQuad(meta);
  near(q[0][0], 105.08, 1e-9); near(q[0][1], lat, 1e-9);
  assert.ok(q[1][0] > q[0][0] && q[3][1] < q[0][1]);
  const px = (row: number, col: number) => mercToLonLat(mx + (col + 0.5) * res, my - (row + 0.5) * res);
  assert.deepEqual(pixelAt(meta, ...px(0, 0)), { row: 0, col: 0 });
  assert.deepEqual(pixelAt(meta, ...px(2, 3)), { row: 2, col: 3 });
  assert.equal(pixelAt(meta, ...mercToLonLat(mx - 1, my - 1)), null);
  assert.equal(pixelAt(meta, ...px(3, 0)), null);
});

test('pixel ground area is ~(ground_res)^2 near the centre latitude', () => {
  near(pixelAreaHa(meta, 1), 0.01, 1e-5); // 10 m x 10 m = 0.01 ha
});

test('decode applies scale/offset and nodata -> NaN', () => {
  assert.equal(decode(meta, 4), 1);
  assert.ok(Number.isNaN(decode(meta, 255)));
});

test('frameOf slices band-sequential data', () => {
  const data = new Uint8Array(24).map((_, i) => i);
  assert.deepEqual([...frameOf(meta, data, 1)], Array.from({ length: 12 }, (_, i) => i + 12));
});

test('colorize: ramp ends, nodata transparent, clearBelow transparent, mask colour', () => {
  const raw = new Uint8Array([2, 22, 255, 0]); // values 0, 10, nodata, -1
  const m = { ...meta, width: 4, height: 1 };
  const c = colorize(m, raw);
  assert.deepEqual([...c.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...c.slice(4, 8)], [255, 255, 255, 255]);
  assert.equal(c[11], 0);
  assert.equal(c[15], 255); // -1 clamps to black
  const k = colorize(m, raw, { clearBelow: 0 });
  assert.equal(k[15], 0);
  const w = colorize(m, raw, { mask: (v) => v > 5, maskColor: [1, 2, 3] });
  assert.equal(w[3], 0);
  assert.deepEqual([...w.slice(4, 8)], [1, 2, 3, 255]);
});

test('colorize classes uses class colours', () => {
  const m: LayerMeta = { ...meta, kind: 'classes', scale: 1, offset: 0, width: 2, height: 1, classes: [{ v: 1, color: '#ff0000', label: { vi: '', en: '' } }] };
  const c = colorize(m, new Uint8Array([1, 2]));
  assert.deepEqual([...c.slice(0, 4)], [255, 0, 0, 255]);
  assert.equal(c[7], 0);
});

test('ramp interpolates and clamps', () => {
  assert.deepEqual(ramp('gray', 0.5), [128, 128, 128]);
  assert.deepEqual(ramp('gray', 2), [255, 255, 255]);
});

test('swipe takes columns left of the split from a', () => {
  const a = new Uint8ClampedArray(2 * 2 * 4).fill(1), b = new Uint8ClampedArray(2 * 2 * 4).fill(2);
  const s = swipe(a, b, 2, 0.5);
  assert.deepEqual([...s.slice(0, 8)], [1, 1, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual([...s.slice(8, 16)], [1, 1, 1, 1, 2, 2, 2, 2]);
});

test('areaWhere sums ground area of matching valid pixels', () => {
  const raw = new Uint8Array(12).fill(22); // all value 10
  raw[0] = 255; raw[1] = 2;
  const { ha, validHa } = areaWhere(meta, decodeFrame(meta, raw), (v) => v > 5);
  near(validHa, 11 * 0.01, 1e-5);
  near(ha, 10 * 0.01, 1e-5);
});

test('colorizeValues: ramp via lookup table, NaN transparent, mask mode', () => {
  const c = colorizeValues([0, 10, NaN], { palette: 'gray', range: [0, 10] });
  assert.deepEqual([...c.slice(0, 8)], [0, 0, 0, 255, 255, 255, 255, 255]);
  assert.equal(c[11], 0);
  const k = colorizeValues([1, 9], { mask: (v) => v > 5, color: [9, 8, 7] });
  assert.equal(k[3], 0);
  assert.deepEqual([...k.slice(4, 8)], [9, 8, 7, 255]);
});
