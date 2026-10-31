// Per-essay share cards (og:image) for aifoc.us.
//
// Hugo writes a 1200x630 card page for every essay and tutorial at
// /<path>/og-card.html (layouts/page.ogcard.html), and points og:image at
// /og/<path>.png?v=<version>. functions/og/[[path]].js serves that URL:
//
//   1. Read the card page from the static assets. Its og-card-version meta
//      is a hash of everything printed on the card.
//   2. Return the PNG from R2 (env.OG_CARDS) when one exists for that version.
//   3. Otherwise get the hook line: a share_hook front-matter value is already
//      in the page; else the og_hooks row in D1 (written from /admin/ or by an
//      earlier render); else ask Workers AI for one and store it.
//   4. Screenshot the filled-in page with Browser Run (env.BROWSER), store the
//      PNG in R2 and return it.
//
// Any failure falls back to a redirect to the site-wide card, so a share never
// gets a broken image.

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const FALLBACK_IMAGE = "/images/card.jpeg";
export const HOOK_MAX_CHARS = 140;
export const DEFAULT_HOOK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ESSAY_MAX_CHARS = 16000;
const SEGMENT_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i;

// ["agent-do-my-agent-loop.png"] -> "/agent-do-my-agent-loop/"
// ["training", "x.png"]           -> "/training/x/"
// Anything else (no .png, odd characters, too deep) -> null.
export function pagePathFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length < 1 || segments.length > 3) return null;
  const parts = [...segments];
  const last = parts.pop();
  if (typeof last !== "string" || !last.endsWith(".png")) return null;
  parts.push(last.slice(0, -4));
  if (!parts.every((p) => typeof p === "string" && SEGMENT_RE.test(p))) return null;
  return `/${parts.join("/")}/`;
}

// The key names the card version and the hook it was drawn with, so a PNG
// rendered with an old hook can never be served once the hook changes, even if
// a slow render writes it after /admin/ purged the page.
export function r2Key(pagePath, version, hookTag = "none") {
  return `cards${pagePath}${version}-${hookTag}.png`;
}

