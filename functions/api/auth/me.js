// GET /api/auth/me
//
// The signed-in account (or null), the sign-in methods linked to it, and the
// sign-in providers this deployment offers. Used by the reader UI to choose between the comment form and the
// sign-in buttons.

import { getSessionUser, listIdentities, publicUser } from "../../_lib/auth.js";
import { configuredProviders } from "../../_lib/providers/index.js";
import { json } from "../../_lib/reader.js";

export async function onRequestGet({ request, env }) {
  const db = env?.READER_DB;
  const user = await getSessionUser(request, db);
  return json({
    user: publicUser(user),
    identities: user ? await listIdentities(db, user.id) : [],
    providers: configuredProviders(env),
  });
}
