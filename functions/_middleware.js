// Content negotiation middleware for Cloudflare Pages.
//
// - When a client requests a page with `Accept: text/markdown` (or a higher
//   q-value for markdown than html), serve the Hugo-built `index.md` sibling
//   and advertise an estimated token count via `x-markdown-tokens`.
// - When a `.md` file is requested directly, tag the response with the same
//   headers so agents can discover it.
// - Always append `Vary: Accept` so caches don't cross-contaminate variants.

const MARKDOWN_TYPES = new Set([
  "text/markdown",
  "text/x-markdown",
  "application/markdown",
]);

// Top-level paths that are not post or tutorial content roots and must never
// trigger markdown negotiation.
const RESERVED_ROOTS = new Set([
  "",
  "api",
  "authors",
  "categories",
  "css",
  "data",
  "fonts",
  "functions",
  "images",
  "js",
  "posts",
  "search",
  "static",
  "tags",
  "training",
  "tutorials",
  "where-prompts-run-demo",
]);

// Rough heuristic matching Cloudflare's own "Markdown for Agents" behaviour:
// ~4 characters per token for typical English prose. Good enough for clients
// that want to budget context windows; not a substitute for a real tokenizer.
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function parseAccept(header) {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";").map((s) => s.trim());
      let q = 1;
      for (const p of params) {
        const [k, v] = p.split("=");
        if (k === "q") {
          const parsed = parseFloat(v);
          if (!Number.isNaN(parsed)) q = parsed;
        }
      }
      return { type: type.toLowerCase(), q };
    })
    .filter((e) => e.type)
    .sort((a, b) => b.q - a.q);
}

function prefersMarkdown(header) {
  const entries = parseAccept(header);
  if (entries.length === 0) return false;
  let markdownQ = -1;
  let htmlQ = -1;
  for (const { type, q } of entries) {
    if (MARKDOWN_TYPES.has(type) && q > markdownQ) markdownQ = q;
    if ((type === "text/html" || type === "application/xhtml+xml") && q > htmlQ) {
      htmlQ = q;
    }
  }
  if (markdownQ < 0) return false;
  // Require markdown to be explicitly requested with a q-value strictly greater
  // than html so that ordinary browsers (which send `*/*` or html-first) keep
  // getting html.
  return markdownQ > htmlQ;
}

// Defense-in-depth path safety guard.
// Note on URL canonicalization: WHATWG Request parsing canonicalizes standard
// dot-segments (/../) and slashes before request reaches Cloudflare Pages
// middleware; canonicalized requests remain strictly bounded by isValidContentPath.
// isUnsafePath operates on post-Request-normalization input as defense-in-depth,
// explicitly rejecting encoded traversal (%2e%2e, %2e.), raw or encoded
// backslashes (\, %5c), encoded slashes (%2f), nested encodings, and control characters.
function isUnsafePath(rawUrl, pathname) {
  let urlObj;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    return true;
  }

  // Extract path portion from the raw URL before URL parser normalization
  const hostIdx = rawUrl.indexOf(urlObj.host);
  const pathAndSearch = hostIdx !== -1 ? rawUrl.slice(hostIdx + urlObj.host.length) : rawUrl;
  const rawPath = pathAndSearch.split("?")[0].split("#")[0];

  // 1. Raw path check for backslash or encoded traversal/slashes
  if (/\\|%5[cC]/i.test(rawPath) || /\.\.|\/\.\/|%(?:2[eE]|2[fF])/i.test(rawPath)) {
    return true;
  }

  // 2. Parsed pathname check
  if (/\\|%5[cC]/i.test(pathname) || /\.\.|\/\.\/|%(?:2[eE]|2[fF])/i.test(pathname)) {
    return true;
  }

  // 3. Iterative decode to catch nested percent-encoding (e.g. %252e%252e)
  let decoded = pathname;
  let iterations = 0;
  while (decoded.includes("%")) {
    if (++iterations > 5) return true; // runaway / deeply nested encoding
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true; // malformed encoding
    }
  }

  // 4. Decoded check for traversal, backslashes, or control characters
  if (/\.\.|\/\.\/|\\|[\x00-\x1f\x7f]/.test(decoded)) {
    return true;
  }

  return false;
}

// Normalize path: collapse consecutive slashes and ensure leading slash.
function normalizePath(pathname) {
  let normalized = pathname.replace(/\/+/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }
  return normalized;
}

