// aifocus-0zk6: the /stats/ charts used to identify every series by colour
// alone - a filled legend dot and a solid 1px line in the same --viz-N - so a
// reader who cannot separate the hues (a green and a teal, a red and an orange
// among eleven) could not map a line back to a tool. WCAG 1.4.1 wants colour
// not to be the only visual means. Each slot now carries a dash pattern in
// addition to its colour, and the legend/tooltip swatches are miniature
// strokes, so the channels cannot disagree. This reads the sources because
// nothing else in the gate can see a legend regress to a filled dot.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const page = read("layouts/stats/page.html");
const script = read("assets/js/stats-page.js");
const stats = JSON.parse(read("data/stats.json"));
const slots = new Set();
(function collect(node) {
  if (Array.isArray(node)) return node.forEach(collect);
  if (node && typeof node === "object") {
    if (Number.isInteger(node.slot)) slots.add(node.slot);
    for (const value of Object.values(node)) collect(value);
  }
})(stats);

const token = (name) => {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(page);
  return m ? m[1].trim() : null;
};

test("every series slot has a dash pattern as well as a colour", () => {
  assert.ok(slots.size >= 2, "no multi-series figures found in data/stats.json");
  const dashes = [];
  for (const slot of [...slots].sort((a, b) => a - b)) {
    assert.ok(token(`--viz-${slot}`), `slot ${slot} has no --viz-${slot} colour`);
    const dash = token(`--viz-dash-${slot}`);
    assert.ok(dash, `slot ${slot} has no --viz-dash-${slot}, so its series is colour-only`);
    dashes.push(dash);
  }
  assert.equal(new Set(dashes).size, dashes.length, "two slots share a dash pattern, so they are separable by colour only");
});

test("the plotted line and the swatches carry the pattern, not just the colour", () => {
  assert.match(script, /function dashStyle\(slot\)/, "the chart script has no per-slot dash helper");
  assert.match(
    script,
    /el\("path",\s*\{[^}]*style:\s*dashStyle\(/,
    "the plotted path does not set stroke-dasharray from the slot",
  );
  assert.equal(script.match(/swatchFor\(/g).length >= 3, true, "the legend and tooltip should both use the stroke swatch");
  assert.doesNotMatch(script, /className = "swatch";\s*sw\.style\.background/, "a swatch is still a filled colour dot");
  assert.doesNotMatch(page, /\.chart-host\s+svg\s*\{/, ".chart-host svg descendant rule stretches <svg class='swatch'> inside .chart-tip; scope with .chart-host > svg");
});
