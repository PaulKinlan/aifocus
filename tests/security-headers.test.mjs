// Regression guard for aifocus-w9gv: Cloudflare Pages applies static/_headers
// only to static asset responses, never to Function-generated ones (verified
// against production 2026-11-08: a static 404 carried the full set while GET
// /api/auth/me, a Function 200, carried only what json() set). The baseline
// security set is therefore applied in code via functions/_lib/headers.js.
//
// Two failure shapes this file exists to catch:
//   1. a Function response path constructed without the baseline set; and
//   2. drift between the code-side set and the /* block of static/_headers,
//      which still covers static responses - the two must not diverge, or the
//      same origin would enforce different policy depending on which layer
//      happened to answer.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_HEADERS, applySecurityHeaders } from "../functions/_lib/headers.js";
import { json } from "../functions/_lib/reader.js";
import { redirect } from "../functions/_lib/auth.js";
import { onRequest } from "../functions/_middleware.js";

const BASELINE_NAMES = Object.keys(SECURITY_HEADERS);

function assertBaseline(res, label) {
  for (const name of BASELINE_NAMES) {
    assert.equal(res.headers.get(name), SECURITY_HEADERS[name], `${label}: missing or wrong ${name}`);
  }
}

test("json(): every response carries the baseline security set, and extraHeaders still wins", () => {
  const res = json({ ok: true });
  assertBaseline(res, "json()");
  assert.equal(res.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("Cache-Control"), "no-store");

  const custom = json({ ok: true }, 429, { "Cache-Control": "private" });
  assert.equal(custom.status, 429);
  assert.equal(custom.headers.get("Cache-Control"), "private");
  assertBaseline(custom, "json(extra)");
});

test("redirect(): OAuth and session redirects carry the baseline set without losing Set-Cookie", () => {
  const res = redirect("https://example.com/cb", ["aifocus_session=abc; HttpOnly"]);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "https://example.com/cb");
  assert.equal(res.headers.get("Set-Cookie"), "aifocus_session=abc; HttpOnly");
  assertBaseline(res, "redirect()");
});

test("applySecurityHeaders: set-if-absent, and body/status survive the re-wrap", async () => {
  const original = new Response("payload", {
    status: 201,
    headers: { "Referrer-Policy": "no-referrer" },
  });
  const res = applySecurityHeaders(original);
  assert.equal(res.status, 201);
  assert.equal(await res.text(), "payload");
  // A handler that knows better keeps its own value.
  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
  assertBaselineExcept(res, ["Referrer-Policy"]);
});

function assertBaselineExcept(res, except) {
  for (const name of BASELINE_NAMES) {
    if (except.includes(name)) continue;
    assert.equal(res.headers.get(name), SECURITY_HEADERS[name], `missing or wrong ${name}`);
  }
}

test("middleware: the decorated .md response and the root redirect are Function responses, so they carry the baseline set", async () => {
  // Direct .md request, decorated in code by decorateMarkdown.
  const mdRes = await onRequest({
    request: new Request("https://aifocus.blog/sandbox-summary.md"),
    next: async () =>
      new Response("# Summary", { status: 200, headers: { "Content-Type": "text/markdown" } }),
    env: {},
  });
  assert.equal(mdRes.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assertBaseline(mdRes, "decorated .md");

  // Root redirect, constructed in code when latest-post.txt resolves.
  const redirectRes = await onRequest({
    request: new Request("https://aifocus.blog/"),
    next: async () => new Response("<html>home</html>", { status: 200 }),
    env: {
      ASSETS: {
        fetch: async () => new Response("/model-half-life/", { status: 200 }),
      },
    },
  });
  assert.equal(redirectRes.status, 302);
  assert.equal(redirectRes.headers.get("Location"), "https://aifocus.blog/model-half-life/");
  assertBaseline(redirectRes, "root redirect");
});

test("middleware: passthrough (static) responses are left for the edge's _headers, not decorated twice", async () => {
  // The final next() wrap must NOT add the baseline set: static responses get
  // static/_headers applied at the edge, and setting the same headers in code
  // first would risk the edge joining its own values onto them. What the wrap
  // must do is preserve whatever upstream sent (plus Vary).
  const res = await onRequest({
    request: new Request("https://aifocus.blog/model-half-life/"),
    next: async () =>
      new Response("<html>Post</html>", {
        status: 200,
        headers: { "Content-Type": "text/html", "X-Content-Type-Options": "nosniff" },
      }),
    env: {},
  });
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff", "upstream headers preserved");
  assert.equal(res.headers.get("Vary"), "Accept");
  assert.equal(res.headers.get("Content-Security-Policy"), null, "no code-side CSP on static passthrough");
});

test("drift guard: the code-side baseline matches the /* block of static/_headers", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.resolve(here, "../static/_headers"), "utf8");
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.trim() === "/*");
  assert.notEqual(start, -1, "static/_headers has a /* block");
  const block = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break; // blank line ends the /* rule block
    assert.ok(/^\s/.test(line), `line ${i + 1} of the /* block must be an indented header line: ${line}`);
    const idx = line.indexOf(":");
    block[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  for (const [name, value] of Object.entries(block)) {
    assert.equal(
      SECURITY_HEADERS[name],
      value,
      `static/_headers sets ${name}: ${value} - functions/_lib/headers.js must carry the same value`,
    );
  }
  for (const name of BASELINE_NAMES) {
    assert.ok(block[name], `functions/_lib/headers.js sets ${name} but static/_headers /* does not`);
  }
});
