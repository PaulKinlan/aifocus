// New-comment alerts (functions/_lib/notify.js): a pending note or comment
// sends one email through the Cloudflare Email Service REST API; approved
// writes, highlights and a missing configuration send nothing; a failed send
// does not fail the reader's request.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as postAnnotation } from "../functions/api/reader/annotations.js";
import { buildPendingEmail, notifyPendingAnnotation } from "../functions/_lib/notify.js";
import { ORIGIN, POST, makeEnv, req, READER_A, signIn } from "./helpers/reader-fixtures.mjs";

const EMAIL_ENV = {
  MODERATION_EMAIL_FROM: "comments@aifoc.us",
  MODERATION_EMAIL_TO: "moderator@example.com",
  CF_ACCOUNT_ID: "acct123",
  EMAIL_API_TOKEN: "tok",
};

function captureFetch(status = 200) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ success: status < 400 }), { status });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function comment(env, session, body = "Nice post", waitUntil) {
  return postAnnotation({
    request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body }, reader: READER_A, session }),
    env,
    waitUntil,
  });
}

test("pending comment sends one email to the configured recipient", async () => {
  const env = makeEnv(EMAIL_ENV);
  const { session } = await signIn(env, "ana");
  const f = captureFetch();
  const pending = [];
  try {
    const res = await comment(env, session, "Nice post", (p) => pending.push(p));
    assert.equal(res.status, 201);
    await Promise.all(pending);
  } finally {
    f.restore();
  }
  assert.equal(pending.length, 1, "the send is handed to waitUntil");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acct123/email/sending/send");
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer tok");
  const sent = JSON.parse(f.calls[0].init.body);
  assert.equal(sent.to, "moderator@example.com");
  assert.equal(sent.from.address, "comments@aifoc.us");
  assert.match(sent.subject, /New comment from ANA needs review/);
  assert.match(sent.text, /Nice post/);
  assert.match(sent.text, new RegExp(`${ORIGIN}/admin/`));
});

test("no email without configuration, for trusted auto-approved writes, or for highlights", async () => {
  const f = captureFetch();
  try {
    const bare = makeEnv();
    const a = await signIn(bare, "ana");
    assert.equal((await comment(bare, a.session)).status, 201);

    const env = makeEnv(EMAIL_ENV);
    const { session, user } = await signIn(env, "bo");
    env.READER_DB.raw.prepare("UPDATE users SET trusted = 1 WHERE id = ?").run(user.id);
    const res = await comment(env, session);
    assert.equal((await res.json()).annotation.status, "approved");

    await postAnnotation({
      request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote: { exact: "I didn't realise" } }, reader: READER_A }),
      env,
    });
  } finally {
    f.restore();
  }
  assert.equal(f.calls.length, 0);
});

test("a failed send is logged and does not fail the comment", async () => {
  const env = makeEnv(EMAIL_ENV);
  const { session } = await signIn(env, "ana");
  const f = captureFetch(403);
  const errors = console.error;
  console.error = () => {};
  try {
    const res = await comment(env, session);
    assert.equal(res.status, 201);
  } finally {
    f.restore();
    console.error = errors;
  }
  assert.equal(f.calls.length, 1);
  const ok = await notifyPendingAnnotation(EMAIL_ENV, {
    row: { status: "pending", type: "comment", post: POST, body: "x" },
    origin: ORIGIN,
    fetchImpl: async () => { throw new Error("network down"); },
  });
  assert.equal(ok, false);
});

test("email body includes the passage for notes and truncates long text", () => {
  const { subject, text } = buildPendingEmail({
    row: { type: "note", post: POST, author_name: "ANA", quote_exact: "reverse engineering", body: "y".repeat(2000), screen: "safe" },
    origin: ORIGIN,
  });
  assert.match(subject, /New note from ANA/);
  assert.match(text, /> reverse engineering/);
  assert.match(text, /Safety screen: safe/);
  assert.ok(text.length < 1800);
});
