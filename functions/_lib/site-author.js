// The site's author (Paul) is recognised by the sign-in identity linked to
// their reader account, configured in wrangler.toml as SITE_AUTHOR_IDENTITIES:
// a comma-separated list of "<provider>:<provider_id>" pairs, for example
// "github:45510". provider_id is the provider's stable id (GitHub numeric id,
// Bluesky DID, X user id), never a handle.
//
// Comments and replies from an author account are labelled "Author" on the
// page and are published without waiting in the moderation queue.

export function siteAuthorIdentities(env) {
  const raw = typeof env?.SITE_AUTHOR_IDENTITIES === "string" ? env.SITE_AUTHOR_IDENTITIES : "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z]+:[^\s,]+$/.test(s));
}

// A statement selecting the user_id of every author account, or null when no
// author identity is configured.
export function siteAuthorUsersStmt(env, db) {
  const ids = siteAuthorIdentities(env);
  if (ids.length === 0) return null;
  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(`SELECT DISTINCT user_id FROM identities WHERE (provider || ':' || provider_id) IN (${placeholders})`)
    .bind(...ids);
}

export async function siteAuthorUserIds(env, db) {
  const stmt = siteAuthorUsersStmt(env, db);
  if (!stmt) return new Set();
  const { results = [] } = await stmt.all();
  return new Set(results.map((r) => r.user_id));
}

export async function isSiteAuthor(env, db, userId) {
  if (!userId) return false;
  return (await siteAuthorUserIds(env, db)).has(userId);
}
