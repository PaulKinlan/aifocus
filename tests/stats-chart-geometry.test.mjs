// aifocus-np8y: the pointer coordinate arithmetic of the /stats/ charts has
// regressed twice (aifocus-lb2d's inverted mapping, aifocus-rs97's inverted
// tooltip transform) while the gate stayed green, because the only chart
// suite asserted source text and never executed the math. This file imports
// the production module assets/js/stats-chart-geometry.js directly - the
// same file the stats page's js.Build bundles - and asserts explicit numbers
// for the regimes that produced those bugs: an unscaled chart (host at or
// above the 280px viewBox floor), a CSS-scaled chart (the 280/268 case the
// lb2d reviewer measured), a narrowed host after reflow, and both tooltip
// placement branches with their clamps.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cssScale,
  cssToUser,
  userToCss,
  nearestIndex,
  tooltipLeft,
  tooltipTop,
} from "../assets/js/stats-chart-geometry.js";

// The measured lb2d/rS97 regime: viewBox 280 user units drawn into a 268px
// CSS box (300px viewport).
const SCALED = cssScale(280, 268);

test("cssScale: 1:1 at or above the floor, attrWidth/cssWidth below it, no zero division", () => {
  assert.equal(cssScale(1056, 1056), 1, "desktop charts are unscaled");
  assert.ok(Math.abs(cssScale(280, 268) - 280 / 268) < 1e-12);
  assert.equal(cssScale(280, 0), 1, "a hidden host must not divide by zero");
});

test("cssToUser/userToCss: the pointer maps into user units and the column back out", () => {
  // the real hover sample from the landed-tree verification at 300px
  assert.ok(Math.abs(cssToUser(134, SCALED) - 140) < 1e-9);
  assert.ok(Math.abs(userToCss(270.9, SCALED) - 270.9 * (268 / 280)) < 1e-9);
  assert.equal(userToCss(cssToUser(200, SCALED), SCALED), 200, "round trip is exact");
  assert.equal(cssToUser(400, 1), 400, "unscaled chart: identity");
});

test("nearestIndex: the period line nearest the pointer wins, edges clamp", () => {
  const xs = [48, 51.96, 55.93, 59.89]; // uniform ~3.96 user-unit spacing
  assert.equal(nearestIndex(xs, 48), 0);
  assert.equal(nearestIndex(xs, 47.99), 0, "just left of the first line still picks it");
  assert.equal(nearestIndex(xs, 50.5), 1, "clearly right of the midpoint belongs to the right line");
  assert.equal(nearestIndex(xs, 56.5), 2);
  assert.equal(nearestIndex(xs, 100), 3, "beyond the last line clamps to it");
});

test("tooltipLeft: 12px right of the column, flips to stop 12px short, never negative", () => {
  // desktop identity: column 391.38, tooltip 200px wide, chart 1056px
  assert.equal(tooltipLeft(391.38, 200, 1056), 403.38);
  // the rS97 flipped case at 300px: column 243.22, tooltip 207px, box 268px
  assert.ok(Math.abs(tooltipLeft(243.22, 207, 268) - 24.22) < 1e-9,
    "flipped left = column - tipWidth - 12");
  // a flip that would run past the left edge clamps to the chart edge
  assert.equal(tooltipLeft(61.12, 200, 268), 0);
  // exactly fits on the right: no flip
  assert.equal(tooltipLeft(56, 200, 268), 68);
});

test("tooltipTop: 10px above the pointer, clamped inside the CSS plot height", () => {
  // desktop identity: height 360 user units at scale 1, pointer 150
  assert.equal(tooltipTop(150, 1, 107, 360), 140);
  // the 300px regime: attrHeight 220 at scale 1.0448 -> 210.56px CSS box
  const fitBound = 220 / SCALED - 107; // 103.56: tooltip bottom on the box edge
  assert.ok(Math.abs(tooltipTop(180, SCALED, 107, 220) - fitBound) < 1e-9,
    "the clamp binds in CSS space when the pointer sits low");
  assert.equal(tooltipTop(60, SCALED, 107, 220), 50, "high pointer: plain -10px offset");
  assert.equal(tooltipTop(4, 1, 107, 220), 0, "never negative");
});

test("a reflow that changes the CSS box between renders remaps every conversion", () => {
  // The zrdn class of bug came from caching geometry across a layout change.
  // These functions hold no state, so the contract side of "reflow without
  // scroll" is: the same call with the NEW box width produces the NEW
  // mapping, with no memory of the old one.
  const before = cssScale(280, 268);
  const after = cssScale(280, 244); // a narrower host after a sibling insertion
  assert.ok(after > before, "a narrower box raises user-units-per-css-px");
  assert.ok(Math.abs(cssToUser(120, after) - 120 * (280 / 244)) < 1e-9);
  assert.equal(userToCss(cssToUser(120, after), after), 120);
});
