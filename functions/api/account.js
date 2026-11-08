// GET /api/account
//
// The signed-in reader's account: profile, linked sign-in methods, the
// providers that can still be linked, and everything written under the
// account across all posts (notes, comments, highlights and reactions), with
// each note's and comment's moderation status. Only the account's own rows
// are returned, so pending and rejected items are safe to show here.
// Rows written before signing in carry only the anonymous reader cookie and
// are not included.

import { getSessionUser, listIdentities, publicUser, clearSessionCookie } from "../_lib/auth.js";
import { configuredProviders } from "../_lib/providers/index.js";
import { json, isSameOrigin, hashIp, reserveReadEvent } from "../_lib/reader.js";

// The most recent items of each kind are returned (notes, comments,
// highlights and reactions each up to this many), so a long run of one kind
// never hides another. `counts` always covers the full history.
const LIMIT_PER_KIND = 200;

export async function onRequestGet({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Accounts are not available" }, 503);

  // getSessionUser and the batch below spend D1 on every call, so reserve the
  // shared read budget first - the same reservation /api/reader/state makes
  // (aifocus-0cz), extended to the authenticated read endpoints
  // (aifocus-pr7b).
  let ipHash = null;
  try {
    ipHash = await hashIp(db, request.headers.get("CF-Connecting-IP"));
  } catch (err) {
    console.error("account: ip hash failed, using the shared bucket", err?.message || err);
  }
  const budget = await reserveReadEvent(db, ipHash);
  if (budget === "limited") {
    return json({ error: "Too many requests. Please try again later." }, 429);
  }
  if (budget === "error") {
    return json({ error: "Account is unavailable. Please try again later." }, 503);
  }

  const user = await getSessionUser(request, db);
  if (!user) return json({ error: "Not signed in" }, 401);

  const [annotations, reactions, annotationCounts, reactionCount] = await db.batch([
    db
      .prepare(
        `SELECT id, post, type, quote_exact, body, status, created_at FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY type ORDER BY created_at DESC) AS n
           FROM annotations WHERE user_id = ?
         ) WHERE n <= ${LIMIT_PER_KIND} ORDER BY created_at DESC`,
      )
      .bind(user.id),
    db
      .prepare(`SELECT post, kind, created_at FROM reactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ${LIMIT_PER_KIND}`)
      .bind(user.id),
    db.prepare("SELECT type, COUNT(*) AS n FROM annotations WHERE user_id = ? GROUP BY type").bind(user.id),
    db.prepare("SELECT COUNT(*) AS n FROM reactions WHERE user_id = ?").bind(user.id),
  ]);
  const counts = Object.fromEntries((annotationCounts.results ?? []).map((r) => [r.type, r.n]));
  counts.reaction = reactionCount.results?.[0]?.n ?? 0;

  return json({
    user: publicUser(user),
    identities: await listIdentities(db, user.id),
    providers: configuredProviders(env),
    annotations: (annotations.results ?? []).map((row) => ({
      id: row.id,
      post: row.post,
      type: row.type,
      quote: row.quote_exact || null,
      body: row.body || null,
      status: row.status,
      createdAt: row.created_at,
    })),
    reactions: (reactions.results ?? []).map((row) => ({ post: row.post, kind: row.kind, createdAt: row.created_at })),
    counts,
    limitPerKind: LIMIT_PER_KIND,
  });
}

// --- Erasure policy -------------------------------------------------------
//
// POLICY: hard delete, scoped to the account. Everything keyed to the account
// goes, including the rows that carried the attribution, so nothing is retained
// for attribution and there is no soft-delete window or archive. Rows written
// before signing in carry only the anonymous reader cookie (`user_id IS NULL`),
// are not part of the account, and are left alone.
//
// This function is the whole policy. To switch to anonymise-tombstone - keep
// the discussion but stop identifying the author - replace ONLY the last two
// statements with an UPDATE that clears display_name/avatar_url/profile_url and
// sets status = 'blocked', keep the identities/sessions/oauth_states deletes
// (they are the sign-in surface, not attribution), and decide deliberately
// whether annotations become `UPDATE annotations SET user_id = NULL, body =
// NULL` (thread keeps its shape) or stay deleted. Nothing outside this function
// assumes a hard delete: the caller only reports the change counts.
const erasureStatements = (db, userId) => [
  db.prepare("DELETE FROM annotations WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM reactions WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM identities WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM oauth_states WHERE link_user_id = ?").bind(userId),
  db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
];

// DELETE /api/account
//
// Erase the signed-in account through the policy above. Erasure is only ever a
// DELETE: the GET handler reads and never writes, so a prefetch, a crawler or a
// stray link cannot delete an account.
export async function onRequestDelete({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Accounts are not available" }, 503);
  // Every mutating endpoint refuses a foreign Origin (THREAT_MODEL.md section 4),
  // and erasure is the one where getting it wrong is unrecoverable: a page on
  // another origin could otherwise fire this DELETE at a signed-in reader and
  // destroy the account. Checked before the session lookup so a cross-origin
  // probe learns nothing about whether a session exists.
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const user = await getSessionUser(request, db);
  if (!user) return json({ error: "Not signed in" }, 401);

  let results;
  try {
    results = await db.batch(erasureStatements(db, user.id));
  } catch (err) {
    // Partial failure is possible in a batch, so say so rather than reporting a
    // delete that may not have happened. The account can be deleted again; the
    // statements are idempotent.
    console.error("account delete failed", err?.message || err);
    return json({ error: "Could not delete the account. Please try again." }, 503);
  }

  const deleted = {
    annotations: results[0]?.meta?.changes ?? results[0]?.changes ?? 0,
    reactions: results[1]?.meta?.changes ?? results[1]?.changes ?? 0,
    identities: results[2]?.meta?.changes ?? results[2]?.changes ?? 0,
    sessions: results[3]?.meta?.changes ?? results[3]?.changes ?? 0,
  };
  return json({ deleted }, 200, { "Set-Cookie": clearSessionCookie() });
}
