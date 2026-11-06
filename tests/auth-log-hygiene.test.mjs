// OAuth failure logs must be credential-free even when provider text is
// untrusted (aifocus-e3x, aifocus-3s9, aifocus-fgn7). Two layers, tested
// separately and together:
//
//   1. classifyOAuthError: provider JSON `error` reaches a message only if it
//      is on a fixed code list; anything else becomes the HTTP status. This is
//      the boundary — keyed redaction cannot catch a bare, unkeyed credential.
//   2. providerErrorSummary: backstop redaction for whatever still reaches a
//      log (keyed secrets in every shape, queries, bearer headers, control
//      characters), single line, capped, with a sanitized error name.
//
// Plus the end-to-end path: a token endpoint that leaks a code and a client
// secret in its error body produces one clean, single-line console.error.

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createD1 } from "./helpers/d1.mjs";
import { classifyOAuthError, providerErrorSummary, STATE_COOKIE } from "../functions/_lib/auth.js";
import { complete as githubComplete } from "../functions/_lib/providers/github.js";
import { authServerForPds, authServerMetadata, dpopPost, generateDpopKey } from "../functions/_lib/providers/bluesky.js";
import { onRequestGet as start } from "../functions/api/auth/start/[provider].js";
import { onRequestGet as callback } from "../functions/api/auth/callback/[provider].js";

const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const MIGRATIONS = ["0001_reader.sql", "0003_auth.sql", "0008_auth_start_log.sql"].map((f) =>
  fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)),
);
const ORIGIN = "https://aifoc.us";

// --- classifyOAuthError: the boundary --------------------------------------

test("classifyOAuthError passes whitelisted codes and nothing else", () => {
  assert.equal(classifyOAuthError({ error: "invalid_grant" }, 400), "invalid_grant");
  assert.equal(classifyOAuthError({ error: "use_dpop_nonce" }, 400), "use_dpop_nonce");
  // The fgn7 repro shape: an unkeyed credential smuggled in the code field.
  // It is not on the list, so the status is logged and the text is dropped.
  const classified = classifyOAuthError({ error: "invalid_grant gho_UNKEYED_SECRET" }, 400);
  assert.equal(classified, "HTTP 400");
  assert.ok(!classified.includes("gho_UNKEYED_SECRET"));
  assert.equal(classifyOAuthError({ error: { nested: "object" } }, 502), "HTTP 502");
  assert.equal(classifyOAuthError({}, 502), "HTTP 502");
  assert.equal(classifyOAuthError(null, 500), "HTTP 500");
});

// --- providerErrorSummary: the backstop ------------------------------------

test("providerErrorSummary redacts keyed secrets in every provider shape (aifocus-3s9)", () => {
  const cases = [
    ['invalid_grant client_secret="ghs_QUOTED_SECRET"', "ghs_QUOTED_SECRET"],
    ["invalid_grant code = gho_SPACED_SECRET", "gho_SPACED_SECRET"],
    ["invalid_grant code: gho_COLON_SECRET", "gho_COLON_SECRET"],
    ['{"access_token":"gho_JSON_SECRET","client_secret":"ghs_JSON_SECRET2"}', "gho_JSON_SECRET"],
    ['{"access_token":"gho_JSON_SECRET","client_secret":"ghs_JSON_SECRET2"}', "ghs_JSON_SECRET2"],
    ["access_token='gho_SINGLE_QUOTED'", "gho_SINGLE_QUOTED"],
    ["refresh_token=rth_REFRESH_SECRET", "rth_REFRESH_SECRET"],
    ["Authorization: Bearer gho_BEARER_SECRET rejected", "gho_BEARER_SECRET"],
  ];
  for (const [message, secret] of cases) {
    const out = providerErrorSummary(new Error(message));
    assert.ok(!out.includes(secret), `secret survived: ${message} -> ${out}`);
    assert.ok(!out.includes("\n"), `output is not single-line: ${out}`);
  }
});

test("providerErrorSummary redacts queries, caps length, and sanitizes err.name", () => {
  const urlCase = providerErrorSummary(new Error("failed at https://github.com/login/oauth/authorize?code=gho_URL_SECRET&state=x"));
  assert.ok(!urlCase.includes("gho_URL_SECRET"));
  assert.ok(urlCase.includes("?[redacted]"));

  const long = providerErrorSummary(new Error("provider said: " + "blah ".repeat(200)));
  assert.ok(long.length <= 161, `summary not capped: ${long.length}`);

  // A custom error name is attacker-influenced text like any other: it is
  // stripped to [A-Za-z0-9_$-], capped, and cannot forge a log line.
  const named = new Error("plain message");
  named.name = "Boom\nFORGED LINE code=gho_NAME_SECRET";
  const out = providerErrorSummary(named);
  assert.ok(!out.includes("\n"), `name injected a newline: ${JSON.stringify(out)}`);
  assert.ok(!out.includes("code="), `name kept a key=value shape: ${JSON.stringify(out)}`);
  assert.ok(out.includes("plain message"));

  // Non-Error values and empty names do not crash the backstop.
  assert.equal(typeof providerErrorSummary("bare string"), "string");
  assert.equal(typeof providerErrorSummary(null), "string");
});

