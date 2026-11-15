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

python -I scripts/data/export_hero.py         # home hero: S2 dry-season composites of both deltas -> public/img/hero-*.webp + hero.json
```

GEE project: `claudev1-503808` (auth works locally). Push to `main` deploys via `.github/workflows/deploy.yml` (runs `npm test`, then `withastro/action`), once the GitHub repo `quanta1985/rs-agri` exists (not created yet).

### Deploy targets (planned, not done yet)

- GitHub Pages `https://quanta1985.github.io/rs-agri/` (default `base: '/rs-agri'`).
- Homepage copy `http://remosat.usth.edu.vn/~quanta/rs-agri/`: same procedure as rs-knowledge (see its CLAUDE.md, "Deploy to the homepage"), with `SITE_BASE=/~quanta/rs-agri` and folder `rs-agri`.
- Push / deploy only when the user asks; when they say "push", ask or do both targets.

### Environment gotchas (Windows)

- `-I` drops the script dir from `sys.path` and ignores `PYTHONIOENCODING`: scripts call `sys.stdout.reconfigure(encoding="utf-8")`. Lab generators (later) must run WITHOUT `-I` (they import `scripts/labkit.py`).
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
- ĐBSH is very cloudy Jan–Apr (spring rice season): use Sentinel-1 there. Clearest optical windows: ĐBSCL Jan–Mar, ĐBSH Oct–Dec.
- Sentinel-1: only S1A in 2022–2024 (12-day repeat per orbit), S1C from 2025. Average σ0 in linear power, then dB.
- Export region-scale layers in **EPSG:3857** so MapLibre image quads are exact (no lat/lon warp).

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
- **Islands kept from rs-knowledge**: `MapStage.tsx` (MapLibre GL, Esri imagery / Light Gray basemaps, keyless; NO CARTO; `SOVEREIGN` labels; `onMap` escape hatch for GeoJSON; raster overlays as image sources on a corner `Quad`), `VizUi.tsx` (`StatPanel`, `Pills`, `Slider`, `Key`), `LineChart.tsx`, `Predict.tsx`, `Quiz.tsx`. Not yet copied (copy when needed): `FormulaTable`, `LabIndex` data, `labkit.py`, `WorkedExample`.
- **Pure math** in `src/lib/` with `.test.ts` each: `raster.ts` (indices, stretch, histogram, Otsu, colormaps), `chart.ts`, `geo.ts` (UTM inverse, quads, lonLat→pixel), `sar.ts` (dB, speckle filter), `change.ts` (OLS, Theil–Sen, breakpoint).
- **Planned (step 2 of PLAN.md)**: region layer format `public/data/<layer>/meta.json + values.u8z|u16z` (EPSG:3857 grid, scale/offset/nodata, units, palette, time list, provenance), `DeltaMap.tsx` (region/layer picker, time slider, swipe compare, hover value, legend, province lines), `SeriesChart.tsx`, `ThresholdLab.tsx`.

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

**Step 1 done (2026-11-15): skeleton.** `git init` done, nothing committed yet (no GitHub repo).
- Copied from rs-knowledge: config, deploy workflow, components (minus `WorkedExample`), layout, pages, i18n, styles, 5 islands, 5 lib modules + 4 test files. Renamed base/repo to `rs-agri`, license CC-BY-NC-4.0.
- New: 16-chapter roadmap with `PARTS` A–D (ribbon + home generalised from 3 hard-coded parts), new title/tagline/footer, rice-and-water logo (`AppBar.astro` + `public/favicon.svg`, same paths), home hero from real data (`export_hero.py`: Mekong Jan–Mar 2024, 378 S2 scenes; Red River Oct–Dec 2023, 154 scenes; B11/B8/B4).
- Checks: 26/26 unit tests, type check clean, build OK (only "collection chapters is empty" warnings until the first MDX exists). Home page vi/en × light/dark × 1440/390 px: no console errors, no horizontal overflow.
- Next: step 2 (region layer format + `DeltaMap`, `SeriesChart`, `ThresholdLab`).
