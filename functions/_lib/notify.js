// Email the moderator when a note or comment lands in the pending queue.
//
// Sent through Cloudflare Email Service. Pages Functions cannot use the
// send_email binding, so this calls the REST API:
//   POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
// https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
//
// Configuration (all optional; when any is missing no email is sent):
//   MODERATION_EMAIL_FROM  [vars] in wrangler.toml. Sender on a domain
//                          onboarded for Email Sending (aifoc.us).
//   MODERATION_EMAIL_TO    Pages secret. Kept out of the public repo.
//   CF_ACCOUNT_ID          Pages secret (or var). Account that owns aifoc.us.
//   EMAIL_API_TOKEN        Pages secret. API token with "Email Sending: Edit".
//
// A failed send is logged and never fails the reader's request: the comment
// is already stored and visible in /admin/.

const API = "https://api.cloudflare.com/client/v4";
const EXCERPT = 1200;

export function moderationEmailConfig(env) {
  const from = env?.MODERATION_EMAIL_FROM;
  const to = env?.MODERATION_EMAIL_TO;
  const account = env?.CF_ACCOUNT_ID;
  const token = env?.EMAIL_API_TOKEN;
  if (!from || !to || !account || !token) return null;
  return { from, to, account, token };
}

export function buildPendingEmail({ row, origin, postTitle }) {
  const kind = row.type === "note" ? "note" : "comment";
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

export async function notifyPendingAnnotation(env, { row, origin, postTitle, fetchImpl = fetch } = {}) {
  const config = moderationEmailConfig(env);
  if (!config || row?.status !== "pending") return false;
  const { subject, text } = buildPendingEmail({ row, origin, postTitle });
  try {
    const res = await fetchImpl(`${API}/accounts/${encodeURIComponent(config.account)}/email/sending/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { address: config.from, name: "aifoc.us comments" },
        to: config.to,
        subject,
        text,
      }),
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
