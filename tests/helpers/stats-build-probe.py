"""Synthetic, repository-independent correctness cases for tools/stats/build.py."""
import csv
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("stats_build", ROOT / "tools/stats/build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class StatsBuildTest(unittest.TestCase):
    def test_format_and_period_boundaries(self):
        self.assertEqual(build.fmt_value(0.75, "percent"), "0.75%")
        self.assertEqual(build.fmt_value(12.5, "percent"), "12.5%")
        self.assertEqual(build.fmt_value(1, "percent"), "1.0%")
        self.assertEqual(build.fmt_value(1500, "usd"), "$1.5K")
        self.assertEqual(build.fmt_full(1250), "1,250")
        self.assertEqual(build.expected_end("2024-02-01", "monthly").isoformat(), "2024-02-29")
        self.assertEqual(build.expected_end("2026-01-05", "weekly").isoformat(), "2026-01-11")
        self.assertIsNone(build.pct_change(10, 0))
        self.assertEqual(build.fmt_change(15, 10)["fmt"], "+5 (+50%)")
        self.assertEqual(build.fmt_change(8, 12)["fmt"], "−4 (−33%)")

    def test_latest_run_wins_and_partial_periods_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            rows = [
                ("2026-01-16", [("2026-01-05", "2026-01-11", 10), ("2026-01-12", "2026-01-15", 6)]),
                ("2026-01-23", [("2026-01-05", "2026-01-11", 12), ("2026-01-12", "2026-01-18", 8)]),
            ]
            for run, points in rows:
                with open(pathlib.Path(directory) / f"sample-{run}.csv", "w", newline="", encoding="utf-8") as file:
                    writer = csv.writer(file)
                    writer.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url"])
                    for start, end, count in points:
                        writer.writerow(["Old name", start, end, "weekly", count, "https://example.test/data"])
            series = {"id": "sample", "title": "Sample", "unit": "records", "file_prefix": "sample",
                      "granularity": "weekly", "aliases": {"Old name": "New name"},
                      "primary": "New name", "tools": [{"name": "New name", "slot": 1}], "show_partial": False}
            with patch.object(build, "DATA_DIR", directory):
                points, runs = build.load_series(series)
                compiled = build.compile_series(series)
            first = points["New name"]["2026-01-05"]
            self.assertEqual(first["v"], 12)
            self.assertEqual(first["runs"], {"2026-01-16": 10, "2026-01-23": 12})
            self.assertEqual(points["New name"]["2026-01-12"]["v"], 8)
            self.assertEqual([run["rows"] for run in runs], [1, 2], "the partial row is not published")
            self.assertEqual(compiled["period_count"], 2)
            tool = compiled["tools"][0]
            self.assertEqual(tool["latest"]["v"], 8)
            self.assertEqual(tool["prior"]["v"], 12)
            self.assertEqual(tool["change_prior"]["abs"], -4)
            self.assertEqual(tool["total"], 20)

    def test_run_date_marks_an_ended_period_partial_and_excludes_it_from_total(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "partial-2026-01-18.csv"
            with open(path, "w", newline="", encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow(["tool", "period_start", "period_end", "granularity", "total_count", "url"])
                writer.writerow(["All", "2026-01-05", "2026-01-11", "weekly", 10, ""])
                # The period has nominally ended but collection on its last day
                # is still partial, even though expected_end() already passed.
                writer.writerow(["All", "2026-01-12", "2026-01-18", "weekly", 6, ""])
            series = {"id": "partial", "title": "Partial", "unit": "records", "file_prefix": "partial",
                      "granularity": "weekly", "tools": [{"name": "All", "slot": 1}], "primary": "All"}
            with patch.object(build, "DATA_DIR", directory):
                output = build.compile_series(series)
                excluded = build.load_series({**series, "show_partial": False})
            points = output["tools"][0]["points"]
            self.assertEqual([p["partial"] for p in points], [False, True])
            self.assertEqual(output["tools"][0]["total"], 10, "partial values cannot inflate a published total")
            self.assertEqual(output["tools"][0]["latest"]["v"], 10)
            self.assertEqual(list(excluded[0]["All"]), ["2026-01-05"])

    def test_derived_percent_uses_matching_period_and_partial_state(self):
        start, end = "2026-01-05", "2026-01-11"
        numerator = {"tools": [{"name": "Browser", "label": "Browser", "slot": 1,
                                 "points": [{"s": start, "e": end, "v": 25, "partial": False}]}]}
        denominator = {"tools": [{"name": "All", "points": [{"s": start, "e": end, "v": 100, "partial": True}]}]}
        series = {"granularity": "weekly", "primary": "All", "derived": [
            {"id": "share", "title": "Share", "unit": "%", "numerator_series": "browser",
             "tools": ["Browser"]}]}
        derived = build.build_derived(series, denominator, {"browser": numerator})[0]
        self.assertEqual(derived["tools"][0]["points"][0]["v"], 25.0)
        self.assertTrue(derived["tools"][0]["points"][0]["partial"])
        self.assertIsNone(derived["tools"][0]["latest"], "partial periods must not become current claims")


    def test_claims_value_at_fallback_and_change_report(self):
        # aifocus-bym2: value_at(), build_claims() and change_report() publish
        # the "written as X, now Y" comparison a human reviews, but nothing
        # executed them before this case (the --check self-comparison cannot
        # detect a wrong number). Points cover an exact claim period, the
        # last-point-on-or-before fallback, the not-comparable branch, the
        # tool-missing branch and the change report's claim/revision lines.
        tool = {
            "name": "All", "label": "All commits", "value_format": None,
            "points": [
                {"s": "2025-06-16", "e": "2025-06-22", "v": 100, "fmt": "100", "full": "100", "url": "https://example.test/a", "partial": False},
                {"s": "2025-10-27", "e": "2025-11-02", "v": 300, "fmt": "300", "full": "300", "url": "https://example.test/b", "partial": False},
                {"s": "2026-01-05", "e": "2026-01-11", "v": 360, "fmt": "360", "full": "360", "url": "https://example.test/c", "partial": False},
            ],
            "latest": {"s": "2026-01-05", "e": "2026-01-11", "v": 360, "fmt": "360", "full": "360"},
        }
        tools = {"All": tool}
        claims = [
            {"text": "exact period", "tool": "All", "period": "2025-06-16", "value": 100},
            {"text": "fallback period", "tool": "All", "period": "2025-08-01", "value": 100},
            {"text": "not comparable", "tool": "All", "period": "2026-01-05", "value": 360, "comparable": False},
            {"text": "missing tool", "tool": "No-such-tool", "period": "2026-01-05", "value": 5},
        ]
        out = build.build_claims(claims, tools, "weekly")
        # Exact match: measured is the claim period itself, flagged exact.
        self.assertEqual(out[0]["measured"]["s"], "2025-06-16")
        self.assertTrue(out[0]["measured"]["exact"])
        self.assertEqual(out[0]["period_label"], "w/c 16 Jun 2025")
        self.assertEqual(out[0]["value_fmt"], "100")
        # No point at 2025-08-01: the last point on or before it wins, and the
        # row says so via exact=False rather than pretending to be exact.
        self.assertEqual(out[1]["measured"]["s"], "2025-06-16")
        self.assertFalse(out[1]["measured"]["exact"])
        # The not-comparable claim publishes no change at all.
        self.assertEqual(out[2]["change"], {"abs": None, "pct": None, "fmt": "not comparable"})
        # A tool the series no longer knows: no measurement, no now, and the
        # unf formatted claim value; the change degenerates to the dash.
        self.assertIsNone(out[3]["measured"])
        self.assertIsNone(out[3]["now"])
        self.assertEqual(out[3]["tool_label"], "No-such-tool")
        self.assertEqual(out[3]["value_fmt"], "5")
        self.assertEqual(out[3]["change"], {"abs": None, "pct": None, "fmt": "\u2013"})
        # The comparable claims do publish the change against latest.
        self.assertEqual(out[0]["change"]["fmt"], "+260 (+260%)")

        compiled = {
            "generated": "2026-01-12T00:00:00Z",
            "series": [
                {
                    "title": "Sample", "id": "sample", "unit": "records", "granularity": "weekly",
                    "period_count": 2, "last_period_label": "w/c 5 Jan 2026",
                    "runs": [{"date": "2026-01-16"}, {"date": "2026-01-23"}],
                    "tools": [{
                        "label": "All commits", "chart": True,
                        "latest": {"s": "2026-01-05", "e": "2026-01-11", "full": "360"},
                        "ago": {"s": "2025-12-29", "e": "2026-01-04"},
                        "change_ago": {"fmt": "+30 (+9%)"},
                        "points": [
                            {"s": "2026-01-05", "runs": {"2026-01-16": None, "2026-01-23": 360}},
                            {"s": "2025-12-29", "runs": {"2026-01-16": 330, "2026-01-23": 360}},
                        ],
                    }],
                    "claims": out,
                    "derived": [],
                },
                {"title": "Empty", "id": "empty", "unit": "records", "granularity": "weekly",
                 "period_count": 0, "last_period_label": "", "runs": [], "tools": [], "claims": [], "derived": []},
            ],
        }
        report = build.change_report(compiled)
        self.assertIn("# /stats/ change report, 2026-01-12T00:00:00Z", report)
        self.assertIn("- Latest run: 2026-01-23 (previous 2026-01-16); 2 complete periods, last complete w/c 5 Jan 2026.", report)
        self.assertIn("**All commits**: 360 records (w/c 5 Jan 2026); vs w/c 29 Dec 2025: +30 (+9%)", report)
        self.assertIn("; revised since previous run: 2025-12-29 +9%", report)
        self.assertIn("- Claim: exact period: written as 100; now 360 (w/c 5 Jan 2026): +260 (+260%).", report)
        self.assertIn("- Claim: fallback period: written as 100; now 360 (w/c 5 Jan 2026): +260 (+260%).", report)
        # The not-comparable claim carries a now value, so it IS reported -
        # with the "not comparable" marker instead of a fabricated delta.
        self.assertIn("- Claim: not comparable: written as 360; now 360 (w/c 5 Jan 2026): not comparable.", report)
        # The tool-missing claim has no now value, so change_report omits it
        # entirely rather than inventing a comparison.
        self.assertNotIn("missing tool", report)
        self.assertIn("## Empty (`empty`)\n\nNo data yet.", report)


if __name__ == "__main__":
    unittest.main()
