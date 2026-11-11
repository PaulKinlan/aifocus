// Unit contract of functions/_lib/reader.js: path normalization, text
// cleaning and reader-cookie parsing (aifocus-dsg4 split of reader.test.mjs).
// These are the primitives every reader endpoint builds on; they need no env
// and own no D1.

import test from "node:test";
import assert from "node:assert/strict";
import { ORIGIN, READER_A } from "./helpers/reader-fixtures.mjs";
import { normalizePostPath, cleanText, looseText, htmlToText, getReader, READER_COOKIE } from "../functions/_lib/reader.js";

test("helpers: path, text and reader cookie handling", () => {
  assert.equal(normalizePostPath("/setting-goals"), "/setting-goals/");
  assert.equal(normalizePostPath("https://aifoc.us/setting-goals/"), "/setting-goals/");
  assert.equal(normalizePostPath("/a//b"), null);
  assert.equal(normalizePostPath("/a b/"), null);
  assert.equal(normalizePostPath(""), null);
  assert.equal(cleanText("  hi\u0000 there ", 100), "hi there");
  assert.equal(cleanText("x".repeat(10) + "😀", 11), "x".repeat(10) + "😀");
  assert.equal(looseText("Didn’t  realise!"), "didntrealise");
  assert.match(htmlToText("<p>a &amp; b&#39;s</p>"), /a & b's/);
  assert.equal(htmlToText("didn&rsquo;t &unknown; x"), "didn\u2019t x");
  const fresh = getReader(new Request(ORIGIN));
  assert.equal(fresh.isNew, true);
  assert.match(fresh.id, /^[0-9a-f]{32}$/);
  const known = getReader(new Request(ORIGIN, { headers: { Cookie: `${READER_COOKIE}=${READER_A}` } }));
  assert.deepEqual(known, { id: READER_A, isNew: false });
});
