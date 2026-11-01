// POST /api/ask  { question }
//
// "Ask the archive": retrieves passages from the `aifocus-search` index and
// has the instance's generation model answer from them. The response lists
// the essays the passages came from so readers can check the answer against
// the source. The answer is model output and can be wrong; the page says so.
//
// Costs inference per question, so it is limited per client IP (stored as a
// salted hash in D1) and identical questions are served from cache.

import { askArchive } from "../_lib/ai-search.js";
import { json, isSameOrigin, hashIp, UNKNOWN_IP_BUCKET } from "../_lib/reader.js";
import { normalizeQuery, indexByPath, rankArticles, loadArticles } from "./search.js";

const ASKS_PER_HOUR = 20;
const CHUNK_COUNT = 8;
const MAX_SOURCES = 5;
const CACHE_SECONDS = 60 * 60;

export const SYSTEM_PROMPT = [
  "You answer questions about essays published on aifoc.us by Paul Kinlan.",
  "Use only the retrieved excerpts provided as context.",
  "If the excerpts do not answer the question, say that the essays on the site do not cover it.",
  "Answer in plain text, in at most three short paragraphs.",
  "Do not include URLs; the page lists the source essays separately.",
].join(" ");

async function isRateLimited(db, ipHash, now) {
  if (!db) return false;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM ask_log WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, now - 60 * 60 * 1000)
    .first();
  return (row?.n ?? 0) >= ASKS_PER_HOUR;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const question = normalizeQuery(input?.question);
  if (question.length < 3) return json({ error: "Ask a question first" }, 400);

  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/api/ask?q=${encodeURIComponent(question.toLowerCase())}`);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.json();
      return json({ ...body, cached: true });
    }
  }

  const db = env?.READER_DB;
  const now = Date.now();
  // A missing client IP shares one coarse bucket rather than escaping the
  // limit; ask_log.ip_hash is NOT NULL, so the bucket is a sentinel value.
  const ipHash = db
    ? (await hashIp(db, request.headers.get("CF-Connecting-IP"))) ?? UNKNOWN_IP_BUCKET
    : null;
  if (await isRateLimited(db, ipHash, now)) {
    return json({ error: "You have asked a lot of questions in the last hour. Try again later." }, 429);
  }

  let body;
  try {
    const [articles, result] = await Promise.all([
      loadArticles(env, url.origin),
      askArchive(env, question, SYSTEM_PROMPT, CHUNK_COUNT),
    ]);
    if (db) {
      await db.prepare("INSERT INTO ask_log (ip_hash, created_at) VALUES (?, ?)").bind(ipHash, now).run();
    }
    const sources = rankArticles(result.chunks, indexByPath(articles), MAX_SOURCES).map(
      ({ title, url: href, date, snippet }) => ({ title, url: href, date, snippet }),
    );
    body = { question, answer: result.answer.trim(), sources };
  } catch (err) {
    console.error("ask failed", err);
    return json({ error: "Answering is unavailable right now" }, 503);
  }

  if (!body.answer) {
    return json({ error: "No answer was generated", sources: body.sources }, 502);
  }
  if (cache) {
    context.waitUntil?.(
      cache.put(cacheKey, new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
      })),
    );
  }
  return json(body);
}
