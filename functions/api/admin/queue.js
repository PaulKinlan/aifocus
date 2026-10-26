// GET /api/admin/queue?status=pending|approved|rejected|spam&before=<ms>
//
// Moderation queue for notes and comments. Requires a verified Cloudflare
// Access identity (see functions/_lib/access.js).

import { json, MODERATION_STATUSES } from "../../_lib/reader.js";
import { verifyAccess } from "../../_lib/access.js";

export async function onRequestGet({ request, env }) {
  const who = await verifyAccess(request, env);
  if (!who) return json({ error: "Forbidden" }, 403);
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  if (!MODERATION_STATUSES.includes(status)) return json({ error: "Invalid status" }, 400);
  const before = Number.parseInt(url.searchParams.get("before") || "", 10);

  const [items, counts] = await db.batch([
    db
      .prepare(
        `SELECT id, post, type, quote_exact, body, author_name, status, screen, created_at, moderated_at, moderated_by
         FROM annotations
         WHERE status = ?1 AND type != 'highlight' AND created_at < ?2
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .bind(status, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER),
    db.prepare(
      "SELECT status, COUNT(*) AS n FROM annotations WHERE type != 'highlight' GROUP BY status",
    ),
  ]);

  return json({
    moderator: who.email,
    status,
    counts: Object.fromEntries((counts.results ?? []).map((r) => [r.status, r.n])),
    items: items.results ?? [],
  });
}
