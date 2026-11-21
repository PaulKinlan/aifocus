// Email the moderator when a note or comment lands in the pending queue.
//
// Pages Functions cannot hold a send_email binding, so the email is sent by a
// separate Worker, workers/mailer (aifocus-mailer), which holds the Cloudflare
// Email Service binding and the recipient address. This function reaches it
// through the MAILER service binding in wrangler.toml; it has no public URL
// and needs no API token.
//
// When MAILER is not bound (local dev, tests) no email is sent. A failed send
// is logged and never fails the reader's request: the comment is already
// stored and visible in /admin/.

const EXCERPT = 1200;

export function buildPendingEmail({ row, origin, postTitle }) {
  // Replies (PR #43) are comment rows with a parent_id.
  const kind = row.type === "note" ? "note" : row.parent_id ? "reply" : "comment";
  const who = row.author_name || "a signed-in reader";
  const where = postTitle || row.post;
  const excerpt = (row.body || "").length > EXCERPT ? `${row.body.slice(0, EXCERPT)}…` : row.body || "";
  const lines = [
    `New ${kind} waiting for review on ${where}`,
    "",
    `From: ${who}`,
    `Post: ${origin}${row.post}`,
    `Safety screen: ${row.screen ?? "not run"}`,
  ];
  if (row.quote_exact) lines.push("", "Passage:", `> ${row.quote_exact}`);
  lines.push("", `${kind[0].toUpperCase()}${kind.slice(1)}:`, excerpt, "", `Review it: ${origin}/admin/`);
  return {
    subject: `[aifoc.us] New ${kind} from ${who} needs review`,
    text: lines.join("\n"),
  };
}

export async function notifyPendingAnnotation(env, { row, origin, postTitle } = {}) {
  const mailer = env?.MAILER;
  if (!mailer || typeof mailer.fetch !== "function" || row?.status !== "pending") return false;
  const { subject, text } = buildPendingEmail({ row, origin, postTitle });
  try {
    // The hostname is ignored by a service binding; it only has to be a URL.
    const res = await mailer.fetch("https://aifocus-mailer/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, text }),
    });
    if (!res.ok) {
      console.error("moderation email failed", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("moderation email failed", err?.message ?? err);
    return false;
  }
}
