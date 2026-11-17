/**
 * Lab 4 — Lúa & lịch mùa vụ / Rice & crop calendars · Viễn thám Nông nghiệp & Môi trường, Chương 4
 * https://quanta1985.github.io/rs-agri/vi/rice/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. / Paste into the Earth Engine Code Editor and press Run.
 * Số liệu ở tab Console, lớp bản đồ ở khung Layers. / Numbers in the Console tab, map layers in the Layers panel.
 * Bản Python (Colab) làm thêm: đếm số vụ từng pixel và ngày bắt đầu vụ. / The Python (Colab) version also counts
 * seasons per pixel and computes the start of season.
 *
 * Contains modified Copernicus Sentinel data 2023-2024. MODIS MOD13Q1/MYD13Q1 v061: NASA LP DAAC. ESA WorldCover 2021.
 */

// Khung 10,24 km ở Tri Tôn (An Giang), như trong chương / the chapter's 10.24 km frame at Tri Ton (An Giang)
var FRAME = ee.Geometry.Point([105.08, 10.45]).buffer(5120).bounds();
// Ô ruộng 500 m có biên độ VH lớn nhất (Hình 4.2) / the 500 m block with the largest VH range (Figure 4.2)
var BOX = ee.Geometry.Rectangle([105.10811, 10.48737, 105.11267, 10.49186]);
Map.centerObject(FRAME, 13);

// ---------- 1. Chuỗi EVI MODIS (Terra + Aqua, mỗi 8 ngày) / MODIS EVI series ----------
var modis = ee.ImageCollection('MODIS/061/MOD13Q1').merge(ee.ImageCollection('MODIS/061/MYD13Q1'))
  .filterDate('2015-09-01', '2025-03-01')
  .map(function (im) {
    return im.select('EVI').multiply(0.0001).updateMask(im.select('SummaryQA').lte(1))
      .copyProperties(im, ['system:time_start']);
  });
print(ui.Chart.image.series(modis.filterDate('2015-09-01', '2017-03-01'), BOX, ee.Reducer.mean(), 250)
  .setOptions({title: 'MODIS EVI 2016 (ô 500 m / 500 m block)', pointSize: 3, lineWidth: 1}));
print(ui.Chart.image.series(modis.filterDate('2023-09-01', '2025-03-01'), BOX, ee.Reducer.mean(), 250)
  .setOptions({title: 'MODIS EVI 2024 (ô 500 m / 500 m block)', pointSize: 3, lineWidth: 1}));
// Bài tập: đếm số đỉnh EVI ≥ 0,35 trong mỗi năm. / Exercise: count the EVI peaks >= 0.35 in each year.

// ---------- 2. Sentinel-2 NDVI / EVI / LSWI và Sentinel-1 VH / S2 indices and S1 VH ----------
var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(BOX).filterDate('2023-09-01', '2025-01-01')
  .linkCollection(cs, ['cs_cdf'])
  .map(function (im) {
    var r = im.select(['B2', 'B4', 'B8', 'B11']).divide(10000);
    var b = r.select('B2'), red = r.select('B4'), nir = r.select('B8'), sw = r.select('B11');
    var ok = im.select('cs_cdf').gte(0.6);
    var idx = ee.Image.cat([
      nir.subtract(red).divide(nir.add(red)).rename('NDVI'),
      nir.subtract(red).multiply(2.5).divide(nir.add(red.multiply(6)).subtract(b.multiply(7.5)).add(1)).rename('EVI'),
      nir.subtract(sw).divide(nir.add(sw)).rename('LSWI')]).updateMask(ok);
    var clear = ok.reduceRegion(ee.Reducer.mean(), BOX, 10).get('cs_cdf');
    return idx.set('clear', clear).copyProperties(im, ['system:time_start']);
  })
  .filter(ee.Filter.gte('clear', 0.8));   // ngày có >= 80 % ô không mây / dates with >= 80 % of the block clear
print(ui.Chart.image.series(s2, BOX, ee.Reducer.mean(), 10)
  .setOptions({title: 'Sentinel-2, ô 500 m / 500 m block', pointSize: 4, lineWidth: 1, vAxis: {viewWindow: {min: -0.2, max: 1}}}));

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD').filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.eq('relativeOrbitNumber_start', 26));
var toPower = function (im) {   // dB -> công suất tuyến tính / linear power
  return im.select('VH').multiply(Math.log(10) / 10).exp().copyProperties(im, ['system:time_start']);
};
var vhSeries = s1.filterBounds(BOX).filterDate('2023-09-01', '2025-01-01').map(function (im) {
  var p = toPower(im).reduceRegion(ee.Reducer.mean(), BOX, 10).getNumber('VH');
  return ee.Feature(null, {'system:time_start': im.get('system:time_start'), VH_dB: p.log10().multiply(10)});
});
print(ui.Chart.feature.byFeature(vhSeries, 'system:time_start', 'VH_dB')
  .setOptions({title: 'Sentinel-1 VH (dB), orbit 26, ô 500 m / 500 m block', pointSize: 4, lineWidth: 1}));

