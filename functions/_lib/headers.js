// Baseline security headers for Function-generated responses.
//
// Why this module exists: Cloudflare Pages applies static/_headers only to
// static asset responses, never to responses a Function generates
// (documented Pages behaviour; verified against production 2026-11-08 - a
// static 404 carried the full _headers set while GET /api/auth/me, a Function
// 200, carried only the headers json() set). THREAT_MODEL.md section 4's
// "Response headers" control therefore used to hold for pages but not for
// the API, the OG renderer, or the middleware's own constructed responses
// (the markdown decoration and the root redirect). Routing every Function
// response through applySecurityHeaders() makes the baseline hold regardless
// of which layer emitted the response (aifocus-w9gv).
//
// Keep SECURITY_HEADERS in sync with the /* block of static/_headers, which
// still covers static responses; tests/security-headers.test.mjs fails the
// gate on drift. Responses passed through from next() untouched are static
// responses the edge still decorates, so the middleware deliberately does not
// add these headers there.
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'sha256-1yaycBk9N0R+ggenS5Snwwm3Nosg5SnLNtPh0Y/ONDk=' 'sha256-IUF3flK8YOXAXiwsBdzPtrEb5Mi8yBxnpPuTa1YW8Dg=' 'sha256-OT2C8mkjTtfzbjeIOx4yQUhK/H3bQfY3DiLBBQSS08Q=' 'sha256-T7B18n5lxUhbQdNBJOMpVgtViMai6phFZbBSqJnPzVE=' 'sha256-XYSBS7QVYxodoRCm0dstngA8RIonU+PO8OK28obd5HY=' 'sha256-XZJ5QZwNESjYTa1H/RWGFj1MqpcgnV/BESybTdHC/Wc=' 'sha256-Z5nurmmHOIy72MaDvzSXnibRi/6uJKXvjiykPwBPH4s=' 'sha256-ap3HAFeug9jJwukUXPy9TO0Uk2GN1afAvak6bdysY7A=' 'sha256-c61fgmN10IlDZ5hnrG+k5W7Qg/08TyvmHul2WwzG4NU=' 'sha256-hFkfSqdZ1VVhIOJn0tbMc5fKrGqz4hAGosjlSIULAmc=' 'sha256-qipDdYsSgI7TH/vUwXOfAGKUn26ye8OpeqpDGHDtOws=' 'sha256-rkq5eLFWY/E5ajRUXsw8MUUpcug0gbIfyP21695sVLA=' https://www.googletagmanager.com https://static.cloudflareinsights.com https://platform.x.com https://platform.twitter.com https://cdn.syndication.twimg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' data:; connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://cloudflareinsights.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.openai.com; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://paulkinlan.github.io https://esper.val.run https://wasm-vs-js.paulkinlan-ea.deno.net https://platform.x.com https://platform.twitter.com https://syndication.twitter.com; object-src 'none'; base-uri 'self'; form-action 'self' https://buttondown.com; frame-ancestors 'self'",
};

// Returns a response carrying the baseline security headers. Set-if-absent is
// deliberate: a handler that knows better (the OG renderer's day-long
// Cache-Control, a per-route policy) keeps its own value.
export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
