// Sign in with GitHub: OAuth app authorization-code flow with PKCE.
// https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
//
// Requires GITHUB_CLIENT_ID (a var) and GITHUB_CLIENT_SECRET (a Pages
// secret). No scope is requested: the default grants read access to the
// user's public profile, which is all that is used.

export const id = "github";
export const label = "GitHub";

export const isConfigured = (env) => Boolean(env?.GITHUB_CLIENT_ID && env?.GITHUB_CLIENT_SECRET);

export function authorizeUrl({ env, redirectUri, state, challenge }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    allow_signup: "true",
  });
  return url.toString();
}

export async function complete({ env, params, redirectUri, verifier, fetchImpl = fetch }) {
  const code = params.get("code");
  if (!code) throw new Error("github: missing code");
  const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new Error(`github: token exchange failed (${token.error || tokenRes.status})`);

  const userRes = await fetchImpl("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "aifoc.us",
    },
  });
  if (!userRes.ok) throw new Error(`github: /user HTTP ${userRes.status}`);
  const user = await userRes.json();
  if (!user?.id || !user?.login) throw new Error("github: unexpected /user body");
  return {
    provider: id,
    providerId: String(user.id),
    handle: user.login,
    name: user.name || null,
    avatarUrl: user.avatar_url || null,
    profileUrl: user.html_url || `https://github.com/${user.login}`,
  };
}
