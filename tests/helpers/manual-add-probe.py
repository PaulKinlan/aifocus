#!/usr/bin/env python3
"""Probe for tools/stats/manual-add.py, the hand-read figure appender (aifocus-ejut).

    python3 -B tests/helpers/manual-add-probe.py <case>

One case per invocation, no network and no subprocess: CONFIG and DATA_DIR are
pointed at a scratch directory, stdin is stubbed for --paste, and build() is
replaced by a recorder so no case shells out to build.py. Prints "OK <case>" and
exits 0 on success; raises (and so exits non-zero with a traceback) when the
behaviour under test does not hold.

Why this exists: manual-add.py is the only stats tool that turns text a human
pasted into a published figure. It writes straight into
static/data/<file_prefix>.csv, which build.py then publishes on /stats/, and
nothing in the gate touched it: the collector probe drives the collectors, the
stats-build probe drives build.py, and grep found no reference to manual-add or
extract_builtwith in tests/ at all. So a regex fallback that stopped matching
real page text, a value coercion that raised a traceback instead of a usage
message, or a first append into a fresh series file that wrote no header (which
makes build.py's csv.DictReader read the first DATA row as the header) were all
invisible.

The cases are offline by construction: extract_builtwith takes text, append
takes a path, and main() is driven with --no-build or with build() stubbed.
"""

import csv
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
STATS = ROOT / "tools" / "stats"

# The published manual CSV header, taken from the file build.py actually reads
# rather than from a copy here: if append() and the committed file ever disagree
# about the column set, one of the cases below fails.
PUBLISHED = ROOT / "static" / "data" / "manual" / "react-builtwith.csv"
PUBLISHED_HEADER = PUBLISHED.read_text(encoding="utf-8").splitlines()[0].split(",")

CONFIG = {
    "series": [
        {
            "id": "react-builtwith",
            "title": "React (BuiltWith)",
            "kind": "manual",
            "unit": "sites",
            "file_prefix": "manual/react-builtwith",
            "tools": [
                {"name": "BuiltWith: React live sites", "method": "trends.builtwith.com/javascript/React"},
                {"name": "BuiltWith: React in top 1m", "method": "trends.builtwith.com/javascript/React"},
                {"name": "Read by hand", "method": "a page someone read by hand"},
            ],
        },
        {
            # A series that knows only the live-sites tool, so a pasted page
            # that also yields the top-1m figure drives the skip branch in
            # main()'s --paste loop.
            "id": "react-limited",
            "title": "React (BuiltWith, live sites only)",
            "kind": "manual",
            "unit": "sites",
            "file_prefix": "manual/react-limited",
            "tools": [{"name": "BuiltWith: React live sites", "method": "trends.builtwith.com/javascript/React"}],
        },
        {"id": "collected", "title": "Collected series", "kind": "collected", "file_prefix": "collected", "tools": []},
    ]
}


