// Shared helpers for reader features: reactions, highlights, notes and
// comments, stored in the `aifocus-reader` D1 database (env.READER_DB).
//
// Readers are anonymous. On their first write a random id is set in an
// HttpOnly cookie; that id is what lets a reader see their own pending notes
// and comments, which nobody else sees until they are approved.

export const READER_COOKIE = "aifocus_reader";
const READER_ID_RE = /^[0-9a-f]{32}$/;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

export const REACTION_KINDS = ["useful", "new-to-me", "not-convinced"];
export const ANNOTATION_TYPES = ["highlight", "note", "comment"];
export const MODERATION_STATUSES = ["pending", "approved", "rejected", "spam"];

export const LIMITS = {
  quote: 1000,
  context: 64,
  body: 2000,
  name: 60,
  // Writes allowed per reader (best effort, live rows) and per client IP
  // (write EVENTS in the append-only write_events ledger, so on/off toggles
  // and deletes cannot erase the count) in a rolling hour. A request with no
  // client IP (no CF-Connecting-IP header) shares one bucket, so a missing
  // IP never means "no limit".
  writesPerHour: 30,
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// Returns { id, isNew }. A missing or malformed cookie gets a fresh id; the
// caller sets it with readerCookieHeader() when it writes on the reader's behalf.
export function getReader(request) {
  const existing = readCookie(request, READER_COOKIE);
  if (existing && READER_ID_RE.test(existing)) return { id: existing, isNew: false };
  return { id: randomId(), isNew: true };
}

export function readerCookieHeader(id) {
  return `${READER_COOKIE}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

// Writes must come from a page on this site. Browsers send Origin on POST and
// DELETE; a missing or foreign Origin is refused.
export function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

// Normalize a post reference ("/slug/", "https://aifoc.us/slug/", "/slug")
// to "/slug/". Returns null for anything that is not a single path.
export function normalizePostPath(value) {
  if (typeof value !== "string" || !value || value.length > 300) return null;
  let path;
  try {
    path = new URL(value, "https://aifoc.us").pathname;
  } catch {
    return null;
  }
  if (!/^\/[a-z0-9][a-z0-9/-]*$/i.test(path) || path.includes("//")) return null;
  return path.endsWith("/") ? path : `${path}/`;
}

export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ""))
    .filter((ch) => !/^[\ud800-\udfff]$/.test(ch))
    .slice(0, max)
    .join("")
    .trim();
}

// Loose comparison text: lowercase letters and digits only. Rendered DOM text
// and server-side stripped HTML differ in whitespace, entities and quotes;
// this keeps a real quote matching while still rejecting invented text.
export function looseText(value) {
  return (value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
};

export function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (_, n) => ENTITIES[n.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch the built post and return the text of its article body, or null when
// the path is not a published essay.
export async function loadPostText(env, origin, post) {
  const fetcher = env?.ASSETS;
  if (!fetcher) return null;
  const index = await fetcher.fetch(new Request(new URL("/index.json", origin)));
  if (!index.ok) return null;
  const { articles = [] } = await index.json();
  const known = articles.some((a) => normalizePostPath(a.url) === post);
  if (!known) return null;
  const page = await fetcher.fetch(new Request(new URL(post, origin)));
  if (!page.ok) return null;
  const html = await page.text();
  const start = html.search(/<div[^>]*class=["']?e-content/i);
  const body = start >= 0 ? html.slice(start) : html;
  const end = body.search(/<\/article>/i);
  return htmlToText(end >= 0 ? body.slice(0, end) : body);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Client IPs are only used for rate limiting and are stored as a salted hash.
// The salt is generated once and kept in the settings table.
export async function hashIp(db, ip) {
  if (!ip) return null;
  let row = await db.prepare("SELECT value FROM settings WHERE key = 'ip_salt'").first();
  if (!row) {
    await db
      .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('ip_salt', ?)")
      .bind(randomId() + randomId())
      .run();
    row = await db.prepare("SELECT value FROM settings WHERE key = 'ip_salt'").first();
  }
  return sha256Hex(`${row.value}:${ip}`);
}

// Bucket key for writes with no client IP (no CF-Connecting-IP header, e.g.
// local dev): every reader write endpoint (reactions, annotations, ask)
// folds a missing IP into this one constant bucket, so a missing IP can
// never mean "no limit" and no NULL-keyed row is ever written.
export const UNKNOWN_IP_BUCKET = "unknown";

export async function isRateLimited(db, reader, ipHash, now = Date.now()) {
  const since = now - 60 * 60 * 1000;
  // A missing client IP never means "no limit": every such request shares the
  // one coarse UNKNOWN_IP_BUCKET key.
  const key = ipHash ?? UNKNOWN_IP_BUCKET;
  try {
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM annotations WHERE reader = ?1 AND created_at > ?3) +
           (SELECT COUNT(*) FROM reactions WHERE reader = ?1 AND created_at > ?3) AS by_reader,
           (SELECT COUNT(*) FROM write_events WHERE ip_hash = ?2 AND created_at > ?3) AS by_ip`,
      )
      .bind(reader, key, since)
      .first();
    return (row?.by_reader ?? 0) >= LIMITS.writesPerHour || (row?.by_ip ?? 0) >= LIMITS.writesPerHour;
  } catch (err) {
    if (/no such table|no such column|has no column named/i.test(err?.message ?? "")) {
      // Migrations 0005/0006 not applied yet (functions deployed before the
      // D1 migrations): fail closed and say exactly why. There is no
      // append-only counter to count in this state, and any live-row fallback
      // is either erasable by the toggle flood it exists to stop or strict
      // enough to lock ordinary traffic out site-wide - so the write path is
      // uniformly, visibly OFF until the migration runs (one command).
      console.error("reader writes denied: apply D1 migrations 0005+0006 (write_events/reactions.ip_hash missing)");
      return true;
    }
    // Any other database error: fail closed. Silently answering with the
    // per-reader count would switch the security control off while the
    // endpoint keeps working - the same class of bug as the original bypass.
    console.error("rate-limit fail-closed: isRateLimited query failed", err);
    return true;
  }
}

