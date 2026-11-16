// Accuracy and bias-corrected area from a confusion matrix of a stratified random sample (strata = map classes).
// Olofsson et al. (2014), Remote Sensing of Environment 148: 42-57, eq. 2-11; FAO (2017) Annex "direct calibration".

export type AreaEstimate = {
  /** Estimated area of each reference class (same units as mappedArea). */
  area: number[];
  /** Standard error of each area. */
  se: number[];
  /** User's accuracy of each map class (row), producer's accuracy of each reference class (column), overall accuracy. */
  user: number[]; producer: number[]; overall: number;
};

/**
 * `n[i][j]` = sample count mapped as class i and labelled j on the reference; `mappedArea[i]` = map area of class i.
 * Rows with no sample get no weight in the proportions (their mapped area is then unaccounted for); the SE is NaN when a
 * mapped class has fewer than 2 sample points (its variance cannot be estimated).
 */
export const estimateArea = (n: number[][], mappedArea: number[]): AreaEstimate => {
  const k = mappedArea.length;
  if (n.length !== k || n.some((r) => r.length !== k)) throw new Error('confusion matrix must be k x k with k = mappedArea.length');
  const total = mappedArea.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error('mapped area must be positive');
  const W = mappedArea.map((a) => a / total);
  const ni = n.map((r) => r.reduce((a, b) => a + b, 0));
  // Estimated area proportion of each cell: p_ij = W_i n_ij / n_i.
  const p = n.map((r, i) => r.map((x) => (ni[i] ? (W[i] * x) / ni[i] : 0)));
  const pj = Array.from({ length: k }, (_, j) => p.reduce((s, r) => s + r[j], 0));
  const se = pj.map((_, j) => Math.sqrt(n.reduce((s, r, i) => {
    if (W[i] === 0) return s;
    if (ni[i] < 2) return NaN;
    const f = r[j] / ni[i];
    return s + (W[i] ** 2 * f * (1 - f)) / (ni[i] - 1);
  }, 0)) * total);
  const user = n.map((r, i) => (ni[i] ? r[i] / ni[i] : NaN));
  const producer = pj.map((x, j) => (x ? p[j][j] / x : NaN));
  return { area: pj.map((x) => x * total), se, user, producer, overall: p.reduce((s, r, i) => s + r[i], 0) };
};
