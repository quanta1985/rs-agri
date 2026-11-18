/**
 * Lab 13 — Đốt rơm, NO₂ và CH₄ ruộng lúa / Straw burning, NO₂ and rice CH₄ · Viễn thám Nông nghiệp & Môi trường, Chương 13
 * https://quanta1985.github.io/rs-agri/vi/emissions/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Số liệu ở tab Console, lớp bản đồ ở khung Layers. / Numbers in the Console tab, map layers in the Layers panel.
 * Điểm cháy là số ngày có cháy, không phải diện tích đốt hay lượng khí thải. Mây che thì vệ tinh không thấy.
 * A fire detection is a day with fire, not burnt area or emissions. Under cloud the satellite sees nothing.
 *
 * NASA FIRMS, MODIS C6.1 active fire (Giglio et al. 2016). ESA WorldCover 2021 v200, CC BY 4.0. CHIRPS (UCSB CHC).
 * Contains modified Copernicus Sentinel data (Sentinel-5P). IPCC 2019 Refinement Vol. 4 Ch. 5; AR6 GWP.
 * Ranh tỉnh / provinces: geoBoundaries v6 (gbOpen ADM1).
 */

// ---------- 0. Ranh vùng / Region outlines ----------
// Tên shapeName trong EE bị hỏng dấu ('H?u Giang'): chọn tỉnh bằng một điểm nằm trong tỉnh.
// shapeName values in EE have broken diacritics: pick each province by a point inside it.
var GB = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'));
var MEKONG_PTS = [[106.41, 10.54], [106.36, 10.36], [106.38, 10.24], [106.34, 9.93], [105.97, 10.25], [105.63, 10.46],
  [105.43, 10.38], [105.10, 9.85], [105.77, 10.03], [105.47, 9.78], [105.97, 9.60], [105.72, 9.29], [105.15, 9.18]];
var RED_PTS = [[105.85, 21.03], [105.60, 21.31], [106.07, 21.18], [107.30, 21.10], [106.33, 20.94], [106.63, 20.81],
  [106.05, 20.75], [106.34, 20.45], [105.92, 20.54], [106.17, 20.42], [105.97, 20.25]];
function provinces(pts) {
  return GB.filterBounds(ee.Geometry.MultiPoint(pts));
}
var mk = provinces(MEKONG_PTS), rd = provinces(RED_PTS);
print('số tỉnh / provinces (13, 11)', mk.size(), rd.size());
var MK = mk.geometry(), RD = rd.geometry();

// ---------- 1. Ngày cháy trên đất trồng trọt theo tháng / Cropland fire-days by month ----------
var FIRMS = ee.ImageCollection('FIRMS').select('T21');
var PROJ = FIRMS.first().projection();
var crop = ee.Image('ESA/WorldCover/v200/2021').eq(40)
  .reproject('EPSG:4326', null, 100).reduceResolution(ee.Reducer.mean(), false, 65535)   // 10 m -> 100 m -> 1 km
  .reproject(PROJ).gte(0.5);
var cells = crop.selfMask().reduceRegion({reducer: ee.Reducer.count(), geometry: MK, crs: PROJ, maxPixels: 1e10}).values().get(0);
print('ô 1 km đất trồng trọt / cropland 1 km cells', cells);
var Y0 = 2003, Y1 = 2025, NY = Y1 - Y0 + 1;
// Mỗi ảnh FIRMS là một ngày: số ảnh có cháy = số ngày cháy. / One FIRMS image per day: images with fire = fire-days.
var byMonth = ee.FeatureCollection(ee.List.sequence(1, 12).map(function (m) {
  var fd = FIRMS.filterDate(Y0 + '-01-01', (Y1 + 1) + '-01-01').filter(ee.Filter.calendarRange(m, m, 'month'))
    .map(function (i) { return i.gt(0).selfMask(); }).count().unmask(0).updateMask(crop);
  var s = fd.reduceRegion({reducer: ee.Reducer.sum().unweighted(), geometry: MK, crs: PROJ, maxPixels: 1e10}).values().get(0);
  return ee.Feature(null, {month: m, per1000: ee.Number(s).divide(NY).multiply(1000).divide(cells)});
}));
print(ui.Chart.feature.byFeature(byMonth, 'month', ['per1000']).setChartType('ColumnChart')
  .setOptions({title: 'ĐBSCL: ngày cháy / 1 000 ô đất trồng trọt / Mekong cropland fire-days per 1,000 cells (2003-2025)'}));

