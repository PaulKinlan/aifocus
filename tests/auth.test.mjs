import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  safeReturnTo,
  withParam,
  base64url,
} from "../functions/_lib/auth.js";
import { onRequestGet as start } from "../functions/api/auth/start/[provider].js";
import { onRequestGet as callback } from "../functions/api/auth/callback/[provider].js";
import { onRequestGet as me } from "../functions/api/auth/me.js";
import { onRequestPost as logout } from "../functions/api/auth/logout.js";
import { onRequestGet as clientMetadataRoute } from "../functions/api/auth/client-metadata.js";
import { dpopProof, generateDpopKey, normalizeHandle } from "../functions/_lib/providers/bluesky.js";

const MIGRATIONS = ["0001_reader.sql", "0003_auth.sql"].map((f) =>
  fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)),
);
const ORIGIN = "https://aifoc.us";

const makeEnv = (extra = {}) => ({
  READER_DB: createD1(MIGRATIONS),
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret",
  X_CLIENT_ID: "x-id",
  X_CLIENT_SECRET: "x-secret",
  ...extra,
});

const req = (path, { method = "GET", cookies = {}, origin } = {}) => {
  const headers = new Headers();
  const jar = Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
  if (jar.length) headers.set("Cookie", jar.join("; "));
  if (origin) headers.set("Origin", origin);
  return new Request(`${ORIGIN}${path}`, { method, headers });
};

const setCookies = (res) => {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [k, ...v] = pair.split("=");
    out[k] = v.join("=");
  }
  return out;
};

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

async function withFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => handler(new URL(typeof input === "string" ? input : input.url), init);
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const githubFetch = (user) => (url, init) => {
  if (url.href === "https://github.com/login/oauth/access_token") {
    const form = new URLSearchParams(init.body);
    assert.equal(form.get("client_secret"), "gh-secret");
    assert.ok(form.get("code_verifier"), "PKCE verifier is sent");
    return json({ access_token: "gho_token", token_type: "bearer" });
  }
  if (url.href === "https://api.github.com/user") return json(user);
  return new Response("unexpected", { status: 500 });
};

const GH_USER = { id: 42, login: "ana", name: "Ana Lyst", avatar_url: "https://avatars.githubusercontent.com/u/42", html_url: "https://github.com/ana" };

// Run start + callback for a provider and return the callback response.
async function signInVia(env, provider, { cookies = {}, query = "", code = "c0de", extraParams = {} } = {}) {
  const begin = await start({ request: req(`/api/auth/start/${provider}?return=/setting-goals/${query}`, { cookies }), env, params: { provider } });
  assert.equal(begin.status, 302);
  const location = new URL(begin.headers.get("Location"));
  const state = setCookies(begin)[STATE_COOKIE];
  assert.ok(state);
  const params = new URLSearchParams({ code, state, ...extraParams });
  const res = await callback({
    request: req(`/api/auth/callback/${provider}?${params}`, { cookies: { ...cookies, [STATE_COOKIE]: state } }),
    env,
    params: { provider },
  });
  return { begin, location, state, res };
}

test("safeReturnTo and withParam keep redirects on this site", () => {
  assert.equal(safeReturnTo("/setting-goals/"), "/setting-goals/");
  assert.equal(safeReturnTo("/a/?b=1#c"), "/a/?b=1#c");
  for (const bad of ["https://evil.example/", "//evil.example/", "/\\evil.example", "javascript:alert(1)", "", null]) {
    assert.equal(safeReturnTo(bad), "/", String(bad));
  }
  assert.equal(withParam("/a/#reader", "signin", "failed"), "/a/?signin=failed#reader");
});

