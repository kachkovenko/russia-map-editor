(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MapProject = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function migratedGlobeGloss(settings, fallback) {
    if (!settings || typeof settings !== "object") return fallback;
    if (Object.prototype.hasOwnProperty.call(settings, "globeGloss")) return settings.globeGloss;
    if (Object.prototype.hasOwnProperty.call(settings, "globeLight")) return settings.globeLight;
    return fallback;
  }

  return Object.freeze({ migratedGlobeGloss });
});
