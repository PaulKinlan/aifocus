# Threat Model: aifoc.us

What this file is for: the deployed site's attack surface, the controls that
defend each part of it, and the risks knowingly accepted. It exists so a
reviewer can judge whether a flagged path is inside the defended surface
without re-deriving the whole system, and so the software-factory
`threat-model` station has a committed model to read instead of generating one
per run (aifocus-1is).

Keep this file current. It is part of the review, not documentation drift: a
change that adds a route under `functions/`, a binding in `wrangler.toml`, a
migration in `migrations/`, or an allowlist in `static/_headers` changes this
file in the same branch.

## 1. The system

- A Hugo site built into `public/` and served by Cloudflare Pages.
- Pages Functions in `functions/`, one module per route, plus `functions/_lib/`
  helpers and `functions/_middleware.js` (which runs on every request).
- Bindings, from `wrangler.toml`: `AI` (Workers AI), `BROWSER` (Browser Run),
  `OG_CARDS` (R2 bucket `aifocus-og`), `READER_DB` (D1 `aifocus-reader`), plus
  the `[vars]` `AI_SEARCH_PUBLIC_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`,
  `GITHUB_CLIENT_ID` and the `GITHUB_CLIENT_SECRET` Pages secret.
- Schema: `migrations/0001`-`0010`. Anything that stores reader data, an IP
  hash or a rate-limit ledger lives there.
- Out of scope: the agent fleet and the software factory (`~/agents`,
  `~/fleet`), the journal, and anything that only exists on a build machine.

## 2. Assets

| Asset | Why it matters | Where it lives |
|:---|:---|:---|
| Inference budget | Every `AI`, AI Search and `BROWSER` call is billed per call; it is the only metered cost of running the site, and the only way to deny service cheaply | `functions/api/ask.js`, `functions/api/search.js`, `functions/og/[[path]].js` |
| Published content | The site's whole purpose; a defacement or a silently wrong share card is the highest-visibility failure | `public/`, R2 `aifocus-og` |
| Reader data | Accounts, linked identities, sessions, notes, comments, highlights, reactions, and IP hashes on every metered log | D1 `aifocus-reader` |
| Moderation authority | Approving, rejecting, trusting and deleting content is the one privilege in the system | `/admin/*`, `/api/admin/*` behind Cloudflare Access |
| Flow secrets | OAuth secrets, authorization codes, session tokens, DPoP private keys | Pages secrets, `sessions`, `oauth_states`, `console.*` output |
| Access configuration | `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` decide what the admin guard accepts | `wrangler.toml` `[vars]` (not secret; still load-bearing) |
| Reader-held provider keys | The journal demo's opt-in "remember on this device" stores a live bearer credential with billing authority in origin-wide `localStorage`, readable by any script on the origin and never held server-side | reader browser storage (`wpr_demo_apikey_*`), disclosed next to the key field | 

## 3. Actors and what they can reach

| Actor | Credential | Can reach |
|:---|:---|:---|
| Anonymous internet | none | every static page, `GET /api/search`, `POST /api/ask`, `GET /api/reader/state`, `POST /api/reader/reactions`, `POST /api/reader/annotations` (highlights only), `GET /api/auth/start/<provider>`, `/api/auth/callback/<provider>`, `/og/*.png` |
| Reader | `aifocus_reader` cookie (client-held 32-hex id) | the above, plus deleting its own highlights and reactions; it sees its own pending notes |
| Signed-in reader | session token; only its SHA-256 is stored | notes and comments, `/api/account`, `/api/auth/logout` |
| Browser agent (MCP client) | none of its own - it runs inside a visitor's browser and calls the tools registered on `document.modelContext`/`navigator.modelContext`: the four in `assets/js/webmcp.js` plus the three 404-game controls (`game_state`, `game_jump`, `game_restart`) registered by inline script in `layouts/404.html` | `list_articles`, `search_articles`, `read_article` and `contact_paul` (§4); the 404 game controls (§5, zero network/storage/credential reach). No tool reaches `/admin/*` or D1. The only server endpoint a tool calls is the public `GET /api/search` (`search_articles`, the same endpoint any anonymous visitor can reach), and the only fetch is `read_article`'s, which is same-origin published essays fetched with `credentials: "omit"` |
| Moderator | Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) | everything under `/api/admin/*` |
| Identity provider | none (we call out to it) | its error text reaches our logs; its redirects reach our redirect targets |
| Holder of a D1 copy | none | every stored row, including salted IP hashes and any key we ever put in the database |

