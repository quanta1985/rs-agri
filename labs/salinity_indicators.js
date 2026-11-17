/**
 * Lab 10 — Xâm nhập mặn / Salinity intrusion · Viễn thám Nông nghiệp & Môi trường, Chương 10
 * https://quanta1985.github.io/rs-agri/vi/salinity/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Không chỉ số nào ở đây đo được độ mặn: vệ tinh chỉ thấy cây trồng và mặt đất.
 * None of these indices measures salinity: satellites see plants and the ground.
 *
 * Contains modified Copernicus Sentinel data 2024. Dynamic World V1 (Brown et al. 2022), CC BY 4.0.
 * MODIS MOD13Q1/MYD13Q1 v061, NASA LP DAAC. FAO GAUL 2015.
 */

// ---------- 1. Dị thường EVI mùa khô / Dry-season EVI anomaly ----------
var YEAR = 2020;
var COASTAL = ['Long An', 'Tien Giang', 'Ben Tre', 'Tra Vinh', 'Soc Trang', 'Bac Lieu', 'Ca Mau', 'Kien Giang'];
var INLAND = ['Vinh Long', 'Dong Thap', 'An Giang', 'Can Tho city', 'Hau Giang'];
var gaul = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM0_NAME', 'Viet Nam'));
var coastal = gaul.filter(ee.Filter.inList('ADM1_NAME', COASTAL));
var inland = gaul.filter(ee.Filter.inList('ADM1_NAME', INLAND));
var delta = coastal.merge(inland);

var MODIS = ee.ImageCollection('MODIS/061/MOD13Q1').merge(ee.ImageCollection('MODIS/061/MYD13Q1'));
function dryEvi(year) {
  var col = MODIS.filterDate(ee.Date.fromYMD(year, 2, 1), ee.Date.fromYMD(year, 5, 1));
  return col.map(function (im) {
    return im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1));
  }).mean();
}
var years = ee.List.sequence(2010, 2024);
var base = ee.ImageCollection(years.map(function (y) { return dryEvi(ee.Number(y)); })).median();
var anom = dryEvi(YEAR).subtract(base).rename('anom');

// Tỷ lệ diện tích có dị thường <= -0.05 / share of area with anomaly <= -0.05 (scale 250 m)
function share(fc, label) {
  var low = anom.lte(-0.05).updateMask(anom.mask());
  var v = low.reduceRegion({reducer: ee.Reducer.mean(), geometry: fc.geometry(), scale: 250, maxPixels: 1e9, tileScale: 4});
  print(label + ' — EVI anomaly <= -0.05 (%)', ee.Number(v.get('anom')).multiply(100));
}
share(delta, YEAR + ' ĐBSCL / Mekong Delta');
share(coastal, YEAR + ' ven biển / coastal');
share(inland, YEAR + ' nội đồng / inland');

Map.centerObject(delta, 8);
Map.addLayer(anom.clipToCollection(delta), {min: -0.2, max: 0.2, palette: ['8c510a', 'd8b365', 'f6e8c3', 'f5f5f5', 'c7eae5', '5ab4ac', '01665e']},
  'Dị thường EVI / EVI anomaly ' + YEAR);

// ---------- 2. NDVI, SI, NDSI ở Bến Tre / at Ben Tre ----------
var frame = ee.Geometry.Point([106.5, 10.1]).buffer(5120).bounds();
var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(frame).filterDate('2024-02-01', '2024-05-01')
  .linkCollection(cs, ['cs_cdf'])
  .map(function (im) { return im.select(['B2', 'B4', 'B8']).divide(10000).updateMask(im.select('cs_cdf').gte(0.6)); })
  .median();
