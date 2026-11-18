// Simple remote-sensing yield model (FAO 2017 6.4.2): yield = a + b * index, judged by leave-one-out error.
// Official yields climb with technology, so both series can be detrended first (residuals from a linear time trend).
import { ols } from './change.ts';


/** Residuals of v from its least-squares line against t. */
export const detrend = (t: number[], v: number[]): number[] => {
  const f = ols(t, v);
  return v.map((y, i) => y - (f.intercept + f.slope * t[i]));
};

/** OLS of y on x with R^2. */
export const fit = (x: number[], y: number[]) => {
  const f = ols(x, y);
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  const sst = y.reduce((a, b) => a + (b - my) ** 2, 0);
  return { a: f.intercept, b: f.slope, r2: sst > 0 ? 1 - f.sse / sst : 0, n: y.length };
};

/** Leave-one-out RMSE: each point predicted by the line fitted to all the others (honest skill for a forecast). */
export const looRmse = (x: number[], y: number[]): number => {
  if (y.length < 3) return NaN;
  const se = y.map((yi, i) => {
    const f = ols(x.filter((_, k) => k !== i), y.filter((_, k) => k !== i));
    return (yi - (f.intercept + f.slope * x[i])) ** 2;
  });
  return Math.sqrt(se.reduce((a, b) => a + b, 0) / se.length);
};

/** RMSE of always predicting the mean of the other years (the baseline a model has to beat). */
export const looBaseline = (y: number[]): number => {
  const n = y.length;
  const s = y.reduce((a, b) => a + b, 0);
  return Math.sqrt(y.reduce((a, yi) => a + (yi - (s - yi) / (n - 1)) ** 2, 0) / n);
};