That last row is the reason the model treats "stored in D1" as "disclosed to
anyone who can read a backup, a replica or a debug session".

## 4. Controls, per surface

| Surface | Control | Enforced in |
|:---|:---|:---|
| Cross-origin writes | `isSameOrigin()` requires the `Origin` header to equal the request's own origin; a request with no `Origin` is rejected, not allowed | `functions/_lib/reader.js`, called by every POST handler |
| CSRF | the same-origin check plus `SameSite=Lax` on both cookies | `functions/_lib/reader.js`, `functions/_lib/auth.js` |
| Metering | a per-IP budget for reader writes (30/hour), search (30/hour), reads (600/hour: `/api/reader/state`, `/api/account` and `/api/auth/me` share one `read_events` budget), ask (20/hour), auth starts (30/hour) and share-card renders. The write, search, read and auth-start meters are **reservations**: one conditional INSERT that consumes the slot before the work it pays for (`write_events`, `search_log`, `read_events`, `auth_start_log`). The share-card renderer holds an in-flight reservation per card. `/api/ask` is the exception twice over: it reads a count and INSERTs `ask_log` only after the answer is generated, so the slot does not precede the billing | `functions/_lib/reader.js reserveWriteEvent reserveReadEvent`, `functions/api/search.js reserveSearchSlot`, `functions/api/auth/start/[provider].js reserveAuthStartSlot`, `functions/api/reader/state.js`, `functions/api/account.js`, `functions/api/auth/me.js`, `functions/api/ask.js`, `functions/_lib/og.js` |
| Metering failure mode | the reader-write, search and auth-start limiters **fail closed**: a missing binding, a missing table or a database error denies (429/503) rather than allowing unmetered work. The read meter degrades differently by design: a missing `read_events` table falls back to a per-isolate in-memory cap instead of a 503 (aifocus-s9o), which is why this list does not name it. **`/api/ask` is the exception** - it answers "not limited" when `READER_DB` is unbound and its count-then-insert is not atomic, so an unbound deployment bills uncapped inference (open: aifocus-5ft, aifocus-e7e; see section 6) | `functions/_lib/reader.js reserveWriteEvent`, `functions/api/search.js reserveSearchSlot`, `functions/api/auth/start/[provider].js reserveAuthStartSlot` |
| Shared cache | identical questions are answered from the edge cache before the meter, so a cached answer costs nothing and does not spend a slot | `functions/api/ask.js` |
| Admin authority | RS256 Access JWT verified against the team's published certs, with `aud`, issuer and expiry checked; the guard is called **per handler** (eight call sites, one per exported handler in the five `functions/api/admin/*` modules), and there is no prefix-level guard. The browser attaches that JWT to any same-origin request, so the `/admin/` **page** runs under its own CSP with `script-src 'self'` - no `'unsafe-inline'`, no third-party hosts - and `head.html` skips the gtag block, the inline speculation rules and the `onload` font promotion for `type: admin`, so content-page script trust is not shared with the moderator's authority (aifocus-wwfp). `/api/admin/*` itself is unaffected: it is JSON behind the per-handler guard | `functions/_lib/access.js`, `functions/api/admin/*`, `static/_headers` `/admin/*`, `themes/aifocustheme/layouts/_partials/head.html` |
| Session tokens | 32-byte random, stored only as SHA-256, `HttpOnly; Secure; SameSite=Lax` | `functions/_lib/auth.js` |
| OAuth state | single-use row deleted on read, bound to a cookie, expired on a TTL | `functions/_lib/auth.js` |
| IP addresses | never stored in the clear: salted SHA-256, with the salt in the `settings` table | `functions/_lib/reader.js hashIp` |
| Response headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, a site CSP (with `frame-ancestors 'self'`), a narrowed `/admin/*` CSP (`script-src 'self'`), `noindex` on `/admin/*` and on share-card pages | `static/_headers` (static responses), `functions/_lib/headers.js` (Function responses) |
| Input limits | per-field caps on quote, context, body and name; query length and result limit capped; post paths normalised against the built `/index.json` | `functions/_lib/reader.js LIMITS`, `functions/api/search.js`, `functions/api/reader/annotations.js` |
| Profile links | a provider-supplied `profile_url`/`profileUrl` becomes an anchor `href` only through `safeHref()`, which accepts an absolute `https:` URL and nothing else - any other value renders as plain text. The same rule is applied on the way into and out of D1, so a provider that starts returning a `javascript:`/`data:` URI, or a row stored before the guard, cannot reach a page (aifocus-d7jb) | `assets/js/safe-href.js`, `functions/_lib/auth.js safeProfileUrl`, `tests/safe-href.test.mjs`, `tests/first-party-sinks.test.mjs` |
| Markdown negotiation | `_middleware.js` only rewrites to the `.md` sibling for paths that pass `isValidContentPath` and `isUnsafePath`; the root redirect only accepts a same-origin single-segment permalink path (§5.1 quotes the exact expression, so it is written once) | `functions/_middleware.js` |
| WebMCP agent tools | `read_article` treats its `url` argument as untrusted agent input: it must parse same-origin **and** resolve to an essay in the built `/index.json` (`findArticle()`) before anything is fetched - a matching origin alone is not enough, because a same-origin fetch from this page would carry the reader session and the moderator's Access cookie. The fetch itself sends `credentials: "omit"` so it rides no credential even if a path ever got past that check. Invariant: **`read_article` may fetch only paths the built `/index.json` lists**. `list_articles` reads that same `/index.json`; the only server endpoint any tool calls is the public metered `GET /api/search` (via `search_articles`); no tool touches `/admin/*` or D1. `contact_paul` navigates its `mailto:` draft only after `agent.requestUserInteraction()` + `window.confirm()`, so no mail is composed without a human click. The file is also inside the origin-wide markup-sink ban (aifocus-mcqz) | `assets/js/webmcp.js`, `tests/first-party-sinks.test.mjs` |

