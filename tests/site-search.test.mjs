import test from "node:test";
import assert from "node:assert/strict";

const articles = [
  { title: "Other", summary: "web search", url: "/other/", date: "2026-01-01" },
  { title: "Web search", summary: "a guide", url: "/web/", date: "2026-01-02" },
  { title: "Search web", summary: "a guide", url: "/search/", date: "2026-01-03" },
];
let moduleNumber = 0;
const freshSearch = () => import(`../assets/js/site-search.js?test=${++moduleNumber}`);
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test("matchArticles scores title above summary, preserves equal-score order and limits results", async () => {
  const { matchArticles } = await freshSearch();
  assert.deepEqual(matchArticles(articles, "web search", 2).map((a) => a.url), ["/web/", "/search/"]);
  assert.deepEqual(matchArticles(articles, "search", 3).map((a) => a.url), ["/web/", "/search/", "/other/"]);
  assert.deepEqual(matchArticles(articles, "   ", 1).map((a) => a.url), ["/other/"]);
  assert.deepEqual(matchArticles(articles, "missing", 10), []);
});

test("loadArticleIndex shares in-flight requests, caches success, and retries a rejected fetch", async (t) => {
  const { loadArticleIndex } = await freshSearch();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/index.json");
    assert.equal(options.headers.Accept, "application/json");
    calls++;
    return calls === 1 ? response({}, 503) : response({ articles });
  });
  const rejected = loadArticleIndex();
  assert.strictEqual(loadArticleIndex(), rejected, "concurrent callers must share one request");
  await assert.rejects(rejected, /index.json: HTTP 503/);
  const succeeded = loadArticleIndex();
  assert.deepEqual(await succeeded, { articles });
  assert.strictEqual(loadArticleIndex(), succeeded, "success must remain cached");
  assert.equal(calls, 2);
});

test("searchSite returns API results, falls back on malformed responses, and can disable fallback", async (t) => {
  const { searchSite, keywordSearchSite } = await freshSearch();
  const urls = [];
  let apiBody = { results: [{ title: "API", url: "/api/" }], count: 1, source: "ai" };
  let apiStatus = 200;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Accept, "application/json");
    return url.startsWith("/api/search?") ? response(apiBody, apiStatus) : response({ articles });
  });
  assert.deepEqual(await searchSite("   "), { query: "", count: 0, source: "none", results: [] });
  assert.deepEqual(await searchSite(" web ", { limit: 2 }), apiBody);
  assert.equal(new URL(urls[0], "https://example.test").searchParams.get("q"), "web");
  assert.equal(new URL(urls[0], "https://example.test").searchParams.get("limit"), "2");
  apiBody = { results: null };
  const fallback = await searchSite("search", { limit: 1 });
  assert.deepEqual(fallback, { query: "search", count: 1, source: "keyword", results: [articles[1]] });
  assert.equal(urls.filter((url) => url === "/index.json").length, 1);
  assert.deepEqual(await keywordSearchSite("web", 1), {
    query: "web", count: 1, source: "keyword", results: [articles[1]],
  });
  assert.equal(urls.filter((url) => url === "/index.json").length, 1, "keyword search reuses the index");
  await assert.rejects(searchSite("search", { keywordFallback: false }), /bad body/);
  apiStatus = 503;
  assert.equal((await searchSite("web")).source, "keyword", "HTTP failure must use the cached index");
  await assert.rejects(searchSite("web", { keywordFallback: false }), /\/api\/search: HTTP 503/);
});

test("searchSite propagates caller abort instead of falling back", async (t) => {
  const { searchSite } = await freshSearch();
  const caller = new AbortController();
  const reason = new Error("user cancelled");
  let requests = 0;
  t.mock.method(globalThis, "fetch", (_url, { signal }) => {
    requests++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const pending = searchSite("web", { signal: caller.signal });
  caller.abort(reason);
  await assert.rejects(pending, (err) => err === reason);
  assert.equal(requests, 1, "cancellation must not fetch /index.json");
});

test("searchSite uses its deadline before keyword fallback without waiting ten seconds", async (t) => {
  const { SEARCH_TIMEOUT_MS, searchSite } = await freshSearch();
  let deadline, deadlineMs, observedReason;
  t.mock.method(globalThis, "setTimeout", (callback, ms) => { deadline = callback; deadlineMs = ms; return 0; });
  t.mock.method(globalThis, "fetch", (url, options) => {
    if (url === "/index.json") return Promise.resolve(response({ articles }));
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
      observedReason = options.signal.reason;
      reject(observedReason);
    }, { once: true }));
  });
  const pending = searchSite("web", { limit: 1 });
  assert.equal(deadlineMs, SEARCH_TIMEOUT_MS);
  deadline();
  const result = await pending;
  assert.equal(observedReason.name, "TimeoutError");
  assert.equal(result.source, "keyword");
  assert.equal(result.results[0].url, "/web/");
});