// Append one write event to the per-IP ledger. The limiter counts these
// rows, so deleting the underlying reaction/annotation cannot erase the
// count the way it could when live rows were counted. Skips ONLY for the
// known missing-table case (pre-migration window, where the degraded global
// cap applies); anything else propagates.
export async function recordWriteEvent(db, ipHash, now = Date.now()) {
  const key = ipHash ?? UNKNOWN_IP_BUCKET;
  try {
    await db.prepare("INSERT INTO write_events (ip_hash, created_at) VALUES (?, ?)").bind(key, now).run();
  } catch (err) {
    if (/no such table/i.test(err?.message ?? "")) {
      console.error("write-event ledger missing; apply D1 migration 0006");
      return;
    }
    throw err;
  }
}

// Screen free text with a Workers AI safety model. The result is advisory: it
// is shown in the moderation queue, and every note and comment still waits for
// approval. Returns "safe", "unsafe:<categories>" or "error".
export async function screenText(env, text) {
  if (!env?.AI || typeof env.AI.run !== "function") return "error";
  try {
    const out = await env.AI.run("@cf/meta/llama-guard-3-8b", {
      messages: [{ role: "user", content: text }],
    });
    const verdict = out?.response ?? out;
    if (verdict?.safe === true) return "safe";
    if (verdict?.safe === false) {
      const cats = Array.isArray(verdict.categories) ? verdict.categories.join(",") : "";
      return `unsafe:${cats}`.slice(0, 120);
    }
    return "error";
  } catch {
    return "error";
  }
}

// Shape a row for the browser. `mine` rows include their moderation status so
// the reader can see that a note is awaiting approval.
export function publicAnnotation(row, { mine = false } = {}) {
  const out = {
    id: row.id,
    type: row.type,
    quote: row.quote_exact
      ? { exact: row.quote_exact, prefix: row.quote_prefix || "", suffix: row.quote_suffix || "" }
      : null,
    body: row.body || null,
    name: row.user_display_name || row.author_name || null,
    avatarUrl: row.user_avatar_url || null,
    profileUrl: row.user_profile_url || null,
    createdAt: row.created_at,
  };
  if (mine) {
    out.mine = true;
    out.status = row.status;
  }
  return out;
}