The edge applies `static/_headers` to static responses only, never to
Function-generated ones - documented Pages behaviour, verified against
production 2026-11-08 (a static 404 carried the full set while a Function 200
from `/api/auth/me` carried only what its handler set). Function responses
therefore carry the same baseline from code: `functions/_lib/headers.js`
(`applySecurityHeaders`, set-if-absent so a handler's own value wins) is wired
into `json()`, the OAuth redirect helper, the OG renderer, and the responses
`_middleware.js` itself constructs. `tests/security-headers.test.mjs` fails
the gate if the code-side set and the `_headers` `/*` block drift apart, or if
a Function response path is built without the baseline, and if the `/admin/*`
policy stops being the `/*` policy with `script-src` narrowed to `'self'` (the
one duplicated block, deliberately: the two must change together). A route that
needs different headers says so in its handler, and the set-if-absent rule
keeps that value.

## 5. Declared non-issues

These have been reported by the audit and rejected after reading the code.
Each one states what would re-open it, so a later finding that looks the same
can be checked rather than re-argued.

1. **Redirect destination derived from a path expression, and the "post-auth
   redirect does not enforce same-origin" variant** (`_middleware.js:252`).
   `isValidLatestPostPath()` accepts only `/^\/(?:posts\/)?[a-z0-9][a-z0-9-]*\/$/i` (single segment, first character alphanumeric), and
   `new URL(path, url.origin)` cannot leave the origin for a value that starts
   with `/`. Re-opens if the destination ever comes from a query parameter, a
   header, or the contents of `latest-post.txt` beyond that regex.
2. **`withParam()` resolves against a hardcoded `https://aifoc.us`**
   (`functions/_lib/auth.js:248`). It returns only `pathname + search + hash`, so the
   origin is parsed and discarded. Not an open redirect; a preview deployment
   building links against production is a portability nit, not a security
   issue.
3. **`innerHTML` built by joining an array in the journal demo**
   (`static/where-prompts-run-demo/demo.js`). Originally declared a non-issue
   because every interpolated value passed through `escapeHtml()`. The join is
   gone entirely: the tree and transcript are now DOM-built with
   `textContent`, `escapeHtml` is removed, and the ban is origin-wide:
   `tests/where-prompts-demo-sinks.test.mjs` guards the demo bundle and
   `tests/first-party-sinks.test.mjs` applies the same raw-source token ban to
   every first-party script (`assets/js/**/*.js`, `static/**/*.js`), with the
   single sanctioned clearing assignment in `stats-page.js` pinned by exact
   line (aifocus-qsv3, aifocus-mcqz). Re-opens only if those guards are
   deleted or bypassed.
4. **`design-token-drift-colors` in `public/*`.** `public/` is Hugo build
   output, not source; the source instances are tracked as aifocus-c1a.
5. **`missing-responsive-viewport-meta` on share-card pages.** The og-card
   layout deliberately emits `width=1200` for screenshot fidelity, and the
   regular pages get the meta from the head partial.
6. **Candidates anchored under `public/**`.** `public/` is Hugo build output,
   not source: perf/media and link candidates there (share-card pages,
   generated report pages, built link targets) are re-derived from the sources
   each build, so the anchor is the wrong place to fix. Fixed in the source
   page or generator instead (see aifocus-ug4k for the worked example).
   Re-opens for a `public/` path that is hand-committed source rather than
   build output - check `git ls-files` before dismissing.
7. **Module paths written without the `functions/` prefix**
   (`functions/_lib/…`, `functions/api/…` in prose and table cells). §1 fixes the convention
   ("Pages Functions in `functions/`"), and every module path now carries the
   full `functions/…` prefix, so the doc-missing-file candidates that read the
   bare form as a repo-root path have nothing left to match. Re-opens when a
   new row or sentence names a module without the prefix.
8. **The WebMCP game tools on the 404 page** (`layouts/404.html`).
   `game_state`, `game_jump` and `game_restart` are client-side controls for
   the canvas game: they read and mutate the game's in-memory state (score,
   best, player position, bug list) and nothing else - no `fetch()`, no
   `localStorage`, no cookies, no credential, no markup sink (verified by
   reading the registrations; `best` is a page variable, not persisted). The
   browser-agent actor of §3 can call them, and the worst outcome is a lost
   high score. Re-opens if a game tool gains any network, storage or
   credential reach, or if registration moves out of the inline script - which
   also re-opens the layouts inline-script question (aifocus-9xgd: the
   origin-wide sink ban does not scan `layouts/*.html` inline script today,
   and `layouts/404.html:84` builds the game-over message with `innerHTML`
   from numeric state).

