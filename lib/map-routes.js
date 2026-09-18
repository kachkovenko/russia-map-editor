// Deterministic, bounded route topology. No DOM, network or executable project content.
(function (root) {
  "use strict";
  function edges(ids, mode, hub, seed = 1) {
    const nodes = [...new Set(ids)].slice(0, 150);
    if (nodes.length < 2 || mode === "off") return [];
    if (mode === "hub") {
      const center = nodes.includes(hub) ? hub : nodes[0];
      return nodes.filter(id => id !== center).map(id => [center, id]);
    }
    if (mode === "chain") return nodes.slice(1).map((id, i) => [nodes[i], id]);
    if (mode !== "network") return [];
    let s = (Math.round(seed) >>> 0) || 1;
    const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const shuffled = nodes.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // A spanning chain keeps every city connected; add a few chords, without duplicate edges.
    const result = shuffled.slice(1).map((id, i) => [shuffled[i], id]);
    const key = (a, b) => [a, b].sort().join("|");
    const seen = new Set(result.map(([a, b]) => key(a, b)));
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[Math.floor(random() * nodes.length)], b = nodes[Math.floor(random() * nodes.length)];
      if (a !== b && !seen.has(key(a, b))) { seen.add(key(a, b)); result.push([a, b]); }
    }
    return result;
  }
  const api = { edges };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MapRoutes = api;
})(typeof window === "object" ? window : globalThis);
