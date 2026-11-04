// The per-IP cap and cache headers on GET /api/reader/state (aifocus-0cz).
// One post page view is a three-statement D1 batch; before the limiter an
// anonymous loop over one valid post slug drove it without limit.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import { onRequestGet as getState } from "../functions/api/reader/state.js";
import { READER_COOKIE, LIMITS, UNKNOWN_IP_BUCKET, hashIp, reserveReadEvent } from "../functions/_lib/reader.js";
import { SESSION_COOKIE, createSession, upsertIdentity } from "../functions/_lib/auth.js";

const migration = (name) => fileURLToPath(new URL(`../migrations/${name}`, import.meta.url));
const MIGRATIONS = ["0001_reader.sql", "0003_auth.sql", "0005_reaction_ip.sql", "0009_read_events.sql"].map(migration);
// The tree as it looks before migration 0009 has been applied.
const MIGRATIONS_PRE_LEDGER = ["0001_reader.sql", "0003_auth.sql", "0005_reaction_ip.sql"].map(migration);

const ORIGIN = "https://aifoc.us";
const POST = "/setting-goals/";
const READER_A = "a".repeat(32);

const makeEnv = (migrations = MIGRATIONS) => ({ READER_DB: createD1(migrations) });

function req({ post = POST, reader, session, ip = "203.0.113.7" } = {}) {
  const headers = new Headers();
  const cookies = [];
  if (reader) cookies.push(`${READER_COOKIE}=${reader}`);
  if (session) cookies.push(`${SESSION_COOKIE}=${session}`);
  if (cookies.length) headers.set("Cookie", cookies.join("; "));
  if (ip) headers.set("CF-Connecting-IP", ip);
  return new Request(`${ORIGIN}/api/reader/state?post=${encodeURIComponent(post)}`, { headers });
}

const call = (env, opts) => getState({ request: req(opts), env });

// Fill the ledger to the cap for one client IP, the way 600 page views would.
async function fillBudget(env, ip, count = LIMITS.readsPerHour) {
  // No client IP folds into the shared bucket, the same key the handler uses.
  const hash = (await hashIp(env.READER_DB, ip)) ?? UNKNOWN_IP_BUCKET;
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    await env.READER_DB.prepare("INSERT INTO read_events (ip_hash, created_at) VALUES (?, ?)")
      .bind(hash, now - i)
      .run();
  }
  return hash;
}

