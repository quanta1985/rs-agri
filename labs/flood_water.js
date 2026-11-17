/**
 * Lab 8 — Nước mặt & lũ / Surface water & floods · Viễn thám Nông nghiệp & Môi trường, Chương 8
 * https://quanta1985.github.io/rs-agri/vi/flood/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. Số in ở tab Console, lớp bản đồ ở khung Layers.
 * Paste into the Earth Engine Code Editor and press Run. Numbers go to the Console, map layers to Layers.
 * Same steps as the Python notebook labs/flood_water.ipynb (areas there use the chapter's exact Web Mercator frames;
 * here the frames are 10.24 km squares around the same centres, so hectares differ slightly).
 *
 * Contains modified Copernicus Sentinel data 2018-2024. JRC Global Surface Water (Pekel et al. 2016);
 * ESA WorldCover 2021; geoBoundaries (CC BY 4.0).
 */

// 10.24 km square frame around a centre (lon, lat), metres projected in UTM 48N.
function frame(lon, lat) {
  return ee.Geometry.Point([lon, lat]).buffer(5120).bounds(1, 'EPSG:32648');
}
var AG = frame(105.08, 10.45);    // Tri Tôn, An Giang
var NB = frame(105.795, 20.329);  // Nho Quan – Gia Viễn, Ninh Bình
var flat = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003')).lt(5);

// Hectares of a 0/1 mask inside a geometry.
function ha(mask, geom, scale) {
  return mask.selfMask().multiply(ee.Image.pixelArea()).divide(1e4)
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: geom, scale: scale, maxPixels: 1e9}).values().get(0);
}

// Otsu threshold from a fixed-range histogram (same as the chapter's figures: 256 bins).
function otsu(img, geom, lo, hi, scale) {
  var arr = ee.Array(img.reduceRegion({
    reducer: ee.Reducer.fixedHistogram(lo, hi, 256), geometry: geom, scale: scale, maxPixels: 1e9}).values().get(0));
  var counts = arr.slice(1, 1, 2).project([0]);
  var idx = ee.Array(ee.List.sequence(0, 255));
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sumAll = counts.multiply(idx).reduce(ee.Reducer.sum(), [0]).get([0]);
  var between = ee.List.sequence(0, 254).map(function (i) {
    i = ee.Number(i);
    var c = counts.slice(0, 0, i.add(1));
    var wB = c.reduce(ee.Reducer.sum(), [0]).get([0]);
    var sB = c.multiply(idx.slice(0, 0, i.add(1))).reduce(ee.Reducer.sum(), [0]).get([0]);
    var wF = total.subtract(wB);
    var d = ee.Number(sB).divide(ee.Number(wB).max(1)).subtract(ee.Number(sumAll).subtract(sB).divide(wF.max(1)));
    return ee.Algorithms.If(ee.Number(wB).gt(0).and(wF.gt(0)), ee.Number(wB).multiply(wF).multiply(d.pow(2)), -1);
  });
  var k = ee.Number(ee.Array(between).argmax().get(0));
  return k.add(1).multiply((hi - lo) / 256).add(lo);
}

Map.setOptions('SATELLITE');

// 1. JRC GSW: occurrence (% of observed months with water 1984-2021) and seasonality (months with water, 2021)
var gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater');
Map.centerObject(AG, 12);
Map.addLayer(gsw.select('occurrence').clip(AG), {min: 0, max: 100, palette: ['ffffff', '08306b']}, '1. GSW occurrence (%)');
Map.addLayer(gsw.select('seasonality').clip(AG), {min: 0, max: 12, palette: ['ffffff', '08306b']}, '1. GSW seasonality 2021', false);
print('1. GSW permanent water (occurrence >= 90 %), ha', ha(gsw.select('occurrence').gte(90), AG, 30));
print('1. GSW seasonal water 2021 (1-9 months), ha',
      ha(gsw.select('seasonality').gte(1).and(gsw.select('seasonality').lt(10)), AG, 30));

// 2. MNDWI (Sentinel-2) vs VV (Sentinel-1, orbit 26), same day 26 Oct 2024, Otsu thresholds
var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(AG)
  .filterDate('2024-10-26', '2024-10-27').linkCollection(cs, ['cs_cdf']).mosaic();
