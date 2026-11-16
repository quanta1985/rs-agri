// Region/site map layers exported by scripts/data/layerkit.py: EPSG:3857 grid + band-sequential typed values.
// Pure functions (no DOM) so they can be unit-tested; loading lives in src/islands/layers.ts.
import type { Quad } from './geo.ts';

export type Bi = { vi: string; en: string };
export type LayerClass = { v: number; color: string; label: Bi };
export type FrameStats = { valid: number; mean?: number; p2?: number; p50?: number; p98?: number; min?: number; max?: number };
export type LayerMeta = {
  id: string; region: string; title: Bi; units: Bi | null; kind: 'continuous' | 'classes';
  palette: PaletteName | null; range: [number, number] | null; classes: LayerClass[] | null;
  crs: 'EPSG:3857'; origin: [number, number]; res: number; ground_res_m: number; width: number; height: number;
  dtype: 'uint8' | 'uint16' | 'int16'; scale: number; offset: number; nodata: number; times: string[];
  stats: FrameStats[]; provenance: Record<string, string>;
};
export type Raw = Uint8Array | Uint16Array | Int16Array;
export type RGB = [number, number, number];

const R = 6378137;
const DEG = Math.PI / 180;

export const lonLatToMerc = (lon: number, lat: number): [number, number] =>
  [R * lon * DEG, R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2))];
export const mercToLonLat = (x: number, y: number): [number, number] =>
  [x / R / DEG, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / DEG];

/** Lon/lat corners UL, UR, LR, LL of the layer grid (exact: the grid is axis-aligned in Web Mercator). */
export const layerQuad = (m: Pick<LayerMeta, 'origin' | 'res' | 'width' | 'height'>): Quad => {
  const [x0, y1] = m.origin;
  const x1 = x0 + m.width * m.res, y0 = y1 - m.height * m.res;
  return [mercToLonLat(x0, y1), mercToLonLat(x1, y1), mercToLonLat(x1, y0), mercToLonLat(x0, y0)];
};

export const layerBounds = (m: Pick<LayerMeta, 'origin' | 'res' | 'width' | 'height'>): [[number, number], [number, number]] => {
  const q = layerQuad(m);
  return [q[3], q[1]]; // SW, NE
};

/** Pixel under a lon/lat, or null outside the grid. */
export const pixelAt = (m: Pick<LayerMeta, 'origin' | 'res' | 'width' | 'height'>, lon: number, lat: number): { row: number; col: number } | null => {
  const [x, y] = lonLatToMerc(lon, lat);
  const col = Math.floor((x - m.origin[0]) / m.res), row = Math.floor((m.origin[1] - y) / m.res);
  return row >= 0 && row < m.height && col >= 0 && col < m.width ? { row, col } : null;
};

/** Latitude of a row centre. */
export const rowLat = (m: Pick<LayerMeta, 'origin' | 'res'>, row: number): number => mercToLonLat(0, m.origin[1] - (row + 0.5) * m.res)[1];

/** Ground area of one pixel in hectares at a given row (Mercator pixels shrink by cos(lat) on the ground). */
export const pixelAreaHa = (m: Pick<LayerMeta, 'origin' | 'res'>, row: number): number => {
  const side = m.res * Math.cos(rowLat(m, row) * DEG);
  return (side * side) / 10_000;
};

/** View of one time step (band) of a band-sequential array. */
export const frameOf = (m: Pick<LayerMeta, 'width' | 'height'>, data: Raw, t: number): Raw => {
  const n = m.width * m.height;
  return data.subarray(t * n, (t + 1) * n) as Raw;
};

/** Physical value of a raw sample, NaN for nodata. */
export const decode = (m: Pick<LayerMeta, 'scale' | 'offset' | 'nodata'>, raw: number): number =>
  raw === m.nodata ? NaN : raw * m.scale + m.offset;

/** Whole frame decoded to physical units (NaN = nodata). */
export const decodeFrame = (m: Pick<LayerMeta, 'scale' | 'offset' | 'nodata'>, raw: Raw): Float32Array => {
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] === m.nodata ? NaN : raw[i] * m.scale + m.offset;
  return out;
};

