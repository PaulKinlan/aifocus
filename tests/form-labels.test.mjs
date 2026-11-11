// aifocus-qfsk: every form control needs a programmatic label (WCAG 1.3.1,
// 3.3.2, 4.1.2). Both token-calculator pages carried visible <label> elements
// that were associated with nothing - no for=, no wrapping - so a screen
// reader announced each slider and the model select as unlabelled, which the
// accessibility station flagged HIGH. This reads the sources because nothing
// else in the gate can see a label association regress, and it pins exactly
// the pages this bead fixed rather than sweeping static/*.html, so a page
// outside this bead cannot turn the gate red from here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const PAGES = [
  "static/token-calculator.html",
  "static/token-calculator-regional.html",
];

const controlTags = (source) =>
  [...source.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}=["']([^"']*)["']`).exec(tag);
  return m ? m[1] : null;
};

for (const page of PAGES) {
  const source = read(page);

  test(`${page}: every form control has a programmatic label`, () => {
    const controls = controlTags(source);
    assert.ok(controls.length > 0, "no form controls found - the fixture rotted");
    // <label> bodies that actually contain a control associate it by nesting.
    const wrapped = [...source.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
      .map((m) => m[1])
      .filter((body) => /<\s*(input|select|textarea)\b/.test(body));
    for (const tag of controls) {
      if ((attr(tag, "type") || "").trim().toLowerCase() === "hidden") continue;
      const byAria = attr(tag, "aria-label")?.trim() || attr(tag, "aria-labelledby")?.trim();
      const id = attr(tag, "id");
      const byFor = id && new RegExp(`<label\\b[^>]*\\bfor=["']${id}["']`).test(source);
      const byNesting = wrapped.some((body) => body.includes(tag));
      const how = byAria ? "aria-label" : byFor ? "for=" : byNesting ? "wrapping label" : null;
      assert.ok(how, `unlabelled form control on ${page}: ${tag}`);
      if (!byAria && !byNesting) {
        assert.ok(id, `labelled only via for=, which needs an id: ${tag}`);
      }
    }
  });

  test(`${page}: every label has text and its for= names a real control`, () => {
    const ids = new Set([...source.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
    for (const m of source.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
      const attrs = m[1], body = m[2];
      assert.match(
        body.replace(/<[^>]*>/g, "").trim() || attrs.replace(/.*for=["'][^"']+["']/, "").trim(),
        /\S/,
        `empty <label> on ${page}`,
      );
      const forId = /for=["']([^"']+)["']/.exec(attrs)?.[1];
      if (forId) assert.ok(ids.has(forId), `<label for="${forId}"> on ${page} names no control`);
    }
  });
}
