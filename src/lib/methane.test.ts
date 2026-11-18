import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFOA, EFC, SEASON_DAYS, SFP, SFW, dailyEF, seasonCH4, sfo } from './methane.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('no amendment gives SF_o = 1', () => close(sfo([]), 1));

test('IPCC 2019 worked example: 2 t/ha straw shortly before cultivation -> SF_o = 3^0.59', () =>
  close(sfo([{ rate: 2, cfoa: CFOA.strawShort }]), 3 ** 0.59));

test('South-East Asia default season, continuous flooding: 1.22 x 102 kg CH4/ha', () =>
  close(seasonCH4(EFC.southeastAsia, SEASON_DAYS.southeastAsia, SFW.continuous, SFP.dryShort), 124.44, 1e-6));

test('AWD (multiple drainage) scales the daily factor by 0.55', () =>
  close(dailyEF(1.22, SFW.multiple, SFP.dryShort) / dailyEF(1.22, SFW.continuous, SFP.dryShort), 0.55));

test('negative inputs are clamped', () => {
  close(sfo([{ rate: -3, cfoa: 1 }]), 1);
  close(seasonCH4(1.22, -5, 1, 1), 0);
});
