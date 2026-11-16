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
import { attr, adminScriptViolation } from "./helpers/admin-script-guard.mjs";

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
  for (const [name, value] of Object.entries(headerBlock("/*"))) {
    assert.equal(
      SECURITY_HEADERS[name],
      value,
      `static/_headers sets ${name}: ${value} - functions/_lib/headers.js must carry the same value`,
    );
  }
  for (const name of BASELINE_NAMES) {
    assert.ok(headerBlock("/*")[name], `functions/_lib/headers.js sets ${name} but static/_headers /* does not`);
  }
});

// Headers of one rule block in static/_headers. A rule starts at an unindented
// (non-comment) line and runs until a blank line; everything inside it must be
// an indented `Name: value` header.
function headerBlock(rulePath) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const lines = fs.readFileSync(path.resolve(here, "../static/_headers"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.trim() === rulePath);
  assert.notEqual(start, -1, `static/_headers has a ${rulePath} block`);
  const block = {};
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) break; // blank line ends the rule block
    if (/^\s*#/.test(line)) continue; // comment inside the block
    assert.ok(/^\s/.test(line), `line ${i + 1} of the ${rulePath} block must be an indented header line: ${line}`);
    const idx = line.indexOf(":");
    assert.ok(idx > 0, `line ${i + 1} of the ${rulePath} block is not a Name: value header: ${line}`);
    block[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return block;
}

// The directives the /admin/* block is allowed to narrow relative to /*. Every
// other directive must stay byte-identical to the /* value, because the guard's
// job there is accidental-drift detection. These two are compared as source
// lists instead: adding a source is what the guard must catch, and narrowing one
// is the change (script-src and connect-src, aifocus-wwfp and aifocus-wn4o).
const NARROWABLE = ["script-src", "connect-src"];

// The CSP directive list as a comparable string, with each narrowable directive
// replaced by a placeholder so the two policies can be compared for every OTHER
// directive.
function directives(policy) {
  return policy
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => (NARROWABLE.includes(d.split(" ")[0]) ? `${d.split(" ")[0]} <narrowed>` : d))
    .join("; ");
}

// The sources of one directive in a policy, as a Set.
function directiveSources(policy, name) {
  const directive = policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  assert.ok(directive, `policy declares ${name}`);
  return new Set(directive.slice(name.length).trim().split(/\s+/).filter(Boolean));
}

test("drift guard: the /admin/* policy narrows script-src and connect-src and changes nothing else", () => {
  const policy = headerBlock("/admin/*")["Content-Security-Policy"];
  assert.ok(policy, "/admin/* declares its own Content-Security-Policy");
  const baseline = SECURITY_HEADERS["Content-Security-Policy"];

  // 'self' only: no 'unsafe-inline' (which would let an injected inline script
  // ride the moderator's Access cookie into /api/admin/*) and no third-party
  // host (which would let a compromised analytics/widget dependency do it).
  assert.deepEqual(
    directiveSources(policy, "script-src"),
    new Set(["'self'"]),
    "/admin/* script-src must be exactly 'self'",
  );

  // connect-src 'self' (aifocus-wn4o): assets/js/admin-page.js fetches only
  // /api/admin/*, so any other origin here is an exfil target for a first-party
  // module carrying moderator data. 'self' has to stay for those API calls, and
  // nothing else may appear - every origin this block lists is also allowed by
  // /*, so the only direction this directive can move is narrower.
  const connect = directiveSources(policy, "connect-src");
  assert.ok(connect.has("'self'"), "/admin/* connect-src must keep 'self' so the page can call /api/admin/*");
  assert.deepEqual(
    connect,
    new Set(["'self'"]),
    "/admin/* connect-src must be exactly 'self' - no origin the /* policy allows may reappear here",
  );

  assert.equal(
    directives(policy),
    directives(baseline),
    "/admin/* CSP must be the /* CSP with only script-src and connect-src narrowed - change both together",
  );
});

test("built /admin/ page satisfies its own script-src 'self': no inline script, no on* handler, no third-party script", (t) => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(here, "../public/admin/index.html");
  if (!fs.existsSync(file)) {
    t.skip("public/admin/index.html does not exist (run npm run build first)");
    return;
  }
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
  assert.ok(scripts.length > 0, "the admin page still loads its own bundled script");
  for (const attrs of scripts) {
    const violation = adminScriptViolation(attrs);
    assert.ok(!violation, violation);
  }
  assert.doesNotMatch(html, /\son[a-z]+=/i, "an on* handler (gtag bootstrap, font onload) is blocked by the /admin/* policy");
  assert.doesNotMatch(html, /googletagmanager|speculationrules/i, "the admin page loads no analytics and no inline speculation rules");
});

