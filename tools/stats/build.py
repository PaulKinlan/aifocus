#!/usr/bin/env python3
"""
tools/stats/build.py - compile every run CSV under static/data/ into data/stats.json
(read by layouts/stats/page.html) and print a change report.

    python3 tools/stats/build.py                 # rebuild data/stats.json, report to stdout
    python3 tools/stats/build.py --report FILE   # also write the markdown report to FILE
    python3 tools/stats/build.py --check         # exit 1 if data/stats.json is stale

Inputs, per series in tools/stats/series.json:
  static/data/<file_prefix>-<YYYY-MM-DD>.csv   one file per collection run
  static/data/manual/<name>.csv                hand-kept snapshots (kind: manual)

Columns: tool,period_start,period_end,granularity,total_count,url[,samples|note].
The original total-commits file (period_start,period_end,total_commits) is also
understood. For the same tool and period the most recent run wins; every run's
value is kept under runs{} so revisions stay visible.
"""

import argparse
import calendar
import csv
import glob
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
OUT = os.path.join(ROOT, "data", "stats.json")
TABLE_PERIODS = 8
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def pdate(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def fmt_value(v, value_format=None):
    if v is None:
        return "–"
    if value_format == "percent":
        return f"{v:.1f}%" if abs(v) >= 1 else f"{v:.2f}%"
    if value_format == "usd":
        return "$" + compact(v)
    return compact(v)


def compact(v):
    a = abs(v)
    if a >= 1e12:
        return f"{v / 1e12:.1f}T"
    if a >= 1e9:
        return f"{v / 1e9:.1f}B"
    if a >= 1e6:
        return f"{v / 1e6:.1f}M" if a < 1e7 else f"{v / 1e6:.0f}M"
    if a >= 1e4:
        return f"{v / 1e3:.0f}K"
    if a >= 1e3:
        return f"{v / 1e3:.1f}K"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.2f}"
    return f"{int(v):,}"


def fmt_full(v, value_format=None):
    if v is None:
        return "–"
    if value_format == "percent":
        return f"{v:.3f}".rstrip("0").rstrip(".") + "%"
    if value_format == "usd":
        return f"${v:,.0f}"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.3f}"
    return f"{int(v):,}"


def pct_change(new, old):
    if old in (None, 0) or new is None:
        return None
    return (new - old) / old * 100


def fmt_change(new, old, value_format=None):
    if old is None or new is None:
        return {"abs": None, "pct": None, "fmt": "–"}
    diff = new - old
    pct = pct_change(new, old)
    sign = "+" if diff >= 0 else "−"
    if value_format == "percent":
        body = f"{sign}{abs(diff):.1f} pts"
    else:
        body = f"{sign}{fmt_value(abs(diff), value_format)}"
    if pct is not None:
        body += f" ({sign}{abs(pct):,.0f}%)"
    return {"abs": diff, "pct": pct, "fmt": body}


def period_label(s, e, granularity):
    d = pdate(s)
    if granularity == "monthly":
        return d.strftime("%b %Y")
    if granularity == "weekly":
        return "w/c " + d.strftime("%-d %b %Y")
    return d.strftime("%-d %b %Y")


def expected_end(s, granularity):
    d = pdate(s)
    if granularity == "weekly":
        return d + timedelta(days=6)
    if granularity == "monthly":
        return d.replace(day=calendar.monthrange(d.year, d.month)[1])
    return d


def read_run(path):
    """Yield (tool, s, e, granularity, value, url, extra) rows from one CSV."""
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if "total_commits" in row:  # original total-commits-weekly file
                tool, value, gran, url = "All commits", row["total_commits"], "weekly", ""
            else:
                tool, value, gran, url = row["tool"], row["total_count"], row.get("granularity", ""), row.get("url", "")
            if value in ("", "ERROR"):
                continue
            v = float(value)
            if v.is_integer():
                v = int(v)
            yield tool, row["period_start"], row["period_end"], gran, v, url, row.get("samples") or row.get("note") or ""


