// Pure text helpers for shared highlights (reader.js). Kept free of the DOM
// so they can be unit tested in Node (tests/highlight-runs.test.mjs).
//
// `text` is the article's text index: every text node concatenated with no
// separator. `isBreak(i)` reports whether a block boundary (the end of one
// paragraph, list item or heading and the start of the next) lies between
// text[i - 1] and text[i]; without it, "Intro" + "Earlier" would read as one
// word "IntroEarlier".

const LETTER = /[\p{L}\p{N}\p{M}]/u;
// An apostrophe or hyphen is part of a word only between two letters:
// "it’s", "mini-agents".
const JOINER = /['’\-‐]/u;

export const isWordChar = (text, i) => {
  const c = text[i];
  if (c === undefined) return false;
  if (LETTER.test(c)) return true;
  return JOINER.test(c) && LETTER.test(text[i - 1] ?? "") && LETTER.test(text[i + 1] ?? "");
};

const noBreak = () => false;

// Widen [start, end) so it never starts or ends part way through a word.
// Selections on touch screens often land mid-word ("Ear" of "Earlier"); a
// highlight is always shown, and from now on stored, as whole words.
export const snapToWords = (text, start, end, isBreak = noBreak) => {
  let s = Math.max(0, Math.min(start, text.length));
  let e = Math.max(s, Math.min(end, text.length));
  while (s > 0 && !isBreak(s) && isWordChar(text, s - 1) && isWordChar(text, s)) s -= 1;
  while (e < text.length && !isBreak(e) && isWordChar(text, e - 1) && isWordChar(text, e)) e += 1;
  return { start: s, end: e };
};

// Longest gap of spaces and punctuation that still joins two passages into
// one run: "Earlier" and "this" with one space between them read as one
// highlighted phrase, not two.
export const MAX_JOIN_GAP = 3;

const joins = (text, from, to, isBreak) => {
  if (to - from > MAX_JOIN_GAP) return false;
  for (let i = from; i < to; i += 1) if (isWordChar(text, i)) return false;
  // A block boundary anywhere from the end of one passage to the start of
  // the next keeps them apart, even when they touch.
  for (let i = from; i <= to; i += 1) if (isBreak(i)) return false;
  return true;
};

// Merge passages into runs. Each span is { start, end, people, mine } with
// `people` the server's per-response person numbers. Spans are first snapped
// to whole words; spans that overlap, touch, or are separated only by a short
// gap of spaces or punctuation in the same block become one run. A run's
// people is the set of distinct people who marked any part of it.
export const mergeRuns = (text, spans, isBreak = noBreak) => {
  const snapped = spans
    .map((span) => ({ ...span, ...snapToWords(text, span.start, span.end, isBreak) }))
    .filter((span) => span.end > span.start)
    .sort((x, y) => x.start - y.start || x.end - y.end);
  const runs = [];
  for (const span of snapped) {
    const last = runs[runs.length - 1];
    if (last && (span.start < last.end || joins(text, last.end, span.start, isBreak))) {
      last.end = Math.max(last.end, span.end);
      for (const p of span.people ?? []) last.people.add(p);
      last.mine ||= Boolean(span.mine);
    } else {
      runs.push({ start: span.start, end: span.end, people: new Set(span.people ?? []), mine: Boolean(span.mine) });
    }
  }
  return runs;
};

export const countLabel = (count, mine) => {
  const people = count === 1 ? "1 person" : `${count} people`;
  return mine && count > 1 ? `${people} highlighted text here, including you` : `${people} highlighted text here`;
};
