#!/usr/bin/env python3
"""
tools/stats/collect-httparchive.py - monthly technology adoption from the HTTP
Archive tech report, written as a run CSV for tools/stats/build.py.

    python3 tools/stats/collect-httparchive.py --series react-httparchive

No credentials. One request per (technology, rank) pair:
https://cdn.httparchive.org/v1/adoption?technology=<name>&geo=ALL&rank=<rank>
(the host the tech report at httparchive.org/reports/techreport reads from;
api.httparchive.org no longer resolves). Each response is the whole monthly
history since 2020 with desktop and mobile origin counts, so every run rewrites
the full series and earlier months stay comparable with the report.

Series config (tools/stats/series.json):
  "kind": "httparchive", "technology": "React", "granularity": "monthly",
  tools[].rank = "ALL" | "Top 1M" | "Top 100k" | ..., tools[].client = "mobile" | "desktop"
"""

import argparse
import calendar
import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
API = "https://cdn.httparchive.org/v1/adoption"


def fetch(technology, rank):
    q = urllib.parse.urlencode({"technology": technology, "geo": "ALL", "rank": rank})
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": "aifoc.us-stats/1 (+https://aifoc.us/stats/)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--run-date")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "httparchive":
        sys.exit(f"{args.series} is not an httparchive series")

    run_date = args.run_date or date.today().isoformat()
    technology = series["technology"]
    epoch = datetime.strptime(series.get("epoch", "2020-01-01"), "%Y-%m-%d").date()
    report = f"https://httparchive.org/reports/techreport/tech?tech={urllib.parse.quote(technology)}"
    cache = {}
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    rows = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        for tool in series["tools"]:
            rank = tool.get("rank", "ALL")
            if rank not in cache:
                cache[rank] = sorted(fetch(technology, rank), key=lambda p: p["date"])
            for p in cache[rank]:
                d = datetime.strptime(p["date"], "%Y-%m-%d").date()
                if d < epoch:
                    continue
                v = (p.get("adoption") or {}).get(tool.get("client", "mobile"))
                if v is None:
                    continue
                end = d.replace(day=calendar.monthrange(d.year, d.month)[1])
                w.writerow([tool["name"], d.isoformat(), end.isoformat(), "monthly", int(v), report, 1])
                rows += 1
    print(f"wrote {rows} monthly rows ({technology}) to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
