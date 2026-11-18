// Replies to comments: POST /api/reader/annotations with a parentId, the
// comment tree in GET /api/reader/state, the site author's label and
// auto-approval, and reply context in the moderation queue.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as getState } from "../functions/api/reader/state.js";
import { onRequestPost as postAnnotation, onRequestDelete as deleteAnnotation } from "../functions/api/reader/annotations.js";
import { onRequestGet as getQueue } from "../functions/api/admin/queue.js";
import { siteAuthorIdentities } from "../functions/_lib/site-author.js";
import { POST, makeEnv, req, READER_A, READER_B, signIn, makeSigner, TEAM, AUD } from "./helpers/reader-fixtures.mjs";

const AUTHOR = "github:45510";

const comment = async (env, session, reader, body, parentId) => {
  const res = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "comment", body, ...(parentId ? { parentId } : {}) },
      reader,
      session,
    }),
    env,
  });
  return { status: res.status, json: await res.json() };
};

const approve = (env, id) =>
  env.READER_DB.prepare("UPDATE annotations SET status = 'approved' WHERE id = ?").bind(id).run();

const state = async (env, opts = {}) =>
  (await getState({ request: req(`/api/reader/state?post=${POST}`, opts), env })).json();

test("replies nest to any depth and come back as a tree", async () => {
  const env = makeEnv();
  const ana = await signIn(env, "ana");
  const bo = await signIn(env, "bo");
  const top = await comment(env, ana.session, READER_A, "Top level");
  await approve(env, top.json.annotation.id);
  let parent = top.json.annotation.id;
  const ids = [];
  for (let depth = 1; depth <= 6; depth++) {
    const who = depth % 2 ? bo : ana;
    const r = await comment(env, who.session, depth % 2 ? READER_B : READER_A, `Depth ${depth}`, parent);
    assert.equal(r.status, 201);
    assert.equal(r.json.annotation.parentId, parent);
    assert.equal(r.json.annotation.status, "pending");
    await approve(env, r.json.annotation.id);
    ids.push(r.json.annotation.id);
    parent = r.json.annotation.id;
  }
  const s = await state(env);
  assert.equal(s.comments.length, 1, "replies are not listed as top-level comments");
  let node = s.comments[0];
  for (let depth = 1; depth <= 6; depth++) {
    assert.equal(node.replies.length, 1);
    node = node.replies[0];
    assert.equal(node.body, `Depth ${depth}`);
    assert.equal(node.id, ids[depth - 1]);
  }
  assert.deepEqual(node.replies, []);
});

test("replies follow moderation: pending replies are visible only to their writer", async () => {
  const env = makeEnv();
  const ana = await signIn(env, "ana");
  const bo = await signIn(env, "bo");
  const top = await comment(env, ana.session, READER_A, "Top");
  await approve(env, top.json.annotation.id);
  const reply = await comment(env, bo.session, READER_B, "Pending reply", top.json.annotation.id);
  assert.equal(reply.json.annotation.status, "pending");

  assert.equal((await state(env)).comments[0].replies.length, 0, "anonymous viewers do not see it");
  const mine = await state(env, { session: bo.session, reader: READER_B });
  assert.equal(mine.comments[0].replies.length, 1);
  assert.equal(mine.comments[0].replies[0].mine, true);
  assert.equal(mine.comments[0].replies[0].status, "pending");
});

test("a hidden or deleted comment hides the replies under it", async () => {
  const env = makeEnv();
  const ana = await signIn(env, "ana");
  const bo = await signIn(env, "bo");
  const top = await comment(env, ana.session, READER_A, "Top");
  await approve(env, top.json.annotation.id);
  const reply = await comment(env, bo.session, READER_B, "Reply", top.json.annotation.id);
  await approve(env, reply.json.annotation.id);
  assert.equal((await state(env)).comments[0].replies.length, 1);

  await env.READER_DB.prepare("UPDATE annotations SET status = 'rejected' WHERE id = ?").bind(top.json.annotation.id).run();
  assert.equal((await state(env)).comments.length, 0);

  await approve(env, top.json.annotation.id);
  const del = await deleteAnnotation({
    request: req(`/api/reader/annotations?id=${top.json.annotation.id}`, { method: "DELETE", reader: READER_A, session: ana.session }),
    env,
  });
  assert.equal(del.status, 200);
  assert.deepEqual((await state(env)).comments, []);
});

