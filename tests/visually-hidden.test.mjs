// aifocus-lvrr: .visually-hidden sets width: 1px, but a table box ignores width
// (min-content wins), so putting the class on the <table> leaves a 468px-wide
// absolutely positioned box that extends past a 390px viewport and gives the
// page 122px of sideways scroll into empty space. clip() clips paint, not the
// scrollable overflow area. The class belongs on a wrapper, where width is
// honoured and overflow: hidden contains the table - the table keeps its own
// display and therefore its rows in the accessibility tree.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

function html(dir) {
  const out = [];
  for (const entry of readdirSync(root(dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...html(path));
    else if (entry.name.endsWith(".html")) out.push(path);
  }
  return out;
}

const PAGES = [...html("static"), ...html("layouts"), ...html("themes/aifocustheme/layouts")];

test("no page puts .visually-hidden on a table, where width is ignored", () => {
  assert.ok(PAGES.length > 20, "the page scan found nothing to check");
  const offenders = PAGES.filter((path) => /<table[^>]*class="[^"]*visually-hidden/.test(readFileSync(root(path), "utf8")));
  assert.deepEqual(offenders, [], "wrap the table in a div.visually-hidden instead");
});

test("the token calculator's chart fallback tables are wrapped, not clipped on the table", () => {
  const source = readFileSync(root("static/token-calculator.html"), "utf8");
  const ids = [...source.matchAll(/<table id="(chart-[a-z]+-fallback)">/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["chart-salary-fallback", "chart-ratio-fallback", "chart-tasksize-fallback"]);
  for (const id of ids) {
    const at = source.indexOf(`<table id="${id}">`);
    const wrapper = source.lastIndexOf('<div class="visually-hidden">', at);
    assert.ok(wrapper > 0 && at - wrapper < 80, `${id} is not inside a visually-hidden wrapper`);
  }
});

// aifocus-15e8: the where-prompts demo had no level-1 heading and no <main>,
// so a screen-reader user got no page heading and landmark navigation landed
// on two anonymous sections - the only headings were two h2s inside collapsed
// <details>. The demo is a standalone static page, so the site layout's own
// heading and main landmark do not reach it.
test("the journal demo exposes one heading and a main landmark", () => {
  for (const file of ["index.html", "google.html", "openai.html"]) {
    const markup = readFileSync(root(`static/where-prompts-run-demo/${file}`), "utf8");
    assert.equal((markup.match(/<h1\b/g) ?? []).length, 1, `${file} does not have exactly one h1`);
    assert.equal((markup.match(/<main\b/g) ?? []).length, 1, `${file} does not have exactly one main landmark`);
    const mainStart = markup.indexOf("<main>");
    const mainEnd = markup.indexOf("</main>");
    const h1 = markup.indexOf("<h1");
    assert.ok(h1 > mainStart && h1 < mainEnd, `${file}: the h1 is outside the main landmark`);
  }
});
