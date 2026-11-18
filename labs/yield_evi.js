/**
 * Lab 6 — EVI và năng suất lúa / EVI and rice yield · Viễn thám Nông nghiệp & Môi trường, Chương 6
 * https://quanta1985.github.io/rs-agri/vi/yield/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. Số in ở tab Console, biểu đồ cũng ở Console.
 * Paste into the Earth Engine Code Editor and press Run. Numbers and charts go to the Console.
 * Same steps as the Python notebook labs/yield_evi.ipynb: peak EVI of the winter-spring season on cropland,
 * NSO yields, raw vs detrended R², leave-one-out error vs the mean of the other years.
 *
 * MODIS MOD13Q1/MYD13Q1 v061, NASA LP DAAC. ESA WorldCover 2021 v200, CC BY 4.0. geoBoundaries, CC BY 4.0.
 * Yields: NSO (Cục Thống kê) PX-Web tables V06.16-V06.18, winter-spring rice, t/ha per sown area (2025 preliminary).
 */

// The Earth Engine copy of geoBoundaries lost letters outside Latin-1 ('Hậu Giang' -> 'H?u Giang').
function gbName(s) { return s.replace(/[^\u0000-ÿ]/g, '?'); }
var PROVS = ['Long An', 'An Giang'];
var GB = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'));
var fc = GB.filter(ee.Filter.inList('shapeName', PROVS.concat(PROVS.map(gbName))));  // correct or corrupted spelling

// ---------- 1. EVI cực đại vụ Đông Xuân / Winter-spring peak EVI ----------
var YEARS = [];
for (var y = 2001; y <= 2025; y++) YEARS.push(y);  // harvest year: 2001 = 15 Nov 2000 - 31 Mar 2001
var MODIS = ee.ImageCollection('MODIS/061/MOD13Q1').merge(ee.ImageCollection('MODIS/061/MYD13Q1'));
var proj = ee.ImageCollection('MODIS/061/MOD13Q1').first().select('EVI').projection();
var wc = ee.ImageCollection('ESA/WorldCover/v200').first();
var frac = wc.eq(40).reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 1024}).reproject(proj.atScale(100));
var crop = frac.reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 1024}).reproject(proj).gte(0.5);

function peak(y) {
  return MODIS.filterDate((y - 1) + '-11-15', y + '-04-01').filterBounds(fc.geometry())
    .map(function (im) { return im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1)); })
    .max().rename('y' + y);
}
var img = ee.Image.cat(YEARS.map(peak)).setDefaultProjection(proj).updateMask(crop);
Map.centerObject(fc, 8);
Map.addLayer(crop.selfMask(), {palette: ['e49635']}, 'Đất trồng trọt ≥ 50 % / cropland ≥ 50 %');
Map.addLayer(img.select('y2024'), {min: 0.2, max: 0.8, palette: ['f7fcb9', '78c679', '005a32']}, 'EVI cực đại / peak EVI 2024');
Map.addLayer(ee.Image().paint(fc, 0, 2), {palette: ['000000']}, 'Ranh tỉnh / provinces');
var stats = img.reduceRegions({collection: fc, reducer: ee.Reducer.mean(), crs: proj, scale: proj.nominalScale(), tileScale: 16});

// ---------- 2. Năng suất chính thức / Official yields (NSO V06.17, t/ha, 2001-2025; 2025 preliminary) ----------
var YIELD = {
  'Long An': [4.35, 4.87, 5.02, 5.05, 5.33, 5.1, 5.21, 5.4, 5.31, 5.72, 5.85, 6.09, 6.35, 6.71, 6.71, 6.05, 5.59,
              6.12, 6.34, 6.49, 6.65, 6.45, 6.78, 6.606, 6.749],
  'An Giang': [5.56, 6.54, 6.41, 6.52, 6.93, 6.81, 7.11, 7.31, 7.16, 7.3, 7.51, 7.4, 7.35, 7.74, 7.56, 7.19, 7.03,
               7.35, 7.1, 7.17, 7.69, 7.34, 7.55, 7.444, 7.38]
};

