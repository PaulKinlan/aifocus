#!/usr/bin/env python3
"""
tools/stats/collect-model-gap.py - track Chrome stable releases and shipped web
platform features (from Chrome Platform Status) after each model's published
knowledge cutoff.

    python3 tools/stats/collect-model-gap.py --series model-gap-releases
    python3 tools/stats/collect-model-gap.py --series model-gap-features
    python3 tools/stats/collect-model-gap.py --series model-gap-releases --full

No credentials. Unauthenticated GETs through collector_common:
  1. Chromium Dash milestone schedule (stable release dates per Chrome milestone)
     https://chromiumdash.appspot.com/fetch_milestone_schedule?offset=-35&n=45
  2. Chrome Platform Status milestone features API (shipped features per milestone)
     https://chromestatus.com/api/v0/features?milestone=<m>

Counts features in the shipped stable buckets of features_by_type ("Enabled by
default", "Stepped rollout", "Deprecated", "Removed"), excluding flags and
origin trials ("Origin trial", "In developer trial (Behind a flag)").

Unless --no-update-json is passed, refreshes chromeMilestones and updated in
static/model-gap.json (re-fetching the trailing `resample` milestones plus any
milestone missing features, or every milestone when --full is passed).

Series config (tools/stats/series.json):
  "kind": "model-gap", "metric": "releases" | "features",
  "granularity": "weekly", "epoch": "2024-07-29"
"""

import argparse
import csv
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from collector_common import (  # noqa: E402
    UA,
    CollectorDataError,
    fetch_capped,
    fetch_json_capped,
    finite_in_range,
    non_negative_int,
)

ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
MODEL_GAP_JSON = os.path.join(ROOT, "static", "model-gap.json")

SCHEDULE_URL = "https://chromiumdash.appspot.com/fetch_milestone_schedule?offset=-35&n=45"
CHROMESTATUS_MILESTONE_URL = "https://chromestatus.com/api/v0/features?milestone={m}"

SHIPPED_BUCKETS = ("Enabled by default", "Stepped rollout", "Deprecated", "Removed")

ISO_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:$|T)")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
HTTPS_URL_RE = re.compile(r"^https://[^\s\"'<>]+$")


def parse_iso_date(raw, label):
    if not isinstance(raw, str):
        raise CollectorDataError(f"{label}: expected date string, got {raw!r}")
    m = ISO_DATE_RE.match(raw)
    if not m:
        raise CollectorDataError(f"{label}: malformed ISO date {raw!r}")
    try:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    except ValueError as err:
        raise CollectorDataError(f"{label}: invalid calendar date {raw!r}") from err


def parse_milestone_int(raw, label):
    v = finite_in_range(raw, 1, 1000, label)
    if not v.is_integer():
        raise CollectorDataError(f"{label}: milestone must be an integer, got {raw!r}")
    return int(v)


def slugify_feature(name, feat_id):
    if not isinstance(name, str) or not name.strip():
        raise CollectorDataError(f"chromestatus feature {feat_id} has empty or non-string name: {name!r}")
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:80].rstrip("-")
    if not slug or not SLUG_RE.match(slug):
        slug = f"feature-{feat_id}"
    return slug


def fetch_schedule():
    payload = fetch_json_capped(SCHEDULE_URL, headers={"User-Agent": UA, "Accept": "application/json"})
    if not isinstance(payload, dict) or not isinstance(payload.get("mstones"), list) or not payload["mstones"]:
        raise CollectorDataError("chromiumdash schedule missing non-empty mstones list")
    out = {}
    for entry in payload["mstones"]:
        if not isinstance(entry, dict):
            raise CollectorDataError(f"chromiumdash schedule entry is not an object: {entry!r}")
        m = parse_milestone_int(entry.get("mstone"), "chromiumdash mstone")
        d = parse_iso_date(entry.get("stable_date"), f"chromiumdash M{m} stable_date")
        out[m] = d
    return out


def fetch_milestone_features(m):
    url = CHROMESTATUS_MILESTONE_URL.format(m=m)
    body = fetch_capped(url, headers={"User-Agent": UA, "Accept": "application/json"})
    # chromestatus prefixes JSON responses with )]}' to prevent XSSI.
    if body.startswith(")]}'"):
        body = body.split("\n", 1)[1]
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as err:
        raise CollectorDataError(f"chromestatus M{m}: invalid JSON") from err
    if not isinstance(payload, dict) or not isinstance(payload.get("features_by_type"), dict):
        raise CollectorDataError(f"chromestatus M{m}: missing features_by_type object")

    fbt = payload["features_by_type"]
    seen_ids = set()
    slugs = []
    for bucket in SHIPPED_BUCKETS:
        items = fbt.get(bucket, [])
        if not isinstance(items, list):
            raise CollectorDataError(f"chromestatus M{m} bucket {bucket!r} is not a list")
        for item in items:
            if not isinstance(item, dict):
                raise CollectorDataError(f"chromestatus M{m} feature entry is not an object")
            fid = non_negative_int(item.get("id"), f"chromestatus M{m} feature id")
            if fid in seen_ids:
                continue
            seen_ids.add(fid)
            slugs.append(slugify_feature(item.get("name"), fid))
    return sorted(slugs)


