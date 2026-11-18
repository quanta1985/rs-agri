/** IPCC Tier 1 methane from flooded rice (2019 Refinement to the 2006 Guidelines, Vol. 4 Ch. 5.5).
 *  EF_i = EF_c x SF_w x SF_p x SF_o (Eq. 5.2), SF_o = (1 + sum ROA_i x CFOA_i)^0.59 (Eq. 5.3),
 *  CH4 = EF_i x t x A (Eq. 5.1, kg CH4). Default values from Tables 5.11-5.14. */

/** Baseline EF_c, kg CH4/ha/day (continuously flooded, not flooded < 180 d before, no organic amendment), Table 5.11. */
export const EFC = { world: 1.19, southeastAsia: 1.22 } as const;
/** Default cultivation period (days), Table 5.11A. */
export const SEASON_DAYS = { world: 113, southeastAsia: 102 } as const;
/** Water regime during cultivation, Table 5.12 (AWD = multiple drainage). */
export const SFW = { continuous: 1.0, single: 0.71, multiple: 0.55 } as const;
/** Pre-season water regime, Table 5.13. */
export const SFP = { dryShort: 1.0, dryLong: 0.89, flooded: 2.41 } as const;
/** Organic amendment conversion factors, Table 5.14 (straw in t dry matter/ha; burnt or surface straw does not count). */
export const CFOA = { strawShort: 1.0, strawLong: 0.19 } as const;
/** GWP-100 of non-fossil CH4, IPCC AR6 WG1 Table 7.15. */
export const GWP_CH4 = 27.0;

export type Amendment = { rate: number; cfoa: number };

export const sfo = (amendments: Amendment[]): number =>
  (1 + amendments.reduce((s, a) => s + Math.max(0, a.rate) * a.cfoa, 0)) ** 0.59;

/** Daily emission factor EF_i, kg CH4/ha/day. */
export const dailyEF = (efc: number, sfw: number, sfp: number, amendments: Amendment[] = []): number =>
  efc * sfw * sfp * sfo(amendments);

/** CH4 for one season, kg per ha. */
export const seasonCH4 = (efc: number, days: number, sfw: number, sfp: number, amendments: Amendment[] = []): number =>
  dailyEF(efc, sfw, sfp, amendments) * Math.max(0, days);