def load_series(series):
    """Merge every run for this series. Returns (points, runs, aliases_seen)."""
    prefix = series["file_prefix"]
    if series.get("kind") == "manual":
        files = [os.path.join(DATA_DIR, prefix + ".csv")]
    else:
        files = sorted(glob.glob(os.path.join(DATA_DIR, prefix + "-*.csv")))
    aliases = series.get("aliases", {})
    runs = []
    points = {}  # tool -> period_start -> point
    for path in files:
        if not os.path.exists(path):
            continue
        m = DATE_RE.search(os.path.basename(path))
        run_date = m.group(1) if m else None
        n = 0
        for tool, s, e, gran, v, url, extra in read_run(path):
            tool = aliases.get(tool, tool)
            rd = run_date or e
            partial = False
            if series["granularity"] in ("weekly", "monthly"):
                partial = pdate(e) < expected_end(s, series["granularity"]) or pdate(e) >= pdate(rd)
            # "show_partial": false drops incomplete periods from the series
            # altogether (chart, table, derived series), instead of drawing
            # them as hollow points. The row stays in the published CSV.
            if partial and series.get("show_partial", True) is False:
                continue
            pt = points.setdefault(tool, {}).get(s)
            if pt is None or rd >= pt["run"]:
                points[tool][s] = {"s": s, "e": e, "v": v, "partial": partial, "url": url, "run": rd,
                                   "runs": dict((pt or {}).get("runs", {}), **{rd: v}), "note": extra if series.get("kind") == "manual" else ""}
            else:
                pt["runs"][rd] = v
            n += 1
        runs.append({"date": run_date or max((pdate(p["e"]) for t in points.values() for p in t.values()), default=date.today()).isoformat(),
                     "file": "/data/" + os.path.relpath(path, DATA_DIR).replace(os.sep, "/"), "rows": n})
    return points, runs


def ordered_tools(series, points):
    seen = set()
    tools = []
    for t in series.get("tools", []):
        tools.append(dict(t))
        seen.add(t["name"])
    for name in sorted(points):
        if name not in seen:
            tools.append({"name": name, "label": name, "method": "", "query": ""})
    return tools


def build_tool(series, tool, pts, value_format):
    ordered = [pts[k] for k in sorted(pts)]
    complete = [p for p in ordered if not p["partial"]]
    latest = complete[-1] if complete else None
    prior = complete[-2] if len(complete) > 1 else None
    back = 4 if series["granularity"] == "weekly" else 1
    ago = complete[-1 - back] if len(complete) > back else None
    out = {
        "name": tool["name"], "label": tool.get("label", tool["name"]), "method": tool.get("method", ""),
        "query": tool.get("query", ""), "slot": tool.get("slot"), "value_format": value_format,
        "points": [{"s": p["s"], "e": p["e"], "v": p["v"], "fmt": fmt_value(p["v"], value_format), "full": fmt_full(p["v"], value_format),
                    "partial": p["partial"], "url": p["url"], "runs": p["runs"], "note": p.get("note", "")} for p in ordered],
        "latest": snap(latest, value_format), "prior": snap(prior, value_format), "ago": snap(ago, value_format),
        "change_prior": fmt_change(latest and latest["v"], prior and prior["v"], value_format),
        "change_ago": fmt_change(latest and latest["v"], ago and ago["v"], value_format),
        "total": sum(p["v"] for p in complete) if complete and value_format is None and series["granularity"] in ("weekly", "monthly") and series.get("cumulative", True) else None,
    }
    out["total_fmt"] = fmt_value(out["total"]) if out["total"] is not None else None
    out["latest_fmt"] = out["latest"]["fmt"] if out["latest"] else "–"
    return out


def snap(p, value_format):
    if not p:
        return None
    return {"s": p["s"], "e": p["e"], "v": p["v"], "fmt": fmt_value(p["v"], value_format), "full": fmt_full(p["v"], value_format), "url": p.get("url", "")}


