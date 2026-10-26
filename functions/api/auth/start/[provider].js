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
import { getProvider } from "../../../_lib/providers/index.js";
import { normalizeHandle } from "../../../_lib/providers/bluesky.js";

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
