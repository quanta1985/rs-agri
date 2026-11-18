import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite, dominant, zoneTable } from './risk.ts';

test('composite is a weighted mean that skips missing indicators and zero weights', () => {
  const a = [100, 0, NaN, NaN];
  const b = [0, 50, 40, NaN];
  assert.deepEqual([...composite([a, b], [1, 1])].slice(0, 3), [50, 25, 40]);
  assert.ok(Number.isNaN(composite([a, b], [1, 1])[3]));
  assert.deepEqual([...composite([a, b], [3, 1])].slice(0, 2), [75, 12.5]);
  assert.equal(composite([a, b], [1, 0])[1], 0);
  assert.ok(Number.isNaN(composite([a, b], [1, 0])[2])); // only the zero-weight indicator has data
});

test('dominant picks the largest weighted score, -1 when nothing contributes', () => {
  const a = [80, 10, 0];
  const b = [60, 30, 0];
  assert.deepEqual([...dominant([a, b], [1, 1])], [0, 1, -1]);
  assert.deepEqual([...dominant([a, b], [1, 2])], [1, 1, -1]);
});

test('zoneTable: area-weighted mean, high share and top indicator per zone', () => {
  // 2 x 2 grid, row 0 cells are 1 ha, row 1 cells 3 ha; zones 0 | 1 by column, 255 = outside
  const index = [60, 20, 40, NaN];
  const dom = [0, 1, 1, -1];
  const zones = [0, 1, 0, 255];
  const t = zoneTable(index, dom, zones, 2, (r) => (r === 0 ? 1 : 3), 2, 2);
  assert.equal(t.length, 2);
  assert.equal(t[0].ha, 4);
  assert.equal(t[0].mean, (60 + 3 * 40) / 4);
  assert.equal(t[0].highShare, 0.25);
  assert.equal(t[0].top, 1); // indicator 1 dominates 3 ha, indicator 0 only 1 ha
  assert.deepEqual([t[1].ha, t[1].mean, t[1].highShare, t[1].top], [1, 20, 0, 1]);
});
