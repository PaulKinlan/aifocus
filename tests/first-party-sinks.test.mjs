// Origin-wide markup-sink guard (aifocus-mcqz).
//
// tests/where-prompts-demo-sinks.test.mjs bans markup-sink tokens in the
// journal demo's bundle, but every first-party script shares the origin and
// its 'unsafe-inline' CSP: assets/js/reader.js, account-page.js,
// admin-page.js, site-search.js, webmcp.js, ask-client.js and stats-page.js
// all render server- or model-supplied strings. This guard applies the same
// raw-source token ban to first-party JS and inline script in layouts/,
// themes/ and static/**/*.html. Twelve existing authored-data sinks in seven
// static tools are exact-statement pins, not a claim that their RHS is safe;
// THREAT_MODEL.md §5(3) records the remaining review boundary.
//
// Raw source, comments included - same fail-safe rule as the demo guard: a
// comment naming a sink token turns the gate red. Keep the token list in sync
// with tests/where-prompts-demo-sinks.test.mjs.
//
// Matching runs on the canonicalized logical line (tokens) and the whole
// canonicalized source (split-token patterns), not the raw bytes: JS decodes
// \uXXXX, \u{...} and \xXX escapes inside string and template literals, and
// \uXXXX/\u{...} also inside identifiers, so el.inner\u0048TML and
// el["inner\x48TML"] bind and execute as a real innerHTML assignment while
// the raw source never spells the token (aifocus-552f, aifocus-nem2; both
// demonstrated with new Function). Canonicalizing before the token and
// pattern match makes the ban see the property the engine actually binds.
// Patterns run source-wide because the engine also allows an operand break
// inside the bracket concat (el["inner" +<newline>"HTML"], aifocus-0p2e).
// As with comments, an escaped or assembled mention that is not an
// executable assignment also turns the gate red - that is the fail-safe
// posture, and ALLOWLIST pins are the escape hatch. A backslash at end of
// line continues the literal on the next physical line, so the scan joins
// continuations into logical lines first (keeping each logical line's first
// physical number
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
// Sinks assembled by splitting the token across string concatenation evade a
// literal ban: catch the bracket-access concat form (el["inner" + "HTML"]),
// and the template-key form (el[inner${''}HTML]) once interpolations are
// collapsed to the empty string - both evaluate to the same property name.
const SINK_PATTERNS = [
  // quotes are optional: a collapsed template key keeps its backticks
  /\[\s*["'`]?innerHTML["'`]?\s*\]/g,
];
// Template interpolations collapse to nothing so a key assembled through one
// (el[inner${''}HTML], aifocus-0p2e) normalises to what it evaluates to.
// Fail-safe by construction: a dynamic key spelling the sink halves is
// exactly the family this guard exists for, and ALLOWLIST pins are the
// escape hatch for a genuine false positive.
const TEMPLATE_INTERP = /\$\{[^}]*\}/g;

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

const CONCAT_LITERAL = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/;

// Whitespace and comments are not operands: the engine treats `+ /*x*/ "HTML"`
// exactly like `+ "HTML"`, so both have to be skipped between operands.
function skipTrivia(text, i) {
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return i;
      i = end + 2;
      continue;
    }
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i + 2);
      if (end < 0) return text.length;
      i = end + 1;
      continue;
    }
    return i;
  }
}

// A bracket key assembled from literals: the engine joins the operands, so the
// operands are read (skipping whitespace and comments) and their values
// concatenated. Two operands with a comment between them, or three or more
// operands, therefore land in the same ban as el["inner" + "HTML"], which a
// fixed two-operand pattern could not see (aifocus-i1l5). Keys with a
// non-literal operand are not decidable here and stay out; the single-literal
// key is already covered by SINK_PATTERNS, so only '+' joins are reported and
// nothing is flagged twice.
function concatKeyMatches(text) {
  const hits = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "[") continue;
    let j = skipTrivia(text, i + 1);
    const parts = [];
    for (;;) {
      const literal = CONCAT_LITERAL.exec(text.slice(j));
      if (!literal) break;
      parts.push(literal[0].slice(1, -1));
      j = skipTrivia(text, j + literal[0].length);
      if (text[j] === "+") {
        j = skipTrivia(text, j + 1);
        continue;
      }
      if (text[j] === "]" && parts.length >= 2) {
        const value = parts.join("");
        if (SINK_TOKENS.some((token) => value.includes(token))) {
          hits.push({ index: i, text: text.slice(i, j + 1) });
        }
      }
      break;
    }
  }
  return hits;
}

