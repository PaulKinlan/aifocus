// aifocus-47ax: a form control's boundary is the visual information that
// identifies it - an empty text input has no label inside - so WCAG 1.4.11's
// 3:1 applies to it against every fill it touches. The site's decorative
// hairline (--line) is 1.64:1 on the dark input fill, which is why the
// controls have their own token. This reads the stylesheet sources because
// nothing else in the gate can see a token value regress, and computes the
// ratios itself so the numbers cannot drift from the comments.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const css = read("themes/aifocustheme/assets/css/main.css");
const palette = read("themes/aifocustheme/assets/css/palette.css");

const MIN = 3; // WCAG 1.4.11, non-text contrast

// The body of the first block that starts at `marker`, by brace counting.
function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} not found`);
  const open = source.indexOf("{", start + marker.length);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced block after ${marker}`);
}

// `--token: value;` declarations in a block body, keyed without the leading --.
function declarations(body) {
  return new Map([...body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1].slice(2), m[2].trim()]));
}

const lightDark = (value) => /^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i.exec(value);

// Resolve a token map to one scheme: the pair inside light-dark() when present.
function inScheme(decls, index) {
  const out = new Map();
  for (const [token, value] of decls) {
    const pair = lightDark(value);
    out.set(token, pair ? pair[index + 1] : value);
  }
  return out;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const lightDarkBlock = declarations(blockAfter(css, "@supports (color: light-dark("));
const schemes = {
  light: inScheme(lightDarkBlock, 0),
  dark: inScheme(lightDarkBlock, 1),
};

// Every colour a control boundary is drawn against, per scheme: the input's own
// fill (--bg-secondary), the button fill (--control-bg), and the page behind a
// control that sits on the background (the palette's close button).
const neighbours = ["bg-secondary", "control-bg", "background"];

test("the site has a control-boundary token, distinct from the hairline", () => {
  for (const scheme of Object.values(schemes)) {
    assert.ok(scheme.has("control-line"), "--control-line is not defined for both schemes");
  }
  assert.notEqual(schemes.dark.get("control-line"), schemes.dark.get("line"), "dark reused --line");
});

test("a form control's boundary clears 3:1 against every fill, in both schemes", () => {
  for (const [name, scheme] of Object.entries(schemes)) {
    const line = scheme.get("control-line");
    assert.match(line, /^#[0-9a-f]{6}$/i, `${name}: --control-line is not a hex colour`);
    for (const neighbour of neighbours) {
      const fill = scheme.get(neighbour);
      assert.match(fill, /^#[0-9a-f]{6}$/i, `${name}: --${neighbour} is not a hex colour`);
      const ratio = contrast(line, fill);
      assert.ok(
        ratio >= MIN,
        `${name}: --control-line ${line} on --${neighbour} ${fill} is ${ratio.toFixed(2)}:1, below ${MIN}:1`,
      );
    }
  }
});

test("browsers without light-dark() get the same boundary as the pair", () => {
  const base = declarations(blockAfter(css, ":root"));
  const darkScheme = blockAfter(css, "@media (prefers-color-scheme: dark)");
  const darkFallback = declarations(blockAfter(darkScheme, ":root"));
  assert.equal(base.get("control-line"), schemes.light.get("control-line"));
  assert.equal(darkFallback.get("control-line"), schemes.dark.get("control-line"));

  const nested = declarations(blockAfter(darkScheme, "@supports (color: light-dark("));
  assert.deepEqual(nested, lightDarkBlock, "the two light-dark() token blocks disagree");
});

test("the controls that carry their own border use the boundary token", () => {
  const controls = blockAfter(css, "input,\nbutton,\nselect,\ntextarea");
  assert.match(controls, /border:\s*1px solid var\(--control-line\)/);
  const close = blockAfter(palette, ".palette-close");
  assert.match(close, /border:\s*1px solid var\(--control-line\)/);
});
