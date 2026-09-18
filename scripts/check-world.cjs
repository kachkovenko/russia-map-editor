const assert = require('node:assert/strict');
const d3 = require('../lib/d3.v7.min.js');
const topojson = require('../lib/topojson-client.min.js');
global.window={};require('../data/world.topojson.js');require('../data/world-cities.js');
const topo=window.WORLD_TOPO;
const features=topojson.feature(topo,topo.objects.countries).features;
assert.equal(features.length,258);
assert.equal(new Set(features.map(f=>f.properties.id)).size,258);
const ru=features.find(f=>f.properties.code==='RUS'), ua=features.find(f=>f.properties.code==='UKR');
for(const point of [[34.1,44.95],[33.6,44.55],[37.8,48],[39.3,48.57],[35.14,47.84],[32.62,46.64]]){
  assert(d3.geoContains(ru,point),`Russian framing missing ${point}`);
  assert(!d3.geoContains(ua,point),`Overlapping Ukraine geometry at ${point}`);
}
assert(d3.geoContains(ua,[30.52,50.45]));
for(const f of features)assert(d3.geoArea(f)>0&&d3.geoArea(f)<4*Math.PI);
for(const projection of [d3.geoEqualEarth(),d3.geoMercator(),d3.geoOrthographic().rotate([-35,-25])]){
  const path=d3.geoPath(projection);
  for(const f of features)assert(!/NaN|Infinity/.test(path(f)||''));
}
assert.equal(window.WORLD_CITIES.length,243);
assert.equal(new Set(window.WORLD_CITIES.map(c=>c.id)).size,243);
for(const c of window.WORLD_CITIES)assert(Number.isFinite(c.lon)&&Number.isFinite(c.lat)&&Math.abs(c.lat)<=90&&Math.abs(c.lon)<=180);
for(const name of ['Лондон','Каир','Сидней'])assert(window.WORLD_CITIES.some(c=>c.name===name));
console.log('Verified 258 world features, territorial framing without overlap, 3 projections and 243 world cities.');