test("providerErrorSummary is not vacuous: harmless diagnostics pass through", () => {
  assert.equal(providerErrorSummary(new Error("github: /user HTTP 502")), "github: /user HTTP 502");
  assert.equal(
    providerErrorSummary(new Error("github: token exchange failed (invalid_grant)")),
    "github: token exchange failed (invalid_grant)",
  );
});

// --- provider level: no provider text in the message ------------------------

test("github complete() classifies a hostile token-endpoint error body", async () => {
  const params = new URLSearchParams({ code: "c0de" });
  const env = { GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" };
  const hostileFetch = async () =>
    new Response(
      JSON.stringify({
        error: "invalid_grant gho_UNKEYED_SECRET",
        error_description: "bad request for code=gho_DESC_SECRET with client_secret=ghs_DESC_SECRET",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  await assert.rejects(
    () => githubComplete({ env, params, redirectUri: `${ORIGIN}/api/auth/callback/github`, verifier: "v", fetchImpl: hostileFetch }),
    (err) => {
      assert.equal(err.message, "github: token exchange failed (HTTP 400)");
      assert.ok(!err.message.includes("gho_UNKEYED_SECRET"));
      assert.ok(!err.message.includes("gho_DESC_SECRET"));
      return true;
    },
  );

  // A legitimate, whitelisted code still reaches the message: the log keeps
  // enough signal to tell a rejected grant from a network failure.
  const invalidGrantFetch = async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    () => githubComplete({ env, params, redirectUri: `${ORIGIN}/api/auth/callback/github`, verifier: "v", fetchImpl: invalidGrantFetch }),
    /token exchange failed \(invalid_grant\)/,
  );
});

// --- bluesky: no third-party URL part in a message (aifocus-32dk) -----------

test("bluesky dpopPost names the operation, never the third-party endpoint pathname", async () => {
  const key = await generateDpopKey();
  const hostile = async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    () => dpopPost("https://auth.example.com/oauth/token/gho_UNKEYED_SECRET", {}, key, null, hostile, "token exchange"),
    (err) => {
      assert.equal(err.message, "bluesky: token exchange failed (invalid_grant)");
      assert.ok(!err.message.includes("gho_UNKEYED_SECRET"));
      assert.ok(!err.message.includes("/oauth/token"));
      return true;
    },
  );
  // A missing or hostile label falls back to the fixed word "request".
  await assert.rejects(
    () => dpopPost("https://auth.example.com/token", {}, key, null, hostile, "bad\nlabel gho_X"),
    /bluesky: request failed \(invalid_grant\)/,
  );
});

test("bluesky discovery errors carry no third-party pathname or host", async () => {
  const notFound = async () => new Response("nope", { status: 502 });
  await assert.rejects(
    () => authServerForPds("https://pds.example.com/gho_PDS_PATH_SECRET", notFound),
    (err) => {
      assert.equal(err.message, "bluesky: protected-resource metadata fetch failed (HTTP 502)");
      assert.ok(!err.message.includes("gho_PDS_PATH_SECRET"));
      return true;
    },
  );
  // The SSRF rejection names our own fixed reason, not the rejected host.
  await assert.rejects(
    () => authServerForPds("https://service.internal", notFound),
    (err) => {
      assert.equal(err.message, "bluesky: rejected an endpoint host (reserved name)");
      assert.ok(!err.message.includes("service.internal"));
      return true;
    },
  );
});

test("bluesky start failure logs one line with no credential or pathname fragment (aifocus-32dk)", async () => {
  const db = createD1(MIGRATIONS);
  const env = { READER_DB: db };
  const DID = "did:plc:abcdefghijklmnopqrstuvwx";
  const PDS = "https://pds.example.com";
  const AS = "https://auth.example.com";

  const logged = [];
  const realError = console.error;
  const realFetch = globalThis.fetch;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.href.startsWith("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle")) return json({ did: DID });
    if (url.href === `https://plc.directory/${DID}`) {
      return json({ id: DID, service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: PDS }] });
    }
    if (url.href === `${PDS}/.well-known/oauth-protected-resource`) return json({ authorization_servers: [AS] });
    if (url.href === `${AS}/.well-known/oauth-authorization-server`) {
      // Hostile metadata: bare credentials planted in the endpoint pathnames.
      return json({
        issuer: AS,
        authorization_endpoint: `${AS}/authorize`,
        token_endpoint: `${AS}/oauth/token/gho_UNKEYED_SECRET`,
        pushed_authorization_request_endpoint: `${AS}/par/ghs_PAR_SECRET`,
      });
    }
    if (url.href === `${AS}/par/ghs_PAR_SECRET`) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return new Response("unexpected", { status: 500 });
  };
  try {
    const res = await start({
      request: new Request(`${ORIGIN}/api/auth/start/bluesky?handle=ana.example.com`),
      env,
      params: { provider: "bluesky" },
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers.get("Location").includes("signin=failed"));
  } finally {
    console.error = realError;
    globalThis.fetch = realFetch;
  }

  assert.equal(logged.length, 1, `expected one log line, got: ${JSON.stringify(logged)}`);
  const line = logged[0];
  assert.ok(!line.includes("\n"), "log line is not single-line");
  for (const leak of ["gho_UNKEYED_SECRET", "ghs_PAR_SECRET", "/oauth/token", "/par/"]) {
    assert.ok(!line.includes(leak), `${leak} reached the log: ${line}`);
  }
  assert.ok(line.includes("auth start bluesky failed"), `unexpected log line: ${line}`);
});

