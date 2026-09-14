import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { feature, merge } from "topojson-client";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const topology = JSON.parse(await readFile(`${ROOT}/data/regions.topojson`, "utf8"));
const object = topology.objects.ru89;
const collection = feature(topology, object);
const ids = collection.features.map(region => region.properties.id);
const expectedNew = ["crimea", "sevastopol", "dnr", "lnr", "zaporozhye", "kherson"];
const requiredAdjacencies = [
  ["dnr", "lnr"],
  ["dnr", "rostov"],
  ["lnr", "rostov"],
  ["dnr", "zaporozhye"],
  ["zaporozhye", "kherson"],
  ["kherson", "crimea"]
];

if (collection.features.length !== 89) throw new Error(`Expected 89 regions, found ${collection.features.length}`);
if (new Set(ids).size !== ids.length) throw new Error("Region IDs are not unique");
for (const id of expectedNew) {
  if (!ids.includes(id)) throw new Error(`Missing required region: ${id}`);
}
for (const region of collection.features) {
  if (!region.geometry || !["Polygon", "MultiPolygon"].includes(region.geometry.type)) {
    throw new Error(`Invalid geometry for ${region.properties.id}`);
  }
  for (const required of ["id", "name", "name_full", "capital", "clon", "clat", "fd", "fd_full", "type", "new2022"]) {
    if (!(required in region.properties)) throw new Error(`Missing ${required} for ${region.properties.id}`);
  }
}

function arcIndexes(value, result = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) arcIndexes(item, result);
  } else if (Number.isInteger(value)) {
    result.add(value < 0 ? ~value : value);
  }
  return result;
}

const geometryById = new Map(object.geometries.map(geometry => [geometry.properties.id, geometry]));
for (const [firstId, secondId] of requiredAdjacencies) {
  const firstArcs = arcIndexes(geometryById.get(firstId).arcs);
  const secondArcs = arcIndexes(geometryById.get(secondId).arcs);
  if (![...firstArcs].some(arc => secondArcs.has(arc))) {
    throw new Error(`Expected ${firstId} and ${secondId} to share a topological boundary`);
  }
}

const outline = merge(topology, object.geometries);
if (!outline.coordinates.length) throw new Error("Merged country outline is empty");

const wrapper = await readFile(`${ROOT}/data/regions.topojson.js`, "utf8");
if (wrapper !== `window.RU_TOPO=${JSON.stringify(topology)};\n`) throw new Error("JavaScript wrapper is out of sync");

console.log(`Verified ${collection.features.length} regions, ${topology.arcs.length} arcs, and a merged ${outline.type} outline.`);
