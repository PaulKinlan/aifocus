// Compiled patterns for stored quotes. findRange() runs once per stored note
// on every render, and the same note text is rebuilt each time, so the RegExp
// for a quote is compiled once and reused. The cache is bounded: a page shows
// at most LIMIT notes, and a longer list must not grow the map without end.

export const QUOTE_PATTERN_LIMIT = 200;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const patterns = new Map();

// Whitespace is matched loosely, so the pattern is the escaped words joined by
// \s+. Returns null for a quote with no words in it.
export const quotePatternFor = (exact) => {
  const key = (exact ?? "").trim();
  const cached = patterns.get(key);
  if (cached) return cached;
  const words = key.split(/\s+/).map(escapeRegExp);
  if (words.length === 0 || !words[0]) return null;
  // Keep the most recently used pattern at the back of the map and drop the
  // oldest entry when it is full.
  if (patterns.size >= QUOTE_PATTERN_LIMIT) patterns.delete(patterns.keys().next().value);
  const pattern = new RegExp(words.join("\\s+"), "g");
  patterns.set(key, pattern);
  return pattern;
};
