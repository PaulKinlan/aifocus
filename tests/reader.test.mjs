import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import { onRequestGet as getState } from "../functions/api/reader/state.js";
import { onRequestPost as postReaction } from "../functions/api/reader/reactions.js";
import {
  onRequestPost as postAnnotation,
  onRequestDelete as deleteAnnotation,
} from "../functions/api/reader/annotations.js";
import { onRequestGet as getQueue } from "../functions/api/admin/queue.js";
import { onRequestPost as postModerate } from "../functions/api/admin/moderate.js";
import { onRequestGet as getTrust, onRequestPost as postTrust } from "../functions/api/admin/trust.js";
import { onRequestGet as getAccounts, onRequestPost as postAccounts } from "../functions/api/admin/accounts.js";
import {
  normalizePostPath,
  cleanText,
  looseText,
  htmlToText,
  getReader,
  READER_COOKIE,
} from "../functions/_lib/reader.js";
import { verifyAccess, resetAccessCache } from "../functions/_lib/access.js";
import { SESSION_COOKIE, createSession, upsertIdentity } from "../functions/_lib/auth.js";

const MIGRATIONS = ["0001_reader.sql", "0003_auth.sql"].map((f) =>
  fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)),
);
const ORIGIN = "https://aifoc.us";
const POST = "/setting-goals/";
const POST_HTML = `<html><body><article class=h-entry><h1>setting goals</h1>
<div class=e-content><p>A lot of Web Development has changed almost overnight &amp; I didn&rsquo;t realise.</p>
<p>Clones, Remakes, Demakes, and <em>reverse engineering</em> have changed the web.</p></div></article>
<section>More essays</section></body></html>`;

function makeEnv(extra = {}) {
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

function req(path, { method = "GET", body, reader, session, origin = ORIGIN, headers = {} } = {}) {
  const h = new Headers(headers);
  if (body !== undefined) h.set("Content-Type", "application/json");
  if (origin) h.set("Origin", origin);
  const cookies = [];
  if (reader) cookies.push(`${READER_COOKIE}=${reader}`);
  if (session) cookies.push(`${SESSION_COOKIE}=${session}`);
  if (cookies.length) h.set("Cookie", cookies.join("; "));
  h.set("CF-Connecting-IP", "203.0.113.7");
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

function cookieFrom(res) {
  const m = /aifocus_reader=([0-9a-f]{32})/.exec(res.headers.get("Set-Cookie") || "");
  return m ? m[1] : null;
}

const READER_A = "a".repeat(32);
const READER_B = "b".repeat(32);

// Create an account with a GitHub identity and return a session token for it.
async function signIn(env, login = "ana", extra = {}) {
  const user = await upsertIdentity(env.READER_DB, {
    provider: "github",
    providerId: String(login.length * 1000 + login.charCodeAt(0)),
    handle: login,
    name: login.toUpperCase(),
    avatarUrl: `https://avatars.example/${login}.png`,
    profileUrl: `https://github.com/${login}`,
    ...extra,
  });
  return { user, session: await createSession(env.READER_DB, user.id) };
}

test("helpers: path, text and reader cookie handling", () => {
  assert.equal(normalizePostPath("/setting-goals"), "/setting-goals/");
  assert.equal(normalizePostPath("https://aifoc.us/setting-goals/"), "/setting-goals/");
  assert.equal(normalizePostPath("/a//b"), null);
  assert.equal(normalizePostPath("/a b/"), null);
  assert.equal(normalizePostPath(""), null);
  assert.equal(cleanText("  hi\u0000 there ", 100), "hi there");
  assert.equal(cleanText("x".repeat(10) + "😀", 11), "x".repeat(10) + "😀");
  assert.equal(looseText("Didn’t  realise!"), "didntrealise");
  assert.match(htmlToText("<p>a &amp; b&#39;s</p>"), /a & b's/);
  assert.equal(htmlToText("didn&rsquo;t &unknown; x"), "didn\u2019t x");
  const fresh = getReader(new Request(ORIGIN));
  assert.equal(fresh.isNew, true);
  assert.match(fresh.id, /^[0-9a-f]{32}$/);
  const known = getReader(new Request(ORIGIN, { headers: { Cookie: `${READER_COOKIE}=${READER_A}` } }));
  assert.deepEqual(known, { id: READER_A, isNew: false });
});

test("reactions: toggle on and off, counted per reader, cookie set for new readers", async () => {
  const env = makeEnv();
  let res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }), env });
  assert.equal(res.status, 200);
  const reader = cookieFrom(res);
  assert.ok(reader);
  assert.equal((await res.json()).count, 1);

  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader }), env });
  assert.equal((await res.json()).count, 1, "same reader twice counts once");
  assert.equal(cookieFrom(res), null, "existing reader is not re-issued a cookie");

  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, reader: READER_B }), env });
  assert.equal((await res.json()).count, 2);

  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful", on: false }, reader }), env });
  assert.equal((await res.json()).count, 1);

  const state = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
  assert.equal(state.reactions.useful, 1);
  assert.deepEqual(state.myReactions, ["useful"]);
});

