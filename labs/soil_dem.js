/**
 * Lab 11 — Độ cao và đất / Elevation and soil · Viễn thám Nông nghiệp & Môi trường, Chương 11
 * https://quanta1985.github.io/rs-agri/vi/soil-terrain/
 *
 * Dán vào Earth Engine Code Editor rồi bấm Run. Số và biểu đồ ở tab Console, bản đồ ở khung Layers.
 * Paste into the Earth Engine Code Editor and press Run. Numbers and charts go to the Console, maps to Layers.
 * Same steps as the Python notebook labs/soil_dem.ipynb: share of land below 1 / 2 m in DeltaDTM vs Copernicus DEM
 * (on the DeltaDTM cells, 90 m by default), hypsometric curve, DSM - DTM at Ben Tre, SoilGrids pH.
 * Both DEMs are in metres above the EGM2008 geoid, not above the Hon Dau datum of Vietnamese maps.
 *
 * DeltaDTM v1.0 (Pronk et al. 2024, Deltares), CC BY 4.0. Copernicus DEM GLO-30 (2024_1): produced using Copernicus
 * WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the
 * European Union and ESA. SoilGrids 2.0 (Poggio et al. 2021, ISRIC), CC BY 4.0. ESA WorldCover 2021, CC BY 4.0.
 * geoBoundaries, CC BY 4.0.
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
function region(k) {
  var names = PROVINCES[k].concat(PROVINCES[k].map(gbName));  // correct or corrupted spelling
  return GB.filter(ee.Filter.inList('shapeName', names)).geometry();
}

// ---------- 1-2. Land below each level, hypsometric curve ----------
var SCALE = 90;  // m; 30 = as in the chapter (slower)
var DTM = ee.Image('projects/sat-io/open-datasets/DELTARES/deltadtm_v1').rename('h');
var COP_ID = 'COPERNICUS/DEM/GLO30_2024_1';
var COP = ee.ImageCollection(COP_ID).select('DEM').mosaic()
  .setDefaultProjection(ee.ImageCollection(COP_ID).first().select('DEM').projection()).rename('h');
var DEMS = {DeltaDTM: DTM, Copernicus: COP.updateMask(DTM.mask())};  // same land cells (DeltaDTM masks water)
var LO = -30, HI = 100;  // 0.1 m steps, -3 .. 10 m

function binAreas(img, geom) {
  var step = img.multiply(10).floor().clamp(LO, HI).int().rename('bin');
  var area = ee.Image.pixelArea().divide(1e4).rename('ha').updateMask(img.mask());
  return area.addBands(step).reduceRegion({reducer: ee.Reducer.sum().group(1, 'bin'), geometry: geom,
    scale: SCALE, maxPixels: 1e11, tileScale: 8}).get('groups');
}
var jobs = {};
['mekong', 'red'].forEach(function (k) {
  Object.keys(DEMS).forEach(function (name) { jobs[k + ' ' + name] = binAreas(DEMS[name], region(k)); });
});
ee.Dictionary(jobs).evaluate(function (res, err) {
  if (err) { print('Lỗi / error:', err); return; }
  var levels = [], rows = [];
  for (var i = LO; i <= HI; i++) levels.push((i + 1) / 10);  // below[i] = share under (LO + i + 1) / 10 m
  var keys = Object.keys(res);
  var curves = keys.map(function (key) {
    var per = levels.map(function () { return 0; });
    res[key].forEach(function (g) { per[g.bin - LO] = g.sum; });
    var total = per.reduce(function (a, b) { return a + b; }, 0), acc = 0;
    var below = per.map(function (v) { acc += v; return 100 * acc / total; });
    var at = function (h) { return below[Math.round(h * 10) - LO - 1].toFixed(1); };
    print(key + ': below 1 m ' + at(1) + ' %, 2 m ' + at(2) + ' %, 3 m ' + at(3) + ' %; area used ' +
          (total / 1e6).toFixed(2) + ' million ha');
    return below;
  });
  for (var j = 0; j < levels.length; j++) rows.push(curves.map(function (c) { return c[j]; }));
  print(ui.Chart.array.values(ee.Array(rows), 0, ee.Array(levels)).setSeriesNames(keys).setOptions({
    title: 'Share of land below each elevation (m above EGM2008)', hAxis: {title: 'elevation, m', viewWindow: {min: -1, max: 10}},
    vAxis: {title: '% of area below'}, lineWidth: 2, pointSize: 0}));
});
// Chapter 11 (30 m): Mekong DeltaDTM below 1 m 4.0 %, below 2 m 60.0 %, Copernicus below 2 m 37.5 %; Red DeltaDTM below 2 m 10.9 %.

// ---------- 3. DSM - DTM at Ben Tre (Giong Trom) ----------
var PT = ee.Geometry.Point([106.50, 10.10]);
var FRAME = PT.buffer(5120).bounds(1, 'EPSG:32648');  // 10.24 km square
var diff = COP.subtract(DTM).rename('diff');
Map.centerObject(FRAME, 12);
Map.addLayer(DTM.clip(FRAME), {min: 0, max: 6, palette: ['440154', '3b528b', '21918c', '5ec962', 'fde725']}, 'DeltaDTM (ground)');
Map.addLayer(COP.clip(FRAME), {min: 0, max: 6, palette: ['440154', '3b528b', '21918c', '5ec962', 'fde725']}, 'Copernicus DEM (surface)');
Map.addLayer(diff.clip(FRAME), {min: 0, max: 8, palette: ['ffffb2', 'fecc5c', 'fd8d3c', 'f03b20', 'bd0026']}, 'Copernicus − DeltaDTM');
var lc = ee.ImageCollection('ESA/WorldCover/v200').first().rename('lc');
print('Ben Tre frame: median Copernicus − DeltaDTM by WorldCover class (10 trees, 40 cropland, 50 built), 30 m:',
      diff.addBands(lc).reduceRegion({reducer: ee.Reducer.median().group(1, 'lc'), geometry: FRAME, scale: 30,
                                      maxPixels: 1e9}).get('groups'));
print('Giong Trom, 1 km disc mean (chapter: DeltaDTM 1.78, Copernicus 6.03 m):',
      ee.Image.cat([DTM.rename('dtm'), COP.rename('cop')]).reduceRegion(ee.Reducer.mean(), PT.buffer(1000), 30));

// ---------- 5. SoilGrids pH 0-30 cm, Mekong ----------
var sg = ee.Image('projects/soilgrids-isric/phh2o_mean');
var ph = sg.select('phh2o_0-5cm_mean').multiply(5 / 30)
  .add(sg.select('phh2o_5-15cm_mean').multiply(10 / 30))
  .add(sg.select('phh2o_15-30cm_mean').multiply(15 / 30)).multiply(0.1).rename('ph');
var MEKONG = region('mekong');
print('Mekong SoilGrids pH 0-30 cm (median, min; share < 5.5 and < 4.5). Chapter: 5.8, 4.8, 11.7 %, 0 %:',
      ee.Image.cat([ph, ph.lt(5.5).rename('lt55'), ph.lt(4.5).rename('lt45')]).reduceRegion({
        reducer: ee.Reducer.mean().combine(ee.Reducer.median(), '', true).combine(ee.Reducer.min(), '', true),
        geometry: MEKONG, scale: 250, maxPixels: 1e10}));
Map.addLayer(ph.clip(MEKONG), {min: 4.5, max: 7.5, palette: ['a6611a', 'dfc27d', 'f5f5f5', '80cdc1', '018571']},
             'SoilGrids pH 0-30 cm (Mekong)', false);
// SoilGrids smooths acid sulfate soils away (pH < 4 when pyrite oxidises): use it for a first look, not to map them.
