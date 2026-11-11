#!/usr/bin/env python3
"""
tools/stats/collect-model-halflife.py - sync headline model releases from
OpenRouter's public model catalogue into static/model-drops.tsv and compile
the model-half-life series for tools/stats/build.py.

    python3 tools/stats/collect-model-halflife.py --series model-halflife-cadence
    python3 tools/stats/collect-model-halflife.py --series model-halflife-drops

No credentials. Reads https://openrouter.ai/api/v1/models through
collector_common.fetch_json_capped (2 MiB cap; the catalogue is ~840 KiB) and
appends post-2026-05-07 headline text-generation releases from the twelve labs
tracked in static/model-drops.tsv, collapsing same-version variants (:batch,
:free, -pro, date checkpoints) and skipping image/video/domain variants. Pass
--no-update-tsv to compute CSVs from static/model-drops.tsv offline.

Series config (tools/stats/series.json):
  "kind": "model-halflife",
  "metric": "median_gap"     monthly trailing-3-gap median days per model series
          | "monthly_drops"  headline model releases per calendar month
"""

import argparse
import calendar
import collections
import csv
import json
import math
import os
import re
import sys
from datetime import date, datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from collector_common import (  # noqa: E402
    MAX_RESPONSE_BYTES,
    UA,
    CollectorDataError,
    fetch_json_capped,
    finite_in_range,
)

ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
CONFIG = os.path.join(ROOT, "tools", "stats", "series.json")
DATA_DIR = os.path.join(ROOT, "static", "data")
MODEL_DROPS_TSV = os.path.join(ROOT, "static", "model-drops.tsv")

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
# The full OpenRouter model list is ~840 KiB across all providers; allow 2 MiB
# while keeping a strict bounded read in collector_common.fetch_capped().
MODEL_LIST_MAX_BYTES = 2 * MAX_RESPONSE_BYTES
BASELINE_CUTOFF = date(2026, 5, 7)

TSV_FIELDS = ["date", "vendor", "series", "model", "tier", "notes"]
VALID_TIERS = {"frontier", "standard", "small"}
ISO_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})$")
MODEL_ID_RE = re.compile(r"^([a-z0-9-]+)/([a-z0-9][a-z0-9._-]*)$")
SAFE_CELL_RE = re.compile(r"^[^\x00-\x1f\x7f]{1,200}$")

US_VENDORS = {"OpenAI", "Anthropic", "Google", "xAI", "Meta"}
CN_VENDORS = {"DeepSeek", "Alibaba", "Zhipu", "MiniMax", "Moonshot", "ByteDance"}
EU_VENDORS = {"Mistral"}


def parse_iso_date(raw, label):
    if not isinstance(raw, str) or not ISO_DATE_RE.match(raw):
        raise CollectorDataError(f"{label}: malformed ISO date {raw!r}")
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as err:
        raise CollectorDataError(f"{label}: invalid calendar date {raw!r}") from err


def half_up_round(v):
    """Match JavaScript Math.round() in static/model-drops.html for positive half-days."""
    return int(math.floor(v + 0.5))


def trailing_median_gap(dates):
    """Median of the trailing three consecutive release gaps in days, rounded like model-drops.html."""
    if len(dates) < 2:
        return None
    gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    recent = sorted(gaps[-3:])
    mid = len(recent) // 2
    med = recent[mid] if len(recent) % 2 == 1 else (recent[mid - 1] + recent[mid]) / 2.0
    return half_up_round(med)


def norm_key(series, text):
    """Canonical key to avoid re-adding a release already present in model-drops.tsv."""
    nums = re.findall(r"\d+(?:\.\d+)?", text.lower())
    ver = nums[0] if nums else text.lower()
    tag = ""
    for word in ("astra", "sol", "terra", "luna", "argon", "carbon", "pro"):
        if re.search(rf"\b{word}\b", text.lower()):
            tag = word
            break
    if series == "o-series" and tag == "astra":
        return f"o-series|{ver}|astra"
    if series in ("GPT", "Gemini Pro") and tag in ("sol", "terra", "argon", "carbon"):
        return f"{series}|{ver}|{tag}"
    if series == "DeepSeek V" and tag == "pro":
        return f"{series}|{ver}|pro"
    return f"{series}|{ver}"


