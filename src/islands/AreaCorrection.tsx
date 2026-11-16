import { useMemo, useState } from 'react';
import type { Lang } from '../i18n/ui';
import { areaWhere, decodeFrame, frameOf } from '../lib/layer';
import { estimateArea } from '../lib/accuracy';
import { fmtNum } from '../lib/format';
import { useLayer } from './layers';
import { Pills, StatPanel } from './VizUi';

type Region = 'mekong' | 'red';
type Props = { lang: Lang; label: string };

// Illustrative sample of 100 points per map stratum (not a real field survey).
const DEFAULT = [[88, 12], [9, 91]];
const MAX = 500;

const TXT = {
  vi: { region: 'Vùng', mekong: 'ĐBSCL 2024', red: 'ĐBSH 2024', ref: 'Tham chiếu (điểm kiểm tra)', map: 'Bản đồ', rice: 'Lúa', other: 'Không lúa',
    loading: 'Đang tải bản đồ…', error: 'Không tải được dữ liệu', count: 'Đếm pixel (lúa trên bản đồ)', est: 'Ước lượng đã hiệu chỉnh', ci: 'Khoảng tin cậy 95 %',
    bias: 'Đếm pixel lệch', ua: 'Độ chính xác người dùng (lúa)', pa: 'Độ chính xác người sản xuất (lúa)', oa: 'Độ chính xác tổng thể', reset: 'Về mặc định',
    kha: 'nghìn ha', cell: (r: string, c: string) => `Số điểm: bản đồ ${r}, tham chiếu ${c}`, n: 'Cỡ mẫu',
    few: 'Mỗi lớp bản đồ cần ít nhất 2 điểm kiểm tra để ước lượng.',
    ill: 'Ma trận mặc định là số minh họa (100 điểm mỗi lớp bản đồ), không phải kết quả khảo sát thực địa.' },
  en: { region: 'Region', mekong: 'Mekong 2024', red: 'Red River 2024', ref: 'Reference (check points)', map: 'Map', rice: 'Rice', other: 'Not rice',
    loading: 'Loading the map…', error: 'Data failed to load', count: 'Pixel count (mapped rice)', est: 'Bias-corrected estimate', ci: '95 % confidence interval',
    bias: 'Pixel counting off by', ua: "User's accuracy (rice)", pa: "Producer's accuracy (rice)", oa: 'Overall accuracy', reset: 'Reset',
    kha: 'thousand ha', cell: (r: string, c: string) => `Points: map ${r}, reference ${c}`, n: 'Sample size',
    few: 'Each map class needs at least 2 check points for an estimate.',
    ill: 'The default matrix is illustrative (100 points per map class), not the result of a field survey.' },
};

/** Confusion matrix of a stratified sample -> bias-corrected rice area (Olofsson et al. 2014) on the real 2024 rice-season map. */
export default function AreaCorrection({ lang, label }: Props) {
  const T = TXT[lang];
  const [region, setRegion] = useState<Region>('mekong');
  const [n, setN] = useState<number[][]>(DEFAULT);
  const { layer, error } = useLayer(`rice-seasons-${region}`);

  // Map strata within the cropland mask: rice = at least one season in 2024 (last time step), other = no season.
  const mapped = useMemo(() => {
    if (!layer) return null;
    const m = layer.meta;
    const v = decodeFrame(m, frameOf(m, layer.data, m.times.length - 1));
    return [areaWhere(m, v, (x) => x >= 1).ha, areaWhere(m, v, (x) => x === 0).ha];
  }, [layer]);
  const est = useMemo(() => (mapped ? estimateArea(n, mapped) : null), [n, mapped]);

  const kha = (ha: number) => fmtNum(lang, ha / 1000, 0);
  const pct = (x: number) => (Number.isFinite(x) ? `${fmtNum(lang, 100 * x, 1)} %` : '–');
  const set = (i: number, j: number, v: number) =>
    setN(n.map((row, r) => row.map((x, c) => (r === i && c === j ? Math.max(0, Math.min(MAX, Math.round(v) || 0)) : x))));
  const cls = [T.rice, T.other];

  return (
    <div className="viz two" role="group" aria-label={label}>
      <div>
        <div className="controls">
          <Pills label={T.region} value={region} onChange={setRegion} options={[{ v: 'mekong', label: T.mekong }, { v: 'red', label: T.red }]} />
        </div>
        <div className="table-wrap">
          <table className="num confusion">
            <thead>
              <tr><th rowSpan={2}>{T.map}</th><th colSpan={2}>{T.ref}</th><th rowSpan={2}>{T.n}</th></tr>
              <tr>{cls.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {n.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{cls[i]}</th>
                  {row.map((x, j) => (
                    <td key={j}>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" size={4} value={x} aria-label={T.cell(cls[i], cls[j])}
                        onChange={(e) => set(i, j, Number(e.target.value))} />
                    </td>
                  ))}
                  <td>{row[0] + row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem' }}>{T.ill}</p>
        <button type="button" className="btn" onClick={() => setN(DEFAULT)}>{T.reset}</button>
      </div>
      {error ? <p className="status">{T.error}</p> : !mapped || !est ? <p className="status">{T.loading}</p> : n.some((r) => r[0] + r[1] < 2) ? <p className="status" role="status">{T.few}</p> : (
        <StatPanel rows={[
          { k: T.count, v: `${kha(mapped[0])} ${T.kha}` },
          { k: T.est, v: `${kha(est.area[0])} ${T.kha}`, tone: 'accent' },
          { k: T.ci, v: `± ${kha(1.96 * est.se[0])} ${T.kha}` },
          { k: T.bias, v: `${mapped[0] >= est.area[0] ? '+' : '−'}${kha(Math.abs(mapped[0] - est.area[0]))} ${T.kha}`, tone: Math.abs(mapped[0] - est.area[0]) > 1.96 * est.se[0] ? 'warn' : 'ok' },
          { k: T.ua, v: pct(est.user[0]) },
          { k: T.pa, v: pct(est.producer[0]) },
          { k: T.oa, v: pct(est.overall) },
        ]} />
      )}
    </div>
  );
}
