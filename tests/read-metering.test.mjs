// Regression guard for aifocus-pr7b: GET /api/account and GET /api/auth/me
// spend D1 on every call (a session join, an identities query, a
// four-statement account batch) and used to do it with no meter. Both now
// reserve the shared read_events budget before spending, the same
// reservation /api/reader/state made in aifocus-0cz: 429 when the budget is
// spent, 503 when the reservation itself errors (fail closed), and zero D1
// work in either case.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import { onRequestGet as getAccount } from "../functions/api/account.js";
import { onRequestGet as me } from "../functions/api/auth/me.js";
import { UNKNOWN_IP_BUCKET } from "../functions/_lib/reader.js";

const MIGRATIONS = fs
  .readdirSync(fileURLToPath(new URL("../migrations", import.meta.url)))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)));

const makeEnv = () => ({ READER_DB: createD1(MIGRATIONS) });

const get = (path) => new Request(`https://aifoc.us${path}`);

// A well-formed but unknown session token. getSessionUser only reaches the
// sessions join when the cookie passes its shape check, so sending this is
// what makes the join a real, observable statement - without it the
// cookie-less request does no session work in EITHER ordering, which is why
// status-only assertions could not see a meter-after-session-lookup
// regression (aifocus-ajvr).
const UNKNOWN_SESSION = `aifocus_session=${"a".repeat(43)}`;

// A recording wrapper around the real in-memory D1: identical behaviour,
// but every SQL string handed to prepare() is kept in `sqls` so a test can
// assert WHICH statements ran, not just what came back.
function recordingD1(db) {
  const sqls = [];
  return {
    db,
    sqls,
    prepare(sql) {
      sqls.push(sql);
      return db.prepare(sql);
    },
    async batch(statements) {
      return db.batch(statements);
    },
  };
}

// Fill the shared unknown-IP read bucket to the cap, so the next reservation
// comes back "limited". No CF-Connecting-IP header means every test request
// lands in UNKNOWN_IP_BUCKET.
async function exhaustReadBudget(db) {
  const now = Date.now();
  await db
    .prepare(
      `WITH RECURSIVE cnt(x) AS (
         SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 600
       )
       INSERT INTO read_events (ip_hash, created_at)
       SELECT ?1, ?2 FROM cnt`,
    )
    .bind(UNKNOWN_IP_BUCKET, now)
    .run();
}

test("GET /api/account: 429 once the shared read budget is spent, before any account work", async () => {
  const env = makeEnv();
  await exhaustReadBudget(env.READER_DB);
  const res = await getAccount({ request: get("/api/account"), env });
  assert.equal(res.status, 429);
});

test("GET /api/auth/me: 429 once the shared read budget is spent, before any session work", async () => {
  const env = makeEnv();
  await exhaustReadBudget(env.READER_DB);
  // Status alone cannot pin the ordering: a cookie-less request answers 429
  // whether or not the session join already ran. Send a valid-shaped token
  // and watch the statements instead - a mutant that meters after
  // getSessionUser records the sessions join here and fails the last assert.
  const request = new Request("https://aifoc.us/api/auth/me", {
    headers: { Cookie: UNKNOWN_SESSION },
  });
  const recorded = recordingD1(env.READER_DB);
  env.READER_DB = recorded;
  const res = await me({ request, env });
  assert.equal(res.status, 429);
  // The recorder is not deaf: the reservation itself must be among the
  // statements, otherwise the assertion below would pass on an empty log.
  assert.ok(
    recorded.sqls.some((sql) => /read_events/i.test(sql)),
    `the read reservation must appear in the executed statements: ${recorded.sqls.join(" | ")}`,
  );
  assert.deepEqual(
    recorded.sqls.filter((sql) => /\bsessions\b|\bidentities\b/i.test(sql)),
    [],
    `session or identity D1 work ran despite the spent budget: ${recorded.sqls.join(" | ")}`,
  );
});

test("GET /api/account: a reservation error fails closed with 503, not an unmetered read", async () => {
  const env = {
    READER_DB: {
      // batch throws a non-missing-table error, so reserveReadEvent returns
      // "error" rather than falling back to the in-memory cap.
      batch: async () => {
        throw new Error("d1 unavailable");
      },
      prepare() {
        throw new Error("d1 unavailable");
      },
    },
  };
  const res = await getAccount({ request: get("/api/account"), env });
  assert.equal(res.status, 503);
});

test("GET /api/auth/me: a reservation error fails closed with 503", async () => {
  const env = {
    READER_DB: {
      batch: async () => {
        throw new Error("d1 unavailable");
      },
      prepare() {
        throw new Error("d1 unavailable");
      },
    },
  };
  // The valid-shaped token keeps this test meter-order-sensitive too: with a
  // cookie, a mutant that runs getSessionUser before the reservation makes
  // the sessions join hit the throwing db and rejects - not a 503 - so the
  // test fails instead of silently passing on the wrong order.
  const request = new Request("https://aifoc.us/api/auth/me", {
    headers: { Cookie: UNKNOWN_SESSION },
  });
  const res = await me({ request, env });
  assert.equal(res.status, 503);
});

test("GET /api/auth/me: with no READER_DB binding there is no D1 work to meter, and the providers list still answers", async () => {
  const res = await me({ request: get("/api/auth/me"), env: {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user, null);
  assert.ok(Array.isArray(body.providers));
});

test("GET /api/auth/me: a normal request stays 200 and spends exactly one read slot", async () => {
  const env = makeEnv();
  const res = await me({ request: get("/api/auth/me"), env });
  assert.equal(res.status, 200);
  const row = await env.READER_DB.prepare(
    "SELECT COUNT(*) AS n FROM read_events WHERE ip_hash = ?",
  )
    .bind(UNKNOWN_IP_BUCKET)
    .first();
  assert.equal(row.n, 1);
});