test("GitHub: start redirects with state and PKCE, callback signs in and returns to the post", async () => {
  const env = makeEnv();
  await withFetch(githubFetch(GH_USER), async () => {
    const { location, res } = await signInVia(env, "github");
    assert.equal(location.origin + location.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(location.searchParams.get("client_id"), "gh-id");
    assert.equal(location.searchParams.get("code_challenge_method"), "S256");
    assert.equal(location.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback/github`);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/setting-goals/#reader");
    const session = setCookies(res)[SESSION_COOKIE];
    assert.match(session, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(setCookies(res)[STATE_COOKIE], "", "state cookie is cleared");

    const body = await (await me({ request: req("/api/auth/me", { cookies: { [SESSION_COOKIE]: session } }), env })).json();
    assert.equal(body.user.displayName, "Ana Lyst");
    assert.equal(body.user.avatarUrl, GH_USER.avatar_url);
    assert.deepEqual(body.identities, [{ provider: "github", handle: "ana", profileUrl: "https://github.com/ana" }]);
    assert.deepEqual(body.providers.map((p) => p.id), ["github", "bluesky", "x"]);

    const stored = env.READER_DB.raw.prepare("SELECT token_hash FROM sessions").get();
    assert.notEqual(stored.token_hash, session, "only the hash of the token is stored");

    // Signing in again with the same GitHub account reuses the account.
    await signInVia(env, "github");
    assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  });
});

test("callback rejects a missing, reused, foreign or cookie-less state", async () => {
  const env = makeEnv();
  await withFetch(githubFetch(GH_USER), async () => {
    const begin = await start({ request: req("/api/auth/start/github?return=/p/"), env, params: { provider: "github" } });
    const state = setCookies(begin)[STATE_COOKIE];

    let res = await callback({ request: req(`/api/auth/callback/github?code=c&state=${state}`), env, params: { provider: "github" } });
    assert.equal(res.headers.get("Location"), "/?signin=expired", "no state cookie: login CSRF is refused");

    // The state row was consumed by that attempt, so a replay fails too.
    res = await callback({ request: req(`/api/auth/callback/github?code=c&state=${state}`, { cookies: { [STATE_COOKIE]: state } }), env, params: { provider: "github" } });
    assert.equal(res.headers.get("Location"), "/?signin=expired");

    res = await callback({ request: req("/api/auth/callback/github?code=c&state=nope"), env, params: { provider: "github" } });
    assert.equal(res.headers.get("Location"), "/?signin=expired");

    const begin2 = await start({ request: req("/api/auth/start/github?return=/p/"), env, params: { provider: "github" } });
    const state2 = setCookies(begin2)[STATE_COOKIE];
    res = await callback({ request: req(`/api/auth/callback/x?code=c&state=${state2}`, { cookies: { [STATE_COOKIE]: state2 } }), env, params: { provider: "x" } });
    assert.equal(res.headers.get("Location"), "/?signin=expired", "a GitHub state cannot complete an X sign-in");
  });
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
});

test("callback: declined consent and provider errors send the reader back with a reason", async () => {
  const env = makeEnv();
  await withFetch(githubFetch(GH_USER), async () => {
    const { res } = await signInVia(env, "github", { extraParams: { error: "access_denied" } });
    assert.equal(res.headers.get("Location"), "/setting-goals/?signin=cancelled");
  });
  await withFetch(() => json({ error: "bad_verification_code" }), async () => {
    const { res } = await signInVia(env, "github");
    assert.equal(res.headers.get("Location"), "/setting-goals/?signin=failed");
  });
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
});

test("unconfigured providers are not offered and cannot start", async () => {
  const env = makeEnv({ X_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" });
  const res = await start({ request: req("/api/auth/start/x?return=/p/"), env, params: { provider: "x" } });
  assert.equal(res.headers.get("Location"), "/p/?signin=unavailable");
  const unknown = await start({ request: req("/api/auth/start/myspace?return=/p/"), env, params: { provider: "myspace" } });
  assert.equal(unknown.headers.get("Location"), "/p/?signin=unavailable");
  const body = await (await me({ request: req("/api/auth/me"), env })).json();
  assert.equal(body.user, null);
  assert.deepEqual(body.providers.map((p) => p.id), ["bluesky"]);
});

const X_USER = { data: { id: "777", username: "ana_x", name: "Ana on X", profile_image_url: "https://pbs.twimg.com/profile_images/1/a_normal.jpg" } };
const xFetch = (url, init) => {
  if (url.href === "https://api.x.com/2/oauth2/token") {
    assert.equal(init.headers.Authorization, `Basic ${btoa("x-id:x-secret")}`);
    return json({ access_token: "x_token", token_type: "bearer" });
  }
  if (url.pathname === "/2/users/me") return json(X_USER);
  return githubFetch(GH_USER)(url, init);
};

test("a signed-in reader can link another sign-in method to the same account", async () => {
  const env = makeEnv();
  await withFetch(xFetch, async () => {
    const first = await signInVia(env, "github");
    const session = setCookies(first.res)[SESSION_COOKIE];

    const linked = await signInVia(env, "x", { cookies: { [SESSION_COOKIE]: session } });
    assert.equal(linked.res.headers.get("Location"), "/setting-goals/#reader");
    assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1, "no second account");

    const body = await (await me({ request: req("/api/auth/me", { cookies: { [SESSION_COOKIE]: session } }), env })).json();
    assert.deepEqual(body.identities.map((i) => `${i.provider}:${i.handle}`), ["github:ana", "x:ana_x"]);
    assert.equal(body.user.displayName, "Ana Lyst", "linking does not replace the account's name");

    // Signing in with X alone now reaches the same account.
    const viaX = await signInVia(env, "x");
    const xSession = setCookies(viaX.res)[SESSION_COOKIE];
    const again = await (await me({ request: req("/api/auth/me", { cookies: { [SESSION_COOKIE]: xSession } }), env })).json();
    assert.equal(again.user.id, body.user.id);
  });
});

test("linking an identity that belongs to another account is refused", async () => {
  const env = makeEnv();
  await withFetch(xFetch, async () => {
    await signInVia(env, "x"); // X identity creates account 1
    const gh = await signInVia(env, "github"); // GitHub creates account 2
    const session = setCookies(gh.res)[SESSION_COOKIE];
    const { res } = await signInVia(env, "x", { cookies: { [SESSION_COOKIE]: session } });
    assert.equal(res.headers.get("Location"), "/setting-goals/?signin=already-linked");
    assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM identities").get().n, 2);
  });
});

test("X: avatar is upgraded from the 48px default and the profile links to x.com", async () => {
  const env = makeEnv();
  await withFetch(xFetch, async () => {
    const { location, res } = await signInVia(env, "x");
    assert.equal(location.origin, "https://x.com");
    assert.equal(location.searchParams.get("scope"), "users.read tweet.read");
    const session = setCookies(res)[SESSION_COOKIE];
    const body = await (await me({ request: req("/api/auth/me", { cookies: { [SESSION_COOKIE]: session } }), env })).json();
    assert.equal(body.user.avatarUrl, "https://pbs.twimg.com/profile_images/1/a_400x400.jpg");
    assert.equal(body.user.profileUrl, "https://x.com/ana_x");
  });
});

test("logout deletes the session and clears the cookie", async () => {
  const env = makeEnv();
  await withFetch(githubFetch(GH_USER), async () => {
    const { res } = await signInVia(env, "github");
    const session = setCookies(res)[SESSION_COOKIE];
    assert.equal((await logout({ request: req("/api/auth/logout", { method: "POST", cookies: { [SESSION_COOKIE]: session } }), env })).status, 403, "cross-origin logout is refused");
    const out = await logout({ request: req("/api/auth/logout", { method: "POST", origin: ORIGIN, cookies: { [SESSION_COOKIE]: session } }), env });
    assert.equal(out.status, 200);
    assert.equal(setCookies(out)[SESSION_COOKIE], "");
    const body = await (await me({ request: req("/api/auth/me", { cookies: { [SESSION_COOKIE]: session } }), env })).json();
    assert.equal(body.user, null);
  });
});

test("blocked accounts cannot sign in", async () => {
  const env = makeEnv();
  await withFetch(githubFetch(GH_USER), async () => {
    await signInVia(env, "github");
    env.READER_DB.raw.prepare("UPDATE users SET status = 'blocked'").run();
    const { res } = await signInVia(env, "github");
    assert.equal(res.headers.get("Location"), "/setting-goals/?signin=blocked");
  });
});

// --- Bluesky ---------------------------------------------------------------------

const DID = "did:plc:abcdefghijklmnopqrstuvwx";
const PDS = "https://pds.example.com";
const AS = "https://auth.example.com";

const b64urlDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

async function verifyDpop(proof, { htm, htu }) {
  const [h, p, sig] = proof.split(".");
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  assert.equal(header.typ, "dpop+jwt");
  assert.equal(header.alg, "ES256");
  assert.equal(header.jwk.d, undefined, "the private key is never sent");
  const key = await crypto.subtle.importKey("jwk", header.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`));
  assert.ok(ok, "DPoP signature verifies");
  assert.equal(payload.htm, htm);
  assert.equal(payload.htu, htu);
  return { header, payload };
}

test("Bluesky: DPoP proofs are valid ES256 JWTs and handles are normalised", async () => {
  const key = await generateDpopKey();
  const proof = await dpopProof(key, { htm: "POST", htu: "https://auth.example.com/par", nonce: "n1" });
  const { payload } = await verifyDpop(proof, { htm: "POST", htu: "https://auth.example.com/par" });
  assert.equal(payload.nonce, "n1");
  assert.ok(payload.jti && payload.iat);
  assert.equal(normalizeHandle("@Ana.BSKY.social "), "ana.bsky.social");
  assert.equal(normalizeHandle("not a handle"), null);
  assert.equal(normalizeHandle("localhost"), null);
  assert.equal(base64url(new Uint8Array([251, 255])), "-_8");
});

function blueskyFetch({ tokenSub = DID, log = [] } = {}) {
  let parNonceSent = false;
  return (url, init = {}) => {
    log.push(`${init.method || "GET"} ${url.href}`);
    if (url.href.startsWith("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle")) {
      assert.equal(url.searchParams.get("handle"), "ana.example.com");
      return json({ did: DID });
    }
    if (url.href === `https://plc.directory/${DID}`) {
      return json({ id: DID, service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: PDS }] });
    }
    if (url.href === `${PDS}/.well-known/oauth-protected-resource`) return json({ authorization_servers: [AS] });
    if (url.href === `${AS}/.well-known/oauth-authorization-server`) {
      return json({
        issuer: AS,
        authorization_endpoint: `${AS}/authorize`,
        token_endpoint: `${AS}/token`,
        pushed_authorization_request_endpoint: `${AS}/par`,
      });
    }
    if (url.href === `${AS}/par`) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("client_id"), `${ORIGIN}/api/auth/client-metadata`);
      assert.equal(form.get("scope"), "atproto");
      assert.equal(form.get("login_hint"), "ana.example.com");
      assert.ok(init.headers.DPoP);
      if (!parNonceSent) {
        parNonceSent = true;
        return json({ error: "use_dpop_nonce" }, { status: 400, headers: { "DPoP-Nonce": "nonce-1", "Content-Type": "application/json" } });
      }
      return json({ request_uri: "urn:ietf:params:oauth:request_uri:abc", expires_in: 60 }, { status: 201 });
    }
    if (url.href === `${AS}/token`) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.ok(form.get("code_verifier"));
      return verifyDpop(init.headers.DPoP, { htm: "POST", htu: `${AS}/token` }).then(({ payload }) => {
        assert.equal(payload.nonce, "nonce-1", "the PAR nonce is reused for the token request");
        return json({ access_token: "at", token_type: "DPoP", sub: tokenSub, scope: "atproto" }, { headers: { "DPoP-Nonce": "nonce-2", "Content-Type": "application/json" } });
      });
    }
    if (url.href.startsWith("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile")) {
      return json({ did: DID, handle: "ana.example.com", displayName: "Ana B", avatar: "https://cdn.bsky.app/img/avatar/plain/x" });
    }
    return new Response("unexpected", { status: 500 });
  };
}

