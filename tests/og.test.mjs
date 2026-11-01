import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import {
  pagePathFromSegments,
  cardVersion,
  hasFixedHook,
  fillHook,
  cleanHook,
  r2Key,
  hookTag,
  writeHook,
  serveCard,
  HOOK_MAX_CHARS,
  OG_RENDERS_PER_HOUR,
  reserveOgSlot,
  _inFlightRenders,
  _inFlightReservations,
  _recentRenders,
  _setRenderTimeoutMs,
} from "../functions/_lib/og.js";
import { onRequestGet as getOg, onRequestPost as postOg } from "../functions/api/admin/og.js";
import { resetAccessCache } from "../functions/_lib/access.js";
import { hashIp } from "../functions/_lib/reader.js";

const ORIGIN = "https://aifoc.us";
const PAGE = "/agent-do-my-agent-loop/";
const MIGRATIONS = ["0001_reader.sql", "0004_og_hooks.sql", "0007_search_log.sql"].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)));

// Shaped like the minified Hugo output of layouts/page.ogcard.html.
const CARD = `<!doctype html><html><head><meta name=og-card-version content="d6cf95e357"></head>
<body><main><h1 class=title id=title>agent-do: my agent loop</h1><p class=hook id=hook data-og-hook></p></main></body></html>`;
const CARD_FIXED = CARD.replace("<p class=hook id=hook data-og-hook></p>", "<p class=hook id=hook data-fixed>Set in front matter</p>");

function makeBucket() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? { body: store.get(key) } : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async list({ prefix }) {
      return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
    async delete(keys) {
      for (const k of [keys].flat()) store.delete(k);
    },
  };
}

function makeEnv({ card = CARD, ai, browser } = {}) {
  _recentRenders?.clear();
  _inFlightRenders?.clear();
  _inFlightReservations?.clear();
  const calls = { ai: 0, screenshots: [] };
  const env = {
    READER_DB: createD1(MIGRATIONS),
    OG_CARDS: makeBucket(),
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req.url).pathname;
        if (path === `${PAGE}og-card.html` && card) return new Response(card);
        if (path === `${PAGE}index.md`) return new Response("---\ntitle: x\n---\nThe same loop runs every project.");
        if (path === "/index.json") {
          return new Response(JSON.stringify({ articles: [{ url: `${ORIGIN}${PAGE}`, title: "agent-do: my agent loop\n", date: "2026-05-01" }] }));
        }
        return new Response("not found", { status: 404 });
      },
    },
    AI: {
      run: async (model, input) => {
        calls.ai++;
        calls.aiInput = input;
        if (ai) return ai(model, input);
        return { response: '"One agent loop now runs emaila.gent, mix.email and a dozen other tools."' };
      },
    },
    BROWSER: {
      quickAction: async (action, options) => {
        calls.screenshots.push({ action, options });
        if (browser) return browser(action, options);
        return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
      },
    },
  };
  return { env, calls };
}

const run = async (env, segments = ["agent-do-my-agent-loop.png"]) => {
  const pending = [];
  const res = await serveCard({
    request: new Request(`${ORIGIN}/og/${segments.join("/")}?v=whatever`),
    env,
    segments,
    waitUntil: (p) => pending.push(p),
  });
  await Promise.all(pending);
  return res;
};

test("pagePathFromSegments maps /og/<path>.png to the page path and rejects anything else", () => {
  assert.equal(pagePathFromSegments(["agent-do-my-agent-loop.png"]), "/agent-do-my-agent-loop/");
  assert.equal(pagePathFromSegments(["training", "intro.png"]), "/training/intro/");
  assert.equal(pagePathFromSegments(["agent-do.jpg"]), null);
  assert.equal(pagePathFromSegments([".png"]), null);
  assert.equal(pagePathFromSegments(["..", "x.png"]), null);
  assert.equal(pagePathFromSegments(["a", "b", "c", "d.png"]), null);
  assert.equal(pagePathFromSegments([]), null);
});

test("card page helpers: version, fixed hook, escaping", () => {
  assert.equal(cardVersion(CARD), "d6cf95e357");
  assert.equal(cardVersion("<html></html>"), null);
  assert.equal(hasFixedHook(CARD), false);
  assert.equal(hasFixedHook(CARD_FIXED), true);
  const filled = fillHook(CARD, `<img src=x onerror="alert(1)"> & more`);
  assert.match(filled, /data-og-hook>&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; more<\/p>/);
  assert.equal(fillHook(CARD, ""), CARD);
});

