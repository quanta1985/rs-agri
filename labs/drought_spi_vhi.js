/**
 * Lab 9 — Mưa, SPI và VHI / Rainfall, SPI and VHI · Viễn thám Nông nghiệp & Môi trường, Chương 9 (và 7)
 * https://quanta1985.github.io/rs-agri/vi/drought/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. Số và biểu đồ ở tab Console, bản đồ VHI ở khung Layers.
 * Paste into the Earth Engine Code Editor and press Run. Numbers and charts go to the Console, the VHI map to Layers.
 * Same steps as the Python notebook labs/drought_spi_vhi.ipynb, with one simplification: the notebook fits a gamma
 * distribution for SPI-3 (scipy); here the Feb-Apr totals are only standardised (z = (x - mean) / sd over 1991-2020),
 * which is close to SPI when the totals are not very skewed.
 *
 * CHIRPS v2.0 (Funk et al. 2015), UCSB Climate Hazards Center. MODIS MOD13Q1 / MOD11A2 v061, NASA LP DAAC.
 * ESA WorldCover 2021 v200, CC BY 4.0. geoBoundaries, CC BY 4.0.
 */

// The Earth Engine copy of geoBoundaries lost letters outside Latin-1 ('Hậu Giang' -> 'H?u Giang').
function gbName(s) { return s.replace(/[^\u0000-ÿ]/g, '?'); }
var GB = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'));
var PROVINCES = {
  mekong: ['Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang',
           'Cần Thơ', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau'],
  red: ['Hà Nội', 'Vĩnh Phúc', 'Bắc Ninh', 'Quảng Ninh', 'Hải Dương', 'Hải Phòng', 'Hưng Yên', 'Thái Bình',
        'Hà Nam', 'Nam Định', 'Ninh Bình']
};
// The chapter's farmland boxes: Phu Quoc and most of the Quang Ninh hills left out.
var BBOX = {mekong: [104.4, 8.5, 106.85, 11.05], red: [105.3, 19.9, 107.05, 21.6]};
function region(k) {
  var names = PROVINCES[k].concat(PROVINCES[k].map(gbName));  // correct or corrupted spelling
  return GB.filter(ee.Filter.inList('shapeName', names)).geometry()
    .intersection(ee.Geometry.Rectangle(BBOX[k]), 100);
}
var REGIONS = ee.FeatureCollection([ee.Feature(region('mekong'), {region: 'mekong'}),
                                    ee.Feature(region('red'), {region: 'red'})]);

// ---------- 1-3. CHIRPS: normals, dry-season anomaly, SPI-3 ----------
var Y0 = 1981, NY = 45;
var CH = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD');
var months = ee.ImageCollection(ee.List.sequence(0, NY * 12 - 1).map(function (i) {
  var d = ee.Date('1981-01-01').advance(i, 'month');
  return CH.filterDate(d, d.advance(1, 'month')).sum().rename('rain').set('i', i);
}));
var series = months.map(function (im) {
  return im.reduceRegions({collection: REGIONS, reducer: ee.Reducer.mean(), scale: 5000, crs: 'EPSG:3857'})
    .map(function (f) { return f.set('i', im.get('i')); });
}).flatten();

function mean(v) { return v.reduce(function (a, b) { return a + b; }, 0) / v.length; }
function sd(v) { var m = mean(v); return Math.sqrt(mean(v.map(function (x) { return (x - m) * (x - m); }))); }

series.evaluate(function (fc, err) {
  if (err) { print('Lỗi / error:', err); return; }
  ['mekong', 'red'].forEach(function (k) {
    var r = [];  // r[year][month] in mm
    for (var y = 0; y < NY; y++) r.push([]);
    fc.features.filter(function (f) { return f.properties.region === k; }).forEach(function (f) {
      var i = f.properties.i;
      r[Math.floor(i / 12)][i % 12] = f.properties.mean;
    });
    var ref = [];
    for (var yy = 1991; yy <= 2020; yy++) ref.push(yy - Y0);
    var normal = [];
    for (var m = 0; m < 12; m++) normal.push(mean(ref.map(function (j) { return r[j][m]; })));
    var total = normal.reduce(function (a, b) { return a + b; }, 0);
    var dryN = normal[11] + normal[0] + normal[1] + normal[2] + normal[3];
    print(k + ': normal 1991-2020 ' + Math.round(total) + ' mm/yr; Dec-Apr ' + Math.round(dryN) + ' mm (' +
          Math.round(100 * dryN / total) + ' %)');
    print(ui.Chart.array.values(ee.Array(normal), 0, ee.Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
      .setChartType('ColumnChart').setOptions({title: k + ': mean monthly rain 1991-2020 (CHIRPS), mm',
        hAxis: {title: 'month'}, legend: {position: 'none'}}));
    // Dec (y-1) .. Apr (y) against the 1991-2020 mean of the same months
    function dry(y) { var j = y - Y0; return r[j - 1][11] + r[j][0] + r[j][1] + r[j][2] + r[j][3]; }
    var base = mean(ref.map(function (j) { return dry(j + Y0); }));
    print(k + ': Dec-Apr rain vs normal: ' + [2016, 2020, 2024].map(function (y) {
      return (y - 1) + '-' + (y % 100) + ' ' + (100 * dry(y) / base - 100).toFixed(0) + ' %'; }).join(', '));
    // Feb-Apr totals, standardised (z-score; the notebook fits a gamma distribution = SPI-3)
    var acc = r.map(function (row) { return row[1] + row[2] + row[3]; });
    var refAcc = ref.map(function (j) { return acc[j]; }), mu = mean(refAcc), s = sd(refAcc);
    var z = acc.map(function (a) { return (a - mu) / s; });
    print(k + ': standardised Feb-Apr rain: ' + [2016, 2020, 2024].map(function (y) {
      return y + ' ' + z[y - Y0].toFixed(2); }).join(', '));
    var yrs = [];
    for (var q = 0; q < NY; q++) yrs.push(Y0 + q);
    print(ui.Chart.array.values(ee.Array(z), 0, ee.Array(yrs)).setChartType('ColumnChart').setOptions({
      title: k + ': standardised Feb-Apr rainfall (close to SPI-3)', hAxis: {format: '####'},
      vAxis: {viewWindow: {min: -3, max: 3}}, legend: {position: 'none'}}));
  });
});
// Chapter 7: normals Red 1,698 / Mekong 1,705 mm/yr; Dec-Apr Mekong -34 / -38 / -60 %, Red +48 / +33 / +7 %.
// Chapter 9 SPI-3 (gamma): Mekong 2016 -1.89, 2020 -0.14, 2024 -1.85; Red +1.51, +1.42, +0.43.

// ---------- 4. VHI on Mekong cropland, Feb-Apr ----------
var NDVI_C = ee.ImageCollection('MODIS/061/MOD13Q1'), LST_C = ee.ImageCollection('MODIS/061/MOD11A2');
var proj = LST_C.first().select('LST_Day_1km').projection();
var crop = ee.ImageCollection('ESA/WorldCover/v200').first().eq(40)
  .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 65535}).gte(0.5);
