// The allowlist behind WebMCP read_article: only URLs handed out by
// list_articles / search_articles (the essays in /index.json) may be fetched.
// Everything else on the origin - /api/account, /admin/, /api/admin/og - is not
// an article, however same-origin it looks.
import test from "node:test";
import assert from "node:assert/strict";

import { articleFetchPath, findArticle, normalizeArticlePath } from "../assets/js/article-url.js";

const ARTICLES = [
  { url: "https://aifoc.us/setting-goals/", title: "setting goals" },
  { url: "https://aifoc.us/a-link-is-all-you-need/", title: "a link is all you need" },
  { url: "https://aifoc.us/update-on-claude-commits/", title: "update on claude commits" },
];

test("normalizeArticlePath treats a trailing slash as the same page", () => {
  assert.equal(normalizeArticlePath("/setting-goals/"), "/setting-goals");
  assert.equal(normalizeArticlePath("/setting-goals"), "/setting-goals");
  assert.equal(normalizeArticlePath("/setting-goals///"), "/setting-goals");
  assert.equal(normalizeArticlePath("/"), "/");
});

test("normalizeArticlePath rejects anything that is not a site-absolute path", () => {
  assert.equal(normalizeArticlePath("setting-goals"), null);
  assert.equal(normalizeArticlePath("https://aifoc.us/setting-goals/"), null);
  assert.equal(normalizeArticlePath("javascript:alert(1)"), null);
  assert.equal(normalizeArticlePath(""), null);
  assert.equal(normalizeArticlePath(undefined), null);
  assert.equal(normalizeArticlePath(42), null);
});

test("an article URL from the index resolves to its entry, with or without the slash", () => {
  assert.equal(findArticle(ARTICLES, "/setting-goals/")?.title, "setting goals");
  assert.equal(findArticle(ARTICLES, "/setting-goals")?.title, "setting goals");
});

test("account, admin, API, search and stats paths are not articles", () => {
  for (const path of [
    "/api/account",
    "/api/account/",
    "/api/reader/state",
    "/admin/",
    "/api/admin/og",
    "/search/",
    "/stats/",
    "/",
    "/not-a-real-post/",
  ]) {
    assert.equal(findArticle(ARTICLES, path), null, `${path} must not match an article`);
  }
});

test("dot segments do not climb out of the allowlist", () => {
  assert.equal(findArticle(ARTICLES, "/setting-goals/../api/account"), null);
  assert.equal(findArticle(ARTICLES, "/setting-goals/../../admin/"), null);
});

test("entries that are not absolute URLs are skipped, not guessed at", () => {
  const mixed = [{ url: "setting-goals/" }, { url: null }, { url: "https://aifoc.us/setting-goals/" }];
  assert.equal(findArticle(mixed, "/setting-goals/")?.url, "https://aifoc.us/setting-goals/");
  assert.equal(findArticle([{ url: "setting-goals/" }], "/setting-goals"), null);
});

test("a missing or empty index matches nothing", () => {
  assert.equal(findArticle(undefined, "/setting-goals/"), null);
  assert.equal(findArticle([], "/setting-goals/"), null);
  assert.equal(findArticle(ARTICLES, null), null);
});

test("the fetch path is the index's own canonical spelling", () => {
  assert.equal(articleFetchPath(findArticle(ARTICLES, "/setting-goals")), "/setting-goals/");
  assert.equal(articleFetchPath(null), null);
  assert.equal(articleFetchPath({ url: "setting-goals/" }), null);
});
