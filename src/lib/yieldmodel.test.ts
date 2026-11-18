import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detrend, fit, looBaseline, looRmse } from './yieldmodel.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('detrend removes a linear trend exactly', () => {
  for (const r of detrend([2001, 2002, 2003, 2004], [5, 5.2, 5.4, 5.6])) close(r, 0);
});

test('fit recovers a perfect line with R^2 = 1', () => {
  const f = fit([0.5, 0.6, 0.7], [4, 5, 6]);
  close(f.b, 10);
  close(f.a, -1);
  close(f.r2, 1);
});

test('leave-one-out RMSE is 0 on a perfect line and beats the mean baseline', () => {
  close(looRmse([1, 2, 3, 4], [2, 4, 6, 8]), 0);
  assert.ok(looBaseline([2, 4, 6, 8]) > 0);
});

test('leave-one-out baseline: predicting the mean of the others', () => {
  // y = [0, 3]: each point is predicted by the other one -> errors 3, 3
  close(looBaseline([0, 3]), 3);
});
