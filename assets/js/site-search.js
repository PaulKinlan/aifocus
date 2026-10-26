// Shared search for aifoc.us, used by the /search/ page and the WebMCP
// search_articles tool.
//
// searchSite() asks /api/search (the AI Search instance behind a Pages
// Function) first. If that request fails for any reason, it falls back to
// keyword matching over the Hugo-built /index.json, so search keeps working
// when the function, the binding or the instance is unavailable. The result
// says which path produced it in `source`.

export const loadArticleIndex = (() => {
  let promise = null;
  return () => {
    if (!promise) {
      promise = fetch("/index.json", { headers: { Accept: "application/json" } })
        .then((res) => {
          if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
          return res.json();
        })
        .catch((err) => {
          promise = null;
          throw err;
        });
    }
    return promise;
  };
})();

const scoreArticle = (article, terms) => {
  const haystack = `${article.title}\n${article.summary}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (article.title.toLowerCase().includes(term)) score += 3;
    if (haystack.includes(term)) score += 1;
  }
  return score;
};

export const matchArticles = (articles, query, limit) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return articles.slice(0, limit);
  return articles
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.article);
};

const keywordSearch = async (query, limit) => {
  const index = await loadArticleIndex();
  const results = matchArticles(index.articles, query, limit).map((a) => ({
    title: a.title,
    url: a.url,
    date: a.date,
    summary: a.summary,
  }));
  return { query, count: results.length, source: "keyword", results };
};

// /api/search tries each AI Search path with its own time limit, so a
// request that takes longer than this is not going to answer.
export const SEARCH_TIMEOUT_MS = 10000;

export const searchSite = async (query, { limit = 10, signal, keywordFallback = true } = {}) => {
  const trimmed = (query || "").trim();
  if (!trimmed) return { query: "", count: 0, source: "none", results: [] };
  // One controller aborts on the caller's signal or the deadline, whichever
  // comes first (AbortSignal.any is not available in every browser).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Search timed out", "TimeoutError")), SEARCH_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
    const res = await fetch(`/api/search?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`/api/search: HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.results)) throw new Error("/api/search: bad body");
    return body;
  } catch (err) {
    if (signal?.aborted) throw signal.reason ?? err;
    if (!keywordFallback) throw err;
    return keywordSearch(trimmed, limit);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
};

export const keywordSearchSite = (query, limit = 10) => keywordSearch((query || "").trim(), limit);
