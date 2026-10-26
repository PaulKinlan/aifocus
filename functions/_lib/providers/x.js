// Sign in with X: OAuth 2.0 authorization-code flow with PKCE, as a
// confidential client.
// https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
//
// Requires X_CLIENT_ID (a var) and X_CLIENT_SECRET (a Pages secret), from an
// app in the X developer portal with OAuth 2.0 turned on. Scopes are the
// minimum that GET /2/users/me accepts.

export const id = "x";
export const label = "X";

export const isConfigured = (env) => Boolean(env?.X_CLIENT_ID && env?.X_CLIENT_SECRET);

export function authorizeUrl({ env, redirectUri, state, challenge }) {
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "users.read tweet.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return url.toString();
}

export async function complete({ env, params, redirectUri, verifier, fetchImpl = fetch }) {
  const code = params.get("code");
  if (!code) throw new Error("x: missing code");
  const tokenRes = await fetchImpl("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new Error(`x: token exchange failed (${token.error || tokenRes.status})`);

  const userRes = await fetchImpl("https://api.x.com/2/users/me?user.fields=profile_image_url,name,username", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) throw new Error(`x: /2/users/me HTTP ${userRes.status}`);
  const body = await userRes.json();
  const user = body?.data;
  if (!user?.id || !user?.username) throw new Error("x: unexpected /2/users/me body");
  return {
    provider: id,
    providerId: String(user.id),
    handle: user.username,
    name: user.name || null,
    // The default image is 48px; the _400x400 variant is the same picture at a
    // usable size.
    avatarUrl: user.profile_image_url ? user.profile_image_url.replace("_normal.", "_400x400.") : null,
    profileUrl: `https://x.com/${user.username}`,
  };
}
