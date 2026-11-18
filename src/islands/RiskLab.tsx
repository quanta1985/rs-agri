import { useMemo, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { colorizeValues, decodeFrame, frameOf, layerBounds, layerQuad, pixelAreaHa, pixelAt, rampCss, type LayerMeta } from '../lib/layer';
import { HIGH, composite, dominant, zoneTable } from '../lib/risk';
import { fmtNum, placeName } from '../lib/format';
import { REGIONS, useLayer } from './layers';
import MapStage from './MapStage';
import { Key, Pills, Slider, StatPanel } from './VizUi';

/**
 * Ch.14 weighted overlay: hazard scores of risk-<region> (one step per indicator, 0-100 on cropland), user weights,
 * composite index or dominant hazard on the map, province table from prov-<region>. Same maths as scripts/risk_numbers.ts.
 */
type Region = 'mekong' | 'red';
type Props = { lang: Lang; label: string; view?: 'index' | 'dom'; height?: number };
type RiskMeta = LayerMeta & { indicators: Record<string, { vi: string; en: string }> };

// Okabe-Ito colours per indicator key (dominant-hazard view)
const COLOR: Record<string, [number, number, number]> = { flood: [0, 114, 178], rain: [230, 159, 0], crop: [0, 158, 115], low: [204, 121, 167] };
const css = (c: [number, number, number]) => `rgb(${c.join(',')})`;
const MAX_W = 5;
const TXT = {
  vi: { region: 'Vùng', view: 'Bản đồ', index: 'Chỉ số tổng hợp', dom: 'Hiểm họa trội', weights: 'Trọng số', equal: 'Trọng số bằng nhau',
    farm: 'Đất trồng trọt', mean: 'Chỉ số trung bình', high: `Diện tích chỉ số ≥ ${HIGH}`, province: 'Tỉnh', hover: 'Rê chuột lên bản đồ',
    score: 'Điểm', none: 'không có hiểm họa', kha: 'nghìn ha', loading: 'Đang tải dữ liệu…', error: 'Không tải được dữ liệu',
    table: 'Theo tỉnh (sắp theo tỉ lệ diện tích chỉ số cao)', top: 'Hiểm họa trội', allZero: 'Mọi trọng số bằng 0: hãy tăng ít nhất một trọng số.' },
  en: { region: 'Region', view: 'Map', index: 'Composite index', dom: 'Dominant hazard', weights: 'Weights', equal: 'Equal weights',
    farm: 'Cropland', mean: 'Mean index', high: `Area with index ≥ ${HIGH}`, province: 'Province', hover: 'Hover over the map',
    score: 'Score', none: 'no hazard', kha: 'thousand ha', loading: 'Loading data…', error: 'Data failed to load',
    table: 'By province (sorted by share of high index)', top: 'Dominant hazard', allZero: 'All weights are 0: raise at least one.' },
};

export default function RiskLab({ lang, label, view: view0 = 'index', height = 560 }: Props) {
  const T = TXT[lang];
  const [region, setRegion] = useState<Region>('mekong');
  const [view, setView] = useState<'index' | 'dom'>(view0);
  const [weights, setWeights] = useState<Record<Region, number[] | null>>({ mekong: null, red: null });
  const [hover, setHover] = useState<{ lon: number; lat: number } | null>(null);
  const risk = useLayer(`risk-${region}`);
  const prov = useLayer(`prov-${region}`);
  const meta = risk.layer?.meta as RiskMeta | undefined;
  const keys = meta?.times ?? [];
  const w = weights[region] ?? keys.map(() => 1);

  const steps = useMemo(() => (risk.layer ? keys.map((_, k) => decodeFrame(risk.layer!.meta, frameOf(risk.layer!.meta, risk.layer!.data, k))) : null),
    [risk.layer]); // eslint-disable-line react-hooks/exhaustive-deps -- keys derive from the layer
  const wKey = w.join(',');
  const idx = useMemo(() => (steps ? composite(steps, w) : null), [steps, wKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dom = useMemo(() => (steps ? dominant(steps, w) : null), [steps, wKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const image = useMemo(() => {
    if (!meta || !idx || !dom) return null;
    if (view === 'index') return new ImageData(colorizeValues(idx, { palette: 'ylorrd', range: [0, 100] }) as Uint8ClampedArray<ArrayBuffer>, meta.width, meta.height);
    const px = new Uint8ClampedArray(idx.length * 4);
    for (let i = 0; i < idx.length; i++) {
      if (Number.isNaN(idx[i])) continue;
      const c = dom[i] >= 0 ? COLOR[keys[dom[i]]] : [200, 200, 200];
      px.set([c[0], c[1], c[2], 255], i * 4);
    }
    return new ImageData(px, meta.width, meta.height);
  }, [meta, idx, dom, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const table = useMemo(() => {
    if (!meta || !idx || !dom || !prov.layer) return null;
    const rowHa = (r: number) => pixelAreaHa(meta, r);
    const nZ = prov.layer.meta.classes?.length ?? 0;
    return {
      all: zoneTable(idx, dom, new Uint8Array(idx.length), meta.width, rowHa, 1, keys.length)[0],
      rows: zoneTable(idx, dom, prov.layer.data, meta.width, rowHa, nZ, keys.length).sort((a, b) => b.highShare - a.highShare),
    };
  }, [meta, idx, dom, prov.layer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meta || !steps || !idx || !dom || !table) {
    const err = risk.error ?? prov.error;
    return (
      <div className="stage" style={{ ['--stage-h' as string]: `${height}px` }} role="region" aria-label={label}>
        <p className="stage-status" aria-live="polite">{err ? `${T.error}: ${err}` : T.loading}</p>
      </div>
    );
  }

  const name = (k: string) => meta.indicators[k][lang];
  const provName = (z: number) => placeName(lang, prov.layer!.meta.classes![z].label[lang]);
  const n0 = (v: number) => fmtNum(lang, v, 0);
  const pc = (x: number) => `${fmtNum(lang, 100 * x, 1)} %`;
  const allZero = w.every((x) => x === 0);

  const hoverRows = (() => {
    if (!hover) return [{ k: T.score, v: T.hover, tone: 'muted' as const }];
    const p = pixelAt(meta, hover.lon, hover.lat);
    if (!p) return [{ k: T.score, v: '—' }];
    const i = p.row * meta.width + p.col;
    const z = prov.layer!.data[i];
    return [
      ...(z !== 255 ? [{ k: T.province, v: provName(z) }] : []),
      { k: view === 'index' ? T.index : T.dom, v: Number.isNaN(idx[i]) ? '—' : view === 'index' ? n0(idx[i]) : dom[i] >= 0 ? name(keys[dom[i]]) : T.none, tone: 'accent' as const },
      ...keys.map((k, j) => ({ k: name(k), v: Number.isNaN(steps[j][i]) ? '—' : n0(steps[j][i]) })),
    ];
  })();

  const legend = view === 'index'
    ? (
      <div className="map-legend">
        <div className="ramp" style={{ background: rampCss('ylorrd') }} aria-hidden="true" />
        <div className="ramp-ticks"><span>0</span><span>{T.index}</span><span>100</span></div>
      </div>
    )
    : <div className="map-legend">{keys.map((k) => <Key key={k} color={css(COLOR[k])}>{name(k)}</Key>)}<Key color="rgb(200,200,200)">{T.none}</Key></div>;

  const hud = (
    <StatPanel title={`${REGIONS[region].name[lang]} · ${view === 'index' ? T.index : T.dom}`} rows={[
      { k: T.farm, v: `${n0(table.all.ha / 1000)} ${T.kha}` },
      { k: T.mean, v: n0(table.all.mean) },
      { k: T.high, v: pc(table.all.highShare), tone: 'warn' },
      ...hoverRows,
    ]}>
      {legend}
    </StatPanel>
  );

  const setW = (j: number, v: number) => setWeights((s) => ({ ...s, [region]: w.map((x, k) => (k === j ? v : x)) }));
  const bar = (
    <>
      <Pills label={T.region} value={region} options={(['mekong', 'red'] as Region[]).map((r) => ({ v: r, label: REGIONS[r].name[lang] }))} onChange={(r) => { setRegion(r); setHover(null); }} />
      <Pills label={T.view} value={view} options={[{ v: 'index', label: T.index }, { v: 'dom', label: T.dom }]} onChange={setView} />
      {keys.map((k, j) => <Slider key={k} label={`${T.weights}: ${name(k)}`} value={w[j]} min={0} max={MAX_W} fmt={String} onChange={(v) => setW(j, v)} />)}
      <button type="button" className="pill-btn" onClick={() => setWeights((s) => ({ ...s, [region]: null }))}>{T.equal}</button>
      {allZero && <p className="muted" role="status">{T.allZero}</p>}
    </>
  );

  return (
    <div>
      <MapStage key={region} lang={lang} label={label} quad={layerQuad(meta)} bounds={layerBounds(meta)} height={height}
        overlays={[{ id: 'risk', image, opacity: 0.9 }]} hud={hud} bar={bar} onHover={setHover} />
      <p className="chart-title" style={{ marginTop: 12 }}>{T.table}</p>
      <div className="table-wrap"><table className="num">
        <thead><tr><th style={{ textAlign: 'left' }}>{T.province}</th><th>{T.farm} ({T.kha})</th><th>{T.mean}</th><th>{T.high}</th><th style={{ textAlign: 'left' }}>{T.top}</th></tr></thead>
        <tbody>{table.rows.map((r) => (
          <tr key={r.zone}>
            <th scope="row" style={{ textAlign: 'left' }}>{provName(r.zone)}</th>
            <td>{n0(r.ha / 1000)}</td><td>{n0(r.mean)}</td><td>{pc(r.highShare)}</td>
            <td style={{ textAlign: 'left' }}>{r.top >= 0 ? <><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 6, borderRadius: 2, background: css(COLOR[keys[r.top]]) }} />{name(keys[r.top])}</> : '—'}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