test("cleanHook keeps one plain line within the length limit", () => {
  assert.equal(cleanHook('"Quoted line."\nSecond line'), "Quoted line.");
  assert.equal(cleanHook("Hook: <b>bold</b> claim"), "bold claim");
  const long = cleanHook("word ".repeat(80));
  assert.ok(long.length <= HOOK_MAX_CHARS, `got ${long.length}`);
  assert.ok(long.endsWith("…"));
  assert.equal(cleanHook(undefined), "");
});

test("first request renders with a Workers AI hook, stores it in D1 and R2; later requests use R2", async () => {
  const { env, calls } = makeEnv();
  let res = await run(env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/png");
  assert.equal(res.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.ai, 1);
  assert.match(calls.aiInput.messages[1].content, /^Title: agent-do: my agent loop/);
  assert.doesNotMatch(calls.aiInput.messages[1].content, /^---/m, "front matter is stripped");
  assert.equal(calls.screenshots.length, 1);
  const { action, options } = calls.screenshots[0];
  assert.equal(action, "screenshot");
  assert.deepEqual(options.viewport, { width: 1200, height: 630 });
  assert.match(options.html, /data-og-hook>One agent loop now runs emaila.gent, mix.email and a dozen other tools.<\/p>/);

  const row = env.READER_DB.raw.prepare("SELECT hook, source FROM og_hooks WHERE path = ?").get(PAGE);
  assert.equal(row.source, "ai");
  assert.ok(env.OG_CARDS.store.has(r2Key(PAGE, "d6cf95e357", await hookTag(row.hook))));

  res = await run(env);
  assert.equal(res.headers.get("X-Og-Card"), "stored");
  assert.equal(calls.ai, 1);
  assert.equal(calls.screenshots.length, 1);
});

test("an AI hook never replaces a hook set in /admin/ while it was being generated", async () => {
  const { env, calls } = makeEnv({
    ai: async () => {
      // An admin saves a hook while the model call is in flight.
      await writeHook(env.READER_DB, PAGE, "Written by hand", "manual");
      return { response: "Model line" };
    },
  });
  const res = await run(env);
  assert.equal(res.headers.get("X-Og-Card"), "rendered");
  const row = env.READER_DB.raw.prepare("SELECT hook, source FROM og_hooks WHERE path = ?").get(PAGE);
  assert.deepEqual({ ...row }, { hook: "Written by hand", source: "manual" });
  assert.match(calls.screenshots[0].options.html, /Written by hand/);
});

test("a PNG stored under an old hook is not served after the hook changes", async () => {
  const { env, calls } = makeEnv();
  await run(env);
  assert.equal(calls.screenshots.length, 1);
  // Change the hook without purging R2, as if the purge failed or a slow
  // render wrote the old image back afterwards.
  await writeHook(env.READER_DB, PAGE, "A new line", "manual");
  const res = await run(env);
  assert.equal(res.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.screenshots.length, 2);
  assert.match(calls.screenshots[1].options.html, /A new line/);
  assert.equal((await run(env)).headers.get("X-Og-Card"), "stored");
});

test("a share_hook in front matter skips Workers AI", async () => {
  const { env, calls } = makeEnv({ card: CARD_FIXED });
  const res = await run(env);
  assert.equal(res.status, 200);
  assert.equal(calls.ai, 0);
  assert.match(calls.screenshots[0].options.html, /Set in front matter/);
});

test("a hook set in D1 is used without Workers AI", async () => {
  const { env, calls } = makeEnv();
  env.READER_DB.raw.prepare("INSERT INTO og_hooks (path, hook, source, updated_at) VALUES (?, ?, 'manual', 1)").run(PAGE, "Hand-written line");
  await run(env);
  assert.equal(calls.ai, 0);
  assert.match(calls.screenshots[0].options.html, /Hand-written line/);
});

test("a Workers AI failure still renders, but the card is not stored", async () => {
  const { env, calls } = makeEnv({ ai: () => { throw new Error("model unavailable"); } });
  const res = await run(env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Og-Card"), "rendered, not stored");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(env.OG_CARDS.store.size, 0);
  assert.equal(calls.screenshots.length, 1);
});

test("a generated hook is still printed when D1 cannot save it, and the card is not stored", async () => {
  const { env, calls } = makeEnv();
  env.READER_DB = createD1(["0007_search_log.sql"].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)))); // og_render_log present, but og_hooks missing
  const res = await run(env);
  assert.equal(res.headers.get("X-Og-Card"), "rendered, not stored");
  assert.match(calls.screenshots[0].options.html, /One agent loop now runs/);
  assert.equal(env.OG_CARDS.store.size, 0);
});

