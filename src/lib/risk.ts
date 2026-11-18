// Weighted overlay of hazard indicators (Chapter 14): scores 0-100 per cell, NaN = no data.

export const HIGH = 50; // composite score at or above = "high" in the tables

/**
 * Weighted mean of the indicator scores in each cell. Weights are renormalised over the indicators that have a value
 * in that cell, so a missing indicator neither counts as 0 nor drags the mean down. NaN where no weighted indicator has data.
 */
export function composite(steps: ArrayLike<number>[], weights: number[]): Float32Array {
  const n = steps[0]?.length ?? 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let k = 0; k < steps.length; k++) {
      const v = steps[k][i];
      if (Number.isNaN(v) || weights[k] <= 0) continue;
      s += weights[k] * v; w += weights[k];
    }
    out[i] = w > 0 ? s / w : NaN;
  }
  return out;
}

/** Index of the indicator with the largest weighted score in each cell; -1 where every weighted score is 0 or missing. */
export function dominant(steps: ArrayLike<number>[], weights: number[]): Int8Array {
  const n = steps[0]?.length ?? 0;
  const out = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 0; k < steps.length; k++) {
      const c = weights[k] * steps[k][i];
      if (c > best) { best = c; out[i] = k; }
    }
  }
  return out;
}

export type ZoneRow = { zone: number; ha: number; mean: number; highShare: number; top: number };

/**
 * Per zone (province index, 255 = none): cropland area, area-weighted mean composite, share of the area with
 * composite >= HIGH, and the indicator with the largest area-weighted contribution. `rowHa(r)` = cell area of row r.
 */
export function zoneTable(index: ArrayLike<number>, dom: ArrayLike<number>, zones: ArrayLike<number>, width: number,
  rowHa: (row: number) => number, nZones: number, nInd: number): ZoneRow[] {
  const ha = new Float64Array(nZones), sum = new Float64Array(nZones), high = new Float64Array(nZones);
  const domHa = Array.from({ length: nZones }, () => new Float64Array(nInd));
  for (let i = 0; i < index.length; i++) {
    const z = zones[i], v = index[i];
    if (z >= nZones || Number.isNaN(v)) continue;
    const a = rowHa(Math.floor(i / width));
    ha[z] += a; sum[z] += a * v;
    if (v >= HIGH) high[z] += a;
    if (dom[i] >= 0) domHa[z][dom[i]] += a;
  }
  const rows: ZoneRow[] = [];
  for (let z = 0; z < nZones; z++) {
    if (ha[z] === 0) continue;
    const d = domHa[z];
    const top = d.some((x) => x > 0) ? d.indexOf(Math.max(...d)) : -1;
    rows.push({ zone: z, ha: ha[z], mean: sum[z] / ha[z], highShare: high[z] / ha[z], top });
  }
  return rows;
}
