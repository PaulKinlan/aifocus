// The shared write budget (aifocus-dsg4 split of reader.test.mjs). Both
// write endpoints reserve one per-IP slot from the same ledger before the
// expensive work, and these cases are the only place that pins that ordering
// from outside the handlers - reactions and annotations each spend it, so
// the contract gets ONE owning file instead of copies in each endpoint file.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as postReaction } from "../functions/api/reader/reactions.js";
import { onRequestPost as postAnnotation } from "../functions/api/reader/annotations.js";
import { LIMITS } from "../functions/_lib/reader.js";
import { ORIGIN, POST, POST_HTML, makeEnv, req, READER_A } from "./helpers/reader-fixtures.mjs";

// The write budget is meant to bound work, not just stored rows. Both write
// endpoints used to fetch the post's text (loadPostText: an /index.json read
// plus the page) before the per-IP slot was reserved, so a burst could all pay
// that cost and only then be counted, and a rejected body was free
// (aifocus-80p). These two cases pin the ordering from outside the handler:
// count the fetches, not the responses.
function countingEnv(pathname = "/index.json") {
  const env = makeEnv();
  const inner = env.ASSETS.fetch;
  const counts = { fetches: 0 };
  env.ASSETS.fetch = async (request) => {
    if (new URL(request.url).pathname === pathname) counts.fetches += 1;
    return inner(request);
  };
  return { env, counts };
}

test("annotations: a rejected quote still spends a write slot, and a denied caller never fetches the post", async () => {
  const { env, counts } = countingEnv();
  const notInPost = { exact: "words that are not in the essay" };
  // Every attempt is rejected after validation, and every rejection now costs
  // the IP one slot: a refund would hand back the budget the fetch just spent.
  for (let i = 0; i < LIMITS.writesPerHour; i += 1) {
    const res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote: notInPost } }), env });
    assert.equal(res.status, 400);
  }
  assert.equal(counts.fetches, LIMITS.writesPerHour);
  // The next attempt is refused at the reservation, so the expensive work does
  // not run at all for a request that was never going to be accepted.
  const denied = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote: { exact: "reverse engineering" } } }), env });
  assert.equal(denied.status, 429);
  assert.equal(counts.fetches, LIMITS.writesPerHour);
  // The ledger counted attempts, and no annotation was written.
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM write_events").get().n, LIMITS.writesPerHour);
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM annotations").get().n, 0);
});

test("reactions: an unknown post still spends a write slot before the post fetch", async () => {
  const { env, counts } = countingEnv();
  for (let i = 0; i < LIMITS.writesPerHour; i += 1) {
    const res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: "/no-such-post/", kind: "useful" } }), env });
    assert.equal(res.status, 404);
  }
  assert.equal(counts.fetches, LIMITS.writesPerHour);
  const denied = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }), env });
  assert.equal(denied.status, 429);
  assert.equal(counts.fetches, LIMITS.writesPerHour);
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM reactions").get().n, 0);
});

test("a duplicate highlight still passes post and quote validation (aifocus-1wz)", async () => {
  const env = makeEnv();
  const quote = { exact: "reverse engineering" };
  const send = () => postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_A }), env });

  assert.equal((await send()).status, 201, "the first highlight is stored");

  // The post is no longer published. A repeat must not answer with the stored
  // row: validation against the current post is the endpoint's contract, and
  // the duplicate shortcut used to return the old row before checking anything.
  const withIndex = env.ASSETS.fetch;
  env.ASSETS.fetch = async (request) => {
    if (new URL(request.url).pathname === "/index.json") return new Response(JSON.stringify({ articles: [] }));
    return withIndex(request);
  };
  assert.equal((await send()).status, 404, "unpublished post is refused even for a duplicate");

  // The post changed so the quote no longer occurs in it.
  env.ASSETS.fetch = async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/index.json") {
      return new Response(JSON.stringify({ articles: [{ url: `${ORIGIN}${POST}`, title: "setting goals" }] }));
    }
    if (path === POST) {
      return new Response('<html><body><article class=h-entry><div class=e-content><p>rewritten entirely</p></div></article></body></html>');
    }
    return new Response("not found", { status: 404 });
  };
  assert.equal((await send()).status, 400, "a quote that no longer matches is refused");
});
