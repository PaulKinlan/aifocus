// The one place that decides whether a provider-supplied profile URL may become
// an anchor href (aifocus-d7jb).
//
// identities.profile_url and users.profile_url are written from provider modules
// (GitHub's html_url, an X handle, a Bluesky DID) and rendered as links in
// reader.js, account-page.js and admin-page.js. Each provider mints an https URL
// today, but that invariant lives in three modules and is enforced nowhere at
// the sink, so a new provider, a provider whose API stops validating html_url, or
// a row stored by an older build could put a javascript: or data: URI in a link -
// and this origin still allows inline script, so a clicked javascript: href would
// execute here (in the admin page, with the moderator's Access session attached).
//
// Absolute https only: a relative or protocol-relative value has no host to
// trust, and no other scheme is a web page. Callers render a span (plain text)
// when this returns null, so a bad value degrades to text rather than to no link
// at all.
export function safeHref(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return url.href;
}
