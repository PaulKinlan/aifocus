#!/usr/bin/env python3
"""
tools/stats/collect-github.py - re-measure one GitHub Search series for /stats/.

Incremental by default: it reads the run CSVs already under static/data/, works
out which complete periods are missing since the series epoch, adds the last N
complete periods again (GitHub's total_count keeps settling for weeks), and only
queries those. Every run writes its own CSV under static/data/ with the same
columns as the originals (tool,period_start,period_end,granularity,total_count,
url,samples); tools/stats/build.py merges all runs, latest run winning.

    python3 tools/stats/collect-github.py --series ai-commits            # incremental
    python3 tools/stats/collect-github.py --series ai-commits --dry-run  # list the queries
    python3 tools/stats/collect-github.py --series ai-prs --full         # every period again
    python3 tools/stats/collect-github.py --series ai-commits --resample 8 --samples 2

Needs a GitHub token: GITHUB_TOKEN, GH_TOKEN, or `gh auth token`.
Checkpoints (resume after an interruption) live in ~/.cache/aifocus-stats/.
"""

import argparse
import calendar
import csv
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
CHECKPOINT_DIR = os.environ.get("STATS_CHECKPOINT_DIR", os.path.expanduser("~/.cache/aifocus-stats"))
SLEEP_PER_REQUEST = float(os.environ.get("STATS_SLEEP", "3.0"))


def log(msg):
    print(msg, flush=True)


def github_token():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token.strip()
    try:
        return subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"no GitHub token: set GITHUB_TOKEN or run `gh auth login` ({exc})")


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def periods(granularity, epoch, until):
    """Complete periods from epoch up to (not including) `until`."""
    out = []
    cur = parse_date(epoch)
    while True:
        if granularity == "weekly":
            end = cur + timedelta(days=6)
            nxt = cur + timedelta(days=7)
        elif granularity == "monthly":
            end = cur.replace(day=calendar.monthrange(cur.year, cur.month)[1])
            nxt = end + timedelta(days=1)
        else:
            raise SystemExit(f"unsupported granularity {granularity}")
        if end >= until:
            break
        out.append((cur.isoformat(), end.isoformat()))
        cur = nxt
    return out


