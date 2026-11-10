#!/usr/bin/env node
// tools/csp-hashes.mjs - keep static/_headers' script-src hashes in step with
// the inline scripts the site actually builds.
//
//   node tools/csp-hashes.mjs            rewrite the hash list in static/_headers
//   node tools/csp-hashes.mjs --check    exit 1 if the list is stale (the gate runs this)
//
// WHY (aifocus-5wrp): the CSP in static/_headers is one of the controls
// THREAT_MODEL.md cites, and it allowed 'unsafe-inline' for scripts, so an
// injected inline <script> executed freely and the control gave no injection
// backstop at all. The built site has 12 distinct inline script bodies that a
// browser enforces script-src on - 11 that execute (the gtag loader, the OG-card
// font measure and nine page scripts) plus the inline speculation-rules block,
// which does not run as script but is still gated by script-src - all static,
// which is few enough to pin by hash. 'unsafe-inline' is gone from script-src;
// style-src keeps it, because 71 style="" attributes cannot be hash-pinned
// without 'unsafe-hashes' (that is said in THREAT_MODEL.md, not silently).
//
// The hashes are GENERATED, never hand-edited: this script reads the built
// HTML, computes sha256 per distinct inline script body, and writes the sorted
// list into the script-src directive. --check is the gate signal, so adding an
// inline script without regenerating fails the build here rather than shipping
// a page whose script the browser silently blocks. Same shape as
// `python3 tools/stats/build.py --check`: generated artefact, checked in, drift
// is a failure with the fix in the message.
//
// REVERTING (one line, if the hashes are ever a problem): delete the
// 'sha256-...' tokens from script-src in static/_headers and put 'unsafe-inline'
// back. Nothing in the build reads them, and this tool only rewrites the tokens
// it owns, so the revert needs no other change - but it does re-open
// aifocus-5wrp, so update THREAT_MODEL.md §4 when doing it.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { parse } from "parse5";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEADERS = path.join(ROOT, "static/_headers");
const PUBLIC = path.join(ROOT, "public");
const CSP_HEADER = "Content-Security-Policy:";

// One tokenizer for every HTML question this tool asks (aifocus-pimy): both
// scans walk the same parse5 tree instead of each carrying its own regex.
// The regexes drifted from the tokenizer spec in ways that silently changed
// what was hashed and what was flagged: START_TAG missed custom tag names
// containing '_' or '.' and scanned fake markup inside comments and script
// strings; scriptBodies missed </script foo> end tags so following bodies
// merged into one hash; attribute names stopped at a quote or '<' so
// <script src"=x> invented a src the browser does not have (aifocus-ji4m).
// parse5 is already a devDependency and is what link-check scans with
// (tools/link-check.mjs: measured ~10.5 ms/page, ~1 s across the build - the
// price of a scan that cannot misread HTML the way a regex does).
//
// Depth-first element walk, template content included (a template's children
// live in .content, not .childNodes).
function* elements(node) {
  for (const child of node.childNodes ?? []) {
    if (child.tagName) {
      yield child;
      yield* elements(child.content ?? child);
    }
  }
}

// parse5 splits namespace prefixes into their own field (an SVG xlink:href
// arrives as prefix "xlink" + name "href"), so rejoin for matching.
const qname = (attr) => (attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name);

const attrValue = (el, name) => {
  const attr = el.attrs.find((a) => qname(a) === name);
  return attr ? attr.value : null;
};

// Inline <script> types a browser does not execute as script, so no hash applies.
// Speculation rules are deliberately NOT here: they do not run as script, but
// the browser still enforces script-src on them, so an inline
// <script type="speculationrules"> with no hash is blocked (observed as a
// script-src-elem violation on every page that carries one).
const INERT_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "importmap",
]);

// The bodies a browser runs inline. What the parser hands back IS what the
// browser executes: script content is raw text (character references are NOT
// decoded, so the hash matches the bytes), the input stream is preprocessed
// exactly as the spec preprocesses it, and an end tag closes the element even
// when it carries attributes or a trailing solidus - </script foo> and
// </script/> close in a browser, and each side of them hashes on its own
// (aifocus-o561). An external src means the body is not inline; the attribute
// must be NAMED src - <script src"=x> gives the browser one attribute named
// `src"` and no src at all, so its body still executes and must be hashed
// (aifocus-ji4m).
function scriptBodies(document) {
  const bodies = [];
  for (const el of elements(document)) {
    if (el.tagName !== "script") continue;
    if (attrValue(el, "src") != null) continue;
    const type = attrValue(el, "type")?.trim().toLowerCase();
    if (type && INERT_TYPES.has(type)) continue;
    bodies.push(el.childNodes.map((n) => n.value ?? "").join(""));
  }
  return bodies;
}

