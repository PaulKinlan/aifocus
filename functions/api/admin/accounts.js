// GET  /api/admin/accounts                     every reader account
// POST /api/admin/accounts  { userId, status }  block ("blocked") or unblock ("active")
//
// Lists each account with its linked sign-in methods, whether it is trusted
// (see functions/api/admin/trust.js) and how many notes and comments it has
// written, by moderation status. A blocked account is treated as signed out
// (functions/_lib/auth.js getSessionUser), so it cannot post. Requires a
// verified Cloudflare Access identity (see functions/_lib/access.js).

import { json, isSameOrigin } from "../../_lib/reader.js";
import { verifyAccess } from "../../_lib/access.js";

const USER_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const LIMIT = 500;

export async function onRequestGet({ request, env }) {
  const who = await verifyAccess(request, env);
  if (!who) return json({ error: "Forbidden" }, 403);
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  const { results = [] } = await db
    .prepare(
      `SELECT u.id, u.display_name, u.profile_url, u.avatar_url, u.trusted, u.status, u.created_at,
              (SELECT GROUP_CONCAT(i.provider || ':' || i.handle, ' ') FROM identities i WHERE i.user_id = u.id) AS identities,
              (SELECT COUNT(*) FROM annotations a WHERE a.user_id = u.id AND a.type != 'highlight') AS written,
              (SELECT COUNT(*) FROM annotations a WHERE a.user_id = u.id AND a.type != 'highlight' AND a.status = 'approved') AS approved,
              (SELECT COUNT(*) FROM annotations a WHERE a.user_id = u.id AND a.type != 'highlight' AND a.status = 'pending') AS pending,
              (SELECT COUNT(*) FROM annotations a WHERE a.user_id = u.id AND a.type != 'highlight' AND a.status IN ('rejected', 'spam')) AS rejected
       FROM users u ORDER BY u.created_at DESC LIMIT ${LIMIT}`,
    )
    .all();
  const total = await db.prepare("SELECT COUNT(*) AS n FROM users").first();
  return json({ moderator: who.email, total: total?.n ?? results.length, users: results });
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
  const status = input?.status;
  if (typeof userId !== "string" || !USER_ID_RE.test(userId) || !["active", "blocked"].includes(status)) {
    return json({ error: "Invalid userId or status" }, 400);
  }
  const result = await db
    .prepare("UPDATE users SET status = ?, trusted = CASE WHEN ? = 'blocked' THEN 0 ELSE trusted END, updated_at = ? WHERE id = ?")
    .bind(status, status, Date.now(), userId)
    .run();
  if (!result?.meta?.changes) return json({ error: "No such account" }, 404);
  return json({ userId, status });
}
