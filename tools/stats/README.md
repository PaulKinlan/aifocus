# /stats/ — re-measured figures from the essays

`/stats/` shows the numbers that essays on aifoc.us depend on, re-measured each
month and placed next to the figure as it was written. This directory holds the
collectors and the compile step; the page itself is `content/stats.md` +
`layouts/stats/page.html` + `assets/js/stats-page.js`.

## Files

| Path | Role |
|------|------|
| `tools/stats/series.json` | What is tracked: each series' source, granularity, tools and queries, the posts it comes from and the figures as written in them (`claims`). Edit this to add a series, a tool or a claim. |
| `tools/stats/collect-github.py` | Incremental GitHub Search collector (commits, PRs, PR interactions, issue comments). |
| `tools/stats/collect-chromestatus.py` | Chrome Platform Status use-counter collector (service worker page loads). |
| `tools/stats/collect-httparchive.py` | HTTP Archive tech report collector (React origins, monthly, from `cdn.httparchive.org/v1`). |
| `tools/stats/collect-openrouter.py` | OpenRouter collector: weekly token totals from the rankings chart and the task-category shares. |
| `tools/stats/collect-w3techs.py` | W3Techs collector: share of all websites using React, monthly for the trailing year. |
| `tools/stats/manual-add.py` | Appends one hand-read figure to a manual series and rebuilds (`--list` shows what to read). |
| `tools/stats/build.py` | Merges every run CSV into `data/stats.json` and prints the change report. |
| `tools/stats/update.sh` | Runs all of the above for one monthly update. |
| `static/data/<series>-<date>.csv` | One file per collection run, published as-is so readers can download it. The originals from the March 2026 post are the first runs. |
| `static/data/manual/*.csv` | Hand-kept snapshots: BuiltWith (bot check blocks scripts) and the frozen OpenRouter programming readings the essays quoted. |
| `data/stats.json` | Compiled output read by the Hugo layout. Generated; commit it with the CSVs. |

## Monthly routine (1st of the month)

```bash
cd ~/Code/aifocus
bash tools/stats/update.sh            # ~30-60 min, mostly waiting on GitHub rate limits
```

Then:

1. Read the change report it prints (or `STATS_REPORT=... ` to keep it). Each
   series lists the latest complete period, the change against a month earlier,
   any earlier weeks GitHub has revised by 5% or more since the previous run,
   and every figure-as-written with its current value.
2. Refresh BuiltWith if you have two minutes: open
   https://trends.builtwith.com/javascript/React in a browser and run
   `python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React live sites" <n>`
   and the same for `"BuiltWith: React in top 1m"`; it appends the rows and rebuilds.
   (`openrouter-programming.csv` is frozen: the ranking it came from is gone.)
3. `npm test` (build, asset ratchet, unit tests, link check), look at
   `/stats/` with `npm run dev`, and commit `static/data/*.csv`,
   `static/data/manual/*.csv` and `data/stats.json` together.
4. If a figure in an essay has drifted enough to mislead, update the essay and
   add or adjust the `claims` entry in `series.json` so the page keeps showing
   what was written.

The journal has a wrapper and a systemd timer for step 0 (running the
collectors unattended on the 1st): `~/journal/scripts/aifocus-stats-monthly.sh`
and `~/journal/scripts/systemd/aifocus-stats-monthly.timer`. The wrapper writes
the report to `~/journal/reports/aifocus-stats-<date>.md`; the review and the
commit stay manual.

## How the GitHub collector stays cheap

- Weekly series run from a fixed Monday epoch so buckets line up across runs.
- Only periods that are missing from `data/stats.json` are queried, plus the
  last `resample` complete periods again (GitHub's `total_count` keeps settling
  for weeks after the fact). `--full` re-measures everything.
- `ai-commits` takes two samples per period and keeps the median; the other
  series take one.
- Tools marked `"track": false` in `series.json` keep their historical rows
  but are not re-measured (the minor trailers from the March 2026 post).
- Progress checkpoints to `~/.cache/aifocus-stats/<series>-<date>.json`, so an
  interrupted run resumes.
- The compiled file keeps every run's value per period under `runs`, and the
  latest run wins, so a revision is visible in the data rather than silently
  overwritten.

## Adding a series

1. Add an entry to `series.json`. `kind` is `github-search` (set `search`,
   `date_field`, `granularity`, `epoch`, `tools[].query`), `chromestatus`
   (`bucket_id`), or `manual` (a CSV under `static/data/manual/`).
2. Give the tools you want on the chart a `slot` (1-8; colour follows the
   slot), or set `chart_top` to pick the top N by latest value.
3. Add `claims` for the figures the essay states, with the period they refer to.
   Set `"cumulative": false` on a series whose values are levels (origins, a
   share) rather than counts per period, so no running total is shown.
   Set `"show_partial": false` to leave incomplete periods out of the chart,
   table and derived series instead of drawing them as hollow points (the
   row stays in the CSV; `total-commits` does this because a five-day week
   reads as a collapse next to full weeks).
4. Run the collector (or write the manual CSV), then `python3 tools/stats/build.py`.

## Sources that still need a hand

- **BuiltWith** has no free API and the trends page sits behind an image
  puzzle, so `curl` and fetch tools get a "BuiltWith verification" page, and the
  Wayback Machine has no copies after October 2025. Read the two numbers in a
  browser and add them with `manual-add.py`. W3Techs (`collect-w3techs.py`) is
  the automated stand-in: a share of the top 10 million sites rather than a
  count of all domains, so it tracks the trend, not the BuiltWith total.
- **OpenRouter programming figures**: the per-category model ranking
  (`/rankings/programming`, later `/rankings?category=programming`) that the
  token essays quoted no longer exists; the frontend API ignores `category`.
  `collect-openrouter.py` tracks the all-traffic weekly total from the rankings
  chart plus the code share from OpenRouter's task classifier, and derives a
  programming estimate from the two. For daily history back to 2025-01-01 use
  OpenRouter's Data API (`/api/v1/datasets/rankings-daily`), which needs an
  OpenRouter API key; the collector does not use it.
- **HTTP Archive**: `api.httparchive.org` no longer resolves; the report reads
  from `cdn.httparchive.org/v1`, which `collect-httparchive.py` uses. Other
  technologies (the CMS numbers in whither-cms, for instance) are one more
  series entry each with `"kind": "httparchive"`.
- **Model release dates** (`static/model-drops.tsv`) and **model cutoffs**
  (`static/model-gap.json`) are curated by hand and are not on this page; the
  monthly routine is a good time to check them too.
