import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Lang } from '../i18n/ui';
import { colorize, frameOf, layerBounds, layerQuad, mercToLonLat, pixelAt, rampCss, swipe, swipeCut, decode, type PaletteName } from '../lib/layer';
import { digitsFor, fmtNum, fmtTime, placeName } from '../lib/format';
import { REGIONS, loadProvinces, useLayer } from './layers';
import MapStage from './MapStage';
import { Key, Pills, Slider, StatPanel } from './VizUi';

type Bi = { vi: string; en: string };
/** One selectable layer: a layer id per region it exists for (e.g. { red: 'evi-2024-red', mekong: 'evi-2024-mekong' }). */
export type LayerChoice = {
  key: string; label?: Bi; ids: Record<string, string>;
  palette?: PaletteName; range?: [number, number];
  /** Values below this are drawn transparent (e.g. 0 % water occurrence = land). */
  clearBelow?: number;
};

type Props = {
  lang: Lang; label: string; choices: LayerChoice[];
  /** Initial region id (src/data/regions.json); default: first region of the first choice. */
  region?: string; time?: number;
  /** Allow swipe comparison of two time steps (only for layers with more than one). */
  compare?: boolean; compareTime?: number;
  opacity?: number; height?: number; boundaries?: boolean;
};

const TXT = {
  vi: { region: 'Khu vực', layer: 'Lớp', time: 'Thời điểm', play: 'Chạy', pause: 'Dừng', compare: 'So sánh', split: 'Vị trí vuốt', right: 'Bên phải',
    opacity: 'Độ mờ', value: 'Giá trị', at: 'Tọa độ', province: 'Tỉnh', pixel: 'Pixel', hover: 'Rê chuột lên bản đồ', nodata: 'không có dữ liệu',
    loading: 'Đang tải dữ liệu…', error: 'Không tải được dữ liệu', clear: 'trong suốt', left: 'Trái', on: 'Bật', off: 'Tắt' },
  en: { region: 'Area', layer: 'Layer', time: 'Time', play: 'Play', pause: 'Pause', compare: 'Compare', split: 'Swipe position', right: 'Right side',
    opacity: 'Opacity', value: 'Value', at: 'Location', province: 'Province', pixel: 'Pixel', hover: 'Hover over the map', nodata: 'no data',
    loading: 'Loading data…', error: 'Data failed to load', clear: 'transparent', left: 'Left', on: 'On', off: 'Off' },
};
const PLAY_MS = 900;

