// POST /api/reader/reactions (aifocus-dsg4 split of reader.test.mjs):
// toggling, validation, the per-IP rate limit and the write-event ledger's
// failure modes. Each case builds a fresh env via makeEnv(), so they share
// no D1 and run in any order.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as getState } from "../functions/api/reader/state.js";
import { onRequestPost as postReaction } from "../functions/api/reader/reactions.js";
import { createD1 } from "./helpers/d1.mjs";
import { MIGRATIONS, MIGRATIONS_PRE_IP, ORIGIN, POST, POST_HTML, makeEnv, req, cookieFrom, READER_A, READER_B, signIn } from "./helpers/reader-fixtures.mjs";

test("reactions: toggle on and off, counted per reader, cookie set for new readers", async () => {
  const env = makeEnv();
  let res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }), env });
  assert.equal(res.status, 200);
  const reader = cookieFrom(res);
  assert.ok(reader);
  assert.equal((await res.json()).count, 1);

  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader }), env });
  assert.equal((await res.json()).count, 1, "same reader twice counts once");
  assert.equal(cookieFrom(res), null, "existing reader is not re-issued a cookie");

  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader: READER_B }), env });
  assert.equal((await res.json()).count, 2);

  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful", on: false }, reader }), env });
  assert.equal((await res.json()).count, 1);

  const state = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
  assert.equal(state.reactions.useful, 1);
  assert.deepEqual(state.myReactions, ["useful"]);
});

test("reactions: rejects unknown kinds, unknown posts and cross-origin writes", async () => {
  const env = makeEnv();
  let res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "angry" } }), env });
  assert.equal(res.status, 400);
  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: "/nope/", kind: "useful" } }), env });
  assert.equal(res.status, 404);
  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, origin: "https://evil.example" }), env });
  assert.equal(res.status, 403);
  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, origin: null }), env });
  assert.equal(res.status, 403);
});

test("reactions: rate limited per client IP even when the reader cookie rotates", async () => {
  const env = makeEnv();
  // The bypass: no cookie is ever sent back, so every request gets a fresh
  // reader id, the per-reader count stays at zero, and rotated writes just
  // keep succeeding until the per-IP count stops the flood.
  for (let i = 0; i < 2; i += 1) {
    const res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }), env });
    assert.equal(res.status, 200);
  }
  let last;
  for (let i = 2; i < 31; i += 1) {
    last = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }), env });
    assert.equal(last.status, i < 30 ? 200 : 429);
  }
  // Exactly the 30 accepted writes are stored, each with the salted IP hash.
  const row = env.READER_DB.raw
    .prepare("SELECT COUNT(*) AS n, ip_hash FROM reactions GROUP BY ip_hash")
    .get();
  assert.equal(row.n, 30);
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
});

test("reactions: a missing client IP still shares a rate-limit bucket", async () => {
  const env = makeEnv();
  let last;
  for (let i = 0; i < 31; i += 1) {
    last = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, ip: null }), env });
    assert.equal(last.status, i < 30 ? 200 : 429);
  }
  // Every header-less write lands in the one shared UNKNOWN_IP_BUCKET.
  const row = env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM reactions WHERE ip_hash = 'unknown'").get();
  assert.equal(row.n, 30);
});

test("reactions: rate limit counts write events, so on/off toggling cannot outrun it", async () => {
  const env = makeEnv();
  // The old limiter counted live rows, so toggling on and off deleted its own
  // count: 31 on/off pairs from one IP with rotating readers were all accepted.
  let writes = 0;
  let tripped = false;
  for (let i = 0; i < 40 && !tripped; i += 1) {
    const on = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }), env });
    if (on.status === 429) { tripped = true; break; }
    writes += 1;
    const reader = cookieFrom(on);
    const off = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful", on: false }, reader }), env });
    if (off.status === 429) { tripped = true; break; }
    writes += 1;
  }
  // Exactly the 31st write event trips it, whichever direction it is.
  assert.equal(writes, 30);
  assert.equal(tripped, true);
  // Nothing was retained: the ledger counted events, not live rows.
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM reactions").get().n, 0);
  // The off path is rate limited too, not just the on path.
  const offAfter = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful", on: false }, reader: READER_A }), env });
  assert.equal(offAfter.status, 429);
});

test("reactions: the write-event ledger prunes rows older than two hours", async () => {
  const env = makeEnv();
  env.READER_DB.raw
    .prepare("INSERT INTO write_events (ip_hash, created_at) VALUES ('stale', ?)")
    .run(Date.now() - 3 * 60 * 60 * 1000);
  // An accepted write prunes opportunistically (the limiter only looks back
  // 60 minutes, so the stale row is dead weight).
  const res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader: READER_A }), env });
  assert.equal(res.status, 200);
  // Only the fresh event survives; the stale one is gone.
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM write_events").get().n, 1);
});

test("reactions: a functions deploy that runs before migration 0005 denies writes loudly", async () => {
  const env = makeEnv({ READER_DB: createD1(MIGRATIONS_PRE_IP) });
  // The reactions table has no ip_hash column and there is no write_events
  // ledger: there is no append-only counter to limit with, so the write path
  // fails closed (429) instead of half-working behind an erasable counter.
  const res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader: READER_A }), env });
  assert.equal(res.status, 429);
  const off = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful", on: false }, reader: READER_A }), env });
  assert.equal(off.status, 429);
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM reactions").get().n, 0);
});

test("reactions: an unexpected database error fails the rate limit closed", async () => {
  const env = makeEnv();
  const inner = env.READER_DB.prepare.bind(env.READER_DB);
  env.READER_DB.prepare = (sql) => {
    // Anything other than the known missing-column case: the limiter must
    // deny writes rather than silently run per-reader only.
    if (sql.includes("AS by_reader")) throw new Error("disk I/O error");
    return inner(sql);
  };
  const res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader: READER_A }), env });
  assert.equal(res.status, 429);
});
