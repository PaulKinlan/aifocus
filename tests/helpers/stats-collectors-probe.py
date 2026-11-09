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


def case_openrouter_rejects_hostile_shares():
    for bad in (float("nan"), float("inf"), 1e9, -0.1):
        expect_data_error(lambda b=bad: share_rows_for(task_spend(b)), f"openrouter share {bad!r}")


def case_openrouter_accepts_real_shares():
    rows = share_rows_for(task_spend(0.42, 0.30))
    tokens = [row[4] for row in rows if row[0].endswith("share of tokens (30 days)")]
    spend = [row[4] for row in rows if row[0].endswith("share of spend (30 days)")]
    assert tokens == [42.0, 42.0], tokens
    assert spend == [30.0, 30.0], spend
    assert json.loads(rows[0][6])["window_days"] == 30, rows[0]


def case_openrouter_rejects_window_days():
    payload = task_spend(0.4)
    payload["data"]["tokens"]["windowDays"] = float("nan")
    expect_data_error(lambda: share_rows_for(payload), "openrouter windowDays NaN")


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


CASES = {
    "httparchive-accepts-origin-counts": case_httparchive_accepts_origin_counts,
    "httparchive-rejects-nan": case_httparchive_rejects_nan,
    "httparchive-rejects-negative": case_httparchive_rejects_negative,
    "openrouter-rejects-hostile-shares": case_openrouter_rejects_hostile_shares,
    "openrouter-accepts-real-shares": case_openrouter_accepts_real_shares,
    "openrouter-rejects-window-days": case_openrouter_rejects_window_days,
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
