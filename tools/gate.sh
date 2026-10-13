#!/usr/bin/env bash
# tools/gate.sh - aifocus's gate. Run by fleet-check (CHECK_CMD and CHECK_FAST_CMD) and by `npm test`.
#
# Three mechanical signals, in order, so a failure names which one broke:
#   1. the site still compiles (`hugo --minify`): broken frontmatter, template errors, bad shortcodes;
#   2. no oversized asset was added - `static/` is published byte-for-byte (tools/asset-size-check.sh);
#   3. automated tests pass (`node --test tests/*.test.mjs`).
#
# The whole gate is a few seconds on this VM and there is no deeper tier to reach for:
# the fast tier runs exactly this. That deviation from docs/speed.md R2 is deliberate,
# dated and measured in tools/check.conf.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run build
bash tools/asset-size-check.sh
node --test tests/*.test.mjs

echo "gate: OK - the site builds, asset check passed, and unit tests passed"