def value_at(tool_out, period):
    """Value for the period starting at `period`, else the last point on or before it."""
    exact = next((p for p in tool_out["points"] if p["s"] == period), None)
    if exact:
        return exact
    before = [p for p in tool_out["points"] if p["s"] <= period]
    return before[-1] if before else None


def build_claims(claims, tools_by_name, granularity):
    out = []
    for c in claims:
        t = tools_by_name.get(c["tool"])
        vf = t["value_format"] if t else None
        measured = value_at(t, c["period"]) if t else None
        now = t["latest"] if t else None
        comparable = c.get("comparable", True)
        out.append({
            "text": c["text"], "tool": c["tool"], "tool_label": t["label"] if t else c["tool"],
            "period": c["period"], "period_label": period_label(c["period"], c["period"], granularity),
            "value": c["value"], "value_fmt": fmt_value(c["value"], vf),
            "measured": {"s": measured["s"], "v": measured["v"], "fmt": measured["fmt"], "full": measured["full"], "url": measured.get("url", ""),
                         "partial": measured.get("partial", False), "exact": measured["s"] == c["period"]} if measured else None,
            "now": now, "now_label": period_label(now["s"], now["e"], granularity) if now else None,
            "change": fmt_change(now and now["v"], c["value"], vf) if comparable else {"abs": None, "pct": None, "fmt": "not comparable"},
            "comparable": comparable,
        })
    return out


def chart_tools(series, tools_out):
    # One axis per chart: a tool with its own value_format (USD, percent) is a
    # different measure and stays in the table and the claims, not the chart.
    excluded = set(series.get("exclude_from_chart", []))
    excluded |= {t["name"] for t in tools_out if t.get("value_format") != series.get("value_format")}
    slotted = [t for t in tools_out if t.get("slot") and t["name"] not in excluded and t["points"]]
    if series.get("chart_top"):
        ranked = sorted((t for t in tools_out if t["name"] not in excluded and t["latest"]),
                        key=lambda t: -t["latest"]["v"])[: series["chart_top"]]
        names = {t["name"] for t in ranked}
        slotted = [t for t in tools_out if t["name"] in names]
    used = {t["slot"] for t in slotted if t.get("slot")}
    nxt = 1
    for t in slotted:
        if not t.get("slot"):
            while nxt in used:
                nxt += 1
            t["slot"] = nxt
            used.add(nxt)
        t["chart"] = True
    return [t["name"] for t in slotted]


def build_chart(tools_out, names, value_format, granularity):
    chosen = [t for t in tools_out if t["name"] in names]
    starts = sorted({p["s"] for t in chosen for p in t["points"]})
    periods = []
    for st in starts:
        any_pt = next(p for t in chosen for p in t["points"] if p["s"] == st)
        periods.append({"s": st, "e": any_pt["e"], "partial": any_pt["partial"]})
    return {
        "value_format": value_format, "granularity": granularity,
        "periods": periods,
        "series": [{"label": t["label"], "slot": t.get("slot"),
                    "values": [({p["s"]: p["v"] for p in t["points"]}).get(st) for st in starts]} for t in chosen],
    }


def build_table(series, tools_out, names):
    chosen = [t for t in tools_out if t["name"] in names] + [t for t in tools_out if t["name"] not in names and t["points"]]
    starts = sorted({p["s"] for t in chosen for p in t["points"]})[-TABLE_PERIODS:]
    gran = series["granularity"]
    periods = []
    for s in starts:
        any_pt = next(p for t in chosen for p in t["points"] if p["s"] == s)
        periods.append({"s": s, "e": any_pt["e"], "partial": any_pt["partial"], "label": period_label(s, any_pt["e"], gran)})
    rows = []
    for t in chosen:
        by = {p["s"]: p for p in t["points"]}
        rows.append({"tool": t["name"], "label": t["label"], "cells": [
            ({"v": by[s]["v"], "fmt": by[s]["fmt"], "full": by[s]["full"], "url": by[s]["url"], "partial": by[s]["partial"]} if s in by else None) for s in starts]})
    return {"periods": periods, "rows": rows}


