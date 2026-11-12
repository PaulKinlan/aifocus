// Tests for tools/stats/manual-add.py, the hand-read figure appender (aifocus-ejut).
//
// manual-add.py is the only stats tool that turns text a human pasted into a
// published figure: --paste pulls the BuiltWith live-sites and top-1m numbers
// out of copied page text, then appends a row to static/data/manual/<prefix>.csv,
// which build.py publishes on /stats/. Nothing in the gate touched it - the
// collector probe drives the collectors, the stats-build probe drives build.py,
// and grep found no reference to manual-add or extract_builtwith in tests/ - so
// a regex fallback that stopped matching real page text, a first append into a
// fresh series file with no header (which makes build.py's csv.DictReader read
// the first DATA row as the header), and a value coercion that raised a bare
// ValueError traceback were all invisible.
//
// The cases live in tests/helpers/manual-add-probe.py because the tool is
// Python; this file is the gate-side runner. The probe is offline by
// construction: CONFIG and DATA_DIR point at a scratch directory, stdin is
// stubbed for --paste, and build() is replaced by a recorder so no case spawns
// build.py.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROBE = "tests/helpers/manual-add-probe.py";

// Every case the probe knows. Listed here so a case that silently stops running
// (renamed, dropped from the probe's table) is a failure, not a smaller suite.
const CASES = [
  "extract-forward-live-sites",
  "extract-currently-live",
  "extract-reversed-live-sites",
  "extract-collapses-whitespace",
  "extract-top-1m-forward",
  "extract-top-1m-reversed",
  "extract-top-million-forms",
  "extract-both-figures",
  "extract-no-match-is-empty",
  "append-url-defaults-to-https",
  "append-url-kept-verbatim",
  "append-url-override-wins",
  "append-row-matches-published-header",
  "append-new-file-gets-header",
  "main-paste-skips-unknown-tools",
  "main-paste-no-figures-exits-clean",
  "main-value-accepts-separators",
  "main-value-keeps-fraction",
  "main-value-not-a-number-exits-clean",
  "main-value-rejects-non-finite",
  "main-rejects-non-manual-series",
  "main-rejects-unknown-tool",
  "main-list-does-not-write",
  "main-builds-by-default",
  "main-no-build-skips-build",
  // the probe's own guard: an unknown case exits 2 rather than passing empty
  "unknown-case-refused",
];

test("manual-add: every extraction and append case holds", () => {
  const started = Date.now();
  const out = execFileSync("python3", ["-B", PROBE, "all"], {
    cwd: ROOT,
    encoding: "utf8",
    // -B already stops .pyc writes; the env var keeps a stray import from
    // littering tools/stats/__pycache__ in a worktree the gate reads.
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    timeout: 120_000,
  });
  const passed = out.split("\n").filter((line) => line.startsWith("OK ")).map((line) => line.slice(3));
  assert.deepEqual(passed.sort(), [...CASES].sort(), `probe reported: ${JSON.stringify(passed)}`);
  // The whole probe is one process; anything near the bound means a case is
  // doing real work (spawning build.py, waiting on a file) instead of a fixture.
  assert.ok(Date.now() - started < 60_000, "the probe took a path that spawns or waits");
});
