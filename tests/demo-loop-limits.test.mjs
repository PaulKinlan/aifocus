import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const demoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/where-prompts-run-demo/demo.js');
const source = fs.readFileSync(demoPath, 'utf8').split('// ─── UI wiring ───────────────────────────────────────────────────────')[0];

function harness(batches, result) {
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: demoPath });
  context.batches = batches;
  context.result = result;
  vm.runInContext(`
    let calls = 0;
    runTool = async () => { calls++; return result; };
    PROVIDERS.test = {
      init: () => ({}),
      step: async () => batches.shift() ?? { textBlocks: [], toolUses: [], done: true },
      appendResults: () => {},
    };
    globalThis.getCalls = () => calls;
  `, context);
  return { run: vm.runInContext('runLoop', context), calls: context.getCalls };
}

const use = (id) => ({ id: String(id), name: 'opfs_read', input: { path: 'entry.md' } });
const batch = (count) => ({ textBlocks: [], toolUses: Array.from({ length: count }, (_, i) => use(i)), done: false });

async function eventsFor(h) {
  const events = [];
  await h.run({ providerId: 'test', apiKey: '', model: '', system: '', userMessage: '', onEvent: (e) => events.push(e) });
  return events;
}

test('over-limit step executes first eight calls, then reports dropped work', async () => {
  const h = harness([batch(9)], 'ok');
  const events = await eventsFor(h);
  assert.equal(h.calls(), 8);
  assert.equal(events.filter((e) => e.type === 'tool_result').length, 8);
  assert.match(events.find((e) => e.type === 'limit').reason, /1 call\(s\) dropped \(completed calls kept\)/);
});

test('exactly eight small calls are allowed, then the next response ends normally', async () => {
  const h = harness([batch(8)], 'ok');
  const events = await eventsFor(h);
  assert.equal(h.calls(), 8);
  assert.equal(events.some((e) => e.type === 'limit'), false);
});

test('oversize result stops without putting the full result into an event', async () => {
  const h = harness([batch(1)], 'x'.repeat(32769));
  const events = await eventsFor(h);
  assert.equal(h.calls(), 1);
  assert.ok(events.find((e) => e.type === 'tool_result').result.length <= 500);
  assert.match(events.find((e) => e.type === 'limit').reason, /32768 characters/);
});

test('result budget accumulates across steps', async () => {
  const h = harness([batch(1), batch(1)], 'x'.repeat(20000));
  const events = await eventsFor(h);
  assert.equal(h.calls(), 2);
  assert.match(events.find((e) => e.type === 'limit').reason, /tool results exceeded/);
  assert.equal(events.filter((e) => e.type === 'tool_result')[1].result.length, 500);
});

test('oversized text shows a bounded prefix and reports unprocessed calls', async () => {
  const h = harness([{ textBlocks: ['x'.repeat(40000)], toolUses: [use(1)], done: false }], 'ok');
  const events = await eventsFor(h);
  assert.equal(events.find((e) => e.type === 'text').text.length, 32768);
  assert.equal(h.calls(), 0);
  assert.match(events.find((e) => e.type === 'limit').reason, /at least 7232 characters and 1 tool call\(s\) were not processed/);
});

test('model text budget accumulates across steps without blocking normal short replies', async () => {
  const h = harness([
    { textBlocks: ['x'.repeat(20000)], toolUses: [use(1)], done: false },
    { textBlocks: ['y'.repeat(20000)], toolUses: [], done: true },
  ], 'ok');
  const events = await eventsFor(h);
  assert.equal(h.calls(), 1);
  assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text.length).reduce((a, b) => a + b), 32768);
  assert.match(events.find((e) => e.type === 'limit').reason, /model text exceeded/);
});
