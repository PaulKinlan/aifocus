// GET /api/account
//
// The signed-in reader's account: profile, linked sign-in methods, the
// providers that can still be linked, and everything written under the
// account across all posts (notes, comments, highlights and reactions), with
// each note's and comment's moderation status. Only the account's own rows
// are returned, so pending and rejected items are safe to show here.
// Rows written before signing in carry only the anonymous reader cookie and
// are not included.

import { getSessionUser, listIdentities, publicUser } from "../_lib/auth.js";
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
