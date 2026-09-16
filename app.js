(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const BASE_WIDTH = 1600;
  const RATIO_HEIGHTS = { "16:9": 900, "4:3": 1200 };
  const GRID_SPACING = 16;
  const PROJECT_FORMAT = "map.kachkovenko.kontur";
  const PROJECT_VERSION = 1;
  const MAX_PROJECT_BYTES = 256 * 1024;
  const STORAGE_KEY = "kontur-map-state";
  const UI_STORAGE_KEY = "kontur-map-ui";
  const MIN_CITY_POPULATION = 10000;
  const TOP_CITIES_COUNT = 10;
  const HISTORY_LIMIT = 80;
  const HISTORY_BURST_MS = 450;
  const LABEL_OFFSET_LIMIT = 2000;
  const FEDERAL_DISTRICTS = ["ЦФО", "СЗФО", "ЮФО", "СКФО", "ПФО", "УФО", "СФО", "ДФО"];
  const TYPE_SHORT = {
    "Республика": "Респ.", "Край": "Край", "Область": "Обл.",
    "Город федерального значения": "ГФЗ", "Автономная область": "АО", "Автономный округ": "АО"
  };
  const STYLE_HELP = Object.freeze({
    atlas: "Сплошная заливка регионов, границы и контур страны.",
    mosaic: "Регионы набраны сеткой точек, как на инфографике; точки едут и поворачиваются вместе с картой. Линза недоступна."
  });
  // Region lookup for the mosaic is rasterised; sides above this many pixels are scaled down.
  const MAX_SAMPLE_SIDE = 4096;
  const PROJECTION_HELP = Object.freeze({
    conic: "Равновеликая проекция: площади регионов сравниваются корректнее.",
    mercator: "Привычный вид веб-карт. Северные территории визуально увеличены.",
    globe: "Эффект широкоугольной линзы: точка обзора крупнее, удалённые края компактнее. Крестик на карте — точка обзора: перетащите его туда, куда «смотрим»; двойной клик возвращает в центр."
  });

  // Label fonts: six Google Fonts under the SIL Open Font License, self-hosted (bold Latin + Cyrillic subsets for the
  // screen, unmodified originals with OFL.txt in fonts/pack for the export archive), plus two fonts every office has.
  const LABEL_FONTS = Object.freeze({
    inter: { name: "Inter", stack: '"Inter", Arial, sans-serif', pack: "inter", files: ["Inter[opsz,wght].ttf"] },
    "golos-text": { name: "Golos Text", stack: '"Golos Text", Arial, sans-serif', pack: "golos-text", files: ["GolosText[wght].ttf"] },
    montserrat: { name: "Montserrat", stack: '"Montserrat", Arial, sans-serif', pack: "montserrat", files: ["Montserrat[wght].ttf"] },
    "pt-sans": { name: "PT Sans", stack: '"PT Sans", Arial, sans-serif', pack: "pt-sans", files: ["PT_Sans-Web-Regular.ttf", "PT_Sans-Web-Bold.ttf"] },
    "pt-serif": { name: "PT Serif", stack: '"PT Serif", Georgia, serif', pack: "pt-serif", files: ["PT_Serif-Web-Regular.ttf", "PT_Serif-Web-Bold.ttf"] },
    unbounded: { name: "Unbounded", stack: '"Unbounded", Arial, sans-serif', pack: "unbounded", files: ["Unbounded[wght].ttf"] },
    arial: { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
    georgia: { name: "Georgia", stack: 'Georgia, "Times New Roman", serif' }
  });

  const defaults = {
    tab: "regions", mapStyle: "atlas", dotPitch: 12, dotSize: 60, dotShape: "circle", dotLayout: "grid", dotField: false, dotFieldColor: "#d6d3cb", mosaicBorders: false,
    gradient: true, fillStart: "#3b5f8a", fillEnd: "#b9cad8",
    angle: 25, gradientStart: 0, gradientEnd: 100, opacity: 1, selectedColor: "#ff5f46", borders: true, borderColor: "#ffffff",
    borderWidth: 0.8, regionLabels: false, regionLabelsMode: "all", regionLabelsCaps: false, regionFontSize: 11, cityLabels: true, cityFontSize: 12,
    labelFont: "inter", leaderLines: true, leaderColor: "#171717", labelHalo: true, labelHaloWidth: 1.5, labelHaloColor: "#ffffff",
    markerColor: "#171717", markerShape: "circle", markerSize: 6, markerOutline: true, markerOutlineColor: "#ffffff",
    projection: "conic", rotation: 0, graticule: false, graticuleStep: 10, graticuleColor: "#171717", compass: false, frame: true, ratio: "16:9",
    background: "#ffffff", transparent: false, zoom: 1, mapX: 0, mapY: 0, viewZoom: 1, panX: 0, panY: 0, lensStrength: 55, lensLon: 91.06, lensLat: 65.36, projectCompanion: true, fontCompanion: true
  };
  const PROJECT_SETTING_KEYS = Object.freeze([
    "mapStyle", "dotPitch", "dotSize", "dotShape", "dotLayout", "dotField", "dotFieldColor", "mosaicBorders",
    "gradient", "fillStart", "fillEnd", "angle", "gradientStart", "gradientEnd", "opacity", "selectedColor", "borders",
    "borderColor", "borderWidth", "regionLabels", "regionLabelsMode", "regionLabelsCaps", "regionFontSize", "cityLabels", "cityFontSize",
    "labelFont", "leaderLines", "leaderColor", "labelHalo", "labelHaloWidth", "labelHaloColor", "markerColor", "markerShape", "markerSize",
    "markerOutline", "markerOutlineColor",
    "projection", "rotation", "graticule", "graticuleStep", "graticuleColor", "compass", "frame", "ratio", "background", "transparent",
    "zoom", "mapX", "mapY", "viewZoom", "panX", "panY", "lensStrength", "lensLon", "lensLat",
    "projectCompanion", "fontCompanion"
  ]);
  const VIEW_KEYS = Object.freeze(["viewZoom", "panX", "panY"]);
  const BOOLEAN_SETTINGS = new Set(["dotField", "mosaicBorders", "gradient", "borders", "regionLabels", "regionLabelsCaps", "cityLabels", "leaderLines", "labelHalo", "markerOutline", "graticule", "compass", "frame", "transparent", "projectCompanion", "fontCompanion"]);
  const COLOR_SETTINGS = new Set(["dotFieldColor", "fillStart", "fillEnd", "selectedColor", "borderColor", "leaderColor", "labelHaloColor", "markerColor", "markerOutlineColor", "graticuleColor", "background"]);
  const NUMBER_RANGES = Object.freeze({
    dotPitch: [6, 32], dotSize: [30, 100],
    angle: [0, 360], gradientStart: [0, 100], gradientEnd: [0, 100], opacity: [.1, 1], borderWidth: [.2, 4], markerSize: [3, 12],
    regionFontSize: [8, 28], cityFontSize: [8, 28], labelHaloWidth: [.5, 4],
    rotation: [-45, 45], zoom: [.3, 4], mapX: [-4000, 4000], mapY: [-4000, 4000], viewZoom: [.25, 4], panX: [-10000, 10000], panY: [-10000, 10000],
    lensStrength: [0, 100], lensLon: [-180, 180], lensLat: [-85, 85]
  });
  const ENUM_SETTINGS = Object.freeze({
    mapStyle: ["atlas", "mosaic"], dotShape: ["circle", "square", "rounded"], dotLayout: ["grid", "stagger"],
    projection: ["conic", "mercator", "globe"], ratio: ["16:9", "4:3"], tab: ["regions", "cities", "selected"], regionLabelsMode: ["all", "selected"],
    markerShape: ["circle", "square", "diamond", "pin"], labelFont: Object.keys(LABEL_FONTS), graticuleStep: [10, 5]
  });
  // Graticule window: Russia's extent with a margin, so the net reads as a sector of the globe around the country.
  const GRATICULE_EXTENT = [[15, 40], [195, 82]];
  // Spaced capitals for region names: tracking as a share of the font size (PPTX gets the same value in points).
  const CAPS_TRACKING = .14;
  // `selectedRegions` are the marked (highlighted, listed) regions; `activeRegions` is the transient pick on the map
  // whose fill is being edited; `regionColors` holds per-region fills that override the shared highlight colour.
  const state = {
    ...defaults, query: "", selectedRegions: new Set(), selectedCities: new Set(), cityLabelOffsets: {},
    regionColors: {}, activeRegions: new Set(), mapSelected: false
  };

  const svg = d3.select("#map");
  const regionsLayer = d3.select("#regions-layer");
  const citiesLayer = d3.select("#cities-layer");
  const labelsLayer = d3.select("#region-labels");
  const tooltip = document.getElementById("tooltip");
  const stage = document.getElementById("stage");
  const artboard = document.getElementById("artboard");
  const canvasViewport = document.getElementById("canvas-viewport");
  const objectList = document.getElementById("object-list");
  const fdChips = document.getElementById("fd-chips");
  const selectFoundButton = document.getElementById("select-found");

  let width = BASE_WIDTH;
  let height = RATIO_HEIGHTS[state.ratio];
  let features = [];
  let cities = [];
  let topCities = [];
  let regionIds = new Set();
  let cityIds = new Set();
  let outline = null;
  let projection = null;
  let path = null;
  let regionPaths = null;
  let regionD = [];
  let cityGroups = null;
  let labelGroups = null;
  let toastTimer = null;
  let panGesture = null;
  let pinchGesture = null;
  let labelDrag = null;
  let suppressSelectionUntil = 0;
  let foundForSelect = null;
  let labelGeometryFresh = false;
  let fitTranslate = [BASE_WIDTH / 2, RATIO_HEIGHTS["16:9"] / 2];
  let renderQueued = false;
  let mapHover = false;
  let handleDrag = null;
  // The map as an object: its unturned box on the slide, the centre it turns about and the current turn (radians).
  let mapFrame = { x: 0, y: 0, width: BASE_WIDTH, height: RATIO_HEIGHTS["16:9"], center: [BASE_WIDTH / 2, RATIO_HEIGHTS["16:9"] / 2], angle: 0, anglePerDegree: 0 };
  let lensBase = null;
  let lensDrag = null;
  const activePointers = new Map();
  const history = { past: [], future: [], current: null, burst: null };
  function mapFont() { return LABEL_FONTS[state.labelFont].stack; }
  const measureContext = document.createElement("canvas").getContext("2d");
  const measureCache = new Map();
  let shownRegionLabels = new Set();
  let graticuleKey = null;
  let dotsKey = null;
  let dotsEmitKey = null;
  let dotCount = 0;
  // Mosaic dot sets per region: grid nodes in the map frame's local coordinates ({u, v, x, y, i, j, off}) and the
  // field around; `off` marks a node handed over to a region that had none.
  let dotSets = [];
  let fieldDots = [];
  let labelRects = [];
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  let cursorGeoFrame = null;
  // Candidate directions for a city label in order of preference: right, left, above, below, diagonals, then the in-betweens.
  const LABEL_DIRECTIONS = Object.freeze([0, 180, -90, 90, -45, -135, 45, 135, -22.5, 22.5, -157.5, 157.5, -67.5, 67.5, -112.5, 112.5].map(deg => {
    const a = deg * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    return { ux, uy, anchor: ux > .3 ? "start" : ux < -.3 ? "end" : "middle" };
  }));

  init();

  function init() {
    if (!window.RU_TOPO) {
      showToast("Не удалось загрузить геоданные карты");
      return;
    }
    const topo = window.RU_TOPO;
    const object = topo.objects.ru89;
    features = topojson.feature(topo, object).features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, "ru"));
    outline = topojson.merge(topo, object.geometries);
    features.forEach(d => { d.area = d3.geoArea(d); });
    cities = makeCities(features);
    topCities = cities.slice().sort((a, b) => b.population - a.population).slice(0, TOP_CITIES_COUNT);
    regionIds = new Set(features.map(d => d.properties.id));
    cityIds = new Set(cities.map(d => d.id));

    document.getElementById("regions-count").textContent = features.length;
    document.getElementById("cities-count").textContent = cities.length;

    regionPaths = regionsLayer.selectAll("path").data(features, d => d.properties.id).join("path")
      .attr("class", "region")
      .attr("data-id", d => d.properties.id)
      .attr("role", "button")
      .attr("tabindex", "0")
      .attr("aria-label", d => d.properties.name)
      .on("mousemove", regionHover)
      .on("mouseleave", hideTooltip)
      .on("click", (event, d) => {
        event.stopPropagation();
        if (Date.now() >= suppressSelectionUntil) pickRegion(d.properties.id, event.shiftKey || event.metaKey || event.ctrlKey);
      })
      .on("keydown", (event, d) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pickRegion(d.properties.id, event.shiftKey); } });

    labelGroups = labelsLayer.selectAll("text").data(features, d => d.properties.id).join("text")
      .attr("class", "region-label");

    cityGroups = citiesLayer.selectAll("g").data(cities, d => d.id).join("g")
      .attr("class", "city")
      .attr("data-id", d => d.id)
      .on("mousemove", cityHover)
      .on("mouseleave", hideTooltip)
      .on("click", (event, d) => { event.stopPropagation(); if (Date.now() >= suppressSelectionUntil) toggleCity(d.id, true); });
    cityGroups.append("line").attr("class", "city-leader");
    cityGroups.append("circle").attr("class", "city-marker__ring");
    cityGroups.append("path").attr("class", "city-marker");
    cityGroups.append("circle").attr("class", "city-marker__eye");
    cityGroups.append("text").attr("class", "city-label").text(d => d.name)
      .on("pointerdown", startLabelDrag)
      .on("click", event => event.stopPropagation())
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        if (!state.cityLabelOffsets[d.id]) return;
        delete state.cityLabelOffsets[d.id];
        restyle(); saveState(); showToast("Подпись возвращена на автоматическое место");
      });

    buildDistrictChips();
    bindSectionToggles();
    bindControls();
    loadSavedState();
    syncControls();
    updateCanvasSize();
    updateList();
    render();
    history.current = snapshot();
    updateHistoryButtons();
    applyLabelFont();
  }

  // Labels are measured on a canvas, so the chosen font has to be loaded before they are laid out; until then the
  // fallback metrics are used and the map is restyled once the real font arrives.
  function applyLabelFont() {
    const stack = mapFont();
    svg.node().style.setProperty("--map-font", stack);
    document.getElementById("label-font").style.fontFamily = stack;
    measureCache.clear();
    if (!document.fonts?.load) return;
    document.fonts.load(`bold 12px ${stack}`).then(() => { measureCache.clear(); restyle(); }).catch(() => {});
  }

  function makeCities(items) {
    const capitals = items.map(feature => {
      const p = feature.properties;
      return {
        id: slug(`${p.capital}-${p.id}`), name: p.capital, lon: +p.clon, lat: +p.clat,
        region: p.name, regionId: p.id, fd: p.fd, population: 0, isCapital: true
      };
    });
    const result = capitals.slice();
    const byId = new Map(items.map(item => [item.properties.id, item]));

    (window.RU_CITIES || []).forEach(city => {
      const twin = capitals.find(existing => normalize(existing.name) === normalize(city.name)
        && Math.abs(existing.lon - city.lon) < .35 && Math.abs(existing.lat - city.lat) < .25);
      if (twin) { twin.population = Math.max(twin.population, city.population || 0); return; }
      if ((city.population || 0) < MIN_CITY_POPULATION) return;
      const feature = (city.region && byId.get(city.region))
        || items.find(item => d3.geoContains(item, [city.lon, city.lat])) || nearestFeature(items, city.lon, city.lat);
      const p = feature.properties;
      result.push({
        // Wikidata ids keep selections stable across rebuilds even when coordinates get refined.
        id: city.wd ? `${slug(city.name)}-${city.wd.toLowerCase()}` : slug(`${city.name}-${city.lon}-${city.lat}`),
        name: city.name, lon: city.lon, lat: city.lat,
        region: p.name, regionId: p.id, fd: p.fd, population: city.population || 0, isCapital: false
      });
    });

    return result.sort((a, b) => a.name.localeCompare(b.name, "ru") || b.population - a.population);
  }

  // Coastal points sometimes fall just outside the simplified polygons; snap them to the closest region outline.
  function nearestFeature(items, lon, lat) {
    const k = Math.cos(lat * Math.PI / 180);
    let best = items[0];
    let bestDistance = Infinity;
    items.forEach(feature => {
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      polygons.forEach(rings => rings[0].forEach(([x, y]) => {
        const dx = (x - lon) * k;
        const dy = y - lat;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) { bestDistance = distance; best = feature; }
      }));
    });
    return best;
  }

  function makeProjection() {
    const projectionFor = centerLon => state.projection === "mercator"
      ? d3.geoMercator().rotate([-centerLon, 0])
      : d3.geoConicEqualArea().parallels([50, 70]).rotate([-centerLon, 0]);
    const collection = { type: "FeatureCollection", features };
    const unrotated = projectionFor(105).fitExtent([[width * .075, height * .12], [width * .925, height * .88]], collection);
    const fitScale = unrotated.scale();
    fitTranslate = unrotated.translate();
    const unitBounds = d3.geoPath(unrotated).bounds(collection);

    // The map's scale and offset on the slide; without a frame the map is just fitted, the export crops to it anyway.
    const placement = mapPlacement();
    const scale = fitScale * placement.zoom;
    const translate = [fitTranslate[0] + placement.x, fitTranslate[1] + placement.y];
    const place = p => [(p[0] - fitTranslate[0]) * placement.zoom + translate[0], (p[1] - fitTranslate[1]) * placement.zoom + translate[1]];
    const box = [place(unitBounds[0]), place(unitBounds[1])];
    const center = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2];
    const straight = projectionFor(105).scale(scale).translate(translate);

    // Turning the central meridian turns a conic image rigidly about the cone's apex; shifting it back so the frame's
    // centre stays put makes it a turn about that centre — the map rotates like an object, frame and all.
    const turned = turnedProjection(projectionFor, straight, center, state.rotation, scale, translate);
    let frameBox = box;
    lensBase = null;
    if (state.projection === "globe") {
      // The lens bulges at the viewpoint (a geographic point, so it travels with the map); its radius reaches the
      // farthest edge of the box. Both projections put the viewpoint at the image of the same point, so the lens
      // commutes with the turn and the unturned lens outline is the frame.
      const viewpoint = [state.lensLon, state.lensLat];
      const focus = straight(viewpoint);
      const radius = Math.max(focus[0] - box[0][0], box[1][0] - focus[0], focus[1] - box[0][1], box[1][1] - focus[1], 1);
      frameBox = d3.geoPath(createLensProjection(straight, focus, radius, state.lensStrength)).bounds(collection);
      lensBase = turned.projection;
      projection = createLensProjection(turned.projection, turned.projection(viewpoint), radius, state.lensStrength);
    } else {
      projection = turned.projection;
    }
    mapFrame = {
      x: frameBox[0][0], y: frameBox[0][1], width: frameBox[1][0] - frameBox[0][0], height: frameBox[1][1] - frameBox[0][1],
      center, angle: turned.angle,
      // Screen angle per degree of rotation (0 for Mercator, whose "rotation" is only a horizontal shift).
      anglePerDegree: (turnedProjection(projectionFor, straight, center, 10, scale, translate).angle) / 10
    };
  }

  // Projection with the central meridian shifted by `rotation` degrees, translated so `center` maps onto itself;
  // `angle` is the resulting turn of the image on screen (radians, clockwise positive).
  function turnedProjection(projectionFor, straight, center, rotation, scale, translate) {
    const projection = projectionFor(105 + rotation).scale(scale).translate(translate);
    if (!rotation) return { projection, angle: 0 };
    const geoCenter = straight.invert(center);
    const moved = projection(geoCenter);
    projection.translate([translate[0] + center[0] - moved[0], translate[1] + center[1] - moved[1]]);
    const probe = projection(straight.invert([center[0], center[1] - 100]));
    let angle = Math.atan2(probe[1] - center[1], probe[0] - center[0]) + Math.PI / 2;
    if (angle > Math.PI) angle -= 2 * Math.PI;
    if (angle < -Math.PI) angle += 2 * Math.PI;
    return { projection, angle };
  }

  function mapPlacement() {
    return state.frame ? { zoom: state.zoom, x: state.mapX, y: state.mapY } : { zoom: 1, x: 0, y: 0 };
  }

  function createLensProjection(baseProjection, [cx, cy], radius, strength) {
    const amount = 1.5 * strength / 100;
    const distort = point => {
      if (!point) return null;
      const dx = point[0] - cx;
      const dy = point[1] - cy;
      const distance = Math.hypot(dx, dy);
      if (!distance || distance >= radius || !amount) return point;
      const normalized = distance / radius;
      const factor = (amount + 1) / (amount * normalized + 1);
      return [cx + dx * factor, cy + dy * factor];
    };
    const lens = coordinates => distort(baseProjection(coordinates));
    // d = d'/(a + 1 − a·d') undoes r' = r·(a + 1)/(a·r/R + 1); the coordinate readout relies on it.
    lens.invert = point => {
      const dx = point[0] - cx;
      const dy = point[1] - cy;
      const distance = Math.hypot(dx, dy);
      if (!distance || !amount) return baseProjection.invert(point);
      const normalized = distance / radius;
      if (normalized >= 1) return baseProjection.invert(point);
      const original = normalized / (amount + 1 - amount * normalized);
      const factor = original / normalized;
      return baseProjection.invert([cx + dx * factor, cy + dy * factor]);
    };
    lens.stream = output => baseProjection.stream({
      point(x, y) { const p = distort([x, y]); output.point(p[0], p[1]); },
      lineStart() { output.lineStart(); },
      lineEnd() { output.lineEnd(); },
      polygonStart() { output.polygonStart(); },
      polygonEnd() { output.polygonEnd(); },
      sphere() { if (output.sphere) output.sphere(); }
    });
    return lens;
  }

  // Full render: recompute the projection and every geometry, then restyle.
  function render() {
    if (!features.length) return;
    makeProjection();
    path = d3.geoPath(projection).digits(1);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    regionD = features.map(d => path(d));
    regionPaths.attr("d", (d, k) => regionD[k]);
    d3.select("#country-outline").attr("d", path(outline));

    labelGeometryFresh = false;
    graticuleKey = null;
    dotsKey = null;
    cities.forEach(city => {
      const p = projection([city.lon, city.lat]);
      city.projected = p && isFinite(p[0]) && isFinite(p[1]) ? p : null;
      city.point = city.projected;
    });
    restyle();
  }

  // Cheap render: colours, strokes, visibility and label placement only.
  function restyle() {
    if (!path) return;
    const gradient = d3.select("#land-gradient");
    const r = state.angle * Math.PI / 180;
    const cx = width / 2, cy = height / 2;
    const reach = Math.max(width, height) * .7;
    gradient.attr("x1", cx - Math.cos(r) * reach).attr("y1", cy - Math.sin(r) * reach)
      .attr("x2", cx + Math.cos(r) * reach).attr("y2", cy + Math.sin(r) * reach);
    d3.select("#gradient-start").attr("stop-color", state.fillStart).attr("offset", `${state.gradientStart}%`);
    d3.select("#gradient-end").attr("stop-color", state.fillEnd).attr("offset", `${state.gradientEnd}%`);

    d3.select("#export-background")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", state.background).attr("fill-opacity", state.transparent ? 0 : 1)
      .attr("display", state.frame ? null : "none");

    const landFill = state.gradient ? "url(#land-gradient)" : state.fillStart;
    const mosaic = state.mapStyle === "mosaic";
    const borders = bordersOn();
    // In the mosaic the polygons stay as invisible hit areas (and carry the borders); the dots paint the fill.
    regionPaths
      .attr("fill", d => regionFill(d.properties.id, landFill))
      .attr("fill-opacity", mosaic ? 0 : state.opacity)
      .attr("stroke", borders ? state.borderColor : "none")
      .attr("stroke-width", borders ? state.borderWidth : 0)
      .classed("is-selected", d => state.selectedRegions.has(d.properties.id));

    const activeFeatures = features.filter(f => state.activeRegions.has(f.properties.id));
    d3.select("#active-outline").selectAll("g").data(activeFeatures, d => d.properties.id).join(enter => {
      const g = enter.append("g");
      g.append("path").attr("class", "active-outline__halo");
      g.append("path").attr("class", "active-outline__line");
      return g;
    }).each(function (d) { d3.select(this).selectAll("path").attr("d", path(d)); });

    d3.select("#country-outline")
      .attr("stroke", darken(state.fillStart, .45))
      .attr("stroke-width", Math.max(1.1, state.borderWidth * 1.35))
      .attr("display", borders && !mosaic ? null : "none");
    svg.classed("is-mosaic", mosaic);
    prepareDots();

    const halo = state.labelHalo ? state.labelHaloWidth * 2 : 0;
    const haloStroke = halo ? state.labelHaloColor : "none";
    shownRegionLabels = layoutLabels();
    labelGroups
      .attr("display", d => shownRegionLabels.has(d.properties.id) ? null : "none")
      .attr("transform", d => shownRegionLabels.has(d.properties.id) ? `translate(${d.centroid[0]},${d.centroid[1]})` : "translate(-9999,-9999)")
      .text(regionLabelText)
      .attr("letter-spacing", state.regionLabelsCaps ? state.regionFontSize * CAPS_TRACKING : null)
      .attr("font-size", state.regionFontSize)
      .attr("fill", darken(state.fillStart, .7))
      .attr("stroke", haloStroke)
      .attr("stroke-width", halo);

    const geo = markerGeometry();
    // In the mosaic the marker is one of the grid's own dots: same shape and size, no outline.
    const markerD = mosaic ? dotsPath([[0, 0]], geo.r, state.dotShape) : markerPath(geo.shape, geo.r);
    const markerOutline = state.markerOutline && !mosaic;
    cityGroups.each(function (d) {
      const visible = state.selectedCities.has(d.id) && !!d.point;
      const group = d3.select(this).attr("display", visible ? null : "none");
      if (!visible) return;
      group.attr("transform", `translate(${d.point[0]},${d.point[1]})`);
      group.select(".city-marker__ring").attr("display", geo.shape === "circle" && !mosaic ? null : "none")
        .attr("r", geo.reach).attr("stroke", state.markerColor);
      group.select(".city-marker").attr("d", markerD).attr("fill", state.markerColor)
        .attr("stroke", markerOutline ? state.markerOutlineColor : "none")
        .attr("stroke-width", markerOutline ? 1.5 : 0).attr("stroke-linejoin", "round");
      group.select(".city-marker__eye").attr("display", geo.shape === "pin" && !mosaic ? null : "none")
        .attr("cx", 0).attr("cy", geo.cy).attr("r", geo.r * .38).attr("fill", state.markerOutlineColor);
      const leader = state.cityLabels ? d.label.leader : null;
      group.select(".city-leader").attr("display", leader ? null : "none")
        .attr("x1", leader ? leader.x1 : 0).attr("y1", leader ? leader.y1 : 0)
        .attr("x2", leader ? leader.x2 : 0).attr("y2", leader ? leader.y2 : 0)
        .attr("stroke", state.leaderColor).attr("stroke-width", 1).attr("stroke-opacity", .85);
      group.select(".city-label")
        .attr("display", state.cityLabels ? null : "none")
        .attr("x", d.label.dx).attr("y", d.label.dy)
        .attr("text-anchor", d.label.anchor)
        .attr("font-size", state.cityFontSize)
        .attr("fill", state.markerColor)
        .attr("stroke", haloStroke)
        .attr("stroke-width", halo)
        .classed("is-manual", !!state.cityLabelOffsets[d.id]);
    });

    emitDots(landFill);
    updateGraticule();
    updateCompass(haloStroke, halo);
    artboard.style.backgroundColor = state.frame ? state.background : "";
    d3.select("#frame-fade-window").attr("width", width).attr("height", height);
    d3.select("#export-content").attr("mask", state.frame ? "url(#frame-fade)" : null);
    applyCanvasTransform();
    updateMapSelection();
    updateLensFocus();
    document.querySelectorAll("[data-projection]").forEach(el => el.classList.toggle("is-active", el.dataset.projection === state.projection));
    document.querySelectorAll("[data-quick-projection]").forEach(el => el.classList.toggle("is-active", (state.projection === "globe" ? "globe" : "conic") === el.dataset.quickProjection));
    document.querySelectorAll(".globe-only").forEach(el => el.hidden = state.projection !== "globe");
    document.getElementById("projection-help").textContent = PROJECTION_HELP[state.projection];
  }

  // Mosaic style: every region becomes one path of dot subpaths. The dot grid is anchored to the map object (origin at
  // the frame's centre, pitch scaled with the map's zoom), so the pattern travels and grows with the map, but its rows
  // stay level with the slide: turning the map resamples it, the way a dotted map always reads as rows. Two phases per
  // restyle: `prepareDots` samples the grid (when needed) and seats every visible city on its nearest free dot before
  // labels are laid out; `emitDots` then writes the paths, leaving out the city dots and the dots under label text.
  function prepareDots() {
    const mosaic = state.mapStyle === "mosaic";
    cities.forEach(city => { city.point = city.projected; city.dot = null; });
    if (!mosaic) { d3.select("#dots-layer").attr("display", "none"); return; }
    const key = [state.dotPitch, state.dotSize, state.dotShape, state.dotLayout, state.dotField].join("|");
    if (dotsKey !== key) { buildDots(); dotsKey = key; }
    assignCityDots();
  }

  function dotPitch() { return state.dotPitch * mapPlacement().zoom; }
  function dotRadius() { return dotPitch() * state.dotSize / 100 / 2; }

  function buildDots() {
    const f = mapFrame;
    const [cx, cy] = f.center;
    const pitch = dotPitch();
    const stagger = state.dotLayout === "stagger";
    const rowStep = stagger ? pitch * Math.sqrt(3) / 2 : pitch;
    // Sampling window, relative to the frame's centre: the turned map's bounding box, widened to the slide when the
    // field around it is on.
    const corners = Object.values(frameCorners());
    if (state.dotField) {
      if (state.frame) corners.push([0, 0], [width, 0], [width, height], [0, height]);
      else corners.forEach(([x, y]) => corners.push([x - pitch * 2, y - pitch * 2], [x + pitch * 2, y + pitch * 2]));
    }
    const u0 = Math.min(...corners.map(p => p[0])) - cx, u1 = Math.max(...corners.map(p => p[0])) - cx;
    const v0 = Math.min(...corners.map(p => p[1])) - cy, v1 = Math.max(...corners.map(p => p[1])) - cy;
    const i0 = Math.floor(u0 / pitch) - 1, i1 = Math.ceil(u1 / pitch) + 1;
    const j0 = Math.floor(v0 / rowStep) - 1, j1 = Math.ceil(v1 / rowStep) + 1;
    const lookup = rasterizeRegions({ x: cx + u0 - pitch, y: cy + v0 - pitch, width: u1 - u0 + pitch * 2, height: v1 - v0 + pitch * 2 });
    dotSets = features.map(() => []);
    fieldDots = [];
    const owner = new Map();
    const node = (i, j) => {
      const u = i * pitch + (stagger && (j & 1) ? pitch / 2 : 0);
      const v = j * rowStep;
      return { u, v, x: cx + u, y: cy + v, i, j, off: false };
    };
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dot = node(i, j);
        const k = lookup(dot.x, dot.y);
        if (k >= 0) { owner.set(`${i}:${j}`, { k, index: dotSets[k].length }); dotSets[k].push(dot); }
        else if (state.dotField) fieldDots.push(dot);
      }
    }
    // A region no node landed in (Москва, Севастополь, the small republics on a coarse grid) takes the grid node
    // nearest to its centroid — a neighbour hands it over if it was theirs — so every dot stays on the grid and no two
    // overlap. Bigger regions choose first; a node given away this way is not given away again.
    const claimed = new Set();
    const seat = k => {
      const c = path.centroid(features[k]);
      if (!c || !isFinite(c[0]) || !isFinite(c[1])) return;
      const u = c[0] - cx, v = c[1] - cy;
      const jc = Math.round(v / rowStep);
      const candidates = [];
      for (let j = jc - 1; j <= jc + 1; j++) {
        const ic = Math.round((u - (stagger && (j & 1) ? pitch / 2 : 0)) / pitch);
        for (let i = ic - 1; i <= ic + 1; i++) {
          const dot = node(i, j);
          candidates.push({ dot, distance: (dot.u - u) ** 2 + (dot.v - v) ** 2 });
        }
      }
      candidates.sort((a, b) => a.distance - b.distance);
      const pick = candidates.find(({ dot }) => !claimed.has(`${dot.i}:${dot.j}`));
      if (!pick) return;
      const key = `${pick.dot.i}:${pick.dot.j}`;
      claimed.add(key);
      const previous = owner.get(key);
      if (previous) dotSets[previous.k][previous.index].off = true;
      dotSets[k].push(pick.dot);
    };
    const byArea = features.map((d, k) => k).sort((a, b) => features[b].area - features[a].area);
    byArea.filter(k => !dotSets[k].length).forEach(seat);
    // A region whose only node was just handed over gets seated in turn.
    byArea.filter(k => dotSets[k].length && dotSets[k].every(dot => dot.off)).forEach(seat);
    dotsEmitKey = null;
  }

  // Each visible city takes the nearest dot of its region that no other city holds (bigger cities choose first); a
  // region with no free dot left lends the nearest dot of any region. The city then sits on that dot.
  function assignCityDots() {
    const index = new Map(features.map((d, k) => [d.properties.id, k]));
    const f = mapFrame;
    const [cx, cy] = f.center;
    const taken = new Set();
    const nearest = (list, u, v, k) => {
      let best = -1, bestDistance = Infinity;
      list.forEach((dot, i) => {
        if (dot.off || taken.has(`${k}:${i}`)) return;
        const distance = (dot.u - u) ** 2 + (dot.v - v) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      });
      return { best, bestDistance };
    };
    cities.filter(city => state.selectedCities.has(city.id) && city.projected)
      .sort((a, b) => b.population - a.population)
      .forEach(city => {
        const u = city.projected[0] - cx, v = city.projected[1] - cy;
        let k = index.get(city.regionId);
        let found = k === undefined ? { best: -1 } : nearest(dotSets[k], u, v, k);
        if (found.best < 0) {
          let bestK = -1, bestI = -1, bestDistance = Infinity;
          dotSets.forEach((list, kk) => {
            const candidate = nearest(list, u, v, kk);
            if (candidate.best >= 0 && candidate.bestDistance < bestDistance) { bestDistance = candidate.bestDistance; bestK = kk; bestI = candidate.best; }
          });
          k = bestK; found = { best: bestI };
        }
        if (found.best < 0) return;
        taken.add(`${k}:${found.best}`);
        const dot = dotSets[k][found.best];
        city.dot = { k, i: found.best };
        city.point = [dot.x, dot.y];
      });
  }

  function emitDots(landFill) {
    const layer = d3.select("#dots-layer");
    if (state.mapStyle !== "mosaic") return;
    const radius = dotRadius();
    const f = mapFrame;
    const cityDots = new Set(cities.filter(city => city.dot && state.selectedCities.has(city.id)).map(city => `${city.dot.k}:${city.dot.i}`));
    // Text sits on clean paper: dots whose centre falls under a label box (padded by the dot itself) are dropped.
    const rects = labelRects.filter(r => r.kind === "label").map(r => ({ x1: r.x1 - radius, y1: r.y1 - radius, x2: r.x2 + radius, y2: r.y2 + radius }));
    const clear = dot => !dot.off && !rects.some(r => dot.x > r.x1 && dot.x < r.x2 && dot.y > r.y1 && dot.y < r.y2);
    const key = `${dotsKey}|${[...cityDots].sort().join(",")}|${rects.map(r => `${Math.round(r.x1)},${Math.round(r.y1)},${Math.round(r.x2)},${Math.round(r.y2)}`).join(";")}`;
    if (dotsEmitKey !== key) {
      layer.attr("transform", `translate(${f.center[0]},${f.center[1]})`);
      layer.select(".dots--field").attr("d", dotsPath(fieldDots.filter(clear), radius, state.dotShape));
      dotCount = 0;
      layer.selectAll(".dots--region").data(features, d => d.properties.id)
        .join(enter => enter.append("path").attr("class", "dots dots--region").attr("data-id", d => d.properties.id))
        .attr("d", (d, k) => {
          const dots = dotSets[k].filter((dot, i) => !cityDots.has(`${k}:${i}`) && clear(dot));
          dotCount += dots.length;
          return dotsPath(dots, radius, state.dotShape);
        });
      dotsEmitKey = key;
    }
    layer.attr("display", null);
    layer.selectAll(".dots--region")
      .attr("fill", d => regionFill(d.properties.id, landFill))
      .attr("fill-opacity", state.opacity)
      .classed("is-selected", d => state.selectedRegions.has(d.properties.id));
    layer.select(".dots--field").attr("fill", state.dotFieldColor).attr("display", state.dotField ? null : "none");
    document.getElementById("dot-pitch-value").textContent = `${state.dotPitch} px · ≈ ${dotCount.toLocaleString("ru-RU")} ${plural(dotCount, "точка", "точки", "точек")}`;
  }

  // Which region a slide point falls in: regions are painted into a canvas with an index colour (checksummed in the
  // other channels so anti-aliased boundary pixels are recognised and resolved from a neighbour). Larger regions are
  // painted first, so enclaves like Москва end up on top.
  function rasterizeRegions(box) {
    const scale = Math.min(1, MAX_SAMPLE_SIDE / Math.max(box.width, box.height));
    const w = Math.max(1, Math.ceil(box.width * scale));
    const h = Math.max(1, Math.ceil(box.height * scale));
    sampleCanvas.width = w; sampleCanvas.height = h;
    const ctx = sampleContext;
    ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
    ctx.clearRect(box.x, box.y, box.width, box.height);
    features.map((d, k) => k).sort((a, b) => features[b].area - features[a].area).forEach(k => {
      ctx.fillStyle = `rgb(${k},${(k * 7 + 3) % 256},${(k * 13 + 5) % 256})`;
      ctx.fill(new Path2D(regionD[k]));
    });
    const data = ctx.getImageData(0, 0, w, h).data;
    const decode = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      const o = (y * w + x) * 4;
      if (data[o + 3] !== 255) return -1;
      const k = data[o];
      return data[o + 1] === (k * 7 + 3) % 256 && data[o + 2] === (k * 13 + 5) % 256 ? k : -2;
    };
    return (sx, sy) => {
      const x = Math.floor((sx - box.x) * scale), y = Math.floor((sy - box.y) * scale);
      let k = decode(x, y);
      if (k !== -2) return k;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        k = decode(x + dx, y + dy);
        if (k >= 0) return k;
      }
      return -1;
    };
  }

  function dotsPath(dots, r, shape) {
    const n = v => Math.round(v * 10) / 10;
    const side = n(r * 2);
    const points = dots.map(dot => Array.isArray(dot) ? dot : [dot.u, dot.v]);
    if (shape === "circle") return points.map(([u, v]) => `M${n(u - r)},${n(v)}a${n(r)},${n(r)} 0 1 0 ${side},0a${n(r)},${n(r)} 0 1 0 -${side},0`).join("");
    if (shape === "square") return points.map(([u, v]) => `M${n(u - r)},${n(v - r)}h${side}v${side}h-${side}z`).join("");
    const c = n(r * .4), flat = n(r * 2 - c * 2);
    return points.map(([u, v]) => `M${n(u - r + c)},${n(v - r)}h${flat}a${c},${c} 0 0 1 ${c},${c}v${flat}a${c},${c} 0 0 1 -${c},${c}h-${flat}a${c},${c} 0 0 1 -${c},-${c}v-${flat}a${c},${c} 0 0 1 ${c},-${c}z`).join("");
  }

  function hoverDots(id) {
    d3.select("#dots-layer").selectAll(".is-hover").classed("is-hover", false);
    if (id) d3.select("#dots-layer").select(`[data-id="${id}"]`).classed("is-hover", true);
  }

  // Region borders are remembered per style: the mosaic starts without them, the atlas with them.
  function bordersOn() { return state.mapStyle === "mosaic" ? state.mosaicBorders : state.borders; }

  // The lens distorts the sampling grid unevenly, so the mosaic falls back to the atlas projection.
  function enforceStyleRules() {
    if (state.mapStyle !== "mosaic" || state.projection !== "globe") return false;
    state.projection = "conic";
    return true;
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  // Meridians and parallels over the map, part of the export. The net is only regenerated when the projection or the
  // step changes; colour and visibility are plain restyles.
  function updateGraticule() {
    const net = d3.select("#graticule");
    if (!state.graticule) { net.attr("display", "none"); return; }
    const key = `${state.graticuleStep}`;
    if (graticuleKey !== key) {
      const step = state.graticuleStep;
      net.attr("d", path(d3.geoGraticule().extent(GRATICULE_EXTENT).step([step, step])()));
      graticuleKey = key;
    }
    net.attr("display", null).attr("stroke", state.graticuleColor).attr("stroke-opacity", .28).attr("stroke-width", .7);
  }

  // North arrow: sits in the slide's top-right corner (by the map's box without a frame) and turns with the map, so it
  // points where the central meridian points at the frame's centre. Drawn in the marker colour with the label halo.
  function updateCompass(haloStroke, halo) {
    const compass = d3.select("#compass");
    if (!state.compass) { compass.attr("display", "none"); return; }
    if (compass.select("path").empty()) {
      compass.append("path").attr("class", "compass__north").attr("d", "M0,-30 L8,8 L0,3 Z");
      compass.append("path").attr("class", "compass__south").attr("d", "M0,-30 L-8,8 L0,3 Z");
      compass.append("text").attr("y", -37).attr("font-size", 15).text("С");
    }
    const ne = frameCorners().ne;
    const anchor = state.frame ? [width - 70, 82] : [ne[0] + 46, ne[1] + 30];
    const colour = state.markerColor;
    compass.attr("display", null)
      .attr("transform", `translate(${anchor[0]},${anchor[1]}) rotate(${mapFrame.angle * 180 / Math.PI})`);
    compass.select(".compass__north").attr("fill", colour).attr("stroke", haloStroke).attr("stroke-width", halo ? 1.5 : 0).attr("paint-order", "stroke");
    compass.select(".compass__south").attr("fill", "none").attr("stroke", colour).attr("stroke-width", 1).attr("stroke-linejoin", "round");
    compass.select("text").attr("fill", colour).attr("stroke", haloStroke).attr("stroke-width", halo);
  }

  // Coordinate readout under the cursor (screen only). One DOM write per frame; hidden when the point lies outside
  // the projection's image, which the round trip through invert detects.
  function updateCursorGeo(clientX, clientY) {
    cancelAnimationFrame(cursorGeoFrame);
    cursorGeoFrame = requestAnimationFrame(() => {
      const el = document.getElementById("cursor-geo");
      let text = "";
      if (clientX != null && projection && projection.invert) {
        const point = slidePoint(clientX, clientY);
        const geo = projection.invert(point);
        const back = geo && isFinite(geo[0]) && isFinite(geo[1]) && Math.abs(geo[1]) <= 90 ? projection(geo) : null;
        if (back && Math.hypot(back[0] - point[0], back[1] - point[1]) < 1) text = formatGeo(geo);
      }
      el.textContent = text;
      el.hidden = !text;
      document.getElementById("cursor-geo-sep").hidden = !text;
    });
  }

  function formatGeo([lon, lat]) {
    const deg = value => Math.abs(value).toFixed(2).replace(".", ",");
    const lonNorm = ((lon + 540) % 360) - 180;
    return `${deg(lat)}° ${lat < 0 ? "ю. ш." : "с. ш."} · ${deg(lonNorm)}° ${lonNorm < 0 ? "з. д." : "в. д."}`;
  }

  // Centroids and bounds are only needed while region labels are on, so they are computed lazily after a reprojection.
  function ensureLabelGeometry() {
    const fontSize = state.regionFontSize;
    if (!labelGeometryFresh) {
      features.forEach(d => {
        const c = path.centroid(d);
        d.centroid = c && isFinite(c[0]) && isFinite(c[1]) ? c : null;
        const b = path.bounds(d);
        d.boxWidth = b[1][0] - b[0][0];
        d.boxHeight = b[1][1] - b[0][1];
        d.labelFontSize = null;
      });
      labelGeometryFresh = true;
    }
    const key = `${fontSize}|${state.regionLabelsCaps}`;
    features.forEach(d => {
      if (d.labelFontSize === key) return;
      d.labelFontSize = key;
      d.labelWidth = regionLabelWidth(d, fontSize);
      d.labelFits = !!d.centroid && d.labelWidth <= d.boxWidth * 1.1 && fontSize * 1.2 <= d.boxHeight;
    });
  }

  // Label order: selected regions are always labelled and go first; city labels are packed around them; optional region
  // labels ("all that fit") take whatever space is left. Returns the set of region ids whose label is shown.
  function layoutLabels() {
    const occupied = [];
    labelRects = occupied;
    const shown = new Set();
    const fontSize = state.regionFontSize;
    const rectFor = d => ({
      x1: d.centroid[0] - d.labelWidth / 2, y1: d.centroid[1] - fontSize * .7,
      x2: d.centroid[0] + d.labelWidth / 2, y2: d.centroid[1] + fontSize * .4, kind: "label"
    });
    // A federal city whose marker is already labelled (Москва, Санкт-Петербург, Севастополь) needs no region label on top.
    const labelledCities = new Set(state.cityLabels ? cities.filter(c => state.selectedCities.has(c.id) && c.point).map(c => normalize(c.name)) : []);
    const redundant = d => labelledCities.has(normalize(shortRegionName(d.properties.name)));
    if (state.regionLabels) {
      ensureLabelGeometry();
      features.forEach(d => {
        if (!d.centroid || !state.selectedRegions.has(d.properties.id) || redundant(d)) return;
        shown.add(d.properties.id);
        occupied.push(rectFor(d));
      });
    }
    layoutCityLabels(occupied);
    if (state.regionLabels && state.regionLabelsMode === "all") {
      features.filter(d => d.centroid && d.labelFits && !shown.has(d.properties.id) && !redundant(d))
        .sort((a, b) => b.area - a.area)
        .forEach(d => {
          const rect = rectFor(d);
          if (occupied.some(other => intersects(other, rect))) return;
          shown.add(d.properties.id);
          occupied.push(rect);
        });
    }
    return shown;
  }

  function regionLabelText(d) {
    const name = shortRegionName(d.properties.name);
    return state.regionLabelsCaps ? name.toUpperCase() : name;
  }

  // Tracking is added after every glyph, so a spaced label is wider by one gap per character.
  function regionLabelWidth(d, fontSize) {
    const text = regionLabelText(d);
    return textWidth(text, fontSize) + (state.regionLabelsCaps ? fontSize * CAPS_TRACKING * text.length : 0);
  }

  // Real text metrics from a canvas using the map's font stack, so placement and PPTX boxes match what is drawn.
  function textWidth(text, fontSize) {
    const key = `${fontSize}|${text}`;
    let w = measureCache.get(key);
    if (w === undefined) {
      measureContext.font = `bold ${fontSize}px ${mapFont()}`;
      w = measureContext.measureText(text).width;
      measureCache.set(key, w);
    }
    return w;
  }

  // Marker geometry: `cx/cy` is the visual centre a label attaches to (a pin's tip sits on the coordinate, its body above),
  // `reach` the distance from that centre to the marker edge, `box` the rectangle the marker occupies.
  function markerGeometry() {
    if (state.mapStyle === "mosaic") {
      const r = dotRadius();
      return { shape: state.dotShape === "circle" ? "circle" : "square", r, cx: 0, cy: 0, reach: r, box: [-r, -r, r, r] };
    }
    const r = state.markerSize;
    const shape = state.markerShape;
    if (shape === "pin") return { shape, r, cx: 0, cy: -1.6 * r, reach: r, box: [-r, -2.6 * r, r, 0] };
    const reach = shape === "circle" ? r * 1.25 : r * 1.2;
    return { shape, r, cx: 0, cy: 0, reach, box: [-reach, -reach, reach, reach] };
  }

  function markerPath(shape, r) {
    switch (shape) {
      case "square": { const s = r * .9; return `M${-s},${-s}h${2 * s}v${2 * s}h${-2 * s}Z`; }
      case "diamond": { const s = r * 1.2; return `M0,${-s}L${s},0L0,${s}L${-s},0Z`; }
      case "pin": return `M0,0L${-.8 * r},${-r}A${r},${r} 0 1 1 ${.8 * r},${-r}Z`;
      default: return `M${-r},0a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z`;
    }
  }

  // Greedy placement: bigger cities pick first; try right, left, above, below; manual offsets always win.
  function layoutCityLabels(occupied) {
    const fontSize = state.cityFontSize;
    const geo = markerGeometry();
    const gap = geo.reach + 4;
    const visible = cities.filter(city => state.selectedCities.has(city.id) && city.point);
    visible.forEach(city => occupied.push({
      x1: city.point[0] + geo.box[0], y1: city.point[1] + geo.box[1], x2: city.point[0] + geo.box[2], y2: city.point[1] + geo.box[3], kind: "marker"
    }));
    visible.sort((a, b) => b.population - a.population);
    const distances = state.leaderLines
      ? [gap, gap + fontSize * 1.6, gap + fontSize * 3.4, gap + fontSize * 5.5, gap + fontSize * 8, gap + fontSize * 11]
      : [gap];
    // Constraints relax in stages when the map is crowded: first everything must be clear, then leaders may cross other
    // markers, then a label may touch another marker's padding. Text over text is only the last resort.
    const passes = [
      { labelAvoids: () => true, leaderAvoids: () => true },
      { labelAvoids: () => true, leaderAvoids: r => r.kind === "label" },
      { labelAvoids: r => r.kind === "label", leaderAvoids: () => false }
    ];
    visible.forEach(city => {
      const w = textWidth(city.name, fontSize);
      const manual = state.cityLabelOffsets[city.id];
      let placement = null;
      if (manual) {
        placement = { dx: manual[0], dy: manual[1], anchor: "start", leader: null };
        if (state.leaderLines) placement.leader = manualLeader(geo, placement, w, fontSize, gap);
      } else if (state.cityLabels) {
        placement = findPlacement(city, geo, gap, distances, fontSize, w, occupied, passes);
      }
      if (!placement) placement = labelPlacement(geo, LABEL_DIRECTIONS[0], gap, fontSize);
      city.label = placement;
      if (state.cityLabels) occupied.push({ ...labelRect(city.point, placement, w, fontSize), kind: "label" });
    });
  }

  function findPlacement(city, geo, gap, distances, fontSize, w, occupied, passes) {
    for (const pass of passes) {
      for (const distance of distances) {
        for (const dir of LABEL_DIRECTIONS) {
          const candidate = labelPlacement(geo, dir, distance, fontSize);
          const rect = labelRect(city.point, candidate, w, fontSize);
          if (state.frame && (rect.x1 < 0 || rect.y1 < 0 || rect.x2 > width || rect.y2 > height)) continue;
          if (occupied.some(other => pass.labelAvoids(other) && intersects(other, rect))) continue;
          if (distance > gap) {
            const leader = leaderFor(geo, dir, distance);
            // Skip the leader's first stretch (it starts inside this city's own marker box) and check the rest is clear.
            const sx = city.point[0] + leader.x1 + (leader.x2 - leader.x1) * .25;
            const sy = city.point[1] + leader.y1 + (leader.y2 - leader.y1) * .25;
            const ex = city.point[0] + leader.x2, ey = city.point[1] + leader.y2;
            if (occupied.some(other => pass.leaderAvoids(other) && segmentIntersectsRect(sx, sy, ex, ey, other))) continue;
            candidate.leader = leader;
          }
          return candidate;
        }
      }
    }
    return null;
  }

  // Baseline position (relative to the city point) of a label attached `distance` away from the marker centre in direction `dir`.
  function labelPlacement(geo, dir, distance, fontSize) {
    const ax = geo.cx + dir.ux * distance;
    const ay = geo.cy + dir.uy * distance;
    // The label box sits just outside the attach point: centred for sideways placements, above/below for vertical ones.
    return { dx: ax, dy: ay + dir.uy * fontSize * .5 + fontSize * .25, anchor: dir.anchor, leader: null };
  }

  function leaderFor(geo, dir, distance) {
    return {
      x1: geo.cx + dir.ux * geo.reach, y1: geo.cy + dir.uy * geo.reach,
      x2: geo.cx + dir.ux * (distance - 2), y2: geo.cy + dir.uy * (distance - 2)
    };
  }

  // A hand-placed label gets a leader once it sits clearly away from the marker.
  function manualLeader(geo, placement, w, fontSize, gap) {
    const rect = labelRect([0, 0], placement, w, fontSize);
    const nx = clamp(geo.cx, rect.x1, rect.x2);
    const ny = clamp(geo.cy, rect.y1, rect.y2);
    const distance = Math.hypot(nx - geo.cx, ny - geo.cy);
    if (distance <= gap + 2) return null;
    const ux = (nx - geo.cx) / distance;
    const uy = (ny - geo.cy) / distance;
    return { x1: geo.cx + ux * geo.reach, y1: geo.cy + uy * geo.reach, x2: nx - ux * 2, y2: ny - uy * 2 };
  }

  function labelRect(point, placement, w, fontSize) {
    const bx = point[0] + placement.dx;
    const by = point[1] + placement.dy;
    const x1 = placement.anchor === "start" ? bx : placement.anchor === "end" ? bx - w : bx - w / 2;
    return { x1, y1: by - fontSize * .75, x2: x1 + w, y2: by + fontSize * .25 };
  }

  function intersects(a, b) { return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1; }

  // Liang–Barsky segment/rectangle test.
  function segmentIntersectsRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const edges = [[-dx, x1 - r.x1], [dx, r.x2 - x1], [-dy, y1 - r.y1], [dy, r.y2 - y1]];
    for (const [p, q] of edges) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }

  function startLabelDrag(event, d) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    event.preventDefault();
    const rendered = svg.node().getBoundingClientRect();
    labelDrag = {
      city: d, element: this, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      dx0: d.label.dx, dy0: d.label.dy, anchor: d.label.anchor, scale: width / Math.max(rendered.width, 1), moved: false
    };
    this.setPointerCapture(event.pointerId);
    this.classList.add("is-dragging");
  }

  function moveLabelDrag(event) {
    if (!labelDrag || labelDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - labelDrag.startX;
    const dy = event.clientY - labelDrag.startY;
    if (Math.hypot(dx, dy) > 3) labelDrag.moved = true;
    if (!labelDrag.moved) return;
    labelDrag.element.setAttribute("x", labelDrag.dx0 + dx * labelDrag.scale);
    labelDrag.element.setAttribute("y", labelDrag.dy0 + dy * labelDrag.scale);
  }

  function endLabelDrag(event) {
    if (!labelDrag || labelDrag.pointerId !== event.pointerId) return;
    const drag = labelDrag;
    labelDrag = null;
    drag.element.classList.remove("is-dragging");
    if (!drag.moved) return;
    let x = Number(drag.element.getAttribute("x"));
    const y = Number(drag.element.getAttribute("y"));
    const length = drag.element.getComputedTextLength ? drag.element.getComputedTextLength() : textWidth(drag.city.name, state.cityFontSize);
    if (drag.anchor === "end") x -= length; else if (drag.anchor === "middle") x -= length / 2;
    state.cityLabelOffsets[drag.city.id] = [
      clamp(Math.round(x * 10) / 10, -LABEL_OFFSET_LIMIT, LABEL_OFFSET_LIMIT),
      clamp(Math.round(y * 10) / 10, -LABEL_OFFSET_LIMIT, LABEL_OFFSET_LIMIT)
    ];
    suppressSelectionUntil = Date.now() + 160;
    restyle(); saveState();
  }

  function updateCanvasSize() {
    width = BASE_WIDTH;
    height = RATIO_HEIGHTS[state.ratio];
    artboard.classList.toggle("ratio-4-3", state.ratio === "4:3");
    artboard.classList.toggle("no-frame", !state.frame);
    document.getElementById("frame-label").textContent = `${state.ratio} · PNG ${width * 2} × ${height * 2}`;
    document.getElementById("ratio-control").style.opacity = state.frame ? 1 : .45;
    document.getElementById("crop-note").textContent = state.frame
      ? "Экспортируется весь слайд выбранного формата."
      : "Экспорт автоматически кадрируется по карте и меткам.";
  }

  function regionMatches(feature, query) {
    const p = feature.properties;
    return !query || normalize(`${p.name} ${p.name_full} ${p.capital} ${p.fd} ${p.fd_full}`).includes(query);
  }

  function cityMatches(city, query) {
    return !query || normalize(`${city.name} ${city.region} ${city.fd}`).includes(query);
  }

  function updateList() {
    const query = normalize(state.query);
    const sections = [];
    foundForSelect = null;

    if (state.tab === "regions") {
      const items = features.filter(f => regionMatches(f, query));
      sections.push({ kind: "region", items });
      if (query && items.length) foundForSelect = { kind: "region", ids: items.map(f => f.properties.id) };
    } else if (state.tab === "cities") {
      const items = cities.filter(c => cityMatches(c, query));
      if (query) {
        sections.push({ kind: "city", items });
        if (items.length) foundForSelect = { kind: "city", ids: items.map(c => c.id) };
      } else {
        sections.push({ kind: "city", title: "Крупнейшие города", items: topCities });
        sections.push({ kind: "city", title: "Все города по алфавиту", items });
      }
    } else {
      const regions = features.filter(f => state.selectedRegions.has(f.properties.id) && regionMatches(f, query));
      const picked = cities.filter(c => state.selectedCities.has(c.id) && cityMatches(c, query));
      if (regions.length) sections.push({ kind: "region", title: `Регионы · ${regions.length}`, items: regions });
      if (picked.length) sections.push({ kind: "city", title: `Города · ${picked.length}`, items: picked });
    }

    const total = sections.reduce((sum, section) => sum + section.items.length, 0);
    if (!total) {
      objectList.innerHTML = query
        ? '<div class="empty-state">Ничего не найдено.<br>Попробуйте изменить запрос.</div>'
        : '<div class="empty-state">Пока ничего не выбрано.<br>Кликните регион на карте или отметьте его в списке.</div>';
    } else {
      objectList.innerHTML = sections.map(renderSection).join("");
    }

    fdChips.hidden = state.tab !== "regions";
    updateDistrictChips();
    updateSelectFoundButton();
  }

  function renderSection(section) {
    const header = section.title ? `<div class="object-group">${escapeHtml(section.title)}</div>` : "";
    const rows = section.items.map(item => section.kind === "region" ? renderRegionItem(item) : renderCityItem(item)).join("");
    return `<div class="object-section">${header}${rows}</div>`;
  }

  function renderRegionItem(feature) {
    const p = feature.properties;
    return renderItem("region", p.id, state.selectedRegions.has(p.id), p.name, p.capital, TYPE_SHORT[p.type] || p.fd);
  }

  function renderCityItem(city) {
    const note = city.isCapital ? `${city.region} · центр` : city.region;
    return renderItem("city", city.id, state.selectedCities.has(city.id), city.name, note, city.fd);
  }

  function renderItem(kind, id, selected, title, subtitle, meta) {
    return `<label class="object-item" data-kind="${kind}" data-object-id="${escapeHtml(id)}">
      <input type="checkbox" ${selected ? "checked" : ""}>
      <span class="object-check"></span>
      <span class="object-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(subtitle)}</small></span>
      <span class="object-meta">${escapeHtml(meta)}</span></label>`;
  }

  function buildDistrictChips() {
    const names = {};
    features.forEach(f => { names[f.properties.fd] = f.properties.fd_full; });
    fdChips.innerHTML = FEDERAL_DISTRICTS.map(fd =>
      `<button type="button" data-fd="${fd}" title="${escapeHtml(names[fd] || fd)} федеральный округ: выбрать все регионы">${fd}</button>`).join("");
    fdChips.addEventListener("click", event => {
      const button = event.target.closest("[data-fd]");
      if (button) toggleDistrict(button.dataset.fd);
    });
  }

  function updateDistrictChips() {
    fdChips.querySelectorAll("[data-fd]").forEach(button => {
      const ids = features.filter(f => f.properties.fd === button.dataset.fd).map(f => f.properties.id);
      const picked = ids.filter(id => state.selectedRegions.has(id)).length;
      button.classList.toggle("is-active", picked === ids.length);
      button.classList.toggle("is-partial", picked > 0 && picked < ids.length);
      button.setAttribute("aria-pressed", picked === ids.length ? "true" : "false");
    });
  }

  function toggleDistrict(fd) {
    const ids = features.filter(f => f.properties.fd === fd).map(f => f.properties.id);
    const allSelected = ids.every(id => state.selectedRegions.has(id));
    ids.forEach(id => setRegionMarked(id, !allSelected));
    afterSelectionChange();
  }

  function updateSelectFoundButton() {
    if (!foundForSelect) { selectFoundButton.hidden = true; return; }
    const set = foundForSelect.kind === "region" ? state.selectedRegions : state.selectedCities;
    const allSelected = foundForSelect.ids.every(id => set.has(id));
    selectFoundButton.hidden = false;
    selectFoundButton.textContent = allSelected
      ? `Снять найденные (${foundForSelect.ids.length})`
      : `Выбрать найденные (${foundForSelect.ids.length})`;
  }

  function selectFound() {
    if (!foundForSelect) return;
    const isRegion = foundForSelect.kind === "region";
    const set = isRegion ? state.selectedRegions : state.selectedCities;
    const allSelected = foundForSelect.ids.every(id => set.has(id));
    foundForSelect.ids.forEach(id => {
      if (isRegion) setRegionMarked(id, !allSelected);
      else if (allSelected) { set.delete(id); delete state.cityLabelOffsets[id]; }
      else set.add(id);
    });
    if (!isRegion && !allSelected) state.cityLabels = true;
    afterSelectionChange();
  }

  function regionFill(id, landFill) {
    return state.regionColors[id] || (state.selectedRegions.has(id) ? state.selectedColor : landFill);
  }

  function setRegionMarked(id, marked) {
    if (marked) { state.selectedRegions.add(id); return; }
    state.selectedRegions.delete(id);
    delete state.regionColors[id];
    state.activeRegions.delete(id);
  }

  // List checkbox: mark or unmark.
  function toggleRegion(id) {
    setRegionMarked(id, !state.selectedRegions.has(id));
    afterSelectionChange();
  }

  // Map click: pick the region (marking it if needed) so its fill can be edited; a second plain click on the only
  // picked region unmarks it. Shift/⌘ adds to or removes from the pick.
  function pickRegion(id, additive) {
    state.mapSelected = false;
    const active = state.activeRegions;
    if (additive) {
      if (active.has(id)) setRegionMarked(id, false);
      else { active.add(id); setRegionMarked(id, true); }
    } else if (active.size === 1 && active.has(id)) {
      setRegionMarked(id, false);
    } else {
      active.clear(); active.add(id); setRegionMarked(id, true);
    }
    afterSelectionChange(id);
  }

  function clearActiveRegions() {
    if (!state.activeRegions.size) return;
    state.activeRegions.clear();
    updateSelectionBar(); restyle();
  }

  // The whole map as one object (like a picture on a slide): a click next to the map, inside its bounding box, selects
  // it; the corners resize it on the slide and the handle above rotates it (the projection's rotation).
  function selectMap() {
    if (state.mapSelected) return;
    state.activeRegions.clear();
    state.mapSelected = true;
    updateSelectionBar(); restyle();
  }

  function deselectMap() {
    if (!state.mapSelected) return;
    state.mapSelected = false;
    updateMapSelection();
  }

  // Corners of the frame in slide coordinates, turned with the map.
  function frameCorners() {
    const f = mapFrame;
    const local = { nw: [f.x, f.y], ne: [f.x + f.width, f.y], se: [f.x + f.width, f.y + f.height], sw: [f.x, f.y + f.height] };
    const out = {};
    Object.entries(local).forEach(([name, p]) => { out[name] = turnPoint(p, f.center, f.angle); });
    return out;
  }

  function turnPoint([x, y], [cx, cy], angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  }

  // Slide units per screen pixel, including the board zoom.
  function screenScale() {
    return Math.max(artboard.getBoundingClientRect().width, 1) / width;
  }

  function slidePoint(clientX, clientY) {
    const rect = artboard.getBoundingClientRect();
    const k = width / Math.max(rect.width, 1);
    return [(clientX - rect.left) * k, (clientY - rect.top) * k];
  }

  function pointInMapBounds(clientX, clientY) {
    const f = mapFrame;
    const [x, y] = turnPoint(slidePoint(clientX, clientY), f.center, -f.angle);
    return x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height;
  }

  function updateMapSelection() {
    const overlay = d3.select("#map-selection");
    const shown = state.mapSelected || mapHover;
    overlay.attr("display", shown ? null : "none").classed("is-hover", !state.mapSelected);
    if (!shown) return;
    const b = mapFrame;
    const k = 1 / screenScale();
    // Everything is laid out in the unturned box; the whole overlay then turns with the map.
    overlay.attr("transform", `rotate(${b.angle * 180 / Math.PI} ${b.center[0]} ${b.center[1]})`);
    overlay.select(".map-selection__box").attr("x", b.x).attr("y", b.y).attr("width", b.width).attr("height", b.height);
    const corners = { nw: [b.x, b.y], ne: [b.x + b.width, b.y], se: [b.x + b.width, b.y + b.height], sw: [b.x, b.y + b.height] };
    overlay.selectAll(".map-selection__corner").attr("display", state.frame ? null : "none")
      .attr("transform", function () { const c = corners[this.dataset.handle]; return `translate(${c[0]},${c[1]}) scale(${k})`; });
    const topX = b.x + b.width / 2, topY = b.y;
    const turnable = Math.abs(b.anglePerDegree) > 1e-6;
    overlay.select(".map-selection__stem").attr("display", turnable ? null : "none")
      .attr("x1", topX).attr("y1", topY).attr("x2", topX).attr("y2", topY - 22 * k);
    overlay.select(".map-selection__rotate").attr("display", turnable ? null : "none")
      .attr("transform", `translate(${topX},${topY - 30 * k}) scale(${k})`);
  }

  // The lens viewpoint crosshair sits on the lens's own centre, which the distortion leaves in place.
  function updateLensFocus() {
    const focus = d3.select("#lens-focus");
    if (!lensBase) { focus.attr("display", "none"); return; }
    const p = lensBase([state.lensLon, state.lensLat]);
    focus.attr("display", null).attr("transform", `translate(${p[0]},${p[1]}) scale(${1 / screenScale()})`);
  }

  function bindLensFocus() {
    const focus = document.getElementById("lens-focus");
    focus.addEventListener("pointerdown", event => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.stopPropagation(); event.preventDefault();
      lensDrag = { pointerId: event.pointerId, moved: false, startX: event.clientX, startY: event.clientY };
      focus.setPointerCapture(event.pointerId);
      focus.classList.add("is-dragging");
    });
    focus.addEventListener("pointermove", event => {
      if (!lensDrag || lensDrag.pointerId !== event.pointerId || !lensBase) return;
      event.stopPropagation();
      if (Math.hypot(event.clientX - lensDrag.startX, event.clientY - lensDrag.startY) > 2) lensDrag.moved = true;
      if (!lensDrag.moved) return;
      const geo = lensBase.invert(slidePoint(event.clientX, event.clientY));
      if (!geo || !geo.every(Number.isFinite)) return;
      state.lensLon = clamp(Math.round(geo[0] * 100) / 100, NUMBER_RANGES.lensLon[0], NUMBER_RANGES.lensLon[1]);
      state.lensLat = clamp(Math.round(geo[1] * 100) / 100, NUMBER_RANGES.lensLat[0], NUMBER_RANGES.lensLat[1]);
      scheduleRender(); saveState(true);
    });
    const end = event => {
      if (!lensDrag || lensDrag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      focus.classList.remove("is-dragging");
      if (lensDrag.moved) { suppressSelectionUntil = Date.now() + 160; saveState(); }
      lensDrag = null;
    };
    focus.addEventListener("pointerup", end);
    focus.addEventListener("pointercancel", end);
    focus.addEventListener("click", event => event.stopPropagation());
    focus.addEventListener("dblclick", event => {
      event.stopPropagation();
      state.lensLon = defaults.lensLon; state.lensLat = defaults.lensLat;
      render(); saveState();
      showToast("Точка обзора — в центре карты");
    });
  }

  function bindMapHandles() {
    const handles = d3.select("#map-selection").selectAll("[data-handle]");
    handles.on("pointerdown", function (event) {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.stopPropagation(); event.preventDefault();
      const kind = this.dataset.handle;
      const center = mapFrame.center;
      const corners = frameCorners();
      const opposite = { nw: "se", ne: "sw", se: "nw", sw: "ne" };
      const p = slidePoint(event.clientX, event.clientY);
      handleDrag = {
        kind, element: this, pointerId: event.pointerId, zoom0: state.zoom, mapX0: state.mapX, mapY0: state.mapY,
        rotation0: state.rotation, center, corner: corners[kind], anchor: corners[opposite[kind]],
        angle0: Math.atan2(p[1] - center[1], p[0] - center[0]), anglePerDegree: mapFrame.anglePerDegree
      };
      this.setPointerCapture(event.pointerId);
      this.classList.add("is-dragging");
    });
    handles.on("pointermove", event => {
      if (!handleDrag || handleDrag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const p = slidePoint(event.clientX, event.clientY);
      if (handleDrag.kind === "rotate") {
        if (Math.abs(handleDrag.anglePerDegree) < 1e-6) return;
        const angle = Math.atan2(p[1] - handleDrag.center[1], p[0] - handleDrag.center[0]);
        let delta = angle - handleDrag.angle0;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        // The handle moves in screen degrees; the projection's rotation is in degrees of longitude.
        state.rotation = clamp(Math.round(handleDrag.rotation0 + delta / handleDrag.anglePerDegree), NUMBER_RANGES.rotation[0], NUMBER_RANGES.rotation[1]);
        document.getElementById("rotation").value = state.rotation;
        document.getElementById("rotation-value").textContent = `${state.rotation}°`;
      } else {
        // Uniform resize about the opposite corner: project the pointer onto the diagonal to get the scale factor.
        const o = handleDrag.anchor, c = handleDrag.corner;
        const vx = c[0] - o[0], vy = c[1] - o[1];
        const f = ((p[0] - o[0]) * vx + (p[1] - o[1]) * vy) / Math.max(vx * vx + vy * vy, 1);
        const zoom = clamp(handleDrag.zoom0 * f, NUMBER_RANGES.zoom[0], NUMBER_RANGES.zoom[1]);
        const applied = zoom / handleDrag.zoom0;
        const tx = fitTranslate[0] + handleDrag.mapX0, ty = fitTranslate[1] + handleDrag.mapY0;
        state.mapX = clamp(o[0] - (o[0] - tx) * applied - fitTranslate[0], NUMBER_RANGES.mapX[0], NUMBER_RANGES.mapX[1]);
        state.mapY = clamp(o[1] - (o[1] - ty) * applied - fitTranslate[1], NUMBER_RANGES.mapY[0], NUMBER_RANGES.mapY[1]);
        state.zoom = zoom;
      }
      scheduleRender();
      saveState(true);
    });
    const end = event => {
      if (!handleDrag || handleDrag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      handleDrag.element.classList.remove("is-dragging");
      handleDrag = null;
      suppressSelectionUntil = Date.now() + 160;
      saveState();
    };
    handles.on("pointerup", end);
    handles.on("pointercancel", end);
  }

  function activeColor() {
    const first = state.activeRegions.values().next().value;
    return (first && state.regionColors[first]) || state.selectedColor;
  }

  function updateSelectionBar() {
    const bar = document.getElementById("selection-bar");
    const count = state.activeRegions.size;
    bar.hidden = !count;
    if (!count) return;
    document.getElementById("selection-bar-count").textContent = `${count} ${plural(count, "регион", "региона", "регионов")}`;
    const color = activeColor();
    document.getElementById("active-color").value = color;
    const text = document.querySelector('[data-color-text-for="active-color"]');
    text.value = color.toUpperCase();
    text.classList.remove("is-invalid");
    text.setAttribute("aria-invalid", "false");
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function toggleCity(id, fromMap) {
    if (state.selectedCities.has(id)) {
      state.selectedCities.delete(id);
      delete state.cityLabelOffsets[id];
    } else {
      state.selectedCities.add(id);
      state.cityLabels = true;
      document.getElementById("city-labels-enabled").checked = true;
    }
    afterSelectionChange(fromMap ? id : null);
  }

  function afterSelectionChange(revealId) {
    document.getElementById("selected-total").textContent = state.selectedRegions.size + state.selectedCities.size;
    updateList();
    if (revealId) revealListItem(revealId);
    updateSelectionBar();
    restyle();
    saveState();
  }

  function revealListItem(id) {
    const item = objectList.querySelector(`.object-item[data-object-id="${id}"]`);
    if (!item) return;
    item.scrollIntoView({ block: "nearest" });
    item.classList.add("is-flash");
    setTimeout(() => item.classList.remove("is-flash"), 900);
  }

  function setMapHover(kind, id) {
    regionsLayer.selectAll(".is-hover").classed("is-hover", false);
    citiesLayer.selectAll(".is-hover").classed("is-hover", false);
    hoverDots(kind === "region" ? id : null);
    if (!id) return;
    (kind === "region" ? regionsLayer : citiesLayer).select(`[data-id="${id}"]`).classed("is-hover", true);
  }

  function setListHover(id) {
    objectList.querySelectorAll(".is-hover").forEach(el => el.classList.remove("is-hover"));
    if (id) objectList.querySelectorAll(`.object-item[data-object-id="${id}"]`).forEach(el => el.classList.add("is-hover"));
  }

  function bindControls() {
    document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      syncTabs();
      updateList();
      persist();
    }));

    const search = document.getElementById("search");
    search.addEventListener("input", event => { state.query = event.target.value; updateList(); });
    document.addEventListener("keydown", event => {
      const meta = event.metaKey || event.ctrlKey;
      const editingText = event.target.matches?.("input:not([type=checkbox]):not([type=range]):not([type=color]), textarea");
      if (meta && event.code === "KeyK") { event.preventDefault(); search.focus(); search.select(); return; }
      if (meta && !editingText && event.code === "KeyZ") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (meta && !editingText && event.code === "KeyY") { event.preventDefault(); redo(); return; }
      if (event.key === "Escape") {
        if (document.activeElement === search && search.value) { search.value = ""; state.query = ""; updateList(); return; }
        if ((state.activeRegions.size || state.mapSelected) && !editingText) { deselectMap(); clearActiveRegions(); return; }
        search.blur(); closePanels(); closeExportMenu();
      }
      const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (nudge && state.mapSelected && state.frame && !editingText) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        state.mapX = clamp(state.mapX + nudge[0] * step, NUMBER_RANGES.mapX[0], NUMBER_RANGES.mapX[1]);
        state.mapY = clamp(state.mapY + nudge[1] * step, NUMBER_RANGES.mapY[0], NUMBER_RANGES.mapY[1]);
        scheduleRender(); saveState(true);
      }
    });
    document.getElementById("undo").addEventListener("click", undo);
    document.getElementById("redo").addEventListener("click", redo);

    objectList.addEventListener("change", event => {
      const item = event.target.closest(".object-item");
      if (!item) return;
      item.dataset.kind === "region" ? toggleRegion(item.dataset.objectId) : toggleCity(item.dataset.objectId);
    });
    objectList.addEventListener("mouseover", event => {
      const item = event.target.closest(".object-item");
      if (item) setMapHover(item.dataset.kind, item.dataset.objectId);
    });
    objectList.addEventListener("mouseleave", () => setMapHover(null, null));
    selectFoundButton.addEventListener("click", selectFound);

    document.getElementById("clear-selection").addEventListener("click", () => {
      if (!state.selectedRegions.size && !state.selectedCities.size) return;
      state.selectedRegions.clear(); state.selectedCities.clear(); state.cityLabelOffsets = {};
      state.regionColors = {}; state.activeRegions.clear();
      afterSelectionChange();
      showToast("Выбор очищен · ⌘Z вернёт обратно");
    });

    // Floating bar for regions picked on the map: recolour them independently, unmark them, or drop the pick.
    bindColorInput("active-color", activeColor, value => {
      state.activeRegions.forEach(id => { state.regionColors[id] = value; });
      restyle(); saveState(true);
    });
    document.getElementById("active-unmark").addEventListener("click", () => {
      [...state.activeRegions].forEach(id => setRegionMarked(id, false));
      afterSelectionChange();
      showToast("Отметка снята · ⌘Z вернёт обратно");
    });
    document.getElementById("active-clear").addEventListener("click", clearActiveRegions);
    // A click on empty canvas (not the end of a drag) drops the pick; region and city clicks stop propagation.
    canvasViewport.addEventListener("click", event => {
      if (Date.now() < suppressSelectionUntil) return;
      if (pointInMapBounds(event.clientX, event.clientY)) selectMap();
      else { deselectMap(); clearActiveRegions(); }
    });
    canvasViewport.addEventListener("pointerleave", () => {
      updateCursorGeo(null);
      if (mapHover) { mapHover = false; updateMapSelection(); }
    });
    bindMapHandles();
    bindLensFocus();

    document.querySelectorAll("[data-map-style]").forEach(button => button.addEventListener("click", () => {
      if (state.mapStyle === button.dataset.mapStyle) return;
      state.mapStyle = button.dataset.mapStyle;
      const reprojected = enforceStyleRules();
      updateStyleControls(); updateLabelModeControls();
      reprojected ? render() : restyle();
      saveState();
    }));
    bindRange("dot-pitch", "dotPitch", "dot-pitch-value", v => `${v} px`, Number);
    bindRange("dot-size", "dotSize", "dot-size-value", v => `${v}%`, Number);
    document.querySelectorAll("[data-dot-shape]").forEach(button => button.addEventListener("click", () => {
      state.dotShape = button.dataset.dotShape;
      updateStyleControls(); restyle(); saveState();
    }));
    document.querySelectorAll("[data-dot-layout]").forEach(button => button.addEventListener("click", () => {
      state.dotLayout = button.dataset.dotLayout;
      updateStyleControls(); restyle(); saveState();
    }));
    bindCheck("dot-field", "dotField", updateStyleControls);
    bindColor("dot-field-color", "dotFieldColor");
    bindCheck("gradient-enabled", "gradient", updateGradientControls);
    bindColor("fill-start", "fillStart");
    bindColor("fill-end", "fillEnd");
    bindRange("gradient-angle", "angle", "gradient-angle-value", v => `${v}°`, Number);
    bindGradientStops();
    bindRange("fill-opacity", "opacity", "opacity-value", v => `${v}%`, v => Number(v) / 100);
    bindColor("selected-color", "selectedColor");
    document.getElementById("borders-enabled").addEventListener("change", event => {
      state[state.mapStyle === "mosaic" ? "mosaicBorders" : "borders"] = event.target.checked;
      updateLabelModeControls(); restyle(); saveState();
    });
    bindColor("border-color", "borderColor");
    document.getElementById("border-width").addEventListener("input", event => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      state.borderWidth = clamp(value, NUMBER_RANGES.borderWidth[0], NUMBER_RANGES.borderWidth[1]);
      restyle(); saveState(true);
    });
    bindCheck("region-labels-enabled", "regionLabels", updateLabelModeControls);
    document.querySelectorAll("[data-labels-mode]").forEach(button => button.addEventListener("click", () => {
      state.regionLabelsMode = button.dataset.labelsMode;
      updateLabelModeControls(); restyle(); saveState();
    }));
    bindCheck("region-labels-caps", "regionLabelsCaps");
    bindRange("region-font-size", "regionFontSize", "region-font-size-value", v => `${v} px`, Number);
    bindCheck("city-labels-enabled", "cityLabels", updateLabelModeControls);
    bindRange("city-font-size", "cityFontSize", "city-font-size-value", v => `${v} px`, Number);
    bindCheck("leader-lines", "leaderLines", updateLabelModeControls);
    bindColor("leader-color", "leaderColor");
    bindCheck("label-halo", "labelHalo", updateLabelModeControls);
    bindRange("label-halo-width", "labelHaloWidth", "label-halo-width-value", v => `${String(v).replace(".", ",")} px`, Number);
    bindColor("label-halo-color", "labelHaloColor");
    bindColor("marker-color", "markerColor");
    bindCheck("marker-outline", "markerOutline", updateLabelModeControls);
    bindColor("marker-outline-color", "markerOutlineColor");
    document.querySelectorAll("[data-marker-shape]").forEach(button => button.addEventListener("click", () => {
      state.markerShape = button.dataset.markerShape;
      updateLabelModeControls(); restyle(); saveState();
    }));
    bindRange("marker-size", "markerSize", "marker-size-value", v => v, Number);
    bindRange("rotation", "rotation", "rotation-value", v => `${v}°`, Number, true);
    bindRange("lens-strength", "lensStrength", "lens-strength-value", v => `${v}%`, Number, true);
    bindCheck("graticule-enabled", "graticule", updateProjectionControls);
    document.querySelectorAll("[data-graticule-step]").forEach(button => button.addEventListener("click", () => {
      state.graticuleStep = Number(button.dataset.graticuleStep);
      updateProjectionControls(); restyle(); saveState();
    }));
    bindColor("graticule-color", "graticuleColor");
    bindCheck("compass-enabled", "compass");
    bindCheck("frame-enabled", "frame", () => { updateCanvasSize(); render(); });
    bindColor("background-color", "background");
    bindCheck("transparent-background", "transparent");
    bindCheck("project-companion", "projectCompanion");
    bindCheck("font-companion", "fontCompanion");
    document.getElementById("label-font").addEventListener("change", event => {
      state.labelFont = event.target.value;
      applyLabelFont(); updateFontCompanionOption(); restyle(); saveState();
    });

    document.querySelectorAll("[data-palette]").forEach(button => button.addEventListener("click", () => {
      [state.fillStart, state.fillEnd] = button.dataset.palette.split(",").map(v => v.toLowerCase());
      syncControls(); restyle(); saveState();
    }));
    document.querySelectorAll("[data-projection]").forEach(button => button.addEventListener("click", () => setProjection(button.dataset.projection)));
    document.querySelectorAll("[data-quick-projection]").forEach(button => button.addEventListener("click", () => setProjection(button.dataset.quickProjection)));
    document.querySelectorAll("[data-ratio]").forEach(button => button.addEventListener("click", () => {
      state.ratio = button.dataset.ratio;
      document.querySelectorAll("[data-ratio]").forEach(el => el.classList.toggle("is-active", el === button));
      updateCanvasSize(); render(); saveState();
    }));

    document.getElementById("zoom-in").addEventListener("click", () => state.frame ? zoomMap(state.zoom * 1.2) : zoomCanvas(state.viewZoom * 1.2));
    document.getElementById("zoom-out").addEventListener("click", () => state.frame ? zoomMap(state.zoom / 1.2) : zoomCanvas(state.viewZoom / 1.2));
    document.getElementById("fit-map").addEventListener("click", () => state.frame ? resetMapPlacement() : fitCanvas());
    bindCanvasNavigation();
    if (window.ResizeObserver) new ResizeObserver(() => applyCanvasTransform()).observe(stage);

    bindResetButton();
    const exportMain = document.getElementById("export-main");
    const exportPopover = document.getElementById("export-popover");
    exportMain.addEventListener("click", event => {
      event.stopPropagation();
      const open = exportPopover.hidden;
      closeExportMenu();
      exportPopover.hidden = !open;
      exportMain.setAttribute("aria-expanded", String(open));
    });
    const importButton = document.getElementById("import-project");
    const importPopover = document.getElementById("import-popover");
    importButton.addEventListener("click", event => {
      event.stopPropagation();
      const open = importPopover.hidden;
      closeExportMenu();
      importPopover.hidden = !open;
      importButton.setAttribute("aria-expanded", String(open));
    });
    document.getElementById("import-choose").addEventListener("click", () => {
      closeExportMenu();
      document.getElementById("project-file-input").click();
    });
    exportPopover.addEventListener("click", event => {
      const button = event.target.closest("[data-export]");
      const projectButton = event.target.closest("[data-project-action]");
      if (button) {
        closeExportMenu();
        exportFile(button.dataset.export);
      } else if (projectButton) {
        closeExportMenu();
        downloadProject();
      }
    });
    document.getElementById("project-file-input").addEventListener("change", importProjectFile);
    document.addEventListener("click", event => { if (!event.target.closest(".export-menu")) closeExportMenu(); });

    document.getElementById("open-library").addEventListener("click", () => document.getElementById("library-panel").classList.add("is-open"));
    document.getElementById("open-inspector").addEventListener("click", () => document.getElementById("inspector-panel").classList.add("is-open"));
    document.querySelectorAll("[data-close-panel]").forEach(button => button.addEventListener("click", closePanels));
  }

  // Inspector sections collapse like PowerPoint's format pane; the folded state is a UI preference, not part of the project.
  function bindSectionToggles() {
    const sections = [...document.querySelectorAll(".control-section[data-section]")];
    const collapsed = new Set(loadUiPreference("collapsed", []).filter(id => sections.some(s => s.dataset.section === id)));
    const apply = () => sections.forEach(section => {
      const folded = collapsed.has(section.dataset.section);
      section.classList.toggle("is-collapsed", folded);
      section.querySelector(".section-toggle").setAttribute("aria-expanded", String(!folded));
    });
    apply();
    sections.forEach(section => section.querySelector(".section-toggle").addEventListener("click", event => {
      const id = section.dataset.section;
      if (event.altKey) {
        // Alt-click folds or unfolds every section at once.
        const foldAll = !collapsed.has(id);
        sections.forEach(s => foldAll ? collapsed.add(s.dataset.section) : collapsed.delete(s.dataset.section));
      } else {
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      }
      apply();
      saveUiPreference("collapsed", [...collapsed]);
    }));
  }

  function loadUiPreference(key, fallback) {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY));
      if (!isPlainRecord(saved) || !Object.prototype.hasOwnProperty.call(saved, key)) return fallback;
      const value = saved[key];
      return Array.isArray(value) ? value.filter(item => typeof item === "string" && item.length <= 40).slice(0, 20) : fallback;
    } catch (_) { return fallback; }
  }

  function saveUiPreference(key, value) {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY));
      const next = isPlainRecord(saved) && !hasBlockedKeys(saved) ? saved : {};
      next[key] = value;
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function bindResetButton() {
    const button = document.getElementById("reset-all");
    let armed = null;
    const disarm = () => { clearTimeout(armed); armed = null; button.textContent = "Сбросить"; button.classList.remove("is-armed"); };
    button.addEventListener("click", () => {
      if (!armed) {
        button.textContent = "Точно сбросить?";
        button.classList.add("is-armed");
        armed = setTimeout(disarm, 4000);
        return;
      }
      disarm();
      resetAll();
    });
    button.addEventListener("blur", () => { if (armed) disarm(); });
  }

  // With the frame on, the slide stays put and gestures place the map on it (scale + offset, exported as-is).
  // Without a frame the same gestures navigate the infinite board.
  function bindCanvasNavigation() {
    canvasViewport.addEventListener("wheel", event => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? .006 : .0015));
      if (state.frame) { zoomMap(state.zoom * factor, event.clientX, event.clientY); return; }
      const bounds = canvasViewport.getBoundingClientRect();
      zoomCanvas(state.viewZoom * factor, event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });

    canvasViewport.addEventListener("pointerdown", event => {
      if (event.button !== 0 && event.button !== 1) return;
      if (event.button === 1) event.preventDefault();
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // No pointer capture yet: a captured pointer makes Chrome fire the click on the viewport instead of the region
      // or city under it. The pointer is captured once a drag or pinch actually starts (see below).
      if (activePointers.size === 2) {
        panGesture = null;
        activePointers.forEach((_, pointerId) => capturePointer(pointerId));
        const bounds = canvasViewport.getBoundingClientRect();
        const [a, b] = [...activePointers.values()];
        pinchGesture = {
          distance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
          midX: (a.x + b.x) / 2 - bounds.left, midY: (a.y + b.y) / 2 - bounds.top,
          zoom: state.viewZoom, panX: state.panX, panY: state.panY, left: bounds.left, top: bounds.top,
          mapZoom: state.zoom, lastMidX: (a.x + b.x) / 2, lastMidY: (a.y + b.y) / 2
        };
        canvasViewport.classList.add("is-panning");
        return;
      }
      if (activePointers.size > 2) return;
      panGesture = {
        pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        panX: state.panX, panY: state.panY, mapX: state.mapX, mapY: state.mapY, moved: false
      };
      canvasViewport.classList.add("is-panning");
    });
    canvasViewport.addEventListener("pointermove", event => {
      if (event.pointerType === "mouse") updateCursorGeo(event.clientX, event.clientY);
      if (labelDrag) { moveLabelDrag(event); return; }
      if (!panGesture && !pinchGesture && !handleDrag && !lensDrag) {
        // Hovering the empty space inside the map's box hints that the whole map can be selected there.
        const hover = !event.target.closest(".region, .city, .map-selection, .lens-focus") && pointInMapBounds(event.clientX, event.clientY);
        if (hover !== mapHover) { mapHover = hover; updateMapSelection(); }
      }
      if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchGesture && activePointers.size >= 2) {
        const [a, b] = [...activePointers.values()];
        const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
        if (state.frame) {
          const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
          const k = slideUnitsPerPixel();
          state.mapX = clamp(state.mapX + (midX - pinchGesture.lastMidX) * k, NUMBER_RANGES.mapX[0], NUMBER_RANGES.mapX[1]);
          state.mapY = clamp(state.mapY + (midY - pinchGesture.lastMidY) * k, NUMBER_RANGES.mapY[0], NUMBER_RANGES.mapY[1]);
          pinchGesture.lastMidX = midX; pinchGesture.lastMidY = midY;
          zoomMap(pinchGesture.mapZoom * distance / pinchGesture.distance, midX, midY, true);
          return;
        }
        const midX = (a.x + b.x) / 2 - pinchGesture.left;
        const midY = (a.y + b.y) / 2 - pinchGesture.top;
        const nextZoom = clamp(pinchGesture.zoom * distance / pinchGesture.distance, NUMBER_RANGES.viewZoom[0], NUMBER_RANGES.viewZoom[1]);
        const factor = nextZoom / pinchGesture.zoom;
        const centerX = canvasViewport.clientWidth / 2;
        const centerY = canvasViewport.clientHeight / 2;
        state.viewZoom = nextZoom;
        state.panX = clamp(midX - centerX - (pinchGesture.midX - centerX - pinchGesture.panX) * factor, -10000, 10000);
        state.panY = clamp(midY - centerY - (pinchGesture.midY - centerY - pinchGesture.panY) * factor, -10000, 10000);
        applyCanvasTransform();
        return;
      }
      if (!panGesture || panGesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - panGesture.startX;
      const dy = event.clientY - panGesture.startY;
      if (!panGesture.moved && Math.hypot(dx, dy) > 4) { panGesture.moved = true; capturePointer(event.pointerId); }
      if (state.frame) {
        const k = slideUnitsPerPixel();
        state.mapX = clamp(panGesture.mapX + dx * k, NUMBER_RANGES.mapX[0], NUMBER_RANGES.mapX[1]);
        state.mapY = clamp(panGesture.mapY + dy * k, NUMBER_RANGES.mapY[0], NUMBER_RANGES.mapY[1]);
        scheduleRender();
        return;
      }
      state.panX = clamp(panGesture.panX + dx, -10000, 10000);
      state.panY = clamp(panGesture.panY + dy, -10000, 10000);
      applyCanvasTransform();
    });
    const endPointer = event => {
      if (labelDrag) { endLabelDrag(event); return; }
      activePointers.delete(event.pointerId);
      if (pinchGesture) {
        if (activePointers.size < 2) {
          pinchGesture = null;
          suppressSelectionUntil = Date.now() + 250;
          if (state.frame) saveState(); else persist();
          if (!activePointers.size) canvasViewport.classList.remove("is-panning");
        }
        return;
      }
      if (!panGesture || panGesture.pointerId !== event.pointerId) return;
      if (panGesture.moved) {
        suppressSelectionUntil = Date.now() + 160;
        if (state.frame) saveState(); else persist();
      }
      panGesture = null;
      canvasViewport.classList.remove("is-panning");
    };
    canvasViewport.addEventListener("pointerup", endPointer);
    canvasViewport.addEventListener("pointercancel", endPointer);
  }

  function capturePointer(pointerId) {
    try { canvasViewport.setPointerCapture(pointerId); } catch (_) {}
  }

  // Slide units (the 1600-wide viewBox) per screen pixel of the artboard.
  function slideUnitsPerPixel() {
    return width / Math.max(artboard.getBoundingClientRect().width, 1);
  }

  // Scale the map on the slide about the pointer: the projection scales about its translate point, so the offset is
  // corrected to keep the map point under the cursor where it is.
  function zoomMap(nextZoom, clientX, clientY, continuous = true) {
    const rect = artboard.getBoundingClientRect();
    const k = width / Math.max(rect.width, 1);
    const ax = clientX === undefined ? width / 2 : (clientX - rect.left) * k;
    const ay = clientY === undefined ? height / 2 : (clientY - rect.top) * k;
    const newZoom = clamp(nextZoom, NUMBER_RANGES.zoom[0], NUMBER_RANGES.zoom[1]);
    const factor = newZoom / state.zoom;
    const tx = fitTranslate[0] + state.mapX, ty = fitTranslate[1] + state.mapY;
    state.mapX = clamp(ax - (ax - tx) * factor - fitTranslate[0], NUMBER_RANGES.mapX[0], NUMBER_RANGES.mapX[1]);
    state.mapY = clamp(ay - (ay - ty) * factor - fitTranslate[1], NUMBER_RANGES.mapY[0], NUMBER_RANGES.mapY[1]);
    state.zoom = newZoom;
    scheduleRender();
    saveState(continuous);
  }

  function resetMapPlacement() {
    state.zoom = 1; state.mapX = 0; state.mapY = 0;
    render(); saveState();
  }

  // Drags and wheel ticks re-project the map; coalesce them to one render per animation frame.
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function setProjection(value) {
    if (value === "globe" && state.mapStyle === "mosaic") return;
    state.projection = value;
    render(); saveState();
  }

  function zoomCanvas(nextZoom, anchorX, anchorY) {
    const oldZoom = state.viewZoom;
    const newZoom = clamp(nextZoom, NUMBER_RANGES.viewZoom[0], NUMBER_RANGES.viewZoom[1]);
    const viewportX = anchorX ?? canvasViewport.clientWidth / 2;
    const viewportY = anchorY ?? canvasViewport.clientHeight / 2;
    const centerX = canvasViewport.clientWidth / 2;
    const centerY = canvasViewport.clientHeight / 2;
    const factor = newZoom / oldZoom;
    state.panX = viewportX - centerX - (viewportX - centerX - state.panX) * factor;
    state.panY = viewportY - centerY - (viewportY - centerY - state.panY) * factor;
    state.viewZoom = newZoom;
    applyCanvasTransform();
    persist();
  }

  function fitCanvas() {
    state.viewZoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyCanvasTransform();
    persist();
  }

  function applyCanvasTransform() {
    // With a frame the slide is pinned to the centre of the stage; the board view only applies without one.
    const view = state.frame ? { zoom: 1, x: 0, y: 0 } : { zoom: state.viewZoom, x: state.panX, y: state.panY };
    artboard.style.transform = `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    document.getElementById("zoom-level").textContent = `${Math.round((state.frame ? state.zoom : state.viewZoom) * 100)}%`;
    // Graph paper follows the board: minor lines stay between 16 and 32 px (major every fourth), and the net is
    // anchored to the viewport's centre, where the slide sits.
    let spacing = GRID_SPACING * view.zoom;
    while (spacing < 16) spacing *= 2;
    while (spacing >= 32) spacing /= 2;
    const originX = canvasViewport.offsetLeft + canvasViewport.clientWidth / 2 - stage.clientWidth / 2;
    const originY = canvasViewport.offsetTop + canvasViewport.clientHeight / 2 - stage.clientHeight / 2;
    stage.style.setProperty("--grid-size", `${spacing}px`);
    stage.style.setProperty("--grid-x", `calc(50% + ${view.x + originX}px)`);
    stage.style.setProperty("--grid-y", `calc(50% + ${view.y + originY}px)`);
    if (state.mapSelected || mapHover) updateMapSelection();
    if (lensBase) updateLensFocus();
  }

  function bindCheck(id, key, callback) {
    document.getElementById(id).addEventListener("change", event => {
      state[key] = event.target.checked;
      if (callback) callback();
      restyle(); saveState();
    });
  }

  function bindColor(id, key) {
    bindColorInput(id, () => state[key], value => {
      state[key] = value;
      updateGradientControls();
      restyle(); saveState(true);
    });
  }

  // Colour swatch plus its HEX field: `current` supplies the value to fall back to, `apply` receives a valid lowercase hex.
  function bindColorInput(id, current, apply) {
    const input = document.getElementById(id);
    const textInput = document.querySelector(`[data-color-text-for="${id}"]`);
    const applyColor = value => {
      const normalized = value.toLowerCase();
      input.value = normalized;
      if (textInput) {
        textInput.value = normalized.toUpperCase();
        textInput.classList.remove("is-invalid");
        textInput.setAttribute("aria-invalid", "false");
      }
      apply(normalized);
    };
    input.addEventListener("input", event => {
      applyColor(event.target.value);
    });
    if (!textInput) return;
    textInput.addEventListener("input", () => {
      const normalized = normalizeHex(textInput.value, false);
      const completeLength = textInput.value.trim().replace(/^#/, "").length >= 6;
      textInput.classList.toggle("is-invalid", !normalized && completeLength);
      textInput.setAttribute("aria-invalid", String(!normalized && completeLength));
      if (normalized) applyColor(normalized);
    });
    const commitTextColor = () => {
      const normalized = normalizeHex(textInput.value, true);
      if (normalized) applyColor(normalized);
      else {
        textInput.value = current().toUpperCase();
        textInput.classList.remove("is-invalid");
        textInput.setAttribute("aria-invalid", "false");
      }
    };
    textInput.addEventListener("blur", commitTextColor);
    textInput.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); commitTextColor(); textInput.blur(); }
    });
  }

  function bindGradientStops() {
    const start = document.getElementById("gradient-start-position");
    const end = document.getElementById("gradient-end-position");
    start.addEventListener("input", event => {
      state.gradientStart = Math.min(Number(event.target.value), state.gradientEnd);
      event.target.value = state.gradientStart;
      updateGradientControls(); restyle(); saveState(true);
    });
    end.addEventListener("input", event => {
      state.gradientEnd = Math.max(Number(event.target.value), state.gradientStart);
      event.target.value = state.gradientEnd;
      updateGradientControls(); restyle(); saveState(true);
    });
  }

  function updateGradientControls() {
    const enabled = state.gradient;
    document.getElementById("fill-end-control").hidden = !enabled;
    document.getElementById("gradient-options").hidden = !enabled;
    document.getElementById("fill-color-grid").classList.toggle("is-single", !enabled);
    document.querySelector(".palette").classList.toggle("is-single", !enabled);
    document.getElementById("fill-start-label").textContent = enabled ? "Начало" : "Цвет";
    const track = document.getElementById("gradient-stops-track");
    track.style.setProperty("--start", `${state.gradientStart}%`);
    track.style.setProperty("--end", `${state.gradientEnd}%`);
    track.style.setProperty("--gradient-start", state.fillStart);
    track.style.setProperty("--gradient-end", state.fillEnd);
    document.getElementById("gradient-stops-value").textContent = `${state.gradientStart}% — ${state.gradientEnd}%`;
  }

  // The font can only be attached when it is one of the bundled ones; system fonts need no archive.
  function updateFontCompanionOption() {
    const font = LABEL_FONTS[state.labelFont];
    const option = document.getElementById("font-companion-option");
    const input = document.getElementById("font-companion");
    option.classList.toggle("is-disabled", !font.pack);
    input.disabled = !font.pack;
    document.getElementById("font-companion-text").textContent = font.pack
      ? `Приложить шрифт ${font.name}: TTF и лицензия, чтобы PPTX и SVG открылись с тем же шрифтом на другом компьютере`
      : `${font.name} есть на любом компьютере — прикладывать шрифт не нужно`;
  }

  function updateStyleControls() {
    const mosaic = state.mapStyle === "mosaic";
    document.querySelectorAll("[data-map-style]").forEach(el => el.classList.toggle("is-active", el.dataset.mapStyle === state.mapStyle));
    document.getElementById("mosaic-options").hidden = !mosaic;
    document.getElementById("dot-field-options").hidden = !state.dotField;
    document.querySelectorAll("[data-dot-shape]").forEach(el => el.classList.toggle("is-active", el.dataset.dotShape === state.dotShape));
    document.querySelectorAll("[data-dot-layout]").forEach(el => el.classList.toggle("is-active", el.dataset.dotLayout === state.dotLayout));
    document.getElementById("style-help").textContent = STYLE_HELP[state.mapStyle];
    ["marker-shape-row", "marker-size-row", "marker-outline-row"].forEach(id => { document.getElementById(id).hidden = mosaic; });
    document.querySelectorAll('[data-projection="globe"], [data-quick-projection="globe"]').forEach(el => {
      if (el.dataset.title === undefined) el.dataset.title = el.title;
      el.disabled = mosaic;
      el.title = mosaic ? "Линза недоступна в стиле «Мозаика»" : el.dataset.title;
    });
  }

  function updateProjectionControls() {
    document.getElementById("graticule-options").hidden = !state.graticule;
    document.querySelectorAll("[data-graticule-step]").forEach(el => el.classList.toggle("is-active", Number(el.dataset.graticuleStep) === state.graticuleStep));
  }

  function updateLabelModeControls() {
    document.getElementById("borders-enabled").checked = bordersOn();
    document.getElementById("border-controls").hidden = !bordersOn();
    document.getElementById("region-label-options").hidden = !state.regionLabels;
    document.getElementById("city-label-options").hidden = !state.cityLabels;
    document.getElementById("halo-options").hidden = !state.labelHalo;
    document.getElementById("leader-color-control").hidden = !state.leaderLines;
    document.getElementById("marker-outline-options").hidden = !state.markerOutline || state.mapStyle === "mosaic";
    document.querySelectorAll("[data-labels-mode]").forEach(el => el.classList.toggle("is-active", el.dataset.labelsMode === state.regionLabelsMode));
    document.querySelectorAll("[data-marker-shape]").forEach(el => el.classList.toggle("is-active", el.dataset.markerShape === state.markerShape));
  }

  function bindRange(id, key, outputId, format, transform, reprojects) {
    document.getElementById(id).addEventListener("input", event => {
      const raw = event.target.value;
      state[key] = transform(raw);
      document.getElementById(outputId).textContent = format(raw);
      reprojects ? render() : restyle();
      saveState(true);
    });
  }

  function syncTabs() {
    document.querySelectorAll(".tab").forEach(el => {
      const active = el.dataset.tab === state.tab;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function syncControls() {
    const pairs = {
      "dot-pitch": state.dotPitch, "dot-size": state.dotSize, "dot-field": state.dotField, "dot-field-color": state.dotFieldColor,
      "gradient-enabled": state.gradient, "fill-start": state.fillStart, "fill-end": state.fillEnd,
      "gradient-angle": state.angle, "gradient-start-position": state.gradientStart, "gradient-end-position": state.gradientEnd,
      "fill-opacity": Math.round(state.opacity * 100), "selected-color": state.selectedColor,
      "border-color": state.borderColor, "border-width": state.borderWidth,
      "region-labels-enabled": state.regionLabels, "region-labels-caps": state.regionLabelsCaps, "city-labels-enabled": state.cityLabels, "marker-color": state.markerColor,
      "region-font-size": state.regionFontSize, "city-font-size": state.cityFontSize, "leader-lines": state.leaderLines,
      "label-halo": state.labelHalo, "label-halo-width": state.labelHaloWidth, "label-halo-color": state.labelHaloColor,
      "leader-color": state.leaderColor, "marker-outline": state.markerOutline, "marker-outline-color": state.markerOutlineColor,
      "marker-size": state.markerSize, "rotation": state.rotation, "lens-strength": state.lensStrength, "frame-enabled": state.frame,
      "background-color": state.background, "transparent-background": state.transparent,
      "graticule-enabled": state.graticule, "graticule-color": state.graticuleColor, "compass-enabled": state.compass,
      "project-companion": state.projectCompanion, "font-companion": state.fontCompanion, "label-font": state.labelFont
    };
    Object.entries(pairs).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = value; else el.value = value;
    });
    document.querySelectorAll("[data-color-text-for]").forEach(textInput => {
      const colorInput = document.getElementById(textInput.dataset.colorTextFor);
      textInput.value = colorInput.value.toUpperCase();
      textInput.classList.remove("is-invalid");
      textInput.setAttribute("aria-invalid", "false");
    });
    document.getElementById("dot-size-value").textContent = `${state.dotSize}%`;
    document.getElementById("gradient-angle-value").textContent = `${state.angle}°`;
    document.getElementById("gradient-stops-value").textContent = `${state.gradientStart}% — ${state.gradientEnd}%`;
    document.getElementById("opacity-value").textContent = `${Math.round(state.opacity * 100)}%`;
    document.getElementById("marker-size-value").textContent = state.markerSize;
    document.getElementById("region-font-size-value").textContent = `${state.regionFontSize} px`;
    document.getElementById("city-font-size-value").textContent = `${state.cityFontSize} px`;
    document.getElementById("label-halo-width-value").textContent = `${String(state.labelHaloWidth).replace(".", ",")} px`;
    document.getElementById("rotation-value").textContent = `${Math.round(state.rotation)}°`;
    document.getElementById("lens-strength-value").textContent = `${Math.round(state.lensStrength)}%`;
    updateFontCompanionOption();
    updateStyleControls();
    updateGradientControls();
    updateLabelModeControls();
    updateProjectionControls();
    document.querySelectorAll("[data-ratio]").forEach(el => el.classList.toggle("is-active", el.dataset.ratio === state.ratio));
    syncTabs();
    document.getElementById("search").value = state.query;
    document.getElementById("selected-total").textContent = state.selectedRegions.size + state.selectedCities.size;
  }

  function resetAll() {
    Object.keys(defaults).forEach(key => state[key] = defaults[key]);
    state.query = "";
    state.selectedRegions.clear(); state.selectedCities.clear(); state.cityLabelOffsets = {};
    state.regionColors = {}; state.activeRegions.clear(); state.mapSelected = false;
    syncControls(); updateCanvasSize(); updateList(); updateSelectionBar(); render(); saveState();
    showToast("Настройки сброшены · ⌘Z вернёт всё обратно");
  }

  // Persistence: localStorage on every change; the undo history only records document changes (not view navigation).
  // `continuous` marks slider/colour drags so a whole drag collapses into one undo step.
  function saveState(continuous = false) { persist(); recordHistory(continuous); }

  function persist() {
    const serializable = { ...state, selectedRegions: [...state.selectedRegions], selectedCities: [...state.selectedCities] };
    delete serializable.query;
    delete serializable.activeRegions;
    delete serializable.mapSelected;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable)); } catch (_) {}
  }

  function loadSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!isPlainRecord(saved)) return;
      const settings = sanitizeSettings(saved);
      Object.keys(defaults).forEach(key => state[key] = settings[key]);
      enforceStyleRules();
      state.selectedRegions = new Set(sanitizeIds(saved.selectedRegions, regionIds, features.length));
      state.selectedCities = new Set(sanitizeIds(saved.selectedCities, cityIds, cities.length));
      state.cityLabelOffsets = sanitizeOffsets(saved.cityLabelOffsets, cityIds);
      state.regionColors = sanitizeColors(saved.regionColors, regionIds);
    } catch (_) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
  }

  function snapshot() {
    const doc = createProjectDocument();
    VIEW_KEYS.forEach(key => delete doc.settings[key]);
    delete doc.savedAt;
    return JSON.stringify(doc);
  }

  function recordHistory(continuous) {
    const next = snapshot();
    if (next === history.current) return;
    if (history.current !== null && !(continuous && history.burst)) {
      history.past.push(history.current);
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
      history.future = [];
    }
    history.current = next;
    clearTimeout(history.burst);
    history.burst = continuous ? setTimeout(() => { history.burst = null; }, HISTORY_BURST_MS) : null;
    updateHistoryButtons();
  }

  function undo() {
    if (!history.past.length) return;
    clearTimeout(history.burst); history.burst = null;
    history.future.push(history.current);
    history.current = history.past.pop();
    restoreSnapshot(history.current);
    showToast("Отменено");
  }

  function redo() {
    if (!history.future.length) return;
    clearTimeout(history.burst); history.burst = null;
    history.past.push(history.current);
    history.current = history.future.pop();
    restoreSnapshot(history.current);
    showToast("Повторено");
  }

  function restoreSnapshot(json) {
    const raw = JSON.parse(json);
    applyDocument({
      settings: sanitizeSettings(raw.settings),
      regions: sanitizeIds(raw.selection?.regions, regionIds, features.length),
      cities: sanitizeIds(raw.selection?.cities, cityIds, cities.length),
      labelOffsets: sanitizeOffsets(raw.labelOffsets, cityIds),
      regionColors: sanitizeColors(raw.regionColors, regionIds)
    }, { keepView: true });
    persist();
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    document.getElementById("undo").disabled = !history.past.length;
    document.getElementById("redo").disabled = !history.future.length;
  }

  function createProjectDocument() {
    const settings = Object.create(null);
    PROJECT_SETTING_KEYS.forEach(key => { settings[key] = state[key]; });
    const labelOffsets = Object.create(null);
    Object.keys(state.cityLabelOffsets).sort().forEach(id => { labelOffsets[id] = state.cityLabelOffsets[id]; });
    const regionColors = Object.create(null);
    Object.keys(state.regionColors).filter(id => state.selectedRegions.has(id)).sort().forEach(id => { regionColors[id] = state.regionColors[id]; });
    return {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      application: "Редактор карты России",
      settings,
      selection: {
        regions: [...state.selectedRegions].sort(),
        cities: [...state.selectedCities].sort()
      },
      regionColors,
      labelOffsets
    };
  }

  function downloadProject(filename = exportFilename("project.json"), announce = true) {
    const json = JSON.stringify(createProjectDocument(), null, 2);
    downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), filename);
    if (announce) showToast("Редактируемый проект сохранён");
  }

  async function importProjectFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!file.name.toLocaleLowerCase("ru").endsWith(".json")) throw new Error("нужен файл с расширением .json");
      if (file.size < 2 || file.size > MAX_PROJECT_BYTES) throw new Error("размер проекта должен быть не больше 256 КБ");
      const project = parseProjectDocument(await file.text());
      applyDocument(project);
      saveState();
      showToast("Проект открыт — можно продолжать редактирование");
    } catch (error) {
      console.warn("Project import rejected:", error);
      showToast(`Файл не открыт: ${error.message || "неверный формат"}`);
    } finally {
      input.value = "";
    }
  }

  function parseProjectDocument(text) {
    let raw;
    try { raw = JSON.parse(text); }
    catch (_) { throw new Error("это не корректный JSON"); }
    if (!isPlainRecord(raw) || hasBlockedKeys(raw)) throw new Error("неверная структура проекта");
    if (raw.format !== PROJECT_FORMAT) throw new Error("файл создан не этим редактором");
    if (raw.version !== PROJECT_VERSION) throw new Error(`версия проекта ${String(raw.version)} не поддерживается`);
    if (!isPlainRecord(raw.settings) || !isPlainRecord(raw.selection) || hasBlockedKeys(raw.settings) || hasBlockedKeys(raw.selection)) {
      throw new Error("неверная структура настроек");
    }
    return {
      settings: sanitizeSettings(raw.settings, true),
      regions: sanitizeIds(raw.selection.regions, regionIds, features.length, true),
      cities: sanitizeIds(raw.selection.cities, cityIds, cities.length, true),
      labelOffsets: sanitizeOffsets(raw.labelOffsets, cityIds, true),
      regionColors: sanitizeColors(raw.regionColors, regionIds, true)
    };
  }

  function sanitizeSettings(input, strict = false) {
    if (!isPlainRecord(input)) {
      if (strict) throw new Error("настройки должны быть объектом");
      return { ...defaults };
    }
    const clean = { ...defaults };
    const keys = strict ? PROJECT_SETTING_KEYS : Object.keys(defaults);
    keys.forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(input, key)) return;
      let value = input[key];
      let valid = false;
      if (BOOLEAN_SETTINGS.has(key)) valid = typeof value === "boolean";
      else if (COLOR_SETTINGS.has(key)) valid = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
      else if (NUMBER_RANGES[key]) {
        valid = typeof value === "number" && Number.isFinite(value);
        if (valid) value = clamp(value, NUMBER_RANGES[key][0], NUMBER_RANGES[key][1]);
      }
      else if (ENUM_SETTINGS[key]) valid = ENUM_SETTINGS[key].includes(value);
      if (!valid) {
        if (strict) throw new Error(`недопустимое значение настройки «${key}»`);
        return;
      }
      clean[key] = value;
    });
    if (clean.gradientStart > clean.gradientEnd) {
      if (strict) throw new Error("начальная точка градиента не может быть правее конечной");
      clean.gradientStart = defaults.gradientStart;
      clean.gradientEnd = defaults.gradientEnd;
    }
    return clean;
  }

  function sanitizeIds(value, allowlist, maxItems, strict = false) {
    if (!Array.isArray(value) || value.length > maxItems) {
      if (strict) throw new Error("неверный список выбранных объектов");
      return [];
    }
    const clean = [];
    const seen = new Set();
    for (const id of value) {
      if (typeof id !== "string" || id.length > 120) {
        if (strict) throw new Error("неверный идентификатор объекта");
        continue;
      }
      if (allowlist.has(id) && !seen.has(id)) { seen.add(id); clean.push(id); }
    }
    return clean;
  }

  function sanitizeColors(value, allowlist, strict = false) {
    const clean = {};
    if (value === undefined || value === null) return clean;
    if (!isPlainRecord(value) || hasBlockedKeys(value) || Object.keys(value).length > allowlist.size) {
      if (strict) throw new Error("неверный список цветов регионов");
      return clean;
    }
    for (const [id, color] of Object.entries(value)) {
      const ok = allowlist.has(id) && typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
      if (!ok) {
        if (strict) throw new Error("неверный цвет региона");
        continue;
      }
      clean[id] = color.toLowerCase();
    }
    return clean;
  }

  function sanitizeOffsets(value, allowlist, strict = false) {
    const clean = {};
    if (value === undefined || value === null) return clean;
    if (!isPlainRecord(value) || hasBlockedKeys(value) || Object.keys(value).length > allowlist.size) {
      if (strict) throw new Error("неверный список положений подписей");
      return clean;
    }
    for (const [id, offset] of Object.entries(value)) {
      const ok = allowlist.has(id) && Array.isArray(offset) && offset.length === 2
        && offset.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= LABEL_OFFSET_LIMIT);
      if (!ok) {
        if (strict) throw new Error("неверное положение подписи города");
        continue;
      }
      clean[id] = [offset[0], offset[1]];
    }
    return clean;
  }

  function applyDocument(project, { keepView = false } = {}) {
    const view = { viewZoom: state.viewZoom, panX: state.panX, panY: state.panY };
    PROJECT_SETTING_KEYS.forEach(key => state[key] = project.settings[key]);
    enforceStyleRules();
    if (keepView) Object.assign(state, view);
    state.selectedRegions = new Set(project.regions);
    state.selectedCities = new Set(project.cities);
    state.cityLabelOffsets = project.labelOffsets || {};
    state.regionColors = project.regionColors || {};
    state.activeRegions.forEach(id => { if (!state.selectedRegions.has(id)) state.activeRegions.delete(id); });
    syncControls(); updateCanvasSize(); updateList(); updateSelectionBar(); render();
  }

  function isPlainRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasBlockedKeys(value) {
    return ["__proto__", "prototype", "constructor"].some(key => Object.prototype.hasOwnProperty.call(value, key));
  }

  function getExportSvg({ omitLabels = false } = {}) {
    const source = svg.node();
    const clone = source.cloneNode(true);
    const bounds = state.frame ? { x: 0, y: 0, width, height } : paddedBounds(document.getElementById("export-content").getBBox(), 26);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    clone.setAttribute("width", bounds.width);
    clone.setAttribute("height", bounds.height);
    clone.querySelector("#export-content").removeAttribute("mask");
    clone.querySelector("#frame-fade").remove();
    clone.querySelector("#active-outline").remove();
    clone.querySelector("#map-selection").remove();
    clone.querySelector("#lens-focus").remove();
    // Mosaic without borders: the invisible hit polygons only add weight to the file.
    if (state.mapStyle === "mosaic" && !bordersOn()) clone.querySelector("#regions-layer").remove();
    const bg = clone.querySelector("#export-background");
    bg.removeAttribute("display");
    bg.setAttribute("x", bounds.x); bg.setAttribute("y", bounds.y); bg.setAttribute("width", bounds.width); bg.setAttribute("height", bounds.height);
    if (!state.frame && state.transparent) bg.setAttribute("fill-opacity", "0");
    if (omitLabels) clone.querySelectorAll(".city-label, .region-label").forEach(label => label.remove());
    clone.querySelectorAll("[display='none']").forEach(el => el.remove());
    clone.querySelectorAll("[tabindex], [role], [aria-label]").forEach(el => {
      el.removeAttribute("tabindex"); el.removeAttribute("role"); el.removeAttribute("aria-label");
    });
    clone.querySelectorAll(".is-hover, .is-selected, .is-manual").forEach(el => el.classList.remove("is-hover", "is-selected", "is-manual"));
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = `text{font-family:${mapFont()};font-weight:bold}.region{vector-effect:non-scaling-stroke}.country-outline{fill:none;vector-effect:non-scaling-stroke}.graticule{fill:none;vector-effect:non-scaling-stroke}.compass text{text-anchor:middle;paint-order:stroke;stroke-linejoin:round}.region-label{text-anchor:middle}.region-label,.city-label{paint-order:stroke;stroke-linejoin:round}.city-marker__ring{fill:none;stroke-width:1;opacity:.3}${state.mapStyle === "mosaic" ? "" : ".city-marker{filter:url(#marker-shadow)}"}.city-leader{stroke-linecap:round}`;
    clone.insertBefore(style, clone.firstChild);
    return { xml: new XMLSerializer().serializeToString(clone), width: bounds.width, height: bounds.height, bounds };
  }

  async function exportFile(format) {
    const label = format === "copy" ? "копию" : format.toUpperCase();
    try {
      showToast(`Готовим ${label}…`, true);
      if (format === "copy") {
        await copyPngToClipboard();
        showToast("PNG скопирован — вставьте в презентацию");
        return;
      }
      const stem = exportStem();
      let blob;
      if (format === "svg") blob = new Blob([getExportSvg().xml], { type: "image/svg+xml;charset=utf-8" });
      else if (format === "png") blob = (await renderPng(2)).blob;
      else if (format === "pptx") blob = await exportPptx();
      else return;
      const font = LABEL_FONTS[state.labelFont];
      const withFont = state.fontCompanion && !!font.pack;
      if (state.projectCompanion || withFont) {
        const attached = await downloadBundle(blob, `${stem}.${format}`, stem, { project: state.projectCompanion, font: withFont ? font : null });
        showToast(`${label}${attached.join("")} — одним ZIP`);
      } else {
        downloadBlob(blob, `${stem}.${format}`);
        showToast(`${label} готов`);
      }
    } catch (error) {
      console.error(error);
      showToast(`Ошибка экспорта: ${error.message || "попробуйте ещё раз"}`);
    }
  }

  // The export goes out as one ZIP with its project and/or the label font: browsers block or question a second
  // download that follows the first, and the font must travel with its licence.
  async function downloadBundle(blob, filename, stem, { project, font }) {
    const attached = [];
    const projectName = `${stem}.project.json`;
    const json = project ? JSON.stringify(createProjectDocument(), null, 2) : null;
    if (!window.JSZip) {
      downloadBlob(blob, filename);
      if (json) { setTimeout(() => downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), projectName), 180); attached.push(" и JSON-проект"); }
      return attached;
    }
    const zip = new window.JSZip();
    // PNG and PPTX are already compressed; deflating them again only costs time.
    zip.file(filename, blob, { compression: /\.(svg|json)$/i.test(filename) ? "DEFLATE" : "STORE" });
    if (json) { zip.file(projectName, json, { compression: "DEFLATE" }); attached.push(" и JSON-проект"); }
    if (font) {
      try {
        const folder = `fonts/${font.name}`;
        for (const file of [...font.files, "OFL.txt"]) {
          const response = await fetch(`fonts/pack/${font.pack}/${encodeURIComponent(file)}`);
          if (!response.ok) throw new Error(`${file}: ${response.status}`);
          zip.file(`${folder}/${file}`, await response.arrayBuffer(), { compression: file.endsWith(".txt") ? "DEFLATE" : "STORE" });
        }
        zip.file("fonts/README.txt", "\ufeff" + fontReadme(font), { compression: "DEFLATE" });
        attached.push(` и шрифт ${font.name}`);
      } catch (error) {
        console.error(error);
        showToast("Шрифт не приложен: файлы шрифта недоступны (откройте редактор по http, а не как файл)", true);
      }
    }
    downloadBlob(await zip.generateAsync({ type: "blob", mimeType: "application/zip" }), `${stem}.zip`);
    return attached;
  }

  function fontReadme(font) {
    return [
      `Шрифт подписей на карте — ${font.name}.`,
      "",
      "Чтобы PPTX и SVG открылись с тем же шрифтом на другом компьютере, установите его:",
      "  Windows — правой кнопкой по файлу .ttf → «Установить» (или «Установить для всех пользователей»);",
      "  macOS — двойной клик по .ttf → «Установить шрифт».",
      "После установки перезапустите PowerPoint. В PowerPoint можно также включить «Файл → Параметры → Сохранение →",
      "Внедрить шрифты в файл», и презентация станет самодостаточной.",
      "",
      `Шрифт распространяется по лицензии SIL Open Font License 1.1 — см. OFL.txt в папке «${font.name}».`,
      "Файлы шрифта не изменены и взяты из каталога Google Fonts: https://fonts.google.com/"
    ].join("\n");
  }

  async function copyPngToClipboard() {
    if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error("браузер не поддерживает копирование изображений");
    const blobPromise = renderPng(2).then(result => result.blob);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
    } catch (_) {
      const blob = await blobPromise;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }
  }

  function renderPng(scale, sourceData) {
    const data = sourceData || getExportSvg();
    return new Promise((resolve, reject) => {
      const blob = new Blob([data.xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(data.width * scale); canvas.height = Math.round(data.height * scale);
        const context = canvas.getContext("2d");
        context.scale(scale, scale);
        context.drawImage(image, 0, 0, data.width, data.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(output => output ? resolve({ blob: output, width: data.width, height: data.height }) : reject(new Error("PNG не создан")), "image/png");
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG не отрисован")); };
      image.src = url;
    });
  }

  async function exportPptx() {
    if (!window.PptxGenJS) throw new Error("Модуль PPTX не загружен");
    const vector = getExportSvg({ omitLabels: true });
    const dataUri = svgToDataUri(vector.xml);
    const pptx = new PptxGenJS();
    pptx.author = "Редактор карты России · map.kachkovenko.com";
    pptx.subject = "Карта России";
    pptx.title = "Карта России";
    pptx.company = "map.kachkovenko.com";
    pptx.lang = "ru-RU";
    pptx.layout = state.ratio === "4:3" ? "LAYOUT_4X3" : "LAYOUT_WIDE";
    const slide = pptx.addSlide();
    slide.background = { color: (state.transparent ? "FFFFFF" : state.background.slice(1)).toUpperCase() };
    const slideW = state.ratio === "4:3" ? 10 : 13.333;
    const slideH = 7.5;
    const imageRatio = vector.width / vector.height;
    const slideRatio = slideW / slideH;
    let x = 0, y = 0, w = slideW, h = slideH;
    if (!state.frame) {
      if (imageRatio > slideRatio) { w = slideW; h = w / imageRatio; y = (slideH - h) / 2; }
      else { h = slideH; w = h * imageRatio; x = (slideW - w) / 2; }
    }
    slide.addImage({ data: dataUri, x, y, w, h, altText: "Карта России" });
    addEditableLabels(slide, vector, { x, y, w, h, slideW, slideH });
    slide.addNotes("Создано в редакторе карты России (map.kachkovenko.com). Состав субъектов — по статье 65 Конституции РФ. Часть показанных границ международно оспаривается.");
    const [pptxBlob, pngFallback] = await Promise.all([
      pptx.write({ outputType: "blob", compression: true }),
      renderPng(1, vector)
    ]);
    return replaceSvgFallbacks(pptxBlob, pngFallback.blob);
  }

  // Every label becomes a native PowerPoint text box: font, size, colour, alignment and the halo (as a text glow) are
  // real text attributes, so what the user sees on the map is what they can edit on the slide.
  function addEditableLabels(slide, vector, imageBox) {
    const { bounds } = vector;
    const { x, y, w, h, slideW, slideH } = imageBox;
    const unit = w / bounds.width; // inches per SVG unit
    const glow = state.labelHalo
      ? { size: Math.round(clamp(state.labelHaloWidth * unit * 72 * 2, .5, 12) * 10) / 10, opacity: 1, color: state.labelHaloColor.slice(1).toUpperCase() }
      : null;
    const place = (text, px, py, anchor, fontPx, color, tracking = 0) => {
      const baseX = x + (px - bounds.x) * unit;
      const baseY = y + (py - bounds.y) * unit;
      if (baseX < x - .3 || baseX > x + w + .3 || baseY < y - .3 || baseY > y + h + .3) return;
      const fontSize = clamp(fontPx * unit * 72, 5, 48);
      const textW = (textWidth(text, fontPx) + fontPx * tracking * text.length) * unit + fontSize / 72 * .3;
      const textH = Math.max(.14, fontSize * 1.3 / 72);
      let textX = anchor === "end" ? baseX - textW : anchor === "middle" ? baseX - textW / 2 : baseX;
      textX = clamp(textX, 0, Math.max(0, slideW - textW));
      const textY = clamp(baseY - fontSize * .35 / 72 - textH / 2, 0, Math.max(0, slideH - textH));
      const options = {
        x: textX, y: textY, w: textW, h: textH,
        margin: 0, fontFace: LABEL_FONTS[state.labelFont].name, fontSize: Math.round(fontSize * 10) / 10, bold: true,
        color: color.slice(1).toUpperCase(),
        align: anchor === "end" ? "right" : anchor === "middle" ? "center" : "left",
        valign: "mid", breakLine: false, isTextBox: true
      };
      if (tracking) options.charSpacing = Math.round(fontSize * tracking * 10) / 10;
      if (glow) options.glow = glow;
      slide.addText(text, options);
    };
    if (state.regionLabels) {
      const color = darken(state.fillStart, .7);
      features.forEach(d => {
        if (!shownRegionLabels.has(d.properties.id)) return;
        place(regionLabelText(d), d.centroid[0], d.centroid[1], "middle", state.regionFontSize, color, state.regionLabelsCaps ? CAPS_TRACKING : 0);
      });
    }
    if (state.cityLabels) {
      cities.forEach(city => {
        if (!state.selectedCities.has(city.id) || !city.point || !city.label) return;
        place(city.name, city.point[0] + city.label.dx, city.point[1] + city.label.dy, city.label.anchor, state.cityFontSize, state.markerColor);
      });
    }
  }

  async function replaceSvgFallbacks(pptxBlob, pngBlob) {
    if (!window.JSZip) return pptxBlob;
    const zip = await window.JSZip.loadAsync(pptxBlob);
    const fallbackBytes = await pngBlob.arrayBuffer();
    let replacements = 0;
    for (const name of Object.keys(zip.files)) {
      if (!/^ppt\/media\/.*\.png$/i.test(name)) continue;
      const file = zip.file(name);
      if (!file) continue;
      const bytes = await file.async("uint8array");
      const header = new TextDecoder().decode(bytes.subarray(0, 160));
      if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(header)) continue;
      zip.file(name, fallbackBytes);
      replacements += 1;
    }
    if (!replacements) return pptxBlob;
    return zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });
  }

  function regionHover(event, d) {
    const p = d.properties;
    showTooltip(event, `<b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.capital)} · ${escapeHtml(p.fd)}</small>`);
    hoverDots(p.id);
    setListHover(p.id);
  }

  function cityHover(event, d) {
    if (labelDrag) return;
    showTooltip(event, `<b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.region)}${state.cityLabelOffsets[d.id] ? " · подпись сдвинута вручную" : ""}</small>`);
    setListHover(d.id);
  }
  function showTooltip(event, html) { tooltip.innerHTML = html; tooltip.hidden = false; tooltip.style.left = `${event.clientX}px`; tooltip.style.top = `${event.clientY}px`; }
  function hideTooltip() { tooltip.hidden = true; hoverDots(null); setListHover(null); }

  function showToast(message, persistent) {
    const toast = document.getElementById("toast");
    clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
    if (!persistent) toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function closePanels() { document.querySelectorAll(".panel-column").forEach(panel => panel.classList.remove("is-open")); }
  // Closes both header popovers (export and import).
  function closeExportMenu() {
    document.getElementById("export-popover").hidden = true;
    document.getElementById("export-main").setAttribute("aria-expanded", "false");
    document.getElementById("import-popover").hidden = true;
    document.getElementById("import-project").setAttribute("aria-expanded", "false");
  }
  function exportStem() {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `karta-rossii-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }
  function exportFilename(extension) { return `${exportStem()}.${extension}`; }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function svgToDataUri(xml) {
    const bytes = new TextEncoder().encode(xml);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  }
  function paddedBounds(b, pad) { return { x: b.x - pad, y: b.y - pad, width: Math.max(1, b.width + pad * 2), height: Math.max(1, b.height + pad * 2) }; }
  function normalize(value) { return String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").trim(); }
  function normalizeHex(value, allowShort) {
    const raw = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
    if (allowShort && /^[0-9a-fA-F]{3}$/.test(raw)) {
      return `#${raw.split("").map(char => char + char).join("").toLowerCase()}`;
    }
    return null;
  }
  function slug(value) { return normalize(value).replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, ""); }
  function shortRegionName(name) { return name.replace("Республика ", "").replace(" область", " обл.").replace(" автономный округ", " АО"); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function darken(hex, amount) {
    const value = hex.replace("#", "");
    const rgb = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
    return `#${rgb.map(channel => Math.round(channel * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
})();
