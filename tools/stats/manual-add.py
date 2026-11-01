#!/usr/bin/env python3
"""
tools/stats/manual-add.py - append a hand-read figure to a manual series and rebuild.

    python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React live sites" 58200000
    python3 tools/stats/manual-add.py react-builtwith "BuiltWith: React in top 1m" 171000 --note "read 1 Nov 2026"
    python3 tools/stats/manual-add.py react-builtwith --list      # tool names and the page to read
    python3 tools/stats/manual-add.py react-builtwith --paste < page.txt   # or paste the page text on stdin

--paste reads the text of https://trends.builtwith.com/javascript/React (select
all, copy, paste) and pulls out the live-sites and top-1m figures itself.

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
    ap.add_argument("--paste", action="store_true", help="read the BuiltWith page text on stdin and extract the figures")
    ap.add_argument("--no-build", action="store_true")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "manual":
        sys.exit(f"{args.series} is not a manual series; manual ones: " + ", ".join(s["id"] for s in config["series"] if s.get("kind") == "manual"))
    tools = {t["name"]: t for t in series["tools"]}
    if args.paste:
        text = sys.stdin.read()
        found = extract_builtwith(text)
        if not found:
            sys.exit("no figures found in the pasted text; expected lines like '55,123,456 live websites' and 'Top 1m: 165,432'")
        for tool, value in found.items():
            if tool not in tools:
                continue
            append(series, tools, tool, value, args)
        if not args.no_build:
            build()
        return
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
    append(series, tools, args.tool, value, args)
    if not args.no_build:
        build()


def append(series, tools, tool, value, args):
    method = tools[tool].get("method", "")
    url = args.url or (("https://" + method) if "." in method and " " not in method else method)
    path = os.path.join(DATA_DIR, series["file_prefix"] + ".csv")
    with open(path, "a", encoding="utf-8", newline="") as f:
        csv.writer(f).writerow([tool, args.date, args.date, "snapshot", value, url, args.note])
    print(f"appended {tool} = {value:,} at {args.date} to {os.path.relpath(path, ROOT)}")


def build():
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "stats", "build.py"), "--quiet"], check=True)


NUM = r"([0-9][0-9,]{2,})"


def extract_builtwith(text):
    """Pull the BuiltWith trends figures out of pasted page text."""
    import re
    flat = re.sub(r"\s+", " ", text)
    out = {}
    m = (re.search(NUM + r"\s*(?:live|currently live)\b", flat, re.I)
         or re.search(r"\blive (?:web)?sites?\D{0,40}?" + NUM, flat, re.I))
    if m:
        out["BuiltWith: React live sites"] = int(m.group(1).replace(",", ""))
    m = (re.search(r"top 1(?:m|,000,000| million)\b[^0-9]{0,60}?" + NUM, flat, re.I)
         or re.search(NUM + r"[^0-9]{0,40}?\btop 1(?:m|,000,000| million)\b", flat, re.I))
    if m:
        out["BuiltWith: React in top 1m"] = int(m.group(1).replace(",", ""))
    return out


if __name__ == "__main__":
    main()
