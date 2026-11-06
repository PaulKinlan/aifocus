#!/usr/bin/env bash
# tools/gate.sh - aifocus's gate. Run by fleet-check (CHECK_CMD and CHECK_FAST_CMD) and by `npm test`.
#
# Six mechanical signals, in order, so a failure names which one broke:
#   1. the site still compiles (`hugo --minify`): broken frontmatter, template errors, bad shortcodes;
#   2. no oversized asset was added - `static/` is published byte-for-byte (tools/asset-size-check.sh);
#   3. automated tests pass (`node --test tests/*.test.mjs`);
#   4. every internal link in the built site resolves to a generated path (tools/link-check.mjs).
#      This one reads the OUTPUT, not the change: a link can be wrong in a way no diff shows,
#      which is how aifocus-8mx shipped a live 404 through a green gate.
#   5. the published stats document is in sync with its sources
#      (python3 tools/stats/build.py --check; measured cold in tools/check.conf, aifocus-3wi).
#      This one also reads the committed data, not the change: the checker used to false-fail
#      daily (aifocus-6xz) and an unrun check is the same as no check.
#   6. the CSP's script-src hash list matches the inline scripts the build produced
#      (node tools/csp-hashes.mjs --check, aifocus-5wrp). script-src no longer allows
#      'unsafe-inline', so an inline script without a hash is BLOCKED by the browser:
#      this signal turns that silent breakage into a gate failure naming the fix.
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
python3 tools/stats/build.py --check
node tools/csp-hashes.mjs --check

echo "gate: OK - the site builds, asset check passed, unit tests passed, every internal link resolves, data/stats.json is in sync, and script-src pins every inline script"