test("render failures and unknown pages fall back to the site card", async () => {
  let { env } = makeEnv({ browser: () => new Response("boom", { status: 500 }) });
  let res = await run(env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), `${ORIGIN}/images/card.jpeg`);

  ({ env } = makeEnv({ card: null }));
  res = await run(env);
  assert.equal(res.status, 302);

  ({ env } = makeEnv());
  delete env.BROWSER;
  res = await run(env);
  assert.equal(res.status, 302);

  res = await run(env, ["nope.gif"]);
  assert.equal(res.status, 404);
});

test("admin share cards: require Access, set a hook by hand, regenerate, and purge stored PNGs", async () => {
  resetAccessCache();
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const TEAM = "team.cloudflareaccess.com";
  const AUD = "aud-tag";
  const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256" };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const input = `${b64({ alg: "RS256", kid: "k1" })}.${b64({ aud: AUD, iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: "paul@aifoc.us" })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  const auth = { "Cf-Access-Jwt-Assertion": `${input}.${Buffer.from(sig).toString("base64url")}` };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }));
  try {
    const { env } = makeEnv();
    Object.assign(env, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
    const req = (method, body, headers = auth) =>
      new Request(`${ORIGIN}/api/admin/og`, {
        method,
        headers: { Origin: ORIGIN, ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });

    assert.equal((await getOg({ request: req("GET", null, {}), env })).status, 403);
    assert.equal((await postOg({ request: req("POST", { path: PAGE, hook: "x" }, {}), env })).status, 403);

    await run(env);
    assert.equal(env.OG_CARDS.store.size, 1);

    let list = await (await getOg({ request: req("GET"), env })).json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].title, "agent-do: my agent loop");
    assert.equal(list.items[0].source, "ai");

    let res = await postOg({ request: req("POST", { path: PAGE, hook: "  A line I wrote.  " }), env });
    let out = await res.json();
    assert.deepEqual([out.hook, out.source, out.purged], ["A line I wrote.", "manual", 1]);
    assert.equal(env.OG_CARDS.store.size, 0);

    res = await postOg({ request: req("POST", { path: PAGE, regenerate: true }), env });
    out = await res.json();
    assert.equal(out.source, null);

    assert.equal((await postOg({ request: req("POST", { path: "../etc", hook: "x" }), env })).status, 400);
    assert.equal((await postOg({ request: req("POST", { path: PAGE, hook: "   " }), env })).status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("concurrent requests for the same uncached card use single-flight and only render once", async () => {
  const { env, calls } = makeEnv({
    ai: async () => {
      // Small artificial delay so concurrent requests overlap
      await new Promise((r) => setTimeout(r, 20));
      return { response: "Single flight hook" };
    },
  });

  const [res1, res2, res3] = await Promise.all([run(env), run(env), run(env)]);
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  assert.equal(res3.status, 200);
  assert.equal(res1.headers.get("X-Og-Card"), "rendered");
  assert.equal(res2.headers.get("X-Og-Card"), "rendered");
  assert.equal(res3.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.ai, 1, "Workers AI should only be called once");
  assert.equal(calls.screenshots.length, 1, "Browser Run screenshot should only be called once");
});

test("the stored:false path caches in memory and no longer re-bills on subsequent requests", async () => {
  const { env, calls } = makeEnv();
  env.READER_DB = createD1(["0007_search_log.sql"].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)))); // no og_hooks table -> causes stored: false
  const res1 = await run(env);
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get("X-Og-Card"), "rendered, not stored");
  assert.equal(calls.screenshots.length, 1);
  assert.equal(calls.ai, 1);

  // Second request for the same card: served from memory cache, does NOT re-bill
  const res2 = await run(env);
  assert.equal(res2.status, 200);
  assert.equal(res2.headers.get("X-Og-Card"), "rendered, not stored");
  assert.equal(calls.screenshots.length, 1, "screenshot was not called again");
  assert.equal(calls.ai, 1, "AI was not called again");
});