def validate_model_gap_doc(doc):
    if not isinstance(doc, dict):
        raise CollectorDataError("model-gap.json root must be an object")
    models = doc.get("models")
    if not isinstance(models, list) or not models:
        raise CollectorDataError("model-gap.json must contain a non-empty models list")
    for mdl in models:
        if not isinstance(mdl, dict) or not mdl.get("model") or not isinstance(mdl.get("model"), str):
            raise CollectorDataError(f"invalid model entry in model-gap.json: {mdl!r}")
        parse_iso_date(mdl.get("cutoff"), f"model {mdl['model']} cutoff")
        card = mdl.get("card", "")
        if card and (not isinstance(card, str) or not HTTPS_URL_RE.match(card)):
            raise CollectorDataError(f"model {mdl['model']} card URL must be https: {card!r}")
    milestones = doc.get("chromeMilestones")
    if not isinstance(milestones, list) or not milestones:
        raise CollectorDataError("model-gap.json must contain a non-empty chromeMilestones list")
    for ms in milestones:
        if not isinstance(ms, dict):
            raise CollectorDataError(f"invalid milestone entry in model-gap.json: {ms!r}")
        m = parse_milestone_int(ms.get("m"), "model-gap.json milestone m")
        parse_iso_date(ms.get("date"), f"model-gap.json M{m} date")
        feats = ms.get("features", [])
        if not isinstance(feats, list):
            raise CollectorDataError(f"model-gap.json M{m} features must be a list")
        for slug in feats:
            if not isinstance(slug, str) or not SLUG_RE.match(slug):
                raise CollectorDataError(f"model-gap.json M{m} invalid feature slug {slug!r}")


def refresh_model_gap_doc(doc, run_date, *, full=False, resample=3):
    validate_model_gap_doc(doc)
    rd = parse_iso_date(run_date, "run_date")
    schedule = fetch_schedule()

    by_m = {}
    for ms in doc["chromeMilestones"]:
        m = int(ms["m"])
        if parse_iso_date(ms["date"], f"M{m} date") <= rd:
            by_m[m] = {"m": m, "date": ms["date"], "features": list(ms.get("features", []))}

    for m, stable_date in sorted(schedule.items()):
        if stable_date <= rd or m in by_m:
            by_m[m] = {
                "m": m,
                "date": stable_date.isoformat(),
                "features": by_m.get(m, {}).get("features", []),
            }

    all_m = sorted(by_m)
    recent_cutoff = set(all_m[-resample:]) if resample > 0 else set()
    for m in all_m:
        if full or m in recent_cutoff or not by_m[m]["features"]:
            by_m[m]["features"] = fetch_milestone_features(m)

    updated_doc = dict(doc)
    updated_doc["updated"] = rd.isoformat()
    updated_doc["chromeMilestones"] = [by_m[m] for m in all_m]
    validate_model_gap_doc(updated_doc)
    return updated_doc


def series_rows(series, run_date, doc):
    validate_model_gap_doc(doc)
    metric = series.get("metric")
    if metric not in ("releases", "features"):
        raise CollectorDataError(f"unknown model-gap metric: {metric!r}")
    epoch = parse_iso_date(series.get("epoch", "2024-07-29"), "series epoch")
    rd = parse_iso_date(run_date, "run_date")

    milestones = sorted(
        (
            {
                "m": int(ms["m"]),
                "d": parse_iso_date(ms["date"], f"M{ms['m']} date"),
                "features": len(ms.get("features", [])),
            }
            for ms in doc["chromeMilestones"]
        ),
        key=lambda item: item["d"],
    )

    models_by_name = {mdl["model"]: mdl for mdl in doc["models"]}
    tool_names = [t["name"] for t in series.get("tools", [])] or list(models_by_name)

    rows = []
    for name in tool_names:
        mdl = models_by_name.get(name)
        if not mdl:
            raise CollectorDataError(f"tool {name!r} in series {series['id']!r} is missing from model-gap.json")
        cutoff = parse_iso_date(mdl["cutoff"], f"{name} cutoff")
        card = mdl.get("card", "")
        cur = epoch
        while cur + timedelta(days=6) < rd:
            end = cur + timedelta(days=6)
            if end >= cutoff:
                missed = [ms for ms in milestones if cutoff < ms["d"] <= end]
                value = len(missed) if metric == "releases" else sum(ms["features"] for ms in missed)
                meta = {"cutoff": cutoff.isoformat(), "latest_chrome": missed[-1]["m"] if missed else None}
                rows.append([name, cur.isoformat(), end.isoformat(), "weekly", value, card, json.dumps(meta)])
            cur += timedelta(days=7)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--run-date")
    ap.add_argument("--full", action="store_true", help="re-fetch ChromeStatus feature lists for every milestone")
    ap.add_argument("--no-update-json", action="store_true", help="compute CSV rows from model-gap.json without fetching or rewriting it")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "model-gap":
        sys.exit(f"{args.series} is not a model-gap series")

    run_date = args.run_date or date.today().isoformat()
    with open(MODEL_GAP_JSON, encoding="utf-8") as f:
        doc = json.load(f)

    if not args.no_update_json:
        doc = refresh_model_gap_doc(doc, run_date, full=args.full)
        with open(MODEL_GAP_JSON, "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2, ensure_ascii=False)
            f.write("\n")

    rows = series_rows(series, run_date, doc)
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        w.writerows(rows)
    print(f"wrote {len(rows)} weekly rows ({series['metric']}) to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
