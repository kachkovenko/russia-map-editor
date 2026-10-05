(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MapLink = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // A map described in the address, so that a person or an AI assistant can hand over a ready draft as a link:
  //   https://kachkovenko.github.io/russia-map-editor/#regions=Татарстан,Москва&cities=Казань&theme=dark
  // Names are matched loosely (case, ё, «область», abbreviations), so nobody needs the editor's internal ids.
  // The format is described for assistants in llms.txt. Everything here is pure: the editor passes its catalogues and
  // settings rules in, gets a project back and runs it through the same sanitising as an opened project file.

  const MAX_LINK_LENGTH = 64 * 1024;
  const IGNORED = /^(utm_|yclid$|gclid$|fbclid$)/;

  const ALIASES = Object.freeze({
    scope: "mapScope", map: "mapScope",
    style: "mapStyle",
    route: "routeMode", hub: "routeHub"
  });
  const LIST_KEYS = ["regions", "cities", "colors", "values", "valueColors", "theme", "p"];
  const VALUE_ALIASES = Object.freeze({
    mapScope: { "россия": "russia", "рф": "russia", "мир": "world", "весь мир": "world" },
    mapStyle: { "классика": "atlas", "мозаика": "mosaic", "classic": "atlas" },
    projection: { "атласная": "conic", "равновеликая": "conic", "меркатор": "mercator", "глобус": "globe" },
    routeMode: { "нет": "off", "лучи": "hub", "звезда": "hub", "сеть": "network", "цепочка": "chain", "маршрут": "chain" }
  });
  // Region names people and assistants actually write that the catalogue does not contain.
  const REGION_NICKNAMES = Object.freeze({
    "хмао": "khmao", "югра": "khmao", "янао": "yamalo-nenets", "нао": "nenets", "еао": "jewish-ao", "чао": "chukotka",
    "днр": "dnr", "лнр": "lnr", "якутия": "sakha", "спб": "spb", "питер": "spb", "петербург": "spb",
    "кузбасс": "kemerovo", "алания": "north-ossetia", "чечня": "chechnya", "подмосковье": "moscow-oblast",
    "мск": "moscow", "мо": "moscow-oblast", "башкирия": "bashkortostan", "удмуртия": "udmurtia",
    "st petersburg": "spb", "saint petersburg": "spb", "moscow city": "moscow"
  });
  // Words that may be left out of a region name: «Свердловская» and «Sverdlovsk oblast» both find Свердловская область.
  const TYPE_WORDS = new Set(["область", "обл", "край", "республика", "респ", "автономный", "автономная", "округ", "ао", "народная",
    "федерального", "значения", "город", "г", "oblast", "krai", "kray", "region", "republic", "of", "the", "autonomous", "okrug"]);

  function normalize(text) {
    return String(text).toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
  }

  function bare(text) {
    return normalize(text).split(" ").filter(word => !TYPE_WORDS.has(word)).join(" ");
  }

  function splitList(value) {
    const text = String(value || "");
    return text.split(text.includes(";") ? ";" : ",").map(item => item.trim()).filter(Boolean);
  }

  function hexColor(value) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
    if (!match) return null;
    const hex = match[1].length === 3 ? match[1].replace(/./g, ch => ch + ch) : match[1];
    return `#${hex.toLowerCase()}`;
  }

  function mix(from, to, t) {
    const a = parseInt(from.slice(1), 16), b = parseInt(to.slice(1), 16);
    const channel = shift => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, "0")).join("")}`;
  }

  // Name → ids for one catalogue (Russia or the world). Earlier entries win, so a region's own name beats a derived one.
  function regionIndex(regions) {
    const exact = new Map();
    const add = (key, id) => { const k = normalize(key); if (k && !exact.has(k)) exact.set(k, [id]); };
    regions.forEach(r => { add(r.id, r.id); if (r.code) add(r.code, r.id); add(r.name, r.id); if (r.name_full) add(r.name_full, r.id); });
    regions.forEach(r => { [r.name, r.name_full, r.id.replace(/-/g, " ")].filter(Boolean).forEach(name => add(bare(name), r.id)); });
    const ids = new Set(regions.map(r => r.id));
    Object.entries(REGION_NICKNAMES).forEach(([nick, id]) => { if (ids.has(id)) add(nick, id); });
    const districts = new Map();
    regions.forEach(r => {
      if (!r.fd) return;
      [r.fd, r.fd_full, r.fd_full && `${r.fd_full} федеральный округ`].filter(Boolean).forEach(key => {
        const k = normalize(key);
        if (!districts.has(k)) districts.set(k, []);
        districts.get(k).push(r.id);
      });
    });
    districts.forEach((list, k) => { if (!exact.has(k)) exact.set(k, list); });
    return exact;
  }

  function findRegions(index, query) {
    for (const key of [normalize(query), bare(query)]) {
      if (key && index.has(key)) return index.get(key);
    }
    // A unique beginning is enough: «Нижегор» → Нижегородская область.
    const key = normalize(query);
    if (key.length < 4) return null;
    const hits = new Set();
    index.forEach((list, alias) => { if (alias.startsWith(key) && list.length === 1) hits.add(list[0]); });
    return hits.size === 1 ? [...hits] : null;
  }

  function cityIndex(cities) {
    const byName = new Map();
    const byId = new Map();
    cities.forEach(c => {
      byId.set(c.id, c);
      const k = normalize(c.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(c);
    });
    byName.forEach(list => list.sort((a, b) => (b.population || 0) - (a.population || 0)));
    return { byName, byId };
  }

  // «Кировск» takes the larger namesake; «Кировск (Ленинградская)» picks the one in that region.
  function findCity(index, regions, query) {
    const text = String(query).trim();
    if (index.byId.has(text)) return index.byId.get(text);
    const qualified = /^(.*?)\s*[(/]\s*([^)]*?)\s*\)?$/.exec(text);
    const name = qualified && qualified[2] ? qualified[1] : text;
    const list = index.byName.get(normalize(name));
    if (!list) return null;
    if (qualified && qualified[2]) {
      const within = findRegions(regions, qualified[2]);
      const hit = within && list.find(c => within.includes(c.regionId));
      if (hit) return hit;
    }
    return list[0];
  }

  function coerceSetting(key, raw, ctx) {
    const { spec } = ctx;
    const text = String(raw).trim();
    const lower = normalize(text);
    if (spec.booleans.has(key)) {
      if (["1", "true", "yes", "on", "да", "вкл"].includes(lower)) return { ok: true, value: true };
      if (["0", "false", "no", "off", "нет", "выкл"].includes(lower)) return { ok: true, value: false };
      return { ok: false };
    }
    if (spec.colors.has(key)) {
      const color = hexColor(text);
      return color ? { ok: true, value: color } : { ok: false };
    }
    if (spec.ranges[key]) {
      const value = Number(text.replace(",", "."));
      if (!text || !Number.isFinite(value)) return { ok: false };
      const [min, max] = spec.ranges[key];
      return { ok: true, value: Math.min(max, Math.max(min, value)) };
    }
    if (spec.enums[key]) {
      const alias = VALUE_ALIASES[key] && VALUE_ALIASES[key][lower];
      const value = spec.enums[key].find(option => String(option) === (alias || text) || String(option).toLowerCase() === lower);
      return value === undefined ? { ok: false } : { ok: true, value };
    }
    return { ok: false };
  }

  function decodeProject(value) {
    const text = String(value).trim();
    if (text.startsWith("{")) return text;
    try {
      const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(base64 + "===".slice((base64.length + 3) % 4));
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)));
    } catch (_) {
      throw new Error("проект в ссылке повреждён");
    }
  }

  // The address's parameters: the fragment (#…, never sent to the server) and the query (?…) are both read,
  // the fragment winning. Returns null when the address describes no map.
  function readParams(search, hash) {
    const text = `${String(search || "").replace(/^\?/, "")}&${String(hash || "").replace(/^#/, "")}`;
    if (text.length > MAX_LINK_LENGTH) throw new Error("ссылка слишком длинная");
    const params = new Map();
    new URLSearchParams(text).forEach((value, key) => { if (!IGNORED.test(key)) params.set(key, value); });
    return params;
  }

  function isMapLink(params, ctx) {
    return [...params.keys()].some(key => LIST_KEYS.includes(key) || ALIASES[key] || ctx.settingKeys.includes(key));
  }

  // ctx: { defaults, settingKeys, spec: { booleans, colors, ranges, enums }, themes, catalogues: { russia, world }
  // (each { regions: [{ id, name, name_full?, code?, fd?, fd_full? }], cities: [{ id, name, population, regionId }] }),
  // parseProject(text) → project (strict, throws) }.
  function fromParams(params, ctx) {
    if (!isMapLink(params, ctx)) return null;
    if (params.has("p")) {
      const text = decodeProject(params.get("p"));
      return { project: ctx.parseProject(text), problems: [] };
    }

    const problems = [];
    const settings = { ...ctx.defaults };
    const read = key => params.has(key) ? params.get(key) : Object.keys(ALIASES).filter(a => ALIASES[a] === key).map(a => params.get(a)).find(v => v !== undefined);

    let scope = null;
    const scopeRaw = read("mapScope");
    if (scopeRaw !== undefined) {
      const coerced = coerceSetting("mapScope", scopeRaw, ctx);
      if (coerced.ok && ctx.catalogues[coerced.value]) scope = coerced.value;
      else problems.push(`карта «${scopeRaw}»`);
    }
    const regionNames = splitList(params.get("regions"));
    const cityNames = splitList(params.get("cities"));
    const colorPairs = splitList(params.get("colors")).map(pair => pair.split(/[:=](?=[^:=]*$)/));
    const valuePairs = splitList(params.get("values")).map(pair => pair.split(/[:=](?=[^:=]*$)/));
    const regionQueries = [...regionNames, ...colorPairs.map(p => p[0]), ...valuePairs.map(p => p[0])];

    const indexes = {};
    const indexFor = name => indexes[name] || (indexes[name] = {
      regions: regionIndex(ctx.catalogues[name].regions), cities: cityIndex(ctx.catalogues[name].cities)
    });
    // Without «scope», a list that only makes sense on the world map (Париж, Германия) opens the world map.
    if (!scope) {
      scope = "russia";
      if (ctx.catalogues.world && (regionQueries.length || cityNames.length)) {
        const misses = name => {
          const index = indexFor(name);
          return regionQueries.filter(q => !findRegions(index.regions, q)).length
            + cityNames.filter(q => !findCity(index.cities, index.regions, q)).length;
        };
        if (misses("russia") > misses("world")) scope = "world";
      }
    }
    settings.mapScope = scope;
    const index = indexFor(scope);

    const themeRaw = params.get("theme");
    if (themeRaw !== undefined) {
      const theme = ctx.themes.find(t => t.id === normalize(themeRaw) || normalize(t.name) === normalize(themeRaw));
      if (theme) Object.assign(settings, theme.colors);
      else problems.push(`тема «${themeRaw}»`);
    }

    ctx.settingKeys.forEach(key => {
      if (key === "mapScope") return;
      const raw = read(key);
      if (raw === undefined) return;
      if (key === "routeHub") return;
      const coerced = coerceSetting(key, raw, ctx);
      if (coerced.ok) settings[key] = coerced.value;
      else problems.push(`${key}=${raw}`);
    });
    if (settings.gradientStart > settings.gradientEnd) [settings.gradientStart, settings.gradientEnd] = [settings.gradientEnd, settings.gradientStart];

    const regions = [];
    const markRegions = query => {
      const ids = findRegions(index.regions, query);
      if (!ids) { problems.push(query); return []; }
      ids.forEach(id => { if (!regions.includes(id)) regions.push(id); });
      return ids;
    };
    regionNames.forEach(markRegions);

    const cities = [];
    const markCity = query => {
      const city = findCity(index.cities, index.regions, query);
      if (!city) { problems.push(query); return null; }
      if (!cities.includes(city.id)) cities.push(city.id);
      return city;
    };
    cityNames.forEach(markCity);
    const hubRaw = read("routeHub");
    if (hubRaw !== undefined && hubRaw.trim()) {
      const hub = markCity(hubRaw);
      if (hub) settings.routeHub = hub.id;
    }

    const regionColors = {};
    // «values»: a number per region becomes a shade between two colours — a choropleth without hand-picked colours.
    if (valuePairs.length) {
      const stops = splitList(params.get("valueColors")).map(hexColor);
      if (stops.some(c => !c)) problems.push(`valueColors=${params.get("valueColors")}`);
      const to = stops[1] || stops[0] || settings.selectedColor;
      const from = stops[1] ? stops[0] : mix("#ffffff", to, .12);
      const numbers = [];
      valuePairs.forEach(([name, raw]) => {
        const value = Number(String(raw ?? "").trim().replace(",", "."));
        if (raw === undefined || !String(raw).trim() || !Number.isFinite(value)) { problems.push(`${name}: ${raw ?? "нет числа"}`); return; }
        const ids = markRegions(name);
        ids.forEach(id => numbers.push([id, value]));
      });
      const values = numbers.map(n => n[1]);
      const min = Math.min(...values), max = Math.max(...values);
      numbers.forEach(([id, value]) => { regionColors[id] = mix(from, to, max > min ? (value - min) / (max - min) : 1); });
    }
    colorPairs.forEach(([name, raw]) => {
      const color = raw !== undefined && hexColor(raw);
      if (!color) { problems.push(`${name}: ${raw ?? "нет цвета"}`); return; }
      markRegions(name).forEach(id => { regionColors[id] = color; });
    });

    params.forEach((_, key) => {
      if (!LIST_KEYS.includes(key) && !ALIASES[key] && !ctx.settingKeys.includes(key)) problems.push(`параметр «${key}»`);
    });

    return { project: { settings, regions, cities, regionColors, labelOffsets: {} }, problems };
  }

  function fromLocation(location, ctx) {
    return fromParams(readParams(location.search, location.hash), ctx);
  }

  return Object.freeze({ fromLocation, fromParams, readParams, normalize, hexColor });
});
