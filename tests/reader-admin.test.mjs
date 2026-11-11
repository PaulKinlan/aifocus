// /api/admin/* behind Cloudflare Access (aifocus-dsg4 split of
// reader.test.mjs): the queue, moderation, trust and account management,
// plus the audit trail that attributes every privileged mutation. Each case
// resets the Access config cache and swaps in a signing fetch for the duration.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as getState } from "../functions/api/reader/state.js";
import { onRequestPost as postAnnotation } from "../functions/api/reader/annotations.js";
import { onRequestGet as getQueue } from "../functions/api/admin/queue.js";
import { onRequestPost as postModerate } from "../functions/api/admin/moderate.js";
import { onRequestGet as getTrust, onRequestPost as postTrust } from "../functions/api/admin/trust.js";
import { onRequestGet as getAccounts, onRequestPost as postAccounts } from "../functions/api/admin/accounts.js";
import { resetAccessCache } from "../functions/_lib/access.js";
import { POST, POST_HTML, makeEnv, req, READER_A, READER_B, signIn, TEAM, AUD, makeSigner } from "./helpers/reader-fixtures.mjs";

test("admin queue and moderation: require Access, then approve makes a note public", async () => {
  resetAccessCache();
  const { sign, fetchImpl } = await makeSigner();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const env = { ...makeEnv(), ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
    const token = await sign({ aud: AUD, iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: "paul@aifoc.us" });
    const auth = { "Cf-Access-Jwt-Assertion": token };

    const { session, user } = await signIn(env, "bo");
    const created = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "hello" }, reader: READER_A, session }), env });
    const { id } = (await created.json()).annotation;

    assert.equal((await getQueue({ request: req("/api/admin/queue"), env })).status, 403);

    const queue = await (await getQueue({ request: req("/api/admin/queue", { headers: auth }), env })).json();
    assert.equal(queue.items.length, 1);
    assert.equal(queue.counts.pending, 1);
    assert.equal(queue.moderator, "paul@aifoc.us");

    let res = await postModerate({ request: req("/api/admin/moderate", { method: "POST", body: { ids: [id], status: "approved" } }), env });
    assert.equal(res.status, 403);
    res = await postModerate({ request: req("/api/admin/moderate", { method: "POST", body: { ids: [id], status: "approved" }, headers: auth }), env });
    assert.equal((await res.json()).updated, 1);

    const state = await (await getState({ request: req(`/api/reader/state?post=${POST}`, { reader: READER_B }), env })).json();
    assert.equal(state.comments.length, 1);
    const row = env.READER_DB.raw.prepare("SELECT moderated_by FROM annotations WHERE id = ?").get(id);
    assert.equal(row.moderated_by, "paul@aifoc.us");

    // Approval alone does not trust the account: its next comment waits.
    assert.equal(env.READER_DB.raw.prepare("SELECT trusted FROM users WHERE id = ?").get(user.id).trusted, 0);
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "waits" }, reader: READER_A, session }), env });
    assert.equal((await res.json()).annotation.status, "pending");

    // The moderator trusts the account by hand, from the queue item's author_id.
    const pending = await (await getQueue({ request: req("/api/admin/queue", { headers: auth }), env })).json();
    assert.equal(pending.items[0].author_id, user.id);
    const trustBody = { userId: user.id, trusted: true };
    assert.equal((await postTrust({ request: req("/api/admin/trust", { method: "POST", body: trustBody }), env })).status, 403);
    assert.equal((await postTrust({ request: req("/api/admin/trust", { method: "POST", body: { userId: "x", trusted: true }, headers: auth }), env })).status, 400);
    assert.equal((await postTrust({ request: req("/api/admin/trust", { method: "POST", body: trustBody, headers: auth }), env })).status, 200);
    const trusted = await (await getTrust({ request: req("/api/admin/trust", { headers: auth }), env })).json();
    assert.deepEqual(trusted.users.map((u) => u.id), [user.id]);
    const trustAction = env.READER_DB.raw.prepare("SELECT * FROM admin_actions WHERE action = 'trust'").get();
    assert.ok(trustAction);
    assert.equal(trustAction.actor, "paul@aifoc.us");
    assert.equal(trustAction.subject, user.id);
    assert.deepEqual(JSON.parse(trustAction.before), { trusted: false });
    assert.deepEqual(JSON.parse(trustAction.after), { trusted: true });

    // A trusted account's next comment is published straight away, unless
    // the safety screen flags it.
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "again" }, reader: READER_A, session }), env });
    assert.equal((await res.json()).annotation.status, "approved");
    env.AI = { run: async () => ({ response: { safe: false, categories: ["S1"] } }) };
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "flagged" }, reader: READER_A, session }), env });
    const flagged = (await res.json()).annotation;
    assert.equal(flagged.status, "pending");

    // Marking one as spam removes the trust.
    res = await postModerate({ request: req("/api/admin/moderate", { method: "POST", body: { ids: [flagged.id], status: "spam" }, headers: auth }), env });
    assert.equal((await res.json()).updated, 1);
    assert.equal(env.READER_DB.raw.prepare("SELECT trusted FROM users WHERE id = ?").get(user.id).trusted, 0);
    const untrustAction = env.READER_DB.raw.prepare("SELECT * FROM admin_actions WHERE action = 'untrust'").get();
    assert.ok(untrustAction);
    assert.equal(untrustAction.actor, "paul@aifoc.us");
    assert.equal(untrustAction.subject, user.id);
    assert.deepEqual(JSON.parse(untrustAction.before), { trusted: true });
    assert.deepEqual(JSON.parse(untrustAction.after), { trusted: false });

    const queueAfter = await (await getQueue({ request: req("/api/admin/queue?status=spam", { headers: auth }), env })).json();
    assert.equal(queueAfter.items[0].author_name, "BO");
    assert.equal(queueAfter.items[0].author_profile_url, "https://github.com/bo");

    // All accounts, with counts; blocking signs the account out.
    assert.equal((await getAccounts({ request: req("/api/admin/accounts"), env })).status, 403);
    const accounts = await (await getAccounts({ request: req("/api/admin/accounts", { headers: auth }), env })).json();
    assert.equal(accounts.total, 1);
    assert.equal(accounts.users[0].id, user.id);
    assert.equal(accounts.users[0].identities, "github:bo");
    assert.equal(accounts.users[0].written, 4);
    // Search matches a linked handle; LIKE wildcards are literal.
    const found = await (await getAccounts({ request: req("/api/admin/accounts?q=bo", { headers: auth }), env })).json();
    assert.deepEqual([found.matched, found.users.length, found.total], [1, 1, 1]);
    const none = await (await getAccounts({ request: req("/api/admin/accounts?q=%25", { headers: auth }), env })).json();
    assert.deepEqual([none.matched, none.users.length], [0, 0]);
    assert.equal((await postAccounts({ request: req("/api/admin/accounts", { method: "POST", body: { userId: user.id, status: "blocked" } }), env })).status, 403);
    res = await postAccounts({ request: req("/api/admin/accounts", { method: "POST", body: { userId: user.id, status: "blocked" }, headers: auth }), env });
    assert.equal(res.status, 200);
    const blockAction = env.READER_DB.raw.prepare("SELECT * FROM admin_actions WHERE action = 'block'").get();
    assert.ok(blockAction);
    assert.equal(blockAction.actor, "paul@aifoc.us");
    assert.equal(blockAction.subject, user.id);
    assert.deepEqual(JSON.parse(blockAction.before), { status: "active", trusted: false });
    assert.deepEqual(JSON.parse(blockAction.after), { status: "blocked", trusted: false });
    res = await postAnnotation({ request: req("/api/reader/annotations", { method: "POST", body: { post: POST, type: "comment", body: "blocked" }, reader: READER_A, session }), env });
    assert.equal(res.status, 401);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("admin actions audit: privileged trust and block mutations are attributed (aifocus-f7r)", async () => {
  resetAccessCache();
  const { sign, fetchImpl } = await makeSigner();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const env = { ...makeEnv(), ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
    const token = await sign({ aud: AUD, iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: "mod@example.com" });
    const auth = { "Cf-Access-Jwt-Assertion": token };

    const { user } = await signIn(env, "target-user");

    // 1. Trust an account -> records admin_action
    const resTrust = await postTrust({ request: req("/api/admin/trust", { method: "POST", body: { userId: user.id, trusted: true }, headers: auth }), env });
    assert.equal(resTrust.status, 200);

    // 2. Untrust an account directly -> records untrust admin_action
    const resUntrust = await postTrust({ request: req("/api/admin/trust", { method: "POST", body: { userId: user.id, trusted: false }, headers: auth }), env });
    assert.equal(resUntrust.status, 200);

    // 3. Block account -> records block admin_action
    const resBlock = await postAccounts({ request: req("/api/admin/accounts", { method: "POST", body: { userId: user.id, status: "blocked" }, headers: auth }), env });
    assert.equal(resBlock.status, 200);

    // 4. Unblock account -> records unblock admin_action
    const resUnblock = await postAccounts({ request: req("/api/admin/accounts", { method: "POST", body: { userId: user.id, status: "active" }, headers: auth }), env });
    assert.equal(resUnblock.status, 200);

    // 5. Invalid user -> 404, no action recorded
    const res404 = await postTrust({ request: req("/api/admin/trust", { method: "POST", body: { userId: "0".repeat(22), trusted: true }, headers: auth }), env });
    assert.equal(res404.status, 404);

    // Verify audit rows
    const rows = env.READER_DB.raw.prepare("SELECT * FROM admin_actions WHERE subject = ? ORDER BY created_at ASC").all(user.id);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((r) => r.action), ["trust", "untrust", "block", "unblock"]);
    assert.ok(rows.every((r) => r.actor === "mod@example.com"));
    assert.deepEqual(JSON.parse(rows[0].before), { trusted: false });
    assert.deepEqual(JSON.parse(rows[0].after), { trusted: true });
    assert.deepEqual(JSON.parse(rows[1].before), { trusted: true });
    assert.deepEqual(JSON.parse(rows[1].after), { trusted: false });
    assert.deepEqual(JSON.parse(rows[2].before), { status: "active", trusted: false });
    assert.deepEqual(JSON.parse(rows[2].after), { status: "blocked", trusted: false });
    assert.deepEqual(JSON.parse(rows[3].before), { status: "blocked", trusted: false });
    assert.deepEqual(JSON.parse(rows[3].after), { status: "active", trusted: false });
  } finally {
    globalThis.fetch = realFetch;
  }
});
