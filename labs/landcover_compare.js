/**
 * Lab 3 — So sánh ba bản đồ lớp phủ / Comparing three land cover maps · Viễn thám Nông nghiệp & Môi trường, Chương 3
 * https://quanta1985.github.io/rs-agri/vi/landcover/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Ba bản đồ năm 2021 đưa về 7 lớp chung: 1 nước, 2 cây gỗ, 3 cây trồng, 4 xây dựng, 5 cỏ/cây bụi, 6 thực vật ngập nước, 7 đất trống.
 * Three 2021 maps mapped to 7 shared classes: 1 water, 2 trees, 3 crops, 4 built-up, 5 grass/shrub, 6 flooded vegetation, 7 bare.
 * Khung ở đây là hình vuông 10,24 km quanh tâm, gần đúng khung Web Mercator của trang web: số có thể lệch nhẹ.
 * Frames here are 10.24 km squares around the centre, close to the website's Web Mercator frames: numbers may differ slightly.
 *
 * ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022); Dynamic World V1 (Brown et al. 2022); Esri 10 m Annual LULC,
 * Impact Observatory (Karra et al. 2021); all CC BY 4.0. Contains modified Copernicus Sentinel data. geoBoundaries (Runfola et al. 2020).
 */

var YEAR = 2021;
var ESRI = 'projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS';
var NAMES = ['water', 'trees', 'crops', 'built', 'grass_shrub', 'flooded_veg', 'bare'];
var PALETTE = ['ffffff', '419bdf', '397d49', 'e49635', 'c4281b', 'e3e2c3', '7a87c6', 'a59b8f'];
var REMAP = {
  wc: [[10, 20, 30, 40, 50, 60, 80, 90, 95, 100], [2, 5, 5, 3, 4, 7, 1, 6, 2, 5]],
  dw: [[0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 5, 6, 3, 5, 4, 7]],
  esri: [[1, 2, 4, 5, 7, 8, 11], [1, 2, 6, 3, 4, 7, 5]]
};
var SITES = {'Bến Tre': [106.5, 10.1], 'Nam Định': [106.42, 20.22]};
function siteBox(lonlat) { return ee.Geometry.Point(lonlat).buffer(5120).bounds(); }

function harmonised(geom, year) {
  var start = ee.Date.fromYMD(year, 1, 1), end = ee.Date.fromYMD(year + 1, 1, 1);
  var wc = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map');
  var dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(geom).filterDate(start, end).select('label').mode();
  var esri = ee.ImageCollection(ESRI).filterBounds(geom).filterDate(start, end).mosaic();
  return ee.Image.cat([
    wc.remap(REMAP.wc[0], REMAP.wc[1], 0).rename('wc'),
    dw.remap(REMAP.dw[0], REMAP.dw[1], 0).rename('dw'),
    esri.remap(REMAP.esri[0], REMAP.esri[1], 0).rename('esri')
  ]).toUint8();
}

// ---------- 1. Ba bản đồ, một chú giải / Three maps, one legend ----------
// ---------- 2. Đồng thuận về cây trồng / Crop agreement (WC x1 + DW x2 + Esri x4) ----------
Object.keys(SITES).forEach(function (site) {
  var box = siteBox(SITES[site]);
  var h = harmonised(box, YEAR);
  var valid = h.reduce(ee.Reducer.min()).gt(0);
  ['wc', 'dw', 'esri'].forEach(function (b) {
    var hist = h.select(b).updateMask(valid).reduceRegion({reducer: ee.Reducer.frequencyHistogram(), geometry: box, scale: 10, maxPixels: 1e8}).get(b);
    print(site + ' ' + b + ' — số pixel theo lớp chung 1..7 / pixels per shared class 1..7 (' + NAMES.join(', ') + ')', hist);
    Map.addLayer(h.select(b).clip(box), {min: 0, max: 7, palette: PALETTE}, site + ' ' + b + ' ' + YEAR, false);
  });
  var crop = h.eq(3);
  var code = crop.select('wc').add(crop.select('dw').multiply(2)).add(crop.select('esri').multiply(4)).updateMask(valid).rename('code');
  var agree = code.reduceRegion({reducer: ee.Reducer.frequencyHistogram(), geometry: box, scale: 10, maxPixels: 1e8}).get('code');
  print(site + ' — mã đồng thuận 0..7 (7 = cả ba gọi là cây trồng) / agreement code 0..7 (7 = all three call it crops)', agree);
  Map.addLayer(code.clip(box), {min: 0, max: 7, palette: ['f2f2f2', 'e69f00', '56b4e9', '0072b2', 'cc79a7', 'd55e00', '7b3294', '009e73']},
    site + ' — đồng thuận cây trồng / crop agreement', site === 'Bến Tre');
});
Map.centerObject(siteBox(SITES['Bến Tre']), 13);