test("a never-settling quickAction times out, cancels render, resolves to fallback, and does not crash", async () => {
  _setRenderTimeoutMs(50);
  let aborted = false;
  try {
    const { env } = makeEnv({
      card: CARD_FIXED,
      browser: async (action, options) => {
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        });
      },
    });

    const res = await run(env);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("Location"), /card\.jpeg/);
    assert.equal(res.headers.get("X-Og-Card"), "fallback: render timed out");
    assert.equal(aborted, true, "underlying quickAction was aborted");
  } finally {
    _setRenderTimeoutMs(30000);
  }
});

test("uncached OG renders are rate limited across isolates via D1", async () => {
  const { env } = makeEnv();
  // Exhaust rate limit
  for (let i = 0; i < 30; i += 1) {
    const res = await serveCard({
      request: new Request(`https://aifoc.us/og/agent-do-my-agent-loop.png?burst=${i}`, {
        headers: { "CF-Connecting-IP": "198.51.100.88" },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    });
    // In this test makeEnv, first request will render and store in R2; subsequent ones with different query hit R2 directly.
    // So to test uncached render rate limiting, let's clear R2 before each call or make R2 miss:
    env.OG_CARDS.store.clear();
    _recentRenders.clear();
  }

  // Next uncached render from same IP trips rate limit and gets fallback 302
  env.OG_CARDS.store.clear();
  _recentRenders.clear();
  const res = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png?burst=overflow", {
      headers: { "CF-Connecting-IP": "198.51.100.88" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("X-Og-Card"), "fallback: rate limited");

  // Verify rows in og_render_log: denied call inserted nothing
  const rowCount = await env.READER_DB.prepare("SELECT COUNT(*) AS n FROM og_render_log").first();
  assert.equal(rowCount.n, 30, "denied OG render did not insert a row into og_render_log");
});

test("OG with READER_DB absent renders nothing and serves fallback without error", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { env, calls } = makeEnv();
    delete env.READER_DB;
    const res = await run(env);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("Location"), /card\.jpeg/);
    assert.equal(res.headers.get("X-Og-Card"), "fallback: rate limited");
    assert.equal(calls.screenshots.length, 0, "must render NOTHING");
    assert.equal(calls.ai, 0, "must call NO AI");
  } finally {
    console.error = original;
  }
});

test("OG with og_render_log missing renders nothing and serves fallback without error", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { env, calls } = makeEnv();
    env.READER_DB = createD1([]); // no tables at all
    const res = await run(env);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("Location"), /card\.jpeg/);
    assert.equal(res.headers.get("X-Og-Card"), "fallback: rate limited");
    assert.equal(calls.screenshots.length, 0, "must render NOTHING");
    assert.equal(calls.ai, 0, "must call NO AI");
  } finally {
    console.error = original;
  }
});

test("reserveOgSlot prunes expired rows older than 1 hour and prevents table from growing past the window", async () => {
  const { env } = makeEnv();
  const db = env.READER_DB;
  const now = Date.now();
  const expiredTime = now - 2 * 60 * 60 * 1000; // 2 hours ago

  // Seed expired rows
  for (let i = 0; i < 10; i++) {
    await db.prepare("INSERT INTO og_render_log (ip_hash, created_at) VALUES (?, ?)").bind(`expired_ip_${i}`, expiredTime).run();
  }

  const preCount = await db.prepare("SELECT COUNT(*) AS n FROM og_render_log").first();
  assert.equal(preCount.n, 10, "10 expired rows seeded");

  // Call reserveOgSlot with current time
  const allowed = await reserveOgSlot(db, "active_ip", now);
  assert.equal(allowed, true);

  // All 10 expired rows must be pruned, leaving only the 1 newly inserted row
  const postCount = await db.prepare("SELECT COUNT(*) AS n FROM og_render_log").first();
  assert.equal(postCount.n, 1, "expired rows were pruned, table bounded");
});

