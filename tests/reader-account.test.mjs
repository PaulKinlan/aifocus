// GET /api/account (aifocus-dsg4 split of reader.test.mjs): the signed-in
// reader's own items across posts, with moderation status and per-kind caps.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as getAccount } from "../functions/api/account.js";
import { onRequestPost as postReaction } from "../functions/api/reader/reactions.js";
import { onRequestPost as postAnnotation } from "../functions/api/reader/annotations.js";
import { POST, POST_HTML, makeEnv, req, READER_A, READER_B, signIn } from "./helpers/reader-fixtures.mjs";

test("account: lists the signed-in account's own items across posts, with status", async () => {
  const env = makeEnv();
  assert.equal((await getAccount({ request: req("/api/account"), env })).status, 401);

  const { user, session } = await signIn(env, "cy");
  const other = await signIn(env, "dee");
  await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "mine" }, reader: READER_A, session }), env });
  await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "theirs" }, reader: READER_B, session: other.session }), env });
  await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader: READER_A, session }), env });

  const res = await getAccount({ request: req("/api/account", { session }), env });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.id, user.id);
  assert.deepEqual(body.identities.map((i) => i.provider), ["github"]);
  assert.deepEqual(body.annotations.map((a) => [a.type, a.body, a.status]), [["comment", "mine", "pending"]]);
  assert.deepEqual(body.reactions.map((r) => [r.post, r.kind]), [[POST, "useful"]]);
  assert.deepEqual(body.counts, { comment: 1, reaction: 1 });

  // Each kind is limited separately, so many highlights never hide a comment.
  const insert = env.READER_DB.raw.prepare(
    "INSERT INTO annotations (id, post, reader, type, quote_exact, status, created_at, user_id) VALUES (?, ?, ?, 'highlight', 'q', 'approved', ?, ?)",
  );
  for (let i = 0; i < body.limitPerKind + 5; i += 1) {
    insert.run(i.toString(16).padStart(32, "0"), POST, READER_A, Date.now() + 1000 + i, user.id);
  }
  const more = await (await getAccount({ request: req("/api/account", { session }), env })).json();
  assert.equal(more.counts.highlight, more.limitPerKind + 5);
  assert.equal(more.annotations.filter((a) => a.type === "highlight").length, more.limitPerKind);
  assert.ok(more.annotations.some((a) => a.type === "comment"));
});
