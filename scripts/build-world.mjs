import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { topology } from 'topojson-server';
import { merge } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';

const root = fileURLToPath(new URL('..', import.meta.url));
const d3 = createRequire(import.meta.url)('../lib/d3.v7.min.js');
const commit = '644874ada665a0f2c0c81a0d47adacea97365c30';
const base = `https://raw.githubusercontent.com/BenPortner/geojson-atlas/${commit}/geojson/natural_earth`;
const sources = [
  ['world-10m', 'world/10m/ne_10m_admin_0_countries.geojson', '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255'],
  ['ru-source', 'countries/10m/RU.geojson', '621678eccae50ce593e7915ec2eaaf969ec3fca0fafbb86cdc3cd29451202742'],
  ['ua-source', 'countries/10m/UA.geojson', '0ed01e3fa56e899f9813395020a2097cd727fe0854dcc5b8811b3005cd97069d']
];
const local = process.argv.indexOf('--source-dir');
const datasets = await Promise.all(sources.map(async ([name, path, hash]) => {
  let bytes;
  if (local >= 0) bytes = await readFile(join(process.argv[local + 1], `map-${name}.geojson`));
  else { const r = await fetch(`${base}/${path}`); if (!r.ok) throw Error(`Download ${r.status}: ${path}`); bytes = Buffer.from(await r.arrayBuffer()); }
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error(`Source checksum mismatch: ${name}`);
  return JSON.parse(bytes);
}));
const [world, ru, ua] = datasets;
const annexed = new Set(['UA-09','UA-14','UA-23','UA-65']);
// Same territorial framing as ru89. This is a presentation convention, not a claim of international recognition.
const parts = [...ru.features, ...ua.features];
const partsTopo = topology({parts: {type:'FeatureCollection', features:parts}});
const partsGeometry = partsTopo.objects.parts.geometries;
const ruGeometry = merge(partsTopo, partsGeometry.filter((g,i) => i < ru.features.length || annexed.has(g.properties.iso_3166_2)));
const uaGeometry = merge(partsTopo, partsGeometry.filter((g,i) => i >= ru.features.length && !annexed.has(g.properties.iso_3166_2)));
const continents = {Asia:'Азия',Europe:'Европа',Africa:'Африка','North America':'Северная Америка','South America':'Южная Америка',Oceania:'Океания',Antarctica:'Антарктида','Seven seas (open ocean)':'Островные территории'};
const features = world.features.map(f => {
  const p = f.properties, code = p.ADM0_A3;
  return {type:'Feature', properties:{id:`country-${code.toLowerCase()}`,name:code==='GBR'?'Великобритания':p.NAME_RU || p.NAME, capital:continents[p.CONTINENT] || p.CONTINENT, fd:'', type:'Страна / территория', code, lon:p.LABEL_X, lat:p.LABEL_Y}, geometry:code==='RUS'?ruGeometry:code==='UKR'?uaGeometry:f.geometry};
});
if(new Set(features.map(f=>f.properties.id)).size!==features.length) throw Error('Duplicate country IDs');
let output=topology({countries:{type:'FeatureCollection',features}},1000000);
output=presimplify(output);
// Preserve tiny states and island territories: a global simplification threshold can erase their whole polygon.
output.objects.countries.geometries.forEach((g,i)=>{
  if(d3.geoArea(features[i])>=.0001) return;
  for(const index of g.arcs.flat(Infinity)) for(const point of output.arcs[index<0?~index:index]) point[2]=Infinity;
});
output=simplify(output,quantile(output,.06));
const json=JSON.stringify(output);
await writeFile(join(root,'data/world.topojson.js'),`// GeoJSON Atlas CC0; see WORLD_DATA.md.\nwindow.WORLD_TOPO=${json};\n`);
console.log(`Built ${features.length} countries/territories; ${Buffer.byteLength(json)} bytes.`);
