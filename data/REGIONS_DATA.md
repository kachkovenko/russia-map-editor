# Region geometry: source, build and licence

## Result

`regions.topojson` and `regions.topojson.js` contain 89 presentation-scale region geometries. The two files contain the same TopoJSON payload; the JavaScript variant assigns it to `window.RU_TOPO` for direct, offline use by the editor.

The region names and composition follow [Article 65 of the Constitution of the Russian Federation](https://ips.pravo.gov.ru/api/ips/legislation/document?baseid=None&hash=c9693d70b5bc11c97f515e288930b34815497eab8f08a7ad32eaab319b6d262a). Crimea, Sevastopol, the Donetsk and Lugansk People's Republics, and the Zaporozhye and Kherson regions are represented according to Russian law. Their status and borders are internationally disputed. The geometry is generalised and is not an official, cadastral or legally significant boundary description.

## Geometry source

All geometry comes from GeoJSON Atlas, which publishes its maps under Creative Commons Zero v1.0 Universal (CC0-1.0) and identifies Natural Earth as its sole geometry source:

- repository: https://github.com/BenPortner/geojson-atlas
- pinned commit: `644874ada665a0f2c0c81a0d47adacea97365c30`
- upstream Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/

Pinned inputs:

| File | SHA-256 |
| --- | --- |
| `geojson/natural_earth/countries/10m/RU.geojson` | `621678eccae50ce593e7915ec2eaaf969ec3fca0fafbb86cdc3cd29451202742` |
| `geojson/natural_earth/countries/10m/UA.geojson` | `0ed01e3fa56e899f9813395020a2097cd727fe0854dcc5b8811b3005cd97069d` |

## Transformation

The build script performs the following deterministic transformation:

1. Downloads the two pinned files and rejects either file if its SHA-256 differs.
2. Selects 85 subject geometries from `RU.geojson`. The unnamed `RUS+99?` technical island record is not treated as a subject.
3. Selects the Donetsk, Lugansk, Zaporozhye and Kherson first-level geometries from `UA.geojson`.
4. Discards every upstream attribute. Only polygon geometry is retained.
5. Adds the project's own stable IDs and Russian-language metadata from `regions.metadata.json`.
6. Builds quantised TopoJSON and simplifies shared arcs while preserving topology. By default the 20 % most significant intermediate points are kept (`--detail 0.2`, Visvalingam weight); 8 % used to be enough for the fitted map but left coastlines visibly polygonal at 4× zoom, 30 % starts to show the source's own micro-inlets as noise.
7. Checks the feature count, IDs, required properties, the six specifically represented regions, critical shared boundaries and the merged outer outline.

Run:

```bash
npm install
npm run build:regions
npm run check:regions
```

## Licence of the derived region data

To the extent that copyright or database rights exist in the generated region data and project-authored metadata, the project contributors make them available under the Creative Commons Zero v1.0 Universal dedication (CC0-1.0):

https://creativecommons.org/publicdomain/zero/1.0/

Attribution is not required by CC0, but the source information above should remain with redistributed copies whenever practical so the provenance can be audited.
