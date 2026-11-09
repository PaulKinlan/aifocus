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
//
// Matching runs on the canonicalized logical line, not the raw bytes: JS
// decodes \uXXXX, \u{...} and \xXX escapes inside string and template
// literals, and \uXXXX/\u{...} also inside identifiers, so el.inner\u0048TML
// and el["inner\x48TML"] bind and execute as a real innerHTML assignment
// while the raw source never spells the token (aifocus-552f, aifocus-nem2;
// both demonstrated with new Function). Canonicalizing before the token and
// pattern match makes the ban see the property the engine actually binds.
// As with comments, an escaped mention that is not an executable assignment
// also turns the gate red - that is the fail-safe posture, and ALLOWLIST
// pins are the escape hatch. A backslash at end of line continues the
// literal on the next physical line, so the scan joins continuations into
// logical lines first (keeping each logical line's first physical number
// for the failure cite); without that, el["inner<newline>HTML"] is invisible
// to any per-line scan.
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

// Decode \uXXXX, \u{...} and \xXX escapes so an escaped spelling of a token
// is matched as the token. \u and \u{...} are decoded in identifiers too;
// \xXX only in string and template literals, which is exactly the shape
// el["inner\x48TML"] exploits (aifocus-nem2). Malformed or out-of-range
// sequences stay as-is; the source tree contains no unicode or \x escapes,
// so this can only ever widen the ban, never flag clean code.
function canonicalize(line) {
  return line.replace(
    /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g,
    (match, braced, hex4, hex2) => {
      const code = parseInt(braced ?? hex4 ?? hex2, 16);
      return code > 0x10ffff ? match : String.fromCodePoint(code);
    },
  );
}

// Join backslash line continuations into logical lines. The engine folds
// backslash-newline inside a literal, so a key written across two physical
// lines is one runtime string; an odd number of trailing backslashes means
// continuation (an even run is escaped backslashes, not a line join). Each
// logical line keeps the physical number of its first line so failures cite
// a real line.
function logicalLines(source) {
  const out = [];
  let current = null;
  source.split("\n").forEach((rawLine, i) => {
    const line = rawLine.replace(/\r$/, "");
    if (current === null) current = { text: line, number: i + 1 };
    else current.text += line; // the engine folds the continuation to nothing, so no separator
    const trailing = line.length - line.replace(/\\+$/, "").length;
    if (trailing % 2 === 1) {
      current.text = current.text.slice(0, -1);
      return;
    }
    out.push(current);
    current = null;
  });
  if (current !== null) out.push(current);
  return out;
}

function sinkViolations(file, source) {
  const failures = [];
  for (const { text, number } of logicalLines(source)) {
    const line = canonicalize(text);
    for (const token of SINK_TOKENS) {
      if (!line.includes(token)) continue;
      const allow = ALLOWLIST[file]?.[token];
      if (allow && allow.test(text)) continue;
      failures.push(`${file}:${number}: ${token}: ${text.trim()}`);
    }
    for (const pattern of SINK_PATTERNS) {
      if (pattern.test(line)) failures.push(`${file}:${number}: split-token sink: ${text.trim()}`);
    }
  }
  return failures;
}

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
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const failure of sinkViolations(file, source)) failures.push(failure);
  }
  assert.deepEqual(
    failures,
    [],
    "markup sink outside the allowlist (clear the value with textContent/assignment to a constant, " +
      "or DOM-build it; if a clearing assignment is genuinely needed, pin its exact line in ALLOWLIST):\n" +
      failures.join("\n"),
  );
});

// Negative controls for the non-literal spellings a raw-substring ban cannot
// see (aifocus-552f, aifocus-nem2): every caught sample parses to a live
// sink assignment at runtime - the runtime-execution test below proves it
// for the escaped forms with new Function.
test("the sink guard catches executable sink assignments written with non-literal spellings", () => {
  const caught = [
    [String.raw`el.inner\u0048TML = "<img src=x onerror=alert(1)>";`, "innerHTML", 1],
    [String.raw`el.\u{69}nnerHTML = markup;`, "innerHTML", 1],
    [String.raw`box.insertAdjacent\u0048TML("beforeend", data);`, "insertAdjacentHTML", 1],
    [String.raw`el["inner" + "HT\u004DL"] = markup;`, "split-token sink", 1],
    [String.raw`el["inner\x48TML"] = markup;`, "innerHTML", 1],
    [String.raw`el["inner" + "\x48TML"] = markup;`, "split-token sink", 1],
    // Two physical lines joined by a backslash continuation: the runtime key
    // is "innerHTML" and the failure must cite the FIRST physical line.
    ['el["inner\\\nHTML"] = markup;', "innerHTML", 1],
  ];
  for (const [sample, label, line] of caught) {
    const violations = sinkViolations("sample.js", sample);
    assert.equal(violations.length, 1, `the guard must catch: ${JSON.stringify(sample)}`);
    assert.ok(violations[0].includes(label), `${JSON.stringify(sample)} must be reported as ${label}: ${violations[0]}`);
    assert.ok(violations[0].includes(`sample.js:${line}:`), `${JSON.stringify(sample)} must cite line ${line}: ${violations[0]}`);
  }
});

test("the caught escaped spellings really bind the sink at runtime", () => {
  // The ban is fail-safe and may flag escaped mentions that are not
  // assignments, but the shapes above must be executable, or the guard is
  // banning prose. new Function re-parses the raw text, which is exactly how
  // an evasive payload would run (aifocus-nem2 repro).
  const runtime = {};
  new Function("el", String.raw`el["inner\x48TML"] = "PAYLOAD";`)(runtime);
  assert.deepEqual(Object.keys(runtime), ["innerHTML"]);
  const joined = {};
  new Function("el", 'el["inner\\\nHTML"] = "PAYLOAD";')(joined);
  assert.deepEqual(Object.keys(joined), ["innerHTML"]);
});

test("canonicalization neither flags clean lines nor unmasks the raw ban", () => {
  // Benign lines - including the double-backslash spelling whose escape is
  // NOT decoded by the engine, a decoy escape that unescapes elsewhere, and
  // a hex escape that decodes to harmless text - must stay green.
  const clean = [
    String.raw`const guide = "cost \\u0048TML is high";`,
    String.raw`el.textContent = user.\u006Eame;`,
    String.raw`tip.innerHTML = "";`,
    String.raw`const hex = "\x41\x42";`,
    'const escaped = "line one\\\nline two";',
  ];
  for (const sample of clean) {
    assert.deepEqual(sinkViolations("assets/js/stats-page.js", sample), [], `must not flag: ${JSON.stringify(sample)}`);
  }
  // The raw literal token is still caught exactly as before canonicalization.
  assert.equal(sinkViolations("sample.js", "el.innerHTML = markup;").length, 1);
  // The pinned clearing line still passes through the same helper that the
  // origin-wide scan uses, so allowlist drift cannot hide behind the refactor.
  assert.deepEqual(sinkViolations("assets/js/stats-page.js", '  tip.innerHTML = "";'), []);
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
