// Sign in with Bluesky (AT Protocol OAuth).
// https://atproto.com/specs/oauth
//
// atproto OAuth needs no client registration. The client_id is the URL of a
// client metadata document this site serves (functions/api/auth/client-metadata.js),
// and the flow requires PKCE, pushed authorization requests (PAR) and DPoP.
// This site is a public client ("token_endpoint_auth_method": "none") that
// asks only for the `atproto` scope: the token response's `sub` (the
// reader's DID) is the identity. The access token is never used or stored.
//
// The reader's account can live on any PDS, so the authorization server is
// discovered: handle -> DID -> DID document -> PDS -> protected-resource
// metadata -> authorization-server metadata. When no handle is given, the
// flow starts at bsky.social and the returned DID is checked against its own
// PDS's authorization server afterwards.

import { base64url, randomToken } from "../auth.js";

export const id = "bluesky";
export const label = "Bluesky";
export const isConfigured = () => true;

const DEFAULT_SERVER = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";
const HANDLE_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]+(?::\d+)?)$/;
const FETCH_TIMEOUT_MS = 5000;
const MAX_JSON_CHARS = 64 * 1024;

// Every outbound URL in this flow is either one of the fixed discovery hosts
// (appview, plc.directory) or a host named by third-party data (a DID
// document). Anything fetched must be https on the default port, on a public
// DNS name - never an IP literal, an internal/reserved hostname, or another
// port - so the discovery chain cannot be pointed at internal addresses.
function assertPublicHttpsUrl(url) {
  const u = url instanceof URL ? url : new URL(url);
  if (u.protocol !== "https:") throw new Error(`bluesky: ${u.host} is not https`);
  const host = u.hostname;
  if (host.includes(":") || /^\d+(\.\d+)*$/.test(host) || host === "localhost" || /\.(local|internal|localhost)$/.test(host)) {
    throw new Error(`bluesky: ${host} is not a public host`);
  }
  if (u.port && u.port !== "443") throw new Error(`bluesky: ${u.host} uses a non-standard port`);
  return u;
}

export const clientId = (origin) => `${origin}/api/auth/client-metadata`;

export function clientMetadata(origin) {
  return {
    client_id: clientId(origin),
    client_name: "aifoc.us",
    client_uri: origin,
    application_type: "web",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    redirect_uris: [`${origin}/api/auth/callback/bluesky`],
    scope: "atproto",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  };
}

export function normalizeHandle(raw) {
  if (typeof raw !== "string") return null;
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}

const getJson = async (url, fetchImpl) => {
  assertPublicHttpsUrl(url);
  // Redirects are never followed: each hop must re-qualify as a public https
  // host, so a discovery response cannot bounce a fetch onto an internal
  // address. 5s timeout and a 64KB body cap bound what one hop can cost.
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`bluesky: ${new URL(url).host}${new URL(url).pathname} HTTP ${res.status}`);
  }
  const declared = Number(res.headers.get("Content-Length") || "0");
  if (declared > MAX_JSON_CHARS) throw new Error("bluesky: response too large");
  const text = await res.text();
  if (text.length > MAX_JSON_CHARS) throw new Error("bluesky: response too large");
  return JSON.parse(text);
};

export async function resolveHandle(handle, fetchImpl) {
  const body = await getJson(
    `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    fetchImpl,
  );
  if (!DID_RE.test(body?.did || "")) throw new Error("bluesky: handle did not resolve to a DID");
  return body.did;
}

export async function pdsForDid(did, fetchImpl) {
  if (!DID_RE.test(did)) throw new Error("bluesky: invalid DID");
  // did:web names its own host, so honouring it would let the caller pick the
  // host we fetch next. DID documents for did:plc come from the fixed
  // plc.directory registry instead.
  if (!did.startsWith("did:plc:")) throw new Error("bluesky: only did:plc identities are supported");
  const doc = await getJson(`https://plc.directory/${did}`, fetchImpl);
  if (doc?.id !== did) throw new Error("bluesky: DID document id mismatch");
  const service = (doc.service || []).find((s) => s?.id === "#atproto_pds" || s?.id === `${did}#atproto_pds`);
  const endpoint = service?.serviceEndpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) throw new Error("bluesky: no PDS in DID document");
  // The PDS endpoint is third-party data: it must be a public https host
  // before anything is fetched from it.
  assertPublicHttpsUrl(endpoint);
  return endpoint.replace(/\/+$/, "");
}

export async function authServerForPds(pds, fetchImpl) {
  const resource = await getJson(`${pds}/.well-known/oauth-protected-resource`, fetchImpl);
  const issuer = resource?.authorization_servers?.[0];
  if (typeof issuer !== "string" || !issuer.startsWith("https://")) throw new Error("bluesky: no authorization server");
  assertPublicHttpsUrl(issuer);
  return issuer.replace(/\/+$/, "");
}

