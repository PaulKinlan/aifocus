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
import { json } from "../_lib/reader.js";

// The most recent items of each kind are returned (notes, comments,
// highlights and reactions each up to this many), so a long run of one kind
// never hides another. `counts` always covers the full history.
const LIMIT_PER_KIND = 200;

export async function onRequestGet({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Accounts are not available" }, 503);
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

// DELETE /api/account
//
// Erase the signed-in account: everything written under it, the sign-in methods
// linked to it, its sessions, any in-flight link flow and the account row
// itself. Hard delete - there is no soft-delete window or archive, and nothing
// is retained for attribution, because the rows that carried the attribution
// are the rows being deleted. Rows written before signing in carry only the
// anonymous reader cookie (no user_id), so they are not part of the account and
// are left alone; other readers' rows are never in scope.
export async function onRequestDelete({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Accounts are not available" }, 503);
  const user = await getSessionUser(request, db);
  if (!user) return json({ error: "Not signed in" }, 401);

  let results;
  try {
    results = await db.batch([
      db.prepare("DELETE FROM annotations WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM reactions WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM identities WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM oauth_states WHERE link_user_id = ?").bind(user.id),
      db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    ]);
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
