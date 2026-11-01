import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import {
  onRequestGet,
  INSTANCE_NAME,
  MAX_QUERY_LENGTH,
  MAX_LIMIT,
  SEARCHES_PER_HOUR,
  reserveSearchSlot,
  normalizeQuery,
  parseLimit,
  keyToPath,
  extractChunks,
  toSnippet,
  stripMarkdown,
  indexByPath,
  rankArticles,
} from "../functions/api/search.js";

const MIGRATIONS = ["0001_reader.sql", "0007_search_log.sql"].map((f) =>
  fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)),
);

function makeDb() {
  const db = createD1(MIGRATIONS[0]);
  db.raw.exec(readFileSync(MIGRATIONS[1], "utf8"));
  return db;
}

const ARTICLES = [
  { title: "setting goals", url: "https://aifoc.us/setting-goals/", date: "2026-10-25", summary: "goals" },
  { title: "the model gap", url: "https://aifoc.us/the-model-gap/", date: "2026-05-01", summary: "gap" },
];

test("normalizeQuery: trims, collapses whitespace, strips control chars, caps length", () => {
  assert.equal(normalizeQuery("  agent \n\t loops  "), "agent loops");
  assert.equal(normalizeQuery("a\x00b"), "a b");
  assert.equal(normalizeQuery(null), "");
  assert.equal(normalizeQuery("x".repeat(500)).length, MAX_QUERY_LENGTH);
});

test("normalizeQuery: never splits a surrogate pair or keeps a lone surrogate", () => {
  const atBoundary = normalizeQuery("x".repeat(MAX_QUERY_LENGTH - 1) + "😀😀");
  assert.equal(Array.from(atBoundary).length, MAX_QUERY_LENGTH);
  assert.ok(atBoundary.endsWith("😀"));
  assert.doesNotThrow(() => encodeURIComponent(atBoundary));
  assert.equal(normalizeQuery("a\ud800b"), "ab");
  assert.doesNotThrow(() => encodeURIComponent(normalizeQuery("\udc00".repeat(5) + "q")));
});

