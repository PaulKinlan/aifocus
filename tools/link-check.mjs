#!/usr/bin/env node
/**
 * tools/link-check.mjs - fail the build when an internal link points at nothing.
 *
 * Run by tools/gate.sh after the build, so both the fast gate and the full gate
 * (they are the same command here, see tools/check.conf) refuse to pass a build
 * with a dead internal link. Run it by hand with:
 *
 *     node tools/link-check.mjs [publicDir]     # default: public
 *
 * WHY THIS EXISTS
 * aifocus-8mx: content/posts/latency.md linked /superapps/ while the post is
 * published at /super-apps/, so the link 404ed in production. Nothing in the
 * repo noticed - the build was green, the asset ratchet was green, the unit tests
 * were green - because a link is only wrong relative to the *output*: the bug
 * lives between the content and the generated tree, not inside either one. The
 * factory docs-drift station that eventually reported it would have missed it
 * too if latency.md had stayed outside its candidate set. This check reads the
 * built site, so it cannot miss that class.
 *
 * WHY IT PARSES HTML INSTEAD OF SCANNING IT (aifocus-mfo, aifocus-adz)
 * The first three versions of this file searched the markup with regular
 * expressions. Each review round found the same shape of bug - the scanner
 * misread valid HTML - and each fix bought exactly one more edge case:
 *
 *   round 1 (aifocus-r0b): `\bhref` matched the substring in `data-href`, so a
 *           data attribute could stand in for a real link. A dead link passed
 *           and a working one failed.
 *   round 2 (aifocus-mfo): text inside an HTML comment was scanned as markup, so
 *           a commented-out anchor failed the gate on valid built output.
 *   round 2 (aifocus-adz): only six named entities were decoded, and the
 *           fragment split ran first, so `&#47;` (an escaped slash) became "#"
 *           and truncated the URL to "/&".
 *
 * So the scanning is now done by parse5, a spec-compliant HTML5 parser (the
 * reference implementation, and the one jsdom uses): comments are comment nodes,
 * script and style contents are text, attribute names are parsed rather than
 * matched as substrings, and attribute values arrive decoded. The classes above
 * are not patched, they are structurally impossible. Measured on this repo's
 * 1.81 MB / 57-page build, and the numbers are why this trade is worth taking:
 *
 *   hand-rolled regex scan   12.6 ms   (0.22 ms/page)
 *   parse5                  596.3 ms   (10.46 ms/page)   <- now used
 *   htmlparser2 (tolerant)  278.3 ms   (4.88 ms/page)    <- rejected: 6 packages, looser
 *
 * parse5 costs ~0.6 s of gate time and buys the difference between a scanner
 * that is *nearly* right and one that is right about HTML. The regex version was
 * also demonstrably wrong on real output, not just in theory: on the same build
 * it mis-decodes 72 link values across 36 of the 57 pages - the share buttons
 * carry `&#43;` (a plus sign) and it passed the entity through undecoded. Those
 * happen to be external URLs, so they never failed a build; the moment one of
 * them is an internal link it is a false gate failure, which is the worst kind
 * for a gate every lane has to pass.
 *
 * WHAT IT DOES
 * Parses every built HTML page, collects the `href` of every <a> element,
 * resolves the internal ones against the generated file tree the way a static
 * host does (an exact file, or a directory holding index.html) and exits
 * non-zero, naming the page and the target, for anything that resolves to
 * nothing. Deterministic (sorted walk, no network, no browser).
 *
 * WHAT IT DELIBERATELY DOES NOT DO - the tail, stated honestly so nobody assumes
 * more coverage than there is:
 *
 *   1. Hrefs built at runtime in JavaScript are invisible, by construction: a
 *      string inside <script> is text, not an element. The cases in this repo are
 *      the template literals in static/pwa-cooked-timeline.html and
 *      static/pwa-cooked-baseline.html (href="${api.ref}", href="${f.ref}") and
 *      the concatenation in static/model-gap.html. A markup link you add is
 *      checked; a link you build in JavaScript is not, and no static check can.
 *   2. <template> content is inert - a browser does not navigate it until
 *      something clones it - so it is not walked. That is the same class as (1).
 *   3. Paths only functions/_middleware.js can serve (for example a decorated
 *      /<slug>.md with no built file) are not recognised. None exist today.
 *   4. An in-page fragment (#section) is checked only as a page; whether the
 *      fragment exists on that page is a different check this tool does not do.
 *   5. Redirect rules that exist only at the host (a Cloudflare _redirects file)
 *      are invisible to a file-tree check. static/_headers exists, static/_redirects
 *      does not.
 *   6. <base href> is ignored: no page in the build declares one (measured: 0 of
 *      57), and links are resolved against the page's own URL.
 *   7. External and non-navigational hrefs are counted, never resolved: any
 *      http:/https: URL, protocol-relative //host, mailto:, tel:, data:,
 *      javascript:, a bare fragment (#foo) or an empty href.
 *   8. A target with no trailing slash that resolves through a directory index
 *      (/foo -> /foo/index.html) is accepted, because a static host redirects it
 *      (verified live: /super-apps -> 308 -> /super-apps/ -> 200). The count is
 *      reported so canonical-form drift stays visible without failing the build.
 *   9. Percent-encoding is decoded one level, as a host does: /a%20b/ resolves to
 *      a directory named "a b", and %23 stays inside the path. An encoded slash
 *      (%2F) therefore decodes to a path separator - a build cannot contain a
 *      filename holding a literal "/", so this has no practical effect, but it
 *      is the one place where decoding is lossy.
 *
 * KNOWN FALSE-FAILURE SHAPES: a valid link served only by middleware (3), a
 * host-only redirect (5), or a page using <base href> (6) can fail this file-tree
 * check. These shapes are absent from the current 57-page build, not impossible
 * in future. Whitespace-prefixed external hrefs formerly failed too (aifocus-rcf);
 * hrefs are now trimmed before classification and resolution. Host-invalid or
 * unparsable hrefs (such as `\\[::1` or `\\`) formerly crashed the gate with an
 * uncaught TypeError (aifocus-qs1); URL resolution is now guarded and unparsable
 * targets are recorded as unresolved findings rather than throwing. If this gate
 * false-fails in the field, disable the link check first, then investigate; do
 * not leave every lane blocked on a healthy build while iterating on the checker.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "parse5";

// Only `href` is a navigation target. SVG's xlink:href needs no special case:
// measured, parse5 adjusts it to an `href` attribute on an <a> inside <svg>, and
// on an HTML anchor `xlink:href` is a foreign attribute a browser does not
// follow - which is exactly the distinction the regex version could not make.
const LINK_ATTRIBUTE = "href";

const EXTERNAL_OR_LOCAL_ONLY = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#|$)/;

/**
 * Every link target of every navigable <a> in one page's markup, in document
 * order. Attribute values are decoded by the parser, and comments, script/style
 * bodies and <template> content are not elements, so they are not visited.
 */