test("40 same-IP same-card requests => exactly 1 render and 1 quota row, and no false 302 for repeat callers", async () => {
  const { env, calls } = makeEnv();
  const promises = Array.from({ length: 40 }, () =>
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": "198.51.100.77" },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
  );

  const responses = await Promise.all(promises);
  const statuses = responses.map((r) => r.status);
  const count200 = statuses.filter((s) => s === 200).length;
  const count302 = statuses.filter((s) => s === 302).length;

  assert.equal(count200, 40, "all 40 requests receive status 200 with no false 302s");
  assert.equal(count302, 0, "no requests receive false 302");
  assert.equal(calls.screenshots.length, 1, "exactly 1 screenshot rendered");

  // Verify quota rows consumed in og_render_log
  const totalRows = await env.READER_DB.prepare("SELECT COUNT(*) AS n FROM og_render_log").first();
  assert.equal(totalRows.n, 1, "exactly 1 quota row consumed in og_render_log");
});

test("48h of OG reservations for one IP stays strictly bounded by the window (at most OG_RENDERS_PER_HOUR rows)", async () => {
  const { env } = makeEnv();
  const db = env.READER_DB;
  const baseTime = Date.now();
  const hourMs = 60 * 60 * 1000;
  const ip = "198.51.100.201";

  for (let hour = 0; hour < 48; hour++) {
    const t = baseTime + hour * hourMs;
    for (let i = 0; i < OG_RENDERS_PER_HOUR; i++) {
      const allowed = await reserveOgSlot(db, ip, t + i * 1000);
      assert.equal(allowed, true);
    }
  }

  const count = await db.prepare("SELECT COUNT(*) AS n FROM og_render_log WHERE ip_hash = ?").bind(ip).first();
  assert.equal(count.n, OG_RENDERS_PER_HOUR, "table contains only active window rows (30), not 48h history (1,440)");
});

test("concurrent same-card requests: rate-limited flight leader does not poison peer with quota", async () => {
  const { env, calls } = makeEnv({
    ai: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { response: "Concurrent peer hook" };
    },
  });
  const db = env.READER_DB;
  const exhaustedIp = "203.0.113.100";
  const freshIp = "203.0.113.101";

  // Pre-seed 30 rows for exhaustedIp using its actual hashed value
  const exhaustedHash = await hashIp(db, exhaustedIp);
  for (let i = 0; i < OG_RENDERS_PER_HOUR; i++) {
    await db.prepare("INSERT INTO og_render_log (ip_hash, created_at) VALUES (?, ?)").bind(exhaustedHash, Date.now()).run();
  }

  // Fire exhaustedIp (flight leader) and freshIp (joiner) concurrently for the same card
  const [resExhausted, resFresh] = await Promise.all([
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": exhaustedIp },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": freshIp },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
  ]);

  assert.equal(resExhausted.status, 302, "rate-limited leader gets 302 fallback");
  assert.equal(resExhausted.headers.get("X-Og-Card"), "fallback: rate limited");
  assert.equal(resFresh.status, 200, "fresh joiner is not poisoned and gets 200 rendered card");
  assert.equal(resFresh.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.screenshots.length, 1, "exactly 1 screenshot rendered for the fresh caller");
});

test("recentRenders is bypassed when a durable hook exists in D1", async () => {
  const { env, calls } = makeEnv();
  // Start with no og_hooks table so render 1 is stored: false and enters recentRenders
  env.READER_DB = createD1(["0001_reader.sql", "0007_search_log.sql"].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url))));

  const res1 = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.200" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get("X-Og-Card"), "rendered, not stored");
  assert.equal(calls.screenshots.length, 1);

  // Now create a full DB with a durable hook in og_hooks
  const fullDb = createD1(MIGRATIONS);
  await writeHook(fullDb, "/agent-do-my-agent-loop/", "DURABLE NEW HOOK", "manual");
  env.READER_DB = fullDb;

  // Second request: recentRenders should NOT be served because a durable hook now exists
  const res2 = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.200" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.screenshots.length, 2, "re-rendered with durable hook instead of serving stale unstored cache");
});

