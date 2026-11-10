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

import { applySecurityHeaders } from "./headers.js";

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

export function base64urlDecode(s) {
  if (typeof s !== "string") throw new TypeError("base64urlDecode expects a string");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
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
    // Dot segments can normalize to a path starting with "//", which a
    // browser would read as another host.
    if (url.origin !== "https://aifoc.us" || url.pathname.startsWith("//")) return "/";
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
    avatarUrl: safeAvatarUrl(row.avatar_url),
    profileUrl: safeProfileUrl(row.profile_url),
  };
}

// Only an absolute https URL may be stored as a profile URL, and only such a URL
// may be returned to a page that renders it as a link (aifocus-d7jb). The client
// half is assets/js/safe-href.js - the same rule at the sink - because the admin
// API reads these columns directly; this half keeps a bad value out of D1 and
// out of the reader-facing payloads in the first place.
export function safeProfileUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

// The avatar half of the same rule (aifocus-r044): an avatar URL reaches an <img
// src>, so it must be an absolute https URL **on a host whose avatars the
// providers actually mint** - GitHub, X and Bluesky today. The client half is
// safeImgSrc() in assets/js/safe-href.js, the same host table at the sink; this
// half keeps a bad value out of D1 and out of the reader-facing payload, because
// the admin API reads these columns directly and a row stored by an older build
// reaches the reader page without going through the sign-in path again.
//
// A bad avatar URL is a quieter problem than a bad profile link - nobody clicks
// it - but an <img src> makes the reader's browser issue a request the reader
// never asked for, to a host nobody chose, and `img-src` is deliberately wide so
// post images work (accepted risk, aifocus-8f3j). Rejecting the value renders a
// name with no avatar instead.
const AVATAR_HOSTS = new Set(["avatars.githubusercontent.com", "pbs.twimg.com", "cdn.bsky.app"]);