var ndvi = s2.normalizedDifference(['B8', 'B4']).rename('ndvi');
var si = s2.select('B2').multiply(s2.select('B4')).sqrt().rename('si');
var ndsi = s2.normalizedDifference(['B4', 'B8']).rename('ndsi');
print('r(NDVI, SI)', ndvi.addBands(si).reduceRegion({reducer: ee.Reducer.pearsonsCorrelation(), geometry: frame, scale: 10, maxPixels: 1e8}).get('correlation'));
print('max |NDSI + NDVI| (= 0: NDSI = -NDVI)', ndsi.add(ndvi).abs().reduceRegion({reducer: ee.Reducer.max(), geometry: frame, scale: 10, maxPixels: 1e8}));
Map.addLayer(ndvi.clip(frame), {min: -0.2, max: 0.9, palette: ['a50026', 'fdae61', 'ffffbf', 'a6d96a', '006837']}, 'NDVI Bến Tre 2024', false);
Map.addLayer(si.clip(frame), {min: 0, max: 0.15, palette: ['ffffb2', 'fecc5c', 'fd8d3c', 'f03b20', 'bd0026']}, 'SI Bến Tre 2024', false);

// ---------- 3. Dynamic World 2018 vs 2024 ----------
var DW_PALETTE = ['419bdf', '397d49', '88b053', '7a87c6', 'e49635', 'dfc35a', 'c4281b', 'a59b8f', 'b39fe1'];
var DW_NAMES = ['water', 'trees', 'grass', 'flooded_vegetation', 'crops', 'shrub_and_scrub', 'built', 'bare', 'snow_and_ice'];
var SITES = {'Bến Tre': [106.5, 10.1], 'Cà Mau': [105.0, 8.75]};
Object.keys(SITES).forEach(function (site) {
  var box = ee.Geometry.Point(SITES[site]).buffer(5120).bounds();
  [2018, 2024].forEach(function (y) {
    var mode = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(box)
      .filterDate(y + '-01-01', (y + 1) + '-01-01').select('label').mode();
    var hist = mode.reduceRegion({reducer: ee.Reducer.frequencyHistogram(), geometry: box, scale: 10, maxPixels: 1e8}).get('label');
    print(site + ' ' + y + ' — số pixel theo lớp / pixels per class (0 = ' + DW_NAMES.join(', ') + ')', hist);
    Map.addLayer(mode.clip(box), {min: 0, max: 8, palette: DW_PALETTE}, 'Dynamic World ' + site + ' ' + y, false);
  });
});

// ---------- 4. Chiều dài xâm nhập mặn 4 g/L (số liệu công bố) / Published 4 g/L intrusion lengths ----------
var LENGTHS = [
  ['Vàm Cỏ Tây', '2015–16', 135, 135, 'peak', 'cuối 3/2016', 'Nguyễn Ngọc Anh 2017'],
  ['Vàm Cỏ Tây', '2019–20', 130, 130, 'peak', '5/2020', 'Tổng cục Thủy lợi, 20/6/2020'],
  ['Vàm Cỏ Tây', '2023–24', 60, 64, 'mid-season', '8–14/2/2024 (Vàm Cỏ)', 'Cục Thủy lợi, 23/2/2024'],
  ['Cửa sông Cửu Long', '2015–16', 70, 81, 'peak', 'cuối 3/2016', 'Nguyễn Ngọc Anh 2017'],
  ['Cửa sông Cửu Long', '2019–20', 45, 66, 'mid-season', '6–13/1/2020', 'Bộ NN-PTNT 2020'],
  ['Cửa sông Cửu Long', '2023–24', 40, 66, 'peak', '8–13/3/2024', 'Đài KTTV Nam Bộ, 22/3/2024'],
];
print('Ranh mặn 4 g/L (km từ cửa sông) / 4 g/L intrusion (km from the mouth): area, season, low, high, peak?, when, source', LENGTHS);
var dt = ee.FeatureCollection(LENGTHS.map(function (r) {
  return ee.Feature(null, {label: r[0] + ' ' + r[1], low: r[2], high: r[3]});
}));
print(ui.Chart.feature.byFeature(dt, 'label', ['low', 'high']).setChartType('BarChart')
  .setOptions({title: 'Published 4 g/L intrusion lengths (km)', hAxis: {title: 'km'}}));
