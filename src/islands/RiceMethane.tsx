import { useState } from 'react';
import type { Lang } from '../i18n/ui';
import { fmtNum } from '../lib/format';
import { CFOA, EFC, GWP_CH4, SEASON_DAYS, SFP, SFW, seasonCH4 } from '../lib/methane';
import { Pills, Slider, StatPanel } from './VizUi';

/** Ch.13 IPCC Tier 1 calculator: CH4 from one rice season under a chosen water regime, pre-season water and straw
 *  management (2019 Refinement default factors for South-East Asia), per ha and for 1 million ha. */
type Water = keyof typeof SFW;
type Pre = keyof typeof SFP;
type Straw = 'none' | 'short' | 'long';
type Props = { lang: Lang };

const TXT = {
  vi: { water: 'Nước trong vụ', pre: 'Trước vụ', straw: 'Rơm vụ trước', rate: 'Rơm vùi (tấn chất khô/ha)', days: 'Độ dài vụ (ngày)',
    w: { continuous: 'Ngập liên tục', single: 'Rút nước 1 lần', multiple: 'Ướt khô xen kẽ (AWD)' },
    p: { dryShort: 'Khô < 180 ngày', dryLong: 'Khô > 180 ngày', flooded: 'Ngập > 30 ngày' },
    s: { none: 'Đốt hoặc mang ra khỏi ruộng', short: 'Vùi < 30 ngày trước cấy', long: 'Vùi > 30 ngày trước cấy' },
    title: 'Một vụ lúa theo IPCC Tier 1', ef: 'Hệ số phát thải ngày', perHa: 'CH₄ mỗi ha mỗi vụ', co2: 'Quy ra CO₂ tương đương',
    mha: 'Cho 1 triệu ha (mục tiêu năm 2030 của Đề án)', vs: 'So với ngập liên tục, không vùi rơm (cùng chế độ trước vụ)',
    note: 'Hệ số mặc định của IPCC (2019) cho Đông Nam Á: EFc = 1,22 kg CH₄/ha/ngày, vụ 102 ngày; GWP-100 của CH₄ = 27 (IPCC AR6). Không phải số đo của một ruộng cụ thể.' },
  en: { water: 'Water during the season', pre: 'Before the season', straw: 'Straw of the previous crop', rate: 'Straw incorporated (t dry matter/ha)', days: 'Season length (days)',
    w: { continuous: 'Continuously flooded', single: 'Single drainage', multiple: 'Alternate wetting and drying (AWD)' },
    p: { dryShort: 'Dry < 180 days', dryLong: 'Dry > 180 days', flooded: 'Flooded > 30 days' },
    s: { none: 'Burnt or removed', short: 'Incorporated < 30 days before', long: 'Incorporated > 30 days before' },
    title: 'One rice season, IPCC Tier 1', ef: 'Daily emission factor', perHa: 'CH₄ per ha per season', co2: 'As CO₂ equivalent',
    mha: 'For 1 million ha (the programme\'s 2030 target)', vs: 'Versus continuous flooding, no straw (same pre-season)',
    note: 'IPCC (2019) default factors for South-East Asia: EFc = 1.22 kg CH₄/ha/day, 102-day season; GWP-100 of CH₄ = 27 (IPCC AR6). Not a measurement of any real field.' },
};
const CF: Record<Exclude<Straw, 'none'>, number> = { short: CFOA.strawShort, long: CFOA.strawLong };

export default function RiceMethane({ lang }: Props) {
  const T = TXT[lang];
  const [water, setWater] = useState<Water>('continuous');
  const [pre, setPre] = useState<Pre>('dryShort');
  const [straw, setStraw] = useState<Straw>('none');
  const [rate, setRate] = useState(3);
  const [days, setDays] = useState<number>(SEASON_DAYS.southeastAsia);
  const n0 = (v: number) => fmtNum(lang, v, 0), n1 = (v: number) => fmtNum(lang, v, 1), n2 = (v: number) => fmtNum(lang, v, 2);

  const am = straw === 'none' ? [] : [{ rate, cfoa: CF[straw] }];
  const kg = seasonCH4(EFC.southeastAsia, days, SFW[water], SFP[pre], am);
  const base = seasonCH4(EFC.southeastAsia, days, SFW.continuous, SFP[pre]);
  const ch = 100 * (kg / base - 1);
  return (
    <div className="viz">
      <div className="controls">
        <Pills label={T.water} value={water} onChange={setWater} options={(Object.keys(SFW) as Water[]).map((v) => ({ v, label: T.w[v] }))} />
        <Pills label={T.pre} value={pre} onChange={setPre} options={(Object.keys(SFP) as Pre[]).map((v) => ({ v, label: T.p[v] }))} />
        <Pills label={T.straw} value={straw} onChange={setStraw} options={(['none', 'short', 'long'] as Straw[]).map((v) => ({ v, label: T.s[v] }))} />
        {straw !== 'none' && <Slider label={T.rate} value={rate} min={0.5} max={8} step={0.5} fmt={n1} onChange={setRate} />}
        <Slider label={T.days} value={days} min={80} max={130} step={1} fmt={n0} onChange={setDays} />
      </div>
      <StatPanel title={T.title} rows={[
        { k: T.ef, v: `${n2(kg / days)} kg CH₄/ha/${lang === 'vi' ? 'ngày' : 'day'}` },
        { k: T.perHa, v: `${n0(kg)} kg CH₄`, tone: 'accent' },
        { k: T.co2, v: `${n2(kg * GWP_CH4 / 1000)} t CO₂e/ha` },
        { k: T.mha, v: `${n0(kg)} kt CH₄ · ${n2(kg * GWP_CH4 / 1000)} Mt CO₂e` },
        { k: T.vs, v: `${Math.abs(ch) < 0.5 ? '' : ch > 0 ? '+' : '−'}${n0(Math.abs(ch))} %`, tone: ch >= 0.5 ? 'bad' : ch <= -0.5 ? 'ok' : 'muted' },
      ]} />
      <p className="readout">{T.note}</p>
    </div>
  );
}