// Restrict markdown negotiation to expected published content roots:
// 1. Single-segment post slug: /:slug/ (or /:slug)
// 2. Posts section slug: /posts/:slug/
// 3. Tutorials section slug: /training/:slug/ or /tutorials/:slug/
function isValidContentPath(normalizedPath) {
  const trimmed = normalizedPath.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return false;

  const segments = trimmed.split("/");

  // 1. Root-level post slug: /:slug/
  if (segments.length === 1) {
    const slug = segments[0];
    if (RESERVED_ROOTS.has(slug.toLowerCase())) return false;
    if (slug.startsWith(".") || slug.startsWith("_")) return false;
    return /^[a-z0-9][a-z0-9-]*$/i.test(slug);
  }

  // 2. Posts section: /posts/:slug/
  if (segments.length === 2 && segments[0].toLowerCase() === "posts") {
    const slug = segments[1];
    if (slug.startsWith(".") || slug.startsWith("_")) return false;
    return /^[a-z0-9][a-z0-9-]*$/i.test(slug);
  }

  // 3. Tutorials / training section: /training/:slug or /tutorials/:slug
  const section = segments[0].toLowerCase();
  if ((section === "training" || section === "tutorials") && segments.length >= 2) {
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || seg.startsWith(".") || seg.startsWith("_")) return false;
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(seg)) return false;
    }
    return true;
  }

  return false;
}

function markdownSiblingPath(pathname) {
  if (pathname.endsWith(".md")) return pathname;
  if (pathname.endsWith("/")) return pathname + "index.md";
  return pathname + "/index.md";
}

function appendVaryAccept(headers) {
  const vary = headers.get("Vary");
  if (!vary) {
    headers.set("Vary", "Accept");
  } else if (!vary.split(",").map((s) => s.trim().toLowerCase()).includes("accept")) {
    headers.set("Vary", `${vary}, Accept`);
  }
}

async function decorateMarkdown(response) {
  if (!response.ok) return response;
  // Read body as text so any transport-level encoding is resolved before we
  // re-serve it; then strip encoding/length headers that no longer apply.
  const text = await response.text();
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("x-markdown-tokens", String(estimateTokens(text)));
  appendVaryAccept(headers);
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// The Hugo home.latest.txt output uses the same published posts/date order as home.json.
// Accept only a local post permalink, never an external URL or a section root.
function isValidLatestPostPath(path) {
  return /^\/(?:posts\/)?[a-z0-9][a-z0-9-]*\/$/i.test(path) &&
    isValidContentPath(path);
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD") && env?.ASSETS) {
    try {
      const assetUrl = new URL("/latest-post.txt", url.origin);
      const latest = await env.ASSETS.fetch(new Request(assetUrl));
      if (latest.ok) {
        const path = (await latest.text()).trim();
        if (isValidLatestPostPath(path)) {
          const destination = new URL(path, url.origin);
          destination.search = url.search;
          return new Response(null, {
            status: 302,
            headers: { Location: destination.href, "Cache-Control": "no-store" },
          });
        }
      }
    } catch {
      // Missing/unreadable build asset: keep serving the existing homepage.
    }
  }

  // Direct `.md` request — serve as markdown with token count if path is safe.
  if (url.pathname.endsWith(".md")) {
    const response = await next();
    if (!isUnsafePath(request.url, url.pathname)) {
      return decorateMarkdown(response);
    }
    return response;
  }

  // Only consider GET/HEAD and only for paths that look like pages (trailing
  // slash or extensionless). Leave static assets alone.
  const method = request.method.toUpperCase();
  const looksLikePage =
    url.pathname.endsWith("/") || !/\.[a-z0-9]+$/i.test(url.pathname);

  if (
    (method === "GET" || method === "HEAD") &&
    looksLikePage &&
    prefersMarkdown(request.headers.get("accept")) &&
    !isUnsafePath(request.url, url.pathname)
  ) {
    const normalized = normalizePath(url.pathname);
    if (isValidContentPath(normalized)) {
      const mdUrl = new URL(url);
      mdUrl.pathname = markdownSiblingPath(normalized);
      const assetRequest = new Request(mdUrl.toString(), {
        method,
        headers: request.headers,
      });
      // On Cloudflare Pages the static asset binding is exposed as env.ASSETS.
      const fetcher = env && env.ASSETS ? env.ASSETS : null;
      const mdResponse = fetcher
        ? await fetcher.fetch(assetRequest)
        : await fetch(assetRequest);
      if (mdResponse.ok) {
        return decorateMarkdown(mdResponse);
      }
      // Fall through to the HTML response if no markdown variant exists.
    }
  }

  const response = await next();
  const headers = new Headers(response.headers);
  appendVaryAccept(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export {
  MARKDOWN_TYPES,
  RESERVED_ROOTS,
  estimateTokens,
  parseAccept,
  prefersMarkdown,
  isUnsafePath,
  normalizePath,
  isValidContentPath,
  markdownSiblingPath,
  decorateMarkdown,
  isValidLatestPostPath,
};
