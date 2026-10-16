import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const authorsHtmlPath = path.join(rootDir, "public", "authors", "index.html");
const termsLayoutPath = path.join(rootDir, "themes", "aifocustheme", "layouts", "authors", "terms.html");

test("authors terms layout uses h3 without inline margin styles for articles subheading", () => {
  const template = fs.readFileSync(termsLayoutPath, "utf8");
  assert.match(template, /<h3>Articles:<\/h3>/, "Expected <h3>Articles:</h3> in authors terms layout");
  assert.doesNotMatch(template, /<h4[^>]*>Articles:<\/h4>/, "Layout must not use <h4> for Articles subheading");
  assert.doesNotMatch(template, /<h3[^>]*style=["'][^"']*margin/i, "Heading should not use hardcoded inline margins");
});

test("built /authors/ page maintains valid heading hierarchy without skipping levels", (t) => {
  if (!fs.existsSync(authorsHtmlPath)) {
    t.skip("public/authors/index.html does not exist (run npm run build first)");
    return;
  }
  const html = fs.readFileSync(authorsHtmlPath, "utf8");

  // Extract all heading tags in document order
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      text: match[2].replace(/<[^>]+>/g, "").trim(),
    });
  }

  assert.ok(headings.length > 0, "Expected headings in /authors/ page");
  assert.equal(headings[0].level, 1, "First heading should be h1");

  let prevLevel = 0;
  for (const h of headings) {
    if (prevLevel > 0) {
      assert.ok(
        h.level <= prevLevel + 1,
        `Heading level skipped: jumped from h${prevLevel} to h${h.level} ("${h.text}")`
      );
    }
    prevLevel = h.level;
  }

  // Specifically ensure "Articles:" headings are h3
  const articleHeadings = headings.filter((h) => h.text.startsWith("Articles"));
  assert.ok(articleHeadings.length > 0, "Expected Articles headings");
  for (const h of articleHeadings) {
    assert.equal(h.level, 3, "Articles heading must be level 3 (under h2 author name)");
  }
});
