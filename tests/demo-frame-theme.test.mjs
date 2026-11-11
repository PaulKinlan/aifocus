import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("lazy demo frames use the page background token and keep shortcode heights", () => {
  const shortcode = source("layouts/shortcodes/demo.html");
  const css = source("themes/aifocustheme/assets/css/main.css");
  const rule = css.match(/\.ewa-demo iframe\s*\{([^}]*)\}/)?.[1];

  assert.ok(rule, "the demo iframe needs its own style rule");
  assert.match(shortcode, /style="--demo-height:\{\{ \$height \}\}px"/);
  assert.doesNotMatch(shortcode, /background\s*:/, "inline backgrounds override the theme");
  assert.match(rule, /height:\s*var\(--demo-height,\s*560px\)/);
  assert.match(rule, /background:\s*var\(--background\)/);
});