test("onRequestGet: emoji at the length limit still returns JSON", async () => {
  const res = await onRequestGet({
    request: new Request("https://aifoc.us/api/search?q=" + encodeURIComponent("x".repeat(MAX_QUERY_LENGTH - 1) + "😀")),
    env: makeEnv({ searchResult: { chunks: [] } }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).count, 0);
});

test("parseLimit: defaults and clamps", () => {
  assert.equal(parseLimit(null), 10);
  assert.equal(parseLimit("0"), 10);
  assert.equal(parseLimit("abc"), 10);
  assert.equal(parseLimit("5"), 5);
  assert.equal(parseLimit("999"), MAX_LIMIT);
});

test("keyToPath: reduces crawled keys to comparable paths", () => {
  assert.equal(keyToPath("https://aifoc.us/setting-goals/"), "/setting-goals/");
  assert.equal(keyToPath("https://aifoc.us/setting-goals"), "/setting-goals/");
  assert.equal(keyToPath("aifoc.us/setting-goals/index.html"), "/setting-goals/");
  assert.equal(keyToPath("/the-model-gap/index.md"), "/the-model-gap/");
  assert.equal(keyToPath(""), null);
  assert.equal(keyToPath(undefined), null);
});

test("extractChunks: reads both AI Search and AutoRAG response shapes", () => {
  assert.deepEqual(
    extractChunks({ chunks: [{ text: "t", score: 0.5, item: { key: "https://aifoc.us/a/" } }] }),
    [{ key: "https://aifoc.us/a/", score: 0.5, text: "t" }],
  );
  assert.deepEqual(
    extractChunks({ data: [{ filename: "aifoc.us/b/", score: 0.7, content: [{ text: "x" }, { text: "y" }] }] }),
    [{ key: "aifoc.us/b/", score: 0.7, text: "x y" }],
  );
  assert.deepEqual(extractChunks(null), []);
  assert.deepEqual(extractChunks({}), []);
});

test("toSnippet: strips markdown punctuation and cuts on a word boundary", () => {
  assert.equal(toSnippet("## Heading\n\n**bold** text"), "Heading bold text");
  const long = toSnippet("word ".repeat(200));
  assert.ok(long.length <= 281);
  assert.ok(long.endsWith("…"));
});

test("rankArticles: one result per essay, best chunk wins, non-essays dropped", () => {
  const chunks = [
    { key: "https://aifoc.us/the-model-gap/", score: 0.4, text: "low" },
    { key: "https://aifoc.us/setting-goals/", score: 0.6, text: "goals chunk" },
    { key: "https://aifoc.us/the-model-gap/", score: 0.9, text: "high" },
    { key: "https://aifoc.us/posts/", score: 0.99, text: "archive" },
    { key: "https://aifoc.us/model-drops.html", score: 0.95, text: "demo" },
  ];
  const results = rankArticles(chunks, indexByPath(ARTICLES), 10);
  assert.deepEqual(results.map((r) => r.url), [
    "https://aifoc.us/the-model-gap/",
    "https://aifoc.us/setting-goals/",
  ]);
  assert.equal(results[0].snippet, "high");
  assert.equal(results[0].title, "the model gap");
  assert.equal(rankArticles(chunks, indexByPath(ARTICLES), 1).length, 1);
});

function makeEnv({ searchResult, searchError, calls = [], db } = {}) {
  return {
    READER_DB: db !== undefined ? db : makeDb(),
    ASSETS: {
      fetch: async (req) => {
        assert.equal(new URL(req.url).pathname, "/index.json");
        return new Response(JSON.stringify({ articles: ARTICLES }));
      },
    },
    AI: {
      autorag: (name) => ({
        search: async (opts) => {
          calls.push({ name, opts });
          if (searchError) throw searchError;
          return searchResult;
        },
      }),
    },
  };
}

test("onRequestGet: 400 without a query", async () => {
  const res = await onRequestGet({ request: new Request("https://aifoc.us/api/search"), env: makeEnv() });
  assert.equal(res.status, 400);
});

test("onRequestGet: queries the aifocus-search instance and returns essays", async () => {
  const calls = [];
  const env = makeEnv({
    calls,
    searchResult: { chunks: [{ text: "about goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
  });
  const res = await onRequestGet({
    request: new Request("https://aifoc.us/api/search?q=%20agent%20goals%20&limit=3"),
    env,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.query, "agent goals");
  assert.equal(body.source, "ai-search");
  assert.equal(body.count, 1);
  assert.equal(body.results[0].url, "https://aifoc.us/setting-goals/");
  assert.equal(calls[0].name, INSTANCE_NAME);
  assert.equal(calls[0].opts.query, "agent goals");
  assert.match(res.headers.get("cache-control"), /s-maxage=/);
});

test("onRequestGet: 503 with no-store when the search call fails", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = await onRequestGet({
      request: new Request("https://aifoc.us/api/search?q=goals"),
      env: makeEnv({ searchError: new Error("boom") }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("cache-control"), "no-store");
  } finally {
    console.error = original;
  }
});

test("onRequestGet: 503 when the AI binding is missing", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const env = makeEnv();
    delete env.AI;
    const res = await onRequestGet({ request: new Request("https://aifoc.us/api/search?q=goals"), env });
    assert.equal(res.status, 503);
  } finally {
    console.error = original;
  }
});

test("stripMarkdown: removes links, images, emphasis, headings, lists, tables, code and HTML", () => {
  const md = [
    "---", "title: x", "---",
    "## Where agents run", "",
    "See [the post](https://aifoc.us/a/) and ![img](/i.png) **bold**, _italic_ and `code`.",
    "- item one", "1. item two", "> quoted",
    "| a | b |", "|---|---|", "| 1 | 2 |",
    '<div class="x">html</div> https://example.com/x snake_case_name 2*3*4',
  ].join("\n");
  assert.equal(
    stripMarkdown(md),
    "Where agents run See the post and bold, italic and code. item one item two quoted a b 1 2 html snake_case_name 2*3*4",
  );
  assert.equal(stripMarkdown(""), "");
  assert.equal(toSnippet("[link text](https://x.y/)"), "link text");
});

test("onRequestGet: rate limited per client IP on uncached queries", async () => {
  const db = makeDb();
  const env = makeEnv({
    db,
    searchResult: { chunks: [{ text: "goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
  });

  let res;
  for (let i = 0; i < SEARCHES_PER_HOUR; i += 1) {
    res = await onRequestGet({
      request: new Request(`https://aifoc.us/api/search?q=query${i}`, {
        headers: { "CF-Connecting-IP": "198.51.100.1" },
      }),
      env,
    });
    assert.equal(res.status, 200, `query ${i} failed`);
  }

  // Next query from same IP is rate limited
  res = await onRequestGet({
    request: new Request("https://aifoc.us/api/search?q=query_exceeded", {
      headers: { "CF-Connecting-IP": "198.51.100.1" },
    }),
    env,
  });
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.match(body.error, /Too many searches/);

  // Different IP is not rate limited
  const otherRes = await onRequestGet({
    request: new Request("https://aifoc.us/api/search?q=query_exceeded", {
      headers: { "CF-Connecting-IP": "198.51.100.2" },
    }),
    env,
  });
  assert.equal(otherRes.status, 200);
});

test("onRequestGet: rate limit trips under concurrency (fire 40 at once, count accepted)", async () => {
  const db = makeDb();
  const env = makeEnv({
    db,
    searchResult: { chunks: [{ text: "goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
  });

  const promises = Array.from({ length: 40 }, (_, i) =>
    onRequestGet({
      request: new Request(`https://aifoc.us/api/search?q=burst_query_${i}`, {
        headers: { "CF-Connecting-IP": "198.51.100.50" },
      }),
      env,
    }),
  );

  const responses = await Promise.all(promises);
  const statuses = responses.map((r) => r.status);
  const accepted = statuses.filter((s) => s === 200).length;
  const limited = statuses.filter((s) => s === 429).length;

  assert.equal(accepted, SEARCHES_PER_HOUR, "exactly SEARCHES_PER_HOUR concurrent requests allowed");
  assert.equal(limited, 40 - SEARCHES_PER_HOUR, "remaining concurrent requests rejected with 429");
});

test("onRequestGet: requests with missing IP share the unknown-IP bucket and are rate limited", async () => {
  const db = makeDb();
  const env = makeEnv({
    db,
    searchResult: { chunks: [{ text: "goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
  });

  for (let i = 0; i < SEARCHES_PER_HOUR; i += 1) {
    const res = await onRequestGet({
      request: new Request(`https://aifoc.us/api/search?q=no_ip_${i}`),
      env,
    });
    assert.equal(res.status, 200);
  }

  const overflow = await onRequestGet({
    request: new Request("https://aifoc.us/api/search?q=no_ip_overflow"),
    env,
  });
  assert.equal(overflow.status, 429);
});

test("onRequestGet: failing D1 read or missing database fails closed (must deny, not allow)", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    // 1. Missing READER_DB fails closed
    const envNoDb = makeEnv({
      db: null,
      searchResult: { chunks: [{ text: "goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
    });
    const resNoDb = await onRequestGet({
      request: new Request("https://aifoc.us/api/search?q=some_query", {
        headers: { "CF-Connecting-IP": "198.51.100.1" },
      }),
      env: envNoDb,
    });
    assert.equal(resNoDb.status, 503, "missing DB must deny");

    // 2. Erroring D1 read fails closed
    const errorDb = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            throw new Error("D1 read error");
          },
        };
      },
      async batch() {
        throw new Error("D1 batch failed");
      },
    };
    const envErrorDb = makeEnv({
      db: errorDb,
      searchResult: { chunks: [{ text: "goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
    });
    const resError = await onRequestGet({
      request: new Request("https://aifoc.us/api/search?q=some_query", {
        headers: { "CF-Connecting-IP": "198.51.100.1" },
      }),
      env: envErrorDb,
    });
    assert.equal(resError.status, 503, "D1 error must deny");
  } finally {
    console.error = original;
  }
});

test("onRequestGet: denied requests insert nothing - 100 sequential calls insert at most limit rows and concurrent burst does not exceed it", async () => {
  const db = makeDb();
  const env = makeEnv({
    db,
    searchResult: { chunks: [{ text: "goals", score: 0.8, item: { key: "https://aifoc.us/setting-goals/" } }] },
  });

  // 1. 100 sequential calls from same IP
  const sequentialIp = "198.51.100.99";
  let acceptedSeq = 0;
  let deniedSeq = 0;
  for (let i = 0; i < 100; i += 1) {
    const res = await onRequestGet({
      request: new Request(`https://aifoc.us/api/search?q=sequential_${i}`, {
        headers: { "CF-Connecting-IP": sequentialIp },
      }),
      env,
    });
    if (res.status === 200) acceptedSeq += 1;
    else if (res.status === 429) deniedSeq += 1;
  }
  assert.equal(acceptedSeq, SEARCHES_PER_HOUR, "exactly SEARCHES_PER_HOUR accepted sequentially");
  assert.equal(deniedSeq, 100 - SEARCHES_PER_HOUR, "remaining 70 rejected with 429");

  // Verify rows in search_log for sequentialIp: MUST be exactly SEARCHES_PER_HOUR, not 100!
  const seqRows = await db
    .prepare("SELECT COUNT(*) AS n FROM search_log")
    .first();
  assert.equal(seqRows.n, SEARCHES_PER_HOUR, "denied calls did not insert any rows");

  // 2. Concurrent burst of 50 requests from a new IP
  const burstIp = "198.51.100.100";
  const promises = Array.from({ length: 50 }, (_, i) =>
    onRequestGet({
      request: new Request(`https://aifoc.us/api/search?q=burst_concurrent_${i}`, {
        headers: { "CF-Connecting-IP": burstIp },
      }),
      env,
    }),
  );
  await Promise.all(promises);

  // Total rows in DB across both IPs: exactly 2 * SEARCHES_PER_HOUR
  const totalRows = await db
    .prepare("SELECT COUNT(*) AS n FROM search_log")
    .first();
  assert.equal(totalRows.n, 2 * SEARCHES_PER_HOUR, "burst did not insert more rows than the limit");
});

test("reserveSearchSlot prunes expired rows older than 1 hour and prevents table from growing past the window", async () => {
  const db = makeDb();
  const now = Date.now();
  const expiredTime = now - 2 * 60 * 60 * 1000;

  for (let i = 0; i < 10; i++) {
    await db.prepare("INSERT INTO search_log (ip_hash, created_at) VALUES (?, ?)").bind(`expired_ip_${i}`, expiredTime).run();
  }

  const preCount = await db.prepare("SELECT COUNT(*) AS n FROM search_log").first();
  assert.equal(preCount.n, 10, "10 expired rows seeded");

  const allowed = await reserveSearchSlot(db, "active_ip", now);
  assert.equal(allowed, true);

  const postCount = await db.prepare("SELECT COUNT(*) AS n FROM search_log").first();
  assert.equal(postCount.n, 1, "expired rows were pruned, table bounded");
});

test("48h of reservations for one IP stays strictly bounded by the window (at most SEARCHES_PER_HOUR rows)", async () => {
  const db = makeDb();
  const baseTime = Date.now();
  const hourMs = 60 * 60 * 1000;
  const ip = "198.51.100.200";

  // Simulate 48 consecutive hours, each hour making 30 reservations (total 1,440 attempts)
  for (let hour = 0; hour < 48; hour++) {
    const t = baseTime + hour * hourMs;
    for (let i = 0; i < SEARCHES_PER_HOUR; i++) {
      const allowed = await reserveSearchSlot(db, ip, t + i * 1000);
      assert.equal(allowed, true);
    }
  }

  // At the end of 48h (1,440 reservations made), the table contains only the rows from the last hour!
  const count = await db.prepare("SELECT COUNT(*) AS n FROM search_log WHERE ip_hash = ?").bind(ip).first();
  assert.equal(count.n, SEARCHES_PER_HOUR, "table contains only active window rows (30), not 48h history (1,440)");
});