def load(name, rel_path):
    """Import a hyphenated tools/stats script by path, as the collectors probe does."""
    stats = str(STATS)
    if stats not in sys.path:
        sys.path.insert(0, stats)
    spec = importlib.util.spec_from_file_location(name, ROOT / rel_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def scratch():
    """A scratch target with the same shape as the repo: <root>/data/manual/*.csv."""
    tmp = tempfile.mkdtemp(prefix="manual-add-probe-")
    data = pathlib.Path(tmp) / "data"
    (data / "manual").mkdir(parents=True)
    config = pathlib.Path(tmp) / "series.json"
    config.write_text(json.dumps(CONFIG), encoding="utf-8")
    return tmp, data, config


def wired():
    """The real module with CONFIG and DATA_DIR pointed at a scratch target."""
    module = load("manual_add", "tools/stats/manual-add.py")
    tmp, data, config = scratch()
    module.CONFIG = str(config)
    module.DATA_DIR = str(data)
    return module, pathlib.Path(tmp) / "data" / "manual" / "react-builtwith.csv"


class Args:
    """The subset of argparse.Namespace append() reads."""

    def __init__(self, date="2026-11-12", url=None, note=""):
        self.date = date
        self.url = url
        self.note = note


class BuildRecorder:
    """Stands in for build(): the cases must not spawn build.py."""

    def __init__(self):
        self.calls = 0

    def __call__(self):
        self.calls += 1


def run_main(module, argv, stdin=""):
    """Drive main() with a given argv and stdin, returning what it exited with.

    Returns None when main() returned normally. sys.argv/stdin are restored even
    when the case fails, so one failure does not corrupt the next case.
    """
    recorder = BuildRecorder()
    module.build = recorder
    module._last_build_recorder = recorder
    previous_argv, previous_stdin = sys.argv, sys.stdin
    sys.argv = ["manual-add.py"] + list(argv)
    sys.stdin = io.StringIO(stdin)
    try:
        module.main()
        return None
    except SystemExit as exc:
        return exc.code
    finally:
        sys.argv, sys.stdin = previous_argv, previous_stdin
        module.build = lambda: None


def rows(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def expect_exit_message(code, fragment, case):
    assert isinstance(code, str), f"{case}: expected sys.exit(<message>), got {code!r} - a traceback is not a usage error"
    assert fragment in code, f"{case}: exit message {code!r} does not mention {fragment!r}"


# --- extract_builtwith: the two figures, every form the page uses -------------

def case_extract_forward_live_sites():
    module = load("manual_add", "tools/stats/manual-add.py")
    found = module.extract_builtwith("React is used by 55,123,456 live websites today")
    assert found.get("BuiltWith: React live sites") == 55123456, found


def case_extract_currently_live():
    module = load("manual_add", "tools/stats/manual-add.py")
    found = module.extract_builtwith("Detected on 1,234,567 currently live sites")
    assert found.get("BuiltWith: React live sites") == 1234567, found


def case_extract_reversed_live_sites():
    module = load("manual_add", "tools/stats/manual-add.py")
    # The reversed form: the phrase first, the number up to 40 non-digits later.
    found = module.extract_builtwith("Live websites using React: 42,000,000 in total")
    assert found.get("BuiltWith: React live sites") == 42000000, found


def case_extract_collapses_whitespace():
    module = load("manual_add", "tools/stats/manual-add.py")
    # A real copy/paste out of a browser breaks the phrase across lines and
    # indents; extract_builtwith flattens whitespace first, and the number has
    # to survive that.
    pasted = "React\n\n  55,123,456\n\n  live\n\n     websites\n"
    found = module.extract_builtwith(pasted)
    assert found.get("BuiltWith: React live sites") == 55123456, found


def case_extract_top_1m_forward():
    module = load("manual_add", "tools/stats/manual-add.py")
    found = module.extract_builtwith("Traffic rank: Top 1m: 165,432")
    assert found.get("BuiltWith: React in top 1m") == 165432, found


def case_extract_top_1m_reversed():
    module = load("manual_add", "tools/stats/manual-add.py")
    # The number first, then the label within 40 non-digits.
    found = module.extract_builtwith("165,432 of the sites measured sit in the top 1m")
    assert found.get("BuiltWith: React in top 1m") == 165432, found


def case_extract_top_million_forms():
    module = load("manual_add", "tools/stats/manual-add.py")
    for label in ("top 1,000,000", "top 1 million", "Top 1M"):
        found = module.extract_builtwith(f"{label}: 1,234")
        assert found.get("BuiltWith: React in top 1m") == 1234, (label, found)


def case_extract_both_figures():
    module = load("manual_add", "tools/stats/manual-add.py")
    pasted = "55,123,456 live websites\nTop 1m: 165,432\n"
    found = module.extract_builtwith(pasted)
    assert found == {"BuiltWith: React live sites": 55123456, "BuiltWith: React in top 1m": 165432}, found


def case_extract_no_match_is_empty():
    module = load("manual_add", "tools/stats/manual-add.py")
    assert module.extract_builtwith("Nothing on this page looks like a figure.") == {}
    assert module.extract_builtwith("") == {}


# --- append(): the URL default and the column set build.py reads -------------

def case_append_url_defaults_to_https():
    module, path = wired()
    module.append(
        {"file_prefix": "manual/react-builtwith"},
        {"Read by hand": {"method": "trends.builtwith.com/javascript/React"}},
        "Read by hand",
        1,
        Args(),
    )
    assert rows(path)[-1][5] == "https://trends.builtwith.com/javascript/React", rows(path)[-1]


def case_append_url_kept_verbatim():
    module, path = wired()
    module.append(
        {"file_prefix": "manual/react-builtwith"},
        {"Read by hand": {"method": "a page someone read by hand"}},
        "Read by hand",
        1,
        Args(),
    )
    # A method that is prose, not a bare host, is not turned into a URL.
    assert rows(path)[-1][5] == "a page someone read by hand", rows(path)[-1]


def case_append_url_override_wins():
    module, path = wired()
    module.append(
        {"file_prefix": "manual/react-builtwith"},
        {"Read by hand": {"method": "trends.builtwith.com/javascript/React"}},
        "Read by hand",
        1,
        Args(url="https://example.com/archive", note="n"),
    )
    assert rows(path)[-1][5] == "https://example.com/archive", rows(path)[-1]


def case_append_row_matches_published_header():
    module, path = wired()
    code = run_main(module, ["react-builtwith", "Read by hand", "58,200,000", "--date", "2026-11-12", "--no-build"])
    assert code is None, code
    written = rows(path)
    assert written[0] == PUBLISHED_HEADER, f"header {written[0]} != published {PUBLISHED_HEADER}"
    assert len(written[1]) == len(PUBLISHED_HEADER), written[1]
    assert written[1][0] == "Read by hand" and written[1][1] == "2026-11-12" and written[1][2] == "2026-11-12", written[1]
    assert written[1][3] == "snapshot" and written[1][4] == "58200000", written[1]


def case_append_new_file_gets_header():
    module, path = wired()
    assert not path.exists(), "the case starts from a series file that does not exist yet"
    module.append(
        {"file_prefix": "manual/react-builtwith"},
        {"Read by hand": {"method": "trends.builtwith.com/javascript/React"}},
        "Read by hand",
        7,
        Args(),
    )
    written = rows(path)
    # build.py reads this file with csv.DictReader, so a first append with no
    # header would make the first DATA row the header and lose it (aifocus-ejut).
    assert written[0] == PUBLISHED_HEADER, f"new file header {written[0]}"
    assert len(written) == 2 and written[1][4] == "7", written


# --- main(): the paste loop, the argument paths and the value coercion -------

def case_main_paste_skips_unknown_tools():
    module, _ = wired()
    path = pathlib.Path(module.DATA_DIR) / "manual" / "react-limited.csv"
    # The pasted page yields figures for flow names this series does not have -
    # here the top-1m one - so it is skipped rather than appended under a name
    # build.py would then have to publish.
    pasted = "999,999,999 live websites\nTop 1m: 165,432\n"
    code = run_main(module, ["react-limited", "--paste", "--date", "2026-11-12", "--no-build"], stdin=pasted)
    assert code is None, code
    written = rows(path)
    assert len(written) == 2, written
    assert written[1][0] == "BuiltWith: React live sites" and written[1][4] == "999999999", written[1]


def case_main_paste_no_figures_exits_clean():
    module, path = wired()
    code = run_main(module, ["react-builtwith", "--paste", "--no-build"], stdin="no figures here")
    expect_exit_message(code, "no figures found", "main-paste-no-figures")
    assert not path.exists(), "a failed paste must not create the series file"


def case_main_value_accepts_separators():
    module, path = wired()
    assert run_main(module, ["react-builtwith", "Read by hand", "58,200,000", "--date", "2026-11-12", "--no-build"]) is None
    assert run_main(module, ["react-builtwith", "Read by hand", "1_234_567", "--date", "2026-11-13", "--no-build"]) is None
    written = rows(path)
    assert written[1][4] == "58200000", written[1]
    assert written[2][4] == "1234567", written[2]


def case_main_value_keeps_fraction():
    module, path = wired()
    assert run_main(module, ["react-builtwith", "Read by hand", "1,234.5", "--date", "2026-11-12", "--no-build"]) is None
    assert rows(path)[1][4] == "1234.5", rows(path)[1]


def case_main_value_not_a_number_exits_clean():
    module, path = wired()
    # Before this bead the coercion raised a bare ValueError traceback, which
    # reads as a crash rather than as "the argument is wrong" (aifocus-ejut).
    code = run_main(module, ["react-builtwith", "Read by hand", "n/a", "--no-build"])
    expect_exit_message(code, "not a number", "main-value-not-a-number")
    assert not path.exists(), "a rejected value must not write a row"


def case_main_value_rejects_non_finite():
    module, path = wired()
    # float() accepts these spellings, and a NaN or infinite figure would be
    # published on /stats/ (the same class as aifocus-09r5).
    # A negative spelling never reaches the coercion: argparse reads a leading
    # '-' positional as an option and exits 2 on its own.
    for spelling in ("nan", "inf"):
        code = run_main(module, ["react-builtwith", "Read by hand", spelling, "--no-build"])
        expect_exit_message(code, "finite", f"main-value-{spelling}")
    assert not path.exists(), "a rejected value must not write a row"


def case_main_rejects_non_manual_series():
    module, path = wired()
    code = run_main(module, ["collected", "Read by hand", "1", "--no-build"])
    expect_exit_message(code, "not a manual series", "main-non-manual")
    assert not path.exists()


def case_main_rejects_unknown_tool():
    module, path = wired()
    code = run_main(module, ["react-builtwith", "No such tool", "1", "--no-build"])
    expect_exit_message(code, "unknown tool", "main-unknown-tool")
    assert not path.exists(), "an unknown tool must not write a row"


def case_main_list_does_not_write():
    module, path = wired()
    assert run_main(module, ["react-builtwith", "--list", "--no-build"]) is None
    # --list with no tool opens the config and prints; it must not append.
    assert not path.exists(), "--list must not write the series file"


def case_main_builds_by_default():
    module, path = wired()
    run_main(module, ["react-builtwith", "Read by hand", "1", "--date", "2026-11-12"])
    # build() is stubbed in run_main; what the case pins is that main() reaches
    # for it when --no-build is absent, i.e. an append rebuilds the published
    # page instead of silently leaving /stats/ stale.
    assert path.exists(), "the append did not happen"
    assert module._last_build_recorder.calls == 1, f"build() called {module._last_build_recorder.calls} times"


def case_main_no_build_skips_build():
    module, path = wired()
    run_main(module, ["react-builtwith", "Read by hand", "1", "--date", "2026-11-12", "--no-build"])
    assert path.exists(), "the append did not happen"
    assert module._last_build_recorder.calls == 0, "--no-build still called build()"


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
        print(f"unknown case; one of: {', '.join(CASES)}", file=sys.stderr)
        return 2
    CASES[argv[1]]()
    print(f"OK {argv[1]}", flush=True)
    return 0


CASES = {
    "extract-forward-live-sites": case_extract_forward_live_sites,
    "extract-currently-live": case_extract_currently_live,
    "extract-reversed-live-sites": case_extract_reversed_live_sites,
    "extract-collapses-whitespace": case_extract_collapses_whitespace,
    "extract-top-1m-forward": case_extract_top_1m_forward,
    "extract-top-1m-reversed": case_extract_top_1m_reversed,
    "extract-top-million-forms": case_extract_top_million_forms,
    "extract-both-figures": case_extract_both_figures,
    "extract-no-match-is-empty": case_extract_no_match_is_empty,
    "append-url-defaults-to-https": case_append_url_defaults_to_https,
    "append-url-kept-verbatim": case_append_url_kept_verbatim,
    "append-url-override-wins": case_append_url_override_wins,
    "append-row-matches-published-header": case_append_row_matches_published_header,
    "append-new-file-gets-header": case_append_new_file_gets_header,
    "main-paste-skips-unknown-tools": case_main_paste_skips_unknown_tools,
    "main-paste-no-figures-exits-clean": case_main_paste_no_figures_exits_clean,
    "main-value-accepts-separators": case_main_value_accepts_separators,
    "main-value-keeps-fraction": case_main_value_keeps_fraction,
    "main-value-not-a-number-exits-clean": case_main_value_not_a_number_exits_clean,
    "main-value-rejects-non-finite": case_main_value_rejects_non_finite,
    "main-rejects-non-manual-series": case_main_rejects_non_manual_series,
    "main-rejects-unknown-tool": case_main_rejects_unknown_tool,
    "main-list-does-not-write": case_main_list_does_not_write,
    "main-builds-by-default": case_main_builds_by_default,
    "main-no-build-skips-build": case_main_no_build_skips_build,
}


if __name__ == "__main__":
    sys.exit(main(sys.argv))
