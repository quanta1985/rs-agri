/**
 * Lab 12 — Đường bờ & rừng ngập mặn / Shoreline & mangroves · Viễn thám Nông nghiệp & Môi trường, Chương 12
 * https://quanta1985.github.io/rs-agri/vi/coast/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Số liệu ở tab Console, lớp bản đồ ở khung Layers. / Numbers in the Console tab, map layers in the Layers panel.
 * Chuỗi 38 năm của mỗi đoạn bờ mất khoảng một phút. / The 38-year series of each stretch takes about a minute.
 *
 * Landsat 5/7/8/9 Collection 2 Level-2 courtesy of the U.S. Geological Survey.
 * Global Mangrove Watch v3.0 (Bunting et al. 2022), CC BY 4.0.
 */

// ---------- 0. Nước từ Landsat / Water from Landsat ----------
// Lục / SWIR1: B2/B5 (Landsat 5, 7), B3/B6 (Landsat 8, 9). QA_PIXEL bit 0-4 = 0. Lọc ngày và vùng TRƯỚC .map().
var SPEC = [['LANDSAT/LT05/C02/T1_L2', 'SR_B2', 'SR_B5'], ['LANDSAT/LE07/C02/T1_L2', 'SR_B2', 'SR_B5'],
            ['LANDSAT/LC08/C02/T1_L2', 'SR_B3', 'SR_B6'], ['LANDSAT/LC09/C02/T1_L2', 'SR_B3', 'SR_B6']];
var UTM = ee.Projection('EPSG:32648').atScale(30);

function looks(start, end, geom) {
  var out = null;
  SPEC.forEach(function (s) {
    var c = ee.ImageCollection(s[0]).filterDate(start, end).filterBounds(geom).map(function (img) {
      var ok = img.select('QA_PIXEL').bitwiseAnd(31).eq(0);
      var g = img.select(s[1]).multiply(0.0000275).add(-0.2);
      var w = img.select(s[2]).multiply(0.0000275).add(-0.2);
      return g.subtract(w).divide(g.add(w)).gt(0).rename('w').updateMask(ok).copyProperties(img, ['system:time_start']);
    });
    out = out === null ? c : out.merge(c);
  });
  return out;
}
// Tần suất nước và số lần chụp không mây / water frequency and number of clear looks
function freq(start, end, geom) {
  var col = looks(start, end, geom);
  return {f: col.mean().setDefaultProjection(UTM), n: col.count().setDefaultProjection(UTM)};
}

// ---------- 1. Đất và nước 1988-92 so với 2021-25 / Land and water ----------
// Khung 30 x 27 km quanh Mũi Cà Mau (UTM 48N) / 30 x 27 km box around Ca Mau Cape
var BOX = ee.Geometry.Rectangle([466980, 945780, 496980, 972780], 'EPSG:32648', false);
var early = freq('1988-01-01', '1993-01-01', BOX), late = freq('2021-01-01', '2026-01-01', BOX);
var w1 = early.f.gte(0.5), w2 = late.f.gte(0.5);
var cls = ee.Image(0).where(w1.and(w2), 1).where(w1.not().and(w2), 2).where(w1.and(w2.not()), 3)
  .updateMask(early.n.gte(5).and(late.n.gte(5))).rename('cls');   // 0 đất cả hai, 1 nước, 2 đất->nước, 3 nước->đất
Map.centerObject(BOX, 11);
Map.addLayer(cls.selfMask(), {min: 1, max: 3, palette: ['56B4E9', 'D55E00', '009E73']},
  'Nước / đất->nước / nước->đất (1988-92 -> 2021-25)');
var areas = ee.Image.pixelArea().divide(1e4).addBands(cls).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'cls'}), geometry: BOX, crs: UTM, maxPixels: 1e9});
print('ha theo lớp / ha per class (0 đất cả hai, 1 nước cả hai, 2 đất->nước, 3 nước->đất)', areas.get('groups'));