def build_derived(series, series_out, compiled_by_id):
    out = []
    denom_tool = next((t for t in series_out["tools"] if t["name"] == series.get("primary")), None)
    for d in series.get("derived", []):
        num_series = compiled_by_id.get(d["numerator_series"])
        if not num_series or not denom_tool:
            continue
        denom = {p["s"]: p for p in denom_tool["points"]}
        tools_out = []
        for name in d["tools"]:
            nt = next((t for t in num_series["tools"] if t["name"] == name), None)
            if not nt:
                continue
            pts = {}
            for p in nt["points"]:
                dp = denom.get(p["s"])
                if dp and dp["v"]:
                    pts[p["s"]] = {"s": p["s"], "e": min(p["e"], dp["e"]), "v": round(p["v"] / dp["v"] * 100, 3),
                                   "partial": p["partial"] or dp["partial"], "url": "", "runs": {}, "note": ""}
            tools_out.append(build_tool(series, {"name": name, "label": nt["label"], "method": "numerator ÷ all public commits", "slot": nt.get("slot")}, pts, "percent"))
        for t in tools_out:
            t["chart"] = True
        by_name = {t["name"]: t for t in tools_out}
        out.append({
            "id": d["id"], "title": d["title"], "unit": d["unit"], "granularity": series["granularity"], "value_format": "percent",
            "how": d.get("how", ""), "risk": d.get("risk", ""),
            "tools": tools_out, "chart_tools": [t["name"] for t in tools_out],
            "claims": build_claims(d.get("claims", []), by_name, series["granularity"]),
            "table": build_table(series, tools_out, [t["name"] for t in tools_out]),
            "chart": build_chart(tools_out, [t["name"] for t in tools_out], "percent", series["granularity"]),
            "primary": d["tools"][0] if d["tools"] else None,
        })
    return out


def compile_series(series):
    points, runs = load_series(series)
    vf = series.get("value_format")
    tools_out = []
    for tool in ordered_tools(series, points):
        pts = points.get(tool["name"], {})
        tools_out.append(build_tool(series, tool, pts, tool.get("value_format", vf)))
    names = chart_tools(series, tools_out)
    by_name = {t["name"]: t for t in tools_out}
    primary = by_name.get(series.get("primary")) or (tools_out[0] if tools_out else None)
    complete_periods = sorted({p["s"] for t in tools_out for p in t["points"] if not p["partial"]})
    updated = max((r["date"] for r in runs), default=None)
    if series.get("kind") == "manual":
        updated = max((p["e"] for t in tools_out for p in t["points"]), default=None)
    return {
        "id": series["id"], "title": series["title"], "kind": series.get("kind"), "unit": series["unit"],
        "granularity": series["granularity"], "value_format": vf, "method": series.get("method", ""),
        "caveats": series.get("caveats", []), "posts": series.get("posts", []), "updated": updated,
        "how": series.get("how", ""), "risk": series.get("risk", ""),
        "runs": runs, "period_count": len(complete_periods),
        "first_period": complete_periods[0] if complete_periods else None,
        "last_period": complete_periods[-1] if complete_periods else None,
        "last_period_label": period_label(complete_periods[-1], complete_periods[-1], series["granularity"]) if complete_periods else None,
        "primary": primary["name"] if primary else None,
        "tools": tools_out, "chart_tools": names,
        "claims": build_claims(series.get("claims", []), by_name, series["granularity"]),
        "table": build_table(series, tools_out, names),
        "chart": build_chart(tools_out, names, vf, series["granularity"]),
    }


