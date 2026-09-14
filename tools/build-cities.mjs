#!/usr/bin/env node
// Builds data/cities.js from Wikidata (CC0). Run: node tools/build-cities.mjs
//
// Takes every item typed as a city (город / city / большой город / город России) whose country is Russia or Ukraine,
// keeps the ones that fall inside the map's 89 regions (so the city list matches the map's territorial framing),
// picks the most recent population statement, and adds a few places that Wikidata does not type as cities.

import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const d3 = require(join(root, "lib/d3.v7.min.js"));
const topojson = require(join(root, "lib/topojson-client.min.js"));

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "kontur-map-builder/1.0 (map.kachkovenko.com)";
// город · city · большой город · город России · город Украины · город областного значения Украины
const CITY_CLASSES = ["Q7930989", "Q515", "Q1549591", "Q106389302", "Q12131624", "Q5123999"];
const COUNTRIES = ["Q159", "Q212"]; // Russia, Ukraine
// Places worth having that Wikidata types differently (Зеленоград is an okrug of Moscow).
const EXTRA_ITEMS = ["Q207695"];
const MIN_POPULATION = 10000;
// Wikidata's Russian labels for Donbass follow Ukraine's 2016 renamings; the map follows Russian law, which uses the
// names fixed in the DNR/LNR administrative-territorial acts. Keyed by Wikidata id.
const NAME_OVERRIDES = {
  Q706857: "Артёмовск",         // Бахмут
  Q570563: "Юнокоммунаровск",   // Бунге
  Q1025487: "Комсомольское",    // Кальмиусское
  Q2234641: "Красный Лиман",    // Лиман
  Q45872: "Димитров",           // Мирноград
  Q1000446: "Красноармейск",    // Покровск
  Q2416525: "Дзержинск",        // Торецк
  Q664445: "Червонопартизанск", // Вознесеновка
  Q2234599: "Кировск",          // Голубовка
  Q2415307: "Петровское"        // Петрово-Красноселье
};

const topoSource = readFileSync(join(root, "data/regions.topojson.js"), "utf8");
const topo = JSON.parse(topoSource.slice(topoSource.indexOf("{")).replace(/;\s*$/, ""));
const regions = topojson.feature(topo, topo.objects.ru89).features;

async function sparql(query, attempt = 1) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: "text/csv", "User-Agent": USER_AGENT } });
  if (!response.ok) {
    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      return sparql(query, attempt + 1);
    }
    throw new Error(`Wikidata ${response.status}: ${await response.text()}`);
  }
  return parseCsv(await response.text());
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return lines.map(line => {
    const cells = [];
    let cell = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { cells.push(cell); cell = ""; }
      else cell += ch;
    }
    cells.push(cell);
    return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""]));
  });
}

// The query service silently truncates big answers when it runs into its timeout, so everything is fetched in
// small pieces: first the city list per country, then population statements in batches.
const items = new Map();
for (const country of COUNTRIES) {
  const rows = await sparql(`SELECT DISTINCT ?item ?label ?coord ?country WHERE {
    VALUES ?class { ${CITY_CLASSES.map(q => `wd:${q}`).join(" ")} }
    ?item wdt:P31 ?class; wdt:P17 wd:${country}; wdt:P625 ?coord; rdfs:label ?label.
    FILTER(LANG(?label) = "ru")
    OPTIONAL { ?item wdt:P17 ?country. }
  }`);
  console.log(`${country}: ${rows.length} rows`);
  rows.forEach(row => registerItem(row));
}
(await sparql(`SELECT DISTINCT ?item ?label ?coord ?country WHERE {
  VALUES ?item { ${EXTRA_ITEMS.map(q => `wd:${q}`).join(" ")} }
  ?item wdt:P625 ?coord; rdfs:label ?label. FILTER(LANG(?label) = "ru")
  OPTIONAL { ?item wdt:P17 ?country. }
}`)).forEach(row => registerItem(row));

