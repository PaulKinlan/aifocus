// verifyAccess (aifocus-dsg4 split of reader.test.mjs): the Cloudflare
// Access JWT contract every admin endpoint depends on - signature, audience,
// issuer, expiry and fail-closed behaviour - verified against a locally
// minted key set.

import test from "node:test";
import assert from "node:assert/strict";
import { verifyAccess, resetAccessCache } from "../functions/_lib/access.js";
import { ORIGIN, TEAM, AUD, makeSigner } from "./helpers/reader-fixtures.mjs";

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

  // Malformed tokens must be REJECTED without throwing (a 500 instead of a
  // 403 would leak that the endpoint exists and errored mid-verification).
  const [, , badSig] = "h.H.s!g!".split(".");
  assert.equal(await check("e30.e30.s!gnature"), null, "malformed signature segment");
  assert.equal(await check(`e30.${Buffer.from(JSON.stringify(good)).toString("base64url")}.${badSig}`), null);
  assert.equal(await check(`${Buffer.from("null").toString("base64url")}.${Buffer.from(JSON.stringify(good)).toString("base64url")}.${(await sign(good)).split(".")[2]}`), null, "null header");
  assert.equal(await check(`${(await sign(good)).split(".")[0]}.${Buffer.from("null").toString("base64url")}.${(await sign(good)).split(".")[2]}`), null, "null payload");
  assert.equal(await check("not-a-jwt"), null);
  assert.equal(await check("a.b"), null);
});