function ndviM(y, m) {
  var d = ee.Date.fromYMD(y, m, 1);
  return NDVI_C.filterDate(d, d.advance(1, 'month')).map(function (i) {
    return i.select('NDVI').updateMask(i.select('SummaryQA').lte(1)); }).max().multiply(0.0001).rename('v');
}
function lstM(y, m) {
  var d = ee.Date.fromYMD(y, m, 1);
  return LST_C.filterDate(d, d.advance(1, 'month')).map(function (i) {
    return i.select('LST_Day_1km').updateMask(i.select('QC_Day').bitwiseAnd(3).eq(0)); })
    .mean().multiply(0.02).subtract(273.15).rename('v');
}
function vhiImg(y, m) {
  var ys = [];
  for (var q = 2001; q <= 2025; q++) ys.push(q);
  var nd = ee.ImageCollection(ys.map(function (q) { return ndviM(q, m); }));
  var ls = ee.ImageCollection(ys.map(function (q) { return lstM(q, m); }));
  var nlo = nd.min().updateMask(nd.count().gte(10)), nhi = nd.max();
  var llo = ls.min().updateMask(ls.count().gte(10)), lhi = ls.max();
  var vci = ndviM(y, m).subtract(nlo).divide(nhi.subtract(nlo)).multiply(100);
  var tci = lhi.subtract(lstM(y, m)).divide(lhi.subtract(llo)).multiply(100);
  return vci.add(tci).multiply(0.5).rename('vhi');
}
var MEKONG = region('mekong');
var feats = [];
[2016, 2018, 2020, 2024].forEach(function (y) {
  [2, 3, 4].forEach(function (m) {
    var v = vhiImg(y, m).updateMask(crop);
    var img = ee.Image.cat([v, v.mask().gt(0).unmask(0).updateMask(crop).rename('ok'),
                            v.lt(35).updateMask(v.mask()).rename('asi')]);
    var r = img.reduceRegion({reducer: ee.Reducer.mean(), geometry: MEKONG, crs: proj, scale: 1000,
                              maxPixels: 1e10, tileScale: 16});
    feats.push(ee.Feature(null, r).set({y: y, m: m}));
  });
});
ee.FeatureCollection(feats).evaluate(function (fc, err) {
  if (err) { print('Lỗi / error:', err); return; }
  [2016, 2018, 2020, 2024].forEach(function (y) {
    var ok = fc.features.map(function (f) { return f.properties; })
      .filter(function (p) { return p.y === y && p.ok >= 0.3 && p.vhi !== null && p.vhi !== undefined; });
    print(y + ': Feb-Apr VHI ' + mean(ok.map(function (p) { return p.vhi; })).toFixed(0) + ', ASI ' +
          (100 * mean(ok.map(function (p) { return p.asi; }))).toFixed(0) + ' % of cropland cells < 35 (' +
          ok.length + ' of 3 months with >= 30 % cloud-free cells)');
  });
});
// Chapter 9: VHI 2016 51, 2018 70, 2020 44, 2024 55; ASI 30 / 9 / 41 / 19 %.

Map.centerObject(MEKONG, 8);
Map.addLayer(vhiImg(2020, 3).clip(MEKONG), {min: 0, max: 100, palette: ['a6611a', 'dfc27d', 'f5f5f5', '80cdc1', '018571']},
             'VHI 3/2020 (nâu = căng thẳng / brown = stressed)');
Map.addLayer(crop.selfMask().clip(MEKONG), {palette: ['000000'], opacity: 0.25}, 'Đất trồng trọt ≥ 50 % / cropland', false);
