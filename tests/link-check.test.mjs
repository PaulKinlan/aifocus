// Tests for tools/link-check.mjs - the gate step that refuses a build with a
// dead internal link.
//
// The classes pinned here are the ones that have actually gone wrong, each found
// by review rather than by this file:
//
//   1. an attribute whose name merely ends in "href" (aifocus-r0b): the original
//      scanner matched the substring, so a data-href could stand in for a real
//      href - a dead link passed and a working one failed.
//   2. markup that is not an element-anchor: an anchor inside an HTML comment
//      (aifocus-mfo) and an href whose slash is written as a numeric entity
//      (aifocus-adz), both of which failed valid built output.
//   3. the documented exclusions staying deliberate: script-generated hrefs,
//      inert template content, external/non-navigational hrefs and
//      directory-index targets. If one of these changes behaviour, this file
//      says so.
//
// The scanner is now parse5 (a spec-compliant HTML5 parser) rather than a regex,
// so these cases assert the parser's behaviour rather than ours - which is the
// point: rounds of edge cases are what swapping in a parser removed.
//
// Every case builds its own fixture in a fresh temp directory, so no test
// depends on another test's order or on the state of the checkout.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  anchorTargets,
  failureLines,
  scanSite,
  summaryLine,
} from "../tools/link-check.mjs";

const TOOL = fileURLToPath(new URL("../tools/link-check.mjs", import.meta.url));

const page = (markup) => `<!doctype html><html><body>${markup}</body></html>`;

