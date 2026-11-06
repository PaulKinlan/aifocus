// DELETE /api/account (aifocus-rom): the erasure path for an account.
// Hard delete, scoped to the session user: everything written under it, its
// linked identities, its sessions and the account row. Anonymous rows (reader
// cookie only) and other readers' rows are untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import { onRequestGet as getAccount, onRequestDelete as deleteAccount } from "../functions/api/account.js";
import { onRequestPost as postAnnotation } from "../functions/api/reader/annotations.js";
import { onRequestPost as postReaction } from "../functions/api/reader/reactions.js";
import { READER_COOKIE } from "../functions/_lib/reader.js";
import { SESSION_COOKIE, createSession, upsertIdentity } from "../functions/_lib/auth.js";

const MIGRATIONS = ["0001_reader.sql", "0003_auth.sql", "0005_reaction_ip.sql", "0006_write_events.sql"].map((f) =>
  fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)),
);

const ORIGIN = "https://aifoc.us";
const POST = "/setting-goals/";
const POST_HTML = `<html><body><article class=h-entry><h1>setting goals</h1>
<div class=e-content><p>A lot of Web Development has changed almost overnight &amp; I didn&rsquo;t realise.</p>
<p>Clones, Remakes, Demakes, and <em>reverse engineering</em> have changed the web.</p></div></article></body></html>`;

const makeEnv = () => ({
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
});

function req(path, { method = "GET", body, reader, session, ip = "203.0.113.7", origin = ORIGIN } = {}) {
  // origin: null omits the header entirely (a request that is not a browser
  // same-origin fetch); a string stands in for a page on another origin.
  const headers = new Headers(origin === null ? {} : { Origin: origin });
  const cookies = [];
  if (reader) cookies.push(`${READER_COOKIE}=${reader}`);
  if (session) cookies.push(`${SESSION_COOKIE}=${session}`);
  if (cookies.length) headers.set("Cookie", cookies.join("; "));
  headers.set("CF-Connecting-IP", ip);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const signIn = async (db, login) => {
  const user = await upsertIdentity(db, {
    provider: "github",
    providerId: String(login.length * 1000 + login.charCodeAt(0)),
    handle: login,
    name: login.toUpperCase(),
  });
  return { user, session: await createSession(db, user.id) };
};

const rowCount = (db, sql, ...params) => Number(db.raw.prepare(sql).get(...params).n);

// Two accounts, each with a comment and a reaction, plus one anonymous
// highlight written before signing in. Returns the ids so the test can tell
// which rows must survive the delete.
async function seed(env) {
  const ana = await signIn(env.READER_DB, "ana");
  const ben = await signIn(env.READER_DB, "ben");
  const anonReader = "c".repeat(32);

  const comment = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "comment", body: "ana thinks this is good" },
      reader: anonReader,
      session: ana.session,
    }),
    env,
  });
  assert.equal(comment.status, 201, await comment.clone().text());
  const benComment = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "comment", body: "ben thinks this is fine" },
      session: ben.session,
    }),
    env,
  });
  assert.equal(benComment.status, 201);
  const anonHighlight = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "highlight", quote: { exact: "reverse engineering" } },
      reader: anonReader,
    }),
    env,
  });
  assert.equal(anonHighlight.status, 201);

  for (const [who, kind] of [[ana, "useful"], [ben, "useful"], [ana, "new-to-me"]]) {
    const res = await postReaction({
      request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind }, session: who.session }),
      env,
    });
    assert.equal(res.status, 200);
  }
  return { ana, ben, anonReader };
}

test("deleting without a session is refused and changes nothing", async () => {
  const env = makeEnv();
  const { ana } = await seed(env);
  const before = rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations");
  const res = await deleteAccount({ request: req("/api/account", { method: "DELETE" }), env });
  assert.equal(res.status, 401);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations"), before);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 1);
});

test("it deletes the account's own rows and nothing else", async () => {
  const env = makeEnv();
  const { ana, ben, anonReader } = await seed(env);

  const res = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session }), env });
  assert.equal(res.status, 200);
  const { deleted } = await res.json();
  assert.equal(deleted.annotations, 1, "ana's one comment");
  assert.equal(deleted.reactions, 2);
  assert.equal(deleted.identities, 1);
  assert.equal(deleted.sessions, 1);

  // The session cookie is cleared, and the token no longer works.
  assert.match(res.headers.get("Set-Cookie") || "", /aifocus_session=;.*Max-Age=0/i);
  const after = await getAccount({ request: req("/api/account", { session: ana.session }), env });
  assert.equal(after.status, 401);

  // The account row is gone, and with it every row keyed to it.
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 0);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE user_id = ?", ana.user.id), 0);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM reactions WHERE user_id = ?", ana.user.id), 0);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM identities WHERE user_id = ?", ana.user.id), 0);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", ana.user.id), 0);

  // Ben's account and the anonymous highlight survive untouched.
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ben.user.id), 1);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE user_id = ?", ben.user.id), 1);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM reactions WHERE user_id = ?", ben.user.id), 1);
  assert.equal(
    rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE reader = ? AND user_id IS NULL", anonReader),
    1,
  );
});

