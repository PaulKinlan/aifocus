#!/usr/bin/env python3
"""Probe for the stats collectors' guards (aifocus-waix and its findings).

    python3 -B tests/helpers/stats-collectors-probe.py <case>

One case per invocation, no network: urllib.request.urlopen and time.sleep are
stubbed, so every case drives the real collector functions against a crafted
third-party response. Prints "OK <case>" and exits 0 on success; raises (and so
exits non-zero with a traceback) when the guard under test does not hold.

The cases exist because nothing else in the gate touches this surface: the fast
gate runs the site build, the unit tests and build.py --check on already
committed CSVs, so a range check that rejects every real row (aifocus-ty1k) or a
data error swallowed by the retry loop (aifocus-fi9t) used to read as green.
"""

import csv
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from email.message import Message

ROOT = pathlib.Path(__file__).resolve().parents[2]
STATS = ROOT / "tools" / "stats"


def load(name, rel_path):
    """Import a hyphenated collector module by path, with tools/stats importable."""
    stats = str(STATS)
    if stats not in sys.path:
        sys.path.insert(0, stats)
    spec = importlib.util.spec_from_file_location(name, ROOT / rel_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sys.path.insert(0, str(STATS)) if str(STATS) not in sys.path else None
import collector_common as common  # noqa: E402  (the same module the collectors import)


class FakeResponse:
    """The subset of http.client.HTTPResponse the collectors use."""

    def __init__(self, body, headers=None):
        self._body = body.encode("utf-8") if isinstance(body, str) else body
        self.headers = headers or {}

    def read(self, amt=None):
        return self._body if amt is None else self._body[:amt]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class StreamingResponse(FakeResponse):
    """A response that yields no more than the caller asks for, and records how
    much it handed out, so a case can assert how much of a body a collector
    buffered before refusing it (aifocus-r6mb)."""

    def __init__(self, size, headers=None):
        self._size = size
        self._pos = 0
        self.consumed = 0
        self.headers = headers or {}

    def read(self, amt=None):
        n = self._size - self._pos if amt is None else min(amt, self._size - self._pos)
        self._pos += n
        self.consumed += n
        return b"x" * n


class Stub:
    """Replace urlopen/time.sleep for one case, and record what was called."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0
        self.sleeps = []

    def urlopen(self, req, timeout=None):
        self.calls += 1
        item = self.responses[min(self.calls - 1, len(self.responses) - 1)]
        if isinstance(item, Exception):
            raise item
        return item

    def sleep(self, seconds):
        self.sleeps.append(seconds)

    def __enter__(self):
        self._urlopen = urllib.request.urlopen
        self._sleep = time.sleep
        urllib.request.urlopen = self.urlopen
        time.sleep = self.sleep
        return self

    def __exit__(self, *exc):
        urllib.request.urlopen = self._urlopen
        time.sleep = self._sleep
        return False


def http_error(code, body, headers=None):
    msg = Message()
    for key, value in (headers or {}).items():
        msg[key] = value
    return urllib.error.HTTPError("https://api.github.com/search/commits", code, "err", msg, io.BytesIO(body.encode("utf-8")))


def expect_data_error(fn, label):
    try:
        fn()
    except common.CollectorDataError:
        return
    raise AssertionError(f"{label}: expected CollectorDataError, nothing was raised")


def aligned_week(offset_days=60):
    """The start of a chromestatus week (7-day steps from a series epoch) that
    ended well before today, so a case does not depend on the machine's date."""
    epoch = date(2020, 1, 1)
    target = date.today() - timedelta(days=offset_days)
    return epoch + timedelta(days=7 * ((target - epoch).days // 7))


# --- collector_common: the capped read every fetch_capped caller relies on ---
# aifocus-r6mb: the probe only drove collect-github.py, which inlines its own
# read(MAX+1) check, so the shared fetch_capped() could lose its cap and the
# probe stayed green. These cases pin the shared path directly.

def case_common_over_cap_body_refused():
    body = "x" * (common.MAX_RESPONSE_BYTES + 1)
    with Stub([FakeResponse(body)]):
        expect_data_error(lambda: common.fetch_capped("https://example.test/over-cap"),
                          "collector_common over-cap body")
    with Stub([FakeResponse(body)]):
        expect_data_error(lambda: common.fetch_json_capped("https://example.test/over-cap"),
                          "collector_common over-cap json body")


def case_common_read_is_bounded():
    # Refusing an over-cap body is not enough on its own: resp.read() with no
    # amount also ends in the same raise, but only after buffering the whole
    # hostile response. Pin the bounded read by asserting how much was consumed.
    resp = StreamingResponse(8 * common.MAX_RESPONSE_BYTES)
    with Stub([resp]):
        expect_data_error(lambda: common.fetch_capped("https://example.test/huge"),
                          "collector_common huge body")
    assert resp.consumed <= common.MAX_RESPONSE_BYTES + 1, (
        f"fetch_capped buffered {resp.consumed} bytes before refusing a "
        f"{8 * common.MAX_RESPONSE_BYTES}-byte body")


def case_common_accepts_body_at_cap():
    # the boundary itself must be accepted, so an off-by-one (>= instead of >)
    # fails here rather than in a collector run against a real 1 MiB feed
    body = "x" * common.MAX_RESPONSE_BYTES
    with Stub([FakeResponse(body)]):
        assert common.fetch_capped("https://example.test/at-cap") == body
    with Stub([FakeResponse(json.dumps({"ok": True}))]):
        assert common.fetch_json_capped("https://example.test/at-cap-json") == {"ok": True}


# --- httparchive: adoption is an origin count, validated finite and >= 0 ------

def httparchive_run(body, run_date="2026-11-09"):
    """Run collect-httparchive.main() against a stubbed response, return CSV rows."""
    mod = load("stats_collect_httparchive", "tools/stats/collect-httparchive.py")
    tmp = pathlib.Path(tempfile.mkdtemp())
    data = tmp / "data"
    data.mkdir()
    config = tmp / "series.json"
    config.write_text(json.dumps({"series": [{
        "id": "react-test",
        "kind": "httparchive",
        "technology": "React",
        "epoch": "2020-01-01",
        "file_prefix": "httparchive-react-test",
        "tools": [{"name": "React origins (mobile)", "client": "mobile", "rank": "ALL"}],
    }]}), encoding="utf-8")
    mod.CONFIG = str(config)
    mod.DATA_DIR = str(data)
    argv = sys.argv
    sys.argv = ["collect-httparchive.py", "--series", "react-test", "--run-date", run_date]
    try:
        with Stub([FakeResponse(json.dumps(body) if not isinstance(body, str) else body)]):
            mod.main()
    finally:
        sys.argv = argv
    written = next(data.glob("*.csv"))
    with written.open(encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def case_httparchive_accepts_origin_counts():
    # the live API's real shape: hundreds of thousands to millions of origins
    rows = httparchive_run([
        {"date": "2020-01-01", "adoption": {"desktop": 151991, "mobile": 300475}},
        {"date": "2026-09-01", "adoption": {"desktop": 878286, "mobile": 1312185}},
    ])
    assert rows[0][0] == "tool", rows[0]
    counts = [row[4] for row in rows[1:]]
    assert counts == ["300475", "1312185"], counts


def case_httparchive_rejects_nan():
    expect_data_error(lambda: httparchive_run([
        {"date": "2026-09-01", "adoption": {"mobile": float("nan")}},
    ]), "httparchive NaN adoption")


def case_httparchive_rejects_negative():
    expect_data_error(lambda: httparchive_run([
        {"date": "2026-09-01", "adoption": {"mobile": -1}},
    ]), "httparchive negative adoption")


# --- w3techs: fetch through the shared cap, validate each share -------------

def w3techs_page(values, months=("Jan", "Feb", "Mar", "Apr", "May", "Jun")):
    """A page shaped like the W3Techs history table: a header row of monthly
    readings and one row per library."""
    head = "<tr><th>Technology</th>" + "".join(f"<th>2026 1 {m}</th>" for m in months) + "</tr>"
    row = "<tr><td>React</td>" + "".join(f"<td>{v}</td>" for v in values) + "</tr>"
    return f"<table>{head}{row}</table>"


def w3techs_main(page, run_date="2026-11-09"):
    """Run collect-w3techs.main() against a stubbed page, return the CSV rows."""
    mod = load("stats_collect_w3techs", "tools/stats/collect-w3techs.py")
    tmp = pathlib.Path(tempfile.mkdtemp())
    data = tmp / "data"
    data.mkdir()
    config = tmp / "series.json"
    config.write_text(json.dumps({"series": [{
        "id": "react-test",
        "kind": "w3techs",
        "file_prefix": "w3techs-react-test",
        "tools": [{"name": "React"}],
    }]}), encoding="utf-8")
    mod.CONFIG = str(config)
    mod.DATA_DIR = str(data)
    argv = sys.argv
    sys.argv = ["collect-w3techs.py", "--series", "react-test", "--run-date", run_date]
    try:
        with Stub([page if isinstance(page, FakeResponse) else FakeResponse(page)]):
            mod.main()
    finally:
        sys.argv = argv
    written = next(data.glob("*.csv"))
    with written.open(encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def case_w3techs_accepts_monthly_share():
    rows = w3techs_main(w3techs_page(["42.5%", "43.1%", "43.8%", "44.0%", "44.6%", "45.2%"]))
    assert rows[0][0] == "tool", rows[0]
    assert [row[0] for row in rows[1:]] == ["React"] * 6, rows
    # a reading on the 1st describes the month that just ended
    assert rows[1][1:5] == ["2025-12-01", "2025-12-31", "monthly", "42.5"], rows[1]
    assert rows[-1][1:5] == ["2026-05-01", "2026-05-31", "monthly", "45.2"], rows[-1]


def case_w3techs_rejects_impossible_share():
    for bad in ("101%", "-1%", "NaN%"):
        expect_data_error(lambda b=bad: w3techs_main(w3techs_page(["42.5%"] * 5 + [b])),
                          f"w3techs share {bad}")


def case_w3techs_over_cap_body_refused():
    expect_data_error(lambda: w3techs_main("<table>" + "x" * (common.MAX_RESPONSE_BYTES + 1)),
                      "w3techs over-cap body")


# --- chromestatus: fetch through the shared cap, validate each day value -----

def chromestatus_main(points, run_date="2026-11-09"):
    """Run collect-chromestatus.main() against a stubbed timeline, return rows."""
    mod = load("stats_collect_chromestatus", "tools/stats/collect-chromestatus.py")
    tmp = pathlib.Path(tempfile.mkdtemp())
    data = tmp / "data"
    data.mkdir()
    config = tmp / "series.json"
    config.write_text(json.dumps({"series": [{
        "id": "sw-test",
        "kind": "chromestatus",
        "bucket_id": 9999,
        "primary": "ServiceWorkerPageLoads",
        "epoch": "2020-01-01",
        "file_prefix": "chromestatus-sw-test",
    }]}), encoding="utf-8")
    mod.CONFIG = str(config)
    mod.DATA_DIR = str(data)
    body = points if isinstance(points, (str, bytes)) else ")]}'\n" + json.dumps(points)
    argv = sys.argv
    sys.argv = ["collect-chromestatus.py", "--series", "sw-test", "--run-date", run_date]
    try:
        with Stub([FakeResponse(body)]):
            mod.main()
    finally:
        sys.argv = argv
    written = next(data.glob("*.csv"))
    with written.open(encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def case_chromestatus_accepts_weekly_mean():
    # two readings inside one epoch-aligned week: the row is their mean, as a
    # percentage of page loads rounded to three decimals. The XSSI prefix the
    # live endpoint sends is part of the case.
    week = aligned_week()
    points = [
        {"date": (week + timedelta(days=1)).isoformat(), "day_percentage": 0.01, "property_name": "ServiceWorkerPageLoads"},
        {"date": (week + timedelta(days=2)).isoformat(), "day_percentage": 0.03, "property_name": "ServiceWorkerPageLoads"},
    ]
    rows = chromestatus_main(points)
    assert rows[0][0] == "tool", rows[0]
    assert len(rows) == 2, rows
    assert rows[1][0] == "ServiceWorkerPageLoads", rows[1]
    assert rows[1][1:5] == [week.isoformat(), (week + timedelta(days=6)).isoformat(), "weekly", "2.0"], rows[1]


def case_chromestatus_rejects_impossible_day_percentage():
    week = aligned_week()
    for bad in (101, -1, float("nan"), float("inf")):
        points = [{"date": week.isoformat(), "day_percentage": bad}]
        expect_data_error(lambda p=points: chromestatus_main(p),
                          f"chromestatus day_percentage {bad!r}")


def case_chromestatus_over_cap_body_refused():
    expect_data_error(lambda: chromestatus_main("x" * (common.MAX_RESPONSE_BYTES + 1)),
                      "chromestatus over-cap body")


# --- openrouter: every macro category's share is validated -------------------

def task_spend(tokens_share, spend_share=None):
    spend_share = tokens_share if spend_share is None else spend_share
    return {"data": {
        "tokens": {"windowDays": 30, "macroCategories": [
            {"key": "code", "label": "Code", "spendShare": tokens_share},
            {"key": "agent", "label": "Agent", "spendShare": tokens_share},
        ]},
        "spend": {"windowDays": 30, "macroCategories": [
            {"key": "code", "label": "Code", "spendShare": spend_share},
            {"key": "agent", "label": "Agent", "spendShare": spend_share},
        ]},
    }}


def share_rows_for(payload):
    mod = load("stats_collect_openrouter", "tools/stats/collect-openrouter.py")
    return mod.share_rows({}, "2026-11-09", payload)


def case_openrouter_rejects_hostile_token_shares():
    # tokens bad, spend good: a regression that stops validating the tokens
    # block is visible on its own (aifocus-r6mb).
    for bad in (float("nan"), float("inf"), 1e9, -0.1):
        expect_data_error(lambda b=bad: share_rows_for(task_spend(b, 0.30)),
                          f"openrouter token share {bad!r}")


def case_openrouter_rejects_hostile_spend_shares():
    # tokens good, spend bad: the case the old single-share fixture could not
    # distinguish, because it set both blocks bad at once.
    for bad in (float("nan"), float("inf"), 1e9, -0.1):
        expect_data_error(lambda b=bad: share_rows_for(task_spend(0.40, b)),
                          f"openrouter spend share {bad!r}")


def chart_rows_for(ys, run_date="2026-11-09", share=0.42, x="2026-10-26"):
    mod = load("stats_collect_openrouter", "tools/stats/collect-openrouter.py")
    payload = {"data": {"data": [{"x": x, "ys": ys}]}}
    with Stub([FakeResponse(json.dumps(payload))]):
        return mod.chart_rows({"id": "openrouter-tokens", "kind": "openrouter-chart"},
                              run_date, task_spend(share))


def case_openrouter_accepts_chart_tokens():
    rows = chart_rows_for({"Model A": 1000, "Others": 40})
    assert [row[0] for row in rows] == ["All tokens per week", "Programming tokens per week (estimate)"], rows
    assert rows[0][4] == 1040, rows[0]
    assert rows[1][4] == round(1040 * 0.42), rows[1]
    samples = json.loads(rows[0][6])
    assert samples == {"models": 1, "others": 40}, samples


def case_openrouter_rejects_hostile_chart_tokens():
    for bad in (float("nan"), float("inf"), -1):
        expect_data_error(lambda b=bad: chart_rows_for({"Model A": 1000, "Others": b}),
                          f"openrouter chart tokens Others={bad!r}")


def case_openrouter_accepts_real_shares():
    rows = share_rows_for(task_spend(0.42, 0.30))
    tokens = [row[4] for row in rows if row[0].endswith("share of tokens (30 days)")]
    spend = [row[4] for row in rows if row[0].endswith("share of spend (30 days)")]
    assert tokens == [42.0, 42.0], tokens
    assert spend == [30.0, 30.0], spend
    assert json.loads(rows[0][6])["window_days"] == 30, rows[0]


def case_openrouter_rejects_window_days():
    # both blocks, because each is validated on its own path (aifocus-r6mb)
    for which in ("tokens", "spend"):
        payload = task_spend(0.4)
        payload["data"][which]["windowDays"] = float("nan")
        expect_data_error(lambda p=payload: share_rows_for(p), f"openrouter windowDays NaN ({which})")


# --- github: data errors fail loud and are not retried ----------------------

def searcher():
    mod = load("stats_collect_github", "tools/stats/collect-github.py")
    return mod, mod.Searcher("token", "commits")


def case_github_data_error_not_retried():
    mod, s = searcher()
    body = json.dumps({"total_count": -5})
    with Stub([FakeResponse(body)]) as stub:
        expect_data_error(lambda: s.count("is:pr"), "github negative total_count")
        assert stub.calls == 1, f"expected one attempt, made {stub.calls}"
        assert stub.sleeps == [], f"expected no retry sleeps, got {stub.sleeps}"


def case_github_over_cap_body_refused():
    mod, s = searcher()
    body = '{"total_count": 1}' + " " * (mod.MAX_RESPONSE_BYTES + 1)
    with Stub([FakeResponse(body)]) as stub:
        expect_data_error(lambda: s.count("is:pr"), "github over-cap body")
        assert stub.calls == 1, f"expected one attempt, made {stub.calls}"
        assert stub.sleeps == [], f"expected no retry sleeps, got {stub.sleeps}"


def case_github_error_body_is_capped():
    # aifocus-dv21: the HTTPError path read the whole error body
    mod, s = searcher()
    huge = "x" * (mod.MAX_RESPONSE_BYTES + 1)
    with Stub([http_error(500, huge)]) as stub:
        expect_data_error(lambda: s.count("is:pr"), "github over-cap error body")
        assert stub.calls == 1, f"expected one attempt, made {stub.calls}"
        assert stub.sleeps == [], f"expected no retry sleeps, got {stub.sleeps}"


def case_github_happy_path():
    mod, s = searcher()
    with Stub([FakeResponse(json.dumps({"total_count": 42}))]) as stub:
        assert s.count("is:pr") == 42
        assert stub.calls == 1, stub.calls
        assert stub.sleeps == [], stub.sleeps


def case_github_network_error_still_retries():
    # a transient network failure is retryable; only data errors are not
    mod, s = searcher()
    with Stub([OSError("connection reset"), FakeResponse(json.dumps({"total_count": 7}))]) as stub:
        assert s.count("is:pr") == 7
        assert stub.calls == 2, stub.calls
        assert len(stub.sleeps) == 1, stub.sleeps


# --- collector_common: the shared numeric guards, on their own ----------------
# Every collector validates through finite_in_range()/non_negative_int(), but the
# cases above only reach them through a collector's happy shape. A guard that
# accepted the wrong TYPE (aifocus-6c7d: JSON `true` became the count 1) or let
# non-numeric text through as NaN could therefore stay green, because the shape
# the collector happens to produce never exercises it. These cases drive the
# helpers directly, with the inputs a broken feed actually produces: a missing
# field (None), text that is not a number, and a JSON boolean.

def case_common_rejects_non_numeric():
    for bad in ("n/a", "1,312,185", "NaN%", "", " ", None, [], {}, object()):
        expect_data_error(lambda b=bad: common.non_negative_int(b, "origin count"),
                          f"non_negative_int {bad!r}")
        expect_data_error(lambda b=bad: common.finite_in_range(b, 0, None, "origin count"),
                          f"finite_in_range {bad!r}")
    # ...while the value types the collectors do hand over still pass, including
    # the numeric text a scraped table yields
    assert common.non_negative_int(1312185, "origin count") == 1312185
    assert common.non_negative_int("42", "origin count") == 42
    assert common.non_negative_int(0.0, "origin count") == 0
    assert common.finite_in_range("0.42", 0, 1, "share") == 0.42


def case_common_rejects_non_finite():
    for bad in (float("nan"), float("inf"), float("-inf")):
        expect_data_error(lambda b=bad: common.non_negative_int(b, "origin count"),
                          f"non_negative_int {bad!r}")
        expect_data_error(lambda b=bad: common.finite_in_range(b, 0, None, "count"),
                          f"finite_in_range {bad!r}")


def case_common_rejects_boolean():
    # json.loads parses `true` into a bool, which is an int subclass: without the
    # isinstance check in finite_in_range(), {"total_count": true} published 1
    # (aifocus-6c7d). Both spellings must raise, at both entry points.
    for bad in (True, False):
        expect_data_error(lambda b=bad: common.non_negative_int(b, "origin count"),
                          f"non_negative_int {bad!r}")
        expect_data_error(lambda b=bad: common.finite_in_range(b, 0, 1, "share"),
                          f"finite_in_range {bad!r}")


def case_common_range_bounds():
    # a share is a fraction, so [0, 1] is inclusive at both ends; a count is
    # non-negative with no upper bound. Off-by-one in either direction publishes
    # a wrong statistic instead of failing the run.
    assert common.finite_in_range(0, 0, 1, "share") == 0
    assert common.finite_in_range(1, 0, 1, "share") == 1
    assert common.finite_in_range(0.42, 0, 1, "share") == 0.42
    assert common.finite_in_range(1312185, 0, None, "count") == 1312185
    for bad in (-0.0001, 1.0001, 1e9):
        expect_data_error(lambda b=bad: common.finite_in_range(b, 0, 1, "share"),
                          f"finite_in_range share {bad!r}")
    # an unbounded count only rejects the negative side; large values are real
    # (1312185 origins) and must not be capped
    for bad in (-1, -0.5):
        expect_data_error(lambda b=bad: common.finite_in_range(b, 0, None, "count"),
                          f"finite_in_range count {bad!r}")


# --- model-gap: schedule + chromestatus milestone features guarded ------------

def model_gap_fixture():
    return {
        "updated": "2026-06-07",
        "cutoffBasis": "published cutoff",
        "note": "fixture",
        "models": [
            {"vendor": "Google", "model": "Gemini 3 Pro", "cutoff": "2025-01-31", "cutoffLabel": "January 2025",
             "card": "https://deepmind.google/models/model-cards/gemini-3-pro/"},
        ],
        "chromeMilestones": [
            {"m": 132, "date": "2025-01-14", "features": ["css-inertness"]},
        ],
    }


def cs_mstone(enabled=(), rollout=(), deprecated=(), removed=(), ot=(), flag=()):
    def items(names, base):
        return [{"id": base + i, "name": n} for i, n in enumerate(names)]
    return ")]}'\n" + json.dumps({"features_by_type": {
        "Enabled by default": items(enabled, 1000),
        "Stepped rollout": items(rollout, 2000),
        "Deprecated": items(deprecated, 3000),
        "Removed": items(removed, 4000),
        "Origin trial": items(ot, 5000),
        "In developer trial (Behind a flag)": items(flag, 6000),
    }})


def model_gap_main(schedule, milestone_responses, metric="releases", run_date="2025-03-10", doc=None):
    mod = load("stats_collect_model_gap", "tools/stats/collect-model-gap.py")
    tmp = pathlib.Path(tempfile.mkdtemp())
    data = tmp / "data"
    data.mkdir()
    mg_path = tmp / "model-gap.json"
    mg_path.write_text(json.dumps(doc or model_gap_fixture()), encoding="utf-8")
    config = tmp / "series.json"
    config.write_text(json.dumps({"series": [{
        "id": "mg-test",
        "kind": "model-gap",
        "metric": metric,
        "epoch": "2025-01-27",
        "file_prefix": "model-gap-test",
        "tools": [{"name": "Gemini 3 Pro"}],
    }]}), encoding="utf-8")
    mod.CONFIG = str(config)
    mod.DATA_DIR = str(data)
    mod.MODEL_GAP_JSON = str(mg_path)
    s_resp = schedule if isinstance(schedule, FakeResponse) else FakeResponse(
        schedule if isinstance(schedule, str) else json.dumps(schedule)
    )
    m_resps = [
        r if isinstance(r, FakeResponse) else FakeResponse(r if isinstance(r, str) else json.dumps(r))
        for r in milestone_responses
    ]
    argv = sys.argv
    sys.argv = ["collect-model-gap.py", "--series", "mg-test", "--run-date", run_date]
    try:
        with Stub([s_resp, *m_resps]):
            mod.main()
    finally:
        sys.argv = argv
    written = next(data.glob("*.csv"))
    with written.open(encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))
    return rows, json.loads(mg_path.read_text(encoding="utf-8"))


def case_model_gap_accepts_releases_and_features():
    schedule = {"mstones": [
        {"mstone": 133, "stable_date": "2025-02-04T00:00:00"},
        {"mstone": 134, "stable_date": "2025-03-04T00:00:00"},
        {"mstone": 135, "stable_date": "2025-04-01T00:00:00"},
    ]}
    m132 = cs_mstone(enabled=["CSS inertness"])
    # Origin trials and developer-flag items must be excluded from shipped counts
    m133 = cs_mstone(enabled=["Dialog light dismiss"], rollout=["Popover hint"], ot=["Experimental OT"], flag=["Flagged"])
    m134 = cs_mstone(enabled=["CSS shape() function"])
    rel_rows, updated = model_gap_main(schedule, [m132, m133, m134], metric="releases")
    # 135 is after run_date (2025-03-10), so omitted
    assert [ms["m"] for ms in updated["chromeMilestones"]] == [132, 133, 134], updated
    assert updated["chromeMilestones"][1]["features"] == ["dialog-light-dismiss", "popover-hint"], updated
    assert [r[4] for r in rel_rows[1:]] == ["0", "1", "1", "1", "1", "2"], rel_rows
    feat_rows, _ = model_gap_main(schedule, [m132, m133, m134], metric="features")
    assert [r[4] for r in feat_rows[1:]] == ["0", "2", "2", "2", "2", "3"], feat_rows


def case_model_gap_rejects_bad_milestone_or_date():
    good_cs = [cs_mstone(enabled=["Popover hint"])] * 3
    for bad_m in (0, 1001, True, 133.5, "abc", float("nan")):
        expect_data_error(
            lambda b=bad_m: model_gap_main({"mstones": [{"mstone": b, "stable_date": "2025-02-04"}]}, good_cs),
            f"model-gap bad mstone {bad_m!r}",
        )
    for bad_date in ("not-a-date", "2025-13-40", "", None, 20250204):
        expect_data_error(
            lambda d=bad_date: model_gap_main({"mstones": [{"mstone": 133, "stable_date": d}]}, good_cs),
            f"model-gap bad stable_date {bad_date!r}",
        )


def case_model_gap_rejects_bad_chromestatus_feature():
    sched = {"mstones": [{"mstone": 133, "stable_date": "2025-02-04T00:00:00"}]}
    m132 = cs_mstone(enabled=["CSS inertness"])
    for bad_payload in (
        {"features_by_type": "not-a-dict"},
        {"features_by_type": {"Enabled by default": [{"id": True, "name": "Bad bool id"}]}},
        {"features_by_type": {"Enabled by default": [{"id": -5, "name": "Negative id"}]}},
        {"features_by_type": {"Enabled by default": [{"id": 1, "name": "   "}]}},
    ):
        expect_data_error(
            lambda p=bad_payload: model_gap_main(sched, [m132, p]),
            f"model-gap bad chromestatus payload {bad_payload!r}",
        )


def case_model_gap_over_cap_body_refused():
    huge = "x" * (common.MAX_RESPONSE_BYTES + 1)
    good_sched = {"mstones": [{"mstone": 133, "stable_date": "2025-02-04T00:00:00"}]}
    expect_data_error(lambda: model_gap_main(huge, [cs_mstone(enabled=["Popover hint"])]),
                      "model-gap over-cap schedule")
    expect_data_error(lambda: model_gap_main(good_sched, [huge]),
                      "model-gap over-cap chromestatus")


# --- model-halflife: OpenRouter catalogue guarded + deduplicated before TSV ---

def model_halflife_main(payload, metric="median_gap", run_date="2026-10-05"):
    mod = load("stats_collect_model_halflife", "tools/stats/collect-model-halflife.py")
    tmp = pathlib.Path(tempfile.mkdtemp())
    data = tmp / "data"
    data.mkdir()
    tsv_path = tmp / "model-drops.tsv"
    tsv_path.write_text(
        "date\tvendor\tseries\tmodel\ttier\tnotes\n"
        "2026-02-05\tAnthropic\tClaude Opus\tClaude Opus 4.6\tfrontier\tseed\n"
        "2026-04-16\tAnthropic\tClaude Opus\tClaude Opus 4.7\tfrontier\tseed\n",
        encoding="utf-8",
    )
    tools = [{"name": "Claude Opus"}] if metric == "median_gap" else [{"name": "All tracked labs"}, {"name": "Frontier tier"}]
    config = tmp / "series.json"
    config.write_text(json.dumps({"series": [{
        "id": "mh-test",
        "kind": "model-halflife",
        "metric": metric,
        "epoch": "2026-04-01",
        "file_prefix": "model-halflife-test",
        "tools": tools,
    }]}), encoding="utf-8")
    mod.CONFIG = str(config)
    mod.DATA_DIR = str(data)
    mod.MODEL_DROPS_TSV = str(tsv_path)
    body = payload if isinstance(payload, (str, FakeResponse)) else json.dumps(payload)
    argv = sys.argv
    sys.argv = ["collect-model-halflife.py", "--series", "mh-test", "--run-date", run_date]
    try:
        with Stub([body if isinstance(body, FakeResponse) else FakeResponse(body)]):
            mod.main()
    finally:
        sys.argv = argv
    written = next(data.glob("*.csv"))
    with written.open(encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))
    return rows, tsv_path.read_text(encoding="utf-8").splitlines()


def case_model_halflife_accepts_and_dedups_drops():
    from datetime import datetime, timezone
    ts = lambda y, m, d: int(datetime(y, m, d, tzinfo=timezone.utc).timestamp())
    payload = {"data": [
        # already in TSV (4.7) -> must not duplicate
        {"id": "anthropic/claude-opus-4.7", "created": ts(2026, 5, 15), "architecture": {"output_modalities": ["text"]}},
        # new headline drop + its :batch twin (must collapse to one row)
        {"id": "anthropic/claude-opus-4.8", "created": ts(2026, 5, 27), "architecture": {"output_modalities": ["text"]}},
        {"id": "anthropic/claude-opus-4.8:batch", "created": ts(2026, 5, 27), "architecture": {"output_modalities": ["text"]}},
        # image-output variant (must be skipped)
        {"id": "google/gemini-3-pro-image", "created": ts(2026, 6, 18), "architecture": {"output_modalities": ["image", "text"]}},
        # another Opus drop (5) on 2026-07-24
        {"id": "anthropic/claude-opus-5", "created": ts(2026, 7, 24), "architecture": {"output_modalities": ["text"]}},
    ]}
    gap_rows, tsv_lines = model_halflife_main(payload, metric="median_gap")
    # header + 2 seed rows + 2 synced Opus rows (4.8 and 5) = 5 lines
    assert len(tsv_lines) == 5, tsv_lines
    # Gaps: 02-05->04-16 = 70d; 04-16->05-27 = 41d (median of [41,70] = 55.5 -> 56);
    # 05-27->07-24 = 58d (median of [41,58,70] = 58).
    # Complete months Apr..Sep 2026 + partial Oct (2026-10-01..2026-10-05):
    assert [r[4] for r in gap_rows[1:]] == ["70", "56", "56", "58", "58", "58", "58"], gap_rows
    drop_rows, _ = model_halflife_main(payload, metric="monthly_drops")
    all_counts = [r[4] for r in drop_rows[1:] if r[0] == "All tracked labs"]
    assert all_counts == ["1", "1", "0", "1", "0", "0", "0"], all_counts


def case_model_halflife_rejects_hostile_created():
    for bad in (float("nan"), float("inf"), True, -1, "yesterday", None, 99999999999):
        payload = {"data": [{"id": "anthropic/claude-opus-5", "created": bad, "architecture": {"output_modalities": ["text"]}}]}
        expect_data_error(lambda p=payload: model_halflife_main(p), f"model-halflife created {bad!r}")


def case_model_halflife_over_cap_body_refused():
    mod = load("stats_collect_model_halflife", "tools/stats/collect-model-halflife.py")
    resp = StreamingResponse(4 * mod.MODEL_LIST_MAX_BYTES)
    expect_data_error(lambda: model_halflife_main(resp), "model-halflife over-cap body")
    assert resp.consumed <= mod.MODEL_LIST_MAX_BYTES + 1, resp.consumed


CASES = {
    "common-rejects-non-numeric": case_common_rejects_non_numeric,
    "common-rejects-non-finite": case_common_rejects_non_finite,
    "common-rejects-boolean": case_common_rejects_boolean,
    "common-range-bounds": case_common_range_bounds,
    "common-over-cap-body-refused": case_common_over_cap_body_refused,
    "common-read-is-bounded": case_common_read_is_bounded,
    "common-accepts-body-at-cap": case_common_accepts_body_at_cap,
    "httparchive-accepts-origin-counts": case_httparchive_accepts_origin_counts,
    "httparchive-rejects-nan": case_httparchive_rejects_nan,
    "httparchive-rejects-negative": case_httparchive_rejects_negative,
    "w3techs-accepts-monthly-share": case_w3techs_accepts_monthly_share,
    "w3techs-rejects-impossible-share": case_w3techs_rejects_impossible_share,
    "w3techs-over-cap-body-refused": case_w3techs_over_cap_body_refused,
    "chromestatus-accepts-weekly-mean": case_chromestatus_accepts_weekly_mean,
    "chromestatus-rejects-impossible-day-percentage": case_chromestatus_rejects_impossible_day_percentage,
    "chromestatus-over-cap-body-refused": case_chromestatus_over_cap_body_refused,
    "openrouter-rejects-hostile-token-shares": case_openrouter_rejects_hostile_token_shares,
    "openrouter-rejects-hostile-spend-shares": case_openrouter_rejects_hostile_spend_shares,
    "openrouter-accepts-real-shares": case_openrouter_accepts_real_shares,
    "openrouter-rejects-window-days": case_openrouter_rejects_window_days,
    "openrouter-accepts-chart-tokens": case_openrouter_accepts_chart_tokens,
    "openrouter-rejects-hostile-chart-tokens": case_openrouter_rejects_hostile_chart_tokens,
    "model-gap-accepts-releases-and-features": case_model_gap_accepts_releases_and_features,
    "model-gap-rejects-bad-milestone-or-date": case_model_gap_rejects_bad_milestone_or_date,
    "model-gap-rejects-bad-chromestatus-feature": case_model_gap_rejects_bad_chromestatus_feature,
    "model-gap-over-cap-body-refused": case_model_gap_over_cap_body_refused,
    "model-halflife-accepts-and-dedups-drops": case_model_halflife_accepts_and_dedups_drops,
    "model-halflife-rejects-hostile-created": case_model_halflife_rejects_hostile_created,
    "model-halflife-over-cap-body-refused": case_model_halflife_over_cap_body_refused,
    "github-data-error-not-retried": case_github_data_error_not_retried,
    "github-over-cap-body-refused": case_github_over_cap_body_refused,
    "github-error-body-is-capped": case_github_error_body_is_capped,
    "github-happy-path": case_github_happy_path,
    "github-network-error-still-retries": case_github_network_error_still_retries,
}


def main(argv):
    if len(argv) == 2 and argv[1] == "all":
        for name in CASES:
            CASES[name]()
            print(f"OK {name}", flush=True)
        # the runner asserts a full case list, so an unknown case must not be
        # silently treated as "nothing to do" here either
        assert main(["probe.py", "no-such-case"]) == 2, "unknown case did not exit 2"
        print("OK unknown-case-refused", flush=True)
        return 0
    if len(argv) != 2 or argv[1] not in CASES:
        print("usage: stats-collectors-probe.py <all|" + "|".join(sorted(CASES)) + ">", file=sys.stderr)
        return 2
    CASES[argv[1]]()
    print(f"OK {argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
