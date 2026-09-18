import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const commit='ca96624a56bd078437bca8184e78163e5039ad19';
const url=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/ne_110m_populated_places.geojson`;
const expected='a86028b083182b68c7620fc6e1a8a47ee547cb9cd2fb62ccbb78bea786440899';
let bytes;
if(process.argv[2]) bytes=await readFile(process.argv[2]);
else {const r=await fetch(url);if(!r.ok)throw Error(`Download ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());}
if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('City source checksum mismatch');
const cities=JSON.parse(bytes).features.map(f=>({id:`world-city-${f.properties.NE_ID}`,name:f.properties.NAME_RU||f.properties.NAME,lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1],population:f.properties.POP_MAX||0,country:`country-${f.properties.ADM0_A3.toLowerCase()}`,isCapital:!!f.properties.ADM0CAP}));
await writeFile(new URL('../data/world-cities.js',import.meta.url),`// Natural Earth public domain; see WORLD_DATA.md.\nwindow.WORLD_CITIES=${JSON.stringify(cities)};\n`);
console.log(`Built ${cities.length} major cities/capitals.`);
