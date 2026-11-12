// Pure coordinate contract for the /stats/ charts (aifocus-np8y): the
// arithmetic that maps a pointer event onto a chart period and places the
// tooltip. No DOM, no state - stats-page.js hands in numbers and gets
// numbers back, so tests/stats-chart-geometry.test.mjs executes exactly
// what the browser runs, and a geometry regression fails a unit test
// instead of surfacing in a review round (aifocus-rs97's inverted
// transform passed a 15s gate because nothing executed this code).
//
// Units: the svg carries a viewBox of attrWidth user units but CSS-sizes
// to cssWidth px, so below the 280px viewBox floor one CSS px is
// attrWidth/cssWidth user units (aifocus-lb2d). cssScale is that ratio -
// user units per CSS px - and every function takes or returns one space
// explicitly. Being stateless is part of the contract: a layout change
// between renders cannot leave stale geometry behind, because none is kept.

// User units per CSS px for the current render. A hidden or zero-width host
// falls back to 1 so the caller cannot divide by zero.
export function cssScale(attrWidth, cssWidth) {
  return cssWidth > 0 ? attrWidth / cssWidth : 1;
}

// Pointer position (CSS px, from ev.offsetX/Y) into viewBox user units -
// the space x(i) lives in.
export function cssToUser(cssPx, scale) {
  return cssPx * scale;
}

// A user-unit position (a period column) back into CSS px - the space the
// tooltip is written in.
export function userToCss(userUnits, scale) {
  return userUnits / scale;
}

// Index of the period line nearest to a pointer position given in user
// units. xs are the per-period x(i) positions of the current render.
export function nearestIndex(xs, userPx) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    const d = Math.abs(xs[i] - userPx);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// Horizontal tooltip placement in CSS px: prefer 12px right of the hovered
// column, flip to its left when the tooltip would leave the chart, and never
// go negative. The 12px gap, the flip and the edge clamp are the chart's own
// long-standing convention.
export function tooltipLeft(columnCss, tipWidth, cssWidth) {
  const left =
    columnCss + 12 + tipWidth > cssWidth ? columnCss - tipWidth - 12 : columnCss + 12;
  return Math.max(0, left);
}

// Vertical tooltip placement in CSS px: 10px above the pointer, clamped to
// the plot's CSS height (attrHeight/scale) so the tooltip never spills over
// the axis row below the chart.
export function tooltipTop(offsetYCss, scale, tipHeight, attrHeight) {
  return Math.max(0, Math.min(offsetYCss - 10, attrHeight / scale - tipHeight));
}

// Caller conveniences binding the event to the contract, so the page's
// handler carries no unit arithmetic of its own. nearestPeriod() converts
// the pointer and picks the line; placeTooltip() returns the CSS left/top
// for the hovered period once the tooltip's size is measured.
export function nearestPeriod(offsetX, xs, scale) {
  return nearestIndex(xs, cssToUser(offsetX, scale));
}

export function placeTooltip(offsetX, offsetY, tipWidth, tipHeight, xs, best, scale, cssWidth, attrHeight) {
  const columnCss = userToCss(xs[best], scale);
  return { left: tooltipLeft(columnCss, tipWidth, cssWidth), top: tooltipTop(offsetY, scale, tipHeight, attrHeight) };
}
