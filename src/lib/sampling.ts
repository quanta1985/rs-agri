// Area estimation from a sample of map cells (FAO 2017 ch.3 and 5.2-5.3; Cochran 1977 ch.5-7).
// Population = N cells; y = target area in the cell (e.g. ha of rice), x = auxiliary area known for every cell (e.g.
// ha of cropland on a land cover map), stratum = small integer per cell. Estimators return a total (sum of y) and its SE.
import { decodeFrame, frameOf, pixelAreaHa, type LayerMeta, type Raw } from './layer.ts';

export type Rng = () => number;
export type Estimate = { total: number; se: number };
export type Population = { y: Float64Array; x: Float64Array; stratum: Uint8Array; H: number };
export type Method = 'srs' | 'prop' | 'neyman' | 'reg';

/** Small seeded PRNG (mulberry32): same seed, same samples in the browser and in the numbers script. */
export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** n distinct indices of 0..N-1 (Floyd's algorithm, O(n)). */
export const sampleIdx = (N: number, n: number, rng: Rng): number[] => {
  if (n > N || n < 0) throw new Error('sample size must be between 0 and N');
  const s = new Set<number>();
  for (let j = N - n; j < N; j++) {
    const t = Math.floor(rng() * (j + 1));
    s.add(s.has(t) ? j : t);
  }
  return [...s];
};

const meanVar = (v: number[]): [number, number] => {
  const n = v.length;
  const m = v.reduce((a, b) => a + b, 0) / n;
  return [m, n > 1 ? v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) : NaN];
};

/** Expansion estimator of a simple random sample without replacement (with finite population correction). */
export const srsEstimate = (y: ArrayLike<number>, idx: number[], N: number): Estimate => {
  const [m, s2] = meanVar(idx.map((i) => y[i]));
  const n = idx.length;
  return { total: N * m, se: N * Math.sqrt(((1 - n / N) * s2) / n) };
};

/** Stratified expansion estimator: samples[h] = indices drawn in stratum h, Nh[h] = its size. */
export const stratEstimate = (y: ArrayLike<number>, samples: number[][], Nh: number[]): Estimate => {
  let total = 0;
  let v = 0;
  samples.forEach((idx, h) => {
    if (!Nh[h]) return;
    const [m, s2] = meanVar(idx.map((i) => y[i]));
    total += Nh[h] * m;
    v += (Nh[h] ** 2 * (1 - idx.length / Nh[h]) * s2) / idx.length;
  });
  return { total, se: Math.sqrt(v) };
};

/** Regression estimator (FAO 2017 5.3): y on x in the sample, corrected by the known population total of x. */
export const regEstimate = (y: ArrayLike<number>, x: ArrayLike<number>, idx: number[], N: number, xTotal: number): Estimate & { b: number; r: number } => {
  const n = idx.length;
  if (n < 3) throw new Error('the regression estimator needs at least 3 sampled units');
  const ys = idx.map((i) => y[i]);
  const xs = idx.map((i) => x[i]);
  const [my, syy] = meanVar(ys);
  const [mx, sxx] = meanVar(xs);
  const sxy = ys.reduce((a, yi, k) => a + (yi - my) * (xs[k] - mx), 0) / (n - 1);
  const b = sxx > 0 ? sxy / sxx : 0;
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  const se2 = ys.reduce((a, yi, k) => a + (yi - my - b * (xs[k] - mx)) ** 2, 0) / (n - 2);
  return { total: N * (my + b * (xTotal / N - mx)), se: N * Math.sqrt(((1 - n / N) * se2) / n), b, r };
};

/** Integer allocation of n over strata, each >= 2 (and <= Nh): proportional to Nh, or to Nh*Sh (Neyman) when Sh given. */
export const allocate = (Nh: number[], n: number, Sh?: number[]): number[] => {
  const live = Nh.map((N) => N >= 2); // a stratum of 1 unit gets no sample: its variance cannot be estimated
  const out: number[] = live.map((l) => (l ? 2 : 0)); // 2 per stratum so its variance can be estimated
  const w = Nh.map((N, h) => (live[h] ? N * (Sh ? Sh[h] : 1) : 0));
  const W = w.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, n - out.reduce((a, b) => a + b, 0));
  const raw = w.map((x, h) => (live[h] ? (W > 0 ? (rest * x) / W : rest / live.filter(Boolean).length) : 0));
  raw.forEach((x, h) => { out[h] = Math.min(Nh[h], out[h] + Math.floor(x)); });
  // hand out what rounding left over, largest remainder first
  const order = raw.map((x, h) => [x - Math.floor(x), h]).sort((a, b) => b[0] - a[0]).map((p) => p[1]);
  let left = n - out.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0 && k < 10 * order.length; k++) {
    const h = order[k % order.length];
    if (live[h] && out[h] < Nh[h]) { out[h]++; left--; }
  }
  return out;
};