test("reading the account never deletes anything", async () => {
  // Erasure is only reachable through DELETE: a prefetch, a crawler or a stray
  // link that GETs /api/account must leave every row in place.
  const env = makeEnv();
  const { ana } = await seed(env);
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await getAccount({ request: req("/api/account", { session: ana.session }), env });
    assert.equal(res.status, 200);
  }
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 1);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE user_id = ?", ana.user.id), 1);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", ana.user.id), 1);
});

test("a second delete after the first is refused, not repeated", async () => {
  const env = makeEnv();
  const { ana } = await seed(env);
  const first = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session }), env });
  assert.equal(first.status, 200);
  const second = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session }), env });
  assert.equal(second.status, 401);
});

test("a comment in flight when the account is erased does not land afterwards", async () => {
  // aifocus-z2j0: getSessionUser() resolves before the erase, the write then
  // completes after it. Screening is the slow step, so the erase runs from
  // inside AI.run, between the session check and the insert.
  const env = makeEnv();
  const ana = await signIn(env.READER_DB, "ana");
  let erased = false;
  env.AI = {
    run: async () => {
      if (!erased) {
        erased = true;
        const res = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session }), env });
        assert.equal(res.status, 200);
      }
      return { response: { safe: true } };
    },
  };

  const res = await postAnnotation({
    request: req("/api/reader/annotations", {
      method: "POST",
      body: { post: POST, type: "comment", body: "written while the account was being deleted" },
      session: ana.session,
    }),
    env,
  });
  assert.equal(res.status, 401, "the write is refused once the account is gone");
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 0);
  assert.equal(
    rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE body = ?", "written while the account was being deleted"),
    0,
    "no annotation survives the erase",
  );
  assert.equal(
    rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE author_name = ?", "ANA"),
    0,
    "no orphan row keeps the account's name",
  );
});

test("a reaction in flight when the account is erased does not land afterwards", async () => {
  // The erase lands between the session check and the reaction insert: the
  // write reservation (db.batch) is the last await before the insert, so the
  // account is deleted from inside it.
  const env = makeEnv();
  const ana = await signIn(env.READER_DB, "ana");
  const realBatch = env.READER_DB.batch.bind(env.READER_DB);
  let erased = false;
  env.READER_DB.batch = async (statements) => {
    if (!erased) {
      erased = true;
      // Run the real erasure (its own batch re-enters here with the flag set,
      // so it goes straight through): the write path must cope with the account
      // disappearing after getSessionUser() resolved.
      const res = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session }), env });
      assert.equal(res.status, 200);
    }
    return realBatch(statements);
  };

  const res = await postReaction({
    request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" }, session: ana.session }),
    env,
  });
  assert.equal(res.status, 401, `the write is refused once the account is gone (got ${res.status}: ${await res.clone().text()})`);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 0);
  assert.equal(
    rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM reactions WHERE user_id IS NOT NULL"),
    0,
    "no reaction keeps the deleted account's id",
  );
});

test("an anonymous write after an erase is still allowed, without attribution", async () => {
  // Erasure is scoped to the account: the same browser may keep reacting as an
  // anonymous reader, and those rows carry no user_id.
  const env = makeEnv();
  const ana = await signIn(env.READER_DB, "ana");
  const del = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session }), env });
  assert.equal(del.status, 200);
  const res = await postReaction({
    request: req("/api/reader/reactions", { method: "POST", body: { post: POST, kind: "useful" } }),
    env,
  });
  assert.equal(res.status, 200);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM reactions WHERE user_id IS NULL"), 1);
});

test("a DELETE from another origin is refused and deletes nothing", async () => {
  // aifocus-oz2h: without the Origin check, a page on any other site could fire
  // this DELETE at a signed-in reader and erase the account. The refusal must
  // happen before any row is touched.
  const env = makeEnv();
  const { ana } = await seed(env);
  const res = await deleteAccount({
    request: req("/api/account", { method: "DELETE", session: ana.session, origin: "https://evil.example" }),
    env,
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "Forbidden");
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 1);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", ana.user.id), 1);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM annotations WHERE user_id = ?", ana.user.id), 1);
});

test("a foreign origin cannot even learn whether anyone is signed in", async () => {
  // The check runs before getSessionUser(), so a cross-origin probe gets 403
  // with no session and 403 with one - the responses are indistinguishable.
  const env = makeEnv();
  const { ana: withSession } = await seed(env);
  const foreign = (session) =>
    deleteAccount({ request: req("/api/account", { method: "DELETE", session, origin: "https://evil.example" }), env });
  const signedIn = await foreign(withSession.session);
  const anonymous = await foreign(undefined);
  assert.equal(signedIn.status, 403);
  assert.equal(anonymous.status, 403);
  assert.deepEqual(await signedIn.clone().json(), await anonymous.clone().json());
});

test("a DELETE with no Origin header is refused", async () => {
  // isSameOrigin() treats a missing Origin as foreign. Browsers send Origin on
  // a cross-site DELETE and on same-origin fetch DELETEs alike, so this only
  // rejects non-browser callers, which have no session cookie to abuse.
  const env = makeEnv();
  const { ana } = await seed(env);
  const res = await deleteAccount({ request: req("/api/account", { method: "DELETE", session: ana.session, origin: null }), env });
  assert.equal(res.status, 403);
  assert.equal(rowCount(env.READER_DB, "SELECT COUNT(*) AS n FROM users WHERE id = ?", ana.user.id), 1);
});