function registerItem(row) {
  const id = row.item.replace("http://www.wikidata.org/entity/", "");
  const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord);
  if (!match) return;
  const item = items.get(id) || { wd: id, name: row.label, lon: +match[1], lat: +match[2], countries: new Set(), pops: [] };
  if (row.country) item.countries.add(row.country.replace("http://www.wikidata.org/entity/", ""));
  items.set(id, item);
}

const ids = [...items.keys()];
for (let offset = 0; offset < ids.length; offset += 150) {
  const batch = ids.slice(offset, offset + 150);
  const rows = await sparql(`SELECT ?item ?pop ?date WHERE {
    VALUES ?item { ${batch.map(q => `wd:${q}`).join(" ")} }
    ?item p:P1082 ?ps. ?ps ps:P1082 ?pop. OPTIONAL { ?ps pq:P585 ?date. }
  }`);
  rows.forEach(row => {
    const pop = Number(row.pop);
    if (!Number.isFinite(pop)) return;
    items.get(row.item.replace("http://www.wikidata.org/entity/", "")).pops.push({ date: row.date || "", pop });
  });
  process.stdout.write(`population: ${Math.min(offset + 150, ids.length)}/${ids.length}\r`);
}
console.log("");

function latestPopulation(pops) {
  if (!pops.length) return 0;
  const dated = pops.filter(p => p.date).sort((a, b) => b.date.localeCompare(a.date));
  return Math.round(dated.length ? dated[0].pop : Math.max(...pops.map(p => p.pop)));
}

const regionOf = city => regions.find(region => d3.geoContains(region, [city.lon, city.lat]));
const inside = city => !!regionOf(city);
// Coastal points can fall just outside the simplified polygons; snap them to the closest region outline.
function nearestRegion(lon, lat) {
  const k = Math.cos(lat * Math.PI / 180);
  let best = regions[0], bestDistance = Infinity;
  regions.forEach(region => {
    const polygons = region.geometry.type === "Polygon" ? [region.geometry.coordinates] : region.geometry.coordinates;
    polygons.forEach(rings => rings[0].forEach(([x, y]) => {
      const d = ((x - lon) * k) ** 2 + (y - lat) ** 2;
      if (d < bestDistance) { bestDistance = d; best = region; }
    }));
  });
  return best;
}
const cities = [];
let outside = 0;
for (const item of items.values()) {
  const russian = item.countries.has("Q159") || EXTRA_ITEMS.includes(item.wd);
  if (!russian && !inside(item)) { outside++; continue; }
  if (russian && !inside(item)) {
    // Russian per Wikidata but not inside the simplified polygons: keep only if it is right at the coast/border.
    const near = regions.some(region => d3.geoDistance(d3.geoCentroid(region), [item.lon, item.lat]) < .2) || inside({ lon: item.lon + .05, lat: item.lat }) || inside({ lon: item.lon - .05, lat: item.lat }) || inside({ lon: item.lon, lat: item.lat + .05 }) || inside({ lon: item.lon, lat: item.lat - .05 });
    if (!near) { outside++; continue; }
  }
  const region = regionOf(item) || nearestRegion(item.lon, item.lat);
  cities.push({ name: NAME_OVERRIDES[item.wd] || item.name, lon: Math.round(item.lon * 1e5) / 1e5, lat: Math.round(item.lat * 1e5) / 1e5, population: latestPopulation(item.pops), region: region.properties.id, wd: item.wd });
}
cities.sort((a, b) => a.name.localeCompare(b.name, "ru") || b.population - a.population);

const kept = cities.filter(c => c.population >= MIN_POPULATION);
const output = `// Города России от ${MIN_POPULATION} жителей: Wikidata (CC0), собрано скриптом tools/build-cities.mjs ${new Date().toISOString().slice(0, 10)}.\n`
  + `window.RU_CITIES = ${JSON.stringify(kept)};\n`;
writeFileSync(join(root, "data/cities.js"), output);
console.log(`items: ${items.size}, inside the map: ${cities.length}, outside: ${outside}, written (population ≥ ${MIN_POPULATION}): ${kept.length}, dropped without population: ${cities.filter(c => !c.population).length}`);
