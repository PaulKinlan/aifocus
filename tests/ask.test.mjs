import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { onRequestPost as postAsk, SYSTEM_PROMPT } from "../functions/api/ask.js";
import { searchChunks, askArchive, extractChunks, INSTANCE_NAME } from "../functions/_lib/ai-search.js";

const MIGRATIONS = ["0001_reader.sql", "0002_ask_log.sql"].map((f) =>
  fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)),
);
const ORIGIN = "https://aifoc.us";
const ARTICLES = [{ title: "setting goals", url: `${ORIGIN}/setting-goals/`, date: "2026-10-25", summary: "s" }];

function makeDb() {
  const db = createD1(MIGRATIONS[0]);
  db.raw.exec(readFileSync(MIGRATIONS[1], "utf8"));
  return db;
}

function makeEnv({ ask } = {}) {
  return {
    READER_DB: makeDb(),
    ASSETS: { fetch: async () => new Response(JSON.stringify({ articles: ARTICLES })) },
    AI: {
      autorag: (name) => ({
        aiSearch: ask ?? (async () => ({
          response: "Goals give the agent an end state.",
          data: [{ filename: "aifoc.us/setting-goals/", score: 0.9, content: [{ text: "goal text" }] }],
        })),
      }),
    },
  };
}

const askReq = (question, origin = ORIGIN, ip = "198.51.100.1") => {
  const headers = { "Content-Type": "application/json", Origin: origin };
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request(`${ORIGIN}/api/ask`, { method: "POST", headers, body: JSON.stringify({ question }) });
};

test("ask: fails closed when READER_DB is unbound - no inference runs", async () => {
  // aifocus-5ft: a missing binding must disable the billed endpoint, not
  // serve it unmetered. Zero AI invocations, 503, short cache.
  let calls = 0;
  const env = makeEnv({
    ask: async () => {
      calls += 1;
      return { response: "should never run", data: [] };
    },
  });
  delete env.READER_DB;
  const res = await postAsk({ request: askReq("what is this essay about"), env });
  assert.equal(res.status, 503);
  assert.equal(calls, 0, "the billed inference must not run without a binding");
  assert.match(res.headers.get("Cache-Control") ?? "", /max-age=30/);
  const body = await res.json();
  assert.match(body.error, /unavailable/i);
});

test("ask: fails closed when the rate-limit query errors", async () => {
  let calls = 0;
  const env = makeEnv({
    ask: async () => {
      calls += 1;
      return { response: "should never run", data: [] };
    },
  });
  env.READER_DB = {
    prepare: () => {
      throw new Error("d1 unavailable");
    },
  };
  const res = await postAsk({ request: askReq("what is this essay about"), env });
  assert.equal(res.status, 503);
  assert.equal(calls, 0, "a limiter error must not open the billed path");
});

test("ask: ALLOW_UNMETERED_ASK=1 keeps local/dev working without a binding", async () => {
  // The deliberate dev escape hatch: explicit flag AND a non-production
  // origin, never an accident of a missing binding.
  let calls = 0;
  const env = makeEnv({
    ask: async () => {
      calls += 1;
      return { response: "Goals give the agent an end state.", data: [{ filename: "aifoc.us/setting-goals/", score: 0.9, content: [{ text: "goal text" }] }] };
    },
  });
  delete env.READER_DB;
  env.ALLOW_UNMETERED_ASK = "1";
  // A genuine local request: URL and Origin both non-production (askReq
  // hardcodes the production URL, so build this one by hand).
  const req = new Request("http://localhost:8788/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8788", "CF-Connecting-IP": "198.51.100.1" },
    body: JSON.stringify({ question: "what is this essay about" }),
  });
  const res = await postAsk({ request: req, env });
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
});

test("ask: ALLOW_UNMETERED_ASK is ignored on the production origin", async () => {
  // aifocus-e7e: the flag is a dev escape hatch, not a production switch -
  // on https://aifoc.us it must not open the unmetered path.
  let calls = 0;
  const env = makeEnv({
    ask: async () => {
      calls += 1;
      return { response: "should never run", data: [] };
    },
  });
  delete env.READER_DB;
  env.ALLOW_UNMETERED_ASK = "1";
  const res = await postAsk({ request: askReq("what is this essay about", ORIGIN), env });
  assert.equal(res.status, 503);
  assert.equal(calls, 0, "the billed inference must not run on production, flag or not");
});

