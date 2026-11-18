import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, mulberry32, prepare, regEstimate, sampleIdx, simulate, sizeForCv, srsEstimate, stratEstimate } from './sampling.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('sampleIdx draws n distinct indices in range, reproducibly', () => {
  const a = sampleIdx(1000, 50, mulberry32(7));
  assert.equal(new Set(a).size, 50);
  assert.ok(a.every((i) => i >= 0 && i < 1000));
  assert.deepEqual(a, sampleIdx(1000, 50, mulberry32(7)));
  assert.equal(sampleIdx(5, 5, mulberry32(1)).sort().join(), '0,1,2,3,4');
});

test('SRS of the whole population has the exact total and zero SE', () => {
  const y = [1, 2, 3, 4];
  const e = srsEstimate(y, [0, 1, 2, 3], 4);
  close(e.total, 10);
  close(e.se, 0);
});

test('SRS SE matches Cochran: N sqrt((1-f) s^2 / n)', () => {
  const y = [0, 1, 0, 1, 1, 0, 0, 0, 1, 1];
  const e = srsEstimate(y, [0, 1, 2, 3], 10); // sample 0,1,0,1: mean 0.5, s^2 = 1/3
  close(e.total, 5);
  close(e.se, 10 * Math.sqrt((0.6 * (1 / 3)) / 4));
});

test('stratified estimator adds stratum totals and variances', () => {
  const y = [0, 0, 1, 1, 5, 7];
  const e = stratEstimate(y, [[0, 1], [4, 5]], [4, 2]);
  close(e.total, 4 * 0 + 2 * 6);
  close(e.se, 0); // stratum 1 sampled completely, stratum 0 has no variance
});

test('regression estimator is exact when y is a linear function of x', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const y = x.map((v) => 2 * v + 1);
  const e = regEstimate(y, x, [0, 3, 6], 8, 36);
  close(e.total, 2 * 36 + 8);
  close(e.b, 2);
  close(e.r, 1);
  close(e.se, 0);
});

test('regression estimator refuses fewer than 3 units', () => {
  assert.throws(() => regEstimate([1, 2], [1, 2], [0, 1], 10, 15));
});

test('allocate: proportional and Neyman, sums to n, at least 2 per stratum', () => {
  assert.deepEqual(allocate([600, 300, 100], 106), [62, 32, 12]);
  const ney = allocate([600, 300, 100], 100, [0, 1, 1]);
  assert.equal(ney.reduce((a, b) => a + b, 0), 100);
  assert.equal(ney[0], 2);
  assert.ok(ney[1] > ney[2]);
});

test('simulation: estimators are unbiased and stratification beats SRS when strata differ', () => {
  const N = 4000;
  const rng = mulberry32(3);
  const stratum = new Uint8Array(N).map((_, i) => (i < 2000 ? 0 : 1));
  const y = Float64Array.from(stratum, (s) => (rng() < (s ? 0.9 : 0.1) ? 1 : 0));
  const x = Float64Array.from(stratum, (s) => s);
  const p = { y, x, stratum, H: 2 };
  const q = prepare(p);
  const srs = simulate(p, q, 'srs', 100, 400, 11);
  const prop = simulate(p, q, 'prop', 100, 400, 11);
  const reg = simulate(p, q, 'reg', 100, 400, 11);
  for (const s of [srs, prop, reg]) assert.ok(Math.abs(s.mean - q.yTotal) < 0.02 * q.yTotal, `${s.mean} vs ${q.yTotal}`);
  assert.ok(prop.sd < 0.75 * srs.sd);
  assert.ok(reg.sd < 0.75 * srs.sd);
  assert.ok(Math.abs(srs.meanSe / srs.sd - 1) < 0.15);
});

test('sizeForCv: n0 = (sd / (cv mean))^2 with finite population correction', () => {
  assert.equal(sizeForCv(1e9, 0.5, 0.5, 0.05), 400);
  assert.ok(sizeForCv(500, 0.5, 0.5, 0.05) < 400);
});
