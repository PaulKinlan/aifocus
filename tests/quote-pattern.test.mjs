// The quote pattern cache behind findRange() in reader.js. A pattern is
// compiled once per distinct stored quote and reused on every later render.
import test from "node:test";
import assert from "node:assert/strict";

import { QUOTE_PATTERN_LIMIT, quotePatternFor } from "../assets/js/quote-pattern.js";

const firstWord = (text) => [...text.matchAll(quotePatternFor("one two three"))][0]?.[0] ?? null;

test("the same quote returns the same compiled pattern", () => {
  const a = quotePatternFor("a quote worth caching");
  const b = quotePatternFor("a quote worth caching");
  assert.ok(a instanceof RegExp);
  assert.equal(a, b);
});

test("the cache key ignores leading and trailing whitespace", () => {
  assert.equal(quotePatternFor("  same words here  "), quotePatternFor("same words here"));
});

test("whitespace inside the quote matches any run of whitespace", () => {
  const pattern = quotePatternFor("loose   spacing");
  assert.equal(pattern.lastIndex, 0);
  assert.ok("before loose \n\t spacing after".match(pattern));
  assert.ok(!("before loose-spacing after".match(quotePatternFor("loose spacing"))));
});

test("regex metacharacters in a quote are matched literally", () => {
  const text = "costs 1+1 (really) $5 [sic] a.b*c";
  assert.ok(text.match(quotePatternFor("1+1 (really) $5 [sic] a.b*c")));
  assert.ok(!text.match(quotePatternFor("1+1 (really) $5 [sic] axbxc")));
});

test("a later match does not depend on the previous caller's position", () => {
  const pattern = quotePatternFor("repeated passage");
  const text = "repeated passage then repeated passage";
  assert.deepEqual([...text.matchAll(pattern)].length, 2);
  assert.deepEqual([...text.matchAll(pattern)].length, 2);
});

test("an empty or whitespace-only quote has no pattern", () => {
  assert.equal(quotePatternFor(""), null);
  assert.equal(quotePatternFor("   \n\t "), null);
  assert.equal(quotePatternFor(undefined), null);
});

test("the cache is bounded and evicts the oldest entry", () => {
  const quotes = Array.from({ length: QUOTE_PATTERN_LIMIT + 5 }, (_, i) => `quote number ${i}`);
  const patterns = quotes.map((q) => quotePatternFor(q));
  // A fresh call for an evicted quote compiles a new pattern rather than
  // returning the old one, and the map never holds more than the limit.
  assert.notEqual(quotePatternFor(quotes[0]), patterns[0]);
  assert.equal(quotePatternFor(quotes.at(-1)), patterns.at(-1));
  assert.equal(quotePatternFor(quotes[0]), quotePatternFor(quotes[0]));
  assert.ok(QUOTE_PATTERN_LIMIT > 0);
});

test("patterns match the quote they were built for", () => {
  assert.equal(firstWord("xx one two three yy"), "one two three");
});
