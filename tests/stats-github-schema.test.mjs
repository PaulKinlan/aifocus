// GitHub Search schema failures must stop the collection instead of being
// retried as network faults and silently dropping the measured period.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const probe = `
import importlib.util
import io
import sys
import urllib.error
from unittest.mock import patch

sys.path.insert(0, 'tools/stats')
from collector_common import CollectorDataError, finite_in_range, non_negative_int
spec = importlib.util.spec_from_file_location('collect_github', 'tools/stats/collect-github.py')
github = importlib.util.module_from_spec(spec)
spec.loader.exec_module(github)

class Response:
    headers = {}
    def __init__(self, body): self.body = body
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit): return self.body[:limit]

for body in (b'not json{', b'[1,2,3]', b'\\xff', b'{"message":"Validation Failed"}'):
    calls = []
    def urlopen(request, timeout):
        calls.append(request)
        return Response(body)
    with patch.object(github.urllib.request, 'urlopen', urlopen), patch.object(github.time, 'sleep', side_effect=AssertionError('unexpected retry')):
        try:
            github.Searcher('dummy', 'commits').count('query')
        except CollectorDataError:
            pass
        else:
            raise AssertionError(f'{body!r} did not fail loud')
    assert len(calls) == 1, (body, len(calls))

for value in (True, False):
    for validate in (lambda: non_negative_int(value, 'github total_count'),
                     lambda: finite_in_range(value, 0, None, 'httparchive adoption')):
        try:
            validate()
        except CollectorDataError:
            pass
        else:
            raise AssertionError(f'boolean {value!r} accepted as a count')
assert finite_in_range('12.3', 0, 100, 'w3techs percentage') == 12.3
for value in (0, 42):
    assert non_negative_int(value, 'github total_count') == value

for body in (b'{"total_count":true}', b'{"total_count":false}'):
    calls = []
    def boolean_urlopen(request, timeout):
        calls.append(request)
        return Response(body)
    with patch.object(github.urllib.request, 'urlopen', boolean_urlopen), patch.object(github.time, 'sleep', side_effect=AssertionError('unexpected retry')):
        try:
            github.Searcher('dummy', 'commits').count('query')
        except CollectorDataError:
            pass
        else:
            raise AssertionError(f'{body!r} published a boolean count')
    assert len(calls) == 1, (body, len(calls))

for status in (401, 403, 404, 422):
    calls = []
    def fail_urlopen(request, timeout):
        calls.append(request)
        raise urllib.error.HTTPError(request.full_url, status, 'non-retryable', {}, io.BytesIO(b'{"message":"denied"}'))
    with patch.object(github.urllib.request, 'urlopen', fail_urlopen), patch.object(github.time, 'sleep', side_effect=AssertionError('unexpected retry')):
        try:
            github.Searcher('dummy', 'commits').count('query')
        except CollectorDataError as exc:
            assert str(status) in str(exc)
        else:
            raise AssertionError(f'HTTP {status} silently dropped')
    assert len(calls) == 1, (status, len(calls))

calls = []
def valid_urlopen(request, timeout):
    calls.append(request)
    return Response(b'{"total_count":42}')
with patch.object(github.urllib.request, 'urlopen', valid_urlopen):
    assert github.Searcher('dummy', 'commits').count('query') == 42
assert len(calls) == 1

calls = []
def retry_urlopen(request, timeout):
    calls.append(request)
    if len(calls) == 1:
        raise urllib.error.HTTPError(request.full_url, 503, 'transient', {}, io.BytesIO(b'try later'))
    return Response(b'{"total_count":42}')
with patch.object(github.urllib.request, 'urlopen', retry_urlopen), patch.object(github.time, 'sleep') as sleep:
    assert github.Searcher('dummy', 'commits').count('query') == 42
    sleep.assert_called_once_with(10)
assert len(calls) == 2
`;

test("GitHub Search rejects invalid bodies, boolean or absent counts, and non-retryable HTTP failures", () => {
  const result = spawnSync("python3", ["-B", "-c", probe], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
});