def slim(compiled):
    """What the page needs. Per-point URLs, run history and formatted strings are
    dropped from `points` (the table keeps URLs for the periods it shows; run
    history stays in the CSVs); the asset-size gate caps files at 512 KiB, and
    without per-period points this file barely grows month to month."""
    out = json.loads(json.dumps(compiled))
    for s in out["series"]:
        for block in [s] + s.get("derived", []):
            for t in block["tools"]:
                # The page draws from `chart` and `table`; the per-period history
                # stays in the run CSVs (collect-github.py reads those directly).
                t.pop("points", None)
                t.pop("prior", None)
    return out


def change_report(compiled):
    lines = [f"# /stats/ change report, {compiled['generated']}", ""]
    for s in compiled["series"]:
        lines.append(f"## {s['title']} (`{s['id']}`)")
        lines.append("")
        if not s["runs"]:
            lines.append("No data yet.")
            lines.append("")
            continue
        run_dates = sorted({r["date"] for r in s["runs"]})
        latest_run = run_dates[-1]
        prev_run = run_dates[-2] if len(run_dates) > 1 else None
        lines.append(f"- Latest run: {latest_run}" + (f" (previous {prev_run})" if prev_run else "") +
                     f"; {s['period_count']} complete periods, last complete {s['last_period_label']}.")
        for t in s["tools"]:
            if not t.get("chart") or not t["latest"]:
                continue
            line = f"- **{t['label']}**: {t['latest']['full']} {s['unit']} ({period_label(t['latest']['s'], t['latest']['e'], s['granularity'])})"
            if t["ago"]:
                line += f"; vs {period_label(t['ago']['s'], t['ago']['e'], s['granularity'])}: {t['change_ago']['fmt']}"
            # revision of the same period by the latest run versus the previous run
            if prev_run:
                revised = []
                for p in t["points"]:
                    if latest_run in p["runs"] and prev_run in p["runs"] and p["runs"][prev_run]:
                        delta = pct_change(p["runs"][latest_run], p["runs"][prev_run])
                        if delta is not None and abs(delta) >= 5:
                            revised.append(f"{p['s']} {delta:+.0f}%")
                if revised:
                    line += f"; revised since previous run: {', '.join(revised[:6])}" + (" …" if len(revised) > 6 else "")
            lines.append(line)
        for c in s["claims"]:
            if c["now"]:
                lines.append(f"- Claim: {c['text']}: written as {c['value_fmt']}; now {c['now']['fmt']} ({c['now_label']}): {c['change']['fmt']}.")
        for d in s.get("derived", []):
            for t in d["tools"]:
                if t["latest"]:
                    lines.append(f"- {d['title']}, {t['label']}: {t['latest']['fmt']} ({period_label(t['latest']['s'], t['latest']['e'], d['granularity'])}); vs a month earlier: {t['change_ago']['fmt']}")
        lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", help="write the markdown change report here as well as stdout")
    ap.add_argument("--check", action="store_true", help="exit 1 if data/stats.json differs from a fresh build")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    compiled = {"generated": date.today().isoformat(), "series": []}
    by_id = {}
    for series in config["series"]:
        out = compile_series(series)
        by_id[out["id"]] = out
        compiled["series"].append(out)
    for series in config["series"]:
        if series.get("derived"):
            by_id[series["id"]]["derived"] = build_derived(series, by_id[series["id"]], by_id)

    text = json.dumps(slim(compiled), separators=(",", ":"), ensure_ascii=False) + "\n"
    if args.check:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        strip = lambda s: re.sub(r'"generated": "[^"]*"', "", s)
        if strip(current) != strip(text):
            sys.exit("data/stats.json is stale: run python3 tools/stats/build.py")
        print("data/stats.json is up to date")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    report = change_report(compiled)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            f.write(report + "\n")
    if not args.quiet:
        print(report)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text) // 1024} KiB, {len(compiled['series'])} series)", file=sys.stderr)


if __name__ == "__main__":
    main()