test("reactions: rejects unknown kinds, unknown posts and cross-origin writes", async () => {
  const env = makeEnv();
  let res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "angry" } }), env });
  assert.equal(res.status, 400);
  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: "/nope/", kind: "useful" } }), env });
  assert.equal(res.status, 404);
  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, origin: "https://evil.example" }), env });
  assert.equal(res.status, 403);
  res = await postReaction({ request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, origin: null }), env });
  assert.equal(res.status, 403);
});

test("highlights: quote must come from the post, approved immediately, deduplicated per reader", async () => {
  const env = makeEnv();
  const quote = { exact: "I didn't realise", prefix: "overnight & ", suffix: "." };
  let res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_A }), env });
  assert.equal(res.status, 201);
  const first = (await res.json()).annotation;
  assert.equal(first.status, "approved");

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_A }), env });
  assert.equal((await res.json()).annotation.id, first.id);

  await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote }, reader: READER_B }), env });

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "highlight", quote: { exact: "words that are not in the essay" } }, reader: READER_A }), env });
  assert.equal(res.status, 400);

  const state = await (await getState({ request: req(`/api/reader/state?post=${POST}`), env })).json();
  assert.equal(state.highlights.length, 1);
  assert.equal(state.highlights[0].count, 2);
  assert.equal(state.highlights[0].mine, false);
});

test("notes and comments: require sign-in", async () => {
  const env = makeEnv();
  for (const body of [
    { post: POST, type: "comment", body: "Nice post" },
    { post: POST, type: "note", quote: { exact: "reverse engineering" }, body: "Ghidra counts too." },
  ]) {
    const res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body, reader: READER_A }), env });
    assert.equal(res.status, 401);
  }
  const res = await postAnnotation({
    request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "x" }, reader: READER_A, session: "A".repeat(43) }),
    env,
  });
  assert.equal(res.status, 401, "an unknown session token is signed out");
  assert.equal(env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM annotations").get().n, 0);
});

test("notes and comments: pending until approved, visible to their writer only", async () => {
  const env = makeEnv();
  const { session, user } = await signIn(env, "ana");
  let res = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "note", quote: { exact: "reverse engineering" }, body: "Ghidra counts too.", name: "Spoofed" },
      reader: READER_A,
      session,
    }),
    env,
  });
  assert.equal(res.status, 201);
  const note = (await res.json()).annotation;
  assert.equal(note.status, "pending");
  assert.equal(note.name, "ANA", "the name comes from the account, not the request");
  assert.equal(note.avatarUrl, "https://avatars.example/ana.png");
  assert.equal(note.profileUrl, "https://github.com/ana");

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "Nice post" }, reader: READER_A, session }), env });
  const comment = (await res.json()).annotation;
  assert.equal(env.READER_DB.raw.prepare("SELECT user_id FROM annotations WHERE id = ?").get(comment.id).user_id, user.id);

  res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "" }, reader: READER_A, session }), env });
  assert.equal(res.status, 400);

  let mine = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_A }), env })).json();
  assert.equal(mine.notes.length, 1);
  assert.equal(mine.notes[0].status, "pending");
  assert.equal(mine.comments.length, 1);
  assert.equal(mine.highlights[0].mine, true);
  assert.equal(mine.highlights[0].count, 0, "a pending note's passage is not counted as shared");

  let other = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
  assert.equal(other.notes.length, 0);
  assert.equal(other.comments.length, 0);
  assert.equal(other.highlights.length, 0);

  env.READER_DB.raw.prepare("UPDATE annotations SET status = 'approved' WHERE id = ?").run(comment.id);
  other = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
  assert.equal(other.comments.length, 1);
  assert.equal(other.comments[0].body, "Nice post");
  assert.equal(other.comments[0].name, "ANA");
  assert.equal(other.viewer, null);
  assert.equal(other.comments[0].status, undefined, "status is only shown to the writer");
  assert.equal(other.comments[0].mine, undefined);

  res = await deleteAnnotation({ request: req(`/api/reader/annotations?id=${note.id}`, { method: "DELETE", reader: READER_B }), env });
  assert.equal(res.status, 404, "cannot delete another reader's note");
  res = await deleteAnnotation({ request: req(`/api/reader/annotations?id=${note.id}`, { method: "DELETE", reader: READER_A }), env });
  assert.equal(res.status, 200);
  mine = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_A }), env })).json();
  assert.equal(mine.notes.length, 0);
});

