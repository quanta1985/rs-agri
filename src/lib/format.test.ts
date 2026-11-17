import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitsFor, fmtNum, fmtTime, placeName } from './format.ts';

test('digitsFor resolves one raw step', () => {
  assert.equal(digitsFor(0.005), 3);
  assert.equal(digitsFor(0.5), 1);
  assert.equal(digitsFor(0.15), 1);
  assert.equal(digitsFor(0.01), 2);
  assert.equal(digitsFor(1), 0);
});

test('fmtNum uses the decimal comma in Vietnamese', () => {
  assert.equal(fmtNum('vi', 0.415, 3), '0,415');
  assert.equal(fmtNum('en', 0.415, 3), '0.415');
  assert.equal(fmtNum('vi', 12345.6, 1), '12.345,6');
});

test('fmtTime formats months and days per language, passes other labels through', () => {
  assert.equal(fmtTime('vi', '2024-03'), '03/2024');
  assert.equal(fmtTime('vi', '2024-10-14'), '14/10/2024');
  assert.equal(fmtTime('en', '2024-03'), 'Mar 2024');
  assert.equal(fmtTime('en', '2024-10-14'), '14 Oct 2024');
  assert.equal(fmtTime('vi', '1984–2021'), '1984–2021');
});

test('placeName strips Vietnamese diacritics on English pages only', () => {
  assert.equal(placeName('en', 'Đồng Tháp'), 'Dong Thap');
  assert.equal(placeName('en', 'Hà Nội'), 'Ha Noi');
  assert.equal(placeName('en', 'Thừa Thiên Huế'), 'Thua Thien Hue');
  assert.equal(placeName('vi', 'Hà Nội'), 'Hà Nội');
});
