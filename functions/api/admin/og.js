// GET  /api/admin/og                       essays with their share-card hook lines
// POST /api/admin/og  { path, hook }       set a hook by hand
// POST /api/admin/og  { path, regenerate } drop the hook so the next render asks
//                                          Workers AI for a new one
//
// Either POST also deletes the page's stored card PNGs from R2, so the next
// request for /og/<path>.png renders a fresh one. Social platforms that already
// fetched the old image keep their copy until they re-fetch it. Requires a
// verified Cloudflare Access identity (see functions/_lib/access.js).

import { json, isSameOrigin } from "../../_lib/reader.js";
import { verifyAccess } from "../../_lib/access.js";
import { cleanHook, purgeCards, writeHook } from "../../_lib/og.js";

const PATH_RE = /^\/(?:[a-z0-9][a-z0-9-]{0,120}\/){1,3}$/i;

async function listEssays(request, env) {
  const res = await env.ASSETS.fetch(new Request(new URL("/index.json", request.url)));
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.articles || []).map((a) => {
    const path = new URL(a.url).pathname;
    return { path, title: String(a.title || "").trim(), date: a.date };
  });
}

export async function onRequestGet({ request, env }) {
  const who = await verifyAccess(request, env);
  if (!who) return json({ error: "Forbidden" }, 403);
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);
  const [essays, { results = [] }] = await Promise.all([
    listEssays(request, env),
    db.prepare("SELECT path, hook, source, model, updated_at FROM og_hooks").all(),
  ]);
  const hooks = new Map(results.map((r) => [r.path, r]));
  const items = essays.map((e) => {
    const row = hooks.get(e.path);
    return {
      ...e,
      hook: row?.hook || "",
      source: row?.source || null,
      model: row?.model || null,
      updated_at: row?.updated_at || null,
    };
  });
  return json({ moderator: who.email, items });
}

export async function onRequestPost({ request, env }) {
  const who = await verifyAccess(request, env);
  if (!who) return json({ error: "Forbidden" }, 403);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const db = env?.READER_DB;
  if (!db) return json({ error: "Reader features are not configured" }, 503);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const path = input?.path;
  if (typeof path !== "string" || !PATH_RE.test(path)) return json({ error: "Invalid path" }, 400);

  if (input.regenerate === true) {
    await db.prepare("DELETE FROM og_hooks WHERE path = ?").bind(path).run();
  } else {
    const hook = cleanHook(input?.hook);
    if (!hook) return json({ error: "Hook is empty" }, 400);
    await writeHook(db, path, hook, "manual");
  }
  // Stored PNGs are keyed by their hook, so a changed hook is never served
  // from an old image; purging only frees the space and can safely fail.
  const purged = await purgeCards(env?.OG_CARDS, path).catch((err) => {
    console.error("og purge", path, err?.message || err);
    return null;
  });
  const row = await db.prepare("SELECT hook, source FROM og_hooks WHERE path = ?").bind(path).first();
  return json({ path, hook: row?.hook || "", source: row?.source || null, purged });
}
