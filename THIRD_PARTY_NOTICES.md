# Third-party notices

- D3.js 7.9.0 — ISC License, https://d3js.org/
- topojson-client 3.1.0 — ISC License, https://github.com/topojson/topojson-client
- PptxGenJS 4.0.1 — MIT License, https://github.com/gitbrent/PptxGenJS
- JSZip 3.10.1 (bundled inside `lib/pptxgen.bundle.js`, also used directly for the ZIP export) — MIT License, https://github.com/Stuk/jszip
- Label fonts, SIL Open Font License 1.1 (web subsets `fonts/<name>-*.woff2` served by Google Fonts; unmodified originals and `OFL.txt` in `fonts/pack/<name>/`, redistributed with exports as permitted by the OFL — bundled, never sold on their own):
  - Inter — Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
  - Golos Text (variable 400–700 web subsets; also the interface font) — Copyright 2019 The Golos Text Project Authors (https://github.com/googlefonts/golos-text)
  - Montserrat — Copyright 2024 The Montserrat.Git Project Authors (https://github.com/JulietaUla/Montserrat.git)
  - PT Sans — Copyright (c) 2010, ParaType Ltd. (http://www.paratype.com/public)
  - PT Serif — Copyright (c) 2010, ParaType Ltd. (http://www.paratype.com/public)
  - Unbounded — Copyright 2022 The Unbounded Project Authors (https://github.com/googlefonts/unbounded)
- City catalogue (`data/cities.js`) — built from Wikidata, CC0 1.0 (public domain dedication), https://www.wikidata.org/ — see `tools/build-cities.mjs`.
- Region geometry — adapted from GeoJSON Atlas commit `644874ada665a0f2c0c81a0d47adacea97365c30`, CC0 1.0, https://github.com/BenPortner/geojson-atlas
- World geometry and country names — the same GeoJSON Atlas CC0 source; pinned inputs, territorial adaptations and build procedure: `data/WORLD_DATA.md`.
- Major world cities — Natural Earth populated places 1:110m, public domain; version and SHA-256: `data/WORLD_DATA.md`.
- GeoJSON Atlas region linework is based on Natural Earth 1:10m, public domain, https://www.naturalearthdata.com/about/terms-of-use/
- Undo/redo, export and import icons (inline SVG paths in `index.html`) — Flaticon «undo-alt», «file-export», «file-import», used under the project author's Flaticon Premium licence (no attribution required, not redistributable as a standalone file). Forks and reuse of this code need their own licence for the icon or a replacement, https://www.flaticon.com/

Only geometry is imported into the generated region files. Source attributes are discarded and replaced with the project's own region identifiers and Russian-language metadata. Exact source files, hashes and transformations are documented in `data/REGIONS_DATA.md`.

The application interface and original application code in this repository are provided as project code.
