// GET  /api/admin/trust                      trusted accounts
// POST /api/admin/trust  { userId, trusted }  trust or stop trusting an account
//
// Notes and comments from a trusted account are published without waiting in
// the moderation queue, unless the safety screen flags them (see
// functions/api/reader/annotations.js). Accounts are trusted only from here;
// approving a comment does not trust its writer. Requires a verified
// Cloudflare Access identity (see functions/_lib/access.js).

import { json, isSameOrigin } from "../../_lib/reader.js";
import { verifyAccess } from "../../_lib/access.js";

const USER_ID_RE = /^[A-Za-z0-9_-]{22}$/;

export async function onRequestGet({ request, env }) {
  const who = await verifyAccess(request, env);
  if (!who) return json({ error: "Forbidden" }, 403);
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  const { results = [] } = await db
    .prepare(
      `SELECT u.id, u.display_name, u.profile_url, u.avatar_url, u.updated_at,
              (SELECT GROUP_CONCAT(i.provider || ':' || i.handle, ' ') FROM identities i WHERE i.user_id = u.id) AS identities
       FROM users u WHERE u.trusted = 1 ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all();
  return json({ moderator: who.email, users: results });
}

export async function onRequestPost({ request, env }) {
  const who = await verifyAccess(request, env);
  if (!who) return json({ error: "Forbidden" }, 403);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const userId = input?.userId;
  if (typeof userId !== "string" || !USER_ID_RE.test(userId) || typeof input?.trusted !== "boolean") {
    return json({ error: "Invalid userId or trusted" }, 400);
  }
  const result = await db
    .prepare("UPDATE users SET trusted = ?, updated_at = ? WHERE id = ?")
    .bind(input.trusted ? 1 : 0, Date.now(), userId)
    .run();
  if (!result?.meta?.changes) return json({ error: "No such account" }, 404);
  return json({ userId, trusted: input.trusted });
}