// The guard's own matching rules, unit-tested directly (aifocus-sy1d): the
// shapes below once PASSED the built-page check - a green gate on markup that
// script-src 'self' would break at runtime.
test("admin script guard: attr() is anchored so data-* cannot masquerade as src or type", () => {
  // \bsrc= matched inside data-src=, so a script carrying only data-src read
  // as external same-origin and skipped the inline-script rejection.
  assert.equal(attr(' data-src="/js/ok.js"', "src"), null);
  assert.equal(attr(' data-type="application/json"', "type"), null);
  // The anchor still reads genuine attributes, unquoted (hugo --minify) or
  // quoted, at string start or after whitespace.
  assert.equal(attr("src=/js/main.abc.js", "src"), "/js/main.abc.js");
  assert.equal(attr(' type="module" src="/admin/js/main.abc.js"', "src"), "/admin/js/main.abc.js");
  assert.equal(attr(' type="module"', "type"), "module");
});

test("admin script guard: src must start with exactly one '/' - no protocol-relative, no backslash form", () => {
  // '//evil.example/x.js' starts with '/', so startsWith("/") passed it; under
  // script-src 'self' the browser blocks it and /admin/ breaks silently.
  assert.match(
    adminScriptViolation(' src="//evil.example/x.js"'),
    /blocked by the \/admin\/\* policy/,
  );
  // The URL parser normalizes '\' to '/' in special schemes, so src=/\\host/x.js
  // resolves cross-origin exactly like the '//' form.
  assert.match(
    adminScriptViolation(' src="/\\\\evil.example/x.js"'),
    /blocked by the \/admin\/\* policy/,
  );
  assert.equal(adminScriptViolation(' src="/js/main.abc.js"'), null);
});

test("admin script guard: executable inline scripts are rejected, data blocks are skipped", () => {
  // data-src alone is NOT a src: the tag is executable inline and must be
  // rejected, not passed as external same-origin (aifocus-sy1d shape 2).
  assert.match(
    adminScriptViolation(' data-src="/js/ok.js"'),
    /^inline <script/,
  );
  // data-type alone is NOT a type: the tag is executable inline, so the
  // NON_EXECUTABLE skip must not fire on it.
  assert.match(
    adminScriptViolation(' data-type="application/json"'),
    /^inline <script/,
  );
  // Genuine data blocks stay skipped, and the bundled module script passes.
  assert.equal(adminScriptViolation(' type="application/ld+json"'), null);
  assert.equal(adminScriptViolation(' type="application/json"'), null);
  assert.equal(adminScriptViolation(' type="module" src="/admin/js/main.abc.js" integrity="abc" crossorigin="anonymous"'), null);
});

test("admin script guard: src is checked after character references decode and URL normalization (aifocus-yeda)", () => {
  // Each raw value here starts with a single '/', but the browser decodes
  // character references and then normalizes the URL (strips leading/trailing
  // C0 controls and spaces, removes every tab/LF/CR) BEFORE resolving it - so
  // each of these loads //evil.example, cross-origin. Reading raw markup, the
  // guard passed every one of them (aifocus-yeda).
  assert.match(adminScriptViolation(' src="/&#47;evil.example/x.js"'), /blocked by the \/admin\/\* policy/);
  assert.match(adminScriptViolation(' src="/&#x2f;evil.example/x.js"'), /blocked by the \/admin\/\* policy/);
  assert.match(adminScriptViolation(' src="/&sol;evil.example/x.js"'), /blocked by the \/admin\/\* policy/);
  assert.match(adminScriptViolation(' src="/&#9;&#47;evil.example/x.js"'), /blocked by the \/admin\/\* policy/);
  assert.match(adminScriptViolation(' src="/&NewLine;/evil.example/x.js"'), /blocked by the \/admin\/\* policy/);
  assert.match(adminScriptViolation(" src=/&#47;&#47;evil.example/x.js"), /blocked by the \/admin\/\* policy/);
  // Values that decode and normalize to a genuine path-absolute same-origin
  // URL still pass, including a decoded quote inside the path (the browser
  // percent-encodes it; still same-origin).
  assert.equal(adminScriptViolation(' src="/js/main.abc.js"'), null);
  assert.equal(adminScriptViolation(' src="/a&quot;b/c.js"'), null);
  // attr() exposes the DECODED value, which is what the checks above rely on.
  assert.equal(attr(' src="/&#47;evil"', "src"), "//evil");
});
