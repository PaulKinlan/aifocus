// GitHub Search schema failures must stop the collection instead of being
// retried as network faults and silently dropping the measured period.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const probe = `
import importlib.util
import sys
from unittest.mock import patch

sys.path.insert(0, 'tools/stats')
from collector_common import CollectorDataError
spec = importlib.util.spec_from_file_location('collect_github', 'tools/stats/collect-github.py')
github = importlib.util.module_from_spec(spec)
spec.loader.exec_module(github)

class Response:
    headers = {}
    def __init__(self, body): self.body = body
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit): return self.body[:limit]

for body in (b'not json{', b'[1,2,3]', b'\\xff'):
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

calls = []
def valid_urlopen(request, timeout):
    calls.append(request)
    return Response(b'{"total_count":42}')
with patch.object(github.urllib.request, 'urlopen', valid_urlopen):
    assert github.Searcher('dummy', 'commits').count('query') == 42
assert len(calls) == 1
`;

test("GitHub Search rejects malformed, non-object and invalid UTF-8 responses without retry", () => {
  const result = spawnSync("python3", ["-B", "-c", probe], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
});
