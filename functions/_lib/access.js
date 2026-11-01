// Cloudflare Access verification for /api/admin/*.
//
// Access sits in front of /admin/ and /api/admin/ and adds a signed JWT in
// the Cf-Access-Jwt-Assertion header. This module verifies that token
// (RS256, against the team's published keys) rather than trusting that
// Access is configured, so a missing or misconfigured Access application
// fails closed.
//
// Required environment variables:
//   ACCESS_TEAM_DOMAIN  e.g. "paulkinlan.cloudflareaccess.com"
//   ACCESS_AUD          the Access application's Audience (AUD) tag

let certCache = { domain: null, keys: null, fetchedAt: 0 };
const CERT_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodePart(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(domain, fetchImpl) {
  const now = Date.now();
  if (certCache.domain === domain && certCache.keys && now - certCache.fetchedAt < CERT_TTL_MS) {
    return certCache.keys;
  }
  const res = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const { keys = [] } = await res.json();
  certCache = { domain, keys, fetchedAt: now };
  return keys;
}

export function resetAccessCache() {
  certCache = { domain: null, keys: null, fetchedAt: 0 };
}

// Returns the verified identity ({ email }) or null.
export async function verifyAccess(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const domain = env?.ACCESS_TEAM_DOMAIN;
  const aud = env?.ACCESS_AUD;
  if (!domain || !aud) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    return null;
  }
  // "null", "123" or a string decode to non-objects; touching .alg/.aud on
  // them would throw a TypeError and turn a bad token into a 500.
  if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
  if (header.alg !== "RS256") return null;

  let keys;
  try {
    keys = await getKeys(domain, fetchImpl);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    // atob() throws a DOMException on a malformed signature segment, and
    // subtle.verify() can reject on unusable key material: a token that
    // cannot be validated is rejected (null -> 403), never a 500.
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.iss !== `https://${domain}`) return null;
  const seconds = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp < seconds) return null;
  if (typeof payload.nbf === "number" && payload.nbf > seconds + 60) return null;

  return { email: payload.email || payload.sub || "unknown" };
}