// ---------- 3. Mô hình / Model (plain JavaScript on the client) ----------
function mean(v) { return v.reduce(function (a, b) { return a + b; }, 0) / v.length; }
function ols(x, y) {  // y = a + b x, with R²
  var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, sst = 0, sse = 0;
  for (var i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); }
  var b = sxy / sxx, a = my - b * mx;
  for (var j = 0; j < x.length; j++) { sst += (y[j] - my) * (y[j] - my); sse += Math.pow(y[j] - a - b * x[j], 2); }
  return {a: a, b: b, r2: 1 - sse / sst};
}
function detrend(t, v) { var f = ols(t, v); return v.map(function (vi, i) { return vi - (f.a + f.b * t[i]); }); }
function looRmse(x, y) {
  var se = y.map(function (yi, i) {
    var keep = function (_, k) { return k !== i; };
    var f = ols(x.filter(keep), y.filter(keep));
    return Math.pow(yi - (f.a + f.b * x[i]), 2);
  });
  return Math.sqrt(mean(se));
}
function looMean(y) {
  var n = y.length, s = y.reduce(function (a, b) { return a + b; }, 0);
  return Math.sqrt(mean(y.map(function (yi) { return Math.pow(yi - (s - yi) / (n - 1), 2); })));
}
function f2(v) { return v.toFixed(2); }

stats.evaluate(function (res, err) {
  if (err) { print('Lỗi / error:', err); return; }
  var T = YEARS.slice(0, 24);  // fit on 2001-2024, as in the chapter
  res.features.forEach(function (feat) {
    var p = PROVS.filter(function (q) { return q === feat.properties.shapeName || gbName(q) === feat.properties.shapeName; })[0];
    var evi = YEARS.map(function (yy) { return feat.properties['y' + yy]; });
    var x = evi.slice(0, 24), yv = YIELD[p].slice(0, 24);
    var dx = detrend(T, x), dy = detrend(T, yv);
    var tr = ols(T, yv), raw = ols(x, yv), det = ols(dx, dy);
    print(p + ': trend ' + tr.b.toFixed(3) + ' t/ha/yr (R² ' + f2(tr.r2) + '); R² raw ' + f2(raw.r2) +
          ', detrended ' + f2(det.r2) + '; LOO RMSE ' + f2(looRmse(dx, dy)) + ' vs mean ' + f2(looMean(dy)) + ' t/ha');
    // 4. Dự báo 2025 / 2025 forecast: trend extended to 2025 + b * ΔEVI(2025)
    var ex = ols(T, x), dx25 = evi[24] - (ex.a + ex.b * 2025), trend25 = tr.a + tr.b * 2025;
    print(p + ' 2025: trend only ' + f2(trend25) + ', model ' + f2(trend25 + det.a + det.b * dx25) +
          ', NSO preliminary ' + f2(YIELD[p][24]) + ' t/ha');
    print(ui.Chart.array.values(ee.Array(dy), 0, ee.Array(dx)).setChartType('ScatterChart').setOptions({
      title: p + ': ΔY vs ΔEVI (detrended), R² = ' + f2(det.r2),
      hAxis: {title: 'ΔEVI'}, vAxis: {title: 'ΔY (t/ha)'}, legend: {position: 'none'}, pointSize: 5}));
    print(ui.Chart.array.values(ee.Array([x, yv.map(function (v) { return v / 10; })]).transpose(), 0, ee.Array(T))
      .setSeriesNames(['peak EVI', 'yield / 10 (t/ha)']).setOptions({
        title: p + ': peak EVI and yield, 2001-2024', hAxis: {title: 'year', format: '####'}, pointSize: 4}));
  });
});
// Chapter 6: Long An raw R² 0.74 -> detrended 0.14 (LOO 0.30 vs 0.32); An Giang 0.43 -> 0.29 (LOO 0.31 vs 0.35).