test("a denied-IP request followed by a fresh-IP request for the same card: the second must render, not 302", async () => {
  const { env, calls } = makeEnv();
  const db = env.READER_DB;
  const exhaustedIp = "203.0.113.150";
  const freshIp = "203.0.113.151";

  // Pre-seed 30 rows for exhaustedIp so its reservation is denied
  const exhaustedHash = await hashIp(db, exhaustedIp);
  for (let i = 0; i < OG_RENDERS_PER_HOUR; i++) {
    await db.prepare("INSERT INTO og_render_log (ip_hash, created_at) VALUES (?, ?)").bind(exhaustedHash, Date.now()).run();
  }

  // Request 1: from denied IP -> must return 302 fallback
  const res1 = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": exhaustedIp },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res1.status, 302);
  assert.equal(res1.headers.get("X-Og-Card"), "fallback: rate limited");

  // Request 2: sequential from fresh IP for the exact same card -> must render (200), not 302!
  const res2 = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": freshIp },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res2.status, 200, "second request from fresh IP must render (200), not 302");
  assert.equal(res2.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.screenshots.length, 1, "exactly 1 screenshot rendered for the fresh IP");
});

test("a hook change followed by a same-second request must not serve the old card", async () => {
  let hookCounter = 0;
  const { env, calls } = makeEnv({
    ai: async () => {
      hookCounter++;
      return { response: `Hook version ${hookCounter}` };
    },
  });
  // Schema with no og_hooks table initially so render 1 is unstored and enters recentRenders
  const partialDb = createD1(["0001_reader.sql", "0007_search_log.sql"].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url))));
  env.READER_DB = partialDb;

  // Render 1: generates hook 1, unstored, cached in recentRenders
  const res1 = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.210" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get("X-Og-Card"), "rendered, not stored");
  assert.equal(calls.screenshots.length, 1);
  assert.match(calls.screenshots[0].options.html, /Hook version 1/);

  // Hook change: an editor sets a durable hook in D1 immediately (same second)
  const fullDb = createD1(MIGRATIONS);
  await writeHook(fullDb, "/agent-do-my-agent-loop/", "Brand new editor hook", "manual");
  env.READER_DB = fullDb;

  // Render 2: same-second request for the exact same page -> must NOT serve the old card!
  const res2 = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.210" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.screenshots.length, 2, "second render was triggered instead of serving stale card");
  assert.match(calls.screenshots[1].options.html, /Brand new editor hook/, "must serve the new hook, not the old hook");
});

test("exact reviewer scenario: leader denied, fresh IP with 1 slot left joins -> renders 200, consumes exactly 1 slot, never double-charged, never false 302", async () => {
  const { env, calls } = makeEnv({
    ai: async () => {
      // Small delay so concurrent joiner attaches during leader reservation
      await new Promise((r) => setTimeout(r, 20));
      return { response: "Reviewer scenario hook" };
    },
  });
  const db = env.READER_DB;
  const exhaustedIp = "203.0.113.80";
  const oneSlotIp = "203.0.113.81";

  // Pre-seed 30 rows for exhaustedIp (0 slots left)
  const exhaustedHash = await hashIp(db, exhaustedIp);
  for (let i = 0; i < OG_RENDERS_PER_HOUR; i++) {
    await db.prepare("INSERT INTO og_render_log (ip_hash, created_at) VALUES (?, ?)").bind(exhaustedHash, Date.now()).run();
  }

  // Pre-seed 29 rows for oneSlotIp (exactly 1 slot left)
  const oneSlotHash = await hashIp(db, oneSlotIp);
  for (let i = 0; i < OG_RENDERS_PER_HOUR - 1; i++) {
    await db.prepare("INSERT INTO og_render_log (ip_hash, created_at) VALUES (?, ?)").bind(oneSlotHash, Date.now()).run();
  }

  // Fire exhausted leader and 1-slot joiner concurrently
  const [resLeader, resJoiner] = await Promise.all([
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": exhaustedIp },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": oneSlotIp },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
  ]);

  assert.equal(resLeader.status, 302, "denied leader gets 302 rate limited");
  assert.equal(resLeader.headers.get("X-Og-Card"), "fallback: rate limited");

  assert.equal(resJoiner.status, 200, "joiner with 1 slot left renders HTTP 200, NOT a false 302");
  assert.equal(resJoiner.headers.get("X-Og-Card"), "rendered");
  assert.equal(calls.screenshots.length, 1, "exactly 1 screenshot rendered");

  // Verify the joiner was charged EXACTLY ONCE, not twice
  const joinerRows = await db.prepare("SELECT COUNT(*) AS n FROM og_render_log WHERE ip_hash = ?").bind(oneSlotHash).first();
  assert.equal(joinerRows.n, 30, "joiner consumed exactly 1 slot (29 -> 30), never double-charged");
});

