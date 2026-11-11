import test from "node:test";
import assert from "node:assert/strict";
import { SIGNIN_MESSAGES, startUrl, takeSignInResult } from "../assets/js/signin.js";

// The server's auth endpoints redirect with these reasons; keep their reader-facing
// messages in sync, including the rate-limit result from auth/start/[provider].js.
const SERVER_REASONS = ["failed", "cancelled", "expired", "unavailable", "bad-handle", "already-linked", "blocked", "ratelimited"];

test("every auth redirect reason has a reader-facing message", () => {
  for (const reason of SERVER_REASONS) {
    assert.equal(typeof SIGNIN_MESSAGES[reason], "string", reason);
    assert.ok(SIGNIN_MESSAGES[reason].length > 0, reason);
  }
  assert.match(SIGNIN_MESSAGES.ratelimited, /wait|later|retry/i);
});

test("startUrl preserves return query and fragment inside one encoded parameter", () => {
  const href = startUrl("github", "/essay/?topic=a&sort=b#reader");
  const url = new URL(href, "https://aifoc.us");
  assert.equal(url.pathname, "/api/auth/start/github");
  assert.equal(url.searchParams.get("return"), "/essay/?topic=a&sort=b#reader");
  assert.equal([...url.searchParams].length, 1);
});

test("takeSignInResult consumes only signin and preserves unrelated query and fragment", () => {
  const originalLocation = globalThis.location;
  const originalHistory = globalThis.history;
  let current = new URL("https://aifoc.us/essay/?topic=a&signin=ratelimited&sort=b#reader");
  const state = { scroll: 42 };
  let replacements = 0;
  try {
    globalThis.location = {
      get search() { return current.search; },
      get pathname() { return current.pathname; },
      get hash() { return current.hash; },
    };
    globalThis.history = {
      state,
      replaceState(nextState, _title, href) {
        assert.strictEqual(nextState, state);
        current = new URL(href, current);
        replacements++;
      },
    };
    assert.equal(takeSignInResult(), SIGNIN_MESSAGES.ratelimited);
    assert.equal(current.pathname + current.search + current.hash, "/essay/?topic=a&sort=b#reader");
    assert.equal(takeSignInResult(), null, "a reload does not repeat the message");
    assert.equal(replacements, 1);

    for (const unknown of ["unknown", "__proto__"]) {
      current = new URL(`https://aifoc.us/essay/?signin=${unknown}#reader`);
      assert.equal(takeSignInResult(), SIGNIN_MESSAGES.failed);
      assert.equal(current.pathname + current.search + current.hash, "/essay/#reader");
    }
  } finally {
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
    if (originalHistory === undefined) delete globalThis.history;
    else globalThis.history = originalHistory;
  }
});