def classify_openrouter_model(provider, slug):
    """Map an OpenRouter (provider, slug) pair to (vendor, series, dedup_key, model_name, tier, note)
    or return None if it is a variant, checkpoint, specialist, or untracked provider."""
    if provider == "anthropic":
        m = re.match(r"^claude-(opus|sonnet|haiku|fable)-(\d+(?:\.\d+)?)$", slug)
        if m:
            fam, ver = m.group(1), m.group(2)
            title = f"Claude {fam.title()} {ver}"
            series = f"Claude {fam.title()}"
            tier = "small" if fam == "haiku" else "frontier"
            return "Anthropic", series, f"{series}|{ver}", title, tier, f"OpenRouter {provider}/{slug}"
        return None

    if provider == "openai":
        m = re.match(r"^gpt-(\d+(?:\.\d+)?)-astra(?:-pro)?$", slug)
        if m:
            ver = m.group(1)
            return "OpenAI", "o-series", f"o-series|{ver}|astra", f"GPT-{ver} Astra", "frontier", f"OpenRouter {provider}/{slug}"
        m = re.match(r"^gpt-(\d+(?:\.\d+)?)(?:-(sol))?(?:-pro)?$", slug)
        if m:
            ver, code = m.group(1), m.group(2)
            label = f"GPT-{ver} {code.title()}" if code else f"GPT-{ver}"
            key = f"GPT|{ver}|{code}" if code else f"GPT|{ver}"
            return "OpenAI", "GPT", key, label, "frontier", f"OpenRouter {provider}/{slug}"
        m = re.match(r"^gpt-(\d+(?:\.\d+)?)-(mini|luna)(?:-pro)?$", slug)
        if m:
            ver, sub = m.group(1), m.group(2)
            label = f"GPT-{ver} {sub.title()}" if sub == "luna" else f"GPT-{ver} mini"
            return "OpenAI", "GPT mini", f"GPT mini|{ver}", label, "small", f"OpenRouter {provider}/{slug}"
        m = re.match(r"^o(\d+(?:\.\d+)?)(?:-pro)?$", slug)
        if m:
            ver = m.group(1)
            return "OpenAI", "o-series", f"o-series|{ver}", f"o{ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "google":
        m = re.match(r"^gemini-(\d+(?:\.\d+)?)-(pro|argon|carbon)$", slug)
        if m:
            ver, sub = m.group(1), m.group(2)
            label = f"Gemini {ver} {sub.title()}"
            key = f"Gemini Pro|{ver}|{sub}" if sub in ("argon", "carbon") else f"Gemini Pro|{ver}"
            return "Google", "Gemini Pro", key, label, "frontier", f"OpenRouter {provider}/{slug}"
        m = re.match(r"^gemini-(\d+(?:\.\d+)?)-flash$", slug)
        if m:
            ver = m.group(1)
            return "Google", "Gemini Flash", f"Gemini Flash|{ver}", f"Gemini {ver} Flash", "standard", f"OpenRouter {provider}/{slug}"
        m = re.match(r"^gemma-(\d+(?:\.\d+)?)(?:-[0-9]+b)?(?:-[a-z]+)?$", slug)
        if m:
            ver = m.group(1)
            return "Google", "Gemma", f"Gemma|{ver}", f"Gemma {ver}", "standard", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "x-ai":
        m = re.match(r"^grok-(\d+(?:\.\d+)?)$", slug)
        if m:
            ver = m.group(1)
            return "xAI", "Grok", f"Grok|{ver}", f"Grok {ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "meta-llama":
        m = re.match(r"^llama-(\d+(?:\.\d+)?)(?:-[a-z0-9-]+)?$", slug)
        if m:
            ver = m.group(1)
            return "Meta", "Llama", f"Llama|{ver}", f"Llama {ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "mistralai":
        m = re.match(r"^mistral-(large|medium|small)-(\d+)(?:[.-](\d+))?$", slug)
        if m:
            line, maj, minor = m.group(1), m.group(2), m.group(3)
            ver = maj if minor in (None, "0") else f"{maj}.{minor}"
            series = f"Mistral {line.title()}"
            tier = {"large": "frontier", "medium": "standard", "small": "small"}[line]
            return "Mistral", series, f"{series}|{ver}", f"{series} {ver}", tier, f"OpenRouter {provider}/{slug}"
        return None

    if provider == "deepseek":
        m = re.match(r"^deepseek-v(\d+(?:\.\d+)?)(?:-(pro|flash))?(?:-\d{4})?$", slug)
        if m:
            ver, sub = m.group(1), m.group(2)
            # Only treat -flash as a headline DeepSeek V drop when it introduces a new version (e.g. V4.1)
            key = f"DeepSeek V|{ver}|pro" if sub == "pro" else f"DeepSeek V|{ver}"
            suffix = f" {sub.title()}" if sub else ""
            return "DeepSeek", "DeepSeek V", key, f"DeepSeek-V{ver}{suffix}", "frontier", f"OpenRouter {provider}/{slug}"
        m = re.match(r"^deepseek-r(\d+(?:\.\d+)?)(?:-\d{4})?$", slug)
        if m:
            ver = m.group(1)
            return "DeepSeek", "DeepSeek R", f"DeepSeek R|{ver}", f"DeepSeek-R{ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "qwen":
        m = re.match(r"^qwen(\d+(?:\.\d+)?)-(?:max|2\.4t[a-z0-9-]*)(?:-\d{4})?$", slug)
        if m:
            ver = m.group(1)
            label = f"Qwen{ver}-Max" if "-max" in slug else f"Qwen{ver}"
            return "Alibaba", "Qwen", f"Qwen|{ver}", label, "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "z-ai":
        m = re.match(r"^glm-(\d+(?:\.\d+)?)$", slug)
        if m:
            ver = m.group(1)
            return "Zhipu", "GLM", f"GLM|{ver}", f"GLM-{ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "minimax":
        m = re.match(r"^minimax-m(\d+(?:\.\d+)?)(?:-flash)?$", slug)
        if m:
            ver = m.group(1)
            return "MiniMax", "MiniMax", f"MiniMax|{ver}", f"MiniMax M{ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "moonshotai":
        m = re.match(r"^kimi-k(\d+(?:\.\d+)?)(?:-pro)?$", slug)
        if m:
            ver = m.group(1)
            suffix = " Pro" if slug.endswith("-pro") else ""
            return "Moonshot", "Kimi", f"Kimi|{ver}", f"Kimi K{ver}{suffix}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    if provider == "bytedance-seed":
        m = re.match(r"^seed-(\d+)-(\d+)(?:-(?:pro|turbo))?$", slug)
        if m:
            ver = f"{m.group(1)}.{m.group(2)}"
            return "ByteDance", "Doubao", f"Doubao|{ver}", f"Doubao Seed {ver}", "frontier", f"OpenRouter {provider}/{slug}"
        return None

    return None


