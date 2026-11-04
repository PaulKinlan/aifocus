// POST /api/reader/reactions  { post, kind, on }
//
// Adds or removes one of the fixed reactions for the current reader. The set
// of kinds is fixed, so there is no free text here and nothing to moderate.
// Reactions need no account; a signed-in reader's reactions also record the
// account.

import {
  REACTION_KINDS,
  json,
  getReader,
  readerCookieHeader,
  isSameOrigin,
  normalizePostPath,
  loadPostText,
  hashIp,
  isRateLimited,
  reserveWriteEvent,
  UNKNOWN_IP_BUCKET,
} from "../../_lib/reader.js";
import { getSessionUser } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const post = normalizePostPath(input?.post);
  const kind = input?.kind;
  const on = input?.on !== false;
  if (!post || !REACTION_KINDS.includes(kind)) {
    return json({ error: "Invalid post or reaction" }, 400);
  }

  const reader = getReader(request);
  const user = await getSessionUser(request, db);
  const now = Date.now();
  // The reader cookie is client-controlled, so the per-reader count alone is
  // bypassable by rotating or dropping the cookie. The per-reader count is
  // checked first (best effort); the per-IP budget is consumed atomically by
  // reserveWriteEvent() below, BEFORE any work, so a concurrent burst cannot
  // all read the same pre-burst count (aifocus-e2o). A missing
  // CF-Connecting-IP header (local dev) folds into the shared
  // UNKNOWN_IP_BUCKET, so the limit still applies. Both toggle directions are
  // writes and share the budget: an unthrottled 'off' would let one client
  // delete and rewrite forever.
  //
  // "Before any work" includes the post-text fetch: the ASSETS fetch used to
  // run above this block, so a burst could all pay for it and only then be
  // counted (aifocus-80p, the same ordering hole as the annotation path).
  const ipHash = (await hashIp(db, request.headers.get("CF-Connecting-IP"))) ?? UNKNOWN_IP_BUCKET;
  if (await isRateLimited(db, reader.id, now)) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }
  if (!(await reserveWriteEvent(db, ipHash, now))) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }

  const url = new URL(request.url);
  if ((await loadPostText(env, url.origin, post)) === null) {
    return json({ error: "Unknown post" }, 404);
  }
  if (on) {
    try {
      await db
        .prepare("INSERT OR IGNORE INTO reactions (post, kind, reader, user_id, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(post, kind, reader.id, user?.id ?? null, ipHash, now)
        .run();
    } catch (err) {
      if (!/no such column|has no column named/i.test(err?.message ?? "")) throw err;
      // Defensive: reachable only in the 0005-missing-but-0006-present window
      // (the reservation on write_events succeeds, this insert then finds no
      // ip_hash column). With both migrations applied it cannot fire. Write
      // without the ip_hash column and say so loudly.
      console.error("reaction write without ip_hash: reactions.ip_hash missing; apply D1 migration 0005");
      await db
        .prepare("INSERT OR IGNORE INTO reactions (post, kind, reader, user_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(post, kind, reader.id, user?.id ?? null, now)
        .run();
    }
  } else {
    await db
      .prepare("DELETE FROM reactions WHERE post = ? AND kind = ? AND reader = ?")
      .bind(post, kind, reader.id)
      .run();
  }
  // The ledger row was written by reserveWriteEvent() above: one row per
  // accepted write, on or off, so a delete cannot erase the count the way
  // live rows could.

  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM reactions WHERE post = ? AND kind = ?")
    .bind(post, kind)
    .first();

  const headers = reader.isNew ? { "Set-Cookie": readerCookieHeader(reader.id) } : {};
  return json({ post, kind, on, count: row?.n ?? 0 }, 200, headers);
}
