#!/usr/bin/env python3
"""
tools/stats/collect-w3techs.py - monthly share of websites using a JavaScript
library, from W3Techs' public history table, as a run CSV for build.py.

    python3 tools/stats/collect-w3techs.py --series react-w3techs

No credentials; one request:
https://w3techs.com/technologies/history_overview/javascript_library/all
The table has one column per month for the trailing year (readings taken on the
1st of the month) and one row per library. A reading on the 1st describes the
previous month, so it is stored against that month. W3Techs surveys the top ten
million sites by traffic, so this is a share, not a count of every domain.
Tool names in series.json must match the row labels on the page (e.g. "React").
"""

import argparse
import calendar
import csv
import html
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
URL = "https://w3techs.com/technologies/history_overview/javascript_library/all"
MONTHS = {m: i for i, m in enumerate(calendar.month_abbr) if m}


def fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "aifoc.us-stats/1 (+https://aifoc.us/stats/)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


def parse(page):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    rows = [r for r in re.split(r"<tr[^>]*>", text) if r.strip()]
    header, year = None, None
    for r in rows:
        cells = [html.unescape(re.sub(r"<[^>]+>", " ", c)).strip() for c in re.split(r"<t[hd][^>]*>", r)[1:]]
        if header is None:
            # the header row holds "2025 1 Nov", "1 Dec", "2026 1 Jan", ...
            cols = []
            for c in cells:
                m = re.search(r"(?:(\d{4})\D*)?1 ([A-Z][a-z]{2})", c)
                if not m:
                    continue
                if m.group(1):
                    year = int(m.group(1))
                if year is None or m.group(2) not in MONTHS:
                    continue
                cols.append(date(year, MONTHS[m.group(2)], 1))
            if len(cols) >= 6:
                header = cols
            continue
        if len(cells) >= len(header) + 1 and all(c.endswith("%") for c in cells[1:len(header) + 1]):
            yield cells[0], [(d, float(v.rstrip("%"))) for d, v in zip(header, cells[1:len(header) + 1])]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--run-date")
    args = ap.parse_args()
    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "w3techs":
        sys.exit(f"{args.series} is not a w3techs series")
    run_date = args.run_date or date.today().isoformat()
    wanted = {t["name"] for t in series["tools"]}
    found = {name: vals for name, vals in parse(fetch()) if name in wanted}
    missing = wanted - set(found)
    if missing:
        print(f"warning: rows not on the page: {', '.join(sorted(missing))}", file=sys.stderr)
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    n = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        for name, vals in found.items():
            for reading, pct in vals:
                # a reading on the 1st describes the month that just ended
                y, m = (reading.year, reading.month - 1) if reading.month > 1 else (reading.year - 1, 12)
                start = date(y, m, 1)
                end = date(y, m, calendar.monthrange(y, m)[1])
                w.writerow([name, start.isoformat(), end.isoformat(), "monthly", pct, URL, json.dumps({"read_on": reading.isoformat()})])
                n += 1
    print(f"wrote {n} monthly rows ({', '.join(found)}) to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