def read_drops_tsv(path):
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        if reader.fieldnames != TSV_FIELDS:
            raise CollectorDataError(f"{path}: unexpected TSV header {reader.fieldnames!r}")
        rows = []
        for idx, row in enumerate(reader, start=2):
            validate_drop_row(row, f"{path}:{idx}")
            rows.append(dict(row))
    if not rows:
        raise CollectorDataError(f"{path}: empty model-drops.tsv")
    return rows


def validate_drop_row(row, label):
    parse_iso_date(row.get("date"), f"{label} date")
    for col in ("vendor", "series", "model"):
        val = row.get(col)
        if not isinstance(val, str) or not SAFE_CELL_RE.match(val) or "\t" in val:
            raise CollectorDataError(f"{label} invalid {col}: {val!r}")
    if row.get("tier") not in VALID_TIERS:
        raise CollectorDataError(f"{label} invalid tier: {row.get('tier')!r}")
    notes = row.get("notes", "")
    if not isinstance(notes, str) or (notes and (not SAFE_CELL_RE.match(notes) or "\t" in notes)):
        raise CollectorDataError(f"{label} invalid notes: {notes!r}")


def write_drops_tsv(path, rows):
    ordered = sorted(rows, key=lambda r: (r["date"], r["vendor"], r["series"], r["model"]))
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TSV_FIELDS, delimiter="\t", lineterminator="\n")
        w.writeheader()
        for r in ordered:
            validate_drop_row(r, "write_drops_tsv")
            w.writerow(r)


