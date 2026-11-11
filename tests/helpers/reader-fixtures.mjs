// Shared fixtures for the reader API integration tests (aifocus-dsg4). The
// endpoint-owned files (reader-reactions, reader-annotations,
// reader-write-slots, reader-admin, reader-account, reader-access and the
// state guards in reader-state) import from here instead of appending to one
// shared 700-line test file, so concurrent work on different endpoints stops
// colliding at a common tail. Immutable fixture data and fresh factories
// only: makeEnv() builds a NEW D1 for every call, so cases share no mutable
// state and run in any order.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./d1.mjs";
import { READER_COOKIE } from "../../functions/_lib/reader.js";
import { SESSION_COOKIE, createSession, upsertIdentity } from "../../functions/_lib/auth.js";

export const MIGRATIONS = ["0001_reader.sql", "0003_auth.sql", "0005_reaction_ip.sql", "0006_write_events.sql", "0009_admin_actions.sql"].map((f) =>
  fileURLToPath(new URL(`../../migrations/${f}`, import.meta.url)),
);
// The tree as a functions deploy can find it: before migration 0005 ran.
export const MIGRATIONS_PRE_IP = ["0001_reader.sql", "0003_auth.sql"].map((f) =>
  fileURLToPath(new URL(`../../migrations/${f}`, import.meta.url)),
);

export const ORIGIN = "https://aifoc.us";
export const POST = "/setting-goals/";
export const POST_HTML = `<html><body><article class=h-entry><h1>setting goals</h1>
<div class=e-content><p>A lot of Web Development has changed almost overnight &amp; I didn&rsquo;t realise.</p>
<p>Clones, Remakes, Demakes, and <em>reverse engineering</em> have changed the web.</p></div></article>
<section>More essays</section></body></html>`;

export function makeEnv(extra = {}) {
  return {
    READER_DB: createD1(MIGRATIONS),
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req.url).pathname;
        if (path === "/index.json") {
          return new Response(JSON.stringify({ articles: [{ url: `${ORIGIN}${POST}`, title: "setting goals" }] }));
        }
        if (path === POST) return new Response(POST_HTML);
        return new Response("not found", { status: 404 });
      },
    },
    AI: { run: async () => ({ response: { safe: true } }) },
    ...extra,
  };
}

export function req(path, { method = "GET", body, reader, session, origin = ORIGIN, headers = {}, ip = "203.0.113.7" } = {}) {
  const h = new Headers(headers);
  if (body !== undefined) h.set("Content-Type", "application/json");
  if (origin) h.set("Origin", origin);
  const cookies = [];
  if (reader) cookies.push(`${READER_COOKIE}=${reader}`);
  if (session) cookies.push(`${SESSION_COOKIE}=${session}`);
  if (cookies.length) h.set("Cookie", cookies.join("; "));
  if (ip) h.set("CF-Connecting-IP", ip);
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function cookieFrom(res) {
  const m = /aifocus_reader=([0-9a-f]{32})/.exec(res.headers.get("Set-Cookie") || "");
  return m ? m[1] : null;
}

export const READER_A = "a".repeat(32);
export const READER_B = "b".repeat(32);

// Create an account with a GitHub identity and return a session token for it.
export async function signIn(env, login = "ana", extra = {}) {
  const user = await upsertIdentity(env.READER_DB, {
    provider: "github",
    providerId: String(login.length * 1000 + login.charCodeAt(0)),
    handle: login,
    name: login.toUpperCase(),
    // a provider-minted avatar host: the payload keeps it, and the sink guard
    // (aifocus-r044) is what rejects anything else
    avatarUrl: `https://pbs.twimg.com/profile_images/${login}_400x400.png`,
    profileUrl: `https://github.com/${login}`,
    ...extra,
  });
  return { user, session: await createSession(env.READER_DB, user.id) };
}

export const TEAM = "team.cloudflareaccess.com";
export const AUD = "aud-tag";

export async function makeSigner() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256" };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sign = async (payload, header = { alg: "RS256", kid: "k1" }) => {
    const input = `${b64(header)}.${b64(payload)}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(sig).toString("base64url")}`;
  };
  const fetchImpl = async (url) => {
    assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }));
  };
  return { sign, fetchImpl };
}