// script-src without 'unsafe-inline' (and without 'unsafe-hashes') blocks more
// than inline <script> bodies: every on*= event handler attribute and every
// javascript: URL is refused too. The hash list cannot pin those, so they are
// rejected by name instead of being hashed - a handler added without noticing
// would fail silently in the browser while this tool reported the site clean
// (aifocus-rlng). Walking the parsed tree means markup inside comments and
// inside script strings is not scanned (it parses as comment and text nodes,
// not elements), so a template mentioning onclick= in prose or code is not a
// hit - the old regex scan flagged exactly that (aifocus-pimy).
const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "cite",
  "background",
  "data",
]);

// Attribute values arrive character-reference-decoded from the tokenizer,
// which is the one decode pass a browser does. Do not decode again: a second
// pass would turn javascript&amp;&#58;x into javascript:x and flag a URL the
// browser never runs.

// The URL parser strips ASCII tab, LF and CR anywhere in the input and trims
// C0 controls and spaces at the ends, so java<TAB>script:alert(1) is a
// javascript: URL. Undo that before deciding what the scheme is.
const stripUrlNoise = (value) => value.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "");

function isJavascriptUrl(value) {
  return /^javascript:/i.test(stripUrlNoise(value));
}

// A refresh URL lives inside content rather than a URL attribute.
function metaRefreshUrl(el) {
  if (attrValue(el, "http-equiv")?.trim().toLowerCase() !== "refresh") return null;
  const content = attrValue(el, "content") ?? "";
  // Both separators and the url= prefix are optional for a refresh target.
  // Preserve newlines: isJavascriptUrl strips the URL parser's ASCII noise.
  const target = /^\s*(?:(?:\d+(?:\.\d*)?|\.\d+)[\d.]*\s*[;,]\s*)?(?:url\s*=\s*)?([\s\S]*)$/i.exec(content)?.[1];
  if (target == null) return null;
  // The refresh parser accepts a URL wrapped in quotes within content.
  return target.replace(/^(['"])([\s\S]*)\1\s*$/, "$2");
}

function inlineExecSurfacesIn(document) {
  const handlers = [];
  const urls = [];
  for (const el of elements(document)) {
    const tag = el.tagName;
    for (const attr of el.attrs) {
      const name = qname(attr);
      if (/^on[a-z]+$/.test(name)) handlers.push({ tag, attr: name });
      if (URL_ATTRS.has(name) && isJavascriptUrl(attr.value)) {
        urls.push({ tag, attr: name, value: attr.value.slice(0, 80) });
      }
    }
    if (tag === "meta") {
      const raw = metaRefreshUrl(el);
      if (raw != null && isJavascriptUrl(raw)) urls.push({ tag, attr: "content", value: raw.slice(0, 80) });
    }
  }
  return { handlers, urls };
}

export function inlineExecSurfaces(html) {
  return inlineExecSurfacesIn(parse(html));
}

// One parse per page feeds both scans: the hash list and the inline-exec
// surface list always see the same elements the same way.
export function scanSite(dir = PUBLIC) {
  const files = globSync("**/*.html", { cwd: dir }).sort();
  const hashes = new Set();
  const inline = [];
  for (const file of files) {
    const document = parse(readFileSync(path.join(dir, file), "utf8"));
    for (const body of scriptBodies(document)) {
      hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
    }
    const { handlers, urls } = inlineExecSurfacesIn(document);
    for (const hit of handlers) inline.push({ file, ...hit, kind: "handler" });
    for (const hit of urls) inline.push({ file, ...hit, kind: "javascript-url" });
  }
  return { hashes: [...hashes].sort(), inline };
}

export function collectHashes(dir = PUBLIC) {
  return scanSite(dir).hashes;
}

export function collectInlineExecSurfaces(dir = PUBLIC) {
  return scanSite(dir).inline;
}

const isHash = (token) => /^'sha256-[A-Za-z0-9+/=]+'$/.test(token);

export function parsePolicy(value) {
  return value.split(";").map((part) => part.trim()).filter(Boolean);
}

// The script-src directive's tokens, with the generated hashes removed, so the
// rest of the allowlist is preserved exactly as an operator wrote it.
export function scriptSrcParts(directive) {
  if (!directive?.startsWith("script-src ")) throw new Error("static/_headers has no script-src directive");
  const tokens = directive.split(/\s+/).slice(1);
  return {
    hashes: tokens.filter(isHash),
    others: tokens.filter((token) => !isHash(token)),
  };
}

export function renderPolicy(policy, hashes) {
  return policy
    .map((part) => {
      if (!part.startsWith("script-src ")) return part;
      const { others } = scriptSrcParts(part);
      // 'self' first, then the generated hashes, then the origins the site
      // actually loads - the order a reader expects and a diff stays small.
      const [self, ...rest] = others.filter((token) => token === "'self'");
      const leading = self ? [self] : [];
      // 'unsafe-inline' would make every hash in this directive decorative, so
      // it is dropped here and nowhere else: style-src keeps its own.
      const tail = others.filter((token) => token !== "'self'" && token !== "'unsafe-inline'");
      return ["script-src", ...leading, ...hashes, ...(self ? tail : rest)].join(" ");
    })
    .join("; ");
}

// The comparison itself, separated from the filesystem so a test can assert
// what a new inline script (or a removed one) reports without editing the repo.
export function auditProblems({ built, declared, others, inline = [] }) {
  const missing = built.filter((hash) => !declared.includes(hash));
  const stale = declared.filter((hash) => !built.includes(hash));
  const unsafeInline = others.includes("'unsafe-inline'");
  const handlers = inline.filter((hit) => hit.kind === "handler");
  const javascriptUrls = inline.filter((hit) => hit.kind === "javascript-url");
  const problems = [];
  if (missing.length) {
    problems.push(
      `${missing.length} inline script(s) built but not allowed by script-src: ${missing.join(" ")}\n` +
        "  fix: node tools/csp-hashes.mjs  (a browser would block those scripts)",
    );
  }
  if (stale.length) {
    problems.push(
      `${stale.length} declared hash(es) match no built script: ${stale.join(" ")}\n` +
        "  fix: node tools/csp-hashes.mjs  (a stale hash means a script was removed or edited)",
    );
  }
  if (unsafeInline) {
    problems.push(
      "script-src still carries 'unsafe-inline', which makes the hashes decorative (aifocus-5wrp)\n" +
        "  fix: node tools/csp-hashes.mjs",
    );
  }
  if (handlers.length) {
    const named = handlers.map((hit) => `${hit.file}: <${hit.tag} ${hit.attr}=>`).join("\n  ");
    problems.push(
      `${handlers.length} inline event handler attribute(s) the CSP blocks: a hashed script cannot cover them, ` +
        "and the browser refuses them silently (aifocus-rlng)\n  " +
        named +
        "\n  fix: bind the handler from a module (addEventListener) or move it into its own script and regenerate",
    );
  }
  if (javascriptUrls.length) {
    const named = javascriptUrls.map((hit) => `${hit.file}: <${hit.tag} ${hit.attr}="${hit.value}">`).join("\n  ");
    problems.push(
      `${javascriptUrls.length} javascript: URL(s) the CSP blocks: script-src without 'unsafe-inline' refuses them ` +
        "(aifocus-rlng)\n  " +
        named +
        "\n  fix: use a real URL rather than a javascript: navigation target",
    );
  }
  return { missing, stale, unsafeInline, handlers, javascriptUrls, problems };
}

function readHeaders() {
  return readFileSync(HEADERS, "utf8");
}

function cspLine(text) {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.trimStart().startsWith(CSP_HEADER));
  if (index < 0) throw new Error(`static/_headers has no ${CSP_HEADER} line`);
  const indent = lines[index].match(/^\s*/)[0];
  const value = lines[index].trimStart().slice(CSP_HEADER.length).trim();
  return { lines, index, indent, value };
}

function main(argv) {
  const check = argv.includes("--check");
  const headers = readHeaders();
  const { lines, index, indent, value } = cspLine(headers);
  const policy = parsePolicy(value);
  const { hashes, inline } = scanSite();
  const directive = policy.find((part) => part.startsWith("script-src "));
  const { hashes: declared, others } = scriptSrcParts(directive);

  const { missing, stale, unsafeInline, handlers, javascriptUrls, problems } = auditProblems({
    built: hashes,
    declared,
    others,
    inline,
  });
  const handlersCount = handlers.length;
  const urlCount = javascriptUrls.length;

  if (check) {
    if (problems.length) {
      console.error(`csp: FAIL - static/_headers script-src is out of step with the built site\n\n${problems.join("\n\n")}`);
      process.exit(1);
    }
    console.log(
      `csp: OK - script-src pins ${hashes.length} inline script(s) by sha256, no 'unsafe-inline', ` +
        `no inline handler attributes or javascript: URLs in the build, style-src unchanged`,
    );
    return;
  }

  // A handler attribute or a javascript: URL cannot be fixed by writing hashes,
  // so the write path refuses as loudly as --check does (aifocus-rlng).
  if (handlersCount || urlCount) {
    console.error(
      `csp: FAIL - the built site contains inline execution surfaces this policy blocks and no hash can cover\n\n` +
        problems.join("\n\n"),
    );
    process.exit(1);
  }

  if (!missing.length && !stale.length && !unsafeInline) {
    console.log(`csp: script-src already pins ${hashes.length} inline script(s); nothing to write`);
    return;
  }
  lines[index] = `${indent}${CSP_HEADER} ${renderPolicy(policy, hashes)}`;
  writeFileSync(HEADERS, lines.join("\n"));
  console.log(
    `csp: wrote ${hashes.length} hash(es) into static/_headers script-src ` +
      `(+${missing.length} added, -${stale.length} removed${unsafeInline ? ", 'unsafe-inline' dropped" : ""})`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