export async function hookTag(hook) {
  if (!hook) return "none";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hook));
  return [...new Uint8Array(digest).slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function r2Prefix(pagePath) {
  return `cards${pagePath}`;
}

export function cardVersion(html) {
  const m = /<meta\b[^>]*\bname=["']?og-card-version["']?[^>]*\bcontent=["']?([a-f0-9]{6,32})/i.exec(html);
  return m ? m[1] : null;
}

// True when the card page already carries a hook (share_hook front matter).
export function hasFixedHook(html) {
  return !/<p\b[^>]*\bdata-og-hook\b[^>]*><\/p>/i.test(html);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function fillHook(html, hook) {
  if (!hook) return html;
  return html.replace(/(<p\b[^>]*\bdata-og-hook\b[^>]*>)(<\/p>)/i, (_, open, close) => `${open}${escapeHtml(hook)}${close}`);
}

// Normalise model output (or an admin edit) to one plain line.
export function cleanHook(text) {
  if (typeof text !== "string") return "";
  let s = text.replace(/<[^>]*>/g, " ").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
  s = s.replace(/^(hook|line|output)\s*:\s*/i, "");
  s = s.replace(/^["'“”‘’*_]+|["'“”‘’*_]+$/g, "").replace(/\s+/g, " ").trim();
  if (s.length > HOOK_MAX_CHARS) {
    const cut = s.slice(0, HOOK_MAX_CHARS - 1);
    s = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:.-]+$/, "")}…`;
  }
  return s;
}

export function hookPrompt(title, markdown) {
  const essay = String(markdown || "").replace(/^---[\s\S]*?\n---\s*/, "").slice(0, ESSAY_MAX_CHARS);
  return [
    {
      role: "system",
      content: [
        "You write the single line of text printed under an essay's title on its social share image.",
        `Output one sentence of at most ${HOOK_MAX_CHARS - 30} characters.`,
        "State the most specific, concrete claim, result or argument in the essay, so a web developer can decide whether to read it.",
        "Use plain, direct, technically precise language. Do not repeat the title.",
        "No hype or marketing words, no emojis, no hashtags, no quotation marks, no questions aimed at the reader.",
        "Do not describe AI systems as thinking, knowing, understanding or wanting; describe what they output or do.",
        "Output only the sentence.",
      ].join(" "),
    },
    { role: "user", content: `Title: ${title}\n\nEssay:\n${essay}` },
  ];
}

export function cardTitle(html) {
  const m = /<h1\b[^>]*\bid=["']?title["']?[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return m ? m[1].replace(/<[^>]*>/g, "").trim() : "";
}

export async function readHook(db, pagePath) {
  if (!db) return null;
  try {
    return await db.prepare("SELECT hook, source FROM og_hooks WHERE path = ?").bind(pagePath).first();
  } catch {
    return null;
  }
}

// Manual hooks replace whatever is stored. AI hooks are only inserted when no
// row exists, so a generation that finishes after an /admin/ edit cannot undo it.
export async function writeHook(db, pagePath, hook, source, model = null) {
  const onConflict = source === "manual"
    ? `DO UPDATE SET hook = excluded.hook, source = excluded.source,
         model = excluded.model, updated_at = excluded.updated_at`
    : "DO NOTHING";
  await db
    .prepare(
      `INSERT INTO og_hooks (path, hook, source, model, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(path) ${onConflict}`,
    )
    .bind(pagePath, hook, source, model, Date.now())
    .run();
}

export async function generateHook(env, title, markdown) {
  if (!env?.AI || typeof env.AI.run !== "function") return "";
  const model = env.OG_HOOK_MODEL || DEFAULT_HOOK_MODEL;
  const out = await env.AI.run(model, { messages: hookPrompt(title, markdown), max_tokens: 96, temperature: 0.3 });
  const text = typeof out === "string" ? out : typeof out?.response === "string" ? out.response : out?.choices?.[0]?.message?.content;
  return cleanHook(text || "");
}

// Asks Workers AI for a hook and saves it if the page still has none.
// Returns { hook, stored }: the hook to print (the saved row wins over the
// generated text) and whether it is durable, so the PNG may be kept in R2.
export async function generateAndSaveHook(env, origin, pagePath, html) {
  try {
    const md = await env.ASSETS.fetch(new Request(new URL(`${pagePath}index.md`, origin)));
    const markdown = md.ok ? await md.text() : "";
    const hook = await generateHook(env, cardTitle(html), markdown);
    if (!hook) return { hook: "", stored: false };
    // Keep the generated hook for this render even if it cannot be saved; the
    // PNG is only stored once the hook is, so the two never disagree.
    try {
      await writeHook(env.READER_DB, pagePath, hook, "ai", env.OG_HOOK_MODEL || DEFAULT_HOOK_MODEL);
      const row = await env.READER_DB.prepare("SELECT hook FROM og_hooks WHERE path = ?").bind(pagePath).first();
      if (row?.hook) return { hook: row.hook, stored: true };
    } catch (err) {
      console.error("og hook write", pagePath, err?.message || err);
    }
    return { hook, stored: false };
  } catch (err) {
    console.error("og hook", pagePath, err?.message || err);
    return { hook: "", stored: false };
  }
}

export async function screenshot(env, html) {
  if (!env?.BROWSER || typeof env.BROWSER.quickAction !== "function") {
    throw new Error("BROWSER binding missing");
  }
  const res = await env.BROWSER.quickAction("screenshot", {
    html,
    viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
    screenshotOptions: { type: "png" },
    gotoOptions: { waitUntil: "networkidle0", timeout: 15000 },
    waitForSelector: { selector: "html.ready", timeout: 10000 },
  });
  if (!res?.ok) {
    const detail = await res?.text?.().catch(() => "");
    throw new Error(`screenshot HTTP ${res?.status}: ${String(detail).slice(0, 200)}`);
  }
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error("empty screenshot");
  return bytes;
}

// Removes every stored PNG for a page (after its hook changes).
export async function purgeCards(bucket, pagePath) {
  if (!bucket) return 0;
  let removed = 0;
  let cursor;
  do {
    const list = await bucket.list({ prefix: r2Prefix(pagePath), cursor });
    const keys = list.objects.map((o) => o.key);
    if (keys.length) {
      await bucket.delete(keys);
      removed += keys.length;
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return removed;
}

const pngHeaders = (extra = {}) => ({
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  "X-Content-Type-Options": "nosniff",
  ...extra,
});

function fallback(origin, reason) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(FALLBACK_IMAGE, origin).href,
      "Cache-Control": "public, max-age=300",
      "X-Og-Card": `fallback: ${reason}`,
    },
  });
}

export async function serveCard({ request, env, segments, waitUntil = () => {} }) {
  const url = new URL(request.url);
  const origin = url.origin;
  const pagePath = pagePathFromSegments(segments);
  if (!pagePath) return new Response("Not found", { status: 404 });

  let html;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL(`${pagePath}og-card.html`, origin)));
    if (!res.ok) return fallback(origin, "no card page");
    html = await res.text();
  } catch {
    return fallback(origin, "no card page");
  }
  const version = cardVersion(html);
  if (!version) return fallback(origin, "no card version");

  // A share_hook in front matter is already in the page; otherwise use the
  // saved hook, if there is one, to find the stored PNG.
  const fixed = hasFixedHook(html);
  const row = fixed ? null : await readHook(env?.READER_DB, pagePath);
  const bucket = env?.OG_CARDS;
  if (bucket && (fixed || row?.hook)) {
    const key = r2Key(pagePath, version, await hookTag(fixed ? "" : row.hook));
    try {
      const hit = await bucket.get(key);
      if (hit) return new Response(hit.body, { headers: pngHeaders({ "X-Og-Card": "stored" }) });
    } catch (err) {
      console.error("og r2 get", key, err?.message || err);
    }
  }

  try {
    const { hook, stored } = fixed
      ? { hook: "", stored: true }
      : row?.hook
        ? { hook: row.hook, stored: true }
        : await generateAndSaveHook(env, origin, pagePath, html);
    const key = r2Key(pagePath, version, await hookTag(hook));
    const png = await screenshot(env, fillHook(html, hook));
    if (bucket && stored) {
      waitUntil(
        bucket
          .put(key, png, { httpMetadata: { contentType: "image/png" }, customMetadata: { page: pagePath, version } })
          .catch((err) => console.error("og r2 put", key, err?.message || err)),
      );
    }
    return new Response(png, {
      headers: pngHeaders({
        "X-Og-Card": stored ? "rendered" : "rendered, not stored",
        ...(stored ? {} : { "Cache-Control": "public, max-age=300" }),
      }),
    });
  } catch (err) {
    console.error("og render", pagePath, err?.message || err);
    return fallback(origin, "render failed");
  }
}
