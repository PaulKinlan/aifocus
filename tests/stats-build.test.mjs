// tools/stats/build.py --check compares output built by the same code, so it
// cannot detect wrong numbers. Exercise its transforms on independent CSVs.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("stats build: formatting, run merge, partial periods and derived claims", () => {
  const output = execFileSync("python3", ["-B", "tests/helpers/stats-build-probe.py", "-v"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    timeout: 10_000,
    // unittest writes its report to stderr; a non-zero exit throws.
  });
  assert.equal(output, "");
});
