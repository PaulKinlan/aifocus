#!/usr/bin/env bash
# tools/gate.sh - aifocus's gate. Run by fleet-check (CHECK_CMD and CHECK_FAST_CMD) and by `npm test`.
#
# Four mechanical signals, in order, so a failure names which one broke:
#   1. the site still compiles (`hugo --minify`): broken frontmatter, template errors, bad shortcodes;
#   2. no oversized asset was added - `static/` is published byte-for-byte (tools/asset-size-check.sh);
#   3. automated tests pass (`node --test tests/*.test.mjs`);
#   4. every internal link in the built site resolves to a generated path (tools/link-check.mjs).
#      This one reads the OUTPUT, not the change: a link can be wrong in a way no diff shows,
#      which is how aifocus-8mx shipped a live 404 through a green gate.
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
node tools/link-check.mjs

echo "gate: OK - the site builds, asset check passed, unit tests passed, and every internal link resolves"