test("ask: ALLOW_UNMETERED_ASK is ignored on a preview origin (aifocus-4hu1)", async () => {
  // aifocus-4hu1: "not production" was the wrong gate - pages previews and
  // staging inherit production vars by default, so a retained flag plus an
  // unbound READER_DB made any public preview URL an unmetered billed
  // endpoint. The hatch is loopback-only now; every other origin fails closed
  // with 503 and zero inference calls.
  let calls = 0;
  const env = makeEnv({
    ask: async () => {
      calls += 1;
      return { response: "should never run", data: [] };
    },
  });
  delete env.READER_DB;
  env.ALLOW_UNMETERED_ASK = "1";
  for (const host of ["abc123.aifocus.pages.dev", "staging.aifoc.us", "aifocus-preview.example.com"]) {
    const res = await postAsk({
      request: new Request(`https://${host}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `https://${host}`, "CF-Connecting-IP": "198.51.100.1" },
        body: JSON.stringify({ question: "why set goals" }),
      }),
      env,
    });
    assert.equal(res.status, 503, `${host} must fail closed`);
    assert.equal(calls, 0, `${host} must not reach the billed call`);
  }
});

test("ask: ALLOW_UNMETERED_ASK still works on loopback forms of local dev", async () => {
  // The hatch keeps working for real local dev: localhost, 127.0.0.1, [::1]
  // and *.localhost all pass; a non-loopback lookalike does not.
  for (const [host, ok] of [["127.0.0.1", true], ["[::1]", true], ["dashboard.localhost", true], ["evil.example", false]]) {
    let calls = 0;
    const env = makeEnv({
      ask: async () => {
        calls += 1;
        return { response: "ok", data: [] };
      },
    });
    delete env.READER_DB;
    env.ALLOW_UNMETERED_ASK = "1";
    const res = await postAsk({
      request: new Request(`http://${host}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `http://${host}`, "CF-Connecting-IP": "198.51.100.1" },
        body: JSON.stringify({ question: "why set goals" }),
      }),
      env,
    });
    assert.equal(res.status, ok ? 200 : 503, `${host} expected ${ok ? "200" : "503"}`);
    assert.equal(calls, ok ? 1 : 0, `${host} inference calls`);
  }
});

test("ask: concurrent distinct questions from one IP are capped at the per-IP budget", async () => {
  // Second 5ft-round defect: the limiter was check-then-act - isRateLimited
  // counted ask_log and the INSERT happened after the inference await, so a
  // concurrent burst of DISTINCT questions (which caches.default does not
  // dedupe) all read the same pre-insert count. The reservation is now an
  // atomic conditional INSERT: with inference slowed to 30 ms, 40 concurrent
  // distinct questions from one IP must admit at most 20, and ask_log must
  // hold exactly the admitted set.
  let calls = 0;
  const env = makeEnv({
    ask: async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return { response: "Goals give the agent an end state.", data: [{ filename: "aifoc.us/setting-goals/", score: 0.9, content: [{ text: "goal text" }] }] };
    },
  });
  const fire = (i) => postAsk({ request: askReq(`distinct question ${i} about the archive`), env });
  const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => fire(i)));
  const answered = responses.filter((r) => r.status === 200).length;
  const limited = responses.filter((r) => r.status === 429).length;
  assert.equal(answered + limited, 40);
  assert.ok(answered <= 20, `${answered} billed answers exceeded the per-IP budget of 20`);
  const rows = await env.READER_DB.prepare("SELECT COUNT(*) AS n FROM ask_log").first();
  assert.equal(rows.n, answered, "ask_log holds exactly the billed requests");
  assert.equal(calls, answered);
});

test("ask: returns the generated answer with essay sources", async () => {
  const calls = [];
  const env = makeEnv({
    ask: async (opts) => {
      calls.push(opts);
      return {
        response: "Goals give the agent an end state.",
        data: [{ filename: "aifoc.us/setting-goals/", score: 0.9, content: [{ text: "goal text" }] }],
      };
    },
  });
  const res = await postAsk({ request: askReq("  why set goals? "), env });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.question, "why set goals?");
  assert.equal(body.answer, "Goals give the agent an end state.");
  assert.deepEqual(body.sources.map((s) => s.url), [`${ORIGIN}/setting-goals/`]);
  assert.equal(calls[0].system_prompt, SYSTEM_PROMPT);
});

