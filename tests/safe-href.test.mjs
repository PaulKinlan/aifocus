// Provider-supplied profile URLs must never reach an anchor href as a raw value
// (aifocus-d7jb): a javascript: or data: URI in an href executes in this origin
// when clicked, and the moderation page's links carry the moderator's Cloudflare
// Access session.
//
// The rule is written twice on purpose - assets/js/safe-href.js guards the sink,
// functions/_lib/auth.js keeps a bad value out of D1 and out of the reader-facing
// payload - and both halves are asserted against the same table here, so a
// change to one that the other does not follow fails this file rather than
// leaving a silent gap.
import test from "node:test";
import assert from "node:assert/strict";
import { safeHref } from "../assets/js/safe-href.js";
import { safeProfileUrl } from "../functions/_lib/auth.js";

const CASES = [
  // Accepted: absolute https, normalised to a URL.
  ["https://github.com/paulkinlan", "https://github.com/paulkinlan"],
  ["https://bsky.app/profile/did:plc:abc123", "https://bsky.app/profile/did:plc:abc123"],
  ["  https://x.com/someone  ", "https://x.com/someone"],
  ["https://example.com/a b?q=1", "https://example.com/a%20b?q=1"],
  // Rejected: nothing else is a link this origin may render.
  ["javascript:alert(document.domain)", null],
  ["JaVaScRiPt:alert(1)", null],
  [" javascript:alert(1)", null],
  ["data:text/html,<script>alert(1)</script>", null],
  ["vbscript:msgbox(1)", null],
  ["file:///etc/passwd", null],
  ["http://github.com/paulkinlan", null],
  ["//evil.example/path", null],
  ["/account/", null],
  ["profile", null],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
  [42, null],
  [{ href: "https://evil.example" }, null],
];

const HALVES = [
  ["safeHref (assets/js/safe-href.js)", safeHref],
  ["safeProfileUrl (functions/_lib/auth.js)", safeProfileUrl],
];

for (const [name, fn] of HALVES) {
  test(`${name}: absolute https only, everything else renders as text`, () => {
    for (const [input, expected] of CASES) {
      assert.equal(fn(input), expected, `${name}(${JSON.stringify(input)})`);
    }
  });
}

test("both halves of the profile-URL rule agree on every case", () => {
  for (const [input] of CASES) {
    assert.equal(
      safeHref(input),
      safeProfileUrl(input),
      `the sink guard and the write guard disagree on ${JSON.stringify(input)}`,
    );
  }
});
