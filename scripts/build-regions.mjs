import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_COMMIT = "644874ada665a0f2c0c81a0d47adacea97365c30";
const SOURCE_ROOT = `https://raw.githubusercontent.com/BenPortner/geojson-atlas/${SOURCE_COMMIT}/geojson/natural_earth/countries/10m`;
const SOURCES = {
  ru: {
    filename: "RU.geojson",
    url: `${SOURCE_ROOT}/RU.geojson`,
    sha256: "621678eccae50ce593e7915ec2eaaf969ec3fca0fafbb86cdc3cd29451202742"
  },
  ua: {
    filename: "UA.geojson",
    url: `${SOURCE_ROOT}/UA.geojson`,
    sha256: "0ed01e3fa56e899f9813395020a2097cd727fe0854dcc5b8811b3005cd97069d"
  }
};

// Natural Earth uses ISO-like source identifiers. They are used only to find
// geometry; none of the source attributes are copied into the distributable.
const SOURCE_BY_ID = {
  "adygea": ["ru", "RU-AD"],
  "altai-rep": ["ru", "RU-AL"],
  "altai-kray": ["ru", "RU-ALT"],
  "amur": ["ru", "RU-AMU"],
  "arkhangelsk": ["ru", "RU-ARK"],
  "astrakhan": ["ru", "RU-AST"],
  "bashkortostan": ["ru", "RU-BA"],
  "belgorod": ["ru", "RU-BEL"],
  "bryansk": ["ru", "RU-BRY"],
  "buryatia": ["ru", "RU-BU"],
  "chechnya": ["ru", "RU-CE"],
  "chelyabinsk": ["ru", "RU-CHE"],
  "chukotka": ["ru", "RU-CHU"],
  "chuvashia": ["ru", "RU-CU"],
  "dagestan": ["ru", "RU-DA"],
  "ingushetia": ["ru", "RU-IN"],
  "irkutsk": ["ru", "RU-IRK"],
  "ivanovo": ["ru", "RU-IVA"],
  "kamchatka": ["ru", "RU-KAM"],
  "kabardino-balkaria": ["ru", "RU-KB"],
  "karachay-cherkessia": ["ru", "RU-KC"],
  "krasnodar": ["ru", "RU-KDA"],
  "kemerovo": ["ru", "RU-KEM"],
  "kaliningrad": ["ru", "RU-KGD"],
  "kurgan": ["ru", "RU-KGN"],
  "khabarovsk": ["ru", "RU-KHA"],
  "khmao": ["ru", "RU-KHM"],
  "kirov": ["ru", "RU-KIR"],
  "khakassia": ["ru", "RU-KK"],
  "kalmykia": ["ru", "RU-KL"],
  "kaluga": ["ru", "RU-KLU"],
  "komi": ["ru", "RU-KO"],
  "kostroma": ["ru", "RU-KOS"],
  "karelia": ["ru", "RU-KR"],
  "kursk": ["ru", "RU-KRS"],
  "krasnoyarsk": ["ru", "RU-KYA"],
  "leningrad": ["ru", "RU-LEN"],
  "lipetsk": ["ru", "RU-LIP"],
  "magadan": ["ru", "RU-MAG"],
  "mari-el": ["ru", "RU-ME"],
  "mordovia": ["ru", "RU-MO"],
  "moscow": ["ru", "RU-MOS"],
  "moscow-oblast": ["ru", "RU-MOW"],
  "murmansk": ["ru", "RU-MUR"],
  "nenets": ["ru", "RU-NEN"],
  "novgorod": ["ru", "RU-NGR"],
  "nizhny-novgorod": ["ru", "RU-NIZ"],
  "novosibirsk": ["ru", "RU-NVS"],
  "omsk": ["ru", "RU-OMS"],
  "orenburg": ["ru", "RU-ORE"],
  "oryol": ["ru", "RU-ORL"],
  "perm": ["ru", "RU-PER"],
  "penza": ["ru", "RU-PNZ"],
  "primorsky": ["ru", "RU-PRI"],
  "pskov": ["ru", "RU-PSK"],
  "rostov": ["ru", "RU-ROS"],
  "ryazan": ["ru", "RU-RYA"],
  "sakha": ["ru", "RU-SA"],
  "sakhalin": ["ru", "RU-SAK"],
  "samara": ["ru", "RU-SAM"],
  "saratov": ["ru", "RU-SAR"],
  "north-ossetia": ["ru", "RU-SE"],
  "smolensk": ["ru", "RU-SMO"],
  "spb": ["ru", "RU-SPE"],
  "stavropol": ["ru", "RU-STA"],
  "sverdlovsk": ["ru", "RU-SVE"],
  "tatarstan": ["ru", "RU-TA"],
  "tambov": ["ru", "RU-TAM"],
  "tomsk": ["ru", "RU-TOM"],
  "tula": ["ru", "RU-TUL"],
  "tver": ["ru", "RU-TVE"],
  "tuva": ["ru", "RU-TY"],
  "tyumen": ["ru", "RU-TYU"],
  "udmurtia": ["ru", "RU-UD"],
  "ulyanovsk": ["ru", "RU-ULY"],
  "volgograd": ["ru", "RU-VGG"],
  "vladimir": ["ru", "RU-VLA"],
  "vologda": ["ru", "RU-VLG"],
  "voronezh": ["ru", "RU-VOR"],
  "yamalo-nenets": ["ru", "RU-YAN"],
  "yaroslavl": ["ru", "RU-YAR"],
  "jewish-ao": ["ru", "RU-YEV"],
  "zabaykalsky": ["ru", "RU-ZAB"],
  "crimea": ["ru", "UA-43"],
  "sevastopol": ["ru", "UA-40"],
  "lnr": ["ua", "UA-09"],
  "dnr": ["ua", "UA-14"],
  "zaporozhye": ["ua", "UA-23"],
  "kherson": ["ua", "UA-65"]
};

