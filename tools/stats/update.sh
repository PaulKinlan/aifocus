#!/usr/bin/env bash
# tools/stats/update.sh - the monthly re-measure behind /stats/.
#
# Run it on the 1st of the month (by hand, or from the journal timer in
# ~/journal/scripts/aifocus-stats-monthly.sh). It:
#   1. pulls the no-auth sources: Chrome Status (service workers), the HTTP
#      Archive tech report (React) and OpenRouter (tokens, task shares);
#   2. runs the incremental GitHub Search collectors (needs `gh auth login` or
#      GITHUB_TOKEN): only periods that are missing, plus the last few again;
#   3. recompiles data/stats.json and prints the change report, which is the
#      thing to read before deciding whether an essay needs a correction.
# It never commits. Review `git status`, the report and the page, then commit
# the new static/data/*.csv files together with data/stats.json.
#
#   bash tools/stats/update.sh                       # everything
#   STATS_SERIES="total-commits" bash tools/stats/update.sh
#   STATS_REPORT=/path/report.md bash tools/stats/update.sh
#   bash tools/stats/update.sh --dry-run             # list the GitHub queries only
#
# Commit-search rate limits make the GitHub part slow: budget ~10 minutes per
# 50 queries. The run checkpoints to ~/.cache/aifocus-stats/, so an interrupted
# run resumes where it stopped.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
RUN_DATE="${STATS_RUN_DATE:-$(date +%F)}"
SERIES="${STATS_SERIES:-total-commits ai-commits ai-prs ai-pr-interactions ai-issue-comments}"
DRY=""
for arg in "$@"; do [ "$arg" = "--dry-run" ] && DRY="--dry-run"; done

echo "== stats update $RUN_DATE"
if [ -z "$DRY" ]; then
  python3 -I tools/stats/collect-chromestatus.py --series service-worker-page-loads --run-date "$RUN_DATE" || echo "chromestatus collector failed; continuing"
  python3 -I tools/stats/collect-httparchive.py --series react-httparchive --run-date "$RUN_DATE" || echo "httparchive collector failed; continuing"
  python3 -I tools/stats/collect-w3techs.py --series react-w3techs --run-date "$RUN_DATE" || echo "w3techs collector failed; continuing"
  for s in openrouter-tokens openrouter-task-share; do
    python3 -I tools/stats/collect-openrouter.py --series "$s" --run-date "$RUN_DATE" || echo "openrouter collector ($s) failed; continuing"
  done
fi
for s in $SERIES; do
  echo "== $s"
  python3 -I tools/stats/collect-github.py --series "$s" --run-date "$RUN_DATE" "$@"
done
[ -n "$DRY" ] && exit 0

python3 -I tools/stats/build.py ${STATS_REPORT:+--report "$STATS_REPORT"}

cat <<MSG

Manual series (edit the CSV, then re-run: python3 tools/stats/build.py):
  react-builtwith: read trends.builtwith.com/javascript/React in a browser (bot check blocks scripts), then
    python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React live sites" <n>
    python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React in top 1m" <n>
  static/data/manual/openrouter-programming.csv  frozen: the per-category ranking it came from is gone; see openrouter-tokens

Changed files:
MSG
git status --short static/data data/stats.json