// --- palettes (sRGB stops, low -> high) ---
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const PALETTES = {
  /** ColorBrewer Blues: water occurrence / depth. */
  water: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  /** Brown -> green for vegetation indices (BrBG brown half + Greens). */
  evi: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837', '#00441b'],
  gray: ['#000000', '#ffffff'],
  viridis: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'],
  /** ColorBrewer BrBG, diverging (anomalies: dry/brown below 0, wet/teal above). */
  brbg: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
  /** ColorBrewer YlOrRd: heat, salinity, risk. */
  ylorrd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
} as const;
export type PaletteName = keyof typeof PALETTES;
const STOPS = Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.map(hex)])) as Record<PaletteName, RGB[]>;

export const ramp = (name: PaletteName, t: number): RGB => {
  const s = STOPS[name];
  const x = Math.min(1, Math.max(0, t)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map((k) => Math.round(s[i][k] + (s[i + 1][k] - s[i][k]) * f)) as RGB;
};

/** CSS linear-gradient of a palette, for legends. */
export const rampCss = (name: PaletteName): string => `linear-gradient(90deg, ${PALETTES[name].join(', ')})`;

export type ColorOpts = {
  palette?: PaletteName; range?: [number, number];
  /** Values below this are transparent (e.g. 0 % water occurrence = land, let the basemap show). */
  clearBelow?: number;
  /** Optional mask: only pixels where mask(value) is true are painted, in maskColor. */
  mask?: (v: number) => boolean; maskColor?: RGB;
};

/** RGBA pixels (row-major, width*height*4) for one frame; nodata is transparent. */
export const colorize = (m: LayerMeta, raw: Raw, o: ColorOpts = {}): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(raw.length * 4);
  const pal = o.palette ?? m.palette ?? 'viridis';
  const [lo, hi] = o.range ?? m.range ?? [m.stats[0]?.p2 ?? 0, m.stats[0]?.p98 ?? 1];
  const classColor = new Map((m.classes ?? []).map((c) => [c.v, hex(c.color)]));
  // look-up table per raw code: raw values are small integers, so colour each code once
  const cache = new Map<number, RGB | null>();
  const colorOf = (r: number): RGB | null => {
    let c = cache.get(r);
    if (c !== undefined) return c;
    const v = decode(m, r);
    if (Number.isNaN(v) || (o.clearBelow !== undefined && v < o.clearBelow)) c = null;
    else if (o.mask) c = o.mask(v) ? (o.maskColor ?? [0, 114, 178]) : null;
    else if (m.kind === 'classes') c = classColor.get(v) ?? null;
    else c = ramp(pal, (v - lo) / (hi - lo));
    cache.set(r, c);
    return c;
  };
  for (let i = 0; i < raw.length; i++) {
    const c = colorOf(raw[i]);
    if (!c) continue;
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
};

/** Swipe compare: columns left of `split` (0..1 of the width) from a, the rest from b. Both RGBA, same size. */
export const swipe = (a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, split: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(b);
  const cut = Math.round(Math.min(1, Math.max(0, split)) * width);
  const rows = a.length / 4 / width;
  for (let r = 0; r < rows; r++) out.set(a.subarray(r * width * 4, (r * width + cut) * 4), r * width * 4);
  return out;
};

/** RGBA for decoded values (e.g. after a speckle filter): ramp over range, NaN transparent; or a single-colour mask. */
export const colorizeValues = (values: ArrayLike<number>, o: { palette: PaletteName; range: [number, number] } | { mask: (v: number) => boolean; color: RGB }): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(values.length * 4);
  // 256-step lookup table instead of interpolating every pixel
  const lut = 'palette' in o ? Array.from({ length: 256 }, (_, k) => ramp(o.palette, k / 255)) : null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    let c: RGB;
    if (lut && 'range' in o) {
      const t = (v - o.range[0]) / (o.range[1] - o.range[0]);
      c = lut[Math.round(Math.min(1, Math.max(0, t)) * 255)];
    } else if ('mask' in o) {
      if (!o.mask(v)) continue;
      c = o.color;
    } else continue;
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
};

/** Ground area (ha) of pixels where test(value) holds, and of all valid pixels. `values` are decoded (NaN = nodata). */
export const areaWhere = (m: Pick<LayerMeta, 'origin' | 'res' | 'width' | 'height'>, values: ArrayLike<number>, test: (v: number) => boolean): { ha: number; validHa: number } => {
  let ha = 0, validHa = 0;
  for (let row = 0; row < m.height; row++) {
    const a = pixelAreaHa(m, row);
    for (let col = 0, i = row * m.width; col < m.width; col++, i++) {
      const v = values[i];
      if (Number.isNaN(v)) continue;
      validHa += a;
      if (test(v)) ha += a;
    }
  }
  return { ha, validHa };
};
