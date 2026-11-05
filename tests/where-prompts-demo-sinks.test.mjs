import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for aifocus-qsv3: the where-prompts-run demo renders
// agent-controlled strings (OPFS paths, provider payloads). It once did so via
// escape-only innerHTML joins - safe by convention with nothing enforcing the
// escape. The sinks are now DOM-built (textContent), so the guard forbids
// interpolating innerHTML assignments and the orphaned escape helper outright.

const demoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/where-prompts-run-demo/demo.js');
const source = fs.readFileSync(demoPath, 'utf8');

test('demo has no interpolating innerHTML assignments', () => {
  const interpolating = source.match(/\.innerHTML\s*=\s*[`'"][^`'"]*\$\{/);
  assert.equal(
    interpolating,
    null,
    `interpolating innerHTML sink reintroduced: ${interpolating && interpolating[0]}`,
  );
});

test('demo builds untrusted strings with textContent, not markup', () => {
  assert.match(source, /treeEl\.textContent = '';/, 'tree container must be reset via textContent');
  assert.match(source, /a\.textContent = e\.path;/, 'file paths must be set via textContent');
  assert.match(source, /body\.textContent = payload;/, 'transcript payloads must be set via textContent');
  assert.match(source, /pre\.textContent = JSON\.stringify\(payload\.input/, 'tool input must be set via textContent');
});

test('the escape-only convention helper is gone, so no sink can quietly depend on it', () => {
  assert.equal(source.match(/function escapeHtml/), null, 'escapeHtml must stay removed');
});