// ---------- 3. Đất trồng trọt Esri từng năm, tỉnh Bến Tre / Esri cropland per year, Ben Tre province ----------
// Tên tỉnh trong bản geoBoundaries trên EE mất dấu tiếng Việt ('B?n Tre'): chọn tỉnh bằng một điểm.
// Province names in the EE copy of geoBoundaries lose Vietnamese letters ('B?n Tre'): pick the province with a point.
var ADM1 = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'));
var bentre = ADM1.filterBounds(ee.Geometry.Point([106.52, 10.07])).first().geometry();
var years = ee.List.sequence(2017, 2025);
var series = ee.FeatureCollection(years.map(function (y) {
  y = ee.Number(y);
  var esri = ee.ImageCollection(ESRI).filterBounds(bentre)
    .filterDate(ee.Date.fromYMD(y, 1, 1), ee.Date.fromYMD(y.add(1), 1, 1)).mosaic()
    .remap(REMAP.esri[0], REMAP.esri[1], 0);
  var ha = ee.Image.pixelArea().divide(1e4).updateMask(esri.eq(3))
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: bentre, scale: 30, maxPixels: 1e10, tileScale: 4}).get('area');
  return ee.Feature(null, {year: y, crops_kha: ee.Number(ha).divide(1000)});
}));
print('Tỉnh Bến Tre — cây trồng theo Esri / Ben Tre province — Esri crops (kha)', series);
print(ui.Chart.feature.byFeature(series, 'year', ['crops_kha'])
  .setOptions({title: 'Ben Tre province, Esri crops (thousand ha)', hAxis: {format: '####'}, vAxis: {minValue: 0}, pointSize: 4}));

// ---------- 4. WorldCover của ĐBSCL / WorldCover in the Mekong Delta (30 m) ----------
var MEKONG_POINTS = [[106.10, 10.71], [106.13, 10.41], [106.52, 10.07], [106.30, 9.82], [105.97, 10.12], [105.72, 10.55],
  [105.16, 10.58], [105.28, 9.98], [105.52, 10.12], [105.63, 9.77], [105.90, 9.61], [105.55, 9.36], [105.10, 9.08]];
var mekong = ADM1.filterBounds(ee.Geometry.MultiPoint(MEKONG_POINTS));
print('Số tỉnh / provinces', mekong.size());
var wcMap = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map');
var groups = ee.Image.pixelArea().divide(1e4).addBands(wcMap).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}), geometry: mekong.geometry(), scale: 30,
  maxPixels: 1e11, tileScale: 4}).get('groups');
print('ĐBSCL — ha theo lớp WorldCover (10 cây gỗ, 40 đất trồng trọt, 50 xây dựng, 80 nước, 95 rừng ngập mặn…) / Mekong Delta — ha per WorldCover class', groups);
Map.addLayer(mekong.style({color: '333333', fillColor: '00000000', width: 1}), {}, 'Tỉnh ĐBSCL / Mekong provinces', false);