test("malformed discovery JSON never reflects the body (aifocus-8qky)", async () => {
  // The finding's exact repro: a 200 whose body is a bare token used to throw
  // a SyntaxError that quoted it, and the summary printed it verbatim.
  await assert.rejects(
    () => authServerMetadata("https://auth.example", async () => new Response("gho_UNKEYED_SECRET", { status: 200 })),
    (err) => {
      assert.equal(err.message, "bluesky: authorization-server metadata fetch returned invalid JSON");
      const line = providerErrorSummary(err);
      assert.ok(!line.includes("gho_UNKEYED_SECRET"), `body reached the log: ${line}`);
      return true;
    },
  );
  // Backstop: any SyntaxError that still reaches the summary keeps its class,
  // not its input-quoting message.
  const syntax = new SyntaxError("Unexpected token 'g', \"gho_UNKEYED_SECRET\" is not valid JSON");
  assert.equal(providerErrorSummary(syntax), "SyntaxError: [message redacted]");
});

test("github /user malformed body falls to the fixed shape check, not a parse error", async () => {
  const env = { GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" };
  const params = new URLSearchParams({ code: "c0de" });
  const fetchImpl = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.href === "https://github.com/login/oauth/access_token") return json({ access_token: "gho_token" });
    return new Response("gho_USER_BODY_SECRET is not json", { status: 200 });
  };
  await assert.rejects(
    () => githubComplete({ env, params, redirectUri: `${ORIGIN}/api/auth/callback/github`, verifier: "v", fetchImpl }),
    (err) => {
      assert.equal(err.message, "github: unexpected /user body");
      assert.ok(!err.message.includes("gho_USER_BODY_SECRET"));
      return true;
    },
  );
});

// --- end to end: one clean log line from start to console --------------------

test("callback logs one credential-free line when the token endpoint leaks secrets", async () => {
  const db = createD1(MIGRATIONS);
  const env = { READER_DB: db, GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" };
  const req = (path, { cookies = {} } = {}) => {
    const headers = new Headers();
    const jar = Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
    if (jar.length) headers.set("Cookie", jar.join("; "));
    return new Request(`${ORIGIN}${path}`, { method: "GET", headers });
  };

  const begin = await start({ request: req("/api/auth/start/github?return=/p/"), env, params: { provider: "github" } });
  assert.equal(begin.status, 302);
  const state = begin.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1);
  assert.ok(state, "start sets the state cookie");

  const logged = [];
  const realError = console.error;
  const realFetch = globalThis.fetch;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.href === "https://github.com/login/oauth/access_token") {
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "code gho_E2E_LEAKED rejected (client_secret=ghs_E2E_SECRET)" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("unexpected", { status: 500 });
  };
  try {
    const res = await callback({
      request: req(`/api/auth/callback/github?code=c0de&state=${state}`, { cookies: { [STATE_COOKIE]: state } }),
      env,
      params: { provider: "github" },
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers.get("Location").includes("signin=failed"));
  } finally {
    console.error = realError;
    globalThis.fetch = realFetch;
  }

  assert.equal(logged.length, 1, `expected one log line, got: ${JSON.stringify(logged)}`);
  const line = logged[0];
  assert.ok(!line.includes("\n"), "log line is not single-line");
  assert.ok(!line.includes("gho_E2E_LEAKED"), `code leaked: ${line}`);
  assert.ok(!line.includes("ghs_E2E_SECRET"), `client secret leaked: ${line}`);
  assert.ok(line.includes("auth callback github failed"), `unexpected log line: ${line}`);
});
