#!/usr/bin/env python3
"""
tools/stats/manual-add.py - append a hand-read figure to a manual series and rebuild.

    python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React live sites" 58200000
    python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React in top 1m" 171000 --note "read 1 Nov 2026"
    python3 tools/stats/manual-add.py react-builtwith --list      # tool names and the page to read

The tool name must be one listed in tools/stats/series.json for that series.
Date defaults to today; the URL defaults to the tool's method field when it is a URL.
"""

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("series")
    ap.add_argument("tool", nargs="?")
    ap.add_argument("value", nargs="?")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--url")
    ap.add_argument("--note", default="")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--no-build", action="store_true")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "manual":
        sys.exit(f"{args.series} is not a manual series; manual ones: " + ", ".join(s["id"] for s in config["series"] if s.get("kind") == "manual"))
    tools = {t["name"]: t for t in series["tools"]}
    if args.list or not (args.tool and args.value):
        print(f"{series['title']} ({series['id']}), unit: {series.get('unit', '')}")
        for t in series["tools"]:
            print(f"  {t['name']!r:45} read from {t.get('method', '')}")
        return
    if args.tool not in tools:
        sys.exit(f"unknown tool {args.tool!r}; one of: " + ", ".join(tools))
    value = float(args.value.replace(",", "").replace("_", ""))
    if value.is_integer():
        value = int(value)
    method = tools[args.tool].get("method", "")
    url = args.url or (("https://" + method) if "." in method and " " not in method else method)
    path = os.path.join(DATA_DIR, series["file_prefix"] + ".csv")
    with open(path, "a", encoding="utf-8", newline="") as f:
        csv.writer(f).writerow([args.tool, args.date, args.date, "snapshot", value, url, args.note])
    print(f"appended {args.tool} = {value:,} at {args.date} to {os.path.relpath(path, ROOT)}")
    if not args.no_build:
        subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "stats", "build.py"), "--quiet"], check=True)


if __name__ == "__main__":
    main()
