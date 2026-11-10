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

// A `/` is a regex only where an expression can start; that depends on the
// code token before it, and comments and whitespace may sit between the two
// (x./*c*/return, x.// c <newline> return). Both questions used to be answered
// by walking BACKWARDS over that trivia, which cannot tell a real comment from
// the same characters inside an earlier string literal: with `const m = "/*";`
// in the file, the backwards search took the string's `/*` as the comment
// opener, lost the member dot, read `return / 2` as a regex and swallowed the
// rest of the interpolation - silently green (aifocus-8bji, aifocus-7ske,
// aifocus-a63j, aifocus-ugwd). The scanner therefore carries the last code
// token it actually consumed, forwards, and judges each `/` against that.
function startsRegexAfter(last) {
  if (last.kind === 'none') return true; // no code yet: an expression starts here
  // `x.return / 2` divides by a property spelled like a keyword; a member
  // name is never an operator, and the dot that made it one is tracked below.
  if (last.kind === 'word') return !last.member && REGEX_KEYWORDS.has(last.text);
  if (last.kind === 'punct') return REGEX_PRECEDERS.has(last.text);
  return false; // a value, a closer or a '.' - this '/' divides
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
// comments, inner string literals and regex literals. Everything it consumes
// is real code: it never infers a comment opener by searching backwards, so a
// '/*' inside a string literal cannot be mistaken for one (aifocus-ugwd).
function stripTemplateInterpolations(src) {
  let result = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{') {
      let depth = 1;
      // The last code token inside the interpolation. Trivia (whitespace and
      // comments) deliberately does not update it, so a '/' is judged against
      // real code rather than against a backwards guess.
      let last = { kind: 'none', text: '', member: false };
      i += 2;
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '{') {
          depth++;
          last = { kind: 'punct', text: ch, member: false };
          i++;
        } else if (ch === '}') {
          depth--;
          i++;
          if (depth === 0) break;
          last = { kind: 'value', text: ch, member: false };
        } else if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch;
          i++;
          while (i < src.length && src[i] !== quote) {
            if (src[i] === '\\') i++;
            i++;
          }
          if (i < src.length) i++;
          last = { kind: 'value', text: quote, member: false };
        } else if (ch === '/' && src[i + 1] === '*') {
          i += 2;
          while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
            i++;
          }
          if (i < src.length) i += 2;
        } else if (ch === '/' && src[i + 1] === '/') {
          i += 2;
          while (i < src.length && !/[\r\n\u2028\u2029]/.test(src[i])) {
            i++;
          }
          if (i < src.length) i++;
        } else if (ch === '/' && startsRegexAfter(last)) {
          i = skipRegex(src, i);
          last = { kind: 'value', text: '/', member: false };
        } else if (/\s/.test(ch)) {
          i++;
        } else if (/[A-Za-z_$]/.test(ch)) {
          let j = i;
          while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
          last = { kind: 'word', text: src.slice(i, j), member: last.kind === 'dot' };
          i = j;
        } else if (/[0-9]/.test(ch)) {
          let j = i;
          while (j < src.length && /[0-9A-Za-z_$.]/.test(src[j])) j++;
          last = { kind: 'value', text: src.slice(i, j), member: false };
          i = j;
        } else if (ch === '.') {
          last = { kind: 'dot', text: ch, member: false };
          i++;
        } else {
          last = { kind: /[)\]]/.test(ch) ? 'value' : 'punct', text: ch, member: false };
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
    // a comment body may contain the opener itself (aifocus-7ske)
    'el[`inn${x./* /* */return / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${x./* */ */return / 2}erHTML`] = "<b>x</b>";',
    // two comments in a row must both be skipped
    'el[`inn${x./* a */ /* b */return / 2}erHTML`] = "<b>x</b>";',
    // an unrelated string literal earlier in the file cannot be mistaken for
    // the comment between the dot and the member name, which is what a
    // backwards walk over the trivia used to do (aifocus-ugwd)
    'const marker = "/*"; el[`inn${x./* c */return / 2}erHTML`] = "<b>x</b>";',
    'const marker = "*/"; el[`inn${x./* c */return / 2}erHTML`] = "<b>x</b>";',
    'const marker = "/* */"; el[`inn${x./* c */return / 2}erHTML`] = "<b>x</b>";',
    'el[`inn${(() => { const marker = "/*"; return x./* c */return / 2 })()}erHTML`] = "<b>x</b>";',
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