export function anchorTargets(markup) {
  const targets = [];
  const visit = (node) => {
    if (node.tagName === "a" && node.attrs) {
      for (const attribute of node.attrs) {
        if (attribute.name === LINK_ATTRIBUTE) targets.push(attribute.value.trim());
      }
    }
    // childNodes only: <template> children live under `content` and stay inert.
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parse(markup));
  return targets;
}

function htmlPages(dir) {
  const pages = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...htmlPages(full));
    } else if (entry.name.endsWith(".html")) {
      pages.push(full);
    }
  }
  return pages.sort();
}

// 'file': an exact generated file. 'dir': a directory that serves index.html,
// which is what a static host resolves /foo and /foo/ to.
function resolveTarget(root, pathname) {
  const base = join(root, pathname.replace(/^\/+/, ""));
  try {
    if (statSync(base).isFile()) return "file";
  } catch {
    // fall through to the directory case
  }
  try {
    if (statSync(join(base, "index.html")).isFile()) return "dir";
  } catch {
    // unresolvable
  }
  return null;
}

/**
 * Resolve every internal link in a built site.
 * Returns { pages, internal, external, resolved, viaDirectoryIndex, broken },
 * where broken maps an unresolvable target to the pages that link to it.
 */
export function scanSite(root) {
  const pages = htmlPages(root);
  const broken = new Map();
  let internal = 0;
  let external = 0;
  let resolved = 0;
  let viaDirectoryIndex = 0;

  for (const page of pages) {
    const where = `/${page.slice(root.length).replace(/^\/+/, "")}`;
    for (const href of anchorTargets(readFileSync(page, "utf8"))) {
      if (EXTERNAL_OR_LOCAL_ONLY.test(href)) {
        external += 1;
        continue;
      }

      // The URL layer, in the order a static host does it: split the query and
      // fragment off the *encoded* value (safe, because the parser has already
      // decoded entities, so a '#' cannot come from one), resolve it against the
      // page, then percent-decode the resulting path for the filesystem lookup,
      // because a host maps /a%20b/ onto a directory named "a b". Decoding last
      // is what keeps an encoded '#' (%23) inside the path instead of letting it
      // be read as a fragment marker (aifocus-11w).
      const raw = href.split("#")[0].split("?")[0];
      if (!raw) {
        external += 1;
        continue;
      }

      let resolvedUrl;
      try {
        resolvedUrl = new URL(raw, `http://x${where}`);
      } catch {
        // A host-invalid or unparsable href (such as `\\[::1` or `\\`) cannot
        // resolve against the file tree. Record it as an unresolved internal
        // target rather than aborting the gate with an uncaught TypeError.
        internal += 1;
        if (!broken.has(raw)) broken.set(raw, []);
        broken.get(raw).push(where);
        continue;
      }

      // If the target resolved to an external host (for example via a leading `\\`),
      // count it as external rather than resolving against the local filesystem.
      if (resolvedUrl.origin !== "http://x") {
        external += 1;
        continue;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(resolvedUrl.pathname);
      } catch {
        // A malformed escape (%zz) is still a link: check it as written rather
        // than letting one bad character crash the gate.
        pathname = resolvedUrl.pathname;
      }

      const absolute = pathname;

      internal += 1;
      const kind = resolveTarget(root, absolute);
      if (kind === "file") {
        resolved += 1;
      } else if (kind === "dir") {
        resolved += 1;
        if (!absolute.endsWith("/")) viaDirectoryIndex += 1;
      } else {
        if (!broken.has(absolute)) broken.set(absolute, []);
        broken.get(absolute).push(where);
      }
    }
  }

  return { pages, internal, external, resolved, viaDirectoryIndex, broken };
}

export function summaryLine(result) {
  return (
    `${result.internal} internal anchors over ${result.pages.length} pages, ` +
    `${result.resolved} resolved (${result.viaDirectoryIndex} of them through a directory index), ` +
    `${result.broken.size} unresolved`
  );
}

/** One line per dead link, naming the target and the page that links to it. */
export function failureLines(result) {
  const lines = [];
  for (const [target, from] of [...result.broken.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    for (const page of from) lines.push(`  ${target}  <- linked from ${page}`);
  }
  return lines;
}

function main(argv) {
  const root = argv[2] ?? "public";
  if (!existsSync(root)) {
    console.error(
      `link-check: no build at ${root} - run the build first (npm run build)`,
    );
    return 2;
  }

  const result = scanSite(root);
  if (result.broken.size > 0) {
    console.error(
      `link-check: FAIL - ${result.broken.size} internal link target(s) have no page in the build:`,
    );
    for (const line of failureLines(result)) console.error(line);
    console.error(`link-check: ${summaryLine(result)}`);
    return 1;
  }

  console.log(`link-check: OK - ${summaryLine(result)}`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main(process.argv));
}
