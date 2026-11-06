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
// backstop at all. The built site has 11 distinct executable inline scripts
// (gtag loader, the OG-card font measure, and nine page scripts), all static,
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
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEADERS = path.join(ROOT, "static/_headers");
const PUBLIC = path.join(ROOT, "public");
const CSP_HEADER = "Content-Security-Policy:";

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

// Attribute parsing is deliberately narrow: the build output is Hugo's own,
// and this needs to answer exactly one question per script - does a browser run
// this body inline? A missing or non-JS type means yes.
function scriptBodies(html) {
  const bodies = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    if (/(^|\s)src\s*=/i.test(attrs)) continue;
    const type = /(^|\s)type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[2]?.toLowerCase();
    if (type && INERT_TYPES.has(type)) continue;
    bodies.push(match[2]);
  }
  return bodies;
}

export function collectHashes(dir = PUBLIC) {
  const files = globSync("**/*.html", { cwd: dir }).sort();
  const hashes = new Set();
  for (const file of files) {
    const html = readFileSync(path.join(dir, file), "utf8");
    for (const body of scriptBodies(html)) {
      hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
    }
  }
  return [...hashes].sort();
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
export function auditProblems({ built, declared, others }) {
  const missing = built.filter((hash) => !declared.includes(hash));
  const stale = declared.filter((hash) => !built.includes(hash));
  const unsafeInline = others.includes("'unsafe-inline'");
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
  return { missing, stale, unsafeInline, problems };
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
  const hashes = collectHashes();
  const directive = policy.find((part) => part.startsWith("script-src "));
  const { hashes: declared, others } = scriptSrcParts(directive);

  const { missing, stale, unsafeInline, problems } = auditProblems({ built: hashes, declared, others });

  if (check) {
    if (problems.length) {
      console.error(`csp: FAIL - static/_headers script-src is out of step with the built site\n\n${problems.join("\n\n")}`);
      process.exit(1);
    }
    console.log(
      `csp: OK - script-src pins ${hashes.length} inline script(s) by sha256, no 'unsafe-inline', style-src unchanged`,
    );
    return;
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
