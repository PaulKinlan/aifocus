// POST /api/auth/logout
//
// Ends the current session and clears its cookie.

import { clearSessionCookie, destroySession } from "../../_lib/auth.js";
import { isSameOrigin, json } from "../../_lib/reader.js";

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  await destroySession(request, env?.READER_DB);
  return json({ user: null }, 200, { "Set-Cookie": clearSessionCookie() });
}