// ---------- 2. Tháng 2-4 mỗi năm và mưa tháng 12-4 / Feb-Apr per year vs Dec-Apr rain ----------
var CHIRPS = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY');
var years = ee.FeatureCollection(ee.List.sequence(Y0, Y1).map(function (y) {
  y = ee.Number(y);
  var fd = FIRMS.filterDate(ee.Date.fromYMD(y, 2, 1), ee.Date.fromYMD(y, 5, 1))
    .map(function (i) { return i.gt(0).selfMask(); }).count().unmask(0).updateMask(crop);
  var fire = fd.reduceRegion({reducer: ee.Reducer.sum().unweighted(), geometry: MK, crs: PROJ, maxPixels: 1e10}).values().get(0);
  var rain = CHIRPS.filterDate(ee.Date.fromYMD(y.subtract(1), 12, 1), ee.Date.fromYMD(y, 5, 1)).sum()
    .reduceRegion({reducer: ee.Reducer.mean(), geometry: MK, scale: 5566, maxPixels: 1e10}).values().get(0);
  return ee.Feature(null, {year: y, fire: fire, rain: rain});
}));
print('năm, ngày cháy tháng 2-4, mưa tháng 12-4 (mm) / year, Feb-Apr fire-days, Dec-Apr rain', years);
print('r(mưa / rain, ngày cháy / fire-days)', years.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['rain', 'fire']).get('correlation'));
print(ui.Chart.feature.byFeature(years, 'rain', ['fire']).setChartType('ScatterChart')
  .setOptions({title: 'Mưa 12-4 vs ngày cháy 2-4 / Dec-Apr rain vs Feb-Apr fire-days', hAxis: {title: 'mm'}, vAxis: {title: 'fire-days'}}));
// Chương 13: thấp nhất 2006 (1 902), cao nhất 2020 (11 003), r = -0,68. / Chapter 13: min 2006, max 2020, r = -0.68.

// ---------- 3. Ô cháy nhiều ngày / Frequently burning cells ----------
var fd5 = FIRMS.filterDate('2021-01-01', '2026-01-01').map(function (i) { return i.gt(0).selfMask(); }).count().divide(5);
Map.setCenter(105.8, 9.9, 8);
Map.addLayer(fd5.clip(MK), {min: 0, max: 4, palette: ['ffffb2', 'fecc5c', 'fd8d3c', 'f03b20', 'bd0026']},
  'Ngày cháy/năm 2021-2025 / fire-days per year');
Map.addLayer(fd5.gt(10).selfMask().clip(MK), {palette: ['00ffff']}, '> 10 ngày/năm: nguồn cố định? / fixed sources?');
// Chương 13: ô nóng nhất ĐBSCL ~106,32 E, 10,47 N, 14,2 ngày/năm. / Chapter 13: hottest Mekong cell ~106.32 E, 10.47 N.

// ---------- 4. NO2 tầng đối lưu / Tropospheric NO2 ----------
var NO2 = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2').select('tropospheric_NO2_column_number_density');
var no2 = ee.FeatureCollection(ee.List.sequence(2019, 2025).map(function (y) {
  var img = NO2.filterDate(ee.Date.fromYMD(y, 1, 1), ee.Date.fromYMD(ee.Number(y).add(1), 1, 1)).mean().multiply(1e6);
  var at = function (g) { return img.reduceRegion({reducer: ee.Reducer.mean(), geometry: g, scale: 7000, maxPixels: 1e10}).values().get(0); };
  return ee.Feature(null, {year: y, red: at(RD), mekong: at(MK)});
}));
print(ui.Chart.feature.byFeature(no2, 'year', ['red', 'mekong'])
  .setOptions({title: 'NO2 tầng đối lưu / tropospheric NO2 (µmol/m²)'}));
print('NO2 trung bình 2019-2025 / mean (µmol/m²): Red, Mekong', no2.aggregate_mean('red'), no2.aggregate_mean('mekong'));
// Chương 13: 64,8 và 20,2 µmol/m² (trung bình chuỗi tháng). / Chapter 13: 64.8 and 20.2 (mean of the monthly series).

// ---------- 5. CH4 ruộng lúa, IPCC Tier 1 (2019) / Rice CH4 ----------
var EFC = 1.22, DAYS = 102, GWP = 27;          // Đông Nam Á / SE Asia (Tables 5.11, 5.11A); AR6
function seasonCH4(sfw, sfp, strawT, cfoa) {   // kg CH4/ha/vụ / per season
  return EFC * sfw * sfp * Math.pow(1 + strawT * cfoa, 0.59) * DAYS;
}
var base = seasonCH4(1, 1, 0, 1), awd = seasonCH4(0.55, 1, 0, 1);
print('Ngập liên tục / continuous (kg CH4/ha, t CO2e/ha)', base.toFixed(1), (base * GWP / 1000).toFixed(2));
print('AWD (kg CH4/ha, % change)', awd.toFixed(1), (100 * (awd / base - 1)).toFixed(0));
print('Rơm 5 t/ha vùi < 30 ngày / straw 5 t/ha < 30 d: x', (seasonCH4(1, 1, 5, 1) / base).toFixed(2));
// Chương 13: 124,4 kg = 3,36 t CO2e; AWD -45 %. / Chapter 13: 124.4 kg = 3.36 t CO2e; AWD -45 %.
