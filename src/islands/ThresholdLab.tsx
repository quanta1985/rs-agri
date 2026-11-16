import { useMemo, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { areaWhere, colorizeValues, decodeFrame, frameOf, layerBounds, layerQuad, pixelAt, type RGB } from '../lib/layer';
import { histogram, otsu } from '../lib/raster';
import { filterDb } from '../lib/sar';
import { digitsFor, fmtNum, fmtTime } from '../lib/format';
import { useLayer } from './layers';
import MapStage from './MapStage';
import { Key, Pills, Slider, StatPanel } from './VizUi';

type Bi = { vi: string; en: string };
type Props = {
  lang: Lang; label: string;
  /** Layer id (public/data/<id>/), usually a 10 m site frame. */
  layer: string;
  /** Class of interest lies below the threshold (water in radar dB) or above it (water in MNDWI). */
  below?: boolean;
  /** Slider range and step in physical units; default: the layer's colour range. */
  range?: [number, number]; step?: number;
  maskLabel: Bi;
  /** Offer a 5x5 Lee speckle filter (radar layers in dB). */
  speckle?: boolean;
  time?: number; height?: number;
};

const TXT = {
  vi: { thr: 'Ngưỡng', otsu: 'Otsu', area: 'Diện tích', share: 'Tỉ lệ khung', date: 'Ngày ảnh', filter: 'Lọc nhiễu đốm', none: 'Không', lee: 'Lee 5×5',
    show: 'Lớp phân loại', on: 'Hiện', off: 'Ẩn', value: 'Giá trị', hover: 'Rê chuột lên bản đồ', loading: 'Đang tải dữ liệu…', error: 'Không tải được dữ liệu',
    hist: 'Biểu đồ tần suất (histogram) của khung, đường dọc = ngưỡng', useOtsu: 'Dùng Otsu', ha: 'ha' },
  en: { thr: 'Threshold', otsu: 'Otsu', area: 'Area', share: 'Share of frame', date: 'Image date', filter: 'Speckle filter', none: 'None', lee: 'Lee 5×5',
    show: 'Class layer', on: 'Show', off: 'Hide', value: 'Value', hover: 'Hover over the map', loading: 'Loading data…', error: 'Data failed to load',
    hist: 'Histogram of the frame, vertical line = threshold', useOtsu: 'Use Otsu', ha: 'ha' },
};
const MASK: RGB = [0, 114, 178]; // Okabe-Ito blue
const BINS = 60;
const HIST_W = 260, HIST_H = 70;

/** Threshold one band of a site frame: histogram + Otsu, live class mask on the map, class area in hectares. */
export default function ThresholdLab({ lang, label, layer: id, below = true, range, step = 0.25, maskLabel, speckle = false, time = 0, height = 540 }: Props) {
  const T = TXT[lang];
  const { layer, error } = useLayer(id);
  const meta = layer?.meta;
  const [t, setT] = useState(time);
  const [filt, setFilt] = useState<'none' | 'lee'>('none');
  const [thr, setThr] = useState<number | null>(null);
  const [show, setShow] = useState(true);
  const [hover, setHover] = useState<{ lon: number; lat: number } | null>(null);
  const [lo, hi] = range ?? meta?.range ?? [0, 1];

  const values = useMemo(() => {
    if (!layer) return null;
    const v = decodeFrame(layer.meta, frameOf(layer.meta, layer.data, t));
    return filt === 'lee' ? filterDb(v, layer.meta.width, layer.meta.height, 5, 'lee') : v;
  }, [layer, t, filt]);
  const otsuThr = useMemo(() => (values ? Math.round(otsu(values, lo, hi) / step) * step : null), [values, lo, hi, step]);
  const th = thr ?? otsuThr ?? (lo + hi) / 2;
  const inClass = (v: number) => (below ? v < th : v > th);

  const base = useMemo(() => values && meta
    ? new ImageData(colorizeValues(values, { palette: meta.palette ?? 'gray', range: [lo, hi] }) as Uint8ClampedArray<ArrayBuffer>, meta.width, meta.height) : null,
  [values, meta, lo, hi]);
  const mask = useMemo(() => values && meta
    ? new ImageData(colorizeValues(values, { mask: inClass, color: MASK }) as Uint8ClampedArray<ArrayBuffer>, meta.width, meta.height) : null,
  [values, meta, th, below]); // eslint-disable-line react-hooks/exhaustive-deps -- inClass derives from th/below
  const area = useMemo(() => (values && meta ? areaWhere(meta, values, inClass) : null), [values, meta, th, below]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useMemo(() => (values ? histogram(values, lo, hi, BINS) : null), [values, lo, hi]);

  if (!meta || !values || !hist || !area) {
    return (
      <div className="stage" style={{ ['--stage-h' as string]: `${height}px` }} role="region" aria-label={label}>
        <p className="stage-status" aria-live="polite">{error ? `${T.error}: ${error}` : T.loading}</p>
      </div>
    );
  }

  const digits = digitsFor(step);
  const units = meta.units?.[lang] ?? '';
  const n = (v: number, d = digits) => fmtNum(lang, v, d);
  const hv = (() => {
    if (!hover) return { k: T.value, v: T.hover, tone: 'muted' as const };
    const px = pixelAt(meta, hover.lon, hover.lat);
    const v = px ? values[px.row * meta.width + px.col] : NaN;
    return { k: T.value, v: Number.isNaN(v) ? '—' : `${n(v, 1)} ${units}${inClass(v) ? ` · ${maskLabel[lang]}` : ''}`, tone: 'accent' as const };
  })();

  const maxC = Math.max(...hist);
  const x = (v: number) => ((v - lo) / (hi - lo)) * HIST_W;
  const histSvg = (
    <svg className="mini-hist" viewBox={`0 0 ${HIST_W} ${HIST_H + 14}`} role="img" aria-label={T.hist}>
      {hist.map((c, i) => {
        const v0 = lo + (i * (hi - lo)) / BINS;
        const h = (c / maxC) * HIST_H;
        return <rect key={i} x={(i * HIST_W) / BINS} y={HIST_H - h} width={HIST_W / BINS - 0.6} height={h}
          style={{ fill: inClass(v0 + (hi - lo) / BINS / 2) ? 'rgb(0,114,178)' : 'var(--st-muted)' }} />;
      })}
      {otsuThr !== null && <line x1={x(otsuThr)} x2={x(otsuThr)} y1={0} y2={HIST_H} style={{ stroke: 'var(--st-warn)' }} strokeDasharray="3 2" />}
      <line x1={x(th)} x2={x(th)} y1={0} y2={HIST_H} style={{ stroke: 'var(--st-fg)' }} strokeWidth={1.5} />
      <text x={0} y={HIST_H + 12} style={{ fill: 'var(--st-muted)', fontSize: 10 }}>{n(lo, 0)}</text>
      <text x={HIST_W} y={HIST_H + 12} textAnchor="end" style={{ fill: 'var(--st-muted)', fontSize: 10 }}>{n(hi, 0)} {units}</text>
    </svg>
  );

  const hud = (
    <StatPanel title={`${meta.title[lang]} · ${fmtTime(lang, meta.times[t])}`} rows={[
      { k: T.thr, v: `${below ? '<' : '>'} ${n(th)} ${units}`, tone: 'accent' },
      { k: T.otsu, v: otsuThr === null ? '—' : `${n(otsuThr)} ${units}`, tone: 'warn' },
      { k: `${T.area} · ${maskLabel[lang]}`, v: `${fmtNum(lang, area.ha, 0)} ${T.ha}` },
      { k: T.share, v: `${fmtNum(lang, (100 * area.ha) / area.validHa, 1)} %` },
      hv,
    ]}>
      {histSvg}
      <div className="map-legend"><Key color="rgb(0,114,178)">{maskLabel[lang]}</Key></div>
    </StatPanel>
  );

  const bar = (
    <>
      {meta.times.length > 1 && <Pills label={T.date} value={String(t)} options={meta.times.map((d, i) => ({ v: String(i), label: fmtTime(lang, d) }))} onChange={(v) => { setT(Number(v)); setThr(null); }} />}
      <div className="ctl-row">
        <Slider label={T.thr} value={th} min={lo} max={hi} step={step} fmt={(v) => `${n(v)} ${units}`} onChange={setThr} />
        <button type="button" className="pill-btn" onClick={() => setThr(null)}>{T.useOtsu}</button>
      </div>
      {speckle && <Pills label={T.filter} value={filt} options={[{ v: 'none', label: T.none }, { v: 'lee', label: T.lee }]} onChange={(v) => { setFilt(v); setThr(null); }} />}
      <Pills label={T.show} value={show ? 'on' : 'off'} options={[{ v: 'on', label: T.on }, { v: 'off', label: T.off }]} onChange={(v) => setShow(v === 'on')} />
    </>
  );

  return (
    <MapStage lang={lang} label={label} quad={layerQuad(meta)} bounds={layerBounds(meta)} height={height}
      overlays={[{ id: 'base', image: base }, { id: 'mask', image: mask, opacity: 0.8, visible: show }]}
      hud={hud} bar={bar} onHover={setHover} />
  );
}
