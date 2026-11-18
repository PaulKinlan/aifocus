// POST   /api/reader/annotations  { post, type, quote?: { exact, prefix, suffix }, body?, parentId? }
// DELETE /api/reader/annotations?id=<id>
//
// Highlights are quotes only and need no account. The server checks the quote
// against the post's own text, so a highlight is approved on creation.
// Notes (quote + text) and comments (text only) require a signed-in account
// (functions/_lib/auth.js) and are shown under its name and avatar. They
// start as pending and are visible only to their writer until approved in
// /admin/. Accounts the moderator has marked as trusted in /admin/ have their
// notes and comments published straight away, unless the safety screen flags
// them. Each body is screened by a Workers AI
// safety model; the verdict is shown to the moderator.
//
// A comment with a parentId is a reply. Replies nest to any depth. The parent
// must be a comment on the same post that the replier can see: it and every
// comment above it must be approved or written by the replier. Replies are
// moderated exactly like comments.
//
// Comments and replies from the site author's account (functions/_lib/
// site-author.js) are published straight away and labelled "Author".

import {
  ANNOTATION_TYPES,
  LIMITS,
  json,
  randomId,
  getReader,
  readCookie,
  READER_COOKIE,
  readerCookieHeader,
  isSameOrigin,
  normalizePostPath,
  cleanText,
  looseText,
  loadPostText,
  hashIp,
  isRateLimited,
  reserveWriteEvent,
  UNKNOWN_IP_BUCKET,
  screenText,
  publicAnnotation,
} from "../../_lib/reader.js";
import { getSessionUser } from "../../_lib/auth.js";
import { isSiteAuthor } from "../../_lib/site-author.js";
import { notifyPendingAnnotation } from "../../_lib/notify.js";

const ID_RE = /^[0-9a-f]{32}$/;

// Walk from the parent up to its top-level comment. Returns null unless every
// comment in the chain is on this post and visible to the replier.
async function visibleParent(db, parentId, post, readerId, userId) {
  const { results = [] } = await db
    .prepare(
      `WITH RECURSIVE chain (id, parent_id, post, type, status, reader, user_id) AS (
         SELECT id, parent_id, post, type, status, reader, user_id FROM annotations WHERE id = ?1
         UNION ALL
         SELECT a.id, a.parent_id, a.post, a.type, a.status, a.reader, a.user_id
         FROM annotations a JOIN chain ON a.id = chain.parent_id
       )
       SELECT * FROM chain`,
    )
    .bind(parentId)
    .all();
  if (results.length === 0) return null;
  const visible = (row) =>
    row.post === post &&
    row.type === "comment" &&
    (row.status === "approved" || row.reader === readerId || (row.user_id !== null && row.user_id === userId));
  // A missing ancestor (deleted) leaves the chain short of a top-level row.
  const top = results[results.length - 1];
  if (top.parent_id !== null && top.parent_id !== undefined) return null;
  return results.every(visible) ? results[0] : null;
}

