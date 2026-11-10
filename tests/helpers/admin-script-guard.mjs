// Guard logic for the built /admin/ page under its script-src 'self' policy
// (used by tests/security-headers.test.mjs). Extracted from that file so the
// guard's own matching rules are unit-testable without a built page: the
// shapes this helper must reject are exactly the ones it once passed
// (aifocus-sy1d, aifocus-yeda).
//
// Attribute reading is done by parse5, not a regex. The guard must see what
// the BROWSER sees: parse5 tokenizes like the HTML spec (quoted and unquoted
// values, duplicate attributes keep the first occurrence, attribute names
// never decode character references) and decodes character references in
// values, which a raw-string regex cannot do - src="/&#47;evil.example/x.js"
// passes a raw leading-'/' check while the browser resolves //evil.example.
// This is the same parser-over-regex decision the repo made for link-check
// (tools/link-check.mjs: three review rounds of regex misreads); parse5 is
// already a devDependency and costs ~0.1 s of module load per test process.
import { parseFragment } from "parse5";

// Data-block script types: carried as data, not executed by the browser.
export const NON_EXECUTABLE = /^application\/(ld\+json|json)$/i;

// Decoded attributes of one script tag's attribute string, as the browser
// would expose them ({ name, value }, lowercased names, first occurrence of
// a duplicate kept). Unparseable markup recovers to whatever attributes the
// tokenizer saw - the guard then fails closed on a missing src.
function scriptAttrs(attrs) {
  // The separating space is ours to add: callers may pass attributes with no
  // leading whitespace (<script src=...>), and without it the tag name would
  // read as "scriptsrc".
  const node = parseFragment(`<script ${attrs}>`).childNodes[0];
  return node && node.attrs ? node.attrs : [];
}

// Attribute value by name, decoded. The name must match exactly: a bare \b
// regex anchor was not enough because in "data-src=" the '-' to 's' transition
// IS a word boundary, so \bsrc= matched inside data-src= (and \btype= inside
// data-type=), making an attribute of one name read as another (aifocus-sy1d).
export function attr(attrs, name) {
  const found = scriptAttrs(attrs).find((a) => a.name === name);
  return found ? found.value : null;
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
  // The URL parser normalizes the decoded value before resolving it: leading
  // and trailing C0 controls and spaces are stripped, and every tab, LF and
  // CR is removed ANYWHERE in the input. src="/&#9;&#47;evil.example/x.js"
  // passes a leading-'/' check on the decoded value but the browser loads
  // //evil.example. Then require exactly one leading '/': '//' is
  // protocol-relative (cross-origin; script-src 'self' blocks it at runtime -
  // a green gate here would mean a silently broken page, not a bypass), and
  // '/\' is the same shape in disguise ( '\' normalizes to '/' in special
  // schemes, so src=/\host/x.js resolves cross-origin).
  const url = src.replace(/^[\0-\x20]+/, "").replace(/[\0-\x20]+$/, "").replace(/[\t\n\r]/g, "");
  if (!/^\/(?![/\\])/.test(url)) return `script from ${src} is blocked by the /admin/* policy`;
  return null;
}
