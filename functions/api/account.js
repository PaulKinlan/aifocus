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

const LIMIT = 500;

export async function onRequestGet({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Accounts are not available" }, 503);
  const user = await getSessionUser(request, db);
  if (!user) return json({ error: "Not signed in" }, 401);

  const [annotations, reactions] = await db.batch([
    db
      .prepare(
        `SELECT id, post, type, quote_exact, body, status, created_at FROM annotations
         WHERE user_id = ? ORDER BY created_at DESC LIMIT ${LIMIT}`,
      )
      .bind(user.id),
    db
      .prepare(`SELECT post, kind, created_at FROM reactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ${LIMIT}`)
      .bind(user.id),
  ]);

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
  });
}
