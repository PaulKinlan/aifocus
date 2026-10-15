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
 * WHAT IT DOES
 * Walks every built HTML page, extracts every <a href> - Hugo's minifier emits
 * unquoted attribute values, so quoted and unquoted forms are both parsed -
 * keeps the internal ones, resolves each against the generated file tree the way
 * a static host does (an exact file, or a directory holding index.html) and exits
 * non-zero, naming the page and the target, for anything that resolves to
 * nothing. Deterministic (sorted walk, no network, no browser) and fast: it reads
 * the built HTML and nothing else.
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
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "public";

if (!existsSync(root)) {
  console.error(
    `link-check: no build at ${root} - run the build first (npm run build)`,
  );
  process.exit(2);
}

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const ANCHOR_HREF =
  /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
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
function resolveTarget(pathname) {
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

function sitePath(file) {
  return `/${file.slice(root.length).replace(/^\/+/, "")}`;
}

let internal = 0;
let external = 0;
let resolved = 0;
let viaDirectoryIndex = 0;
const broken = new Map();

const pages = htmlPages(root);

for (const page of pages) {
  // One pass removes every script/style block: the regex is global, so it
  // matches all of them and String.replace restarts from the beginning.
  const markup = readFileSync(page, "utf8").replace(SCRIPT_OR_STYLE, " ");
  const where = sitePath(page);
  for (const match of markup.matchAll(ANCHOR_HREF)) {
    const href = decode(match[1] ?? match[2] ?? match[3] ?? "");
    if (EXTERNAL_OR_LOCAL_ONLY.test(href)) {
      external += 1;
      continue;
    }

    // Strip the query and fragment before resolving: a link to /foo/?q=1#x is a
    // link to /foo/.
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
    const kind = resolveTarget(absolute);
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

const summary =
  `${internal} internal anchors over ${pages.length} pages, ` +
  `${resolved} resolved (${viaDirectoryIndex} of them through a directory index), ` +
  `${broken.size} unresolved`;

if (broken.size > 0) {
  const named = [...broken.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  console.error(
    `link-check: FAIL - ${broken.size} internal link target(s) have no page in the build:`,
  );
  for (const [target, from] of named) {
    for (const page of from) {
      console.error(`  ${target}  <- linked from ${page}`);
    }
  }
  console.error(`link-check: ${summary}`);
  process.exit(1);
}

console.log(`link-check: OK - ${summary}`);
