// GET /api/auth/start/<provider>?return=/slug/[&handle=you.bsky.social]
//
// Starts an OAuth sign-in: stores the state and PKCE verifier, sets the state
// cookie, and redirects to the provider. A reader who is already signed in is
// linking another sign-in method to their account. Errors send the reader back to the
// page they came from with ?signin=<reason>.

import {
  getSessionUser,
  pkcePair,
  randomToken,
  redirect,
  safeReturnTo,
  saveOAuthState,
  stateCookie,
  withParam,
} from "../../../_lib/auth.js";
import { hashIp, UNKNOWN_IP_BUCKET } from "../../../_lib/reader.js";
import { getProvider } from "../../../_lib/providers/index.js";
import { normalizeHandle } from "../../../_lib/providers/bluesky.js";

const AUTH_STARTS_PER_HOUR = 30;

// Prunes records older than the 1-hour window, then conditionally inserts
// this request's row: changes > 0 means the caller still had budget (same
// pattern as search.js). Bounds the outbound discovery fan-out an
// unauthenticated client can drive through the bluesky start flow.
export async function reserveAuthStartSlot(db, ipHash, now) {
  if (!db) throw new Error("READER_DB unavailable for auth start rate limiting");
  const windowStart = now - 60 * 60 * 1000;
  const batchRes = await db.batch([
    db.prepare("DELETE FROM auth_start_log WHERE created_at <= ?").bind(windowStart),
    db.prepare(
      `INSERT INTO auth_start_log (ip_hash, created_at)
       SELECT ?1, ?2
       WHERE (SELECT COUNT(*) FROM auth_start_log WHERE ip_hash = ?1 AND created_at > ?3) < ?4`,
    ).bind(ipHash, now, windowStart, AUTH_STARTS_PER_HOUR),
  ]);
  const changes = batchRes[1]?.meta?.changes ?? batchRes[1]?.changes ?? 0;
  return changes > 0;
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return"));
  const provider = getProvider(params.provider);
  const db = env?.READER_DB;
  if (!provider || !provider.isConfigured(env) || !db) {
    return redirect(withParam(returnTo, "signin", "unavailable"));
  }

  const { verifier, challenge } = await pkcePair();
  const state = randomToken(24);
  // Unauthenticated endpoint: bound the discovery fan-out one client can
  // drive before any outbound fetch happens.
  const ipHash = (await hashIp(db, request.headers.get("CF-Connecting-IP"))) ?? UNKNOWN_IP_BUCKET;
  if (!(await reserveAuthStartSlot(db, ipHash, Date.now()))) {
    return redirect(withParam(returnTo, "signin", "ratelimited"));
  }
  try {
    let location;
    let data = null;
    if (provider.begin) {
      // Bluesky: discovery and a pushed authorization request happen first,
      // and the state row carries the data the callback needs.
      const rawHandle = url.searchParams.get("handle");
      const handle = rawHandle ? normalizeHandle(rawHandle) : null;
      if (rawHandle && rawHandle.trim() && !handle) return redirect(withParam(returnTo, "signin", "bad-handle"));
      ({ url: location, data } = await provider.begin({ origin: url.origin, handle, state, challenge }));
    } else {
      const redirectUri = `${url.origin}/api/auth/callback/${provider.id}`;
      location = provider.authorizeUrl({ env, redirectUri, state, challenge });
    }
    const current = await getSessionUser(request, db);
    await saveOAuthState(db, { state, provider: provider.id, verifier, returnTo, data, linkUserId: current?.id ?? null });
    return redirect(location, [stateCookie(state)]);
  } catch (err) {
    console.error(`auth start ${provider.id} failed`, err?.message ?? err);
    return redirect(withParam(returnTo, "signin", "failed"));
  }
}