## 6. Known gaps and open work

Security-relevant items from the 2026-11-04 project audit, each with its bead.
This list is a pointer, not the ledger: `bd list` is authoritative.

### Open

| Bead | Gap |
|:---|:---|
| aifocus-710 | the IP-hash salt sits in the same database as the hashes (the retention half is fixed: `reserveAskSlot` prunes `ask_log` rows older than two hours on every reservation) - see section 7 |
| aifocus-wxl | the journal demo's OPFS sandbox is shared origin-wide across provider pages, contradicting the UI copy |
| aifocus-4go1 | the demo's provider-key persistence (section 7) is accepted, not fixed: drop the "remember on this device" opt-in or serve the demo from its own origin - a product decision, not a lane change |

### Closed since the 2026-11-04 audit

| Bead | Gap | Closed by |
|:---|:---|:---|
| aifocus-5ft, aifocus-e7e, aifocus-4hu1 | `/api/ask` failed open when `READER_DB` was unbound, so inference ran unmetered; and the `ALLOW_UNMETERED_ASK` hatch was gated on "not production", so a flagged preview deployment served uncapped billed inference | the meter reserves before the billed call and fails closed (aifocus-5ft); the hatch is loopback-only (aifocus-4hu1, merged 4514def) |
| aifocus-80p | reader writes reserved the per-IP slot after fetching the post text | 0442587 (merged 04aa268) |
| aifocus-lsf | the Bluesky DPoP private key was stored in plaintext in `oauth_states.data` | 7f73503: the key travels in the HttpOnly `aifocus_dpop` cookie scoped to `/api/auth/callback/bluesky`; D1 holds only the thumbprint |
| aifocus-e3x | OAuth start/callback logged provider error text verbatim, which could carry codes and token URLs | e43aef6: provider error text is classified against an OAuth code whitelist, parse failures report fixed messages, and handlers log a credential-free single-line summary |
| aifocus-f7r | privileged trust/block changes recorded no actor, and there was no admin audit table | d93f730 and 6e37443: `migrations/0009_admin_actions.sql`, with `adminActionStmt()` called from every admin handler |
| aifocus-0cz | `/api/reader/state` ran three D1 queries per unauthenticated request with no per-IP cap | 245ce0d: `reserveReadEvent` (600/hour, `read_events`) reserves before the batch; extended to `/api/account` and `/api/auth/me` in aifocus-pr7b |
| aifocus-rom | there was no account erasure path | dbf82c8: `DELETE /api/account` hard-deletes the account, its sign-ins and its activity |

## 7. Accepted residual risk

- **The per-IP budget bounds one source, not a flood.** Rotating IPs defeats it
  by design; a distributed flood is a Cloudflare-level control, not an
  application one.
