// The declarative modern-web opt-ins have no JavaScript entry point a node test
// can call: cross-document view transitions are a CSS at-rule plus a
// render-blocking hint, and the palette's close button is closed by the browser
// from its commandfor/command attributes. These assertions read the template and
// stylesheet sources so a later edit cannot silently drop the opt-in, drop the
// reduced-motion disable (which would animate for people who asked it not to),
// point the render block at an id that does not exist, or hand the close button
// back to an engine-dependent feature check. The behaviour itself is checked in
// a browser.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const css = read("themes/aifocustheme/assets/css/main.css");
const head = read("themes/aifocustheme/layouts/_partials/head.html");
const header = read("themes/aifocustheme/layouts/_partials/header.html");
const palette = read("assets/js/command-palette.js");

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

test("the site opts into cross-document view transitions", () => {
  assert.match(blockAfter(css, "@view-transition"), /navigation:\s*auto/);
});

test("reduced motion turns the navigation transition off, not just its animations", () => {
  const reduced = blockAfter(css, "@media (prefers-reduced-motion: reduce)");
  assert.match(reduced, /@view-transition/);
  assert.match(blockAfter(reduced, "@view-transition"), /navigation:\s*none/);
});

test("exactly one element is named for the wordmark morph", () => {
  assert.equal(
    css.match(/view-transition-name\s*:/g)?.length,
    1,
    "duplicate view-transition-name values skip the whole transition",
  );
  assert.match(css, /view-transition-name:\s*site-wordmark/);
});

test("the render block points at an id the header actually renders", () => {
  assert.match(head, /<link rel="expect" href="#site-branding" blocking="render">/);
  assert.equal(header.match(/id="site-branding"/g)?.length, 2, "home and content pages both need the id");
  assert.match(header, /class="site-branding-title" id="site-branding"/);
});

test("the palette close button is declarative and detects the right property", () => {
  assert.match(palette, /commandfor:\s*"command-palette-dialog"/);
  assert.match(palette, /command:\s*"close"/);
  assert.match(palette, /id:\s*"command-palette-dialog"/);
  // Detect the invoker-commands property, not `command`, which exists on the
  // prototype in engines where the declarative path is not wired up.
  assert.match(palette, /if \(!\("commandForElement" in HTMLButtonElement\.prototype\)\)/);
  assert.match(
    blockAfter(palette, '!("commandForElement" in HTMLButtonElement.prototype)'),
    /addEventListener\("click"/,
  );
});

// aifocus-fbq1: the palette's one visible control was a button whose label was
// the key name "Esc" - meaningful on a keyboard, meaningless on the phone that
// is showing it, where the tap that closes the palette had no visible name.
test("the palette close button is named for what it does, not for a key", () => {
  assert.match(palette, /"aria-label": "Close the palette"/, "the close button lost its accessible name");
  assert.match(palette, /class: "palette-close-word", text: "Close"/, "the visible label is not a word");
  const key = /class: "palette-close-key", text: "Esc", "aria-hidden": "true"/;
  assert.match(palette, key, "the key cap is not marked up as a hint");
  const css = read("themes/aifocustheme/assets/css/palette.css");
  assert.match(blockAfter(css, ".palette-close-key"), /display:\s*none/, "the key cap shows on touch, where there is no Esc key");
  assert.match(
    blockAfter(css, "@media (hover: hover) and (pointer: fine)"),
    /\.palette-close-key\s*\{\s*display:\s*inline/,
    "the key cap never replaces the word on a keyboard device",
  );
});
