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
import { safeHref, safeImgSrc } from "../assets/js/safe-href.js";
import { safeProfileUrl, safeAvatarUrl } from "../functions/_lib/auth.js";

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

// The avatar half (aifocus-r044): a provider-supplied avatar URL reaches an
// <img src>, which makes the reader's browser issue a request to whatever host
// the URL names - and img-src is deliberately wide so post images work
// (aifocus-8f3j), so the sink check is the only bound on which host that is.
// Tighter than a profile link: absolute https **and** one of the hosts the
// providers actually mint avatars on. Every one of these URLs is a real value or
// a real mutation of one, not a random string.
const AVATAR_CASES = [
  // Accepted: the three providers' own hosts, normalised to a URL.
  ["https://avatars.githubusercontent.com/u/42?v=4", "https://avatars.githubusercontent.com/u/42?v=4"],
  ["https://pbs.twimg.com/profile_images/1/a_400x400.jpg", "https://pbs.twimg.com/profile_images/1/a_400x400.jpg"],
  ["https://cdn.bsky.app/img/avatar/plain/did:plc:abc/bafkrei@jpeg", "https://cdn.bsky.app/img/avatar/plain/did:plc:abc/bafkrei@jpeg"],
  ["  https://pbs.twimg.com/profile_images/1/a_400x400.jpg  ", "https://pbs.twimg.com/profile_images/1/a_400x400.jpg"],
  ["HTTPS://PBS.TWIMG.COM/profile_images/1/a.jpg", "https://pbs.twimg.com/profile_images/1/a.jpg"],
  // Rejected: any other host is a request the reader never asked for.
  ["https://evil.example/beacon.png", null],
  ["https://avatars.githubusercontent.com.evil.example/u/42", null],
  ["https://avatars.githubusercontent.com@evil.example/x.png", null],
  ["https://avatars.example/ana.png", null],
  ["https://cdn.bsky.app.evil.example/x.png", null],
  // Rejected: not a web image URL at all.
  ["http://avatars.githubusercontent.com/u/42", null],
  ["//avatars.githubusercontent.com/u/42", null],
  ["/img/avatar.png", null],
  ["data:image/svg+xml,<svg onload=alert(1)>", null],
  ["javascript:alert(document.domain)", null],
  ["file:///etc/passwd", null],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
  [42, null],
  [{ src: "https://avatars.githubusercontent.com/u/42" }, null],
];

const AVATAR_HALVES = [
  ["safeImgSrc (assets/js/safe-href.js)", safeImgSrc],
  ["safeAvatarUrl (functions/_lib/auth.js)", safeAvatarUrl],
];

for (const [name, fn] of AVATAR_HALVES) {
  test(`${name}: a provider avatar host over https only, everything else renders no image`, () => {
    for (const [input, expected] of AVATAR_CASES) {
      assert.equal(fn(input), expected, `${name}(${JSON.stringify(input)})`);
    }
  });
}

test("both halves of the avatar-URL rule agree on every case", () => {
  for (const [input] of AVATAR_CASES) {
    assert.equal(
      safeImgSrc(input),
      safeAvatarUrl(input),
      `the sink guard and the write guard disagree on ${JSON.stringify(input)}`,
    );
  }
});

test("the avatar rule is stricter than the profile-link rule, and stays that way", () => {
  // The two rules must not be collapsed into one: any https URL is a link, but
  // only a provider avatar host is an image, because only the image makes the
  // reader fetch from a third party they did not choose.
  const linkOnly = "https://github.com/paulkinlan";
  assert.equal(safeHref(linkOnly), linkOnly, "the profile rule accepts the ordinary host");
  assert.equal(safeImgSrc(linkOnly), null, "the avatar rule does not");
  for (const [input, expected] of AVATAR_CASES) {
    if (expected !== null) assert.notEqual(safeHref(input), null, "an accepted avatar is an accepted https URL");
  }
});

// The post-path half (aifocus-dsqv): a reader-supplied post reference is
// normalized to a root-relative path on write (normalizePostPath,
// functions/_lib/reader.js) and may only become an anchor at the sink when it
// still IS one - root-relative, no scheme, no host. The sink does not trust
// the writer: an older row, a manual D1 edit or a future writer that skips
// normalization would otherwise put a javascript: href on the moderation page,
// where a click runs with the moderator's Access session attached.
import { safePostPath } from "../assets/js/safe-href.js";
import { normalizePostPath } from "../functions/_lib/reader.js";

const POST_CASES = [
  // Accepted: root-relative site paths - the only shape a good writer emits.
  ["/reader-state-primer/", "/reader-state-primer/"],
  ["/a/b/c", "/a/b/c"],
  ["/", "/"],
  // Rejected: a scheme or a host in the value makes the href executable or
  // remote, and everything else is outside the post-path contract. The https
  // form is WRITE-accepted (normalizePostPath parses it), which is exactly why
  // the sink refuses it raw: a raw absolute URL at the sink means the value
  // skipped normalization and nothing vouches for it.
  ["https://aifoc.us/x/", null],
  ["//evil.example/x", null],
  ["/\\evil.example/x", null],
  // Rejected: the URL parser strips ASCII tab, LF and CR from the input before
  // it parses anything else, so a control right after the leading '/' turns
  // the value into the protocol-relative form ('/\t/evil.example/x' parses
  // like '//evil.example/x' and resolves off-origin, aifocus-72zc). Any other
  // C0 control is rejected with them - a stored path carrying a control
  // character is malformed data under the post-path contract, wherever it sits.
  ["/\t/evil.example/x", null],
  ["/\n/evil.example/x", null],
  ["/\r/evil.example/x", null],
  ["/\u0000/evil.example/x", null],
  ["/a\tb", null],
  ["javascript:alert(document.domain)", null],
  ["http://evil.example/x", null],
  ["data:text/html,<script>alert(1)</script>", null],
  ["relative", null],
  [" /x", null],
  ["", null],
  [null, null],
  [undefined, null],
  [42, null],
];

test("safePostPath (assets/js/safe-href.js): root-relative only, everything else renders as text", () => {
  for (const [input, expected] of POST_CASES) {
    assert.equal(safePostPath(input), expected, `safePostPath(${JSON.stringify(input)})`);
  }
});

test("the write side sanitizes the dangerous shapes; the sink side refuses them raw", () => {
  for (const input of ["javascript:alert(1)", "//evil.example/x", "/\\evil.example/x", "/\t/evil.example/x", "http://evil.example/x", "data:text/html,x"]) {
    // Write side: whatever survives normalization is path-absolute same-origin
    // - the host of an absolute/protocol-relative URL is parsed away, and a
    // non-http scheme has no path to keep.
    const written = normalizePostPath(input);
    if (written !== null) {
      assert.match(written, /^\/[^/]/, `normalizePostPath(${JSON.stringify(input)}) must be path-absolute`);
      assert.doesNotMatch(written, /:\/\//, `normalizePostPath(${JSON.stringify(input)}) must carry no host`);
    }
    // Sink side: a RAW value of any of these shapes renders as text, because a
    // raw value at the sink means normalization never ran on it.
    assert.equal(safePostPath(input), null, `the sink must refuse the raw ${JSON.stringify(input)}`);
  }
});
