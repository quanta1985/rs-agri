/**
 * Lab 14 — Chồng lớp rủi ro / Risk overlay · Viễn thám Nông nghiệp & Môi trường, Chương 14
 * https://quanta1985.github.io/rs-agri/vi/risk/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Số liệu ở tab Console, lớp bản đồ ở khung Layers. / Numbers in the Console tab, map layers in the Layers panel.
 * Bản này dựng hai chỉ số từ dữ liệu gốc (đất thấp từ DeltaDTM, cây trồng suy giảm từ MODIS EVI) và chồng chúng có
 * trọng số. Chồng lớp đủ bốn chỉ số và bảng theo tỉnh nằm trong bản Python (đọc dữ liệu đã xuất của trang).
 * This version builds two indicators from raw data (low land from DeltaDTM, crop decline from MODIS EVI) and overlays
 * them with weights. The full four-indicator overlay and the province table are in the Python version (site data).
 * Lưới ~250 m ở đây không trùng gốc với lưới của trang, nên số lệch nhẹ. / The ~250 m grid here is not aligned with the
 * site's grid origin, so numbers differ slightly.
 *
 * DeltaDTM v1.0 (Pronk et al. 2024), CC BY 4.0. ESA WorldCover 2021 v200, CC BY 4.0. MODIS MOD13Q1/MYD13Q1 v061.
 * Ranh tỉnh / provinces: geoBoundaries v6 (gbOpen ADM1).
 */

// ---------- 0. Vùng ĐBSCL và mặt nạ đất trồng trọt / Mekong region and cropland mask ----------
// Tên shapeName trong EE bị hỏng dấu: chọn tỉnh bằng một điểm trong tỉnh. / Broken shapeName diacritics: pick by points.
var GB = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'));
var mk = GB.filterBounds(ee.Geometry.MultiPoint([[106.41, 10.54], [106.36, 10.36], [106.38, 10.24], [106.34, 9.93],
  [105.97, 10.25], [105.63, 10.46], [105.43, 10.38], [105.10, 9.85], [105.77, 10.03], [105.47, 9.78], [105.97, 9.60],
  [105.72, 9.29], [105.15, 9.18]]));
var MK = mk.geometry();
var GRID = ee.Projection('EPSG:3857').atScale(250);   // ô ~250 m như chương / ~250 m cells like the chapter
// Tỉ lệ đất trồng trọt WorldCover 2021 trong ô: 10 m -> 100 m -> 250 m / cropland share per cell
var cropShare = ee.Image('ESA/WorldCover/v200/2021').eq(40).multiply(100)
  .reproject('EPSG:4326', null, 100).reduceResolution(ee.Reducer.mean(), false, 65535).reproject(GRID);
var farm = cropShare.gte(50);

// ---------- 1. Đất thấp: 100 điểm khi <= 1 m, 0 khi >= 3 m / Low land: 100 at <= 1 m, 0 at >= 3 m ----------
var z = ee.Image('projects/sat-io/open-datasets/DELTARES/deltadtm_v1').select('b1')
  .reduceResolution(ee.Reducer.mean(), false, 1024).reproject(GRID);
var low = ee.Image(3).subtract(z).multiply(50).clamp(0, 100).updateMask(farm).rename('low');

// ---------- 2. Cây trồng suy giảm mùa khô / Dry-season crop decline ----------
// Tỉ lệ trong 2016, 2020, 2024 có dị thường EVI tháng 2-4 <= -0.05 so với trung vị 2010-2024 (Chương 10).
// Share of 2016, 2020, 2024 with a Feb-Apr EVI anomaly <= -0.05 against the 2010-2024 median (Chapter 10).
var MODIS = ee.ImageCollection('MODIS/061/MOD13Q1').merge(ee.ImageCollection('MODIS/061/MYD13Q1'));
function dryEvi(year) {
  return MODIS.filterDate(ee.Date.fromYMD(year, 2, 1), ee.Date.fromYMD(year, 5, 1)).map(function (im) {
    return im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1));
  }).mean();
}
var base = ee.ImageCollection(ee.List.sequence(2010, 2024).map(function (y) { return dryEvi(ee.Number(y)); })).median();
var cropDecline = ee.ImageCollection([2016, 2020, 2024].map(function (y) {
  return dryEvi(y).subtract(base).lte(-0.05);
})).mean().multiply(100).reproject(GRID).updateMask(farm).rename('crop');

// ---------- 3. Chồng lớp có trọng số / Weighted overlay ----------
// R = sum(w_k s_k) / sum(w_k), chỉ trên các chỉ số có dữ liệu ở ô đó. / only over indicators with data in the cell.
var WEIGHTS = {crop: 1, low: 1};   // <-- thử / try {crop: 1, low: 3}
var layers = {crop: cropDecline, low: low};
var num = ee.Image(0), den = ee.Image(0);
Object.keys(WEIGHTS).forEach(function (k) {
  var s = layers[k];
  num = num.add(s.unmask(0).multiply(WEIGHTS[k]));
  den = den.add(s.mask().gt(0).multiply(WEIGHTS[k]));
});
var R = num.divide(den).updateMask(den.gt(0).and(farm)).rename('R');

// ---------- 4. Tỉ lệ diện tích >= 50 / Share of the area >= 50 ----------
var HA = ee.Image.pixelArea().divide(1e4);
function highShare(img, label) {
  var r = HA.updateMask(img.mask()).rename('all').addBands(HA.updateMask(img.gte(50)).rename('high'))
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: MK, crs: GRID, maxPixels: 1e10, tileScale: 8});
  print(label + ': nghìn ha đất trồng trọt / cropland kha, % >= 50',
    ee.Number(r.get('all')).divide(1000), ee.Number(r.get('high')).divide(r.get('all')).multiply(100));
}
highShare(low, 'Đất thấp / low land');           // Chương 14: 68,4 % của 1 939 nghìn ha / Chapter 14: 68.4 % of 1,939 kha
highShare(cropDecline, 'Cây trồng / crop');      // Chương 14: 33,8 % / Chapter 14: 33.8 %
highShare(R, 'Chỉ số 2 chỉ báo / two-indicator index');

Map.centerObject(mk, 8);
var YLORRD = ['ffffcc', 'fed976', 'fd8d3c', 'e31a1c', '800026'];
Map.addLayer(z.updateMask(farm).clip(MK), {min: 0, max: 4, palette: ['440154', '3b528b', '21918c', '5ec962', 'fde725']},
  'DeltaDTM trên đất trồng trọt / on cropland (m)', false);
Map.addLayer(low.clip(MK), {min: 0, max: 100, palette: YLORRD}, 'Đất thấp / low land (0-100)', false);
Map.addLayer(cropDecline.clip(MK), {min: 0, max: 100, palette: YLORRD}, 'Cây trồng suy giảm / crop decline (0-100)', false);
Map.addLayer(R.clip(MK), {min: 0, max: 100, palette: YLORRD}, 'R (crop + low)');
