// Site search backed by the `aifocus-search` AI Search instance.
//
// GET /api/search?q=<query>[&limit=<n>]
//
// AI Search returns scored chunks keyed by the crawled page URL. This function
// groups chunks by page, keeps only pages that are published essays (matched
// against the Hugo-built /index.json), and returns one result per essay with
// the best-scoring chunk as the snippet. Anything that is not an essay in the
// index (archive pages, demos, the home page) is dropped, so a result always
// has a title, date and summary.
//
// The browser falls back to keyword matching over /index.json when this
// endpoint fails, so errors are reported as JSON with a 5xx status rather than
// hidden.

const INSTANCE_NAME = "aifocus-search";
const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
// Chunks requested from AI Search. Several chunks usually come from the same
// essay, so ask for more than the number of essays returned.
const CHUNK_COUNT = 30;
const SNIPPET_LENGTH = 280;
const CACHE_SECONDS = 300;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

// Collapse whitespace and cap length so a crafted query cannot fan out into
// an oversized retrieval request. Returns "" for anything unusable.
function normalizeQuery(raw) {
  if (typeof raw !== "string") return "";
  const collapsed = raw.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

function parseLimit(raw) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// A crawled item key may be a full URL ("https://aifoc.us/slug/"), a
// host-prefixed path ("aifoc.us/slug/") or a bare path. Reduce each to a
// pathname with a trailing slash so it can be compared with index.json URLs.
function keyToPath(key) {
  if (typeof key !== "string" || !key) return null;
  let candidate = key.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = candidate.startsWith("/")
      ? `https://aifoc.us${candidate}`
      : `https://${candidate}`;
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  let path = url.pathname.replace(/\/index\.(?:html|md)$/i, "/");
  if (!path.endsWith("/")) path += "/";
  return path;
}

// Accept both response shapes: the AI Search `chunks` array
// ({ text, score, item: { key } }) and the earlier AutoRAG `data` array
// ({ filename, score, attributes, content: [{ text }] }).
function extractChunks(result) {
  if (!result || typeof result !== "object") return [];
  if (Array.isArray(result.chunks)) {
    return result.chunks.map((chunk) => ({
      key: chunk?.item?.key ?? chunk?.item?.metadata?.url,
      score: Number(chunk?.score) || 0,
      text: typeof chunk?.text === "string" ? chunk.text : "",
    }));
  }
  if (Array.isArray(result.data)) {
    return result.data.map((entry) => ({
      key: entry?.attributes?.file?.url ?? entry?.filename,
      score: Number(entry?.score) || 0,
      text: Array.isArray(entry?.content)
        ? entry.content.map((part) => part?.text ?? "").join(" ")
        : "",
    }));
  }
  return [];
}

function toSnippet(text) {
  const clean = text
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/[#*_`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= SNIPPET_LENGTH) return clean;
  const cut = clean.slice(0, SNIPPET_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : SNIPPET_LENGTH)}…`;
}

function indexByPath(articles) {
  const byPath = new Map();
  for (const article of articles ?? []) {
    const path = keyToPath(article?.url);
    if (path) byPath.set(path, article);
  }
  return byPath;
}

function rankArticles(chunks, articlesByPath, limit) {
  const best = new Map();
  for (const chunk of chunks) {
    const path = keyToPath(chunk.key);
    if (!path || !articlesByPath.has(path)) continue;
    const current = best.get(path);
    if (!current || chunk.score > current.score) {
      best.set(path, chunk);
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([path, chunk]) => {
      const article = articlesByPath.get(path);
      return {
        title: article.title,
        url: article.url,
        date: article.date,
        summary: article.summary,
        snippet: toSnippet(chunk.text),
        score: Math.round(chunk.score * 1000) / 1000,
      };
    });
}

async function loadArticles(env, origin) {
  const request = new Request(new URL("/index.json", origin));
  const response = env?.ASSETS ? await env.ASSETS.fetch(request) : await fetch(request);
  if (!response.ok) throw new Error(`index.json: HTTP ${response.status}`);
  const index = await response.json();
  return Array.isArray(index?.articles) ? index.articles : [];
}

async function runSearch(env, query) {
  if (!env?.AI || typeof env.AI.autorag !== "function") {
    throw new Error("AI binding is not configured");
  }
  return env.AI.autorag(INSTANCE_NAME).search({
    query,
    max_num_results: CHUNK_COUNT,
    rewrite_query: false,
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = normalizeQuery(url.searchParams.get("q"));
  const limit = parseLimit(url.searchParams.get("limit"));

  if (!query) {
    return json({ error: "Missing query. Use /api/search?q=your+terms" }, 400);
  }

  // Cache on the normalized query so repeated searches do not re-run
  // retrieval. The Cache API is per data centre, which is enough here.
  const cacheKey = new Request(
    `${url.origin}/api/search?q=${encodeURIComponent(query.toLowerCase())}&limit=${limit}`,
  );
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  let results;
  try {
    const [articles, raw] = await Promise.all([
      loadArticles(env, url.origin),
      runSearch(env, query),
    ]);
    results = rankArticles(extractChunks(raw), indexByPath(articles), limit);
  } catch (err) {
    console.error("search failed", err);
    return json({ error: "Search is unavailable", query }, 503, {
      "Cache-Control": "no-store",
    });
  }

  const response = json(
    { query, count: results.length, source: "ai-search", results },
    200,
    { "Cache-Control": `public, max-age=60, s-maxage=${CACHE_SECONDS}` },
  );
  if (cache) {
    context.waitUntil?.(cache.put(cacheKey, response.clone()));
  }
  return response;
}

export {
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
};