/** Write a fixture site: { "path/name.html": markup } -> temp root directory. */
function builtSite(t, pages) {
  const root = mkdtempSync(join(tmpdir(), "aifocus-link-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, markup] of Object.entries(pages)) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, markup);
  }
  return root;
}

const brokenTargets = (result) => [...result.broken.keys()].sort();

test("a dead href fails even when a data-href precedes it (aifocus-r0b)", (t) => {
  const root = builtSite(t, {
    "index.html": page('<a data-href="/exists/" href="/dead/">broken</a>'),
    "exists/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), ["/dead/"]);
  assert.equal(result.resolved, 0);
  assert.equal(result.internal, 1);
  assert.deepEqual(failureLines(result), [
    "  /dead/  <- linked from /index.html",
  ]);
});

test("a working href passes even when a dead data-href follows it", (t) => {
  const root = builtSite(t, {
    "index.html": page('<a href="/exists/" data-href="/dead/">works</a>'),
    "exists/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.resolved, 1);
  assert.match(
    summaryLine(result),
    /1 internal anchors over 2 pages, 1 resolved/,
  );
});

test("anchorTargets reads attribute names whole, not as a substring", () => {
  // Only /b: HREF= is the same attribute as href in HTML (names are
  // case-insensitive), and a duplicate attribute in one tag is dropped by the
  // parser with the first occurrence winning - which is what a browser does
  // with this markup too. xlink:href on an HTML anchor is a foreign attribute a
  // browser does not follow, so it is not a link here; inside <svg> it is, which
  // is the case at the end. Neither distinction is available to a substring
  // search, which is the point of using a parser.
  assert.deepEqual(
    anchorTargets('<a data-href="/a" href="/b" xlink:href="/c" HREF="/d">'),
    ["/b"],
  );
  assert.deepEqual(anchorTargets('<a id=x HREF="/upper/">uppercase only</a>'), [
    "/upper/",
  ]);
  assert.deepEqual(anchorTargets('<a data-href="/only-a-data-attribute">'), []);
  assert.deepEqual(
    anchorTargets('<a class="data-href" title="href=/nope/">'),
    [],
  );
  assert.deepEqual(
    anchorTargets('<svg><a xlink:href="/svg-link/"><text>t</text></a></svg>'),
    ["/svg-link/"],
  );
});

test("a commented-out anchor is not a link (aifocus-mfo)", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      '<!-- <a href="/dead/">old link</a> --><a href="/exists/">real link</a>',
    ),
    "exists/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.internal, 1);
  assert.equal(result.resolved, 1);
});

test("a slash written as a numeric entity resolves and is not read as a fragment (aifocus-adz)", (t) => {
  // &#47; is a slash. The regex version decoded six named entities and split on
  // '#' first, so this value became "/&" and failed a link that resolves.
  assert.deepEqual(anchorTargets('<a href="&#47;exists/">escaped slash</a>'), [
    "/exists/",
  ]);

  const root = builtSite(t, {
    "index.html": page('<a href="&#47;exists/">escaped slash</a>'),
    "exists/index.html": page("ok"),
  });
  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.resolved, 1);
});

test("a percent-encoded path resolves to the file the host would serve (aifocus-11w)", (t) => {
  // A host maps /a%20b/ onto a directory named "a b", so the gate must decode.
  // The previous version did; the parse5 rewrite dropped it, which is what this
  // case pins - and it pins the order too, because decoding before splitting the
  // fragment would turn %23 into a '#' and truncate the path.
  const root = builtSite(t, {
    "index.html": page(
      [
        '<a href="/a%20b/">space</a>',
        '<a href="/a%23b/">hash in a filename</a>',
        '<a href="../a%20b/">relative, from a subdirectory</a>',
      ].join(""),
    ),
    "a b/index.html": page("ok"),
    "a#b/index.html": page("ok"),
    "posts/index.html": page('<a href="../a%20b/">relative</a>'),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.resolved, 4);
});

test("a percent-encoded target that does not exist still fails", (t) => {
  const root = builtSite(t, {
    "index.html": page('<a href="/a%20b/">missing</a>'),
  });

  assert.deepEqual(brokenTargets(scanSite(root)), ["/a b/"]);
});

test("a malformed escape is checked as written rather than crashing the gate", (t) => {
  const root = builtSite(t, {
    "index.html": page('<a href="/a%zzb/">malformed</a>'),
  });

  assert.deepEqual(brokenTargets(scanSite(root)), ["/a%zzb/"]);
});

test("named entities in an href are decoded before resolving", (t) => {
  assert.deepEqual(anchorTargets('<a href="/a&amp;b/">ampersand</a>'), [
    "/a&b/",
  ]);

  const root = builtSite(t, {
    "index.html": page('<a href="/a&amp;b/">ampersand</a>'),
    "a&b/index.html": page("ok"),
  });
  assert.deepEqual(brokenTargets(scanSite(root)), []);
});

test("template content is inert and is not checked", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      '<template><a href="/dead/">cloned later</a></template><a href="/exists/">real</a>',
    ),
    "exists/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.internal, 1);
});

test("malformed markup is recovered the way a browser recovers it", (t) => {
  const root = builtSite(t, {
    "index.html": page('<p><a href="/dead/">unclosed'),
  });

  assert.deepEqual(brokenTargets(scanSite(root)), ["/dead/"]);
  // Nested anchors are not nested in the DOM: the browser closes the outer one,
  // so both are real links and both are checked.
  assert.deepEqual(
    anchorTargets('<a href="/outer/"><a href="/inner/">n</a></a>'),
    ["/outer/", "/inner/"],
  );
});

test("attribute order, extra attributes, quoting style and case do not matter", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      [
        '<a class="post" title="a > b" href="/dead/">quoted value holding ></a>',
        '<a href="/ok/" data-href="/also-dead/" rel="noopener">extra attributes</a>',
        "<a id=x HREF=/dead-bare/ >unquoted and uppercase</a>",
        "<a href='/dead-single/'>single quoted</a>",
        '<a data-rel="external" data-href="/still-not-a-link/">data only</a>',
      ].join(""),
    ),
    "ok/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), [
    "/dead-bare/",
    "/dead-single/",
    "/dead/",
  ]);
  assert.equal(result.resolved, 1);
  assert.equal(result.internal, 4);
});

