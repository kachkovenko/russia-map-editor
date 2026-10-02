"use strict";

// Map links (#regions=…&cities=…): name matching against the real region, country and city catalogues.
const assert = require("node:assert/strict");
const { fromParams, readParams } = require("../lib/map-link.js");

global.window = {};
require("../data/cities.js");
require("../data/world.topojson.js");
require("../data/world-cities.js");
const metadata = require("../data/regions.metadata.json");

const russianCities = window.RU_CITIES.map(c => ({ id: `${c.name}-${c.wd}`, name: c.name, population: c.population, regionId: c.region }));
const countries = window.WORLD_TOPO.objects.countries.geometries.map(g => g.properties);
const ctx = {
  defaults: { mapScope: "russia", mapStyle: "atlas", projection: "conic", routeMode: "off", routeHub: "", selectedColor: "#ff5f46", borders: true, borderWidth: .8, fillStart: "#3b5f8a", gradientStart: 0, gradientEnd: 100, graticuleStep: 10 },
  settingKeys: ["mapScope", "mapStyle", "projection", "routeMode", "routeHub", "selectedColor", "borders", "borderWidth", "fillStart", "gradientStart", "gradientEnd", "graticuleStep"],
  spec: {
    booleans: new Set(["borders"]), colors: new Set(["selectedColor", "fillStart"]),
    ranges: { borderWidth: [.2, 4], gradientStart: [0, 100], gradientEnd: [0, 100] },
    enums: { mapScope: ["russia", "world"], mapStyle: ["atlas", "mosaic"], projection: ["conic", "mercator", "globe"], routeMode: ["off", "hub", "network", "chain"], graticuleStep: [10, 5] }
  },
  themes: [{ id: "dark", name: "Тёмная", colors: { selectedColor: "#f5a524" } }],
  catalogues: {
    russia: { regions: metadata, cities: russianCities },
    world: {
      regions: countries,
      cities: [...russianCities.map(c => ({ ...c, regionId: "country-rus" })), ...window.WORLD_CITIES.map(c => ({ ...c, regionId: c.country }))]
    }
  },
  parseProject: text => ({ parsed: JSON.parse(text) })
};
const open = query => fromParams(readParams("", query), ctx);

assert.equal(open("#top"), null, "an ordinary anchor is not a map");
assert.equal(open("?utm_source=x"), null, "tracking parameters are not a map");

// Every region is found by its short name, full name and id.
metadata.forEach(r => [r.id, r.name, r.name_full].forEach(name => {
  const { project, problems } = open(`#regions=${encodeURIComponent(name)}`);
  assert.deepEqual([problems, project.regions], [[], [r.id]], `region «${name}»`);
}));
countries.forEach(c => [c.name, c.code].forEach(name => {
  const { project, problems } = open(`#scope=world&regions=${encodeURIComponent(name)}`);
  assert.deepEqual([problems, project.regions], [[], [c.id]], `country «${name}»`);
}));

let link = open("#regions=Свердловская,республика татарстан,ХМАО,Питер,Sverdlovsk oblast,Нижегор,Нарния&cities=Казань,Москва,Кировск (Ленинградская),Атлантида");
assert.deepEqual(link.project.regions, ["sverdlovsk", "tatarstan", "khmao", "spb", "nizhny-novgorod"]);
assert.deepEqual(link.problems, ["Нарния", "Атлантида"]);
assert.equal(link.project.cities.length, 3);
assert.equal(russianCities.find(c => c.id === link.project.cities[2]).regionId, "leningrad", "qualified namesake");
assert.equal(link.project.settings.mapScope, "russia");

link = open("#regions=ЦФО");
assert.equal(link.project.regions.length, metadata.filter(r => r.fd === "ЦФО").length, "federal district expands");

link = open("#regions=Франция,Германия&cities=Париж,Москва");
assert.equal(link.project.settings.mapScope, "world", "a world-only list opens the world map");
assert.deepEqual(link.problems, []);

link = open("#colors=Татарстан:f00;Москва:%2300ff00&values=Тыва:1,5;Коми:3;Чечня:x&valueColors=ffffff,000000");
assert.deepEqual(link.project.regionColors, { tatarstan: "#ff0000", moscow: "#00ff00", tuva: "#ffffff", komi: "#000000" });
assert.deepEqual(link.project.regions.sort(), ["komi", "moscow", "tatarstan", "tuva"]);
assert.deepEqual(link.problems, ["Чечня: x"]);

link = open("#theme=тёмная&style=мозаика&projection=глобус&route=цепочка&hub=Казань&borders=нет&borderWidth=9&gradientStart=80&gradientEnd=20&graticuleStep=5&fillStart=abc&foo=1&selectedColor=red");
const s = link.project.settings;
assert.deepEqual([s.mapStyle, s.projection, s.routeMode, s.borders, s.borderWidth, s.gradientStart, s.gradientEnd, s.graticuleStep, s.fillStart, s.selectedColor],
  ["mosaic", "globe", "chain", false, 4, 20, 80, 5, "#aabbcc", "#f5a524"]);
assert.ok(s.routeHub && link.project.cities.includes(s.routeHub), "hub city is resolved and marked");
assert.deepEqual(link.problems, ["selectedColor=red", "параметр «foo»"]);

const json = JSON.stringify({ format: "x", n: "ё" });
assert.deepEqual(open(`#p=${Buffer.from(json).toString("base64url")}`).project, { parsed: JSON.parse(json) }, "base64url project");
assert.deepEqual(open(`#p=${encodeURIComponent(json)}`).project, { parsed: JSON.parse(json) }, "plain JSON project");
assert.throws(() => open(`#regions=${"а".repeat(70000)}`), /длинная/);
assert.throws(() => open("#p=@@@"), /повреждён/);

// Every example in llms.txt opens without unrecognised names or values.
const examples = require("node:fs").readFileSync(require("node:path").join(__dirname, "../llms.txt"), "utf8")
  .match(/https:\/\/map\.kachkovenko\.com\/#[^\s`)]+/g).filter(url => !url.includes("…") && !url.includes("#p="));
assert.ok(examples.length >= 5, "llms.txt has examples");
const known = new Set(["regionLabels", "regionLabelsMode", "frame"]);
examples.forEach(url => {
  const link = open(url.slice(url.indexOf("#")));
  const problems = link.problems.filter(p => ![...known].some(key => p === `параметр «${key}»`));
  assert.deepEqual(problems, [], url);
  assert.ok(link.project.regions.length || link.project.cities.length, url);
});

console.log(`Verified map links: ${metadata.length} regions and ${countries.length} countries by name, nicknames, districts, cities, colours, values and settings.`);
