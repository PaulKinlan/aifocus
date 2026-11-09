"""Shared guards for the stats collectors (aifocus-waix).

The collectors parse third-party responses into numbers that build.py merges
into the published /stats/ document, so the failure mode to prevent is a
silently wrong published statistic. Two guards, both fail-loud:

- fetch_capped()/fetch_json_capped(): read at most MAX_RESPONSE_BYTES and
  refuse longer bodies instead of parsing a truncated or hostile payload.
- finite_in_range()/non_negative_int(): every number written to a CSV must be
  finite and inside the metric's plausible range, so a broken feed, a layout
  change or a NaN smuggled through JSON fails the run instead of becoming a
  row.

These are developer-run tools outside the deploy path (THREAT_MODEL section 1),
so the guards deliberately raise CollectorDataError / SystemExit rather than
falling back to anything.
"""

import json
import math
import urllib.request

# The largest real response body measured across the five collectors is well
# under 1 MiB (the chromestatus timeline is the biggest); a body over the cap
# is a broken or hostile feed, not a bigger table.
MAX_RESPONSE_BYTES = 1 << 20

UA = "aifoc.us-stats/1 (+https://aifoc.us/stats/)"


class CollectorDataError(Exception):
    """A response was over-long or a parsed value failed its range check."""


def fetch_capped(url, *, headers=None, timeout=60, max_bytes=MAX_RESPONSE_BYTES):
    """GET url and return the decoded body, refusing bodies over max_bytes."""
    req = urllib.request.Request(url, headers=headers or {"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read(max_bytes + 1)
    if len(body) > max_bytes:
        raise CollectorDataError(f"response from {url} exceeds {max_bytes} bytes; refusing to parse")
    return body.decode("utf-8", "replace")


def fetch_json_capped(url, *, headers=None, timeout=60, max_bytes=MAX_RESPONSE_BYTES):
    """fetch_capped() + json.loads. Note: json.loads accepts NaN/Infinity
    literals that strict JSON forbids, so values from this still need
    finite_in_range()/non_negative_int() before they reach a CSV."""
    return json.loads(fetch_capped(url, headers=headers, timeout=timeout, max_bytes=max_bytes))


def finite_in_range(value, low, high, label):
    """Return float(value) if it is finite and within [low, high] (high may be
    None for an unbounded upper limit); raise CollectorDataError otherwise.
    Every data error - non-numeric text included - comes back as
    CollectorDataError, so callers only ever catch one exception type."""
    try:
        v = float(value)
    except (TypeError, ValueError) as err:
        raise CollectorDataError(f"{label}: not a number: {value!r}") from err
    if not math.isfinite(v):
        raise CollectorDataError(f"{label}: not a finite number: {value!r}")
    if v < low or (high is not None and v > high):
        raise CollectorDataError(f"{label}: {v} outside the plausible range [{low}, {high or 'unbounded'}]")
    return v


def non_negative_int(value, label):
    """Return int(value) if it is a finite number >= 0; raise otherwise."""
    return int(finite_in_range(value, 0, None, label))