test("ask: validates input and origin", async () => {
  const env = makeEnv();
  assert.equal((await postAsk({ request: askReq("hi"), env })).status, 400);
  assert.equal((await postAsk({ request: askReq("why set goals?", "https://evil.example"), env })).status, 403);
});

test("ask: rate limited per client IP", async () => {
  const env = makeEnv();
  let res;
  for (let i = 0; i < 21; i += 1) res = await postAsk({ request: askReq(`question number ${i}`), env });
  assert.equal(res.status, 429);
});

test("ask: a missing client IP still shares a rate-limit bucket", async () => {
  const env = makeEnv();
  let res;
  for (let i = 0; i < 21; i += 1) res = await postAsk({ request: askReq(`question number ${i}`, ORIGIN, null), env });
  assert.equal(res.status, 429);
});

test("ask: 503 when generation fails, 502 when it returns nothing", async () => {
  const quiet = console.error;
  const warn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    let env = makeEnv({ ask: async () => { throw new Error("down"); } });
    assert.equal((await postAsk({ request: askReq("why set goals?"), env })).status, 503);
    env = makeEnv({ ask: async () => ({ response: "", data: [] }) });
    assert.equal((await postAsk({ request: askReq("why set goals?"), env })).status, 502);
  } finally {
    console.error = quiet;
    console.warn = warn;
  }
});

test("ai-search: prefers the namespace binding and uses the current request shape", async () => {
  const calls = [];
  const env = {
    AI_SEARCH: {
      get: (name) => ({
        search: async (opts) => {
          calls.push({ name, opts });
          return { chunks: [{ text: "t", score: 0.5, item: { key: "https://aifoc.us/a/" } }] };
        },
      }),
    },
    AI: { autorag: () => { throw new Error("should not be used"); } },
  };
  const out = await searchChunks(env, "q", 5);
  assert.equal(out.via, "binding");
  assert.equal(calls[0].name, INSTANCE_NAME);
  assert.deepEqual(calls[0].opts.messages, [{ role: "user", content: "q" }]);
  assert.equal(out.chunks[0].key, "https://aifoc.us/a/");
});

test("ai-search: falls back to the public endpoint when bindings fail", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, body: JSON.parse(init.body) });
      if (url.endsWith("/search")) {
        return new Response(JSON.stringify({ success: true, result: { chunks: [{ text: "x", score: 1, item: { key: "aifoc.us/b/" } }] } }));
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }], chunks: [] }));
    };
    const env = {
      AI: { autorag: () => ({ search: async () => { throw new Error("binding gone"); }, aiSearch: async () => { throw new Error("binding gone"); } }) },
      AI_SEARCH_PUBLIC_URL: "https://example.search.ai.cloudflare.com/",
    };
    const found = await searchChunks(env, "q", 3, { fetchImpl });
    assert.equal(found.via, "public-endpoint");
    assert.equal(found.chunks[0].key, "aifoc.us/b/");
    assert.equal(seen[0].url, "https://example.search.ai.cloudflare.com/search");
    const answered = await askArchive(env, "q", "sys", 3, { fetchImpl });
    assert.equal(answered.answer, "answer");
    assert.equal(seen[1].body.messages[0].content, "sys");
  } finally {
    console.warn = warn;
  }
});

test("ai-search: errors when nothing is configured; ignores non-https public URLs", async () => {
  await assert.rejects(searchChunks({}, "q", 3), /No AI Search/);
  await assert.rejects(searchChunks({ AI_SEARCH_PUBLIC_URL: "http://insecure" }, "q", 3), /No AI Search/);
  assert.deepEqual(extractChunks({ result: { data: [] } }), []);
});

test("ai-search: a strategy that does not answer in time is skipped", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const env = {
      AI: { autorag: () => ({ search: () => new Promise(() => {}) }) },
      AI_SEARCH_PUBLIC_URL: "https://example.search.ai.cloudflare.com",
    };
    const fetchImpl = async () =>
      new Response(JSON.stringify({ chunks: [{ text: "x", score: 1, item: { key: "aifoc.us/c/" } }] }));
    const found = await searchChunks(env, "q", 3, { fetchImpl, timeoutMs: 20 });
    assert.equal(found.via, "public-endpoint");
    assert.equal(found.chunks[0].key, "aifoc.us/c/");
  } finally {
    console.warn = warn;
  }
});
