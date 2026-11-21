// aifocus-mailer: POST { subject, text } from the Pages project (service
// binding MAILER) becomes one email to the moderator. The recipient comes from
// the MODERATION_EMAIL_TO secret, never from the request, so a caller can only
// choose the subject and body, not who receives it.

const MAX_SUBJECT = 200;
const MAX_TEXT = 8000;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!env.EMAIL || !env.MODERATION_EMAIL_TO || !env.MODERATION_EMAIL_FROM) {
      return new Response("Mailer not configured", { status: 503 });
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const subject = typeof input?.subject === "string" ? input.subject.replace(/[\r\n]+/g, " ").slice(0, MAX_SUBJECT) : "";
    const text = typeof input?.text === "string" ? input.text.slice(0, MAX_TEXT) : "";
    if (!subject || !text) return new Response("subject and text are required", { status: 400 });

    try {
      const result = await env.EMAIL.send({
        from: { email: env.MODERATION_EMAIL_FROM, name: "aifoc.us comments" },
        to: env.MODERATION_EMAIL_TO,
        subject,
        text,
      });
      return Response.json({ sent: true, messageId: result?.messageId ?? null });
    } catch (err) {
      console.error("send failed", err?.code ?? "", err?.message ?? err);
      return Response.json({ sent: false, error: err?.code ?? "send_failed" }, { status: 502 });
    }
  },
};