test("annotations: safety screen result is stored, and failures do not block saving", async () => {
  const env = makeEnv({ AI: { run: async () => ({ response: { safe: false, categories: ["S10"] } }) } });
  const { session } = await signIn(env);
  await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "bad" }, reader: READER_A, session }), env });
  let row = env.READER_DB.raw.prepare("SELECT screen, status, ip_hash FROM annotations").get();
  assert.equal(row.screen, "unsafe:S10");
  assert.equal(row.status, "pending");
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(row.ip_hash, "203.0.113.7");

  const failing = makeEnv({ AI: { run: async () => { throw new Error("down"); } } });
  const signedIn = await signIn(failing);
  const res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "ok" }, reader: READER_A, session: signedIn.session }), env: failing });
  assert.equal(res.status, 201);
  row = failing.READER_DB.raw.prepare("SELECT screen FROM annotations").get();
  assert.equal(row.screen, "error");
});

test("annotations: rate limited per reader", async () => {
  const env = makeEnv();
  const { session } = await signIn(env);
  let last;
  for (let i = 0; i < 31; i += 1) {
    last = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: `c${i}` }, reader: READER_A, session }), env });
  }
  assert.equal(last.status, 429);
});

test("state: 503 without the D1 binding, 400 without a post", async () => {
  assert.equal((await getState({ request: req(`/api/reader/state?post=${POST}`), env: {} })).status, 503);
  assert.equal((await getState({ request: req("/api/reader/state"), env: makeEnv() })).status, 400);
});

// --- Cloudflare Access ------------------------------------------------------

const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-tag";

async function makeSigner() {
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

test("verifyAccess: accepts a valid token and rejects wrong aud, issuer, expiry, signature or config", async () => {
  resetAccessCache();
  const { sign, fetchImpl } = await makeSigner();
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const now = Date.now();
  const good = { aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(now / 1000) + 600, email: "paul@aifoc.us" };
  const check = async (token, e = env) =>
    verifyAccess(new Request(ORIGIN, { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} }), e, { fetchImpl, now });

  assert.deepEqual(await check(await sign(good)), { email: "paul@aifoc.us" });
  assert.equal(await check(await sign({ ...good, aud: ["other"] })), null);
  assert.equal(await check(await sign({ ...good, iss: "https://evil.cloudflareaccess.com" })), null);
  assert.equal(await check(await sign({ ...good, exp: Math.floor(now / 1000) - 10 })), null);
  assert.equal(await check(await sign(good, { alg: "none", kid: "k1" })), null);
  const token = await sign(good);
  const tampered = token.replace(/\.([^.]+)\./, (_, p) => `.${Buffer.from(JSON.stringify({ ...good, email: "x@y" })).toString("base64url")}.`);
  assert.equal(await check(tampered), null);
  assert.equal(await check(null), null);
  assert.equal(await check(await sign(good), {}), null, "fails closed without configuration");
});

