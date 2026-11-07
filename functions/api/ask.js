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

// This endpoint spends money per question, so the limiter must NEVER answer
// "allowed" when it cannot run: a missing READER_DB binding or a failed
// query THROWS, and the caller maps that to 503 before any inference runs
// (aifocus-5ft). A local/dev run that wants the endpoint without D1 sets
// ALLOW_UNMETERED_ASK=1 explicitly in the environment AND must run on a
// loopback origin (localhost, *.localhost, 127.0.0.1, [::1]) - the flag alone
// is never enough, and on production, previews or any other deployment it is
// ignored (aifocus-e7e review finding: a deployment guard, not an assertion;
// aifocus-4hu1: loopback-only, so a preview with the flag fails closed).
async function reserveAskSlot(db, ipHash, now) {
  if (!db) throw new Error("READER_DB unavailable for ask rate limiting");
  // One atomic batch: reserve only if under the per-IP budget, and prune
  // spent slots older than the lookback window. The conditional INSERT is
  // the limiter itself (reserveAuthStartSlot/reserveWriteEvent pattern): a
  // concurrent burst of DISTINCT questions cannot all read the same
  // pre-insert count and slip through the check-then-act gap.
  const results = await db.batch([
    db.prepare(
      `INSERT INTO ask_log (ip_hash, created_at)
       SELECT ?1, ?2
       WHERE (SELECT COUNT(*) FROM ask_log WHERE ip_hash = ?1 AND created_at > ?3) < ?4`,
    ).bind(ipHash, now, now - 60 * 60 * 1000, ASKS_PER_HOUR),
    db.prepare("DELETE FROM ask_log WHERE created_at <= ?").bind(now - 2 * 60 * 60 * 1000),
  ]);
  return (results[0]?.meta?.changes ?? results[0]?.changes ?? 0) > 0;
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
  // The hatch exists for local dev (wrangler serves localhost/127.0.0.1), not
  // for "any origin that is not production": pages previews and staging
  // inherit production vars by default, so "not production" made every public
  // preview URL with a retained flag an unmetered billed endpoint
  // (aifocus-4hu1). Gate on loopback hostnames; anywhere else fails closed.
  const devHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost");
  const devEscape =
    !db &&
    ["1", "true", "yes"].includes(String(env?.ALLOW_UNMETERED_ASK ?? "").toLowerCase()) &&
    devHost;

  // Fail closed before the billed call: a missing binding or a limiter error
  // is a deployment problem, answered 503 with a short cache, not an
  // unmetered inference path (aifocus-5ft; mirrors /api/search). hashIp is
  // inside the guard too: a binding that cannot serve the salt lookup cannot
  // serve the limiter either. The ALLOW_UNMETERED_ASK escape hatch needs the
  // explicit flag AND a loopback origin; on production, previews and any
  // other deployment it is IGNORED and logged loudly (aifocus-e7e, aifocus-4hu1).
  if (devEscape) {
    console.error("ask: running WITHOUT its rate limiter (READER_DB missing, ALLOW_UNMETERED_ASK on loopback origin) - billed inference, dev only");
  } else {
    try {
      // A missing client IP shares one coarse bucket rather than escaping
      // the limit; ask_log.ip_hash is NOT NULL, so the bucket is a sentinel.
      const ipHash = (db ? await hashIp(db, request.headers.get("CF-Connecting-IP")) : null) ?? UNKNOWN_IP_BUCKET;
      // reserveAskSlot throws when db is missing (the deployment error is a
      // 503 below) - so the billed call is unreachable without a binding,
      // except through the explicit loopback-only escape hatch above.
      if (!(await reserveAskSlot(db, ipHash, now))) {
        return json({ error: "You have asked a lot of questions in the last hour. Try again later." }, 429, {
          "Cache-Control": "no-store",
        });
      }
    } catch (err) {
      console.error("ask denied: rate limiter unavailable (READER_DB binding missing or error)", err?.message || err);
      return json({ error: "Ask is temporarily unavailable" }, 503, {
        "Cache-Control": "max-age=30",
      });
    }
  }

  let body;
  try {
    const [articles, result] = await Promise.all([
      loadArticles(env, url.origin),
      askArchive(env, question, SYSTEM_PROMPT, CHUNK_COUNT),
    ]);
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
