// GET /api/reader/state?post=/slug/
//
// Everything the post page needs to render reader features: reaction counts,
// the reader's own reactions, approved highlights grouped by passage, and
// notes and comments. Approved rows are visible to everyone; the reader's own
// rows are included whatever their moderation status.

import {
  REACTION_KINDS,
  json,
  readCookie,
  READER_COOKIE,
  normalizePostPath,
  looseText,
  publicAnnotation,
} from "../../_lib/reader.js";
import { getSessionUser, publicUser } from "../../_lib/auth.js";
import { configuredProviders } from "../../_lib/providers/index.js";

export async function onRequestGet({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);

  const url = new URL(request.url);
  const post = normalizePostPath(url.searchParams.get("post"));
  if (!post) return json({ error: "Missing or invalid post" }, 400);

  const cookie = readCookie(request, READER_COOKIE);
  const reader = cookie && /^[0-9a-f]{32}$/.test(cookie) ? cookie : null;
  const user = await getSessionUser(request, db);

  const [counts, mine, rows] = await db.batch([
    db.prepare("SELECT kind, COUNT(*) AS n FROM reactions WHERE post = ? GROUP BY kind").bind(post),
    db.prepare("SELECT kind FROM reactions WHERE post = ? AND reader = ?").bind(post, reader ?? ""),
    db
      .prepare(
        `SELECT annotations.*,
                users.display_name AS user_display_name,
                users.avatar_url AS user_avatar_url,
                users.profile_url AS user_profile_url
         FROM annotations LEFT JOIN users ON users.id = annotations.user_id
         WHERE annotations.post = ?1
           AND (annotations.status = 'approved' OR annotations.reader = ?2
                OR (annotations.user_id IS NOT NULL AND annotations.user_id = ?3))
         ORDER BY annotations.created_at ASC
         LIMIT 500`,
      )
      .bind(post, reader ?? "", user?.id ?? ""),
  ]);

  const reactions = Object.fromEntries(REACTION_KINDS.map((k) => [k, 0]));
  for (const row of counts.results ?? []) {
    if (row.kind in reactions) reactions[row.kind] = row.n;
  }

  // Group approved quotes (highlights and notes) by passage so the page can
  // shade a passage by how many readers marked it.
  const passages = new Map();
  const notes = [];
  const comments = [];
  for (const row of rows.results ?? []) {
    const isMine = (reader !== null && row.reader === reader) || (user !== null && row.user_id === user.id);
    if (row.quote_exact && (row.status === "approved" || isMine)) {
      const key = looseText(row.quote_exact);
      const entry = passages.get(key) ?? {
        exact: row.quote_exact,
        prefix: row.quote_prefix || "",
        suffix: row.quote_suffix || "",
        count: 0,
        mine: false,
      };
      if (row.status === "approved") entry.count += 1;
      if (isMine) entry.mine = true;
      passages.set(key, entry);
    }
    if (row.type === "note") notes.push(publicAnnotation(row, { mine: isMine }));
    if (row.type === "comment") comments.push(publicAnnotation(row, { mine: isMine }));
  }

  return json({
    post,
    reactions,
    myReactions: (mine.results ?? []).map((r) => r.kind),
    highlights: [...passages.values()],
    notes,
    comments,
    viewer: publicUser(user),
    providers: configuredProviders(env),
  });
}
