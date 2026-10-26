// Reader accounts and sessions, stored in the `aifocus-reader` D1 database.
//
// A reader signs in with an external account (see functions/_lib/providers/).
// The identity is linked to a `users` row, and a random session token is set
// in an HttpOnly cookie. Only the SHA-256 of the token is stored.
//
// Sign-in is an OAuth authorization-code flow with PKCE. The `state` value is
// stored in D1 with the verifier and the page to return to, and is also set
// in a short-lived cookie, so a callback only completes in the browser that
// started it (this blocks login CSRF).

export const SESSION_COOKIE = "aifocus_session";
export const STATE_COOKIE = "aifocus_oauth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const STATE_TTL_MS = 10 * 60 * 1000;

const enc = new TextEncoder();

export function base64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function sha256Hex(text) {
  return [...(await sha256(text))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pkcePair() {
  const verifier = randomToken(32);
  const challenge = base64url(await sha256(verifier));
  return { verifier, challenge };
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const cookie = (name, value, maxAgeSeconds) =>
  `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;

export const sessionCookie = (token) => cookie(SESSION_COOKIE, token, SESSION_TTL_MS / 1000);
export const clearSessionCookie = () => cookie(SESSION_COOKIE, "", 0);
export const stateCookie = (state) => cookie(STATE_COOKIE, state, STATE_TTL_MS / 1000);
export const clearStateCookie = () => cookie(STATE_COOKIE, "", 0);

// Only same-site paths are allowed as return targets, so the sign-in flow
// cannot be used as an open redirect.
export function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  try {
    const url = new URL(value, "https://aifoc.us");
    if (url.origin !== "https://aifoc.us") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || null,
    profileUrl: row.profile_url || null,
  };
}

// Returns the signed-in user row, or null. Blocked and expired sessions count
// as signed out.
export async function getSessionUser(request, db, now = Date.now()) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!db || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await db
    .prepare(
      `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'`,
    )
    .bind(await sha256Hex(token), now)
    .first();
  return row ?? null;
}

export async function createSession(db, userId, now = Date.now()) {
  const token = randomToken(32);
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  // Opportunistic cleanup keeps the table small without a scheduled job.
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  return token;
}

export async function destroySession(request, db) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!db || !token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

// Link an external identity to an account, creating the account on first
// sign-in. `profile` is { provider, providerId, handle, name, avatarUrl,
// profileUrl } from a provider module. Returns the user row.
export async function upsertIdentity(db, profile, now = Date.now()) {
  const existing = await db
    .prepare("SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?")
    .bind(profile.provider, profile.providerId)
    .first();
  const display = profile.name || profile.handle;
  let userId = existing?.user_id;
  if (userId) {
    await db
      .prepare(
        `UPDATE identities SET handle = ?, name = ?, avatar_url = ?, profile_url = ?, updated_at = ?
         WHERE provider = ? AND provider_id = ?`,
      )
      .bind(profile.handle, profile.name || null, profile.avatarUrl || null, profile.profileUrl || null, now,
        profile.provider, profile.providerId)
      .run();
    // Keep the account's display fields in step with its identity while the
    // account has only one; once several are linked, the account's own values
    // stand.
    await db
      .prepare(
        `UPDATE users SET display_name = ?, avatar_url = ?, profile_url = ?, updated_at = ?
         WHERE id = ? AND (SELECT COUNT(*) FROM identities WHERE user_id = ?) = 1`,
      )
      .bind(display, profile.avatarUrl || null, profile.profileUrl || null, now, userId, userId)
      .run();
  } else {
    userId = randomToken(16);
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, display_name, avatar_url, profile_url, trusted, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 'active', ?, ?)`,
        )
        .bind(userId, display, profile.avatarUrl || null, profile.profileUrl || null, now, now),
      db
        .prepare(
          `INSERT INTO identities (provider, provider_id, user_id, handle, name, avatar_url, profile_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(profile.provider, profile.providerId, userId, profile.handle, profile.name || null,
          profile.avatarUrl || null, profile.profileUrl || null, now, now),
    ]);
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
}

// Add another sign-in method to an existing account. Returns the account row,
// or { conflict: true } when the identity already belongs to a different
// account (merging two accounts is not supported).
export async function linkIdentity(db, userId, profile, now = Date.now()) {
  const existing = await db
    .prepare("SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?")
    .bind(profile.provider, profile.providerId)
    .first();
  if (existing && existing.user_id !== userId) return { conflict: true };
  if (existing) {
    await db
      .prepare(
        `UPDATE identities SET handle = ?, name = ?, avatar_url = ?, profile_url = ?, updated_at = ?
         WHERE provider = ? AND provider_id = ?`,
      )
      .bind(profile.handle, profile.name || null, profile.avatarUrl || null, profile.profileUrl || null, now,
        profile.provider, profile.providerId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO identities (provider, provider_id, user_id, handle, name, avatar_url, profile_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(profile.provider, profile.providerId, userId, profile.handle, profile.name || null,
        profile.avatarUrl || null, profile.profileUrl || null, now, now)
      .run();
    // An account without an avatar takes the first one a linked identity has.
    await db
      .prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ? AND avatar_url IS NULL")
      .bind(profile.avatarUrl || null, now, userId)
      .run();
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
}

export async function listIdentities(db, userId) {
  const { results = [] } = await db
    .prepare("SELECT provider, handle, profile_url FROM identities WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all();
  return results.map((r) => ({ provider: r.provider, handle: r.handle, profileUrl: r.profile_url || null }));
}

// `state` may be chosen by the caller when it must be sent to the provider
// before the row can be written (Bluesky's pushed authorization request).
export async function saveOAuthState(
  db,
  { state = randomToken(24), provider, verifier, returnTo, data = null, linkUserId = null },
  now = Date.now(),
) {
  await db
    .prepare(
      `INSERT INTO oauth_states (state, provider, verifier, return_to, data, link_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(state, provider, verifier, returnTo, data === null ? null : JSON.stringify(data), linkUserId, now)
    .run();
  await db.prepare("DELETE FROM oauth_states WHERE created_at <= ?").bind(now - STATE_TTL_MS).run();
  return state;
}

// Consume a state value: it must exist, belong to `provider`, be fresh, and
// match the state cookie set in this browser. The row is deleted either way.
export async function takeOAuthState(db, request, provider, state, now = Date.now()) {
  if (!state || !/^[A-Za-z0-9_-]{32}$/.test(state)) return null;
  const row = await db.prepare("SELECT * FROM oauth_states WHERE state = ?").bind(state).first();
  if (!row) return null;
  await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  if (row.provider !== provider || now - row.created_at > STATE_TTL_MS) return null;
  if (readCookie(request, STATE_COOKIE) !== state) return null;
  return { ...row, data: row.data ? JSON.parse(row.data) : null };
}

// Add a query parameter to a same-site path, keeping any fragment.
export function withParam(path, key, value) {
  const url = new URL(path, "https://aifoc.us");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}