/** Region/site raster on the dark map stage: region + layer pickers, time slider with play, swipe compare, hover value, legend. */
export default function DeltaMap({ lang, label, choices, region: region0, time: t0 = 0, compare: canCompare = false, compareTime, opacity: op0 = 0.85, height = 560, boundaries = true }: Props) {
  const T = TXT[lang];
  const [ci, setCi] = useState(0);
  const choice = choices[ci];
  const regions = Object.keys(choice.ids);
  const [region, setRegion] = useState(region0 && region0 in choice.ids ? region0 : regions[0]);
  const reg = region in choice.ids ? region : regions[0]; // a layer switch may drop the current region
  const { layer, error } = useLayer(choice.ids[reg]);
  const meta = layer?.meta;
  const nT = meta?.times.length ?? 1;
  const [t, setT] = useState(t0);
  const [t2, setT2] = useState(compareTime ?? 0);
  const [cmp, setCmp] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [opacity, setOpacity] = useState(op0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ lon: number; lat: number; prov?: string } | null>(null);
  const tt = Math.min(t, nT - 1), tt2 = Math.min(t2, nT - 1);
  const comparing = canCompare && cmp && nT > 1;

  useEffect(() => {
    if (!playing || nT < 2) return;
    const id = setInterval(() => setT((x) => (x + 1) % nT), PLAY_MS);
    return () => clearInterval(id);
  }, [playing, nT]);

  const opts = { palette: choice.palette, range: choice.range, clearBelow: choice.clearBelow };
  const image = useMemo(() => {
    if (!layer) return null;
    const { meta: m, data } = layer;
    const a = colorize(m, frameOf(m, data, tt), opts);
    const px = comparing ? swipe(colorize(m, frameOf(m, data, tt2), opts), a, m.width, split) : a;
    return new ImageData(px as Uint8ClampedArray<ArrayBuffer>, m.width, m.height);
  }, [layer, tt, tt2, comparing, split, choice]); // eslint-disable-line react-hooks/exhaustive-deps -- opts derive from choice

  // vector layers: province lines + swipe divider; refs survive re-renders, the stage remounts per region
  const mapRef = useRef<MlMap | null>(null);
  const divider = (): GeoJSON.Feature => {
    if (!meta) return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
    const q = layerQuad(meta);
    const x = meta.origin[0] + swipeCut(meta.width, split) * meta.res;
    const lon = mercToLonLat(x, 0)[0];
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, q[0][1]], [lon, q[3][1]]] } };
  };
  useEffect(() => {
    const src = mapRef.current?.getSource('divider') as GeoJSONSource | undefined;
    src?.setData(divider());
    mapRef.current?.setLayoutProperty('divider', 'visibility', comparing ? 'visible' : 'none');
  }, [split, comparing, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMap = (m: MlMap) => {
    mapRef.current = m;
    m.addSource('divider', { type: 'geojson', data: divider() });
    m.addLayer({ id: 'divider', type: 'line', source: 'divider', layout: { visibility: comparing ? 'visible' : 'none' }, paint: { 'line-color': '#ffffff', 'line-width': 2 } });
    if (boundaries) {
      loadProvinces().then((fc) => {
        if (mapRef.current !== m) return;
        m.addSource('prov', { type: 'geojson', data: fc as unknown as GeoJSON.FeatureCollection });
        m.addLayer({ id: 'prov-fill', type: 'fill', source: 'prov', filter: ['==', ['get', 'kind'], 'province'], paint: { 'fill-opacity': 0 } });
        m.addLayer({ id: 'prov-line', type: 'line', source: 'prov', filter: ['==', ['get', 'kind'], 'province'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': 0.8 } });
        m.addLayer({ id: 'region-line', type: 'line', source: 'prov', filter: ['==', ['get', 'kind'], 'region'], paint: { 'line-color': '#e3b25a', 'line-width': 1.6 } });
      }).catch(() => { /* boundaries are decoration: the figure still works without them */ });
    }
    return () => { mapRef.current = null; };
  };

  const onHover = (p: { lon: number; lat: number } | null) => {
    if (!p) { setHover(null); return; }
    const m = mapRef.current;
    const f = m?.getLayer('prov-fill') ? m.queryRenderedFeatures(m.project([p.lon, p.lat]), { layers: ['prov-fill'] })[0] : undefined;
    setHover({ ...p, prov: f?.properties?.name as string | undefined });
  };

  // HUD
  const digits = meta ? digitsFor(meta.scale) : 0;
  const units = meta?.units?.[lang] ?? '';
  const hoverRows = (() => {
    if (!hover || !meta || !layer) return [{ k: T.value, v: T.hover, tone: 'muted' as const }];
    const px = pixelAt(meta, hover.lon, hover.lat);
    const showT = comparing && px && px.col < swipeCut(meta.width, split) ? tt2 : tt;
    const v = px ? decode(meta, frameOf(meta, layer.data, showT)[px.row * meta.width + px.col]) : NaN;
    const cls = meta.kind === 'classes' ? meta.classes?.find((c) => c.v === v)?.label[lang] : undefined;
    const text = Number.isNaN(v) ? T.nodata : cls ?? `${fmtNum(lang, v, digits)} ${units}`;
    return [
      { k: `${T.value}${nT > 1 ? ` · ${fmtTime(lang, meta.times[showT])}` : ''}`, v: text, tone: 'accent' as const },
      ...(hover.prov ? [{ k: T.province, v: placeName(lang, hover.prov) }] : []),
      { k: T.at, v: `${fmtNum(lang, hover.lat, 3)}° N, ${fmtNum(lang, hover.lon, 3)}° E` },
    ];
  })();
  const [lo, hi] = choice.range ?? meta?.range ?? [0, 1];
  const pal = choice.palette ?? meta?.palette ?? 'viridis';
  const tickDigits = Number.isInteger(lo) && Number.isInteger(hi) ? 0 : Math.min(digits, 2);
  const legend = meta && (meta.kind === 'classes'
    ? <div className="map-legend">{meta.classes?.map((c) => <Key key={c.v} color={c.color}>{c.label[lang]}</Key>)}</div>
    : (
      <div className="map-legend">
        <div className="ramp" style={{ background: rampCss(pal) }} aria-hidden="true" />
        <div className="ramp-ticks"><span>{fmtNum(lang, lo, tickDigits)}</span><span>{units}</span><span>{fmtNum(lang, hi, tickDigits)}</span></div>
        {choice.clearBelow !== undefined && <p className="ramp-note">&lt; {fmtNum(lang, choice.clearBelow, Number.isInteger(choice.clearBelow) ? 0 : 2)} {units}: {T.clear}</p>}
      </div>
    ));
  const title = meta ? `${(choice.label ?? meta.title)[lang]}${nT > 1 ? ` · ${comparing ? `${fmtTime(lang, meta.times[tt2])} | ` : ''}${fmtTime(lang, meta.times[tt])}` : ''}` : (error ? T.error : T.loading);
  const hud = (
    <StatPanel title={title} rows={[...hoverRows, ...(meta ? [{ k: T.pixel, v: `~${meta.ground_res_m} m` }] : [])]}>
      {legend}
    </StatPanel>
  );

  const bar = (
    <>
      {regions.length > 1 && <Pills label={T.region} value={reg} options={regions.map((r) => ({ v: r, label: REGIONS[r]?.name[lang] ?? r }))} onChange={(r) => { setRegion(r); setHover(null); setPlaying(false); }} />}
      {choices.length > 1 && <Pills label={T.layer} value={String(ci)} options={choices.map((c, i) => ({ v: String(i), label: (c.label ?? { vi: c.key, en: c.key })[lang] }))} onChange={(v) => { setCi(Number(v)); setPlaying(false); }} />}
      {nT > 1 && meta && (
        <div className="ctl-row">
          <Slider label={comparing ? T.right : T.time} value={tt} min={0} max={nT - 1} fmt={(i) => fmtTime(lang, meta.times[i])} onChange={(v) => { setPlaying(false); setT(v); }} />
          {!comparing && <button type="button" className="pill-btn" aria-pressed={playing} onClick={() => setPlaying((x) => !x)}>{playing ? `❚❚ ${T.pause}` : `▶ ${T.play}`}</button>}
        </div>
      )}
      {canCompare && nT > 1 && meta && <Pills label={T.compare} value={cmp ? 'on' : 'off'} options={[{ v: 'off', label: T.off }, { v: 'on', label: T.on }]} onChange={(v) => { setCmp(v === 'on'); setPlaying(false); }} />}
      {comparing && meta && <Slider label={T.left} value={tt2} min={0} max={nT - 1} fmt={(i) => fmtTime(lang, meta.times[i])} onChange={setT2} />}
      {comparing && <Slider label={T.split} value={Math.round(split * 100)} min={0} max={100} fmt={(v) => `${v} %`} onChange={(v) => setSplit(v / 100)} />}
      <Slider label={T.opacity} value={Math.round(opacity * 100)} min={0} max={100} step={5} fmt={(v) => `${v} %`} onChange={(v) => setOpacity(v / 100)} />
    </>
  );

  if (!meta) {
    return (
      <div className="stage" style={{ ['--stage-h' as string]: `${height}px` }} role="region" aria-label={label}>
        <p className="stage-status" aria-live="polite">{error ? `${T.error}: ${error}` : T.loading}</p>
      </div>
    );
  }
  // one map per region + layer (the stage keeps its first view); time, compare and opacity update in place
  return (
    <MapStage key={choice.ids[reg]} lang={lang} label={label} quad={layerQuad(meta)} bounds={layerBounds(meta)} height={height}
      overlays={[{ id: 'layer', image, opacity }]} hud={hud} bar={bar} onHover={onHover} onMap={onMap} />
  );
}