def refresh_drops_from_openrouter(existing_rows, run_date):
    rd = parse_iso_date(run_date, "run_date")
    payload = fetch_json_capped(
        OPENROUTER_MODELS_URL,
        headers={"User-Agent": UA, "Accept": "application/json"},
        max_bytes=MODEL_LIST_MAX_BYTES,
    )
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list) or not data:
        raise CollectorDataError("openrouter /api/v1/models missing non-empty data list")

    seen_keys = {norm_key(r["series"], r["model"]) for r in existing_rows}
    seen_models = {(r["series"].lower(), r["model"].lower()) for r in existing_rows}

    candidates = {}
    for item in data:
        if not isinstance(item, dict):
            raise CollectorDataError(f"openrouter model entry is not an object: {item!r}")
        raw_id = item.get("id")
        if not isinstance(raw_id, str) or ":" in raw_id:
            continue
        m_id = MODEL_ID_RE.match(raw_id)
        if not m_id:
            continue
        arch = item.get("architecture")
        if arch is not None and not isinstance(arch, dict):
            raise CollectorDataError(f"openrouter {raw_id} invalid architecture: {arch!r}")
        out_mod = (arch or {}).get("output_modalities")
        if out_mod is not None and out_mod != ["text"]:
            continue
        created_ts = finite_in_range(item.get("created"), 1_600_000_000, 4_102_444_800, f"openrouter {raw_id} created")
        created_date = datetime.fromtimestamp(created_ts, tz=timezone.utc).date()
        if created_date <= BASELINE_CUTOFF or created_date > rd:
            continue

        mapped = classify_openrouter_model(m_id.group(1), m_id.group(2))
        if not mapped:
            continue
        vendor, series, dedup_key, model_name, tier, note = mapped
        if dedup_key in seen_keys or (series.lower(), model_name.lower()) in seen_models:
            continue
        prev = candidates.get(dedup_key)
        rank = (created_date.isoformat(), len(raw_id), raw_id)
        if prev is None or rank < prev["_rank"]:
            candidates[dedup_key] = {
                "_rank": rank,
                "date": created_date.isoformat(),
                "vendor": vendor,
                "series": series,
                "model": model_name,
                "tier": tier,
                "notes": note,
            }

    merged = list(existing_rows)
    for key in sorted(candidates, key=lambda k: (candidates[k]["date"], k)):
        row = {k: v for k, v in candidates[key].items() if k != "_rank"}
        validate_drop_row(row, f"candidate {key}")
        merged.append(row)
        seen_keys.add(key)
    return merged, len(candidates)


def iter_complete_months(epoch, rd):
    y, m = epoch.year, epoch.month
    while True:
        last_day = calendar.monthrange(y, m)[1]
        start = date(y, m, 1)
        end = date(y, m, last_day)
        if end >= rd:
            break
        yield start, end
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1


