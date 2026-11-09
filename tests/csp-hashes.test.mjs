// tools/csp-hashes.mjs (aifocus-5wrp): the script-src hash list is generated
// from the built site and checked by the gate. These tests pin the properties
// that make that useful: a new inline script is a failure with a named fix, a
// removed one is a failure too (no stale hashes to reason about), inert script
// types are not hashed, 'unsafe-inline' is refused in script-src while
// style-src keeps its own, and the rewrite preserves every other token.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditProblems,
  collectHashes,
  collectInlineExecSurfaces,
  inlineExecSurfaces,
  parsePolicy,
  renderPolicy,
  scriptSrcParts,
} from "../tools/csp-hashes.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const site = (pages) => {
  const dir = mkdtempSync(path.join(tmpdir(), "csp-"));
  for (const [name, html] of Object.entries(pages)) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, html);
  }
  return dir;
};

const page = (...scripts) => `<html><body>${scripts.join("")}</body></html>`;

test("script bodies the browser enforces are hashed; inert data blocks are not", () => {
  const dir = site({
    "index.html": page(
      "<script>console.log(1)</script>",
      '<script src="/app.js"></script>',
      '<script type="application/ld+json">{"a":1}</script>',
      '<script type="application/json">{"a":1}</script>',
      '<script type="importmap">{"imports":{}}</script>',
      // Speculation rules do not run as script, but script-src still gates them:
      // an inline block without a hash is blocked (a real violation, see the
      // browser pass on this bead), so it must be hashed like code.
      '<script type="speculationrules">{"prerender":[]}</script>',
    ),
    "nested/page.html": page("<script>console.log(1)</script>"),
  });
  const hashes = collectHashes(dir);
  assert.equal(hashes.length, 2, "one hash for the script (same body on two pages) + one for the rules");
  for (const hash of hashes) assert.match(hash, /^'sha256-[A-Za-z0-9+/=]+'$/);
});

test("data blocks that are not enforced are left out of the hash list", () => {
  const dir = site({
    "index.html": page(
      '<script type="application/ld+json">{"a":1}</script>',
      '<script type="application/json">{"a":1}</script>',
      '<script type="importmap">{"imports":{}}</script>',
    ),
  });
  assert.deepEqual(collectHashes(dir), []);
});

test("a new inline script is a failure that names the fix", () => {
  const dir = site({ "index.html": page("<script>console.log(1)</script>") });
  const before = collectHashes(dir);
  assert.deepEqual(auditProblems({ built: before, declared: before, others: ["'self'"] }).problems, []);

  const after = collectHashes(site({ "index.html": page("<script>console.log(1)</script>", "<script>console.log(2)</script>") }));
  const { problems, missing } = auditProblems({ built: after, declared: before, others: ["'self'"] });
  assert.equal(missing.length, 1);
  assert.match(problems[0], /1 inline script\(s\) built but not allowed by script-src/);
  assert.match(problems[0], /fix: node tools\/csp-hashes\.mjs/);
});

test("a hash whose script is gone is a failure too", () => {
  const dir = site({ "index.html": page("<script>console.log(1)</script>") });
  const built = collectHashes(dir);
  const { problems, stale } = auditProblems({ built, declared: [...built, "'sha256-AAAA'"], others: [] });
  assert.equal(stale.length, 1);
  assert.match(problems[0], /match no built script/);
});

