/**
 * Lab 5 — Lấy mẫu để ước lượng diện tích / Sampling for area estimation · Viễn thám Nông nghiệp & Môi trường, Chương 5
 * https://quanta1985.github.io/rs-agri/vi/area-stats/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 *
 * Bản đồ lúa 2024 của Chương 4 không có trên Earth Engine, nên script này dựng một tổng thể THAY THẾ:
 *   y = diện tích cây trồng Esri 2024 của mỗi ô 250 m (đóng vai "sự thật"), x = diện tích cây trồng Esri 2021 (biến phụ),
 *   tầng theo % cây trồng Esri 2021 (< 25, 25–75, >= 75). Số ra KHÁC Chương 5 và notebook (y khác, r cao hơn).
 * The Chapter 4 rice map is not on Earth Engine, so this script builds a STAND-IN population:
 *   y = Esri 2024 crop area of each 250 m cell (plays the "truth"), x = Esri 2021 crop area (auxiliary),
 *   strata from the Esri 2021 crop % (< 25, 25–75, >= 75). Numbers DIFFER from Chapter 5 and the notebook (other y, higher r).
 * Mô phỏng: không có sai số thực địa. / Simulation: no field errors.
 *
 * Esri 10 m Annual LULC, Impact Observatory (Karra et al. 2021), CC BY 4.0. geoBoundaries (Runfola et al. 2020).
 */

var N_SAMPLE = 200;
var SEED = 2026;   // đổi hạt giống rồi chạy lại để thấy ước lượng dao động / change the seed and rerun to see estimates vary
var ESRI = 'projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS';
var CELL = 250;
var PROJ = ee.Projection('EPSG:32648').atScale(CELL);

// 13 tỉnh ĐBSCL, mỗi tỉnh chọn bằng một điểm (tên tỉnh trên EE mất dấu tiếng Việt).
// The 13 Mekong Delta provinces, each picked with a point (province names on EE lose Vietnamese letters).
var MEKONG_POINTS = [[106.10, 10.71], [106.13, 10.41], [106.52, 10.07], [106.30, 9.82], [105.97, 10.12], [105.72, 10.55],
  [105.16, 10.58], [105.28, 9.98], [105.52, 10.12], [105.63, 9.77], [105.90, 9.61], [105.55, 9.36], [105.10, 9.08]];
var region = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM1').filter(ee.Filter.eq('shapeGroup', 'VNM'))
  .filterBounds(ee.Geometry.MultiPoint(MEKONG_POINTS)).geometry();

// ---------- 1. Tổng thể / Population ----------
function cropShare(year) {   // % cây trồng (Esri lớp 5) trong ô 250 m / crop % of each 250 m cell
  var col = ee.ImageCollection(ESRI).filterBounds(region).filterDate(year + '-01-01', (year + 1) + '-01-01');
  var esri = col.mosaic();
  return esri.eq(5).multiply(100).updateMask(esri.gt(0)).setDefaultProjection(col.first().projection())
    .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 1024}).reproject(PROJ);
}
var cellHa = ee.Image.pixelArea().reproject(PROJ).divide(1e4);
var x21 = cropShare(2021);
var pop = ee.Image.cat([
  cropShare(2024).divide(100).multiply(cellHa).toFloat().rename('y'),
  x21.divide(100).multiply(cellHa).toFloat().rename('x'),
  x21.gte(25).add(x21.gte(75)).toInt().rename('stratum'),   // stratifiedSample cần băng số nguyên / needs an integer band
  ee.Image.constant(0).toInt().rename('all')
]).updateMask(x21.mask()).clip(region);

var totals = pop.select(['y', 'x']).reduceRegion({reducer: ee.Reducer.sum().combine(ee.Reducer.count(), null, true)
  .combine(ee.Reducer.stdDev(), null, true).unweighted(), geometry: region, crs: PROJ, maxPixels: 1e9, tileScale: 4});
// unweighted: đếm ô nguyên, không tính phần ô bị ranh cắt / whole cells, no fractional edge weights
var Nh = pop.select('stratum').reduceRegion({reducer: ee.Reducer.frequencyHistogram().unweighted(), geometry: region, crs: PROJ,
  maxPixels: 1e9, tileScale: 4}).get('stratum');