test("Bluesky: handle -> PDS -> authorization server, PAR with DPoP nonce retry, token sub is the identity", async () => {
  const env = makeEnv();
  const log = [];
  await withFetch(blueskyFetch({ log }), async () => {
    const { location, res } = await signInVia(env, "bluesky", { query: "&handle=@ana.example.com", extraParams: { iss: AS } });
    assert.equal(location.origin + location.pathname, `${AS}/authorize`);
    assert.equal(location.searchParams.get("request_uri"), "urn:ietf:params:oauth:request_uri:abc");
    assert.equal(res.headers.get("Location"), "/setting-goals/#reader");
    const session = setCookies(res)[SESSION_COOKIE];
    const body = await (await me({ request: req("/api/auth/me", { cookies: { [SESSION_COOKIE]: session } }), env })).json();
    assert.equal(body.user.displayName, "Ana B");
    assert.equal(body.user.profileUrl, `https://bsky.app/profile/${DID}`);
    assert.deepEqual(body.identities.map((i) => i.handle), ["ana.example.com"]);
  });
  assert.equal(log.filter((l) => l === `POST ${AS}/par`).length, 2, "PAR retried once with the nonce");
  const row = env.READER_DB.raw.prepare("SELECT provider_id FROM identities").get();
  assert.equal(row.provider_id, DID, "the DID, not the handle, identifies the account");
});