test("'unsafe-inline' in script-src is refused", () => {
  const { problems } = auditProblems({ built: [], declared: [], others: ["'self'", "'unsafe-inline'"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /decorative/);
});

test("the rewrite keeps every other script-src token and only touches script-src", () => {
  const policy = parsePolicy(
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://a.example 'sha256-OLD='; style-src 'self' 'unsafe-inline'; object-src 'none'",
  );
  const rendered = renderPolicy(policy, ["'sha256-NEW1='", "'sha256-NEW2='"]);
  assert.equal(
    rendered,
    "default-src 'self'; script-src 'self' 'sha256-NEW1=' 'sha256-NEW2=' https://a.example; style-src 'self' 'unsafe-inline'; object-src 'none'",
  );
  // style-src keeps 'unsafe-inline': 71 style attributes cannot be hashed.
  assert.match(rendered, /style-src 'self' 'unsafe-inline'/);
});

test("scriptSrcParts separates generated hashes from hand-written sources", () => {
  const { hashes, others } = scriptSrcParts("script-src 'self' 'sha256-AAA=' https://cdn.example 'unsafe-inline'");
  assert.deepEqual(hashes, ["'sha256-AAA='"]);
  assert.deepEqual(others, ["'self'", "https://cdn.example", "'unsafe-inline'"]);
});

test("the committed static/_headers is in step with the committed build", () => {
  // The gate runs the same check; this asserts the artefact that is checked in.
  const headers = readFileSync(path.join(ROOT, "static/_headers"), "utf8");
  const line = headers.split("\n").find((l) => l.trimStart().startsWith("Content-Security-Policy:"));
  const policy = parsePolicy(line.trimStart().slice("Content-Security-Policy:".length).trim());
  const directive = policy.find((part) => part.startsWith("script-src "));
  const { hashes: declared, others } = scriptSrcParts(directive);
  const built = collectHashes(path.join(ROOT, "public"));
  assert.ok(built.length > 0, "public/ must be built before this test runs (the gate builds first)");
  assert.deepEqual(auditProblems({ built, declared, others }).problems, []);
});

// aifocus-rlng: script-src without 'unsafe-inline' (and without
// 'unsafe-hashes') blocks more than inline <script> bodies - every on*= event
// handler attribute and every javascript: URL is refused too, and no hash can
// cover either. The gate reported the site clean while adding an onclick went
// unnoticed, so the review reproduced it with exactly that shape.
test("an inline event handler attribute the CSP blocks is a failure that names it", () => {
  const dir = site({
    "index.html": page('<button onclick="window.unsafe=1">Click</button>'),
  });
  const inline = collectInlineExecSurfaces(dir);
  assert.deepEqual(inline, [{ file: "index.html", tag: "button", attr: "onclick", kind: "handler" }]);

  const built = collectHashes(dir);
  const { problems, handlers } = auditProblems({ built, declared: built, others: ["'self'"], inline });
  assert.equal(handlers.length, 1);
  assert.match(problems[0], /1 inline event handler attribute\(s\) the CSP blocks/);
  assert.match(problems[0], /index\.html: <button onclick=>/);
  assert.match(problems[0], /fix: bind the handler from a module \(addEventListener\)/);
});

test("a javascript: URL in a URL-bearing attribute is a failure, and only there", () => {
  const dir = site({
    "index.html": page(
      '<a href="javascript:window.unsafe=1">go</a>',
      // not a URL-bearing attribute, so not an execution surface this policy gates
      '<span title="javascript: is blocked here">note</span>',
      // inert by name: data-* is not an event handler attribute
      '<span data-onclick="x">note</span>',
      // text that merely mentions a handler is not an attribute
      "<p>do not write onclick= in templates</p>",
    ),
  });
  const inline = collectInlineExecSurfaces(dir);
  assert.deepEqual(inline, [
    { file: "index.html", tag: "a", attr: "href", value: "javascript:window.unsafe=1", kind: "javascript-url" },
  ]);
  const built = collectHashes(dir);
  const { problems, javascriptUrls } = auditProblems({ built, declared: built, others: ["'self'"], inline });
  assert.equal(javascriptUrls.length, 1);
  assert.match(problems[0], /1 javascript: URL\(s\) the CSP blocks/);
});

// The review of the first version of this scan found two valid javascript: URLs
// it read as clean: an unquoted attribute value, and a character-reference
// encoding of the colon. Both are the URL a browser refuses to run, so both are
// now pinned, along with the whitespace the URL parser strips.
test("every spelling of a javascript: URL is flagged, and only in URL attributes", () => {
  const flagged = [
    '<a href="javascript:alert(1)">x</a>',
    "<a href=javascript:alert(1)>x</a>",
    "<a href='javascript:alert(1)'>x</a>",
    '<a href = "javascript:alert(1)">x</a>',
    '<a href="javascript&#58;alert(1)">x</a>',
    '<a href="javascript&#x3a;alert(1)">x</a>',
    '<a href="javascript&colon;alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="java&#9;script:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<form action=JAVASCRIPT:alert(1)>',
  ];
  for (const html of flagged) {
    const { urls } = inlineExecSurfaces(html);
    assert.equal(urls.length, 1, `must be flagged: ${html}`);
  }
  const clean = [
    '<a href="/notes?q=javascript:">ok</a>',
    '<a href="https://example.com/javascript:">ok</a>',
    '<a href="javascript.js">ok</a>',
    '<img src="data:image/png;base64,AA">ok</img>',
    '<a title="javascript:alert(1)">ok</a>',
  ];
  for (const html of clean) {
    assert.deepEqual(inlineExecSurfaces(html).urls, [], `must stay clean: ${html}`);
  }
});

test("meta refresh javascript: targets fail the CSP audit with file and attribute", () => {
  const dir = site({
    "nested/page.html": page('<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'),
  });
  const inline = collectInlineExecSurfaces(dir);
  assert.deepEqual(inline, [{
    file: "nested/page.html", tag: "meta", attr: "content", value: "javascript:alert(1)", kind: "javascript-url",
  }]);
  const built = collectHashes(dir);
  const { problems, javascriptUrls } = auditProblems({ built, declared: built, others: ["'self'"], inline });
  assert.equal(javascriptUrls.length, 1);
  assert.match(problems[0], /nested\/page\.html: <meta content="javascript:alert\(1\)">/);
});

test("refresh parsing handles attribute order, case, spacing, quotes and encoded schemes", () => {
  const flagged = [
    '<meta content="0; URL=JAVASCRIPT:alert(1)" HTTP-EQUIV="REFRESH">',
    "<meta http-equiv=refresh content='1; url=javascript&#58;alert(1)'>",
    '<meta http-equiv="refresh" content="0; url=\'java&#9;script:alert(1)\'">',
    '<meta http-equiv="refresh" content="url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0; javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0, javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0;url=java\nscript:alert(1)">',
    '<meta http-equiv="refr&#101;sh" content="0;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0;ur&#108;=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)" content="0;url=/safe">',
    '<meta http-equiv="refresh"content="0;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content=".5;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0.;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content=".0;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content=".5 ,url=javascript:alert(1)">',
  ];
  for (const html of flagged) {
    assert.equal(inlineExecSurfaces(html).urls.length, 1, `must be flagged: ${html}`);
  }
  const clean = [
    '<meta http-equiv="refresh" content="0;url=/safe?next=javascript:alert(1)">',
    '<meta name="description" content="0;url=javascript:alert(1)">',
    '<meta http-equiv="content-type" content="0;url=javascript:alert(1)">',
    '<meta title="ignored http-equiv=refresh" content="0;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" title="content=0;url=javascript:alert(1)" content="0;url=/safe">',
    '<meta http-equiv="refresh" content="..5;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="+0;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0e1;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0x10;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="-1;url=javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0;;url=javascript:alert(1)">',
  ];
  for (const html of clean) {
    assert.deepEqual(inlineExecSurfaces(html).urls, [], `must stay clean: ${html}`);
  }
});

test("attribute names are matched with their values blanked, so a quoted mention is not a hit", () => {
  const { handlers, urls } = inlineExecSurfaces('<a href="/x" title="onclick=onload=" aria-label="javascript: no">x</a>');
  assert.deepEqual(handlers, []);
  assert.deepEqual(urls, []);
  // and a real one is still found next to quoted lookalikes
  const real = inlineExecSurfaces('<a title="onclick=x" href="/y" onmouseover="steal()">x</a>');
  assert.deepEqual(real.handlers, [{ tag: "a", attr: "onmouseover" }]);
});

test("the committed build carries no inline execution surface the policy blocks", () => {
  const inline = collectInlineExecSurfaces(path.join(ROOT, "public"));
  assert.deepEqual(inline, [], "public/ must be built before this test runs (the gate builds first)");
});