def median_gap_rows(series, run_date, drop_rows):
    epoch = parse_iso_date(series.get("epoch", "2024-06-01"), "series epoch")
    rd = parse_iso_date(run_date, "run_date")
    by_series = collections.defaultdict(list)
    for r in drop_rows:
        by_series[r["series"]].append((parse_iso_date(r["date"], "drop date"), r["model"]))
    for s in by_series:
        by_series[s].sort(key=lambda item: item[0])

    tool_names = [t["name"] for t in series.get("tools", [])] or sorted(by_series)
    out = []
    for name in tool_names:
        entries = by_series.get(name, [])
        for start, end in iter_complete_months(epoch, rd):
            upto = [d for d, _ in entries if d <= end]
            med = trailing_median_gap(upto)
            if med is None:
                continue
            meta = {"drops": len(upto), "last_drop": upto[-1].isoformat()}
            out.append([name, start.isoformat(), end.isoformat(), "monthly", med, "/model-drops.html", json.dumps(meta)])
    return out


def monthly_drop_rows(series, run_date, drop_rows):
    epoch = parse_iso_date(series.get("epoch", "2023-01-01"), "series epoch")
    rd = parse_iso_date(run_date, "run_date")
    parsed = [(parse_iso_date(r["date"], "drop date"), r["vendor"], r["tier"]) for r in drop_rows]

    buckets = {
        "All tracked labs": lambda v, t: True,
        "Frontier tier": lambda v, t: t == "frontier",
        "US labs": lambda v, t: v in US_VENDORS,
        "Chinese labs": lambda v, t: v in CN_VENDORS,
        "European labs": lambda v, t: v in EU_VENDORS,
    }
    for vendor in sorted(US_VENDORS | CN_VENDORS | EU_VENDORS):
        buckets[vendor] = lambda v, t, target=vendor: v == target

    tool_names = [t["name"] for t in series.get("tools", [])] or list(buckets)
    out = []
    for name in tool_names:
        pred = buckets.get(name)
        if pred is None:
            raise CollectorDataError(f"unknown monthly_drops bucket {name!r}")
        for start, end in iter_complete_months(epoch, rd):
            count = sum(1 for d, v, t in parsed if start <= d <= end and pred(v, t))
            out.append([name, start.isoformat(), end.isoformat(), "monthly", count, "/model-drops.tsv", 1])
    return out


def series_rows(series, run_date, drop_rows):
    metric = series.get("metric")
    if metric == "median_gap":
        return median_gap_rows(series, run_date, drop_rows)
    if metric == "monthly_drops":
        return monthly_drop_rows(series, run_date, drop_rows)
    raise CollectorDataError(f"unknown model-halflife metric: {metric!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--run-date")
    ap.add_argument("--no-update-tsv", action="store_true", help="compute CSV rows from model-drops.tsv without fetching OpenRouter")
    args = ap.parse_args()

    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    series = next((s for s in config["series"] if s["id"] == args.series), None)
    if not series or series.get("kind") != "model-halflife":
        sys.exit(f"{args.series} is not a model-halflife series")

    run_date = args.run_date or date.today().isoformat()
    drop_rows = read_drops_tsv(MODEL_DROPS_TSV)
    if not args.no_update_tsv:
        drop_rows, added = refresh_drops_from_openrouter(drop_rows, run_date)
        if added:
            write_drops_tsv(MODEL_DROPS_TSV, drop_rows)
            print(f"added {added} headline drops to {os.path.relpath(MODEL_DROPS_TSV, ROOT)}")

    rows = series_rows(series, run_date, drop_rows)
    out = os.path.join(DATA_DIR, f"{series['file_prefix']}-{run_date}.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url", "samples"])
        w.writerows(rows)
    print(f"wrote {len(rows)} monthly rows ({series['metric']}) to {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
