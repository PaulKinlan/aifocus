import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for aifocus-qsv3 / aifocus-p3y7: the where-prompts-run demo
// renders agent-controlled strings (OPFS paths, provider payloads). It once did
// so via escape-only innerHTML joins - safe by convention with nothing
// enforcing the escape - and the first cut of this guard only recognised one
// syntactic shape of that sink while the real assignment was `x.innerHTML =
// lines.join('')`. The demo now contains no markup-sink token at all, so the
// guard scans the RAW source (comments included) and bans the tokens outright:
// a comment mentioning a sink token turns the gate red, which fails safe.

const demoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/where-prompts-run-demo/demo.js');
const source = fs.readFileSync(demoPath, 'utf8');

const SINK_TOKENS = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'setHTMLUnsafe', 'srcdoc', 'createContextualFragment', 'document.write'];

const WS_OR_COMMENT = '(?:\\s|/\\*[\\s\\S]*?\\*/|//[^\\r\\n\\u2028\\u2029]*(?:\\r\\n|[\\r\\n\\u2028\\u2029]|$))';
const CONCAT_PATTERN = new RegExp(`["'\`]${WS_OR_COMMENT}*\\+${WS_OR_COMMENT}*["'\`]`, 'g');

// A `/` inside an interpolation is a regex only where an expression can start;
// anywhere else it is division. Without this, the `}` of a regex literal such as
// /}/ terminated the interpolation early and the split sink token survived the
// collapse (aifocus-y9w6: el[`inn${/}/.source.slice(1)}erHTML`] read clean).
const REGEX_PRECEDERS = new Set(['(', '[', '{', ',', ';', ':', '=', '!', '&', '|', '?', '+', '-', '*', '%', '^', '~', '<', '>', '/']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'instanceof', 'yield', 'await']);

// Walks back over the whitespace and comments that may sit between a '.' and
// the member name it qualifies: the engine accepts x./*c*/return and x.// c
// <newline> return, so a whitespace-only lookbehind called both of them
// keyword-then-regex and swallowed the interpolation (aifocus-8bji).
function skipBackTrivia(src, index) {
  let i = index;
  for (;;) {
    while (i >= 0 && /\s/.test(src[i])) i -= 1;
    if (i >= 1 && src[i] === "/" && src[i - 1] === "*") {
      const open = src.lastIndexOf("/*", i - 2);
      if (open < 0) return i;
      i = open - 1;
      continue;
    }
    // Deliberately block comments only. A backwards search for '//' cannot
    // tell a line comment from the '//' inside a string literal earlier on the
    // same line (a URL, say), and guessing wrong there would break the
    // member-name rule this function exists for - so the line-comment spelling
    // is left to a real tokenizer rather than approximated here.
    return i;
  }
}

function startsRegex(src, index) {
  let j = index - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return true;
  if (/[A-Za-z0-9_$]/.test(src[j])) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k -= 1;
    // `x.return / 2` divides by a property that happens to be spelled like a
    // keyword; after a '.' the word is a member name, never an operator, so
    // treating it as a regex start swallowed the rest of the interpolation and
    // left the split token unseen (aifocus-a63j).
    const before = skipBackTrivia(src, k);
    if (before >= 0 && src[before] === ".") return false;
    return REGEX_KEYWORDS.has(src.slice(k + 1, j + 1));
  }
  return REGEX_PRECEDERS.has(src[j]);
}

// Skips a regex literal, honouring escapes and character classes, and returns
// the index just past it (or the newline that leaves it unterminated).
function skipRegex(src, index) {
  let i = index + 1;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') return i;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      i += 1;
      while (i < src.length && /[a-z]/i.test(src[i])) i += 1; // flags
      return i;
    }
    i += 1;
  }
  return i;
}

// Strips template expression interpolations (${...}) with arbitrary brace nesting depth,
// comments, inner string literals and regex literals.
function stripTemplateInterpolations(src) {
  let result = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') {
          depth++;
          i++;
        } else if (src[i] === '}') {
          depth--;
          i++;
        } else if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
          const quote = src[i];
          i++;
          while (i < src.length && src[i] !== quote) {
            if (src[i] === '\\') i++;
            i++;
          }
          if (i < src.length) i++;
        } else if (src[i] === '/' && src[i + 1] === '*') {
          i += 2;
          while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
            i++;
          }
          if (i < src.length) i += 2;
        } else if (src[i] === '/' && src[i + 1] === '/') {
          i += 2;
          while (i < src.length && !/[\r\n\u2028\u2029]/.test(src[i])) {
            i++;
          }
          if (i < src.length) i++;
        } else if (src[i] === '/' && startsRegex(src, i)) {
          i = skipRegex(src, i);
        } else {
          i++;
        }
      }
    } else {
      result += src[i];
      i++;
    }
  }
  return result;
}

