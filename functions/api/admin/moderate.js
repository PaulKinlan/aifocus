// POST /api/admin/moderate  { ids: [<id>...], status: "approved"|"rejected"|"spam"|"pending" }
//
// Sets the moderation status of notes and comments. Requires a verified
// Cloudflare Access identity (see functions/_lib/access.js).

import { json, isSameOrigin, MODERATION_STATUSES } from "../../_lib/reader.js";
import { verifyAccess } from "../../_lib/access.js";

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
  const ids = Array.isArray(input?.ids) ? input.ids.filter((id) => /^[0-9a-f]{32}$/.test(id)) : [];
  const status = input?.status;
  if (ids.length === 0 || ids.length > 100 || !MODERATION_STATUSES.includes(status)) {
    return json({ error: "Invalid ids or status" }, 400);
  }

  const now = Date.now();
  const stmt = db.prepare(
    "UPDATE annotations SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND type != 'highlight'",
  );
  const results = await db.batch(ids.map((id) => stmt.bind(status, now, who.email, id)));
  const updated = results.reduce((n, r) => n + (r?.meta?.changes ?? 0), 0);

  // Approving a note or comment trusts its account, so the account's later
  // ones are published without waiting (see functions/api/reader/annotations.js).
  // Marking one as spam removes that trust.
  if (status === "approved" || status === "spam") {
    const trust = db.prepare(
      `UPDATE users SET trusted = ?, updated_at = ?
       WHERE id = (SELECT user_id FROM annotations WHERE id = ? AND user_id IS NOT NULL)`,
    );
    await db.batch(ids.map((id) => trust.bind(status === "approved" ? 1 : 0, now, id)));
  }
  return json({ status, updated });
}
