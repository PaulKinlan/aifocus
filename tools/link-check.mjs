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
 * repo noticed: the build was green, the asset ratchet was green, the unit tests
 * were green, because a link is only wrong relative to the *output* - the bug
 * lives between the content and the generated tree, not inside either one. The
 * factory docs-drift station that eventually reported it would have missed it
 * too if latency.md had stayed outside its candidate set. This check reads the
 * built site, so it cannot miss that class.
 *
 * WHEN THE SCANNER IS WRONG, IT IS WORSE THAN NO SCANNER
 * aifocus-r0b: the first version of this file matched the substring `href`, so
 * `data-href` was read as a link - a page with `<a data-href="/exists/"
 * href="/dead/">` passed with the dead link unresolved, and reversing the values
 * failed a working link. A checker that reports the wrong answer is trusted, so
 * the anchor scan now reads the attribute *name* in full and tests/link-check.test.mjs
 * pins that case, the attribute-order variants and the exclusions below.
 *
 * WHAT IT DOES
 * Walks every built HTML page, extracts the link targets of every <a> - parsing
 * attributes rather than searching for the substring "href", so attribute order,
 * extra attributes and quoted values are all handled - keeps the internal ones,
 * resolves each against the generated file tree the way a static host does (an
 * exact file, or a directory holding index.html) and exits non-zero, naming the
 * page and the target, for anything that resolves to nothing. Deterministic
 * (sorted walk, no network, no browser) and fast: it reads the built HTML and
 * nothing else.
 *
 * WHAT IT DELIBERATELY DOES NOT DO - the exclusions, stated so they are visible
 * and reviewable rather than silent skips:
 *
 *   1. <script> and <style> blocks are removed before scanning. hrefs built in
 *      JavaScript are not markup links and cannot be resolved statically. The
 *      cases in this repo today are the template literals in
 *      static/pwa-cooked-timeline.html and static/pwa-cooked-baseline.html
 *      (href="${api.ref}" and href="${f.ref}") and the string concatenation in
 *      static/model-gap.html (href="' + esc(m.card) + '"). A *markup* link you
 *      add is checked; a link you build in JavaScript is not seen here, and that
 *      is the one thing this tool cannot cover.
 *
 *   2. External and non-navigational hrefs are counted, never resolved: any
 *      http:/https: URL, protocol-relative //host, mailto:, tel:, data:,
 *      javascript:, a bare fragment (#foo) or an empty href.
 *
 *   3. A target with no trailing slash that resolves through a directory index
 *      (/foo -> /foo/index.html) is accepted, because a static host redirects it
 *      (verified live: /super-apps -> 308 -> /super-apps/ -> 200). Only targets
 *      with nothing behind them are failures. The count is reported so that
 *      canonical-form drift stays visible without failing the build.
 *
 *   4. Paths that only functions/_middleware.js can serve - for example a
 *      decorated /<slug>.md with no built file - are not recognised. No such
 *      link exists in the site today; if one is added, this check will name it
 *      and the correct fix is to link the built path.
 *
 *   5. An in-page anchor (#section) is checked only as a page; whether the
 *      fragment exists on that page is a different check this tool does not do.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

// An <a ...> tag, allowing quoted attribute values to contain '>' (title="a > b")
// so the tag does not end early. \b keeps <abbr>, <animate> and friends out.
const ANCHOR_TAG = /<a\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

// One attribute: a name, then an optional value in double quotes, single quotes
// or bare. The name is captured whole, which is the point - `data-href` and
// `xlink:href` must not be mistaken for `href` (aifocus-r0b).
const ATTRIBUTE =
  /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// SVG anchors carry their target in xlink:href. HTML attribute names are
// case-insensitive, so `HREF=` counts too.
const LINK_ATTRIBUTES = new Set(["href", "xlink:href"]);

const EXTERNAL_OR_LOCAL_ONLY = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#|$)/;
const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decode(value) {
  return value.replace(
    /&(amp|lt|gt|quot|#39|apos);/g,
    (match) => ENTITIES[match] ?? match,
  );
}

/** Every link target of every <a> in one page's markup, in document order. */
export function anchorTargets(markup) {
  // One global pass removes all script/style blocks; String.replace restarts
  // from the beginning, so the lastIndex of a shared regex is not a hazard.
  const scanned = markup.replace(SCRIPT_OR_STYLE, " ");
  const targets = [];
  for (const tag of scanned.matchAll(ANCHOR_TAG)) {
    for (const attribute of tag[0].matchAll(ATTRIBUTE)) {
      if (!LINK_ATTRIBUTES.has(attribute[1].toLowerCase())) continue;
      targets.push(decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? ""));
    }
  }
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

      // Strip the query and fragment before resolving: /foo/?q=1#x is /foo/.
      const raw = href.split("#")[0].split("?")[0];
      let pathname;
      try {
        pathname = decodeURIComponent(raw);
      } catch {
        // A malformed percent-escape is still a link: check it as written rather
        // than letting one bad character crash the gate.
        pathname = raw;
      }
      if (!pathname) {
        external += 1;
        continue;
      }

      const absolute = pathname.startsWith("/")
        ? pathname
        : new URL(pathname, `http://x${where}`).pathname;

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
