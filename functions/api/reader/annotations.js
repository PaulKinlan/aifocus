// POST   /api/reader/annotations  { post, type, quote?: { exact, prefix, suffix }, body?, name? }
// DELETE /api/reader/annotations?id=<id>
//
// Highlights are quotes only. The server checks the quote against the post's
// own text, so a highlight is approved on creation. Notes (quote + text) and
// comments (text only) start as pending and are visible only to the reader
// who wrote them until they are approved in /admin/. Each body is also
// screened by a Workers AI safety model; the verdict is shown to the
// moderator but does not approve or reject anything by itself.

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
  screenText,
  publicAnnotation,
} from "../../_lib/reader.js";

export async function onRequestPost({ request, env }) {
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
  const name = cleanText(input?.name, LIMITS.name);

  const needsQuote = type === "highlight" || type === "note";
  const needsBody = type === "note" || type === "comment";
  if (needsQuote && looseText(exact).length < 3) {
    return json({ error: "Select some text from the post first" }, 400);
  }
  if (needsBody && !body) {
    return json({ error: "Write something first" }, 400);
  }

  const url = new URL(request.url);
  const postText = await loadPostText(env, url.origin, post);
  if (postText === null) return json({ error: "Unknown post" }, 404);
  if (needsQuote && !looseText(postText).includes(looseText(exact))) {
    return json({ error: "That passage is not in this post" }, 400);
  }

  const reader = getReader(request);
  const now = Date.now();
  const ipHash = await hashIp(db, request.headers.get("CF-Connecting-IP"));
  if (await isRateLimited(db, reader.id, ipHash, now)) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }

  // One highlight per passage per reader.
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

  const screen = needsBody ? await screenText(env, [exact, body, name].filter(Boolean).join("\n\n")) : null;
  const row = {
    id: randomId(),
    post,
    reader: reader.id,
    type,
    quote_exact: needsQuote ? exact : null,
    quote_prefix: needsQuote ? prefix : null,
    quote_suffix: needsQuote ? suffix : null,
    body: needsBody ? body : null,
    author_name: needsBody && name ? name : null,
    status: type === "highlight" ? "approved" : "pending",
    screen,
    ip_hash: ipHash,
    created_at: now,
  };
  await db
    .prepare(
      `INSERT INTO annotations
        (id, post, reader, type, quote_exact, quote_prefix, quote_suffix, body, author_name, status, screen, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id, row.post, row.reader, row.type, row.quote_exact, row.quote_prefix, row.quote_suffix,
      row.body, row.author_name, row.status, row.screen, row.ip_hash, row.created_at,
    )
    .run();

  const headers = reader.isNew ? { "Set-Cookie": readerCookieHeader(reader.id) } : {};
  return json({ annotation: publicAnnotation(row, { mine: true }) }, 201, headers);
}

export async function onRequestDelete({ request, env }) {
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  const reader = readCookie(request, READER_COOKIE);
  const id = new URL(request.url).searchParams.get("id");
  if (!reader || !id || !/^[0-9a-f]{32}$/.test(id)) {
    return json({ error: "Not found" }, 404);
  }
  const result = await db
    .prepare("DELETE FROM annotations WHERE id = ? AND reader = ?")
    .bind(id, reader)
    .run();
  if (!result?.meta?.changes) return json({ error: "Not found" }, 404);
  return json({ deleted: id });
}
