// GET /api/auth/callback/<provider>?code=…&state=…
//
// Completes an OAuth sign-in: checks the state against the stored row and the
// state cookie, exchanges the code, links the identity to an account, and
// starts a session. When the reader was already signed in, the identity is
// linked to that account instead. The reader is sent back to the page they
// came from.

import {
  clearStateCookie,
  createSession,
  getSessionUser,
  linkIdentity,
  redirect,
  sessionCookie,
  takeOAuthState,
  upsertIdentity,
  withParam,
} from "../../../_lib/auth.js";
import { getProvider } from "../../../_lib/providers/index.js";

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const provider = getProvider(params.provider);
  const db = env?.READER_DB;
  if (!provider || !provider.isConfigured(env) || !db) {
    return redirect("/?signin=unavailable", [clearStateCookie()]);
  }

  const saved = await takeOAuthState(db, request, provider.id, url.searchParams.get("state"));
  if (!saved) return redirect("/?signin=expired", [clearStateCookie()]);
  const back = (reason) => redirect(withParam(saved.return_to, "signin", reason), [clearStateCookie()]);

  // The reader declined on the provider's page.
  if (url.searchParams.get("error")) return back("cancelled");

  try {
    const profile = await provider.complete({
      env,
      origin: url.origin,
      params: url.searchParams,
      redirectUri: `${url.origin}/api/auth/callback/${provider.id}`,
      verifier: saved.verifier,
      data: saved.data,
    });
    // Linking only applies while the same account is still signed in.
    const current = saved.link_user_id ? await getSessionUser(request, db) : null;
    let user;
    if (current && current.id === saved.link_user_id) {
      user = await linkIdentity(db, current.id, profile);
      if (user?.conflict) return back("already-linked");
    } else {
      user = await upsertIdentity(db, profile);
    }
    if (!user || user.status !== "active") return back("blocked");
    const token = await createSession(db, user.id);
    const target = new URL(saved.return_to, url.origin);
    target.hash = "reader";
    return redirect(`${target.pathname}${target.search}${target.hash}`, [clearStateCookie(), sessionCookie(token)]);
  } catch (err) {
    console.error(`auth callback ${provider.id} failed`, err?.message ?? err);
    return back("failed");
  }
}