test("joiner legitimately reuses leader's rendered card and consumes zero quota", async () => {
  const { env, calls } = makeEnv({
    ai: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { response: "Shared leader hook" };
    },
  });
  const db = env.READER_DB;
  const leaderIp = "203.0.113.90";
  const joinerIp = "203.0.113.91";

  const [resLeader, resJoiner] = await Promise.all([
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": leaderIp },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
    serveCard({
      request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
        headers: { "CF-Connecting-IP": joinerIp },
      }),
      env,
      segments: ["agent-do-my-agent-loop.png"],
    }),
  ]);

  assert.equal(resLeader.status, 200);
  assert.equal(resJoiner.status, 200);
  assert.equal(calls.screenshots.length, 1, "single flight rendered once");

  // Leader consumed 1 slot
  const leaderHash = await hashIp(db, leaderIp);
  const leaderRows = await db.prepare("SELECT COUNT(*) AS n FROM og_render_log WHERE ip_hash = ?").bind(leaderHash).first();
  assert.equal(leaderRows.n, 1, "leader consumed 1 quota slot");

  // Joiner consumed 0 slots (free cache hit!)
  const joinerHash = await hashIp(db, joinerIp);
  const joinerRows = await db.prepare("SELECT COUNT(*) AS n FROM og_render_log WHERE ip_hash = ?").bind(joinerHash).first();
  assert.equal(joinerRows.n, 0, "joiner consumed zero quota slots");
});

test("a hook edit while an old render is in-flight: new request does not join old flight and does not serve old card", async () => {
  let releaseRenderA;
  const holdRenderA = new Promise((r) => {
    releaseRenderA = r;
  });
  let reachedA = false;

  const { env, calls } = makeEnv({
    browser: async (action, options) => {
      if (options.html.includes("Initial Hook A")) {
        reachedA = true;
        // Hold render A in-flight
        await holdRenderA;
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
    },
  });
  const fullDb = env.READER_DB;
  await writeHook(fullDb, "/agent-do-my-agent-loop/", "Initial Hook A", "manual");

  // Fire Request A (starts in-flight render for Hook A)
  const reqAPromise = serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });

  // Wait until Request A is actively in-flight in the renderer
  while (!reachedA) await new Promise((r) => setTimeout(r, 5));

  // While Request A is still in-flight, editor updates the hook in D1 to Hook B
  await writeHook(fullDb, "/agent-do-my-agent-loop/", "Updated Hook B", "manual");

  // Fire Request B for the same page while Request A is still in-flight
  const reqBPromise = serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.11" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });

  // Small delay so Request B evaluates and dispatches its own flight
  await new Promise((r) => setTimeout(r, 20));

  // Now release Request A
  releaseRenderA();

  const [resA, resB] = await Promise.all([reqAPromise, reqBPromise]);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  // Must have executed 2 screenshots, not joined into 1!
  assert.equal(calls.screenshots.length, 2, "must render separately, not join the old version's flight");
  assert.match(calls.screenshots[0].options.html, /Initial Hook A/);
  assert.match(calls.screenshots[1].options.html, /Updated Hook B/);
});

test("D1 settings read failure during hashIp fails closed with 302 fallback and zero browser renders", async () => {
  let browserRan = false;
  const env = {
    ASSETS: {
      fetch: async () => new Response(CARD),
    },
    READER_DB: {
      prepare: () => {
        throw new Error("D1 settings failure");
      },
    },
    BROWSER: {
      quickAction: async () => {
        browserRan = true;
        throw new Error("browser should not run");
      },
    },
  };

  const res = await serveCard({
    request: new Request("https://aifoc.us/og/agent-do-my-agent-loop.png", {
      headers: { "CF-Connecting-IP": "203.0.113.1" },
    }),
    env,
    segments: ["agent-do-my-agent-loop.png"],
  });

  assert.equal(res.status, 302, "must return HTTP 302 redirect fallback");
  assert.equal(res.headers.get("X-Og-Card"), "fallback: rate limited");
  assert.equal(browserRan, false, "Browser Run must never execute on D1 error");
});







