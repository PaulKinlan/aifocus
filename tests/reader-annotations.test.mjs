// POST/DELETE /api/reader/annotations (aifocus-dsg4 split of
// reader.test.mjs): highlights and comments - validation against the live
// post, sign-in, moderation status, the safety screen and the per-reader
// annotation rate limit. Each case builds a fresh env via makeEnv().

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as getState } from "../functions/api/reader/state.js";
import { onRequestPost as postAnnotation, onRequestDelete as deleteAnnotation } from "../functions/api/reader/annotations.js";
import { LIMITS } from "../functions/_lib/reader.js";
import { ORIGIN, POST, POST_HTML, makeEnv, req, cookieFrom, READER_A, READER_B, signIn } from "./helpers/reader-fixtures.mjs";

test("highlights: quote must come from the post, approved immediately, deduplicated per reader", async () => {
  const env = makeEnv();
  const quote = { exact: "I didn't realise", prefix: "overnight & ", suffix: "." };
  let res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_A }), env });
  assert.equal(res.status, 201);
  const first = (await res.json()).annotation;
  assert.equal(first.status, "approved");

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_A }), env });
  assert.equal((await res.json()).annotation.id, first.id);

  await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_B }), env });

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote: { exact: "words that are not in the essay" } }, reader: READER_A }), env });
  assert.equal(res.status, 400);

  const state = await (await getState({ request: req(`/api/reader/state?post=${POST}`), env })).json();
  assert.equal(state.highlights.length, 1);
  assert.equal(state.highlights[0].count, 2);
  assert.equal(state.highlights[0].mine, false);
});

test("concurrent signed-in comment burst is capped at the per-IP limit", async () => {
  // aifocus-e2o: the AI-screening await used to sit between the limit check
  // and the ledger insert, so concurrent comments all read the same
  // pre-burst count and were accepted wholesale. The write-event reservation
  // is now the limiter: with screening slowed to 50 ms, 60 concurrent
  // comments from one IP must still be bounded by LIMITS.writesPerHour, and
  // exactly the accepted writes appear in the ledger.
  const env = makeEnv({
    AI: {
      run: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { response: { safe: true } };
      },
    },
  });
  const { session } = await signIn(env, "burst");
  const fire = (i) =>
    postAnnotation({
      request: req("/api/reader/annotations", {
        method: "POST",
        body: { post: POST, type: "comment", body: `burst comment ${i}` },
        reader: READER_A,
        session,
      }),
      env,
    });
  const responses = await Promise.all(Array.from({ length: 60 }, (_, i) => fire(i)));
  const accepted = responses.filter((r) => r.status === 201).length;
  const denied = responses.filter((r) => r.status === 429).length;
  assert.equal(accepted + denied, 60, "every request is accepted or 429");
  assert.ok(accepted <= LIMITS.writesPerHour, `accepted ${accepted} exceeded the per-IP budget ${LIMITS.writesPerHour}`);
  const events = await env.READER_DB.prepare("SELECT COUNT(*) AS n FROM write_events").first();
  assert.equal(events.n, accepted, "the ledger holds exactly the accepted requests");
});

test("notes and comments: require sign-in", async () => {
  const env = makeEnv();
  for (const body of [
    { post: POST, type: "comment", body: "Nice post" },
    { post: POST, type: "note", quote: { exact: "reverse engineering" }, body: "Ghidra counts too." },
  ]) {
    const res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body, reader: READER_A }), env });
    assert.equal(res.status, 401);
  }
  const res = await postAnnotation({
    request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "x" }, reader: READER_A, session: "A".repeat(43) }),
    env,
  });
  assert.equal(res.status, 401, "an unknown session token is signed out");
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM annotations").get().n, 0);
});

test("notes and comments: pending until approved, visible to their writer only", async () => {
  const env = makeEnv();
  const { session, user } = await signIn(env, "ana");
  let res = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "note", quote: { exact: "reverse engineering" }, body: "Ghidra counts too.", name: "Spoofed" },
      reader: READER_A,
      session,
    }),
    env,
  });
  assert.equal(res.status, 201);
  const note = (await res.json()).annotation;
  assert.equal(note.status, "pending");
  assert.equal(note.name, "ANA", "the name comes from the account, not the request");
  assert.equal(note.avatarUrl, "https://pbs.twimg.com/profile_images/ana_400x400.png");
  assert.equal(note.profileUrl, "https://github.com/ana");

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "Nice post" }, reader: READER_A, session }), env });
  const comment = (await res.json()).annotation;
  assert.equal(env.READER_DB.raw.prepare("SELECT user_id FROM annotations WHERE id = ?").get(comment.id).user_id, user.id);

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "" }, reader: READER_A, session }), env });
  assert.equal(res.status, 400);

  let mine = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_A }), env })).json();
  assert.equal(mine.notes.length, 1);
  assert.equal(mine.notes[0].status, "pending");
  assert.equal(mine.comments.length, 1);
  assert.equal(mine.highlights[0].mine, true);
  assert.equal(mine.highlights[0].count, 0, "a pending note's passage is not counted as shared");

  let other = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
  assert.equal(other.notes.length, 0);
  assert.equal(other.comments.length, 0);
  assert.equal(other.highlights.length, 0);

  env.READER_DB.raw.prepare("UPDATE annotations SET status = 'approved' WHERE id = ?").run(comment.id);
  other = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
  assert.equal(other.comments.length, 1);
  assert.equal(other.comments[0].body, "Nice post");
  assert.equal(other.comments[0].name, "ANA");
  assert.equal(other.viewer, null);
  assert.equal(other.comments[0].status, undefined, "status is only shown to the writer");
  assert.equal(other.comments[0].mine, undefined);

  res = await deleteAnnotation({ request: req(`/api/reader/annotations?id=${note.id}`, { method: "DELETE", reader: READER_B }), env });
  assert.equal(res.status, 404, "cannot delete another reader's note");
  res = await deleteAnnotation({ request: req(`/api/reader/annotations?id=${note.id}`, { method: "DELETE", reader: READER_A }), env });
  assert.equal(res.status, 200);
  mine = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_A }), env })).json();
  assert.equal(mine.notes.length, 0);
});

test("annotations: safety screen result is stored, and failures do not block saving", async () => {
  const env = makeEnv({ AI: { run: async () => ({ response: { safe: false, categories: ["S10"] } }) } });
  const { session } = await signIn(env);
  await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "bad" }, reader: READER_A, session }), env });
  let row = env.READER_DB.raw.prepare("SELECT screen, status, ip_hash FROM annotations").get();
  assert.equal(row.screen, "unsafe:S10");
  assert.equal(row.status, "pending");
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(row.ip_hash, "203.0.113.7");

  const failing = makeEnv({ AI: { run: async () => { throw new Error("down"); } } });
  const signedIn = await signIn(failing);
  const res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "ok" }, reader: READER_A, session: signedIn.session }), env: failing });
  assert.equal(res.status, 201);
  row = failing.READER_DB.raw.prepare("SELECT screen FROM annotations").get();
  assert.equal(row.screen, "error");
});

test("annotations: rate limited per reader", async () => {
  const env = makeEnv();
  const { session } = await signIn(env);
  let last;
  for (let i = 0; i < 31; i += 1) {
    last = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: `c${i}` }, reader: READER_A, session }), env });
  }
  assert.equal(last.status, 429);
});
