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
const TEMPLATE_INTERP_PATTERN = /\$\{[^}]*\}/g;

// Sinks assembled by splitting the token across string concatenation or template
// interpolation evade a literal ban: collapsing quote-concatenation pairs
// (including whitespace, block comments, or line comments terminated by any JS
// LineTerminator: \n, \r\n, \r, \u2028, \u2029) and template expression interpolations
// detects split tokens anywhere in the string across any boundary.
export function findSinkTokens(src) {
  let prev = '';
  let joined = src;
  while (joined !== prev) {
    prev = joined;
    joined = joined.replace(TEMPLATE_INTERP_PATTERN, '').replace(CONCAT_PATTERN, '');
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