async function downloadAndVerify(source, directory) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== source.sha256) {
    throw new Error(`SHA-256 mismatch for ${source.filename}: expected ${source.sha256}, got ${actualHash}`);
  }
  const path = join(directory, source.filename);
  await writeFile(path, bytes);
  return JSON.parse(bytes.toString("utf8"));
}

const metadata = JSON.parse(await readFile(join(ROOT, "data/regions.metadata.json"), "utf8"));
if (metadata.length !== 89) throw new Error(`Expected 89 metadata records, found ${metadata.length}`);
if (new Set(metadata.map(region => region.id)).size !== metadata.length) throw new Error("Region IDs are not unique");
if (Object.keys(SOURCE_BY_ID).length !== metadata.length) throw new Error("Source mapping must contain exactly 89 records");

const workingDirectory = await mkdtemp(join(tmpdir(), "russia-map-regions-"));
const downloaded = Object.fromEntries(await Promise.all(
  Object.entries(SOURCES).map(async ([key, source]) => [key, await downloadAndVerify(source, workingDirectory)])
));
const indexes = Object.fromEntries(Object.entries(downloaded).map(([key, collection]) => [
  key,
  new Map(collection.features.map(feature => [feature.properties.iso_3166_2, feature]))
]));

const features = metadata.map(properties => {
  const sourceKey = SOURCE_BY_ID[properties.id];
  if (!sourceKey) throw new Error(`No source mapping for ${properties.id}`);
  const [dataset, sourceId] = sourceKey;
  const sourceFeature = indexes[dataset].get(sourceId);
  if (!sourceFeature) throw new Error(`No ${dataset} geometry ${sourceId} for ${properties.id}`);
  return {
    type: "Feature",
    id: properties.id,
    properties,
    geometry: structuredClone(sourceFeature.geometry)
  };
});

const collection = { type: "FeatureCollection", features };
let output = topology({ ru89: collection }, 100000);
output = presimplify(output);
// Keep the most significant share of intermediate points (`--detail 0.3` = 30 %, by Visvalingam weight; the
// quantile helper sorts weights descending, so the share maps to p directly). Endpoints and shared boundaries remain
// intact, which keeps small federal cities usable. 0.08 gave 340 KB and visibly straight coastlines at 4× zoom.
const detailFlag = process.argv.indexOf("--detail");
const DETAIL = detailFlag >= 0 ? Number(process.argv[detailFlag + 1]) : 0.2;
output = simplify(output, quantile(output, DETAIL));
console.log(`Detail: kept ${Math.round(DETAIL * 100)}% of intermediate points.`);

const json = JSON.stringify(output);
await writeFile(join(ROOT, "data/regions.topojson"), `${json}\n`);
await writeFile(join(ROOT, "data/regions.topojson.js"), `window.RU_TOPO=${json};\n`);
await rm(workingDirectory, { recursive: true, force: true });

console.log(`Built ${features.length} regions from GeoJSON Atlas commit ${SOURCE_COMMIT}.`);
console.log(`Output: ${Buffer.byteLength(json)} bytes; ${output.arcs.length} shared arcs.`);
