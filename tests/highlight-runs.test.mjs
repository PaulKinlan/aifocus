// Word snapping and run merging behind shared highlights in reader.js.
import test from "node:test";
import assert from "node:assert/strict";

import { countLabel, isWordChar, mergeRuns, snapToWords } from "../assets/js/highlight-runs.js";

const TEXT = "Earlier this year I wrote about how more and more of my software is just prompts";
const at = (s) => ({ start: TEXT.indexOf(s), end: TEXT.indexOf(s) + s.length });
const slice = (r) => TEXT.slice(r.start, r.end);

test("a selection part way through a word is widened to the whole word", () => {
  assert.equal(slice(snapToWords(TEXT, ...Object.values(at("Ear")))), "Earlier");
  assert.equal(slice(snapToWords(TEXT, ...Object.values(at("ier")))), "Earlier");
  assert.equal(slice(snapToWords(TEXT, ...Object.values(at("s yea")))), "this year");
});

test("a selection on whole words is unchanged", () => {
  const span = at("wrote about");
  assert.deepEqual(snapToWords(TEXT, span.start, span.end), span);
});

test("apostrophes and hyphens inside a word are part of it", () => {
  const text = "it’s mini-agents all the way";
  assert.equal(text.slice(...Object.values(snapToWords(text, 0, 2))), "it’s");
  assert.equal(text.slice(...Object.values(snapToWords(text, 7, 9))), "mini-agents");
  assert.equal(isWordChar("a -b", 1), false);
});

test("snapping stops at a block boundary even with no space between", () => {
  const text = "IntroductionEarlier this";
  const isBreak = (i) => i === 12;
  const r = snapToWords(text, 12, 15, isBreak);
  assert.equal(text.slice(r.start, r.end), "Earlier");
});

// The data behind the bug report: one reader highlighted "Ear", "ier", "thi"
// and "yea" separately, which drew four runs, each with its own "1" inside a
// word.
test("fragments of neighbouring words from one person become one run", () => {
  const spans = ["Ear", "ier", "thi", "yea"].map((s) => ({ ...at(s), people: [3], mine: false }));
  const runs = mergeRuns(TEXT, spans);
  assert.equal(runs.length, 1);
  assert.equal(slice(runs[0]), "Earlier this year");
  assert.deepEqual([...runs[0].people], [3]);
});

test("overlapping passages count each person once", () => {
  const runs = mergeRuns(TEXT, [
    { ...at("Earlier this"), people: [1] },
    { ...at("this year"), people: [1, 2], mine: true },
  ]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].people.size, 2);
  assert.equal(runs[0].mine, true);
});

test("passages separated by other words stay separate", () => {
  const runs = mergeRuns(TEXT, [
    { ...at("Earlier"), people: [1] },
    { ...at("year"), people: [2] },
  ]);
  assert.equal(runs.length, 2);
});

test("passages in different blocks are not joined across the boundary", () => {
  const text = "one two.Three four";
  const isBreak = (i) => i === 8;
  const runs = mergeRuns(text, [
    { start: 4, end: 8, people: [1] },
    { start: 8, end: 13, people: [1] },
  ], isBreak);
  assert.equal(runs.length, 2);
});

test("count labels", () => {
  assert.equal(countLabel(1, true), "1 person highlighted text here");
  assert.equal(countLabel(3, true), "3 people highlighted text here, including you");
  assert.equal(countLabel(2, false), "2 people highlighted text here");
});