export async function authServerMetadata(issuer, fetchImpl) {
  assertPublicHttpsUrl(issuer);
  const meta = await getJson(`${issuer}/.well-known/oauth-authorization-server`, fetchImpl);
  if (meta?.issuer !== issuer) throw new Error("bluesky: issuer mismatch");
  for (const key of ["authorization_endpoint", "token_endpoint", "pushed_authorization_request_endpoint"]) {
    if (typeof meta[key] !== "string" || !meta[key].startsWith("https://")) throw new Error(`bluesky: missing ${key}`);
  }
  return meta;
}

// --- DPoP (RFC 9449) ----------------------------------------------------------

export async function generateDpopKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return crypto.subtle.exportKey("jwk", pair.privateKey);
}

const enc = new TextEncoder();
const b64json = (value) => base64url(enc.encode(JSON.stringify(value)));

export async function dpopProof(privateJwk, { htm, htu, nonce }) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const { kty, crv, x, y } = privateJwk;
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: { kty, crv, x, y } };
  const payload = { jti: randomToken(16), htm, htu, iat: Math.floor(Date.now() / 1000), ...(nonce ? { nonce } : {}) };
  const input = `${b64json(header)}.${b64json(payload)}`;
  // WebCrypto's ECDSA output is the raw r||s form that JWS ES256 uses.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input)));
  return `${input}.${base64url(sig)}`;
}

// POST a form with a DPoP proof, retrying once with the server's nonce when
// it answers use_dpop_nonce (servers require a nonce on the first request).
export async function dpopPost(url, form, privateJwk, nonce, fetchImpl) {
  assertPublicHttpsUrl(url);
  let currentNonce = nonce || null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        DPoP: await dpopProof(privateJwk, { htm: "POST", htu: url, nonce: currentNonce }),
      },
      body: new URLSearchParams(form),
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const nextNonce = res.headers.get("DPoP-Nonce");
    const text = await res.text();
    if (text.length > MAX_JSON_CHARS) throw new Error("bluesky: response too large");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
    if (res.ok) return { body, nonce: nextNonce || currentNonce };
    if (body?.error === "use_dpop_nonce" && nextNonce && attempt === 0) {
      currentNonce = nextNonce;
      continue;
    }
    throw new Error(`bluesky: ${new URL(url).pathname} failed (${body?.error || res.status})`);
  }
  throw new Error("bluesky: DPoP nonce retry failed");
}

// --- Flow -------------------------------------------------------------------------

// Discover the authorization server, push the authorization request, and
// return the URL to send the browser to plus the data the callback needs.
export async function begin({ origin, handle, state, challenge, fetchImpl = fetch }) {
  let did = null;
  let issuer = DEFAULT_SERVER;
  if (handle) {
    did = await resolveHandle(handle, fetchImpl);
    issuer = await authServerForPds(await pdsForDid(did, fetchImpl), fetchImpl);
  }
  const meta = await authServerMetadata(issuer, fetchImpl);
  const dpopKey = await generateDpopKey();
  const form = {
    client_id: clientId(origin),
    response_type: "code",
    redirect_uri: `${origin}/api/auth/callback/bluesky`,
    scope: "atproto",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(handle ? { login_hint: handle } : {}),
  };
  const { body, nonce } = await dpopPost(meta.pushed_authorization_request_endpoint, form, dpopKey, null, fetchImpl);
  if (typeof body?.request_uri !== "string") throw new Error("bluesky: PAR returned no request_uri");
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({ client_id: clientId(origin), request_uri: body.request_uri });
  return {
    url: url.toString(),
    data: { did, issuer, tokenEndpoint: meta.token_endpoint, dpopKey, nonce },
  };
}

export async function complete({ origin, params, verifier, data, fetchImpl = fetch }) {
  const code = params.get("code");
  if (!code) throw new Error("bluesky: missing code");
  if (params.get("iss") !== data.issuer) throw new Error("bluesky: issuer mismatch on callback");
  const { body } = await dpopPost(
    data.tokenEndpoint,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/auth/callback/bluesky`,
      client_id: clientId(origin),
      code_verifier: verifier,
    },
    data.dpopKey,
    data.nonce,
    fetchImpl,
  );
  const did = body?.sub;
  if (!DID_RE.test(did || "")) throw new Error("bluesky: token response has no DID");
  if (!String(body.scope || "").split(" ").includes("atproto")) throw new Error("bluesky: atproto scope not granted");
  if (data.did && did !== data.did) throw new Error("bluesky: DID does not match the handle");
  if (!data.did) {
    // Started without a handle: the issuer must be the DID's own server.
    const issuer = await authServerForPds(await pdsForDid(did, fetchImpl), fetchImpl);
    if (issuer !== data.issuer) throw new Error("bluesky: DID is not hosted by this authorization server");
  }

  let profile = {};
  try {
    profile = await getJson(`${APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, fetchImpl);
  } catch {
    // The account is verified; display details are a nicety.
  }
  const handle = normalizeHandle(profile.handle || "") || did;
  return {
    provider: id,
    providerId: did,
    handle,
    name: profile.displayName || null,
    avatarUrl: typeof profile.avatar === "string" && profile.avatar.startsWith("https://") ? profile.avatar : null,
    profileUrl: `https://bsky.app/profile/${did}`,
  };
}
