#!/usr/bin/env python3
"""
tools/stats/collect-chromestatus.py - weekly means of a Chrome Platform Status
use-counter timeline, written as a run CSV for tools/stats/build.py.

    python3 tools/stats/collect-chromestatus.py --series service-worker-page-loads

No credentials. One request per series:
https://chromestatus.com/data/timeline/featurepopularity?bucket_id=<id>
Values are day_percentage (a fraction of Chrome page loads) and are stored as a
percentage with three decimals, averaged over each complete Monday-Sunday week.
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--run-date")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "chromestatus":
        sys.exit(f"{args.series} is not a chromestatus series")

    run_date = args.run_date or date.today().isoformat()
    url = f"https://chromestatus.com/data/timeline/featurepopularity?bucket_id={series['bucket_id']}"
    req = urllib.request.Request(url, headers={"User-Agent": "aifoc.us-stats/1 (+https://aifoc.us/stats/)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8")
    # chromestatus prefixes some JSON responses with )]}' to defeat JSON hijacking.
    if body.startswith(")]}'"):
        body = body.split("\n", 1)[1]
    points = json.loads(body)
    if not points:
        sys.exit("empty timeline")
    name = points[0].get("property_name", series["primary"])
    by_day = {datetime.strptime(p["date"], "%Y-%m-%d").date(): float(p["day_percentage"]) for p in points}

    epoch = datetime.strptime(series["epoch"], "%Y-%m-%d").date()
    today = date.today()
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    rows = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        cur = epoch
        while cur + timedelta(days=6) < today:
            end = cur + timedelta(days=6)
            days = [by_day[d] for d in (cur + timedelta(days=i) for i in range(7)) if d in by_day]
            if days:
                mean_pct = round(sum(days) / len(days) * 100, 3)
                w.writerow([name, cur.isoformat(), end.isoformat(), "weekly", mean_pct,
                            f"https://chromestatus.com/metrics/feature/timeline/popularity/{series['bucket_id']}",
                            json.dumps(len(days))])
                rows += 1
            cur += timedelta(days=7)
    print(f"wrote {rows} weekly rows ({name}) to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