// ---------- 3. Ngày bắt đầu vụ / Start of season ----------
// Trên biểu đồ EVI 2024: tìm đáy trước vụ Đông Xuân và đỉnh vụ, rồi ngày EVI vượt đáy + f × (đỉnh − đáy), f = 0; 0,2; 0,5.
// On the 2024 EVI chart: find the trough before the winter-spring crop and its peak, then the date EVI passes
// trough + f × (peak − trough) for f = 0, 0.2, 0.5. (Per-pixel version: Python notebook, section 3.)

// ---------- 4. Bản đồ lúa từ biên độ VH / Rice map from the seasonal VH range ----------
var season = s1.filterBounds(FRAME).filterDate('2023-11-01', '2024-04-01');
print('Ảnh S1 trong vụ / S1 scenes in the season:', season.size());
var pc = season.map(function (im) { return toPower(im).focalMean(1, 'square', 'pixels'); })
  .reduce(ee.Reducer.percentile([10, 90]));
var dvh = pc.select('VH_p90').log10().subtract(pc.select('VH_p10').log10()).multiply(10).rename('dvh').clip(FRAME);
Map.addLayer(dvh, {min: 0, max: 15, palette: ['440154', '3b528b', '21918c', '5ec962', 'fde725']}, 'Biên độ VH / VH range (dB)');

// Otsu trên histogram 0–20 dB / Otsu on a 0-20 dB histogram
var hist = dvh.reduceRegion({reducer: ee.Reducer.fixedHistogram(0, 20, 256), geometry: FRAME, scale: 10, maxPixels: 1e8})
  .getArray('dvh');
var otsu = function (h) {
  var counts = h.slice(1, 1, 2).project([0]), means = h.slice(1, 0, 1).project([0]);
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  var bss = ee.List.sequence(1, size).map(function (i) {
    var aCounts = counts.slice(0, 0, i), aMeans = means.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMean = aMeans.multiply(aCounts).reduce(ee.Reducer.sum(), [0]).get([0]).divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2)).add(bCount.multiply(bMean.subtract(mean).pow(2)));
  });
  return means.sort(bss).get([-1]);
};
var th = ee.Number(otsu(hist)).divide(0.5).round().multiply(0.5);   // ô 0,5 dB như Hình 4.4 / 0.5 dB steps
print('Ngưỡng Otsu / Otsu threshold (dB):', th);
var rice = dvh.gt(th);
Map.addLayer(rice.selfMask(), {palette: ['0072b2']}, 'Lúa / rice');
var areas = ee.Image.pixelArea().divide(1e4).addBands(rice).reduceRegion({
  reducer: ee.Reducer.sum().group(1, 'rice'), geometry: FRAME, scale: 10, maxPixels: 1e8});
print('Diện tích (ha) theo lớp, rice = 1 / area (ha) per class:', areas);
// Chương 4 (Hình 4.4): Otsu 9 dB, 5.934 ha (56,6 %) trên lưới Mercator của trang web; khung ở đây là vùng đệm 5,12 km
// quanh tâm nên diện tích có thể lệch một chút. / Chapter 4: 9 dB, 5,934 ha on the web's Mercator grid; this frame is a
// 5.12 km buffer bounds around the centre, so the area may differ slightly.

// ---------- 5. Diện tích hiệu chỉnh (Olofsson et al. 2014) / Bias-corrected area ----------
// Ma trận MINH HỌA (mặc định của Hình 4.6), không phải điểm thực địa. / ILLUSTRATIVE matrix (Figure 4.6 default), not field data.
var N = [[88, 12], [9, 91]];        // hàng = lớp bản đồ (lúa, khác), cột = lớp thật / rows = map class, columns = reference
var MAPPED = [1692000, 170000];     // ha, bản đồ số vụ 2024 ĐBSCL / 2024 Mekong seasons map
var total = MAPPED[0] + MAPPED[1];
var W = MAPPED.map(function (a) { return a / total; });
var ni = N.map(function (r) { return r[0] + r[1]; });
var pRice = W[0] * N[0][0] / ni[0] + W[1] * N[1][0] / ni[1];
var varRice = [0, 1].reduce(function (s, i) {
  var f = N[i][0] / ni[i];
  return s + W[i] * W[i] * f * (1 - f) / (ni[i] - 1);
}, 0);
print('Ước lượng lúa / rice estimate (nghìn ha / thousand ha):', Math.round(pRice * total / 1e3),
  '± (95 %)', Math.round(1.96 * Math.sqrt(varRice) * total / 1e3));
print('UA', (100 * N[0][0] / ni[0]).toFixed(1) + ' %', 'PA', (100 * W[0] * N[0][0] / ni[0] / pRice).toFixed(1) + ' %');