export function safeAvatarUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return AVATAR_HOSTS.has(url.hostname.toLowerCase()) ? url.href : null;
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
  const profileUrl = safeProfileUrl(profile.profileUrl);
  const avatarUrl = safeAvatarUrl(profile.avatarUrl);
  let userId = existing?.user_id;
  if (userId) {
    await db
      .prepare(
        `UPDATE identities SET handle = ?, name = ?, avatar_url = ?, profile_url = ?, updated_at = ?
         WHERE provider = ? AND provider_id = ?`,
      )
      .bind(profile.handle, profile.name || null, avatarUrl, profileUrl, now,
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
      .bind(display, avatarUrl, profileUrl, now, userId, userId)
      .run();
  } else {
    userId = randomToken(16);
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, display_name, avatar_url, profile_url, trusted, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 'active', ?, ?)`,
        )
        .bind(userId, display, avatarUrl, profileUrl, now, now),
      db
        .prepare(
          `INSERT INTO identities (provider, provider_id, user_id, handle, name, avatar_url, profile_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(profile.provider, profile.providerId, userId, profile.handle, profile.name || null,
          avatarUrl, profileUrl, now, now),
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
  const profileUrl = safeProfileUrl(profile.profileUrl);
  const avatarUrl = safeAvatarUrl(profile.avatarUrl);
  if (existing) {
    await db
      .prepare(
        `UPDATE identities SET handle = ?, name = ?, avatar_url = ?, profile_url = ?, updated_at = ?
         WHERE provider = ? AND provider_id = ?`,
      )
      .bind(profile.handle, profile.name || null, avatarUrl, profileUrl, now,
        profile.provider, profile.providerId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO identities (provider, provider_id, user_id, handle, name, avatar_url, profile_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(profile.provider, profile.providerId, userId, profile.handle, profile.name || null,
        avatarUrl, profileUrl, now, now)
      .run();
    // An account without an avatar takes the first one a linked identity has.
    await db
      .prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ? AND avatar_url IS NULL")
      .bind(avatarUrl, now, userId)
      .run();
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
}

export async function listIdentities(db, userId) {
  const { results = [] } = await db
    .prepare("SELECT provider, handle, profile_url FROM identities WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all();
  return results.map((r) => ({ provider: r.provider, handle: r.handle, profileUrl: safeProfileUrl(r.profile_url) }));
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
  // DELETE ... RETURNING consumes the row in one statement, so two
  // concurrent callbacks cannot both read it.
  const row = await db.prepare("DELETE FROM oauth_states WHERE state = ? RETURNING *").bind(state).first();
  if (!row) return null;
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

// --- OAuth failure logging -------------------------------------------------
//
// These logs are built, never reflected. Two rules keep them credential-free:
//
// 1. Provider text never enters an error message. The token-endpoint JSON
//    `error` field is classified against a fixed code list (RFC 6749 §5.2 plus
//    the OIDC, device-flow and DPoP-nonce codes the providers here document);
//    anything else logs the HTTP status instead. Keyed redaction cannot be the
//    boundary: a bare, unkeyed credential ("invalid_grant gho_…") matches no
//    key=value pattern, so classification is the boundary and redaction is the
//    backstop (aifocus-fgn7).
// 2. Whatever still reaches a log goes through providerErrorSummary: keyed
//    secrets in every shape provider text takes (key=value, "key = value",
//    "key: value", JSON, quoted values — aifocus-3s9), query strings,
//    Authorization header shapes and control characters are removed; the result
//    is one line, length-capped, and the error `name` is sanitized BEFORE it
//    is prepended, because a custom name is attacker-influenced text like any
//    other provider-supplied string. A SyntaxError message quotes its input,
//    so the summary keeps only the class (aifocus-8qky); parse failures at the
//    throw sites are classified like any other provider error.
const OAUTH_ERROR_CODES = new Set([
  // RFC 6749 §5.2 (token endpoint) and §4.1.2.1 (authorization endpoint).
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  // OpenID Connect Core §3.1.2.6 / §4.1.2.1.
  "interaction_required",
  "login_required",
  "account_selection_required",
  "consent_required",
  "request_not_supported",
  "request_uri_not_supported",
  "registration_not_supported",
  // RFC 8628 (device flow) and the Bluesky DPoP nonce retry.
  "authorization_pending",
  "slow_down",
  "use_dpop_nonce",
]);

// Return a fixed classification for a provider error body: a whitelisted OAuth
// error code when the provider sent one, otherwise the HTTP status. Arbitrary
// provider text is never part of the result.
export function classifyOAuthError(body, status) {
  const code = typeof body?.error === "string" && OAUTH_ERROR_CODES.has(body.error) ? body.error : null;
  return code ?? `HTTP ${status}`;
}

const LOG_SUMMARY_MAX = 160;
const LOG_REDACTIONS = [
  // Query strings and fragments carry codes, state and tokens.
  [/[?#][^\s"'<>]*/g, " ?[redacted]"],
  // The same names can appear outside a URL, in every shape provider text
  // takes: key=value, "key = value", JSON '"key":"value"' and quoted values.
  // Optional quotes after the key, optional whitespace either side of : or =,
  // optional quote around the value, optional closing quote consumed.
  [
    /\b(code|state|access_token|refresh_token|id_token|client_secret|nonce|request_uri|password|error_description)["']?\s*[:=]\s*["']?[^\s&"'<>]+["']?/gi,
    "$1=[redacted]",
  ],
  // Authorization header shapes that reach us through an error message.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=:-]+/gi, "$1 [redacted]"],
  // Control characters, including the newlines that would forge a log line.
  [/[\u0000-\u001f\u007f]+/g, " "],
];

export function providerErrorSummary(err) {
  const name = String(err?.name ?? "").replace(/[^A-Za-z0-9_$-]/g, "").slice(0, 32);
  // A SyntaxError message quotes the offending input - arbitrary body text
  // that keyed redaction cannot clean. Throw sites classify parse failures
  // themselves (aifocus-8qky); this is the backstop for any that do not.
  if (name === "SyntaxError") return "SyntaxError: [message redacted]";
  const raw = typeof err?.message === "string" ? err.message : String(err ?? "");
  let text = raw;
  for (const [pattern, replacement] of LOG_REDACTIONS) text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > LOG_SUMMARY_MAX) text = `${text.slice(0, LOG_SUMMARY_MAX)}…`;
  return name && name !== "Error" ? `${name}: ${text}` : text;
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  // Function responses get no static/_headers treatment at the edge, so the
  // baseline security set is applied in code (aifocus-w9gv).
  return applySecurityHeaders(new Response(null, { status: 302, headers }));
}