/** Per-population constants every draw needs (computed once). */
export const prepare = (p: Population) => {
  const members: number[][] = Array.from({ length: p.H }, () => []);
  p.stratum.forEach((s, i) => members[s]?.push(i));
  const Nh = members.map((m) => m.length);
  const Sh = members.map((m) => Math.sqrt(meanVar(m.map((i) => p.y[i]))[1] || 0));
  let yTotal = 0;
  let xTotal = 0;
  for (let i = 0; i < p.y.length; i++) { yTotal += p.y[i]; xTotal += p.x[i]; }
  return { members, Nh, Sh, yTotal, xTotal, N: p.y.length };
};
export type Prepared = ReturnType<typeof prepare>;

/** One sample of size n with the given design -> estimate of the total of y, plus the cells drawn. */
export const draw = (p: Population, q: Prepared, method: Method, n: number, rng: Rng): Estimate & { idx: number[] } => {
  if (method === 'srs' || method === 'reg') {
    const idx = sampleIdx(q.N, n, rng);
    const e = method === 'srs' ? srsEstimate(p.y, idx, q.N) : regEstimate(p.y, p.x, idx, q.N, q.xTotal);
    return { total: e.total, se: e.se, idx };
  }
  const nh = allocate(q.Nh, n, method === 'neyman' ? q.Sh : undefined);
  const samples = q.members.map((m, h) => sampleIdx(m.length, nh[h], rng).map((k) => m[k]));
  return { ...stratEstimate(p.y, samples, q.Nh), idx: samples.flat() };
};

/** Repeat a design `reps` times: the spread of the estimates is the true sampling error the SE formula estimates. */
export const simulate = (p: Population, q: Prepared, method: Method, n: number, reps: number, seed: number) => {
  const rng = mulberry32(seed);
  const totals: number[] = [];
  let seSum = 0;
  for (let k = 0; k < reps; k++) {
    const e = draw(p, q, method, n, rng);
    totals.push(e.total);
    seSum += e.se;
  }
  const [mean, v] = meanVar(totals);
  return { totals, mean, sd: Math.sqrt(v), meanSe: seSum / reps };
};

export const STRATA_CUTS = [25, 75]; // % cropland of the cell on the auxiliary map: < 25, 25-75, >= 75
export const SEED = 2026;
export const AUX_STEP = 2; // lc-cropfrac step used as x: 0 WorldCover, 1 Dynamic World, 2 Esri

/**
 * Chapter 5 population from two layers on the same grid: y = rice area of the cell (rice-season map, last step >= 1
 * season; the map only covers cells with >= 50 % cropland, so its no-data counts as no rice), x = cropland area on
 * the auxiliary map (cropland share layer lc-cropfrac, step AUX_STEP = Esri 2021: WorldCover itself built the rice map's
 * cropland mask, so it would make the strata look better than they are), strata from that share. Cells outside the region outline are dropped.
 */
export const populationFromLayers = (
  rice: { meta: LayerMeta; data: Raw }, crop: { meta: LayerMeta; data: Raw }, cropStep = AUX_STEP,
): { p: Population; q: Prepared; cell: number[]; width: number; height: number } => {
  const m = rice.meta;
  const c0 = crop.meta;
  if (m.width !== c0.width || m.height !== c0.height || m.res !== c0.res || m.origin[0] !== c0.origin[0] || m.origin[1] !== c0.origin[1]) {
    throw new Error('rice and cropland grids differ');
  }
  const r = decodeFrame(m, frameOf(m, rice.data, m.times.length - 1));
  const c = decodeFrame(crop.meta, frameOf(crop.meta, crop.data, cropStep));
  const y: number[] = [], x: number[] = [], s: number[] = [], cell: number[] = [];
  for (let row = 0; row < m.height; row++) {
    const a = pixelAreaHa(m, row);
    for (let col = 0; col < m.width; col++) {
      const i = row * m.width + col;
      if (Number.isNaN(c[i])) continue;
      y.push(r[i] >= 1 ? a : 0);
      x.push((c[i] / 100) * a);
      s.push(c[i] < STRATA_CUTS[0] ? 0 : c[i] < STRATA_CUTS[1] ? 1 : 2);
      cell.push(i);
    }
  }
  const p: Population = { y: Float64Array.from(y), x: Float64Array.from(x), stratum: Uint8Array.from(s), H: 3 };
  return { p, q: prepare(p), cell, width: m.width, height: m.height };
};

/** Simple random sample size for a target coefficient of variation of the total (FAO 2017 3.2; Cochran eq. 4.2). */
export const sizeForCv = (N: number, mean: number, sd: number, cv: number): number => {
  const n0 = (sd / (cv * mean)) ** 2;
  return Math.ceil(n0 / (1 + n0 / N));
};
