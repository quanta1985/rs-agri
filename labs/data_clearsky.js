/**
 * Lab 2 — Mây, radar và độ thuần pixel / Clouds, radar and pixel purity · Viễn thám Nông nghiệp & Môi trường, Chương 2
 * https://quanta1985.github.io/rs-agri/vi/data/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Khung 10,24 km ở đây là hình vuông quanh tâm (gần đúng khung của trang web, lưới Web Mercator), nên số có thể lệch nhẹ.
 * The 10.24 km frames here are squares around the centre (close to the website's Web Mercator frames): numbers may differ slightly.
 * Bản này chỉ đếm năm 2024; notebook Python dùng 2022–2024 và đối chiếu với chương. / This version counts 2024 only; the Python
 * notebook uses 2022–2024 and checks against the chapter.
 *
 * Contains modified Copernicus Sentinel data 2015-2025. Cloud Score+ (Pasquarella et al. 2023).
 * ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022), CC BY 4.0.
 */

var SITES = {'Nam Định': [106.42, 20.22], 'An Giang': [105.08, 10.45]};
function siteBox(lonlat) { return ee.Geometry.Point(lonlat).buffer(5120).bounds(); }

// ---------- 1. Ngày Sentinel-2 dùng được / Usable Sentinel-2 days ----------
// Lần chụp / look: ảnh phủ >= 50 % khung. Dùng được / usable: phủ >= 95 % và >= 80 % quang đãng (cs_cdf >= 0.6), tính ở 60 m.
var YEAR = 2024;
var CS = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

function s2Days(box) {
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(box)
    .filterDate(ee.Date.fromYMD(YEAR, 1, 1), ee.Date.fromYMD(YEAR + 1, 1, 1))
    .linkCollection(CS, ['cs_cdf']);
  var total = ee.Image.constant(1).reduceRegion({reducer: ee.Reducer.count(), geometry: box, scale: 60}).get('constant');
  var days = col.aggregate_array('system:time_start').map(function (t) { return ee.Date(t).format('YYYY-MM-dd'); }).distinct();
  return ee.FeatureCollection(days.map(function (d) {
    var d0 = ee.Date.parse('YYYY-MM-dd', d);
    var clear = col.filterDate(d0, d0.advance(1, 'day')).select('cs_cdf').mosaic().gte(0.6);
    var st = clear.reduceRegion({reducer: ee.Reducer.mean().combine(ee.Reducer.count(), null, true), geometry: box, scale: 60});
    var cover = ee.Number(st.get('cs_cdf_count')).divide(total);
    var clearShare = ee.Number(ee.Algorithms.If(st.get('cs_cdf_mean'), st.get('cs_cdf_mean'), 0));
    return ee.Feature(null, {
      month: d0.get('month'),
      look: cover.gte(0.5),
      usable: cover.gte(0.95).and(clearShare.gte(0.8))
    });
  }));
}

Object.keys(SITES).forEach(function (site) {
  var fc = s2Days(siteBox(SITES[site]));
  var perMonth = ee.FeatureCollection(ee.List.sequence(1, 12).map(function (m) {
    var f = fc.filter(ee.Filter.eq('month', m));
    return ee.Feature(null, {month: m, looks: f.aggregate_sum('look'), usable: f.aggregate_sum('usable')});
  }));
  print(site + ' ' + YEAR + ' — lần chụp và ngày dùng được mỗi tháng / looks and usable days per month', perMonth);
  print(ui.Chart.feature.byFeature(perMonth, 'month', ['looks', 'usable']).setChartType('ColumnChart')
    .setOptions({title: site + ' ' + YEAR + ': Sentinel-2 looks / usable days', hAxis: {title: 'month'}, vAxis: {title: 'days'},
                 colors: ['cccccc', '0072b2']}));
});

// ---------- 2. Sentinel-1 mỗi năm / Sentinel-1 days per year ----------
var S1_YEARS = ee.List.sequence(2015, 2025);
var s1Rows = [];
Object.keys(SITES).forEach(function (site) {
  var col = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(siteBox(SITES[site]))
    .filterDate('2015-01-01', '2026-01-01').filter(ee.Filter.eq('instrumentMode', 'IW'));
  var dates = col.aggregate_array('system:time_start').map(function (t) { return ee.Date(t).format('YYYY-MM-dd'); }).distinct();
  var perYear = S1_YEARS.map(function (y) {
    var prefix = ee.Number(y).format('%d');
    return dates.filter(ee.Filter.stringStartsWith('item', prefix)).size();
  });
  print(site + ' — ngày có ảnh Sentinel-1 mỗi năm 2015–2025 / Sentinel-1 days per year', perYear);
  s1Rows.push(perYear);
});
print(ui.Chart.array.values({array: ee.Array(ee.List(s1Rows)).transpose(), axis: 0, xLabels: S1_YEARS})
  .setSeriesNames(Object.keys(SITES))
  .setOptions({title: 'Sentinel-1 IW days per year (S1B failed 23 Dec 2021)', hAxis: {format: '####'}, vAxis: {title: 'days'}}));

// ---------- 3. Ô thuần theo kích thước ô / Pure cells by cell size ----------
// Ô thuần: một lớp WorldCover chiếm >= 90 % ô. / Pure cell: one WorldCover class covers >= 90 % of the cell.
var wc = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map');
var CLASSES = [10, 20, 30, 40, 50, 60, 80, 90, 95, 100];
var wcProj = wc.projection();
function pureShare(box, cell) {
  var shares = ee.ImageCollection(CLASSES.map(function (c) {
    return wc.eq(c).setDefaultProjection(wcProj).reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 4096})
      .reproject({crs: 'EPSG:3857', scale: cell});
  })).max();
  return shares.gte(0.9).reduceRegion({reducer: ee.Reducer.mean(), geometry: box, crs: 'EPSG:3857', scale: cell}).get('Map');
}
Object.keys(SITES).forEach(function (site) {
  var box = siteBox(SITES[site]);
  var out = ee.Dictionary.fromLists(['30 m', '100 m', '250 m', '500 m'], [30, 100, 250, 500].map(function (s) { return pureShare(box, s); }));
  print(site + ' — tỉ lệ ô thuần / share of pure cells', out);
  Map.addLayer(wc.clip(box), {}, 'WorldCover ' + site, false);
});
Map.centerObject(siteBox(SITES['Nam Định']), 13);