def existing_complete(series):
    """{(tool, period_start)} already measured as a complete period in any run CSV."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build  # tools/stats/build.py: the same merge the page uses
    points, _runs = build.load_series(series)
    return {(tool, s) for tool, by_start in points.items() for s, p in by_start.items() if not p["partial"]}


def web_search_url(search, query):
    if search == "commits":
        kind = "commits"
    else:
        kind = "pullrequests" if "is:pr" in query else "issues"
    return f"https://github.com/search?q={urllib.parse.quote(query)}&type={kind}"


class Searcher:
    def __init__(self, token, search):
        self.token = token
        self.endpoint = f"https://api.github.com/search/{'commits' if search == 'commits' else 'issues'}"

    def count(self, query):
        url = f"{self.endpoint}?{urllib.parse.urlencode({'q': query, 'per_page': 1})}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "aifoc.us-stats/1 (+https://aifoc.us/stats/)",
        }
        for attempt in range(1, 13):
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    remaining = resp.headers.get("X-RateLimit-Remaining")
                    reset = resp.headers.get("X-RateLimit-Reset")
                    data = json.loads(resp.read().decode("utf-8"))
                    if remaining is not None and int(remaining) <= 2 and reset:
                        wait = int(reset) - int(time.time()) + 2
                        if wait > 0:
                            log(f"  [rate limit] sleeping {wait}s")
                            time.sleep(wait)
                    return int(data.get("total_count", 0))
            except urllib.error.HTTPError as err:
                body = err.read().decode("utf-8", errors="replace")
                retry_after = err.headers.get("Retry-After")
                if err.code == 403 and "secondary rate limit" in body.lower():
                    # Measured 2026-11-01: commit search allows ~3-4 requests per
                    # ~45s and a block clears in 15-30s.
                    wait = int(retry_after) if retry_after else 15 * attempt
                    log(f"  [403 secondary limit] waiting {wait}s (attempt {attempt}/12)")
                    time.sleep(wait)
                    continue
                if err.code == 429:
                    wait = int(retry_after) if retry_after else 60
                    log(f"  [429] waiting {wait}s")
                    time.sleep(wait)
                    continue
                if err.code in (500, 502, 503, 504):
                    log(f"  [{err.code}] retrying in 10s")
                    time.sleep(10)
                    continue
                log(f"  [{err.code}] {body[:200]}")
                return None
            except Exception as exc:  # noqa: BLE001
                log(f"  [network] {exc}; retrying in 10s")
                time.sleep(10)
        log("  [failed] gave up after 12 attempts")
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--full", action="store_true", help="query every complete period, not just missing ones")
    ap.add_argument("--resample", type=int, help="re-query the last N complete periods (default from series.json)")
    ap.add_argument("--samples", type=int, help="queries per period, median kept (default from series.json, else 1)")
    ap.add_argument("--until", help="only periods ending before this date (default today)")
    ap.add_argument("--run-date", help="date stamp for the output CSV (default today)")
    ap.add_argument("--tool", action="append", help="limit to these tool names (repeatable)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if sys.stdout.isatty() is False:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "github-search":
        sys.exit(f"{args.series} is not a github-search series in {CONFIG}")

    run_date = args.run_date or date.today().isoformat()
    until = parse_date(args.until) if args.until else date.today()
    resample = args.resample if args.resample is not None else series.get("resample", 1)
    samples = args.samples if args.samples is not None else series.get("samples", 1)

    all_periods = periods(series["granularity"], series["epoch"], until)
    recent = set(p[0] for p in all_periods[-resample:]) if resample > 0 else set()
    have = set() if args.full else existing_complete(series)

    # tools with "track": false keep their historical rows but are not re-measured
    # unless named with --tool.
    tools = [t for t in series["tools"] if (t["name"] in args.tool if args.tool else t.get("track", True))]
    tasks = []
    for tool in tools:
        for s, e in all_periods:
            if (tool["name"], s) in have and s not in recent:
                continue
            tasks.append((tool, s, e))

    if not tasks:
        log(f"{series['id']}: nothing to measure (all {len(all_periods)} periods present)")
        return
    log(f"{series['id']}: {len(tasks)} period queries x {samples} sample(s) across {len(tools)} tools; "
        f"{len(all_periods)} complete periods up to {all_periods[-1][1]}")
    if args.dry_run:
        for tool, s, e in tasks:
            log(f"  {tool['name']:40s} {s}..{e}  {tool['query']} {series['date_field']}:{s}..{e}".rstrip())
        return

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    checkpoint = os.path.join(CHECKPOINT_DIR, f"{series['id']}-{run_date}.json")
    raw = {}
    if os.path.exists(checkpoint):
        with open(checkpoint, encoding="utf-8") as f:
            raw = json.load(f)
        log(f"resuming from {checkpoint} ({len(raw)} keys)")

    searcher = Searcher(github_token(), series["search"])
    done = 0
    total = len(tasks) * samples
    try:
        for pass_no in range(1, samples + 1):
            for tool, s, e in tasks:
                key = f"{tool['name']}|{s}..{e}"
                got = raw.setdefault(key, [])
                if len(got) >= pass_no:
                    continue
                query = f"{tool['query']} {series['date_field']}:{s}..{e}".strip()
                value = searcher.count(query)
                got.append(value)
                done += 1
                shown = f"{value:,}" if value is not None else "ERROR"
                log(f"  [{done / total * 100:5.1f}%] {tool['name']} {s}..{e}: {shown}")
                with open(checkpoint, "w", encoding="utf-8") as f:
                    json.dump(raw, f, indent=1)
                time.sleep(SLEEP_PER_REQUEST)
    except KeyboardInterrupt:
        log("interrupted; progress is in the checkpoint, re-run to resume")
    finally:
        write_csv(series, tasks, raw, run_date)


def write_csv(series, tasks, raw, run_date):
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    rows = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        for tool, s, e in tasks:
            vals = sorted(v for v in raw.get(f"{tool['name']}|{s}..{e}", []) if v is not None)
            if not vals:
                continue
            median = vals[len(vals) // 2]
            query = f"{tool['query']} {series['date_field']}:{s}..{e}".strip()
            w.writerow([tool["name"], s, e, series["granularity"], median,
                        web_search_url(series["search"], query), json.dumps(vals)])
            rows += 1
    log(f"wrote {rows} rows to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
