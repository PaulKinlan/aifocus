// GET /api/auth/me
//
// The signed-in account (or null), the sign-in methods linked to it, and the
// sign-in providers this deployment offers. Used by the reader UI to choose between the comment form and the
// sign-in buttons.

import { getSessionUser, listIdentities, publicUser } from "../../_lib/auth.js";
import { configuredProviders } from "../../_lib/providers/index.js";
import { json, hashIp, reserveReadEvent } from "../../_lib/reader.js";

export async function onRequestGet({ request, env }) {
  const db = env?.READER_DB;
  // getSessionUser and listIdentities spend D1 per request, so reserve the
  // shared read budget first - the same reservation /api/reader/state makes
  // (aifocus-0cz), extended to the authenticated read endpoints
  // (aifocus-pr7b). With no binding no D1 work happens, so there is nothing
  // to meter and the providers list still answers.
  if (db) {
    let ipHash = null;
    try {
      ipHash = await hashIp(db, request.headers.get("CF-Connecting-IP"));
    } catch (err) {
      console.error("auth me: ip hash failed, using the shared bucket", err?.message || err);
    }
    const budget = await reserveReadEvent(db, ipHash);
    if (budget === "limited") {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }
    if (budget === "error") {
      return json({ error: "Sign-in state is unavailable. Please try again later." }, 503);
    }
  }
  const user = await getSessionUser(request, db);
  return json({
    user: publicUser(user),
    identities: user ? await listIdentities(db, user.id) : [],
    providers: configuredProviders(env),
  });
}