test("Bluesky: a token for a different DID, or a wrong issuer, is refused", async () => {
  const env = makeEnv();
  await withFetch(blueskyFetch({ tokenSub: "did:plc:zzzzzzzzzzzzzzzzzzzzzzzz" }), async () => {
    const { res } = await signInVia(env, "bluesky", { query: "&handle=ana.example.com", extraParams: { iss: AS } });
    assert.equal(res.headers.get("Location"), "/setting-goals/?signin=failed");
  });
  await withFetch(blueskyFetch(), async () => {
    const { res } = await signInVia(env, "bluesky", { query: "&handle=ana.example.com", extraParams: { iss: "https://evil.example" } });
    assert.equal(res.headers.get("Location"), "/setting-goals/?signin=failed");
  });
  const bad = await start({ request: req("/api/auth/start/bluesky?return=/p/&handle=not%20a%20handle"), env, params: { provider: "bluesky" } });
  assert.equal(bad.headers.get("Location"), "/p/?signin=bad-handle");
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
});

test("client metadata describes the origin it is served from", async () => {
  const res = clientMetadataRoute({ request: new Request("https://preview.aifocus.pages.dev/api/auth/client-metadata") });
  const body = await res.json();
  assert.equal(body.client_id, "https://preview.aifocus.pages.dev/api/auth/client-metadata");
  assert.deepEqual(body.redirect_uris, ["https://preview.aifocus.pages.dev/api/auth/callback/bluesky"]);
  assert.equal(body.token_endpoint_auth_method, "none");
  assert.equal(body.dpop_bound_access_tokens, true);
  assert.equal(body.scope, "atproto");
});
