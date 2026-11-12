import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reporter = fileURLToPath(new URL("../tools/node-test-evidence.mjs", import.meta.url));

test("gate reporter attributes executed files, not skipped or failed-to-load files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aifocus-test-evidence-"));
  try {
    fs.mkdirSync(path.join(root, "tests"));
    fs.writeFileSync(path.join(root, "tests/ran.test.mjs"),
      'import test from "node:test"; test("actual case", () => {});\n');
    fs.writeFileSync(path.join(root, "tests/skipped.test.mjs"),
      'import test from "node:test"; test.skip("not run", () => {});\n');
    fs.writeFileSync(path.join(root, "tests/unloaded.test.mjs"), "this is invalid js syntax\n");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // this is a separate test-runner integration probe
    const run = spawnSync(process.execPath, ["--test", `--test-reporter=${reporter}`,
      "tests/ran.test.mjs", "tests/skipped.test.mjs", "tests/unloaded.test.mjs"],
    { cwd: root, env, encoding: "utf8", timeout: 15_000 });
    assert.equal(run.status, 1, `a parse failure must fail the gate: ${run.error || run.stderr}`);
    assert.match(run.stdout, /fast-gate: ran: tests\/ran\.test\.mjs/);
    assert.doesNotMatch(run.stdout, /fast-gate: ran: tests\/(?:skipped|unloaded)\.test\.mjs/);
    assert.match(run.stdout, /actual case/);
    assert.match(run.stdout, /SyntaxError/, "spec diagnostics must survive a failing file");
    assert.match(run.stdout, /ℹ fail 1/, "Node failure summary must survive the reporter");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
