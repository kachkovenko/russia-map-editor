# World geometry

Source: [GeoJSON Atlas](https://github.com/BenPortner/geojson-atlas), **CC0-1.0**, pinned commit `644874ada665a0f2c0c81a0d47adacea97365c30`; based on Natural Earth 1:10m, public domain. The generated dataset and the project's added metadata are dedicated to CC0-1.0.

The build imports polygon geometry, Russian names, administrative identifiers, continent names and label coordinates. It strips unrelated upstream attributes. It builds shared TopoJSON arcs and simplifies them for presentation-scale rendering, preserving arcs of small states/island territories to prevent their disappearance. The UK display name is normalised to «Великобритания». The catalogue contains countries **and dependent/disputed territories**, not a claim that every selectable polygon is a sovereign state.

Inputs under `geojson/natural_earth/`:

| File | SHA-256 |
| --- | --- |
| `world/10m/ne_10m_admin_0_countries.geojson` | `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255` |
| `countries/10m/RU.geojson` | `621678eccae50ce593e7915ec2eaaf969ec3fca0fafbb86cdc3cd29451202742` |
| `countries/10m/UA.geojson` | `0ed01e3fa56e899f9813395020a2097cd727fe0854dcc5b8811b3005cd97069d` |

## Territorial convention

Russia and Ukraine are rebuilt from the same admin-1 inputs used by this project's Russian map: Crimea, Sevastopol, Donetsk, Lugansk, Zaporozhye and Kherson are included in the Russian geometry in accordance with the project's Russian-law framing. The corresponding geometries are excluded from the Ukraine feature, not painted over it. Their status and borders are internationally disputed. Other boundaries follow the source dataset. This is not an official or legal boundary dataset.

Rebuild with `npm run build:world`. Downloads are checked against SHA-256; no runtime API is used. For already downloaded, verified inputs use `node scripts/build-world.mjs --source-dir <directory>` with filenames `map-world-10m.geojson`, `map-ru-source.geojson`, `map-ua-source.geojson`.

## Major world cities

`world-cities.js` is built from [Natural Earth populated places 1:110m](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_populated_places.geojson), public domain under [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/). SHA-256: `a86028b083182b68c7620fc6e1a8a47ee547cb9cd2fb62ccbb78bea786440899`. Build: `node scripts/build-world-cities.mjs`, or pass a downloaded source filename. Russian names, coordinates, catalogue IDs, country IDs, capital flags and population ranks are imported. Populations are used for label priority, not presented as current statistics. This is a curated 243-place overview catalogue, not every city on Earth. The app combines it with the Russian catalogue and removes duplicates; source points with no matching country feature are omitted. The two local files are loaded without runtime API requests.
