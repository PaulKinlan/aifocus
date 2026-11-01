#!/usr/bin/env python3
"""
tools/stats/collect-openrouter.py - weekly token totals and task-category shares
from the OpenRouter rankings pages, written as run CSVs for tools/stats/build.py.

    python3 tools/stats/collect-openrouter.py --series openrouter-tokens
    python3 tools/stats/collect-openrouter.py --series openrouter-task-share

No credentials: both calls are the unauthenticated endpoints the public
rankings page (https://openrouter.ai/rankings) reads.

  kind "openrouter-chart"  GET /api/frontend/v1/rankings/model-rankings-chart?view=week
      One point per Monday-to-Sunday week for the trailing year: the top ten
      models plus an "Others" bucket, in tokens. The series value is the sum,
      i.e. every token routed through OpenRouter that week. A second tool,
      "Programming tokens per week (estimate)", multiplies each complete week
      that ends inside the trailing 30 days by the code share below; OpenRouter
      dropped the per-category model ranking that the essays quoted, so this is
      the nearest thing to it that can still be measured.
  kind "openrouter-task-share"  GET /api/frontend/v1/rankings/task-spend
      Share of tokens and of spend by task macro-category (code, agent, data,
      general) over the trailing 30 days, stored as percentages with one row per
      run (period = the 30-day window).

OpenRouter's own Data API (https://openrouter.ai/docs/cookbook/administration/data-api)
has daily history back to 2025-01-01 but needs an API key; it is not used here.
"""

import argparse
import csv
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
BASE = "https://openrouter.ai/api/frontend/v1/rankings"
PAGE = "https://openrouter.ai/rankings?view=week"
UA = "aifoc.us-stats/1 (+https://aifoc.us/stats/)"


def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def code_share(task_spend, which):
    cats = task_spend["data"][which]["macroCategories"]
    row = next(c for c in cats if c["key"] == "code")
    # the field is called spendShare under both "tokens" and "spend"
    return float(row.get("spendShare", row.get("share", 0))), int(task_spend["data"][which].get("windowDays", 30))


def chart_rows(series, run_date, task_spend):
    chart = get("/model-rankings-chart?view=week")
    points = sorted(chart["data"]["data"], key=lambda p: p["x"])
    epoch = datetime.strptime(series.get("epoch", "2025-10-27"), "%Y-%m-%d").date()
    rd = datetime.strptime(run_date, "%Y-%m-%d").date()
    share, window = code_share(task_spend, "tokens")
    window_start = rd - timedelta(days=window)
    rows = []
    for p in points:
        start = datetime.strptime(p["x"], "%Y-%m-%d").date()
        if start < epoch:
            continue
        end = start + timedelta(days=6)
        total = int(round(sum(float(v) for v in p["ys"].values())))
        rows.append(["All tokens per week", start.isoformat(), end.isoformat(), "weekly", total, PAGE,
                     json.dumps({"models": len(p["ys"]) - (1 if "Others" in p["ys"] else 0), "others": int(round(float(p["ys"].get("Others", 0))))})])
        if start >= window_start and end < rd:
            rows.append(["Programming tokens per week (estimate)", start.isoformat(), end.isoformat(), "weekly",
                         int(round(total * share)), "https://openrouter.ai/rankings#task-spend",
                         json.dumps({"code_token_share": round(share, 4), "window_days": window})])
    return rows


def share_rows(series, run_date, task_spend):
    rd = datetime.strptime(run_date, "%Y-%m-%d").date()
    rows = []
    for which, label in (("tokens", "tokens"), ("spend", "spend")):
        block = task_spend["data"][which]
        window = int(block.get("windowDays", 30))
        end = rd - timedelta(days=1)  # one snapshot per run, dated the last day of the window
        for cat in block["macroCategories"]:
            rows.append([f"{cat['label']} share of {label} (30 days)", end.isoformat(), end.isoformat(), "snapshot",
                         round(float(cat.get("spendShare", cat.get("share", 0))) * 100, 2),
                         "https://openrouter.ai/rankings#task-spend", json.dumps({"window_days": window})])
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--run-date")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    kind = (series or {}).get("kind", "")
    if not series or not kind.startswith("openrouter"):
        sys.exit(f"{args.series} is not an openrouter series")

    run_date = args.run_date or date.today().isoformat()
    task_spend = get("/task-spend")
    rows = chart_rows(series, run_date, task_spend) if kind == "openrouter-chart" else share_rows(series, run_date, task_spend)
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
