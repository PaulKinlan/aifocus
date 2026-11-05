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
- Pages Functions in `functions/`, one module per route, plus `functions/`
  `_lib/` helpers and `functions/_middleware.js` (which runs on every request).
- Bindings, from `wrangler.toml`: `AI` (Workers AI), `BROWSER` (Browser Run),
  `OG_CARDS` (R2 bucket `aifocus-og`), `READER_DB` (D1 `aifocus-reader`), plus
  the `[vars]` `AI_SEARCH_PUBLIC_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`,
  `GITHUB_CLIENT_ID` and the `GITHUB_CLIENT_SECRET` Pages secret.
- Schema: `migrations/0001`-`0008`. Anything that stores reader data, an IP
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
| Moderator | Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) | everything under `/api/admin/*` |
| Identity provider | none (we call out to it) | its error text reaches our logs; its redirects reach our redirect targets |
| Holder of a D1 copy | none | every stored row, including salted IP hashes and any key we ever put in the database |

That last row is the reason the model treats "stored in D1" as "disclosed to
anyone who can read a backup, a replica or a debug session".

## 4. Controls, per surface

| Surface | Control | Enforced in |
|:---|:---|:---|
| Cross-origin writes | `isSameOrigin()` requires the `Origin` header to equal the request's own origin; a request with no `Origin` is rejected, not allowed | `functions/_lib/reader.js`, called by every POST handler |
| CSRF | the same-origin check plus `SameSite=Lax` on both cookies | `_lib/reader.js`, `_lib/auth.js` |
| Metering | a per-IP budget for reader writes (30/hour), search (30/hour), ask (20/hour), auth starts (30/hour) and share-card renders. The write and search meters are **reservations**: one conditional INSERT that consumes the slot before the work it pays for (`write_events`, `search_log`). The share-card renderer holds an in-flight reservation per card. `/api/ask` is the exception twice over: it reads a count and INSERTs `ask_log` only after the answer is generated, so the slot does not precede the billing | `_lib/reader.js reserveWriteEvent`, `api/search.js reserveSearchSlot`, `api/auth/start/[provider].js reserveAuthStartSlot`, `api/ask.js`, `_lib/og.js` |
| Metering failure mode | the reader-write, search and auth-start limiters **fail closed**: a missing binding, a missing table or a database error denies (429/503) rather than allowing unmetered work. **`/api/ask` is the exception** - it answers "not limited" when `READER_DB` is unbound and its count-then-insert is not atomic, so an unbound deployment bills uncapped inference (open: aifocus-5ft, aifocus-e7e; see section 6) | `_lib/reader.js reserveWriteEvent`, `api/search.js reserveSearchSlot`, `api/auth/start/[provider].js reserveAuthStartSlot` |
| Shared cache | identical questions are answered from the edge cache before the meter, so a cached answer costs nothing and does not spend a slot | `api/ask.js` |
| Admin authority | RS256 Access JWT verified against the team's published certs, with `aud`, issuer and expiry checked; the guard is called **per handler** (eight call sites, one per exported handler in the five `api/admin/*` modules), and there is no prefix-level guard | `_lib/access.js`, `api/admin/*` |
| Session tokens | 32-byte random, stored only as SHA-256, `HttpOnly; Secure; SameSite=Lax` | `_lib/auth.js` |
| OAuth state | single-use row deleted on read, bound to a cookie, expired on a TTL | `_lib/auth.js` |
| IP addresses | never stored in the clear: salted SHA-256, with the salt in the `settings` table | `_lib/reader.js hashIp` |
| Response headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, a site CSP (with `frame-ancestors 'self'`), `noindex` on `/admin/*` and on share-card pages | `static/_headers` |
| Input limits | per-field caps on quote, context, body and name; query length and result limit capped; post paths normalised against the built `/index.json` | `_lib/reader.js LIMITS`, `api/search.js`, `api/reader/annotations.js` |
| Markdown negotiation | `_middleware.js` only rewrites to the `.md` sibling for paths that pass `isValidContentPath` and `isUnsafePath`; the root redirect only accepts a same-origin single-segment permalink path (§5.1 quotes the exact expression, so it is written once) | `functions/_middleware.js` |

`static/_headers` is the only place the security headers are declared: the
Functions code adds none of its own, so the model assumes the edge applies
those rules to function responses too. A route that needs different headers
must say so there rather than in code.

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
   (`_lib/auth.js:248`). It returns only `pathname + search + hash`, so the
   origin is parsed and discarded. Not an open redirect; a preview deployment
   building links against production is a portability nit, not a security
   issue.
3. **`innerHTML` built by joining an array in the journal demo**
   (`static/where-prompts-run-demo/demo.js`). Originally declared a non-issue
   because every interpolated value passed through `escapeHtml()`. The join is
   gone entirely: the tree and transcript are now DOM-built with
   `textContent`, `escapeHtml` is removed, and
   `tests/where-prompts-demo-sinks.test.mjs` fails the gate if an interpolating
   `innerHTML` assignment or the helper returns (aifocus-qsv3). Re-opens only
   if that guard is deleted or bypassed.
4. **`design-token-drift-colors` in `public/*`.** `public/` is Hugo build
   output, not source; the source instances are tracked as aifocus-c1a.
5. **`missing-responsive-viewport-meta` on share-card pages.** The og-card
   layout deliberately emits `width=1200` for screenshot fidelity, and the
   regular pages get the meta from the head partial.

## 6. Known gaps and open work

Security-relevant items from the 2026-11-04 project audit, each with its bead.
This list is a pointer, not the ledger: `bd list` is authoritative.

| Bead | Gap |
|:---|:---|
| aifocus-5ft, aifocus-e7e | `/api/ask` fails open when `READER_DB` is unbound, so inference runs unmetered; the `ALLOW_UNMETERED_ASK` escape hatch is not gated on a local origin |
| aifocus-80p | reader writes reserved the per-IP slot after fetching the post text (fixed on `fleet/audit-1`) |
| aifocus-lsf | the Bluesky DPoP private key is stored in plaintext in `oauth_states.data` |
| aifocus-e3x | OAuth start/callback log provider error text verbatim, which can carry codes and token URLs |
| aifocus-f7r | privileged trust/block changes record no actor and there is no admin audit table |
| aifocus-0cz | `/api/reader/state` runs three D1 queries per unauthenticated request with no per-IP cap |
| aifocus-rom | there is no account erasure path (needs a product decision: hard delete or anonymise) |
| aifocus-710 | `ask_log` rows, and the IP hashes in them, are never pruned; the salt sits in the same database |
| aifocus-wxl | the journal demo's OPFS sandbox is shared origin-wide across provider pages, contradicting the UI copy |

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
- **IP hashes are brute-forceable by a database reader** while the salt lives
  in the same database (aifocus-710): the IPv4 space is small enough to
  enumerate against a known salt.
- **Ask answers are model output and can be wrong.** The page says so, sources
  are returned with every answer, and the prompt forbids unsupported claims;
  that is the mitigation, not a guarantee.

## 8. Review triggers

Re-read this file when a change:

- adds or moves a route under `functions/`, especially under `api/admin/`;
- adds a binding, a `[vars]` entry, or a secret;
- adds a migration, or changes what an existing table stores about a person;
- changes `static/_headers` allowlists, or adds an inline script;
- makes a new caller of `reserveWriteEvent()`, `reserveSearchSlot()`, `askLog`
  or the og render reservation, or moves that call relative to the work it
  pays for;
- introduces a new place where provider-supplied text reaches a log, a
  redirect or an `innerHTML`.
