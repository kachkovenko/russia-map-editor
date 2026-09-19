"use strict";

const assert = require("node:assert/strict");
const { migratedGlobeGloss } = require("../lib/map-project.js");

assert.equal(migratedGlobeGloss({ globeLight: 37 }, 65), 37, "legacy light migrates to gloss");
assert.equal(migratedGlobeGloss({ globeLight: 0 }, 65), 0, "zero legacy light is preserved");
assert.equal(migratedGlobeGloss({ globeLight: 37, globeGloss: 12 }, 65), 12, "new gloss wins");
assert.equal(migratedGlobeGloss({}, 65), 65, "default is used only when both values are absent");

console.log("Verified legacy globe-light migration, including zero and independent gloss.");
