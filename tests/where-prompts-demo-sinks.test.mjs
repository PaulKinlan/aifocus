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
// guard bans the tokens outright on comment-stripped source: any shape
// (template literal, join, variable, append-adjacent) fails.

const demoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/where-prompts-run-demo/demo.js');
// Raw source, comments included: the demo legitimately contains no markup-sink
// token anywhere, not even in prose, so the ban needs no comment stripping.
const source = fs.readFileSync(demoPath, 'utf8');

const SINK_TOKENS = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write'];

test('demo contains no markup-sink token of any shape', () => {
  const hits = SINK_TOKENS.filter((t) => source.includes(t));
  assert.deepEqual(
    hits,
    [],
    `markup sink reintroduced (any assignment shape fails this guard): ${hits.join(', ')}`,
  );
});

test('demo builds untrusted strings with textContent / DOM APIs', () => {
  const uses = (source.match(/textContent/g) || []).length;
  assert.ok(uses >= 6, `expected the tree/transcript builders to set textContent (found ${uses} uses)`);
  assert.match(source, /createElement\(/, 'expected createElement-based builders');
});

test('the escape-only convention helper is gone, so no sink can quietly depend on it', () => {
  assert.equal(source.match(/function escapeHtml/), null, 'escapeHtml must stay removed');
});