// ---------- 2. Đất mỗi năm và xu thế Theil-Sen / Yearly land and the Theil-Sen trend ----------
var STRETCHES = {
  'East Sea coast': {geom: ee.Geometry.LineString([[104.86, 8.565], [105.00, 8.592], [105.12, 8.655], [105.165, 8.705],
                                                     [105.21, 8.75], [105.30, 8.808], [105.35, 8.88]]).buffer(1500), km: 66.6},
  'Ca Mau Cape': {geom: ee.Geometry.Rectangle([104.70, 8.60, 104.83, 8.80]), km: null}
};
var HA = ee.Image.pixelArea().divide(1e4);
Object.keys(STRETCHES).forEach(function (name) {
  var geom = STRETCHES[name].geom;
  var total = ee.Number(HA.reduceRegion({reducer: ee.Reducer.sum(), geometry: geom, scale: 30, maxPixels: 1e10}).get('area'));
  var years = ee.FeatureCollection(ee.List.sequence(1988, 2025).map(function (y) {
    var s = ee.Date.fromYMD(y, 1, 1);
    var fr = freq(s, s.advance(1, 'year'), geom);
    var ok = fr.n.gte(3);
    var r = HA.updateMask(fr.f.lt(0.5).and(ok)).rename('land').addBands(HA.updateMask(ok).rename('valid'))
      .reduceRegion({reducer: ee.Reducer.sum(), geometry: geom, scale: 30, maxPixels: 1e10, tileScale: 8});
    return ee.Feature(null, {year: y, land: r.get('land'), valid: r.get('valid')});
  })).filter(ee.Filter.gte('valid', total.multiply(0.95)));     // bỏ năm < 95 % diện tích đủ ảnh / drop poorly observed years
  var ts = years.reduceColumns(ee.Reducer.sensSlope(), ['year', 'land']);   // Theil-Sen: slope (ha/năm), offset
  print(name + ': Theil-Sen (ha/yr), số năm / years used', ts.get('slope'), years.size());
  if (STRETCHES[name].km) {
    print(name + ': m/yr = slope x 10 000 / (km x 1 000)', ee.Number(ts.get('slope')).multiply(1e4).divide(STRETCHES[name].km * 1000));
  }
  print(ui.Chart.feature.byFeature(years, 'year', ['land']).setOptions({
    title: name + ': đất mỗi năm / land each year (ha)', pointSize: 3, lineWidth: 1, trendlines: {0: {color: 'grey'}}}));
  Map.addLayer(ee.Image().paint(geom, 1, 2), {palette: ['ffffff']}, name);
});
// Chương 12: bờ Biển Đông -198,1 ha/năm = -29,7 m/năm; mũi Cà Mau +143,6 ha/năm (Theil-Sen).
// Chapter 12: East Sea coast -198.1 ha/yr = -29.7 m/yr; Ca Mau Cape +143.6 ha/yr (Theil-Sen).
// Đường xu thế của biểu đồ là bình phương nhỏ nhất, không phải Theil-Sen. / The chart trend line is least squares, not Theil-Sen.

// ---------- 3. Global Mangrove Watch 1996 và 2020 / 1996 and 2020 ----------
var GMW = ee.ImageCollection('projects/sat-io/open-datasets/GMW/extent/GMW_V3');
function gmw(year) {
  return GMW.filter(ee.Filter.eq('system:index', 'gmw_v3_' + year)).first().select('b1').unmask(0).gt(0);
}
var a96 = gmw(1996), a20 = gmw(2020);
var mg = ee.Image(0).where(a96.and(a20), 1).where(a96.and(a20.not()), 2).where(a96.not().and(a20), 3).rename('mg');
Map.addLayer(mg.selfMask().clip(BOX), {min: 1, max: 3, palette: ['009E73', 'D55E00', 'F0E442']},
  'GMW: còn / mất / mới (kept / lost / new) 1996 -> 2020');
print('GMW ha trong khung / in the box (1 còn / kept, 2 mất / lost, 3 mới / new)', HA.addBands(mg).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'mg'}), geometry: BOX, crs: UTM, maxPixels: 1e9}).get('groups'));