test("cannot reply to a comment the replier cannot see, a note, another post or a missing id", async () => {
  const env = makeEnv();
  const ana = await signIn(env, "ana");
  const bo = await signIn(env, "bo");
  const pending = await comment(env, ana.session, READER_A, "Still pending");
  let r = await comment(env, bo.session, READER_B, "Sneaky", pending.json.annotation.id);
  assert.equal(r.status, 404, "someone else's pending comment");

  r = await comment(env, ana.session, READER_A, "Replying to my own pending comment", pending.json.annotation.id);
  assert.equal(r.status, 201, "the writer can see their own pending comment");

  // An approved reply under a pending top-level comment is still not visible
  // to others, so it cannot be replied to either.
  await approve(env, r.json.annotation.id);
  r = await comment(env, bo.session, READER_B, "Deep sneaky", r.json.annotation.id);
  assert.equal(r.status, 404, "an ancestor is not visible");

  const note = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "note", quote: { exact: "reverse engineering" }, body: "A note" },
      reader: READER_A,
      session: ana.session,
    }),
    env,
  });
  const noteId = (await note.json()).annotation.id;
  await approve(env, noteId);
  r = await comment(env, bo.session, READER_B, "Reply to a note", noteId);
  assert.equal(r.status, 404, "notes are not replied to");

  r = await comment(env, bo.session, READER_B, "Ghost", "f".repeat(32));
  assert.equal(r.status, 404);

  const other = await env.READER_DB.prepare(
    "INSERT INTO annotations (id, post, reader, type, body, status, created_at) VALUES (?, '/other/', ?, 'comment', 'x', 'approved', 1)",
  ).bind("e".repeat(32), READER_A).run();
  assert.ok(other);
  r = await comment(env, bo.session, READER_B, "Cross-post", "e".repeat(32));
  assert.equal(r.status, 404, "the parent must be on the same post");

  for (const parentId of ["not-an-id", 42]) {
    const res = await postAnnotation({
      request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "x", parentId }, reader: READER_B, session: bo.session }),
      env,
    });
    assert.equal(res.status, 400);
  }
  const res = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "note", quote: { exact: "reverse engineering" }, body: "x", parentId: noteId },
      reader: READER_B,
      session: bo.session,
    }),
    env,
  });
  assert.equal(res.status, 400, "only comments take a parentId");
});

test("replies require sign-in", async () => {
  const env = makeEnv();
  const ana = await signIn(env, "ana");
  const top = await comment(env, ana.session, READER_A, "Top");
  await approve(env, top.json.annotation.id);
  const r = await comment(env, undefined, READER_B, "Anon reply", top.json.annotation.id);
  assert.equal(r.status, 401);
});

test("the site author's comments and replies are approved and labelled", async () => {
  const env = makeEnv({ SITE_AUTHOR_IDENTITIES: AUTHOR, AI: { run: async () => ({ response: { safe: false, categories: ["S1"] } }) } });
  const ana = await signIn(env, "ana");
  const paul = await signIn(env, "paul", { providerId: "45510" });
  const top = await comment(env, ana.session, READER_A, "Question for the author");
  assert.equal(top.json.annotation.status, "pending");
  await approve(env, top.json.annotation.id);

  const reply = await comment(env, paul.session, READER_B, "Answer", top.json.annotation.id);
  assert.equal(reply.status, 201);
  assert.equal(reply.json.annotation.status, "approved", "even when the screen flags it");
  assert.equal(reply.json.annotation.isAuthor, true);

  const s = await state(env);
  assert.equal(s.comments[0].isAuthor, undefined);
  assert.equal(s.comments[0].replies[0].isAuthor, true);
  assert.equal(s.comments[0].replies[0].body, "Answer");

  // Without the setting nobody is the author, and the same account waits in
  // the queue like everyone else.
  const plain = makeEnv();
  const paul2 = await signIn(plain, "paul", { providerId: "45510" });
  const c = await comment(plain, paul2.session, READER_B, "Hello");
  assert.equal(c.json.annotation.status, "pending");
  assert.equal(c.json.annotation.isAuthor, undefined);
});

test("SITE_AUTHOR_IDENTITIES parsing ignores malformed entries", () => {
  assert.deepEqual(siteAuthorIdentities({ SITE_AUTHOR_IDENTITIES: " github:45510 , bad, bluesky:did:plc:abc ,x: " }), [
    "github:45510",
    "bluesky:did:plc:abc",
  ]);
  assert.deepEqual(siteAuthorIdentities({}), []);
});

test("the moderation queue shows the comment a reply answers", async () => {
  const { sign, fetchImpl } = await makeSigner();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const env = makeEnv({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
    const ana = await signIn(env, "ana");
    const bo = await signIn(env, "bo");
    const top = await comment(env, ana.session, READER_A, "The original point");
    await approve(env, top.json.annotation.id);
    const reply = await comment(env, bo.session, READER_B, "A reply", top.json.annotation.id);
    const now = Math.floor(Date.now() / 1000);
    const jwt = await sign({ aud: [AUD], iss: `https://${TEAM}`, email: "mod@example.com", exp: now + 60, iat: now, nbf: now - 1 });
    const res = await getQueue({ request: req("/api/admin/queue", { headers: { "Cf-Access-Jwt-Assertion": jwt } }), env });
    assert.equal(res.status, 200);
    const { items } = await res.json();
    const item = items.find((i) => i.id === reply.json.annotation.id);
    assert.equal(item.parent_id, top.json.annotation.id);
    assert.equal(item.parent_body, "The original point");
    assert.equal(item.parent_author_name, "ANA");
    assert.equal(item.parent_status, "approved");
  } finally {
    globalThis.fetch = realFetch;
  }
});
