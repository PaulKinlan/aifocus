---
title: seamless agent identity
slug: agent-identity
draft: true
date: 2026-08-09
---

Here's a problem that snuck up on me while I wasn't looking: I've built half a dozen projects in the last few months that all needed the same thing — a way for an agent to prove who it is — and every single time I solved it differently. That's a sign. The web figured out human authentication twenty years ago (OAuth, cookies, passkeys), but when the user is software, not a person, the entire flow breaks. There's no browser. No redirect dance. No "click here to approve." And yet the need for agent identity is suddenly everywhere.

This post traces the problem through the projects that forced me to confront it, the architecture patterns that emerged, and why I think this is one of the most important — and underrated — pieces of the agentic web.

## The moment it clicked

It was a throwaway line in a project brief. I was sketching out [CDS for Agents](https://cds-for-agents.paulkinlan-ea.deno.net/), a Chrome Dev Summit experience where the attendees are agents — your agent goes to the summit alongside you, or instead of you. An agent registers for sessions, reacts to talks on a live commentary wall, gets a machine-readable challenge when the talk ends, builds a demo, and submits it to a gallery. All without a human in the loop for hours at a stretch.

The registration flow was the hard part. A human attendee scans their badge QR code, gets a claim code, and tells their agent `register(claim_code)`. The agent calls the Gateway, proves it's the right agent for that badge, and is now a verified summit attendee. That one step — linking a human identity to an agent identity through a claim code — looked simple on the whiteboard. Building it forced me to think through the whole stack.

But CDS for Agents wasn't the first time I'd hit this. Let me trace the arc.

## Project 1: pi-chaos-relay — the accidental identity system

The [pi-chaos-relay](https://github.com/PaulKinlan/pi-chaos-relay) started as a bridge: let me message my coding agent from Telegram and get replies back. The identity problem was immediate: how does the relay server know that a message is really from my agent, and that a reply is really from me?

The solution was accidental but elegant. At first setup, pi-chaos-relay generates an **ECDSA P-256 keypair**. The public key is sent to the relay server. Every subsequent request is signed with the private key. The server stores public keys, not passwords. No accounts. No email. No OAuth dance. The key *is* the identity.

![pi-chaos-relay authentication flow](/images/chaos-relay-auth-flow.svg)

This worked so well that when I later added an admin UI (`/app`), authentication followed the same model: the CLI mints a one-time device-link token (signed), the browser redeems it for a 24-hour session. Still no accounts. Still keypair-driven.

The architecture lesson: **a cryptographic keypair is the natural identity primitive for an agent**. It's machine-native, doesn't require a browser, doesn't require human presence, and the proof-of-possession is computationally cheap. For a personal agent operating on your behalf, this is the right default.

But it only covers one agent, one user, one service. What happens when you have many agents, many services, and many machines?

## Project 2: Cairn Gateway — the identity control plane

[Cairn Gateway](https://github.com/PaulKinlan/cairn-gateway) is where I went deep. The initial problem was OAuth: every time I set up a new agent or moved to a different machine, I had to re-authenticate with GitHub, Google, X, and a dozen other services. Copy `.env` files. Hope nothing leaked. It was unsustainable.

Cairn is a shared authoritative OAuth/token gateway designed for agents first. The identity architecture is the interesting bit:

**Cryptographic principals, not email accounts.** First use creates an owner keypair. The gateway stores the public key; the private key never leaves the owner's device. Email is optional contact/recovery metadata, never the root identifier.

**Device and agent keys are distinct and independently revocable.** Your laptop, your home server, your tmux session, and each agent process get their own subordinate key. One compromised device can be revoked without affecting the others. This is the lesson from chaos-relay taken to its logical conclusion: keypairs scale horizontally when they're structured as a hierarchy.

**Enrollment is a two-device ceremony.** A new device creates a keypair, presents its public key, and displays a short code or QR. An already-authorized device verifies the same code and key fingerprint with a WebAuthn assertion. The enrollment consumes the codes atomically. No shared secrets. No pairing-code replay.

**Capabilities, not tokens.** An agent doesn't get a reusable API token. It gets a five-minute capability bound to tenant, user, agent, device, connection, operation, JTI, expiry, and maximum calls. The gateway proxies the operation. The agent never sees a credential.

**Metadata-only receipts.** Every operation is logged, but the log never contains tokens, Authorization headers, cookies, OAuth codes, or raw bodies. Just the identity chain, the operation, the decision, and the outcome. The receipts are the audit trail — and because the gateway is the single chokepoint, they're authoritative.

This architecture went through an intense development cycle: a local fixture-only Stage 0 foundation, multiple correction rounds from independent security reviews, a durable authority layer, a browser-based admin interface, and a credential-free preview deployed to Deno Deploy. At the time of writing, the fixture core has 90/90 tests passing with 84% branch coverage, and three independent architecture, invariant, and identity-transaction reviews all returned **ACCEPT** with no blockers.

The Cairn architecture is comprehensive, but it's also heavy. Not every project needs a full capability gateway. Which brings me to the third pattern.

## Project 3: CDS for Agents — the claim-code bridge

CDS for Agents uses a lighter touch. The identity problem is narrower: link a human attendee to their agent for the duration of a two-day summit.

The flow: a human scans their badge QR code → receives a claim code → tells their agent `register(claim_code)`. The Gateway validates the code, binds the agent's identity to the attendee record, and issues a summit-scoped session. No keypairs. No OAuth. Just a one-time code, atomically consumed.

![CDS for Agents enrollment flow](/images/cds-agents-auth-flow.svg)

This is the pattern for **event-scoped, human-anchored agent identity**. It's less general than Cairn's cryptographic hierarchy, but it's exactly right for the use case. The agent gets exactly enough identity to participate in the summit, and no more. When the summit ends, the binding expires.

The important design decision: the claim code is *entered by the agent*, not by the human. The human generates the code; the agent proves it was the intended recipient by presenting it. This prevents humans from pretending to be agents (which is what happened to Moltbook, the agent social network that inspired parts of CDS for Agents).

## The patterns converge

After building these three systems, I can see the same architecture emerging from different angles:

| Pattern | Example | Best for |
|---|---|---|
| **Cryptographic keypair** | pi-chaos-relay | Personal agents, long-lived identity, no accounts |
| **Key hierarchy + capabilities** | Cairn Gateway | Multi-agent, multi-machine, OAuth brokering, audit |
| **Claim-code enrollment** | CDS for Agents | Event-scoped, human-anchored, time-boxed |

They're not competing. They compose. A Cairn-style gateway could issue a CDS-for-Agents claim code. A chaos-relay agent could register itself with a gateway using its ECDSA keypair. The pieces fit.

## What everyone else is building

This problem space is not quiet. The standards activity in 2026 has been extraordinary, and the convergence is striking: almost everyone is landing on DNS-anchored discovery, cryptographic proof-of-possession, and delegation chains.

### The emerging agent discovery stack

The [Agent Community's discovery stack](https://agentcommunity.org/blog/emerging-agent-discovery-stack) maps the layers:

1. **DNS-first bootstrap:** `_agent.<domain>` TXT records (AID), SVCB-based records (DNS-AID), or protocol-specific labels like `_mcp.<domain>`. The question is simple: given a domain, where's the agent entry point?
2. **Rich description:** Agent Cards (`/.well-known/agent-card.json` for A2A), MCP Server Cards, manifests, registries. What can the agent do? What auth does it need?
3. **Trust and authorization:** Who controls the namespace? Who controls the endpoint key? What may the agent do for this user?
4. **Commerce:** x402 (HTTP 402 "Payment Required" for agent payments), Stripe/OpenAI's Agentic Commerce Protocol, Google's AP2 and UCP.

This is still in flux — IETF drafts, Linux Foundation projects, and vendor products are all overlapping — but the shape is clear. The stack is separating into distinct responsibilities: routing, description, trust, authorization, and commerce are different layers.

### Identity protocols in flight

The IETF alone has over a dozen active drafts on agent identity and delegation. Here are the ones worth watching:

- **[AIP: Agent Identity Protocol](https://datatracker.ietf.org/doc/draft-singla-agent-identity-protocol/)** — DIDs, Ed25519-signed JWTs, capability manifests, signed delegation chains. Very aligned with Cairn's direction.
- **[OAuth On-Behalf-Of for AI Agents](https://www.ietf.org/archive/id/draft-oauth-ai-agents-on-behalf-of-user-02.html)** — Extends the Authorization Code Grant with a `requested_actor` parameter. The agent gets an `act` claim in the JWT. Standard OAuth, agent-flavored.
- **[AIDP: Agent Interaction & Delegation Protocol](https://datatracker.ietf.org/doc/draft-vandoulas-aidp/)** — Verifiable intent, auditable delegation chains, constrained execution boundaries.
- **[Agent Trust Negotiation](https://datatracker.ietf.org/doc/draft-somoza-dmsc-atn-agent-trust-negotiation/)** — A handshake layer that binds capabilities, delegation, and provenance.
- **[APKI: Agent Public Key Infrastructure](https://datatracker.ietf.org/doc/draft-sharif-apki-agent-pki/)** — X.509 certificates extended with agent-specific attributes: trust tiers, delegation chains.

Meanwhile, [WebMCP](https://github.com/webmachinelearning/webmcp) — Chrome's early preview for websites exposing tools to agents — shipped *without* agent identity verification. The current `ModelContextClient` interface has no way for a tool to know which agent called it. There's an [active proposal](https://github.com/webmachinelearning/webmcp/issues/105) to add `agentId`, `grantedScopes`, and `correlationId`, but it's not there yet. This is a gap that needs closing.

Microsoft's [Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/) and Auth0's [Agent as Principal](https://auth0.com/blog/agent-as-principal-purpose-built-identity-for-agents/) both argue for treating agents as first-class identity principals — not just API keys or service accounts, but entities with their own lifecycle, credentials, and policy.

### The auth.md pattern

An interesting development: [WorkOS's auth.md](https://workos.com/blog/teaching-your-api-to-onboard-ai-agents) proposes that services expose an `auth.md` file describing how agents should authenticate. An agent gets a 401, fetches `auth.md`, and follows the machine-readable instructions to register itself. It's the `robots.txt` for authentication — a discoverable, machine-readable declaration of how to get in.

Auth0, Gravitee, and several others are converging on similar patterns. The direction is clear: **agent-native authentication means the service tells the agent how to authenticate, and the agent proves its identity cryptographically, without a browser in the loop.**

## How the architecture fits together

Here's how I see the pieces composing, based on everything I've built and researched:

![Cairn Gateway full architecture](/images/cairn-gateway-architecture.svg)

The layers separate cleanly. DNS gets you to the right endpoint. A keypair proves you're the right agent. A capability gateway authorizes the specific operation. OAuth bridges the agent identity to the human user it represents. And audit receipts keep the whole thing accountable.

## The risks and challenges

This isn't a solved problem. Here's what keeps me up:

### 1. The multi-hop delegation problem

An agent calls a service, which calls another service, which calls a third. At each hop, who authorized what? The standard answer is "OAuth Token Exchange with scope attenuation," but real implementations are rare. WorkOS has a [good writeup](https://workos.com/blog/oauth-multi-hop-delegation-ai-agents) on why this is hard: the identity chain needs to be verifiable at every step, and each hop must only decrease permissions, never expand them. The IETF drafts are promising but not yet deployed at scale.

### 2. Prompt injection is the whole attack surface

CDS for Agents has a rule: the Gateway never asks agents to fetch and obey arbitrary instructions. Tools return data; the agent's owner sets policy. This is deliberately different from Moltbook's model of "curl this markdown and follow its instructions." Any system where one agent can tell another agent what to do needs to be designed like a security boundary, not a feature.

### 3. WebMCP shipped without agent identity

Chrome's WebMCP lets websites expose tools to agents. But a tool can't tell which agent called it. The platform that could be the universal agent-tool interface has no identity primitive. The [proposal to fix this](https://github.com/webmachinelearning/webmcp/issues/105) exists, but until it ships, every WebMCP tool is effectively open to any agent that can reach the origin. That's fine for a weather widget; it's terrifying for a payment tool.

### 4. The key management UX problem

Cairn's architecture is cryptographically sound, but "generate a keypair, present the public key, verify the fingerprint on a second device, and enroll with a time-limited claim code" is not a user experience most people will accept. The challenge isn't the cryptography — it's making enrollment feel as simple as scanning a QR code, while still being as secure as a two-device ceremony.

### 5. Revocation is the hard part of distributed identity

If an agent key is compromised, can you revoke it everywhere it's been used? In Cairn, revocation is immediate at the gateway — every request is checked against current grant state, not cached MCP discovery. But if an agent also has a direct token from a third-party service, the gateway can't revoke that. The revocation boundary is only as wide as the control plane.

### 6. The standards aren't standards yet

Almost everything in this space is an IETF individual draft, an ecosystem preview, or a vendor product. The Agent Community is organizing the `.agent` TLD bid. The Linux Foundation has the Agentic AI Foundation overseeing MCP and A2A. NIST has an AI Agent Standards Initiative. But there's no RFC with "agent identity" in the title that has broad deployment. The field is moving fast and convergence is visible, but it's not there yet.

## The opportunity

Despite the risks, I think this is one of the most important infrastructure problems of the next few years. Here's why:

**Every agent-to-service interaction needs identity.** Not just OAuth-protected APIs — every tool, every MCP server, every WebMCP endpoint. Without identity, every tool is either wide open or hardcoded with a single API key. Neither scales.

**The web already has the substrate.** DNS. .well-known. HTTP status codes. Cryptographic keypairs. We don't need a new internet for agents. We need a thin identity layer on top of the existing one. The AID proposal — a single TXT record at `_agent.<domain>` — is exactly the right level of ambition: minimal, discoverable, composable.

**The personal API marketplace is the killer app.** Once an agent can prove its identity and the gateway can authorize specific operations, you unlock a model where your agent discovers your available services, requests the right capability, and invokes it — all without you copying a single API key. One gateway MCP replaces a hundred individually installed provider MCPs. This is what Cairn is building toward.

**The user-to-agent binding is the trust bridge.** CDS for Agents shows the pattern: a human generates a claim code, an agent presents it, and the binding is cryptographically verifiable. Scale this beyond a conference: a service generates a claim code, you give it to your agent, and your agent is now authorized to act on your behalf for that service, with that scope, for that duration. No passwords. No OAuth dance. Just a code and a keypair.

**The timing is right.** The agent ecosystem is exploding — Claude Code, Gemini CLI, Cursor, Copilot, OpenClaw, and a dozen more all need to talk to services. The standards activity is intense and converging. The building blocks (WebCrypto, passkeys, OAuth, DNS) are already deployed. What's missing is the integration layer. That's the gap I'm trying to fill.

## What's next

I'm continuing to build Cairn Gateway through its staged milestones. Stage 0 (the cryptographic core) is accepted. Stage 1 (durable authority) is accepted. M2 (a live, public MCP endpoint with real enrollment) is in progress. The browser-based admin interface shipped at M1. Each milestone adds one piece of the architecture and gets independently reviewed before proceeding.

Meanwhile, the chaos-relay's ECDSA identity model runs in production every day, and the CDS for Agents POC demonstrates the claim-code pattern at human scale.

The three patterns — keypair identity, capability gateway, and claim-code enrollment — aren't competitors. They're components. The work ahead is making them compose into something that feels as natural for agents as OAuth feels for humans today.

If you're building in this space, I'd love to compare notes. The problem is bigger than any one implementation, and the convergence is happening in public — in IETF drafts, in GitHub issues, in blog posts like this one. The more we share architecture, the faster we get to a web where agents can prove who they are without anyone having to copy a `.env` file again.
