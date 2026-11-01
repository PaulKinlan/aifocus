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

  const url = new URL(request.url);
  if ((await loadPostText(env, url.origin, post)) === null) {
    return json({ error: "Unknown post" }, 404);
  }

  const reader = getReader(request);
  const user = await getSessionUser(request, db);
  const now = Date.now();
  if (on) {
    // The reader cookie is client-controlled, so the per-reader count alone is
    // bypassable by rotating or dropping the cookie. The per-IP half of
    // isRateLimited() does the real work here; a missing CF-Connecting-IP
    // header (local dev) folds into the shared UNKNOWN_IP_BUCKET, so the
    // limit still applies.
    const ipHash = (await hashIp(db, request.headers.get("CF-Connecting-IP"))) ?? UNKNOWN_IP_BUCKET;
    if (await isRateLimited(db, reader.id, ipHash, now)) {
      return json({ error: "Too many requests. Try again later." }, 429);
    }
    try {
      await db
        .prepare("INSERT OR IGNORE INTO reactions (post, kind, reader, user_id, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(post, kind, reader.id, user?.id ?? null, ipHash, now)
        .run();
    } catch {
      // Migration 0005 not applied yet: write without the ip_hash column
      // rather than failing the reaction.
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
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM reactions WHERE post = ? AND kind = ?")
    .bind(post, kind)
    .first();

  const headers = reader.isNew ? { "Set-Cookie": readerCookieHeader(reader.id) } : {};
  return json({ post, kind, on, count: row?.n ?? 0 }, 200, headers);
}
