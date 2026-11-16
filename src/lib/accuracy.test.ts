import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateArea } from './accuracy.ts';

test('estimateArea reproduces the Olofsson et al. (2014) worked example', () => {
  // Map classes: deforestation, forest gain, stable forest, stable non-forest; areas in 30 m pixels (0.09 ha).
  const n = [[66, 0, 5, 4], [0, 55, 8, 12], [1, 0, 153, 11], [2, 1, 9, 313]];
  const px = [200_000, 150_000, 3_200_000, 6_450_000];
  const e = estimateArea(n, px.map((x) => x * 0.09));
  assert.equal(Math.round(e.area[0]), 21_158); // paper: 21,158 ha
  assert.equal(Math.round(1.96 * e.se[0]), 6_158); // paper: +- 6,158 ha (95 %)
  assert.equal(e.user[0].toFixed(2), '0.88');
  assert.equal(e.producer[0].toFixed(2), '0.75');
  assert.equal(e.overall.toFixed(2), '0.95');
  assert.ok(Math.abs(e.area.reduce((a, b) => a + b, 0) - 900_000) < 1e-6); // areas add up to the map total
});

test('estimateArea returns the map area unchanged for a perfect sample', () => {
  const e = estimateArea([[10, 0], [0, 10]], [300, 700]);
  assert.deepEqual(e.area.map((a) => Math.round(a)), [300, 700]);
  assert.deepEqual(e.se, [0, 0]);
});

test('estimateArea rejects a matrix of the wrong size', () => {
  assert.throws(() => estimateArea([[1, 2]], [1, 2]));
});

test('SE is NaN when a mapped class has fewer than 2 points; empty map throws', () => {
  const e = estimateArea([[1, 0], [5, 95]], [100, 900]);
  assert.ok(e.se.every(Number.isNaN));
  assert.throws(() => estimateArea([[1, 1], [1, 1]], [0, 0]));
});
