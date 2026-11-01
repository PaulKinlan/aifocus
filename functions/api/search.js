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

import { INSTANCE_NAME, extractChunks, searchChunks } from "../_lib/ai-search.js";
import { hashIp, UNKNOWN_IP_BUCKET } from "../_lib/reader.js";

const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SEARCHES_PER_HOUR = 30;
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

// Atomically reserve a search slot before spending on retrieval.
// Prunes expired records older than the 1-hour window so storage does not grow forever.
// Conditionally inserts a row ONLY if the IP is currently under the hourly limit;
// if the limit is reached, nothing is inserted (preventing unbounded table growth).
// Fails closed if the database is missing or errors.
export async function reserveSearchSlot(db, ipHash, now) {
  if (!db) throw new Error("READER_DB unavailable for search rate limiting");
  const windowStart = now - 60 * 60 * 1000;
  const batchRes = await db.batch([
    db.prepare("DELETE FROM search_log WHERE created_at <= ?").bind(windowStart),
    db.prepare(
      `INSERT INTO search_log (ip_hash, created_at)
       SELECT ?1, ?2
       WHERE (SELECT COUNT(*) FROM search_log WHERE ip_hash = ?1 AND created_at > ?3) < ?4`,
    ).bind(ipHash, now, windowStart, SEARCHES_PER_HOUR),
  ]);
  const changes = batchRes[1]?.meta?.changes ?? batchRes[1]?.changes ?? 0;
  return changes > 0;
}

// Collapse whitespace and cap length so a crafted query cannot fan out into
// an oversized retrieval request. Returns "" for anything unusable.
export function normalizeQuery(raw) {
  if (typeof raw !== "string") return "";
  const collapsed = raw.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  // Truncate by code point, and drop any lone surrogate from the input, so
  // the result is always well-formed and encodeURIComponent() cannot throw.
  return Array.from(collapsed)
    .filter((ch) => !/^[\ud800-\udfff]$/.test(ch))
    .slice(0, MAX_QUERY_LENGTH)
    .join("")
    .trim();
}

function parseLimit(raw) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// A crawled item key may be a full URL ("https://aifoc.us/slug/"), a
// host-prefixed path ("aifoc.us/slug/") or a bare path. Reduce each to a
// pathname with a trailing slash so it can be compared with index.json URLs.
export function keyToPath(key) {
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

// Reduce a Markdown chunk to plain prose for display. The crawler stores
// pages as Markdown, so chunks carry link syntax, images, emphasis, headings,
// list markers, tables, code and the odd HTML tag.
export function stripMarkdown(text) {
  return (text || "")
    .replace(/^---[\s\S]*?\n---\s*/, "") // front matter
    .replace(/```[\s\S]*?(```|$)/g, " ") // fenced code blocks
    .replace(/<!--[\s\S]*?-->/g, " ") // HTML comments
    .replace(/<[^>]+>/g, " ") // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, " ") // reference images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // inline links -> text
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1") // reference links -> text
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, " ") // link definitions
    .replace(/<?https?:\/\/\S+>?/g, " ") // bare URLs
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "") // list markers
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, " ") // horizontal rules
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, " ") // table separators
    .replace(/\s*\|\s*/g, " ") // table cell pipes
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
    .replace(/(^|[\s(])([*_])(\S(?:.*?\S)?)\2(?=[\s).,;:!?]|$)/g, "$1$3") // italics
    .replace(/~~(.+?)~~/g, "$1") // strikethrough
    .replace(/\\([\\`*_{}\[\]()#+\-.!>|])/g, "$1") // escapes
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSnippet(text) {
  const clean = stripMarkdown(text);
  if (clean.length <= SNIPPET_LENGTH) return clean;
  const cut = clean.slice(0, SNIPPET_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : SNIPPET_LENGTH)}…`;
}

export function indexByPath(articles) {
  const byPath = new Map();
  for (const article of articles ?? []) {
    const path = keyToPath(article?.url);
    if (path) byPath.set(path, article);
  }
  return byPath;
}

export function rankArticles(chunks, articlesByPath, limit) {
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

export async function loadArticles(env, origin) {
  const request = new Request(new URL("/index.json", origin));
  const response = env?.ASSETS ? await env.ASSETS.fetch(request) : await fetch(request);
  if (!response.ok) throw new Error(`index.json: HTTP ${response.status}`);
  const index = await response.json();
  return Array.isArray(index?.articles) ? index.articles : [];
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

  // Rate limit: reserve before spend in a single atomic batch.
  // Fails closed if the database is missing or errors.
  const db = env?.READER_DB;
  const now = Date.now();
  const clientIp = request.headers.get("CF-Connecting-IP");
  let ipHash;
  try {
    ipHash = (db ? await hashIp(db, clientIp) : null) ?? UNKNOWN_IP_BUCKET;
    const allowed = await reserveSearchSlot(db, ipHash, now);
    if (!allowed) {
      return json({ error: "Too many searches. Please try again later.", query }, 429, {
        "Cache-Control": "no-store",
      });
    }
  } catch (err) {
    console.error("search rate limit error", err?.message || err);
    return json({ error: "Search rate limit error", query }, 503, {
      "Cache-Control": "no-store",
    });
  }

  let results;
  try {
    const [articles, found] = await Promise.all([
      loadArticles(env, url.origin),
      searchChunks(env, query, CHUNK_COUNT),
    ]);
    results = rankArticles(found.chunks, indexByPath(articles), limit);
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

export { INSTANCE_NAME, MAX_QUERY_LENGTH, MAX_LIMIT, SEARCHES_PER_HOUR, parseLimit, extractChunks };
