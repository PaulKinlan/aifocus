// Guard logic for the built /admin/ page under its script-src 'self' policy
// (used by tests/security-headers.test.mjs). Extracted from that file so the
// guard's own matching rules are unit-testable without a built page: the
// shapes this helper must reject are exactly the ones it once passed
// (aifocus-sy1d).

// Data-block script types: carried as data, not executed by the browser.
export const NON_EXECUTABLE = /^application\/(ld\+json|json)$/i;

// Attribute values may be unquoted: hugo --minify emits src=/js/main.<hash>.js.
// The name must be preceded by string start or whitespace. A bare \b anchor is
// not enough: in "data-src=", the '-' to 's' transition IS a word boundary, so
// \bsrc= matches inside data-src= (and \btype= inside data-type=), making an
// attribute of one name read as another.
export function attr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|([^\\s>]+))`, "i").exec(attrs);
  return m ? (m[1] ?? m[2]) : null;
}

// Rejection reason for one script tag's attribute string, or null if the tag
// is executable-and-same-origin or a non-executable data block. Every
// executable script on /admin/ must load from a path-absolute same-origin
// URL: exactly one leading '/' (the /admin/* policy is script-src 'self',
// with no 'unsafe-inline' and no third-party host).
export function adminScriptViolation(attrs) {
  const type = attr(attrs, "type");
  if (type && NON_EXECUTABLE.test(type)) return null; // data blocks are not executed
  const src = attr(attrs, "src");
  if (!src) return `inline <script${attrs}> is blocked by the /admin/* policy`;
  // Reject anything that is not path-absolute same-origin: '//' is
  // protocol-relative (cross-origin, and script-src 'self' blocks it at
  // runtime - a green gate here would mean a silently broken page, not a
  // bypass). '/\\' is the same shape in disguise: the URL parser normalizes
  // '\' to '/' in special schemes, so src=/\host/x.js resolves cross-origin.
  if (!/^\/(?![/\\])/.test(src)) return `script from ${src} is blocked by the /admin/* policy`;
  return null;
}