- **The reader cookie is client-held.** Rotating it is trivial, so the
  per-reader limit is advisory and the per-IP ledger is the real bound.
- **The AI Search instance URL is public configuration.** `AI_SEARCH_PUBLIC_URL`
  is in `wrangler.toml` and the instance can be queried directly, outside
  `/api/search`'s meter. The mitigation is a rate limit configured on the
  instance in Cloudflare, not a code change; the site's meter protects its own
  endpoint only.
- **The Access guard is per route.** A new module under `functions/api/admin/`
  that forgets `verifyAccess()` is unguarded. Reviewing that directory for the
  call is the control until a prefix-level guard exists.
- **The narrowed `/admin/*` CSP trusts first-party script.** `script-src 'self'`
  removes inline script and third-party origins from the moderation page and its
  `on*` handlers, but a bundled module - or anything vendored into `js/` - still
  runs with the moderator's Access cookie attached. The boundary is "our code as
  built", not "no code"; treating a first-party dependency as trusted is the
  residual risk, and the reason the admin page loads no analytics at all rather
  than allowlisting it.
- **A reader's provider API key can sit in origin-wide `localStorage`** when the
  journal demo's "remember on this device" box is ticked:
  `persistKeyForThisDevice()` (`static/where-prompts-run-demo/demo.js`) stores
  the live bearer key under `wpr_demo_apikey_<provider>` after an explicit
  opt-in that is disclosed next to the field. The key is a billable credential
  on an external account the site cannot revoke. The demo pages themselves run
  a `script-src 'self'` meta CSP, but `localStorage` is origin-wide and every
  content page runs the baseline policy, whose `script-src` allows inline
  script and five third-party origins (gtag, Cloudflare Insights, and three
  X/Twitter embed hosts) - so any script a content page loads, or an XSS there, can read the
  stored key. This is **accepted while the origin's script trust holds** (the
  same dependency the inline-script question in aifocus-5wrp turns on): the
  baseline `script-src` stays this narrow, and first-party script stays
  sink-clean (section 4). It re-opens - moves to section 6 - if a content-page
  script source is widened, if the demo stops disclosing the opt-in, or if a
  sink reaches a content page. The fix options are open work, not accepted
  silently: drop persistence in favour of page memory, or serve the demo from
  its own origin/hostname (aifocus-4go1).
- **IP hashes are brute-forceable by a database reader** while the salt lives
  in the same database (aifocus-710): the IPv4 space is small enough to
  enumerate against a known salt.
- **Ask answers are model output and can be wrong.** The page says so, sources
  are returned with every answer, and the prompt forbids unsupported claims;
  that is the mitigation, not a guarantee.

## 8. Review triggers

Re-read this file when a change:

- adds or moves a route under `functions/`, especially under `functions/api/admin/`;
- adds a binding, a `[vars]` entry, or a secret;
- adds a migration, or changes what an existing table stores about a person;
- changes `static/_headers` allowlists, or adds an inline script, an `on*`
  handler or a third-party `<script>` to a template - `head.html` guards those
  surfaces for `type: admin`, and a new one needs the same guard or it silently
  stops working on `/admin/` (the `/admin/*` policy is narrower than `/*`);
- makes a new caller of `reserveWriteEvent()`, `reserveSearchSlot()`, `askLog`
  or the og render reservation, or moves that call relative to the work it
  pays for;
- introduces a new place where provider-supplied text reaches a log, a
  redirect, an `innerHTML` or an `href`;
- changes `static/where-prompts-run-demo/**` - the demo pages' meta CSP, the
  demo's `localStorage` use (`wpr_demo_apikey_*`, `persistKeyForThisDevice()`)
  or its opt-in disclosure - or widens any content page's `script-src` in
  `static/_headers`: the demo's provider-key persistence is classified as
  accepted risk (section 7) only while the origin's script trust holds, and the
  disclosure is part of that classification;
- adds a `registerTool` call to `assets/js/webmcp.js` or to `layouts/404.html`,
  widens `read_article`'s
  target set beyond the `/index.json` essay list, or changes that fetch's
  `credentials` mode - the WebMCP surface is an actor with no site credential
  (§3) whose entire reach is the two-part guard in §4 and the zero-reach game
  controls in §5, so a new tool or a wider target re-opens the question of
  what an agent can reach;
- closes a bead that appears in section 6 - move its row to the closed table
  in the same branch.