test("an anonymous response is briefly cacheable and identical across visitors", async () => {
  const env = makeEnv();
  const first = await call(env, { ip: "203.0.113.7" });
  const second = await call(env, { ip: "198.51.100.9" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const cache = first.headers.get("Cache-Control");
  assert.match(cache, /public/);
  assert.match(cache, /max-age=60/);
  assert.equal(first.headers.get("Vary"), "Cookie");
  assert.deepEqual(await first.json(), await second.json());
});

test("a reader-cookie response is personal and never stored", async () => {
  const env = makeEnv();
  const res = await call(env, { reader: READER_A });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
  assert.doesNotMatch(res.headers.get("Cache-Control"), /public/);
});

test("a signed-in response is personal and never stored", async () => {
  const env = makeEnv();
  const user = await upsertIdentity(env.READER_DB, {
    provider: "github", providerId: "4242", handle: "ana", name: "ANA",
  });
  const session = await createSession(env.READER_DB, user.id);
  const res = await call(env, { session });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
  assert.doesNotMatch(res.headers.get("Cache-Control"), /public/);
});

test("the cap trips per client IP and the over-budget request does no work", async () => {
  const env = makeEnv();
  await fillBudget(env, "203.0.113.7");
  const blocked = await call(env, { ip: "203.0.113.7" });
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Too many reader requests/);
  assert.match(blocked.headers.get("Cache-Control"), /no-store/);

  // Another client IP still reads.
  const other = await call(env, { ip: "198.51.100.9" });
  assert.equal(other.status, 200);
});

test("each accepted read records one ledger row", async () => {
  const env = makeEnv();
  const res = await call(env, { ip: "203.0.113.7" });
  assert.equal(res.status, 200);
  const hash = await hashIp(env.READER_DB, "203.0.113.7");
  const rows = env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM read_events WHERE ip_hash = ?").get(hash);
  assert.equal(Number(rows.n), 1);
});

test("a rejected post path costs no read budget", async () => {
  const env = makeEnv();
  const bad = await call(env, { post: "/a b/" });
  assert.equal(bad.status, 400);
  const rows = env.READER_DB.raw.prepare("SELECT COUNT(*) AS n FROM read_events").get();
  assert.equal(Number(rows.n), 0);
});

test("requests with no client IP share one bucket and are capped too", async () => {
  const env = makeEnv();
  await fillBudget(env, null);
  assert.equal((await call(env, { ip: null })).status, 429);
  assert.equal((await call(env, { ip: null })).status, 429);
});

test("the ledger prunes rows older than the two-hour window", async () => {
  const env = makeEnv();
  const hash = await hashIp(env.READER_DB, "203.0.113.7");
  await env.READER_DB.prepare("INSERT INTO read_events (ip_hash, created_at) VALUES (?, ?)")
    .bind(hash, Date.now() - 3 * 60 * 60 * 1000)
    .run();
  assert.equal((await call(env, { ip: "203.0.113.7" })).status, 200);
  const stale = env.READER_DB.raw
    .prepare("SELECT COUNT(*) AS n FROM read_events WHERE created_at <= ?")
    .get(Date.now() - 2 * 60 * 60 * 1000);
  assert.equal(Number(stale.n), 0);
});

test("before migration 0009 the endpoint serves but is still capped in-process", async () => {
  const env = makeEnv(MIGRATIONS_PRE_LEDGER);
  const ip = "198.51.100.42"; // this test's own window in the fallback map
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  const statuses = [];
  try {
    for (let i = 0; i < LIMITS.readsPerHour + 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      statuses.push((await call(env, { ip })).status);
    }
    // A different IP is unaffected by that window.
    statuses.push((await call(env, { ip: "198.51.100.43" })).status);
  } finally {
    console.error = original;
  }
  assert.equal(statuses.filter((s) => s === 200).length, LIMITS.readsPerHour + 1);
  assert.equal(statuses.filter((s) => s === 429).length, 5);
  assert.ok(statuses.at(-1) === 200, "another IP keeps reading");
  assert.ok(
    errors.some((line) => /read_events missing; apply D1 migration 0009/.test(line)),
    `expected the pre-migration warning, got: ${JSON.stringify(errors)}`,
  );
  // The warning is per isolate, not per request.
  assert.equal(errors.length, 1);
});

test("an over-budget pre-migration window recovers after the hour", async () => {
  // reserveReadEvent takes `now`, so the fallback window can be moved forward
  // without waiting.
  const env = makeEnv(MIGRATIONS_PRE_LEDGER);
  const ip = "198.51.100.44";
  const start = Date.now();
  for (let i = 0; i < LIMITS.readsPerHour; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await reserveReadEvent(env.READER_DB, await hashIp(env.READER_DB, ip), start), "ok");
  }
  const hash = await hashIp(env.READER_DB, ip);
  assert.equal(await reserveReadEvent(env.READER_DB, hash, start + 1000), "limited");
  assert.equal(await reserveReadEvent(env.READER_DB, hash, start + 60 * 60 * 1000 + 1), "ok");
});

test("a storage failure on the reservation fails closed, it does not serve unmetered", async () => {
  const broken = {
    prepare: () => ({ bind: () => ({ first: async () => ({ value: "salt" }), run: async () => ({}) }) }),
    batch: async () => {
      throw new Error("database is down");
    },
  };
  const res = await getState({ request: req({ ip: "203.0.113.90" }), env: { READER_DB: broken } });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /Reader state is unavailable/);
});
