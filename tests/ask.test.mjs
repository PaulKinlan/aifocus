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