// Sinks assembled by splitting the token across string concatenation or template
// interpolation evade a literal ban: collapsing quote-concatenation pairs
// (including whitespace, block comments, or line comments terminated by any JS
// LineTerminator: \n, \r\n, \r, \u2028, \u2029) and template expression interpolations
// (supporting arbitrary nested braces and expressions) detects split tokens anywhere
// in the string across any boundary.
export function findSinkTokens(src) {
  let prev = '';
  let joined = stripTemplateInterpolations(src);
  while (joined !== prev) {
    prev = joined;
    joined = joined.replace(CONCAT_PATTERN, '');
  }
  return SINK_TOKENS.filter((t) => src.includes(t) || joined.includes(t));
}

test('demo contains no markup-sink token of any shape', () => {
  const hits = findSinkTokens(source);
  assert.deepEqual(
    hits,
    [],
    `markup sink reintroduced (any assignment or split-concatenation shape fails this guard): ${hits.join(', ')}`,
  );
});

test('split-token guard catches concatenated sink tokens across arbitrary split boundaries', () => {
  const evasions = [
    'el["inner" + "HTML"] = payload;',
    'el["inn" + "erHTML"] = payload;',
    'el["inn"/* note */+"erHTML"] = payload;',
    'el["inn" // line comment\n + "erHTML"] = payload;',
    'el["inn" // line comment\r + "erHTML"] = payload;',
    'el["inn" // line comment\u2028 + "erHTML"] = payload;',
    'el["inn" // line comment\u2029 + "erHTML"] = payload;',
    'el[`inn${payload}erHTML`] = x;',
    'el[`inn${""}erHTML`] = x;',
    'el[`inn${{x:""}.x}erHTML`] = "<b>x</b>";',
    'el[`inn${(() => { return "" })()}erHTML`] = "<b>x</b>";',
    // aifocus-y9w6: the } inside these regex literals used to terminate the
    // interpolation, leaving /.source.slice(...) between "inn" and "erHTML".
    'el[`inn${/}/.source.slice(1)}erHTML`] = "<b>x</b>";',
    'el[`inn${/[}"]/.source.slice(4)}erHTML`] = "<b>x</b>";',
    'el[`inn${"x".replace(/}/, "")}erHTML`] = "<b>x</b>";',
    'el[`inn${typeof /}/.source}erHTML`] = "<b>x</b>";',
    // and the other direction: a division is not a regex, so a following } must
    // still terminate the interpolation.
    'el[`inn${total / 2}erHTML`] = "<b>x</b>";',
    // a property that happens to be spelled like a keyword is still a division
    // (aifocus-a63j): reading `x.return` as the keyword made the scanner skip
    // forward looking for a closing slash and lose the rest of the expression.
    'el[`inn${x.return / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${x.in / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${x.of / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${obj?.return / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${(x).return / 2}erHTML`] = "<b>x</b>";',
    // ...and a comment between the dot and the member name does not change that
    // (aifocus-8bji)
    'el[`inn${x./* c */return / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${x./* c */in / 2}erHTML`] = "<b>x</b>";',
    // a '//' inside a string earlier on the line must not disturb the check
    'const u = "https://example.test"; el[`inn${x.return / 2}erHTML`] = "<b>x</b>";',
    // ...while a real keyword in front of a regex still works, including a
    // member call that contains one
    'el[`inn${(() => { return /}/.source })()}erHTML`] = x;',
    'el["out" + "erHTML"] = payload;',
    'window["set" + "HTMLUnsafe"](payload);',
    'frame["src" + "doc"] = payload;',
    'range["create" + "ContextualFragment"](payload);',
  ];
  for (const evasion of evasions) {
    const hits = findSinkTokens(evasion);
    assert.ok(hits.length > 0, `expected evasion to be detected: ${evasion}`);
  }
});

test('demo builds untrusted strings with textContent / DOM APIs', () => {
  const uses = (source.match(/textContent/g) || []).length;
  assert.ok(uses >= 6, `expected the tree/transcript builders to set textContent (found ${uses} uses)`);
  assert.match(source, /createElement\(/, 'expected createElement-based builders');
});

test('the escape-only convention helper is gone, so no sink can quietly depend on it', () => {
  assert.equal(source.match(/function escapeHtml/), null, 'escapeHtml must stay removed');
});
