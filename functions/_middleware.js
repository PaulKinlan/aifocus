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

function markdownSiblingPath(pathname) {
  if (pathname.endsWith(".md")) return pathname;
  if (pathname.endsWith("/")) return pathname + "index.md";
  return pathname + "/index.md";
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
  headers.append("Vary", "Accept");
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Direct `.md` request — serve as markdown with token count.
  if (url.pathname.endsWith(".md")) {
    const response = await next();
    return decorateMarkdown(response);
  }

  // Only consider GET/HEAD and only for paths that look like pages (trailing
  // slash or extensionless). Leave static assets alone.
  const method = request.method.toUpperCase();
  const looksLikePage =
    url.pathname.endsWith("/") || !/\.[a-z0-9]+$/i.test(url.pathname);

  if ((method === "GET" || method === "HEAD") && looksLikePage &&
      prefersMarkdown(request.headers.get("accept"))) {
    const mdUrl = new URL(url);
    mdUrl.pathname = markdownSiblingPath(url.pathname);
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

  const response = await next();
  const headers = new Headers(response.headers);
  headers.append("Vary", "Accept");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