print('Tổng thể (y = cây trồng 2024, x = cây trồng 2021, ha) / Population (y = 2024 crops, x = 2021 crops, ha)', totals);
print('Số ô mỗi tầng 0: <25 %, 1: 25–75 %, 2: >=75 % / cells per stratum', Nh);
Map.centerObject(region, 8);
Map.addLayer(pop.select('stratum'), {min: 0, max: 2, palette: ['d6d6d6', 'a0a0a0', '606060']}, 'Tầng / strata (Esri 2021)');

// ---------- 2. Một mẫu, ba cách ước lượng / One sample, three estimators ----------
totals.evaluate(function (t) {
  Nh.evaluate(function (nh) {
    var N = t.y_count, Xbar = t.x_sum / N;
    // Ngẫu nhiên đơn: lấy đúng N_SAMPLE ô / simple random: exactly N_SAMPLE cells
    var srs = pop.stratifiedSample({numPoints: N_SAMPLE, classBand: 'all', region: region, projection: PROJ,
      seed: SEED, geometries: true, tileScale: 4});
    var ybar = srs.aggregate_mean('y'), sy = srs.aggregate_sample_sd('y');
    var fpc = 1 - N_SAMPLE / N;
    print('Ngẫu nhiên đơn / Simple random: tổng (ha), SE / total (ha), SE',
      ee.Number(ybar).multiply(N), ee.Number(sy).pow(2).multiply(fpc / N_SAMPLE).sqrt().multiply(N));

    // Hồi quy / Regression: b = cov(x, y) / var(x)
    var fit = srs.reduceColumns({reducer: ee.Reducer.linearFit(), selectors: ['x', 'y']});
    var b = ee.Number(fit.get('scale'));
    print('Hồi quy / Regression: b, tổng (ha) / total (ha)', b,
      ee.Number(ybar).add(b.multiply(ee.Number(Xbar).subtract(srs.aggregate_mean('x')))).multiply(N));

    // Phân tầng tỉ lệ, ít nhất 2 ô mỗi tầng / proportional stratified, at least 2 cells per stratum
    var keys = ['0', '1', '2'];
    // làm tròn nên tổng có thể lệch 1–2 ô so với N_SAMPLE / rounding may move the total 1–2 cells off N_SAMPLE
    var alloc = keys.map(function (k) { return Math.max(2, Math.round(N_SAMPLE * nh[k] / N)); });
    var st = pop.stratifiedSample({numPoints: 0, classBand: 'stratum', classValues: [0, 1, 2], classPoints: alloc,
      region: region, projection: PROJ, seed: SEED + 1, geometries: true, tileScale: 4});
    var parts = keys.map(function (k, h) {
      var s = st.filter(ee.Filter.eq('stratum', h));
      var v = ee.Number(s.aggregate_sample_sd('y')).pow(2);
      return {total: ee.Number(s.aggregate_mean('y')).multiply(nh[k]),
              var_: v.multiply(nh[k] * nh[k] * (1 - alloc[h] / nh[k]) / alloc[h])};
    });
    print('Phân bổ tỉ lệ / proportional allocation', alloc);
    print('Phân tầng tỉ lệ / Stratified (proportional): tổng (ha), SE / total (ha), SE',
      parts[0].total.add(parts[1].total).add(parts[2].total),
      parts[0].var_.add(parts[1].var_).add(parts[2].var_).sqrt());
    print('Giá trị thật / true total (ha)', t.y_sum);

    Map.addLayer(srs, {color: '009e73'}, 'Mẫu ngẫu nhiên đơn / simple random sample');
    Map.addLayer(st, {color: 'd55e00'}, 'Mẫu phân tầng / stratified sample', false);

    // ---------- 3. Cỡ mẫu cho CV mục tiêu / Sample size for a target CV ----------
    [0.05, 0.02].forEach(function (cv) {
      var n0 = Math.pow(t.y_stdDev / (cv * t.y_sum / N), 2);
      print('Ngẫu nhiên đơn, CV ' + cv * 100 + ' % cần / simple random, CV ' + cv * 100 + ' % needs (cells)', Math.ceil(n0 / (1 + n0 / N)));
    });
  });
});