function sinkViolations(file, source, label = file) {
  const failures = [];
  const prepared = logicalLines(source).map(({ text, number }) => ({
    // Token ban: the escaped spelling, no interpolation collapse - a token
    // must be spelled. Pattern ban: interpolations collapse, so a key
    // assembled through one normalises to what it evaluates to.
    tokenText: canonicalize(text),
    patternText: canonicalize(text).replace(TEMPLATE_INTERP, ""),
    raw: text,
    number,
  }));
  for (const { tokenText, raw, number } of prepared) {
    for (const token of SINK_TOKENS) {
      if (!tokenText.includes(token)) continue;
      const allow = ALLOWLIST[file]?.[token];
      if (allow && (Array.isArray(allow) ? allow.includes(raw) : allow.test(raw))) continue;
      failures.push(`${label}:${number}: ${token}: ${raw.trim()}`);
    }
  }
  const flagged = new Set(failures.map((f) => f.split(":").slice(0, 2).join(":")));
  // The split-token patterns run on the WHOLE canonicalized source, not per
  // line: the engine allows an operand break inside the bracket concat, so
  // el["inner" +\n"HTML"] binds "innerHTML" while no single line spells the
  // shape (aifocus-0p2e). Their \\s* spans the newlines between the prepared
  // lines; a failure cites the line the match starts on.
  const joined = prepared.map((p) => p.patternText).join("\n");
  const starts = [];
  let offset = 0;
  for (const p of prepared) {
    starts.push({ offset, number: p.number });
    offset += p.patternText.length + 1;
  }
  const lineNumberOf = (index) => {
    let n = prepared[0]?.number ?? 1;
    for (const s of starts) if (s.offset <= index) n = s.number;
    return n;
  };
  const report = (index, text) => {
    const n = lineNumberOf(index);
    // a line the token ban already flagged is already red; a second
    // violation for the same line would only be noise
    if (flagged.has(`${label}:${n}`)) return;
    failures.push(`${label}:${n}: split-token sink: ${text.trim()}`);
  };
  for (const pattern of SINK_PATTERNS) {
    for (const match of joined.matchAll(pattern)) report(match.index, match[0]);
  }
  for (const hit of concatKeyMatches(joined)) report(hit.index, hit.text);
  return failures;
}

