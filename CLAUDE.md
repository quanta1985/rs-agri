# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Viễn thám Nông nghiệp & Môi trường / Remote Sensing for Agriculture & Environment** (`siteTitle` in `src/i18n/ui.ts`), repo/slug `rs-agri`: a bilingual (vi/en) interactive handbook on remote sensing for agriculture, centred on **environment and natural factors** (climate, water, floods, drought, salinity, soils, subsidence, coast, emissions, risk), with examples on real data from the **Red River Delta (ĐBSH)** and **Mekong Delta (ĐBSCL)**. Developed from FAO (2017) *Handbook on Remote Sensing for Agricultural Statistics* (`ca6394en.md`, local only). Author/owner: Trần Anh Quân (HUMG).

Sister app: `L:\Remote Sensing and GIS` (**rs-knowledge**, https://quanta1985.github.io/rs-knowledge/). This app was cloned from its skeleton and keeps its stack, design system and conventions. RS basics (spectra, indices, SAR, classification, pre-processing) are NOT rewritten here: link to rs-knowledge chapters instead. When in doubt about a pattern, look at how rs-knowledge does it.

**Roadmap and decisions: `PLAN.md`** (chapter list with book sections, data and figures per section; MVP chapter details; risks). Read it before changing scope.

## Commands

```bash
npm run dev                                   # dev server, http://localhost:4321/rs-agri/
npm run build                                 # astro build + pagefind index (search only works after build)
npm run preview                               # serve dist/ (one preview per project; add -- --port 4322 if 4321 is busy)
npm test                                      # node:test on src/lib/*.test.ts (Node 24 strips TS types natively)
npx -y -p typescript@5.9.3 tsc --noEmit -p .  # type check; run AFTER a build/dev (needs .astro/types.d.ts); only node:* errors in tests are expected
BUILD_ID=x npx astro build                    # parallel build into dist-x/ (gitignored)

npm run dev -- --port 4323                    # then /rs-agri/vi/dev/ = QA gallery of the map islands (dev only, never built)

# data (layer scripts import layerkit.py: run them WITHOUT -I, from the repo root)
python scripts/data/layerkit.py               # grid self-check (no EE)
python scripts/data/export_flood_gsw.py       # flood-gsw-{red,mekong}: JRC water occurrence, 250 m
python scripts/data/export_evi_monthly.py     # evi-2024-{red,mekong}: MOD13Q1 monthly mean EVI 2024, 500 m
python scripts/data/export_s1_site.py         # s1-angiang-2024: S1 VV dB, 10 m, dry 2024-03-12, flood 2024-10-14, 2024-10-26 (= S2 MNDWI day)
python scripts/data/export_rice.py            # rice-seasons-{red,mekong} (2016, 2024), rice-sos-2024-{red,mekong}; caches scripts/data/cache_*.npy
python scripts/data/export_rice_site.py       # rice-dvh-{angiang,namdinh} (S1 seasonal VH range) + rice-series-{angiang,namdinh}.json
python scripts/data/export_flood.py [season|monthly|yagi|mndwi]   # ch.8 layers + flood-s1-area-mekong.json, flood-yagi-red.json
python scripts/data/export_salinity.py [anomaly|indices|landuse]  # ch.10 layers: sal-evianom-mekong, sal-{ndvi,si}-bentre-2024, dw-{bentre,camau}
python scripts/data/export_deltas.py [landcover|pop|stats|clearsky|purity|volume]  # ch.1-2: lc-wc2021-*, pop-2020-*, deltas-stats.json, data-{clearsky,purity,volume}.json (clearsky ~15 min)
python scripts/data/export_climate.py [oni|smap|monthly|modis|write]  # ch.7+9: CHIRPS/ERA5-Land 5 km 1981-2025, MODIS NDVI/LST 1 km 2001-2025 (caches, ~40 min), SMAP, ONI; write = layers + climate-series.json
python scripts/data/export_soil_terrain.py [soil|dem|hypso]  # ch.11: soil-{ph,soc,clay}-*, dem-{dtm,cop,diff}-*, terrain-hypso.json (~10 min)
python scripts/data/export_coast.py [shore|mangrove|ponds|series]  # ch.12: coast-change-*, mangrove-change-* (frames ndcoast/cmcoast, 30 m), ponds-dry-mekong, coast-series.json (Landsat stacks: ~1.5 h, parallel)
node scripts/<slug>_numbers.ts               # prints every number a chapter quotes (deltas, data, rice, flood, salinity, soil-terrain, coast; climate covers ch.7 + 9)
cd scripts && python build_lab_<slug>.py [--run]   # labs/<slug>_*.ipynb (Colab); --run executes all code cells (EE auth); rice|flood|salinity
python -I scripts/data/export_boundaries.py <adm1.geojson>   # province lines (download geoBoundaries first, see script)
python -I scripts/data/export_hero.py         # home hero: S2 dry-season composites of both deltas -> public/img/hero-*.webp + hero.json
```

GEE project: `claudev1-503808` (auth works locally). Push to `main` deploys via `.github/workflows/deploy.yml` (runs `npm test`, then `withastro/action`), once the GitHub repo `quanta1985/rs-agri` exists (not created yet).

### Deploy targets (planned, not done yet)

- GitHub Pages `https://quanta1985.github.io/rs-agri/` (default `base: '/rs-agri'`).
- Homepage copy `http://remosat.usth.edu.vn/~quanta/rs-agri/`: same procedure as rs-knowledge (see its CLAUDE.md, "Deploy to the homepage"), with `SITE_BASE=/~quanta/rs-agri` and folder `rs-agri`.
- Push / deploy only when the user asks; when they say "push", ask or do both targets.

### Environment gotchas (Windows)

- `-I` drops the script dir from `sys.path` and ignores `PYTHONIOENCODING`: scripts call `sys.stdout.reconfigure(encoding="utf-8")`. Scripts that import `layerkit.py` (and lab generators later) must run WITHOUT `-I`.
- Write JSON with `write_text(..., "utf-8", newline="\n")` (Windows otherwise writes CRLF). Do not patch Python string literals with `sed`: it turns `\n` into a real newline. Long multi-line edits: write a small Python script to the scratchpad and run it (bash heredocs with quotes break).
- Playwright on the console: set `PYTHONIOENCODING=utf-8` before printing Vietnamese HUD text. Use `exact=True` for short button names ("On" also matches "Mekong Delta").
- Never leave a helper named like a stdlib module in the directory you run Python from.
- `rasterio` cannot find `proj.db`: do coordinate transforms in Earth Engine.
- GitHub CLI is not on the bash PATH: `"/c/Program Files/GitHub CLI/gh.exe"` (logged in as `quanta1985`).
- Git Bash rewrites args starting with `/`: prefix with `MSYS_NO_PATHCONV=1`.
- Astro 7's Markdown processor ignores `remarkPlugins`/`rehypePlugins`: transform MDX with component overrides (`<Content components={{ h2: H2, h3: H3 }} />`).
- The IDE's Python diagnostics ("Cannot find module ee / PIL") come from a different interpreter; the scripts run fine with the system `python`.
- Browser checks: Python Playwright + Chromium. For WebGL maps launch Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Islands hydrate `client:visible`: scroll each figure into view before asserting. Keep screenshot scripts in the scratchpad, not the repo.

### Earth Engine data notes

- Cloud Score+: `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED`, `.linkCollection(cs, ['cs_cdf'])`, keep `cs_cdf >= 0.6`.
- `S2_SR_HARMONIZED`: reflectance = DN / 10000. MODIS MOD09/MOD13: × 0.0001. Landsat C2 L2: DN × 0.0000275 − 0.2.
- ĐBSH is very cloudy Jan–Apr (spring rice season): use Sentinel-1 there. Clearest optical windows: ĐBSCL Dec–Apr (~43 % of S2 overpasses usable at An Giang); ĐBSH Jan–Apr is worst (~10 %). By Cloud Score+ cs_cdf >= 0.6 the ĐBSH peaks in Jun–Jul, but part of that is haze the rule lets through (bright B2); MODIS SummaryQA disagrees. Nam Dinh and Ben Tre frames get 2x S2 overpasses (orbit overlap): compare sites by usable/looks.
- Sentinel-1: only S1A in 2022–2024 (12-day repeat per orbit), S1C from 2025. Average σ0 in linear power, then dB.
- Export region-scale layers in **EPSG:3857** so MapLibre image quads are exact (no lat/lon warp).
- `computePixels` with `reduceResolution` fails with "Reprojection output too large" on big requests: `layerkit` fetches at most 512 rows per request. A collection `.mean()` has no default projection: `setDefaultProjection(col.first().projection())` before `reduceResolution`.
- MODIS EVI in the Red River Delta, Jan-Apr: most 16-day composites fail SummaryQA <= 1 (cloud), so monthly means are patchy; say so wherever they are shown.
- MODIS in the Red River Delta, rainy season: only 7-12 % good observations in Jun-Jul 2024 (every year 2016-2024 is patchy), which erases the gap between spring and summer rice. Rice seasons there come from Sentinel-1 VH (orbit 91, 12-day, ~96 % of the delta), not EVI.
- computePixels limits: the reprojected input of a `reduceResolution` must stay under roughly 50-80 M pixels, so 10 m -> 250 m needs `max_rows` 48-64 (`fetch_raw(..., max_rows=)`); EE counts uint8 bands as >= 2 bytes against the 48 MB request cap (`MAX_BYTES` = 16 MB). A delta-wide 10 m monthly S1 median exceeds user memory, and 30 m takes > 20 min a year: detect water at ~100 m (`projection().atScale(100)`), then average to 250 m.
- Cheap 250 m S1 series: request the mosaic at 250 m without `reduceResolution`; EE reads the S1 pyramid (mean of 10 m dB), which also removes speckle. Rice troughs get shallower at 250 m (calibrated: <= -17 dB, rise >= 2.5 dB).
- `Image.clip()` with a lon/lat outline fails on MODIS sinusoidal stacks ("Unable to transform edge"): fetch with `clip=False` and mask locally (the cropland cache is clipped).
- `ee.Image(10).pow(img)` renames the bands to `constant`: convert dB with `img.multiply(ln(10)/10).exp()`.
- Dynamic World 2016-17 has ~2 clear labels a year at Ca Mau (Sentinel-2A only): use 2018 as the early year.
- Sentinel-1B never imaged the Nam Dinh frame (S1A only, orbits 55/91/128); at the Mekong sites S1B gave ~30 of ~90 dates a year until Dec 2021.
- MODIS/061/MOD16A2 in EE starts only in 2021: use ERA5-Land `total_evaporation_sum` (m, negative = loss) and `potential_evaporation_sum` (open-water-like, well above FAO-56 ET0) for long ET series.
- El Niño dries the Mekong dry season but not the Red River winter (2015-16: Mekong -34 %, Red +48 % Dec-Apr rain). 2019-20: rain deficit mostly in Dec-Jan (Feb-Apr SPI-3 -0.14) but SMAP root zone at its 2015-2025 minimum in Dec 2019. Red River Feb-Apr VHI is dominated by spring transplanting and cloud (2020: VHI 33, 60 % < 35, with SPI +1.42), not drought; it rests on few clear days.
- SoilGrids 2.0 (`projects/soilgrids-isric/<prop>_mean`, pH x10, SOC dg/kg, clay g/kg) smooths acid sulfate soils away: Mekong pH 4.8-6.8 (lowest cell in the Plain of Reeds, Thap Muoi ~6.05), nothing below 4.5. Do not use it to map acid soils.
- DEMs: `COPERNICUS/DEM/GLO30` is deprecated, use `GLO30_2024_1` (DSM: +4.3 m over Ben Tre coconut, +2.4 m Can Tho). DeltaDTM `projects/sat-io/open-datasets/DELTARES/deltadtm_v1` (CC BY 4.0, band b1, EGM2008, clipped at 10 m, water masked): compare both DEMs on the DeltaDTM mask. FABDEM is CC BY-NC-SA: not used. DeltaDTM Mekong median 1.9 m vs survey DEM mean 0.82 m above Hon Dau (Minderhoud 2019): datum + bias, state the datum.
- Landsat C2 L2 merges: filter (date, bounds, months) BEFORE `.map()`, and `copyProperties(img, ['system:time_start'])` in the mapped function, else calendarRange fails / filterDate silently empties. Mask QA_PIXEL bits 0-4 (fill too: L7 SLC-off gaps). Multi-year 30 m stacks are slow (minutes per request): `layerkit.pfetch_raw` runs row chunks in 8 processes (each calls `init()`; call it under `__main__`).
- Land-to-water change inland at Ca Mau is shrimp ponds, not erosion (122.6 kha of the 518 kha frame); label such maps neutrally. Yearly shoreline land areas swing +-300 ha with the tide (1992 low everywhere): use Theil-Sen trends, not two-period differences. Hai Hau shows no clear trend over 24.6 km; Ca Mau East Sea coast -29.7 m/yr is close to Tran Thi et al. 2014 (33.2).
- GMW v3 `projects/sat-io/open-datasets/GMW/extent/GMW_V3` (ImageCollection, system:index gmw_v3_<year>, band b1). GMW Mekong 2015->2020 -474 ha vs official +11,184 ha (Tinh et al. 2022): different definitions.
- GHS-POP puts people only on built-up cells: at 250 m most paddy cells are ~0 people/km² (median 131 in the Red River region), villages are red. Region totals: GHSL 2020 is 9.7 % below the 2019 census in the Red River Delta, 1.9 % above in the Mekong.

## Architecture

- **Chapters**: one MDX per chapter per language, `src/content/chapters/<lang>/<slug>.mdx` (entry id `<lang>/<slug>`). A chapter is "ready" iff its MDX exists; otherwise it shows as "Sắp có / Planned". Roadmap = `CHAPTERS` in `src/data/chapters.ts`; display number `n` = array position. Slugs are stable ids without number prefixes:
  - Part A Foundations: 1 `deltas`, 2 `data`.
  - Part B Land & crops (from the FAO book): 3 `landcover`, 4 `rice`, 5 `area-stats`, 6 `yield`.
  - Part C Environment (core, mostly new material): 7 `climate`, 8 `flood`, 9 `drought`, 10 `salinity`, 11 `soil-terrain`, 12 `coast`, 13 `emissions`, 14 `risk`.
  - Part D Practice: 15 `labs`, 16 `reference`.
  - Data, quiz, glossary, lab and script files are prefixed with the slug. Numbers in prose (`## 4.1`, `Hình 4.2`, "Chương 8") are written out; inserting a chapter means renumbering them.
- **Parts**: `PARTS` in `src/data/chapters.ts` (tab label, heading, home blurb, bilingual) drives both the ribbon (`AppBar.astro`) and the home page. Add a part there, nowhere else.
- **Routes**: `src/pages/[lang]/[slug].astro` (chapter page with kicker, objectives, prev/next, right TOC), home `[lang]/index.astro`, `glossary`, `search`. `/` meta-refreshes to `/vi/`.
- **Navigation**: `AppBar.astro` = sticky app bar + Office-style ribbon (tabs Part A–D, Reference, View). No left sidebar; right column = chapter TOC. Depth levels, Present mode and theme are in the View tab (script in `Base.astro`).
- **i18n**: UI strings in `src/i18n/ui.ts` (`t(lang, key)`); internal links go through `url()` (applies the base path). Astro components get the language via `langFromUrl(Astro.url)`; React islands get `lang` as a prop and keep their own `TXT = { vi, en }`.
- **Depth levels**: `<Depth level="advanced|ref">`; CSS on `html[data-depth]`. Present mode = `html[data-present]`, arrows jump between `h2`s.
- **Glossary and quiz**: `src/data/glossary/<slug>.json` merged by `src/data/glossary.ts` (throws on duplicate ids); `<Term id>` throws at build if the id is missing. Quizzes: `src/data/quiz/<slug>.json`, rendered by `Quiz.tsx`.
- **Design system** (inherited from rs-knowledge, do not drift):
  - Tokens: light grey `--bg`, white cards, teal `--primary`, ochre `--accent`; dark theme redefines every token. Islands use tokens, never hard-coded theme hex (`--chart-1…6`, `--fg`/`--fg-muted`/`--fg-3`, `--border`, `--st-*`). Data colours with meaning (class colours, ramps, imagery) stay fixed.
  - Type: Chakra Petch headings, Be Vietnam Pro body, JetBrains Mono labels (`.mono-label`).
  - Content blocks: `<Figure title="Hình n.k — …" try source>`, `<Note kind="key|tip|example|why|warn|myth">`, `<Tiles>`, `<Stats>`, `<Steps>`, `<Predict client:visible …>`, `<Formula label tex where>` / `<M tex>` (`tex`/`where` as plain `"…"` strings, never `{…}`), `<LabLinks>`, `<Depth>`, `**bold**` first use, at most one `<mark>` per section. Scope any `.key` CSS rule (collides with legend/Note/mark).
- **Islands kept from rs-knowledge**: `MapStage.tsx` (MapLibre GL, Esri imagery / Light Gray basemaps, keyless; NO CARTO; `SOVEREIGN` labels; `onMap` escape hatch for GeoJSON; raster overlays as image sources on a corner `Quad`), `VizUi.tsx` (`StatPanel`, `Pills`, `Slider`, `Key`), `LineChart.tsx`, `Predict.tsx`, `Quiz.tsx`. Not yet copied (copy when needed): `FormulaTable`, `WorkedExample`. Labs: `scripts/labkit.py`, `LabIndex.astro` (lists `labs/<slug-first-token>_*`), `LabLinks.astro`.
- **Pure math** in `src/lib/` with `.test.ts` each: `raster.ts` (indices, stretch, histogram, Otsu, colormaps), `chart.ts`, `geo.ts` (UTM inverse, quads, lonLat→pixel), `sar.ts` (dB, speckle filter), `change.ts` (OLS, Theil–Sen, breakpoint).
- **Study areas**: `src/data/regions.json` is the single source for Python (grids) and islands (labels): deltas `red`, `mekong` (bbox = mainland farmland) and 10.24 km sites `namdinh`, `angiang`, `thapmuoi`, `bentre`, `camau`.
- **Map layer format** (`scripts/data/layerkit.py` writes, `src/lib/layer.ts` reads): `public/data/<id>/meta.json` + `values.binz` (gzip, band-sequential = one band per time step, little-endian `dtype` uint8/uint16/int16; value = raw x scale + offset; raw = nodata means no data). Grid: EPSG:3857, upper-left `origin`, square `res` in Mercator metres, `ground_res_m` = nominal ground size (pixel ground area shrinks by cos^2(lat), see `pixelAreaHa`). Meta also holds bilingual title/units, kind (continuous/classes), palette name + range or classes, `times`, per-step `stats` (valid, mean, p2/p50/p98, min/max in physical units, for prose numbers), `clipped_to`, provenance. Delta layers are clipped to the statistical region outline (nodata over sea, Cambodia, hills). Layer ids: `<topic>-<region>` or `<topic>-<year>-<region>`. Size budget about 2 MB per layer (s1-angiang-2024 with 3 dates is 2.6 MB): 250 m single layers, 500 m monthly stacks, 10 m only on sites; uint8 whenever the precision allows (S1 dB in 0.15 dB steps).
- **Boundaries**: `public/data/boundaries/provinces.json` = 24 provinces of the two GSO regions + one outline per region, from geoBoundaries gbOpen ADM1 (Public Domain, 2008 = 63-province boundaries). Do NOT use GADM for anything published (its licence forbids redistribution).
- **Map islands**:
  - `layers.ts`: `loadLayer(id)` / `useLayer(id)` (one cached download per layer per page; never returns a previous id's layer), `loadProvinces()`, `REGIONS`.
  - `DeltaMap.tsx`: `choices=[{ key, label, ids: { red: '<id>', mekong: '<id>' }, palette?, range?, clearBelow? }]`, optional `region`, `time`, `compare`. Region + layer pills, time slider with play, swipe compare of two time steps (left = "Trái/Left" slider, right = time slider; composed into the image, white divider line as GeoJSON), opacity, HUD with value under the cursor + province name + legend. One MapStage per region+layer (`key`), so each keeps its own view and Reset.
  - `ThresholdLab.tsx`: `layer`, `below`, `range`, `step`, `maskLabel`, `speckle` (Lee 5x5), `time`. Grey base + Okabe-Ito blue class mask, histogram with Otsu (dashed ochre) and the threshold (white), class area in ha from per-row pixel ground area.
  - Time series: use `LineChart.tsx` (gaps via `maxGap`, ribbons, spans for events, `Legend`); the planned `SeriesChart` was not needed.
- `TerrainCurve.tsx` (ch.11; terrain-hypso.json): `view="curve"` share of each delta below each elevation (DeltaDTM vs Copernicus), `"future"` sea-level rise + uniform subsidence sliders (illustrative). `CoastSeries.tsx` (ch.12; coast-series.json): `"shore"` yearly land gained/lost per stretch vs the 1988-92 median, `"mangrove"` GMW area per epoch.
- Coastal frames in regions.json (`kind: "frame"`, square, 52 / 72 km): `ndcoast` (Nam Dinh coast), `cmcoast` (Ca Mau Cape); scripts that loop over `kind == "site"` skip them; DeltaMap takes them like sites (`boundaries={false}`).
- `ClimateSeries.tsx` (ch.7 + 9; climate-series.json): `view="normals"` 1991-2020 monthly rain/ET/PET + t2m/LST, `"dry"` Dec-Apr rain and Feb-Apr t2m anomalies per year with El Niño spans (DJF ONI >= 1.0), `"warming"` annual t2m + Theil-Sen, `"drought"` SPI-3 / cropland VHI (line at 35) / SMAP anomaly 2015-2025.
- Chapter 2 islands: `ClearSky.tsx` (`view="s2"` usable Sentinel-2 days per month at the five sites, `view="s1"` Sentinel-1 days per year; data-clearsky.json), `PixelPurity.tsx` (share of pure cells by cell size, log x axis; data-purity.json).
- **Pure helpers**: `lib/accuracy.ts` (stratified area estimator), `lib/layer.ts` (Mercator, quads, `pixelAt`, `decode*`, `PALETTES` water/evi/gray/viridis/brbg/ylorrd, `colorize` with a per-code LUT, `colorizeValues` for float values, `swipe`, `areaWhere`), `lib/format.ts` (`fmtNum` with the vi decimal comma, `digitsFor`, `fmtTime`, `placeName`: Vietnamese place names without diacritics on en pages, used by the DeltaMap HUD and FloodArea).

## Conventions that matter

- Every number in chapter prose comes from exported data or a `scripts/<slug>_numbers.ts` script, or from a cited publication (salinity, subsidence, damage statistics). Illustrative schematics/presets are labelled "minh họa / illustrative". Drop what cannot be verified.
- Figures: fixed −1…+1 scale for indices, disclose stretch, Okabe-Ito/BrBG/viridis with shape/dash redundancy, data table in `<details>`, provenance (incl. dates) in the Figure `source`. Never connect time-series points across gaps > 40 days. Figures that simulate data say "simulated / mô phỏng".
- Sovereignty: every MapStage shows Hoàng Sa / Trường Sa (Việt Nam) labels; national views include both archipelagos.
- Province boundaries: use the pre-2025 63-province boundaries for historical statistics, with a note on the 2025 mergers.
- **Licensing**: content CC BY-NC 4.0 (package.json) because the FAO 2017 book is not CC BY (copyright page not yet verified: it is an image in the PDF). Rewrite, never translate the book verbatim; tables/figures taken from it cite FAO. The book files (`ca6394en.*`, `convert_pdf.py`) are gitignored and must never be committed or published. FAO is credited in the footer (`t('footer')`), and will be in the Reference chapter.
- Imagery attribution "Contains modified Copernicus Sentinel data" stays in the footer. Footer line 1 = © 2026 Trần Anh Quân · quantrananh.humg@gmail.com · Author's homepage `http://remosat.usth.edu.vn/~quanta/`.
- New chapter checklist: add to `CHAPTERS` (already listed) and write vi + en MDX; quiz + glossary JSON (unique ids); data script under `scripts/data/` + numbers script; lab generator; 2–3 `<Predict>` and a key `<Note>` per section; Playwright check of every figure (vi/en, light/dark, 1440 and 390 px; no console errors, no horizontal overflow); finish with a `code-reviewer` pass.
- Commits/pushes only when the user asks. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.gitattributes` forces LF, marks `*.u16z`/`*.png` binary (add `*.u8z`, `*.webp` when they appear in data).
- **Keep this file current: update the Status section (and any section a step changes) at the end of every step of PLAN.md.**

## Status

**Step 11 done (2026-11-17): ch.11 `soil-terrain` + ch.12 `coast`** (uncommitted until the user asks; step 10 also uncommitted).
- Data ch.11 (`export_soil_terrain.py`): `soil-{ph,soc,clay}-{red,mekong}` (SoilGrids 0-30 cm weighted, 250 m), `dem-{dtm,cop,diff}-{red,mekong}` (DeltaDTM, Copernicus GLO30_2024_1, difference; uint16 0.01 m, offset -5), `terrain-hypso.json` (ha below each 0.1 m, -3..10 m, 30 m, on the DeltaDTM mask, + 7 named points). Below 2 m: Mekong 60.0 % (DeltaDTM) / 37.5 % (Copernicus), Red 10.9 %; below 1 m Mekong 4.0 %.
- Data ch.12 (`export_coast.py`): `coast-change-{ndcoast,cmcoast}` (Landsat MNDWI water in >= 50 % of looks, 1988-92 vs 2021-25, 30 m), `mangrove-change-*` (GMW 1996 vs 2020), `ponds-dry-mekong` (share of 30 m cells water in >= 75 % of Jan-Apr looks, 1993-97 / 2003-07 / 2021-25, 250 m), `coast-series.json` (yearly land per stretch: line buffers 1.5 km or boxes; GMW area per epoch; ponds per province).
- Key numbers (Theil-Sen over well-observed years, single years swing +-130-400 ha with the tide): Ca Mau East Sea coast -198 ha/yr = -29.7 m/yr over 66.6 km; Ca Mau Cape +144 ha/yr; Ba Lat +68 ha/yr; Hai Hau +10 ha/yr (+4 m/yr, no clear trend); GMW Mekong 96.1 -> 89.2 kha (-7.2 %), Red 21.9 -> 21.9 kha; standing dry-season water Mekong 226 -> 399 -> 368 kha (1993-97 / 2003-07 / 2021-25), Ca Mau 37 -> 146 -> 125 kha, Bac Lieu 14 -> 56 -> 42 kha.
- Published numbers cited: Husson 1998 (1.6 M ha acid sulfate, 0.4 M ha Plain of Reeds), Minderhoud 2017/2019/2020, Erban 2014, IPCC 2021 (3.7 mm/yr), Pronk 2024 (DeltaDTM MAE 0.45 m), Anthony 2015, Tran Thi 2014, Nguyen Van Thao 2013, Pham Quang Son 2016, Tinh 2022. MONRE/MAE sea-level scenarios NOT used (only press sources found).
- Chapters vi + en, quiz, glossary (soil-terrain owns acid-sulfate-soil, soilgrids, soil-organic-carbon, dsm-dtm, vertical-datum, land-subsidence, relative-slr, hypsometric-curve, insar; coast owns shoreline, tidal-flat, erosion-accretion, mangrove, gmw, sediment-starvation, aquaculture-pond), `scripts/soil-terrain_numbers.ts`, `scripts/coast_numbers.ts`.
- Checks: 46/46 tests, tsc clean, build OK (22 pages), Playwright soil-terrain/coast/home x vi/en x light/dark x 1440/390: no console errors, overflow 0, all islands hydrate (8 / 10).
- code-reviewer: no CRITICAL/HIGH. Fixed: coastal rates from Theil-Sen instead of thin 1988-92 baselines, pond/seasonal caveat on the land-water map, 'land lost in the 1.5 km band' wording (mangrove belt intact behind the East Sea coast), Copernicus 37 -> 38 % (readout rounding), dem-diff on the DeltaDTM mask, chunk retries in pfetch_raw, GMW epoch caveat, ponds guard in coast_numbers, mangrove chart not joined across missing epochs. Checked: Minderhoud 2019 75 % / 31 % quoted verbatim by the source agent.

**Step 10 done (2026-11-17): ch.7 `climate` + ch.9 `drought`** (uncommitted until the user asks).
- Data (`export_climate.py`): `rain-normal-{red,mekong}` (CHIRPS 1991-2020 monthly means, 12 steps "M01".."M12", fmtTime shows "Tháng 3" / "Mar"), `rain-dryanom-*` (Dec-Apr % vs normal, 2015-16 / 2019-20 / 2023-24), `spi3-*` (Feb-Apr SPI-3, gamma per cell), `vhi-dry-mekong` (Feb-Apr VHI 2016/2018/2020/2024, 1 km), `climate-series.json` (region means 1981-2025 rain/t2m/ET/PET/SPI-3, MODIS LST/VHI/ASI 2001-2025 on >= 50 % cropland cells, SMAP root zone 2015-04..2025-12, NOAA ONI, 1991-2020 normals).
- Key numbers: normals Red 1,698 mm/yr, Jan 16.4 °C; Mekong 1,705 mm/yr, 9 % in Dec-Apr; Mekong dry-season rain 2016 -34 %, 2020 -38 %, 2024 -60 %; SPI-3 Feb-Apr Mekong 2016 -1.89, 2020 -0.14, 2024 -1.85; VHI Feb-Apr Mekong cropland 2016 51, 2018 70, 2020 44 (41 % < 35), 2024 55 (VCI/TCI need >= 10 cloud-free years of the month); ERA5-Land trends +0.19 (Red) / +0.13 (Mekong) °C/decade; ONI ASO 2026 = +2.46 (only 1983, 1998, 2016 had DJF ONI > 2 since 1950).
- Chapters vi + en, quiz, glossary (climate owns climate-normal, chirps, reanalysis, lst, evapotranspiration, enso, oni; drought owns drought-types, spi, vci, tci, vhi, soil-moisture, early-warning), `scripts/climate_numbers.ts`. YAML gotcha: quote a frontmatter `summary` that contains ": ".
- Checks: 46/46 tests, tsc clean, build OK (18 pages), Playwright climate/drought/home x vi/en x light/dark x 1440/390: no console errors, overflow 0, all islands hydrate. Fixed after reading the figures: the 2019-20 soil-moisture claim (SMAP minimum, not "slightly dry").
- code-reviewer: no CRITICAL/HIGH; SPI, VHI, units verified. Fixed: VCI/TCI masked where < 10 cloud-free years of the month (numbers re-run), 2020 no longer called an El Niño year in titles/questions, uncited 2020 salinity cause softened, ONI wording ("highest since 2015-16", checked in the numbers script), every remaining prose number printed by climate_numbers.ts, SPI fits only April for the maps, trend sign, cache_*.json gitignored.

**Step 9 done (2026-11-17): batch 2 starts, Part A = ch.1 `deltas` + ch.2 `data`.** Committed `2bc8908`.
- PLAN.md section 6b = batch-2 roadmap (steps 9-16).
- Data (`export_deltas.py`): `lc-wc2021-{red,mekong}` (WorldCover v200 mode to 250 m), `pop-2020-{red,mekong}` (GHS-POP 2020 people/km², uint16), `deltas-stats.json` (30 m WorldCover areas + GHSL 2000/2020 inside the outlines: Red 2.13 M ha, tree 37.4 / crop 31.9 / built 12.0 %; Mekong 3.99 M ha, crop 49.0 / tree 25.9 / built 4.4 %), `data-clearsky.json` (S2 + Cloud Score+ usable days per month 2019-2024, S1 dates per year 2015-2025, five sites), `data-purity.json` (WorldCover pure-cell share at 10-500 m), `data-volume.json` (2024 scene counts per delta).
- Chapters vi + en, quiz, glossary (ch.1 owns land-cover, gridded-population, agri-statistics, sampling-frame; ch.2 owns spatial-resolution, revisit, mixed-pixel, cloud-score, reference-data), `scripts/{deltas,data}_numbers.ts`. Census 2019 regional totals are cited (Red 22,543,607; Mekong 17,273,630).
- Fixed the open item "DeltaMap HUD shows Vietnamese province names on en pages" (`placeName`).
- Checks: 46/46 tests, tsc clean, build OK (14 pages), Playwright home/deltas/data/flood x vi/en x light/dark x 1440/390: no console errors, overflow 0, all islands hydrate; en HUD shows "Ha Noi".
- code-reviewer: no CRITICAL/HIGH, every prose number matches the numbers scripts. Fixed: sites compared by usable share of overpasses (Nam Dinh, Ben Tre get 2x S2 passes), Cloud Score+ haze caveat for the Nam Dinh Jun-Jul peak (spot-checked: some passing days have B2 ~0.15), unsupported "cities eat farmland faster" dropped, Ca Mau 33/72 empty months, "sampled at 30 m" wording, ClearSky readout labels, script docstring.

**Step 7 done (2026-11-17): final check of batch 1.** Committed `6e86e18`.
- Playwright sweep on the production build (preview :4322, Pagefind index 10 pages): 7 pages (home, rice, flood, salinity, labs, glossary, search) x vi/en x light/dark x 1600/390, scrolling every page so all `client:visible` islands hydrate: 0 console errors, 0 unhydrated islands (17/15/17 islands on rice/flood/salinity), 0 overflow, 0 broken images, 14 internal links all 200; search "phù sa" -> 5 results, "salinity" -> 4; depth basic/advanced/ref switches.
- code-reviewer over steps 5-6: no CRITICAL/HIGH. Fixed: rice JS VH chart (date strings on the x axis, scenes with no valid pixel dropped before log10; re-run in Python EE: 37 dates, min -29.48 dB on 2023-11-13 = notebook), flood JS Otsu thresholds rounded like the notebook (0.02 / 0.25 dB) + empty-date warning, labs chapter no longer claims a lab per chapter and says the JS scripts are untested, ch.7/9 blurbs say "dry seasons of 2016, 2020, 2024" (2019-20 is not a clear El Niño year).
- Not fixed (LOW, noted): exact-match province-name filters in the flood/salinity JS fail opaquely if a dataset renames a province.
- Next: step 8 = the author reviews batch 1, then batch 2 (remaining chapters) and deploy on request.

**Step 6 done (2026-11-17): labs for ch.4, 8, 10 + chapter 15 `labs`.** Committed `1d2b820`.
- `scripts/labkit.py` (from rs-knowledge; now writes LF) + `scripts/build_lab_{rice,flood,salinity}.py` -> `labs/rice_seasons`, `labs/flood_water`, `labs/salinity_indicators` (`.ipynb` Colab + hand-written `.js` GEE Code Editor script each). Notebooks are bilingual, first code cell `PROJECT = 'YOUR-CLOUD-PROJECT-ID'`, no outputs saved.
- `--run` passes for all three (about 20 s / 21 s / 40-55 s locally). Lab numbers vs chapter: rice Otsu 9 dB, 5,975 vs 5,934 ha (web layer stores 0.1 dB steps), Olofsson 1,504 +/- 109 identical; flood MNDWI 5,855 ha identical, VV -15.25 dB / 6,206 ha vs -15.5 / 5,980 (0.15 dB storage steps), An Giang peak ~10 % lower (100 m on EE boundaries vs 250 m cells); salinity EVI anomaly 30.3 vs 31.1 % (0.0025 deg grid, GAUL 2015 provinces), r = -0.79 vs -0.80, Dynamic World shares within 0.1 pt. Each notebook states its differences from the chapter.
- Flood lab: Yagi section uses a Nho Quan - Gia Vien (Ninh Binh) frame, not Nam Dinh (only 19 ha new water on cropland there: heading rice brightens the radar).
- Chapters link their lab with `**Thực hành.** / **Lab.**` + `<LabLinks notebook gee />` just before the review section. Chapter 15 `labs` (vi + en) = `<LabIndex />` + setup guide; the home "Labs" CTA and ribbon item now appear.
- Checks: 45/45 tests, build OK (labs page emitted), `node --check` on the JS, no project id / emails in labs; Playwright labs + chapter pages vi/en x light/dark x 1440/390: no console errors, overflow 0, LabIndex lists 3 labs.
- Untested: the `.js` scripts in the Code Editor (cores re-run in Python EE with matching numbers; `ui.Chart` and map layers not tried). Salinity lab uses FAO GAUL 2015 (deprecated in EE; prints a warning). Colab / GitHub links 404 until the `quanta1985/rs-agri` repo exists and is pushed.

**Step 5 done (2026-11-17): home page + 16-chapter table of contents.** Committed `7697f31`.
- Home h1 fixed (step 1 had garbled duplicated text: a `sed` replacement containing `&`, which sed reads as "the matched text"; never put `&` in a sed replacement).
- `ChapterInfo.blurb?` (bilingual one-liner from PLAN) shown on the home card of a chapter until its MDX exists; written chapters show their frontmatter `summary`. Planned cards: dashed border, transparent background, 3-line clamp (no global opacity, keeps text contrast).
- Home stats: "3/16 chương đã viết" (ready/total) instead of "16 chương". "Bài thực hành" CTA only when the `labs` chapter exists; in the ribbon's Reference tab, Labs and Formulas are greyed "planned" items until `labs` / `reference` exist (no more 404 links).
- Checks: 45/45 tests, type check clean, build OK (13 planned cards); Playwright home vi/en x light/dark x 1440/390: no console errors, overflow 0, every internal link returns 200.

**Step 4 done (2026-11-16): chapters 4 `rice`, 8 `flood`, 10 `salinity` in vi + en.** Committed `bfe6bc0`.
- Each: MDX (sections n.1-n.6 + Ôn tập + references), `src/data/quiz/<slug>.json`, `src/data/glossary/<slug>.json` (ids owned per chapter; `<Term>` only uses the chapter's own ids), `scripts/<slug>_numbers.ts` (prints every number in the prose; salinity ~25 s).
- New islands: `RiceSeries` (S2/S1 point series, 40-day gaps), `AreaCorrection` (2x2 confusion matrix -> bias-corrected area on the real 2024 map; default matrix illustrative; needs >= 2 points per map class), `FloodArea` (`view="months"|"years"`, region/province picker), `IntrusionChart` (published 4 g/L lengths, hollow = mid-season value), `SalinityMechanism` (illustrative, % change only, L ~ Q^-1/3). Pure math: `lib/accuracy.ts` (Olofsson et al. 2014 `estimateArea`, test reproduces the paper's example).
- Published numbers cited in the chapters: GSO winter-spring 2024 rice area (Mekong 1,487.7, Red 471.4 thousand ha); Yagi damage (Cục Thủy lợi 8/9/2024, MARD 15/9/2024, GSO 7/10/2024); salinity 2015-16 per estuary (Nguyễn Ngọc Anh 2017), 2019-20 (Tổng cục Thủy lợi 20/6/2020, MARD 2020), 2023-24 (Cục Thủy lợi 23/2/2024, Đài KTTV Nam Bộ 22/3/2024); Triet et al. 2017, Kondolf et al. 2022, Park et al. 2022 (Ambio 51:691), Cái Lớn-Cái Bé dates. Gaps stated in the figures: per-estuary peaks only verified for 2016; no GSO 2016 regional rice area; Yagi per-province figures only for Thái Bình, Hà Nội, Bắc Ninh, Nam Định.
- Key data results: Mekong 3+ rice crops 25 -> 35 % of farmland (2016 -> 2024), Red River "no rice detected" 15 -> 29 %; pixel count 1,692 vs GSO 1,487.7 thousand ha (+14 %); Mekong peak-month water mean 496 thousand ha (max 2017 604, min 2021 395); Yagi new water 51,501 ha (23,430 on cropland, ~19,900 on 2024 rice cells); dry-season EVI anomaly <= -0.05 on 22.7 / 31.1 / 18.6 % of the Mekong delta in 2016 / 2020 / 2024, stronger inland than on the coast (so not a salinity map); Bến Tre DW crops 19.0 -> 6.0 % (to trees), Cà Mau DW water/flooded vegetation flip on shrimp-mangrove farms.
- Checks: 45/45 tests, type check clean, full build OK (6 chapter pages), Playwright vi/en light/dark 1440/390 on every figure: no console errors, overflow 0. code-reviewer: no CRITICAL/HIGH; fixed: AreaCorrection guard for < 2 points per class (SE was understated / estimate silently wrong), `estimateArea` throws on empty map, confusion inputs styled, wrong frame-size print removed.
- Open: DeltaMap HUD shows Vietnamese province names on the en pages; Ch. 5/11/13 referenced in prose (plain text, no links) but not written; labs linked in step 6.

**Step 3 done (2026-11-16): GEE exports for the Rice, Flood and Salinity chapters.** Committed `7e67ed3`.
- `layerkit.py` split into `fetch_raw` / `to_values` / `to_raw` / `write_layer` (numpy processing between fetch and write; `export_layer` = both) + `max_rows`.
- Rice (ch.4): `rice-seasons-{red,mekong}` (classes 0-3, 2016 vs 2024; Red = S1 rice seasons, Mekong = MODIS Terra+Aqua 8-day EVI cycles on WorldCover cropland), `rice-sos-2024-mekong` (SOS at 0/20/50 % of the EVI amplitude, days from 1 Jan 2024; medians -45 / -22 / -9), `rice-sos-2024-red` (S1 transplanting trough; median day 51), `rice-dvh-{angiang,namdinh}` (10 m S1 seasonal VH range), `rice-series-{angiang,namdinh}.json` (S2 NDVI/EVI/LSWI + S1 VH/VV, Sep 2023-Dec 2024, 500 m box chosen by max VH range: An Giang box = 2 rice crops + flood fallow Sep-Nov; Nam Dinh = spring + summer rice).
- Flood (ch.8): `flood-gswseason-{red,mekong}`, `flood-s1-{2018,2024}-mekong` (monthly water share Jul-Dec), `flood-s1-area-mekong.json` (ha per month 2016-2025, region + 13 provinces; peak-month open water incl. flooded paddies, thousand ha: 2016 481, 2017 604, 2018 566, 2019 455, 2020 450, 2021 395, 2022 543, 2023 464, 2024 410, 2025 588), `flood-yagi-red` (31 Aug vs 12 Sep 2024) + `flood-yagi-red.json` (new water on cropland per province; Ha Noi 6,432 ha, Ninh Binh 4,262, Nam Dinh 3,148), `s2mndwi-angiang-2024` (26 Oct 2024: Otsu 0.06 -> 5,855 ha water, 55.9 % of the frame; radar 14 Oct: 6,045 ha).
- Salinity (ch.10): `sal-evianom-mekong` (Feb-Apr EVI 2016/2020/2024 minus the 2010-2024 median), `sal-ndvi-bentre-2024`, `sal-si-bentre-2024` (NDSI = -NDVI exactly, said in provenance), `dw-{bentre,camau}` (Dynamic World mode 2018 vs 2024).
- QA page shows all new layers; DeltaMap HUD prints the class label for class layers. Checks: 41/41 unit tests, type check clean, build OK, QA page vi light 1440 + en dark 390: no console errors, no overflow.
- code-reviewer pass over steps 2+3: no CRITICAL/HIGH. Fixed: shared `swipeCut` for image + HUD + divider, playback stops on layer/region switch, ThresholdLab shows the step's decimals (0.25 -> 2), S1 transplanting window starts 1 Jan (same year as the season count), `peaks` docstring. Checked and not an issue: orbit 91 has no 6-day S1B sampling in 2016 (12-day, three 24-day gaps).
- Next: step 4 (write ch.4, 8, 10 vi + en, quiz, glossary, `*_numbers.ts`). Published numbers still to collect: GSO rice area by season/province, salinity intrusion lengths 2015-16 / 2019-20 / 2023-24, Yagi damage reports.

**Step 2 done (2026-11-16): map layer format + islands.** Committed `c6ec004`.
- `layerkit.py` + 4 real layers (flood-gsw x2, evi-2024 x2, s1-angiang-2024) + province lines + `regions.json`; `lib/layer.ts`, `lib/format.ts` (+ tests), `islands/layers.ts`, `DeltaMap.tsx`, `ThresholdLab.tsx`; QA page `src/pages/[lang]/dev.astro` (dev server only).
- Checks: 40/40 unit tests, type check clean, build OK (dev page not emitted). QA page vi light 1440 + en dark 390: no console errors, no horizontal overflow; hover value + province, region switch, layer switch, swipe compare, threshold/Otsu/Lee all exercised. Example numbers (not yet in prose): An Giang site 14/10/2024, Otsu -16.5 dB -> 6,045 ha water (57.6 % of the frame); with Lee 5x5 -16.25 dB -> 5,912 ha.

**Step 1 done (2026-11-15): skeleton.** Committed `ee7e927` (no GitHub repo yet).
- Copied from rs-knowledge: config, deploy workflow, components (minus `WorkedExample`), layout, pages, i18n, styles, 5 islands, 5 lib modules + 4 test files. Renamed base/repo to `rs-agri`, license CC-BY-NC-4.0.
- New: 16-chapter roadmap with `PARTS` A–D (ribbon + home generalised from 3 hard-coded parts), new title/tagline/footer, rice-and-water logo (`AppBar.astro` + `public/favicon.svg`, same paths), home hero from real data (`export_hero.py`: Mekong Jan–Mar 2024, 378 S2 scenes; Red River Oct–Dec 2023, 154 scenes; B11/B8/B4).
- Checks: 26/26 unit tests, type check clean, build OK (only "collection chapters is empty" warnings until the first MDX exists). Home page vi/en × light/dark × 1440/390 px: no console errors, no horizontal overflow.
