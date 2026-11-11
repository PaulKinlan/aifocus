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

// The one place that decides whether a provider-supplied avatar URL may become an
// <img src> (aifocus-r044).
//
// identities.avatar_url and users.avatar_url are written from provider modules
// (GitHub's avatar_url, X's profile_image_url, Bluesky's profile.avatar). Unlike
// a profile link, a bad avatar URL is not a click away from executing: the danger
// is that an <img src> issues a request the reader never asked for, which with a
// wide `img-src 'self' data: https:` (static/_headers, and deliberately wide so
// post images work - aifocus-8f3j) means any https host can be made to see the
// reader's request, their IP and their User-Agent. So the rule is tighter than
// safeHref's: absolute https AND a host one of the providers actually serves
// avatars from. Anything else renders no image at all, which degrades to a name
// with no avatar rather than to a request to an unknown host.
const AVATAR_HOSTS = new Set([
  "avatars.githubusercontent.com", // GitHub
  "pbs.twimg.com", // X
  "cdn.bsky.app", // Bluesky
]);

export function safeImgSrc(value) {
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
  if (!AVATAR_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.href;
}

// The post-path half of the same contract (aifocus-dsqv): reader-supplied post
// references are normalized to root-relative paths on write
// (normalizePostPath, functions/_lib/reader.js), but the sink cannot trust
// that a row was written by the current code - an older build, a manual D1
// edit or a future writer that skips normalization would otherwise turn a
// stored value into an anchor href, and a javascript: href clicked in /admin/
// runs with the moderator's Access session attached. Root-relative only:
// exactly one leading '/', no protocol-relative host ('//' - and no backslash
// form either, because the URL parser normalizes '\' to '/', so /\host/x
// resolves cross-origin). No control characters anywhere either: the URL
// parser strips ASCII tab, LF and CR from the input before parsing, so
// '/\t/evil.example/x' parses exactly like '//evil.example/x' and resolves
// off-origin; the remaining C0 controls are rejected with them because a
// stored path carrying a control character is malformed data under any
// reading of "root-relative". Callers render plain text when this returns
// null, like safeHref().
export function safePostPath(value) {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) && !/[\u0000-\u001f]/.test(value)
    ? value
    : null;
}
