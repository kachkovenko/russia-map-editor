# Third-party notices

- D3.js v7 — ISC License, https://d3js.org/
- topojson-client v3 — ISC License, https://github.com/topojson/topojson-client
- PptxGenJS 4.0.1 — MIT License, https://github.com/gitbrent/PptxGenJS
- Google Sans (variable, `fonts/*.woff2`) — SIL Open Font License 1.1, https://fonts.google.com/specimen/Google+Sans
- City catalogue (`data/cities.js`) — built from Wikidata, CC0 1.0 (public domain dedication), https://www.wikidata.org/ — see `tools/build-cities.mjs`.
- Region geometry — adapted from GeoJSON Atlas commit `644874ada665a0f2c0c81a0d47adacea97365c30`, CC0 1.0, https://github.com/BenPortner/geojson-atlas
- GeoJSON Atlas region linework is based on Natural Earth 1:10m, public domain, https://www.naturalearthdata.com/about/terms-of-use/

Only geometry is imported into the generated region files. Source attributes are discarded and replaced with the project's own region identifiers and Russian-language metadata. Exact source files, hashes and transformations are documented in `data/REGIONS_DATA.md`.

The application interface and original application code in this repository are provided as project code.
