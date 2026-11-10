// aifocus-mbs0: the WebMCP tools run in a page where the caller is a model,
// and inputSchema is an annotation no handler enforces - so each execute()
// must police its own arguments (the guard read_article's url check already
// carried). These tests drive the registered tool objects directly, with a
// non-conforming agent's wrong-typed arguments, and pin that the failure is
// a named message instead of an opaque TypeError or a silently wrong result.
import test from "node:test";
import assert from "node:assert/strict";
import { registerTools } from "../assets/js/webmcp.js";

const INDEX = {
  articles: [
    { title: "A reader state primer", url: "/reader-state-primer/", date: "2026-11-01", summary: "How reader state is fetched." },
    { title: "Reading the edge cache", url: "/edge-cache/", date: "2026-11-02", summary: "What varies and what does not." },
    { title: "A reader's notes", url: "/readers-notes/", date: "2026-11-03", summary: "Notes and annotations." },
    { title: "Something unrelated", url: "/unrelated/", date: "2026-11-04", summary: "Nothing about readers." },
    { title: "Also unrelated", url: "/also-unrelated/", date: "2026-11-05", summary: "Still nothing." },
  ],
};

// loadArticleIndex memoizes its fetch for the whole process, so the stub is
// installed once and every test sees the same index. /api/search is made to
// fail so search_articles exercises the keyword fallback (matchArticles),
// which is the path a wrong-typed query used to crash.
globalThis.fetch = async (url) => {
  if (String(url).startsWith("/index.json")) {
    return { ok: true, json: async () => INDEX };
  }
  throw new Error(`/api/search unavailable (test stub): ${url}`);
};

const tools = (() => {
  const captured = new Map();
  registerTools({ registerTool: (tool) => captured.set(tool.name, tool) });
  return captured;
})();

const resultText = (result) => result.content[0].text;
const resultListCount = (result) => JSON.parse(resultText(result)).count;

// contact_paul touches window.confirm and window.location; stub both for the
// duration of one test and put the globals back afterwards.
const withWindow = (confirmImpl, fn) => {
  const previous = globalThis.window;
  const calls = { confirm: [], href: null };
  globalThis.window = {
    confirm: (text) => {
      calls.confirm.push(text);
      return confirmImpl(text);
    },
    location: {},
  };
  Object.defineProperty(globalThis.window.location, "href", {
    set(v) {
      calls.href = v;
    },
    get() {
      return calls.href;
    },
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }).then(() => calls);
};

const approvingAgent = { requestUserInteraction: async (fn) => fn() };

test("list_articles coerces a wrong-typed limit instead of silently emptying or tail-truncating", async () => {
  const list = tools.get("list_articles");
  // 'abc' used to slice to an empty list; the schema default is 20 -> all 5.
  assert.equal(resultListCount(await list.execute({ limit: "abc" })), 5);
  // -2 used to truncate from the end (3 of 5); clamped into the schema range.
  assert.equal(resultListCount(await list.execute({ limit: -2 })), 1);
  // Non-integers coerce (parseInt), still clamped.
  assert.equal(resultListCount(await list.execute({ limit: 2.9 })), 2);
  // Absent limit keeps the schema default.
  assert.equal(resultListCount(await list.execute({})), 5);
});

test("search_articles rejects a non-string query with a message, not a TypeError", async () => {
  const search = tools.get("search_articles");
  for (const query of [42, null, {}, ""]) {
    const result = await search.execute({ query });
    assert.match(resultText(result), /non-empty query string/, `query: ${String(query)}`);
  }
});

test("search_articles still searches with a validated query and a coerced limit", async () => {
  const search = tools.get("search_articles");
  const parsed = JSON.parse(resultText(await search.execute({ query: "reader", limit: "2" })));
  assert.equal(parsed.source, "keyword");
  assert.ok(parsed.count <= 2, `limit coerces: got ${parsed.count}`);
  assert.ok(parsed.matches.every((m) => m.title.toLowerCase().includes("reader") || m.summary.toLowerCase().includes("reader")));
});

test("contact_paul rejects wrong-typed arguments without prompting or opening a mail client", async () => {
  const contact = tools.get("contact_paul");
  const calls = await withWindow(
    () => assert.fail("confirm must not be called for invalid arguments"),
    async () => {
      for (const args of [{ subject: 42, body: "x" }, { subject: "x", body: null }, { subject: "", body: "x" }]) {
        const result = await contact.execute(args, approvingAgent);
        assert.match(resultText(result), /non-empty subject string and a non-empty body string/);
      }
    },
  );
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.href, null);
});

test("contact_paul still drafts the mail with validated string arguments", async () => {
  const contact = tools.get("contact_paul");
  const calls = await withWindow(
    (text) => {
      assert.match(text, /Subject: Hello/);
      assert.match(text, /A body/);
      return true;
    },
    () => contact.execute({ subject: "Hello", body: "A body" }, approvingAgent),
  );
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.href, "mailto:paul@aifoc.us?subject=Hello&body=A+body");
});
