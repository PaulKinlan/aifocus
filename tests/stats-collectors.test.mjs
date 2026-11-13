// Tests for the stats collectors' guards (aifocus-waix and its findings).
//
// The gate was green through four defects in tools/stats/ because nothing in it
// ran a collector: build.py --check only reads already-committed CSVs, so a
// range check that rejected every real row (aifocus-ty1k), an unvalidated share
// that published NaN (aifocus-09r5), a data error swallowed by the retry loop
// (aifocus-fi9t) and an uncapped error-body read (aifocus-dv21) were all
// invisible. This file drives the real collector functions against crafted
// third-party responses - no network, no credentials, no temp files outside the
// case's own directory - so those guards fail here instead of in review.
//
// The cases live in tests/helpers/stats-collectors-probe.py because the
// collectors are Python; this file is the gate-side runner. Verified against the
// pre-fix tip f3c694d: the four finding cases fail there and pass here.
//
// The common/w3techs/chromestatus cap cases and the split token/spend share
// cases came from aifocus-r6mb: the probe only drove collect-github.py, which
// inlines its own read(MAX+1) check, so the shared fetch_capped() could lose its
// cap with the probe still green. Each of those mutants now fails here.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROBE = "tests/helpers/stats-collectors-probe.py";

// Every case the probe knows. Listed here so a case that silently stops running
// (renamed, dropped from the probe's table) is a failure, not a smaller suite.
const CASES = [
  "common-over-cap-body-refused",
  "common-read-is-bounded",
  "common-accepts-body-at-cap",
  "common-rejects-non-numeric",
  "common-rejects-non-finite",
  "common-rejects-boolean",
  "common-range-bounds",
  "httparchive-accepts-origin-counts",
  "httparchive-rejects-nan",
  "httparchive-rejects-negative",
  "w3techs-accepts-monthly-share",
  "w3techs-rejects-impossible-share",
  "w3techs-over-cap-body-refused",
  "chromestatus-accepts-weekly-mean",
  "chromestatus-rejects-impossible-day-percentage",
  "chromestatus-over-cap-body-refused",
  "openrouter-rejects-hostile-token-shares",
  "openrouter-rejects-hostile-spend-shares",
  "openrouter-accepts-real-shares",
  "openrouter-rejects-window-days",
  "openrouter-accepts-chart-tokens",
  "openrouter-rejects-hostile-chart-tokens",
  "openrouter-chart-epoch-and-window-edges",
  "openrouter-main-csv-and-dispatch",
  "model-gap-accepts-releases-and-features",
  "model-gap-rejects-bad-milestone-or-date",
  "model-gap-rejects-bad-chromestatus-feature",
  "model-gap-over-cap-body-refused",
  "model-halflife-accepts-and-dedups-drops",
  "model-halflife-rejects-hostile-created",
  "model-halflife-over-cap-body-refused",
  "github-data-error-not-retried",
  "github-over-cap-body-refused",
  "github-error-body-is-capped",
  "github-happy-path",
  "github-network-error-still-retries",
  // the probe's own guard: an unknown case exits 2 rather than passing empty
  "unknown-case-refused",
];

test("stats collectors: every guard case holds", () => {
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
  // The whole probe is one process (~0.15 s measured); anything near the
  // 120 s bound means a case is sleeping for real instead of on the stub.
  assert.ok(Date.now() - started < 60_000, "the probe took a path that sleeps");
});