test("an SVG anchor's xlink:href is a link", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      '<svg><a xlink:href="/dead/"><text>svg</text></a></svg>',
    ),
  });

  assert.deepEqual(brokenTargets(scanSite(root)), ["/dead/"]);
});

test("script and style contents are excluded deliberately, and the rest still counts", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      [
        '<a href="/ok/">real</a>',
        // The shapes this repo actually has: template literals in the pwa-cooked
        // pages and string concatenation in model-gap.html.
        '<script>const s = `<a href="/${api.ref}">`;</script>',
        "<script>s += '<a href=\"' + esc(m.card) + '\">';</script>",
        '<style>/* <a href="/not-a-link-either/"> */</style>',
      ].join(""),
    ),
    "ok/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.resolved, 1);
  assert.equal(result.internal, 1);
});

test("external and non-navigational hrefs are counted, never resolved", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      [
        '<a href="https://example.com/">external</a>',
        '<a href="http://example.com/">external</a>',
        '<a href="//example.com/">protocol relative</a>',
        '<a href="mailto:someone@example.com">mail</a>',
        '<a href="tel:+1234">phone</a>',
        '<a href="data:text/plain,hello">data</a>',
        '<a href="javascript:void(0)">javascript</a>',
        '<a href="#top">fragment</a>',
        '<a href="">empty</a>',
        '<a href="/real/?query=1#fragment">real, with query and fragment</a>',
      ].join(""),
    ),
    "real/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.external, 9);
  assert.equal(result.internal, 1);
  assert.equal(result.resolved, 1);
});

test("whitespace-prefixed external hrefs are excluded before URL resolution (aifocus-rcf)", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      '<a href=" https://example.com/ok">space</a>' +
        '<a href="\n https://example.com/ok ">newline</a>' +
        '<a href="\t//example.com/ok">protocol-relative</a>' +
        '<a href=" /real/ ">local still resolves</a>',
    ),
    "real/index.html": page("ok"),
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.external, 3);
  assert.equal(result.internal, 1);
  assert.equal(result.resolved, 1);
});

test("a target with no trailing slash resolves through the directory index", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      '<a href="/dir">no slash</a><a href="/feed.xml">file</a>',
    ),
    "dir/index.html": page("ok"),
    "feed.xml": "<rss/>",
  });

  const result = scanSite(root);
  assert.deepEqual(brokenTargets(result), []);
  assert.equal(result.resolved, 2);
  assert.equal(result.viaDirectoryIndex, 1);
});

test("a target with nothing behind it is named, with the page that links to it", (t) => {
  const root = builtSite(t, {
    "index.html": page(
      '<a href="/missing/">gone</a><a href="/missing/">again</a>',
    ),
    "posts/index.html": page('<a href="/missing/">and from here</a>'),
  });

  const result = scanSite(root);
  assert.deepEqual(failureLines(result), [
    "  /missing/  <- linked from /index.html",
    "  /missing/  <- linked from /index.html",
    "  /missing/  <- linked from /posts/index.html",
  ]);
});

test("the CLI exits 1 and names the page and the target", (t) => {
  const root = builtSite(t, {
    "index.html": page('<a data-href="/exists/" href="/dead/">broken</a>'),
    "exists/index.html": page("ok"),
  });

  let status = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [TOOL, root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    status = error.status;
    stderr = error.stderr;
  }

  assert.equal(status, 1);
  assert.match(stderr, /link-check: FAIL - 1 internal link target\(s\)/);
  assert.match(stderr, /\/dead\/ {2}<- linked from \/index\.html/);
});

test("the CLI exits 0 when every internal link resolves", (t) => {
  const root = builtSite(t, {
    "index.html": page('<a href="/exists/">fine</a>'),
    "exists/index.html": page("ok"),
  });

  const stdout = execFileSync(process.execPath, [TOOL, root], {
    encoding: "utf8",
  });
  assert.match(stdout, /^link-check: OK - 1 internal anchors over 2 pages/);
});
