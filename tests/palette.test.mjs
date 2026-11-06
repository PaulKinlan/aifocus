import assert from "node:assert/strict";
import test from "node:test";

import {
  WORD_PATTERN_LIMIT,
  buildCommands,
  compileQueryPatterns,
  filterGroups,
  matchesQuery,
  patternForWord,
  shortcutLabel,
  textFragmentUrl,
} from "../assets/js/palette-commands.js";

const ids = (groups) => groups.flatMap((g) => g.items.map((i) => i.id));

test("off an essay, the palette offers follow and navigation only", () => {
  const groups = buildCommands();
  assert.deepEqual(groups.map((g) => g.id), ["follow", "go"]);
  assert.ok(ids(groups).includes("follow-rss"));
  assert.ok(!ids(groups).some((id) => id.includes("discord")));
});

test("on an essay without a selection, passage actions are replaced by a hint", () => {
  const groups = buildCommands({ onEssay: true });
  const essay = groups.find((g) => g.id === "essay");
  assert.ok(essay);
  const essayIds = essay.items.map((i) => i.id);
  assert.ok(essayIds.includes("comment"));
  assert.ok(essayIds.includes("react-useful"));
  assert.ok(!essayIds.includes("highlight"));
  assert.equal(essay.items.find((i) => i.id === "select-hint").disabled, true);
});

test("on an essay with a selection, highlight, note and passage link come first", () => {
  const essay = buildCommands({ onEssay: true, hasSelection: true }).find((g) => g.id === "essay");
  assert.deepEqual(essay.items.slice(0, 3).map((i) => i.id), ["highlight", "note", "copy-passage"]);
  assert.ok(!essay.items.some((i) => i.id === "select-hint"));
});

test("matchesQuery needs every word as a word prefix in the label or keywords", () => {
  const item = { label: "Follow by RSS", keywords: "feed subscribe" };
  assert.equal(matchesQuery(item, ""), true);
  assert.equal(matchesQuery(item, "fol rss"), true);
  assert.equal(matchesQuery(item, "FEED"), true);
  assert.equal(matchesQuery(item, "ollow"), false);
  assert.equal(matchesQuery(item, "rss newsletter"), false);
  assert.equal(matchesQuery(item, "("), false);

  const patterns = compileQueryPatterns("fol rss");
  assert.equal(matchesQuery(item, patterns), true);
  const nonMatchingPatterns = compileQueryPatterns("rss newsletter");
  assert.equal(matchesQuery(item, nonMatchingPatterns), false);
});

test("patternForWord memoizes RegExp instances and respects cache bounds", () => {
  const p1 = patternForWord("testword");
  const p2 = patternForWord("testword");
  assert.equal(p1, p2, "patternForWord must reuse identical RegExp instance");

  const queryPatterns1 = compileQueryPatterns("repeat repeat");
  assert.equal(queryPatterns1.length, 2);
  assert.equal(queryPatterns1[0], queryPatterns1[1], "duplicate query words reuse cached pattern");

  // Populate cache to trigger eviction
  for (let i = 0; i <= WORD_PATTERN_LIMIT + 10; i++) {
    patternForWord(`bulkword${i}`);
  }
  const evicted = patternForWord("testword");
  assert.ok(evicted instanceof RegExp);
  assert.notEqual(evicted, p1, "evicted word pattern gets recompiled as a new instance");
});

test("filterGroups drops groups with no matching items", () => {
  const groups = filterGroups(buildCommands({ onEssay: true }), "newsletter");
  assert.deepEqual(groups.map((g) => g.id), ["follow"]);
  assert.deepEqual(ids(groups), ["follow-newsletter"]);
});

test("textFragmentUrl encodes short quotes whole and long quotes as start,end", () => {
  assert.equal(
    textFragmentUrl("https://aifoc.us/post/#top", "a well-known, idea"),
    "https://aifoc.us/post/#:~:text=a%20well%2Dknown%2C%20idea",
  );
  const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
  assert.equal(
    textFragmentUrl("https://aifoc.us/post/", long),
    "https://aifoc.us/post/#:~:text=w0%20w1%20w2%20w3%20w4,w15%20w16%20w17%20w18%20w19",
  );
  assert.equal(textFragmentUrl("https://aifoc.us/post/", "  "), "https://aifoc.us/post/");
});

test("shortcutLabel shows ⌘K on Apple platforms and Ctrl K elsewhere", () => {
  assert.equal(shortcutLabel("MacIntel"), "⌘K");
  assert.equal(shortcutLabel("macOS"), "⌘K");
  assert.equal(shortcutLabel("iPad"), "⌘K");
  assert.equal(shortcutLabel("Win32"), "Ctrl K");
  assert.equal(shortcutLabel("Linux x86_64"), "Ctrl K");
  assert.equal(shortcutLabel(""), "Ctrl K");
});