// Existing authored-data markup sinks in standalone static tools are pinned
// by exact statement, not by file: a new assignment still fails the scan.
// These pins do NOT prove the strings built on earlier lines remain escaped;
// THREAT_MODEL.md §5(3) names the review trigger for changing their inputs.
const STATIC_INLINE_PINS = {
  "static/model-drops.html": [
    "  $('timeline-chart').innerHTML = svg;",
    "    $('timeline-chart').innerHTML = `<div class=\"error\">Failed to load data: ${esc(err.message)}</div>`;",
  ],
  "static/model-gap.html": [
    "        chart.innerHTML = s + '<div class=\"chart-tip\" id=\"chart-tip\" role=\"tooltip\" hidden></div>';",
    "        panel.innerHTML = html;",
    '      document.getElementById("note").innerHTML =',
  ],
  "static/pwa-cooked-baseline.html": ["  row.innerHTML = `", "summary.innerHTML ="],
  "static/pwa-cooked-comparator.html": ["  detail.innerHTML = `"],
  "static/pwa-cooked-timeline.html": ["document.getElementById('chart').innerHTML = svg;"],
  "static/token-calculator-regional.html": ["    container.innerHTML = REGIONS.map(r => `", "    table.innerHTML = html;"],
  "static/token-calculator.html": ["    tbody.innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');"],
};
const ALLOWLIST = {
  "assets/js/stats-page.js": {
    innerHTML: /^\s*tip\.innerHTML = "";\s*$/,
  },
  ...Object.fromEntries(Object.entries(STATIC_INLINE_PINS).map(([file, lines]) => [file, { innerHTML: lines }])),
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

// Inline <script> bodies from page templates and standalone static HTML.
// These execute on this origin too; scan their bodies with the same rule.
// Script tags with a src are external files, covered by the JS inventory.
// A script tag's body belongs to an external file only when the tag carries a
// real src attribute. Quoted attribute values are consumed whole by this
// tokeniser, so `data-note=" src=x "` cannot masquerade as one (aifocus-6hwt),
// and `data-src="loader"` names an attribute that is not src (aifocus-hjlq).
function hasSrcAttribute(attributes) {
  const attr = /([^\s"'<>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  let match;
  while ((match = attr.exec(attributes))) {
    if (match[1].toLowerCase() === "src") return true;
  }
  return false;
}

function inlineScriptsInHtml(html, rel) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let n = 0;
  while ((m = re.exec(html))) {
    // Only a genuine src attribute makes the body external. Two ways that
    // differs from "the text src= appears in the tag", both of which hid real
    // sinks in review:
    //   - data-src keeps its body inline, and the naive \bsrc\s*= matched it
    //     because the word boundary sits after the hyphen (aifocus-hjlq);
    //   - a quoted VALUE can contain the text src= without being an attribute
    //     at all, e.g. data-note=" src=not-a-real-source " (aifocus-6hwt).
    // So tokenise the attribute list and compare attribute NAMES, consuming
    // quoted values whole so a match can never start inside one.
    if (hasSrcAttribute(m[1]) || !m[2].trim()) continue;
    n += 1;
    const bodyStart = html.slice(0, m.index + m[0].indexOf(m[2]));
    out.push({
      file: rel,
      label: `${rel} (inline script ${n}, starts at line ${bodyStart.split("\n").length})`,
      source: m[2],
    });
  }
  return out;
}

function collectInlineScripts(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectInlineScripts(full, out);
    else if (entry.name.endsWith(".html")) {
      const rel = path.relative(repoRoot, full);
      out.push(...inlineScriptsInHtml(fs.readFileSync(full, "utf8"), rel));
    }
  }
  return out;
}

const INLINE_SCRIPTS = [
  ...collectInlineScripts(path.join(repoRoot, "layouts")),
  ...collectInlineScripts(path.join(repoRoot, "themes")),
  ...collectInlineScripts(path.join(repoRoot, "static")),
];

test("first-party script inventory is non-trivial (an empty scan must not pass green)", () => {
  assert.ok(FILES.length >= 8, `expected at least 8 first-party scripts, found ${FILES.length}`);
});

test("static inline scripts are scanned and each pre-existing sink pin stays live", () => {
  const staticScripts = INLINE_SCRIPTS.filter((script) => script.file.startsWith("static/"));
  assert.deepEqual(
    [...new Set(staticScripts.map((script) => script.file))].sort(),
    Object.keys(STATIC_INLINE_PINS).sort(),
    "an unreviewed static inline script must not evade the inventory",
  );
  let pins = 0;
  for (const [file, lines] of Object.entries(STATIC_INLINE_PINS)) {
    const scripts = staticScripts.filter((script) => script.file === file);
    const actual = scripts.flatMap((script) => logicalLines(script.source).map(({ text }) => text));
    for (const line of lines) {
      assert.equal(actual.filter((text) => text === line).length, 1, `${file}: stale or duplicate sink pin: ${line}`);
      const editedWhitespace = line.startsWith(" ") ? line.slice(1) : ` ${line}`;
      assert.match(sinkViolations(file, editedWhitespace)[0], /innerHTML/, `${file}: even a whitespace edit must invalidate the pin`);
      pins++;
    }
  }
  assert.equal(pins, 12, "all twelve existing static assignments need exact-statement pins");
  const probe = inlineScriptsInHtml('<script>document.body.innerHTML = location.hash;</script>', "static/rev-probe.html");
  assert.equal(probe.length, 1);
  assert.match(sinkViolations(probe[0].file, probe[0].source, probe[0].label)[0], /innerHTML/);
});

test("the layouts inline-script scan sees the templates it exists for (an empty scan must not pass green)", () => {
  assert.ok(
    INLINE_SCRIPTS.length >= 4,
    `expected at least 4 inline script bodies under layouts/ and themes/, found ${INLINE_SCRIPTS.length}`,
  );
  assert.ok(
    INLINE_SCRIPTS.some((s) => s.file.endsWith("404.html")),
    "the 404 page's inline script must be among the scanned bodies",
  );
  // A data-src attribute is not a src: the body executes inline, so it must
  // be scanned, not skipped (aifocus-hjlq).
  const probe = inlineScriptsInHtml(
    '<div><script data-src="loader">document.body.innerHTML = location.hash;</script><script>seen();</script></div>',
    "probe.html",
  );
  assert.equal(probe.length, 2, `both bodies must be collected, got ${JSON.stringify(probe.map((p) => p.source))}`);
  assert.ok(
    probe.some((s) => s.source.includes("innerHTML")),
    "the data-src script body must be among the collected bodies",
  );
  const external = inlineScriptsInHtml('<script src="/js/x.js">ignored</script><script>seen();</script>', "probe.html");
  assert.equal(external.length, 1, "a genuine src script must still be skipped");
  assert.ok(external[0].source.includes("seen()"));
});

// The exclusion is about attributes, not about the text of the tag: a quoted
// value can contain "src=" without being a src attribute, and skipping that
// body hid an executable sink in review (aifocus-6hwt). Each case is one line
// of HTML and the number of bodies that must be collected from it.
test("an inline script is skipped only for a real src attribute, never for text that looks like one", () => {
  const cases = [
    ['<script src="/js/x.js">a()</script>', 0, "a genuine src is external"],
    ['<script type="module" src="/js/x.js">a()</script>', 0, "src after another attribute"],
    ['<script SRC="/js/x.js">a()</script>', 0, "attribute names are case-insensitive"],
    ["<script src='/js/x.js'>a()</script>", 0, "single-quoted src"],
    ['<script src="/js/x.js" defer>a()</script>', 0, "a boolean attribute after src"],
    ['<script data-src="loader">document.body.innerHTML = x;</script>', 1, "data-src keeps its body inline (aifocus-hjlq)"],
    ['<script data-note=" src=not-a-real-source ">document.body.innerHTML = x;</script>', 1, "a quoted value containing src= is not an attribute (aifocus-6hwt)"],
    ["<script data-note=' src=x '>document.body.innerHTML = x;</script>", 1, "the same in single quotes"],
    ['<script data-src=" src=x ">a()</script>', 1, "a value naming both data-src and src="],
    ['<script data-src="loader">   </script>', 0, "an empty body is not scanned"],
    ['<script type="module">import x from "./x.js";</script>', 1, "an inline module still executes inline"],
  ];
  for (const [html, expected, why] of cases) {
    const got = inlineScriptsInHtml(html, "probe.html");
    assert.equal(
      got.length,
      expected,
      `${why}: expected ${expected} collected body/bodies, got ${JSON.stringify(got.map((g) => g.source))}`,
    );
  }
});

test("no first-party script contains a markup-sink token outside the pinned allowlist", () => {
  const failures = [];
  for (const file of FILES) {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const failure of sinkViolations(file, source)) failures.push(failure);
  }
  for (const script of INLINE_SCRIPTS) {
    for (const failure of sinkViolations(script.file, script.source, script.label)) failures.push(failure);
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
    // A plain operand break (no backslash): the engine folds the whitespace,
    // so this binds "innerHTML" while each physical line is innocent-looking.
    ['el["inner" +\n  "HTML"] = markup;', "split-token sink", 1],
    // A key assembled through a template interpolation, which collapses to
    // the empty string: the runtime key is "innerHTML" (aifocus-0p2e).
    ['el[`inner${\'\'}HTML`] = markup;', "split-token sink", 1],
    // Operands the fixed two-operand pattern could not see: a comment between
    // them is not an operand, and three or more operands still join to the
    // same key (aifocus-i1l5).
    ['el["inner" + /*x*/ "HTML"] = markup;', "split-token sink", 1],
    ['el["inner" + "HTM" + "L"] = markup;', "split-token sink", 1],
    ['el["inner" + "HT" + "M" + "L"] = markup;', "split-token sink", 1],
    ['el["inn"/*a*/+/*b*/"er"// tail\n+"HTML"] = markup;', "split-token sink", 1],
    // aifocus-47qn: a comment containing a bracket is still a comment. A guard
    // that regexes the bracket contents stops at the ] inside /* ] */ and goes
    // green on an expression that binds innerHTML.
    ['el["inner" + /* ] */ "HTML"] = markup;', "split-token sink", 1],
    ['el["inner" + /*] */"HTML"] = markup;', "split-token sink", 1],
    ['el["inn"/* ] */+"erHTML"] = markup;', "split-token sink", 1],
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
  const wrapped = {};
  new Function("el", 'el["inner" +\n  "HTML"] = "PAYLOAD";')(wrapped);
  assert.deepEqual(Object.keys(wrapped), ["innerHTML"]);
  const templated = {};
  new Function("el", "el[\`inner${''}HTML\`] = \"PAYLOAD\";")(templated);
  assert.deepEqual(Object.keys(templated), ["innerHTML"]);
  const commented = {};
  new Function("el", 'el["inner" + /*x*/ "HTML"] = "PAYLOAD";')(commented);
  assert.deepEqual(Object.keys(commented), ["innerHTML"]);
  const three = {};
  new Function("el", 'el["inner" + "HTM" + "L"] = "PAYLOAD";')(three);
  assert.deepEqual(Object.keys(three), ["innerHTML"]);
  const bracketed = {};
  new Function("el", 'el["inner" + /* ] */ "HTML"] = "PAYLOAD";')(bracketed);
  assert.deepEqual(Object.keys(bracketed), ["innerHTML"]);
});

test("the concat-key pass flags only joins that spell a sink token", () => {
  // Clean: operands that join to something harmless, and keys with a
  // non-literal operand (not decidable here, and not a spelling of the token).
  const clean = [
    'arr["a" + "b"] = 1;',
    'el["inner" + suffix] = 1;',
    'el[prefix + "HTML"] = 1;',
    // the halves spelled apart is prose, not a key: the token ban flags the
    // joined word anywhere, comments included, so this is the clean neighbour
    'const note = "inner and HTML are separate words";',
    'el["inner" - "HTML"] = 1;',
    // a bracket inside a comment does not make an innocent join a sink
    'arr["a" + /* ] */ "b"] = 1;',
  ];
  for (const sample of clean) {
    assert.deepEqual(sinkViolations("sample.js", sample), [], `must stay green: ${JSON.stringify(sample)}`);
  }
  // Exactly one violation per shape, cited once: the token ban and the concat
  // pass must not double-report the same line.
  assert.equal(sinkViolations("sample.js", 'el["inner" + "HTM" + "L"] = markup;').length, 1);
  // A literal key with no join still goes through the bracket pattern, not here.
  assert.equal(sinkViolations("sample.js", 'el["innerHTML"] = x;').length, 1);
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
    // A template key that does NOT spell the sink halves stays clean even
    // though the collapse erases the interpolation.
    'el[`name${i}`] = markup;',
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
