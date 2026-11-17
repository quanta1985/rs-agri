// Recompute every Chapter 1 (deltas) number quoted in the prose.
//   node scripts/deltas_numbers.ts
import { readFileSync } from 'node:fs';

type Region = { area_ha: number; wc_ha: Record<string, number>; pop: Record<string, number> };
const stats = JSON.parse(readFileSync('public/data/deltas-stats.json', 'utf8')) as { regions: Record<string, Region>; wc_classes: Record<string, { en: string }> };
// Census of 1 April 2019 (Central Population and Housing Census Steering Committee 2019), regional totals
const CENSUS_2019: Record<string, number> = { red: 22_543_607, mekong: 17_273_630 };

for (const [r, s] of Object.entries(stats.regions)) {
  const km2 = s.area_ha / 100;
  const share = Object.entries(s.wc_ha).sort((a, b) => b[1] - a[1])
    .map(([c, ha]) => `${stats.wc_classes[c]?.en ?? c} ${((100 * ha) / s.area_ha).toFixed(1)} %`).join(', ');
  const p20 = s.pop['2020'], p00 = s.pop['2000'];
  console.log(`[1] ${r}: area ${(s.area_ha / 1e6).toFixed(2)} M ha (${Math.round(km2)} km²)`);
  console.log(`    land cover: ${share}`);
  console.log(`    GHSL 2020 ${(p20 / 1e6).toFixed(2)} M, density ${Math.round(p20 / km2)} /km²; 2000 ${(p00 / 1e6).toFixed(2)} M (+${((100 * (p20 - p00)) / p00).toFixed(1)} %)`);
  console.log(`    census 2019 ${(CENSUS_2019[r] / 1e6).toFixed(2)} M; GHSL 2020 vs census ${((100 * (p20 - CENSUS_2019[r])) / CENSUS_2019[r]).toFixed(1)} %`);
}
