// New-comment alerts (functions/_lib/notify.js): a pending note or comment
// sends one request to the aifocus-mailer Worker over the MAILER service
// binding; approved writes, highlights and a missing binding send nothing; a
// failed send does not fail the reader's request. The mailer Worker itself
// (workers/mailer) only ever sends to its configured recipient.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as postAnnotation } from "../functions/api/reader/annotations.js";
import { buildPendingEmail, notifyPendingAnnotation } from "../functions/_lib/notify.js";
import mailer from "../workers/mailer/src/index.js";
import { ORIGIN, POST, makeEnv, req, READER_A, signIn } from "./helpers/reader-fixtures.mjs";

function fakeMailer(status = 200) {
  const calls = [];
  return {
    calls,
    MAILER: {
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        if (status === "throw") throw new Error("binding down");
        return new Response("{}", { status });
      },
    },
  };
}

async function comment(env, session, body = "Nice post", waitUntil) {
  return postAnnotation({
    request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body }, reader: READER_A, session }),
    env,
    waitUntil,
  });
}

test("pending comment sends one request to the mailer", async () => {
  const m = fakeMailer();
  const env = makeEnv({ MAILER: m.MAILER });
  const { session } = await signIn(env, "ana");
  const pending = [];
  const res = await comment(env, session, "Nice post", (p) => pending.push(p));
  assert.equal(res.status, 201);
  await Promise.all(pending);
  assert.equal(pending.length, 1, "the send is handed to waitUntil");
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].init.method, "POST");
  const sent = JSON.parse(m.calls[0].init.body);
  assert.deepEqual(Object.keys(sent).sort(), ["subject", "text"], "the caller cannot choose a recipient");
  assert.match(sent.subject, /New comment from ANA needs review/);
  assert.match(sent.text, /Nice post/);
  assert.match(sent.text, new RegExp(`${ORIGIN}/admin/`));
});

test("no email without the binding, for trusted auto-approved writes, or for highlights", async () => {
  const bare = makeEnv();
  const a = await signIn(bare, "ana");
  assert.equal((await comment(bare, a.session)).status, 201);

  const m = fakeMailer();
  const env = makeEnv({ MAILER: m.MAILER });
  const { session, user } = await signIn(env, "bo");
  env.READER_DB.raw.prepare("UPDATE users SET trusted = 1 WHERE id = ?").run(user.id);
  const res = await comment(env, session);
  assert.equal((await res.json()).annotation.status, "approved");

  await postAnnotation({
    request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote: { exact: "I didn't realise" } }, reader: READER_A }),
    env,
  });
  assert.equal(m.calls.length, 0);
});

test("a failed send is logged and does not fail the comment", async () => {
  const errors = console.error;
  console.error = () => {};
  try {
    for (const status of [502, "throw"]) {
      const m = fakeMailer(status);
      const env = makeEnv({ MAILER: m.MAILER });
      const { session } = await signIn(env, "ana");
      assert.equal((await comment(env, session)).status, 201);
      assert.equal(m.calls.length, 1);
    }
    const ok = await notifyPendingAnnotation({ MAILER: fakeMailer("throw").MAILER }, {
      row: { status: "pending", type: "comment", post: POST, body: "x" },
      origin: ORIGIN,
    });
    assert.equal(ok, false);
  } finally {
    console.error = errors;
  }
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

test("a reply is labelled as a reply", () => {
  const { subject } = buildPendingEmail({ row: { type: "comment", parent_id: "a".repeat(32), post: POST, author_name: "ANA", body: "x" }, origin: ORIGIN });
  assert.match(subject, /New reply from ANA/);
});

test("mailer worker sends only to its configured recipient from its configured sender", async () => {
  const sent = [];
  const env = {
    MODERATION_EMAIL_FROM: "comments@aifoc.us",
    MODERATION_EMAIL_TO: "moderator@example.com",
    EMAIL: { send: async (msg) => { sent.push(msg); return { messageId: "m1" }; } },
  };
  const post = (body) => mailer.fetch(new Request("https://aifocus-mailer/send", { method: "POST", body: JSON.stringify(body) }), env);

  let res = await post({ subject: "Hi\r\nBcc: x@evil.test", text: "body", to: "attacker@evil.test" });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "moderator@example.com");
  assert.equal(sent[0].from.email, "comments@aifoc.us");
  assert.doesNotMatch(sent[0].subject, /[\r\n]/);

  assert.equal((await post({ subject: "", text: "x" })).status, 400);
  assert.equal((await mailer.fetch(new Request("https://aifocus-mailer/send"), env)).status, 405);
  const unconfigured = { ...env, MODERATION_EMAIL_TO: "" };
  assert.equal((await mailer.fetch(new Request("https://x/", { method: "POST", body: "{}" }), unconfigured)).status, 503);

  const failing = { ...env, EMAIL: { send: async () => { const e = new Error("no"); e.code = "E_SENDER_NOT_VERIFIED"; throw e; } } };
  const errors = console.error;
  console.error = () => {};
  try {
    res = await mailer.fetch(new Request("https://x/", { method: "POST", body: JSON.stringify({ subject: "s", text: "t" }) }), failing);
  } finally {
    console.error = errors;
  }
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "E_SENDER_NOT_VERIFIED");
});
