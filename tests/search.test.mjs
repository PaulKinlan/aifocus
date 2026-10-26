import test from "node:test";
import assert from "node:assert/strict";
import {
  onRequestGet,
  INSTANCE_NAME,
  MAX_QUERY_LENGTH,
  MAX_LIMIT,
  normalizeQuery,
  parseLimit,
  keyToPath,
  extractChunks,
  toSnippet,
  indexByPath,
  rankArticles,
} from "../functions/api/search.js";

const ARTICLES = [
  { title: "setting goals", url: "https://aifoc.us/setting-goals/", date: "2026-10-25", summary: "goals" },
  { title: "the model gap", url: "https://aifoc.us/the-model-gap/", date: "2026-05-01", summary: "gap" },
];

test("normalizeQuery: trims, collapses whitespace, strips control chars, caps length", () => {
  assert.equal(normalizeQuery("  agent \n\t loops  "), "agent loops");
  assert.equal(normalizeQuery("a\x00b"), "a b");
  assert.equal(normalizeQuery(null), "");
  assert.equal(normalizeQuery("x".repeat(500)).length, MAX_QUERY_LENGTH);
});

test("parseLimit: defaults and clamps", () => {
  assert.equal(parseLimit(null), 10);
  assert.equal(parseLimit("0"), 10);
  assert.equal(parseLimit("abc"), 10);
  assert.equal(parseLimit("5"), 5);
  assert.equal(parseLimit("999"), MAX_LIMIT);
});

test("keyToPath: reduces crawled keys to comparable paths", () => {
  assert.equal(keyToPath("https://aifoc.us/setting-goals/"), "/setting-goals/");
  assert.equal(keyToPath("https://aifoc.us/setting-goals"), "/setting-goals/");
  assert.equal(keyToPath("aifoc.us/setting-goals/index.html"), "/setting-goals/");
  assert.equal(keyToPath("/the-model-gap/index.md"), "/the-model-gap/");
  assert.equal(keyToPath(""), null);
  assert.equal(keyToPath(undefined), null);
});

test("extractChunks: reads both AI Search and AutoRAG response shapes", () => {
  assert.deepEqual(
    extractChunks({ chunks: [{ text: "t", score: 0.5, item: { key: "https://aifoc.us/a/" } }] }),
    [{ key: "https://aifoc.us/a/", score: 0.5, text: "t" }],
  );
  assert.deepEqual(
    extractChunks({ data: [{ filename: "aifoc.us/b/", score: 0.7, content: [{ text: "x" }, { text: "y" }] }] }),
    [{ key: "aifoc.us/b/", score: 0.7, text: "x y" }],
  );
  assert.deepEqual(extractChunks(null), []);
  assert.deepEqual(extractChunks({}), []);
});

test("toSnippet: strips markdown punctuation and cuts on a word boundary", () => {
  assert.equal(toSnippet("## Heading\n\n**bold** text"), "Heading bold text");
  const long = toSnippet("word ".repeat(200));
  assert.ok(long.length <= 281);
  assert.ok(long.endsWith("…"));
});

test("rankArticles: one result per essay, best chunk wins, non-essays dropped", () => {
  const chunks = [
    { key: "https://aifoc.us/the-model-gap/", score: 0.4, text: "low" },
    { key: "https://aifoc.us/setting-goals/", score: 0.6, text: "goals chunk" },
    { key: "https://aifoc.us/the-model-gap/", score: 0.9, text: "high" },
    { key: "https://aifoc.us/posts/", score: 0.99, text: "archive" },
    { key: "https://aifoc.us/model-drops.html", score: 0.95, text: "demo" },
  ];
  const results = rankArticles(chunks, indexByPath(ARTICLES), 10);
  assert.deepEqual(results.map((r) => r.url), [
    "https://aifoc.us/the-model-gap/",
    "https://aifoc.us/setting-goals/",
  ]);
  assert.equal(results[0].snippet, "high");
  assert.equal(results[0].title, "the model gap");
  assert.equal(rankArticles(chunks, indexByPath(ARTICLES), 1).length, 1);
});

function makeEnv({ searchResult, searchError, calls = [] } = {}) {
  return {
    ASSETS: {
      fetch: async (req) => {
        assert.equal(new URL(req.url).pathname, "/index.json");
        return new Response(JSON.stringify({ articles: ARTICLES }));
      },
    },
    AI: {
      autorag: (name) => ({
        search: async (opts) => {
          calls.push({ name, opts });
          if (searchError) throw searchError;
          return searchResult;
        },
      }),
    },
  };
}

test("onRequestGet: 400 without a query", async () => {
  const res = await onRequestGet({ request: new Request("https://aifoc.us/api/search"), env: makeEnv() });
  assert.equal(res.status, 400);
});

test("onRequestGet: queries the aifocus-search instance and returns essays", async () => {
  const calls = [];
  const env = makeEnv({
    calls,
    searchResult: { chunks: [{ text: "about goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
  });
  const res = await onRequestGet({
    request: new Request("https://aifoc.us/api/search?q=%20agent%20goals%20&limit=3"),
    env,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.query, "agent goals");
  assert.equal(body.source, "ai-search");
  assert.equal(body.count, 1);
  assert.equal(body.results[0].url, "https://aifoc.us/setting-goals/");
  assert.equal(calls[0].name, INSTANCE_NAME);
  assert.equal(calls[0].opts.query, "agent goals");
  assert.match(res.headers.get("cache-control"), /s-maxage=/);
});

test("onRequestGet: 503 with no-store when the search call fails", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = await onRequestGet({
      request: new Request("https://aifoc.us/api/search?q=goals"),
      env: makeEnv({ searchError: new Error("boom") }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("cache-control"), "no-store");
  } finally {
    console.error = original;
  }
});

test("onRequestGet: 503 when the AI binding is missing", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const env = makeEnv();
    delete env.AI;
    const res = await onRequestGet({ request: new Request("https://aifoc.us/api/search?q=goals"), env });
    assert.equal(res.status, 503);
  } finally {
    console.error = original;
  }
});