test("admin queue and moderation: require Access, then approve makes a note public", async () => {
  resetAccessCache();
  const { sign, fetchImpl } = await makeSigner();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const env = { ...makeEnv(), ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
    const token = await sign({ aud: AUD, iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: "paul@aifoc.us" });
    const auth = { "Cf-Access-Jwt-Assertion": token };

    const { session, user } = await signIn(env, "bo");
    const created = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "hello" }, reader: READER_A, session }), env });
    const { id } = (await created.json()).annotation;

    assert.equal((await getQueue({ request: req("/api/admin/queue"), env })).status, 403);

    const queue = await (await getQueue({ request: req("/api/admin/queue", { headers: auth }), env })).json();
    assert.equal(queue.items.length, 1);
    assert.equal(queue.counts.pending, 1);
    assert.equal(queue.moderator, "paul@aifoc.us");

    let res = await postModerate({ request: req("/api/admin/moderate", { method: "POST", body: { ids: [id], status: "approved" } }), env });
    assert.equal(res.status, 403);
    res = await postModerate({ request: req("/api/admin/moderate", { method: "POST", body: { ids: [id], status: "approved" }, headers: auth }), env });
    assert.equal((await res.json()).updated, 1);

    const state = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
    assert.equal(state.comments.length, 1);
    const row = env.READER_DB.raw.prepare("SELECT moderated_by FROM annotations WHERE id = ?").get(id);
    assert.equal(row.moderated_by, "paul@aifoc.us");

    // Approval alone does not trust the account: its next comment waits.
    assert.equal(env.READER_DB.raw.prepare("SELECT trusted FROM users WHERE id = ?").get(user.id).trusted, 0);
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "waits" }, reader: READER_A, session }), env });
    assert.equal((await res.json()).annotation.status, "pending");

    // The moderator trusts the account by hand, from the queue item's author_id.
    const pending = await (await getQueue({ request: req("/api/admin/queue", { headers: auth }), env })).json();
    assert.equal(pending.items[0].author_id, user.id);
    const trustBody = { userId: user.id, trusted: true };
    assert.equal((await postTrust({ request: req("/api/admin/trust", { method: "POST", body: trustBody }), env })).status, 403);
    assert.equal((await postTrust({ request: req("/api/admin/trust", { method: "POST", body: { userId: "x", trusted: true }, headers: auth }), env })).status, 400);
    assert.equal((await postTrust({ request: req("/api/admin/trust", { method: "POST", body: trustBody, headers: auth }), env })).status, 200);
    const trusted = await (await getTrust({ request: req("/api/admin/trust", { headers: auth }), env })).json();
    assert.deepEqual(trusted.users.map((u) => u.id), [user.id]);

    // A trusted account's next comment is published straight away, unless
    // the safety screen flags it.
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "again" }, reader: READER_A, session }), env });
    assert.equal((await res.json()).annotation.status, "approved");
    env.AI = { run: async () => ({ response: { safe: false, categories: ["S1"] } }) };
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "flagged" }, reader: READER_A, session }), env });
    const flagged = (await res.json()).annotation;
    assert.equal(flagged.status, "pending");

    // Marking one as spam removes the trust.
    res = await postModerate({ request: req("/api/admin/moderate", { method: "POST", body: { ids: [flagged.id], status: "spam" }, headers: auth }), env });
    assert.equal((await res.json()).updated, 1);
    assert.equal(env.READER_DB.raw.prepare("SELECT trusted FROM users WHERE id = ?").get(user.id).trusted, 0);

    const queueAfter = await (await getQueue({ request: req("/api/admin/queue?status=spam", { headers: auth }), env })).json();
    assert.equal(queueAfter.items[0].author_name, "BO");
    assert.equal(queueAfter.items[0].author_profile_url, "https://github.com/bo");

    // All accounts, with counts; blocking signs the account out.
    assert.equal((await getAccounts({ request: req("/api/admin/accounts"), env })).status, 403);
    const accounts = await (await getAccounts({ request: req("/api/admin/accounts", { headers: auth }), env })).json();
    assert.equal(accounts.total, 1);
    assert.equal(accounts.users[0].id, user.id);
    assert.equal(accounts.users[0].identities, "github:bo");
    assert.equal(accounts.users[0].written, 4);
    // Search matches a linked handle; LIKE wildcards are literal.
    const found = await (await getAccounts({ request: req("/api/admin/accounts?q=bo", { headers: auth }), env })).json();
    assert.deepEqual([found.matched, found.users.length, found.total], [1, 1, 1]);
    const none = await (await getAccounts({ request: req("/api/admin/accounts?q=%25", { headers: auth }), env })).json();
    assert.deepEqual([none.matched, none.users.length], [0, 0]);
    assert.equal((await postAccounts({ request: req("/api/admin/accounts", { method: "POST", body: { userId: user.id, status: "blocked" } }), env })).status, 403);
    res = await postAccounts({ request: req("/api/admin/accounts", { method: "POST", body: { userId: user.id, status: "blocked" }, headers: auth }), env });
    assert.equal(res.status, 200);
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "blocked" }, reader: READER_A, session }), env });
    assert.equal(res.status, 401);
  } finally {
    globalThis.fetch = realFetch;
  }
});
