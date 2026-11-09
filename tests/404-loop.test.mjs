// The 404 game's WebMCP restart must keep exactly one animation chain, even
// when a previous run ended on the immediately preceding frame.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const html = readFileSync(fileURLToPath(new URL("../layouts/404.html", import.meta.url)), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "404 game script is missing");

function harness() {
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, {
    get: (target, key) => target[key] ?? (() => {}),
    set: (target, key, value) => ((target[key] = value), true),
  });
  const element = () => ({
    style: {}, textContent: "", children: [], addEventListener() {},
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    getBoundingClientRect: () => ({ width: 800, height: 240 }),
    getContext: () => context,
  });
  const nodes = Object.fromEntries(["ai404", "overlay", "ovTitle", "ovMsg", "startBtn", "score"].map((id) => [id, element()]));
  const tools = {};
  const pending = new Map();
  let id = 0;
  let now = 1000;
  const sandbox = {
    document: {
      getElementById: (key) => nodes[key],
      createElement: () => element(),
      modelContext: { registerTool: (tool) => { tools[tool.name] = tool; } },
    },
    navigator: {},
    window: { matchMedia: () => ({ matches: false }), addEventListener() {}, devicePixelRatio: 1 },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) { pending.set(++id, callback); return id; },
    cancelAnimationFrame(frameId) { pending.delete(frameId); },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
  };
  vm.runInNewContext(script, sandbox, { filename: "404-game.js" });
  return {
    nodes, tools, pending,
    step() {
      now += 1000 / 60;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(now);
      return callbacks.length;
    },
  };
}

test("restarting the 404 game before or after game-over never stacks animation frames", async () => {
  const game = harness();
  const restart = async () => game.tools.game_restart.execute({});
  for (let n = 0; n < 3; n++) await restart();
  assert.equal(game.pending.size, 1, "repeated restarts while running queue just one frame");
  for (let n = 0; n < 8; n++) assert.equal(game.step(), 1);

  for (let n = 0; n < 3000 && game.nodes.ovTitle.textContent !== "Game over"; n++) game.step();
  assert.equal(game.nodes.ovTitle.textContent, "Game over", "the obstacle must end the run");
  assert.equal(game.pending.size, 0, "game-over does not leave a drain callback");

  await restart();
  assert.equal(game.pending.size, 1, "game-over restart queues one frame");
  for (let n = 0; n < 10; n++) assert.equal(game.step(), 1, "only one frame executes per tick");
  await restart();
  assert.equal(game.pending.size, 1, "another restart still queues one frame");
});