var mndwi = s2.normalizedDifference(['B3', 'B11']).updateMask(s2.select('cs_cdf').gte(0.6));
var vv = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(AG).filterDate('2024-10-26', '2024-10-27')
  .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.eq('relativeOrbitNumber_start', 26))
  .mosaic().select('VV');
// Đổi ngày mà không có ảnh thì mosaic() rỗng và báo lỗi band: in .size() trước. / A date with no scene gives an empty
// mosaic() and a band error: print the collection .size() first.
var roundTo = function (x, step) { return ee.Number(x).divide(step).round().multiply(step); };
var tM = roundTo(otsu(mndwi, AG, -0.8, 0.8, 10), 0.02);   // làm tròn như notebook và Hình 8.2 / rounded as in the notebook and Fig. 8.2
var tV = roundTo(otsu(vv, AG, -30, 0, 10), 0.25);
print('2. Otsu MNDWI', tM, 'Otsu VV (dB)', tV);
var wM = mndwi.gt(ee.Image.constant(tM));
var wV = vv.lt(ee.Image.constant(tV));
print('2. water ha: MNDWI', ha(wM, AG, 10), 'VV', ha(wV, AG, 10));
print('2. agreement (share of pixels where both agree)',
      wM.eq(wV).reduceRegion({reducer: ee.Reducer.mean(), geometry: AG, scale: 10, maxPixels: 1e9}).values().get(0));
Map.addLayer(mndwi.clip(AG), {min: -0.6, max: 0.6}, '2. MNDWI 2024-10-26', false);
Map.addLayer(vv.clip(AG), {min: -25, max: 0}, '2. S1 VV 2024-10-26', false);
Map.addLayer(wM.multiply(1).add(wV.multiply(2)).clip(AG).selfMask(),
             {min: 1, max: 3, palette: ['E69F00', 'CC79A7', '0072B2']}, '2. water: orange MNDWI only, pink radar only, blue both');

// 3. Monthly water area, An Giang province, Jul-Dec 2018 and 2024 (VV monthly median < -18 dB, slope < 5 deg, ~100 m)
var prov = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1')
  .filter(ee.Filter.eq('shapeGroup', 'VNM')).filter(ee.Filter.eq('shapeName', 'An Giang')).geometry();
var col = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(prov).filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')).select('VV');
var proj = col.first().projection().atScale(100);
var rows = [];
[2018, 2024].forEach(function (y) {
  for (var m = 7; m <= 12; m++) {
    var start = ee.Date.fromYMD(y, m, 1);
    var w = col.filterDate(start, start.advance(1, 'month')).median().lt(-18).updateMask(flat).setDefaultProjection(proj);
    rows.push(ee.Feature(null, {year: String(y), month: m, kha: ee.Number(ha(w, prov, 100)).divide(1000)}));
  }
});
print(ui.Chart.feature.groups(ee.FeatureCollection(rows), 'month', 'kha', 'year')
  .setOptions({title: '3. An Giang: monthly surface water (thousand ha)', hAxis: {title: 'month'}, vAxis: {title: 'thousand ha'}}));

// 4. Typhoon Yagi: new water on cropland, S1 orbit 91, 31 Aug vs 12 Sep 2024, Nho Quan - Gia Vien (Ninh Binh)
function s1day(day) {
  var d = ee.Date(day);
  return ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(NB).filterDate(d, d.advance(1, 'day'))
    .filter(ee.Filter.eq('instrumentMode', 'IW')).filter(ee.Filter.eq('relativeOrbitNumber_start', 91))
    .mosaic().select('VV');
}
var pre = s1day('2024-08-31'), post = s1day('2024-09-12');
var crop = ee.ImageCollection('ESA/WorldCover/v200').first().eq(40);
var before = pre.lt(-18).updateMask(flat), after = post.lt(-18).updateMask(flat);
var neu = after.and(before.not());
print('4. new water ha', ha(neu, NB, 10), 'on cropland ha', ha(neu.and(crop), NB, 10));
Map.addLayer(post.clip(NB), {min: -25, max: 0}, '4. S1 VV 2024-09-12', false);
Map.addLayer(before.selfMask().clip(NB), {palette: ['0072B2']}, '4. water before (31 Aug)', false);
Map.addLayer(neu.and(crop).selfMask().clip(NB), {palette: ['D55E00']}, '4. new water on cropland (12 Sep)', false);