export async function onRequestPost({ request, env, waitUntil }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const post = normalizePostPath(input?.post);
  const type = input?.type;
  if (!post || !ANNOTATION_TYPES.includes(type)) {
    return json({ error: "Invalid post or type" }, 400);
  }

  const exact = cleanText(input?.quote?.exact, LIMITS.quote);
  const prefix = cleanText(input?.quote?.prefix, LIMITS.context);
  const suffix = cleanText(input?.quote?.suffix, LIMITS.context);
  const body = cleanText(input?.body, LIMITS.body);
  const parentId = input?.parentId ?? null;
  if (parentId !== null && (type !== "comment" || typeof parentId !== "string" || !ID_RE.test(parentId))) {
    return json({ error: "Invalid reply" }, 400);
  }

  const needsQuote = type === "highlight" || type === "note";
  const needsBody = type === "note" || type === "comment";
  const user = await getSessionUser(request, db);
  if (needsBody && !user) {
    return json({ error: "Sign in to write notes and comments" }, 401);
  }
  if (needsQuote && looseText(exact).length < 3) {
    return json({ error: "Select some text from the post first" }, 400);
  }
  if (needsBody && !body) {
    return json({ error: "Write something first" }, 400);
  }

  const reader = getReader(request);
  const now = Date.now();
  // A missing client IP folds into the shared UNKNOWN_IP_BUCKET, so the
  // per-IP rate limit still applies.
  const ipHash = (await hashIp(db, request.headers.get("CF-Connecting-IP"))) ?? UNKNOWN_IP_BUCKET;
  if (await isRateLimited(db, reader.id, now)) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }

  // Reserve the per-IP slot BEFORE any slow work. Everything above this line
  // is local CPU (JSON parse, path/type/quote-length checks) or a single-row
  // read; everything below it is work an anonymous caller can make us repeat
  // - an ASSETS fetch plus parse of the whole post, and on the note and
  // comment paths a Workers AI screening call. That fetch used to run before
  // the reservation, so a burst could all pay for it and only then be counted
  // (aifocus-80p; the AI-screening await had the same shape, fixed at the
  // other end of this handler for aifocus-e2o).
  //
  // The slot is NOT refunded when the post is unknown or the quote is not in
  // the post: a refund would let the same caller pay the fetch cost, get the
  // slot back, and repeat - which is the hole this reservation exists to
  // close. A rejected attempt is a spent attempt.
  //
  // The reservation is the request's ledger row: the per-IP limiter counts
  // these, so a deleted annotation cannot erase the count.
  if (!(await reserveWriteEvent(db, ipHash, now))) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }

  const url = new URL(request.url);
  const postText = await loadPostText(env, url.origin, post);
  if (postText === null) return json({ error: "Unknown post" }, 404);
  if (needsQuote && !looseText(postText).includes(looseText(exact))) {
    return json({ error: "That passage is not in this post" }, 400);
  }

  // One highlight per passage per reader. This read sits AFTER the post and
  // quote checks on purpose: answering a duplicate before them let a repeat
  // request return a stored highlight for a post that is no longer published,
  // or for a quote that no longer matches the post, without validation
  // (aifocus-1wz). A duplicate therefore spends its slot and one post fetch -
  // the price of not letting the fast path skip the endpoint's invariants.
  if (type === "highlight") {
    const existing = await db
      .prepare(
        "SELECT * FROM annotations WHERE post = ? AND reader = ? AND type = 'highlight' AND quote_exact = ?",
      )
      .bind(post, reader.id, exact)
      .first();
    if (existing) {
      return json({ annotation: publicAnnotation(existing, { mine: true }) });
    }
  }

  if (parentId !== null && !(await visibleParent(db, parentId, post, reader.id, user.id))) {
    return json({ error: "That comment is not available to reply to" }, 404);
  }

  const screen = needsBody ? await screenText(env, [exact, body].filter(Boolean).join("\n\n")) : null;
  const author = needsBody ? await isSiteAuthor(env, db, user.id) : false;
  // The site author's own comments are published as written; the screen
  // verdict is still stored for the record.
  const autoApprove = type === "highlight" || author || (Boolean(user?.trusted) && screen === "safe");
  const row = {
    id: randomId(),
    post,
    reader: reader.id,
    type,
    quote_exact: needsQuote ? exact : null,
    quote_prefix: needsQuote ? prefix : null,
    quote_suffix: needsQuote ? suffix : null,
    body: needsBody ? body : null,
    author_name: needsBody ? user.display_name : null,
    user_id: user ? user.id : null,
    parent_id: parentId,
    status: autoApprove ? "approved" : "pending",
    screen,
    ip_hash: ipHash,
    created_at: now,
  };
  // The account can be erased while this request is in flight: getSessionUser()
  // above ran before the DELETE committed and nothing else re-checks it. The
  // insert is therefore conditional on the account row still existing, in the
  // same statement, so an erasure that lands mid-request cannot be followed by
  // a row carrying the deleted account's id, name and content (aifocus-z2j0).
  // parent_id is written only for replies, so top-level comments keep working
  // on a database where migration 0011 has not been applied yet.
  const columns = ["id", "post", "reader", "type", "quote_exact", "quote_prefix", "quote_suffix", "body",
    "author_name", "user_id", "status", "screen", "ip_hash", "created_at"];
  if (row.parent_id !== null) columns.push("parent_id");
  const insert = await db
    .prepare(
      `INSERT INTO annotations (${columns.join(", ")})
       SELECT ${columns.map((_, i) => `?${i + 1}`).join(", ")}
       WHERE ?10 IS NULL OR EXISTS (SELECT 1 FROM users WHERE id = ?10)`,
    )
    .bind(...columns.map((c) => row[c]))
    .run();
  const inserted = insert?.meta?.changes ?? insert?.changes ?? 0;
  if (inserted === 0) {
    // No row written and this was a signed-in write: the account was erased
    // between the session check and here, so the request is no longer signed
    // in. Report that instead of a phantom annotation.
    return json({ error: "Not signed in" }, 401);
  }

  // Tell the moderator a note or comment is waiting (functions/_lib/notify.js).
  // Runs after the response so a slow or failing send never delays the reader.
  if (row.status === "pending") {
    const sending = notifyPendingAnnotation(env, { row, origin: url.origin });
    if (typeof waitUntil === "function") waitUntil(sending);
    else await sending;
  }

  const headers = reader.isNew ? { "Set-Cookie": readerCookieHeader(reader.id) } : {};
  const shaped = publicAnnotation(
    { ...row, user_display_name: user?.display_name, user_avatar_url: user?.avatar_url, user_profile_url: user?.profile_url, is_site_author: author },
    { mine: true },
  );
  return json({ annotation: shaped }, 201, headers);
}

export async function onRequestDelete({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  // The writer can delete: either the browser that wrote it (reader cookie)
  // or the signed-in account it was written under.
  const reader = readCookie(request, READER_COOKIE);
  const user = await getSessionUser(request, db);
  const id = new URL(request.url).searchParams.get("id");
  if ((!reader && !user) || !id || !/^[0-9a-f]{32}$/.test(id)) {
    return json({ error: "Not found" }, 404);
  }
  const result = await db
    .prepare("DELETE FROM annotations WHERE id = ? AND (reader = ? OR (user_id IS NOT NULL AND user_id = ?))")
    .bind(id, reader ?? "", user?.id ?? "")
    .run();
  if (!result?.meta?.changes) return json({ error: "Not found" }, 404);
  return json({ deleted: id });
}
