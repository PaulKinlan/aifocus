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
} from "../functions/_lib/og.js";
import { onRequestGet as getOg, onRequestPost as postOg } from "../functions/api/admin/og.js";
import { resetAccessCache } from "../functions/_lib/access.js";

const ORIGIN = "https://aifoc.us";
const PAGE = "/agent-do-my-agent-loop/";
const MIGRATIONS = ["0004_og_hooks.sql"].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)));

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
  env.READER_DB = createD1([]); // no og_hooks table, as before the migration is applied
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
