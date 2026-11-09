// Origin-wide markup-sink guard (aifocus-mcqz).
//
// tests/where-prompts-demo-sinks.test.mjs bans markup-sink tokens in the
// journal demo's bundle, but every first-party script shares the origin and
// its 'unsafe-inline' CSP: assets/js/reader.js, account-page.js,
// admin-page.js, site-search.js, webmcp.js, ask-client.js and stats-page.js
// all render server- or model-supplied strings. This guard applies the same
// raw-source token ban to every first-party script (assets/js/**/*.js and
// static/**/*.js), so the THREAT_MODEL.md section 5 sink invariant is true
// for the whole origin rather than one file.
//
// Raw source, comments included - same fail-safe rule as the demo guard: a
// comment naming a sink token turns the gate red. Keep the token list in sync
// with tests/where-prompts-demo-sinks.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SINK_TOKENS = [
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "setHTMLUnsafe",
  "srcdoc",
  "createContextualFragment",
  "document.write",
];
// Sinks assembled by splitting the token across string concatenation evade a
// literal ban: catch the bracket-access concat form (el["inner" + "HTML"]).
const SINK_PATTERNS = [/\[\s*["'`]inner["'`]\s*\+\s*["'`]HTML["'`]\s*\]/];

// The one sanctioned sink-shaped statement on the origin: stats-page.js
// clears its tooltip with a zero-interpolation constant. The allowlist pins
// the exact line, so editing it into an interpolating assignment - or adding
// a second occurrence - fails the gate.
const ALLOWLIST = {
  "assets/js/stats-page.js": {
    innerHTML: /^\s*tip\.innerHTML = "";\s*$/,
  },
};

function collectJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(full));
    else if (entry.name.endsWith(".js")) out.push(path.relative(repoRoot, full));
  }
  return out.sort();
}

const FILES = [...collectJs(path.join(repoRoot, "assets/js")), ...collectJs(path.join(repoRoot, "static"))];

test("first-party script inventory is non-trivial (an empty scan must not pass green)", () => {
  assert.ok(FILES.length >= 8, `expected at least 8 first-party scripts, found ${FILES.length}`);
});

test("no first-party script contains a markup-sink token outside the pinned allowlist", () => {
  const failures = [];
  for (const file of FILES) {
    const lines = fs.readFileSync(path.join(repoRoot, file), "utf8").split("\n");
    for (const token of SINK_TOKENS) {
      lines.forEach((line, i) => {
        if (!line.includes(token)) return;
        const allow = ALLOWLIST[file]?.[token];
        if (allow && allow.test(line)) return;
        failures.push(`${file}:${i + 1}: ${token}: ${line.trim()}`);
      });
    }
    for (const pattern of SINK_PATTERNS) {
      lines.forEach((line, i) => {
        if (pattern.test(line)) failures.push(`${file}:${i + 1}: split-token sink: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(
    failures,
    [],
    "markup sink outside the allowlist (clear the value with textContent/assignment to a constant, " +
      "or DOM-build it; if a clearing assignment is genuinely needed, pin its exact line in ALLOWLIST):\n" +
      failures.join("\n"),
  );
});

test("the stats-page.js allowlist entry still matches a live line (a stale allowlist is a finding, not silence)", () => {
  const file = "assets/js/stats-page.js";
  const lines = fs.readFileSync(path.join(repoRoot, file), "utf8").split("\n");
  const matches = lines.filter((l) => ALLOWLIST[file].innerHTML.test(l));
  assert.equal(matches.length, 1, `${file} must contain exactly one allowlisted clearing line`);
});

// Profile URLs arrive from provider APIs (GitHub's html_url, an X handle, a
// Bluesky DID) and are rendered as links in reader.js, account-page.js and
// admin-page.js. They may only become an href through safeHref() (aifocus-d7jb):
// a javascript: or data: URI in an href executes when clicked, and the
// moderation page's links carry the moderator's Cloudflare Access session.
const PROFILE_URL = /profile_?url/i;
const HREF_ASSIGNMENT = /\.href\s*=\s*/;
const GUARDED = /safeHref\(/;

function unguardedHrefAssignments(source) {
  const failures = [];
  source.split("\n").forEach((line, i) => {
    if (!PROFILE_URL.test(line) || !HREF_ASSIGNMENT.test(line) || GUARDED.test(line)) return;
    failures.push(`${i + 1}: ${line.trim()}`);
  });
  return failures;
}

test("a profile URL reaches .href only through safeHref()", () => {
  const failures = [];
  for (const file of FILES) {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const failure of unguardedHrefAssignments(source)) failures.push(`${file}:${failure}`);
  }
  assert.deepEqual(
    failures,
    [],
    "a provider-supplied profile URL was assigned to an href without safeHref() - import it from " +
      "./safe-href.js and render a span when it returns null:\n" + failures.join("\n"),
  );
});

test("the profile-href guard catches the shapes it exists for", () => {
  const caught = [
    "wrap.href = person.profileUrl;",
    "who.href = item.author_profile_url;",
    "name.href = user.profile_url;",
  ];
  for (const sample of caught) {
    assert.equal(unguardedHrefAssignments(sample).length, 1, `the guard must catch: ${sample}`);
  }
  // The guarded shape, and a line that merely reads the field, must pass.
  assert.deepEqual(unguardedHrefAssignments("const href = safeHref(user.profile_url);"), []);
  assert.deepEqual(unguardedHrefAssignments("name.textContent = user.profile_url;"), []);
});
