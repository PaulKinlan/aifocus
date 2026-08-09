---
title: seamless agent identity
slug: agent-identity
draft: true
date: 2026-08-09
---

I've been building a lot of agentic projects recently and they all need the same thing — a simpleish way for an agent to prove who it is.

The projects that I created needed some sort of stable identifier to identify a returning agent and sync some state, but in most cases I didn't need to know who owned the agent.

My hope with this post is to document some of the ways that I've implemented it to hopfeully give you some ideas of what you could do, and more importantly what not to do (I hear that you shouldn't roll your own crypto or your own authentication... well, I did one of those.)

It seemed to me that public/private keypairs were a possible answer to this and I thought it would be interesting to share how I've added them to a number of my projects, and how I've expanded on some of this for an experimental "Web Developer Event for Agents".

## Project 1: pi-chaos-relay.

Before pi-chaos-relay, there was [CHAOS](https://github.com/PaulKinlan/chaos) — Chrome Agent OS. A multi-agent Chrome extension where AI agents live in your browser, learn about you, and act on your behalf. Multiple agents, each with their own tools and personality, running inside a browser extension. It's ambitious and slightly unhinged, in the best way.

CHAOS needed a way for me to talk to my agents when I wasn't at my keyboard. So I built a relay server — a Deno app that bridged Telegram, Discord, and email into the extension's WebSocket. And because the relay needed to know who was sending messages and who should receive replies, I gave it an identity model: an ECDSA P-256 keypair, generated on first run, with the public key sent to the server and every request cryptographically signed.

That pattern worked so well that I extracted it into a standalone pi extension: [pi-chaos-relay](https://github.com/PaulKinlan/pi-chaos-relay). Now instead of an extension full of agents, it was my coding agent — a single pi session — that I could drive from Telegram. Same identity model, same relay server, narrower scope.

The architecture is deliberately minimal. At first setup, the agent generates an **ECDSA P-256 keypair**. The public key is sent to the relay server. Every subsequent request is signed with the private key. The server stores public keys, not passwords. No accounts. No email. No OAuth dance. The key *is* the identity.

![pi-chaos-relay authentication flow](/images/chaos-relay-auth-flow.svg)

This worked so well that when I later added an admin UI (`/app`), authentication followed the same model: the CLI mints a one-time device-link token (signed), the browser redeems it for a 24-hour session. Still no accounts. Still keypair-driven.

The architecture lesson: **a cryptographic keypair is the natural identity primitive for an agent**. It's machine-native, doesn't require a browser, doesn't require human presence, and the proof-of-possession is computationally cheap. For a personal agent operating on your behalf, this is the right default.

But it only covers one agent, one user, one service. What happens when you have many agents, many services, and many machines?

## Project 2: CDS for Agents — the claim-code bridge

[CDS for Agents](https://cds-for-agents.paulkinlan-ea.deno.net/) is a faux Chrome Dev Summit experience where the attendees are agents — your agent goes to the summit alongside you, or instead of you. An agent can register for sessions at a real event, react to talks on a live commentary wall (it's only agents talking to agents, there is no UI for humans), and gets a machine-readable challenge when the talk ends, builds a demo, and submits it to a gallery.

The registration flow was fun:

1) A human attendee scans their badge QR code, gets a unique claim code, and tells their agent visit the web site.
2) The agent reads the AGENT.md file on the site and discovers all the funcitons and finds: `register(claim_code)`. (There's an MCP server, but whose gonna install on for an event??)
3) The agent calls the Gateway, proves it's the right agent for that badge, and is now a verified summit attendee and they re-use their identity accross all interactions.

The identity problem is a bit different because there are no keypairs involved.

![CDS for Agents enrollment flow](/images/cds-agents-auth-flow.svg)

The important design decision: the claim code is *entered by the agent*, not by the human. The system generates the code for the attendee; the agent proves it was the intended recipient by presenting it. TODO: validate this.... This prevents humans from pretending to be agents (which is what happened to Moltbook, the agent social network that inspired parts of CDS for Agents).


## Project 3: Cairn Gateway — the identity control plane

[Cairn Gateway](https://github.com/PaulKinlan/cairn-gateway) is where I went a fair bit deeper. I really did not like that I am putting my secrets in a .env file and then struggling to manage OAuth access tokens, I just wanted a simple way to manage my keys across session and machines that I own.

Cairn is a shared authoritative OAuth/token gateway designed for agents first.

**Cryptographic principals, not email accounts.** First use creates an owner keypair. The gateway stores the public key; the private key never leaves the owner's device. Email is optional contact/recovery metadata, never the root identifier.

**Device and agent keys are distinct and independently revocable.** Your laptop, your home server, your tmux session, and each agent process get their own subordinate key. One compromised device can be revoked without affecting the others. This is the lesson from chaos-relay taken to its logical conclusion: keypairs scale horizontally when they're structured as a hierarchy.

**Enrollment is a two-device ceremony.** A new device creates a keypair, presents its public key, and displays a short code or QR. An already-authorized device verifies the same code and key fingerprint with a WebAuthn assertion. The enrollment consumes the codes atomically. No shared secrets. No pairing-code replay.

**Capabilities, not tokens.** An agent doesn't get a reusable API token. It gets a five-minute capability bound to tenant, user, agent, device, connection, operation, JTI, expiry, and maximum calls. The gateway proxies the operation. The agent never sees a credential.

**Metadata-only receipts.** Every operation is logged, but the log never contains tokens, Authorization headers, cookies, OAuth codes, or raw bodies. Just the identity chain, the operation, the decision, and the outcome. The receipts are the audit trail — and because the gateway is the single chokepoint, they're authoritative.

This architecture went through an intense development cycle: a local fixture-only Stage 0 foundation, multiple correction rounds from independent security reviews, a durable authority layer, a browser-based admin interface, and a credential-free preview deployed to Deno Deploy. At the time of writing, the fixture core has 90/90 tests passing with 84% branch coverage, and three independent architecture, invariant, and identity-transaction reviews all returned **ACCEPT** with no blockers.

The Cairn architecture is comprehensive, but it's also heavy. Not every project needs a full capability gateway. Which brings me to the third pattern.


## Of course I should have looked for prior art.

I sometimes like to think that I'm the first exploring something. Maybe I'm the first to think about this? Nope... not by a long shot :D There are way more experienced people whose actual job is to work on this whose proposals are way more fleshed out than anything that I scratched up. I'll just quickly drop in some links:

- **[AIP: Agent Identity Protocol](https://datatracker.ietf.org/doc/draft-singla-agent-identity-protocol/)** — DIDs, Ed25519-signed JWTs, capability manifests, signed delegation chains. Very aligned with Cairn's direction.
- **[OAuth On-Behalf-Of for AI Agents](https://www.ietf.org/archive/id/draft-oauth-ai-agents-on-behalf-of-user-02.html)** — Extends the Authorization Code Grant with a `requested_actor` parameter. The agent gets an `act` claim in the JWT. Standard OAuth, agent-flavored.
- **[AIDP: Agent Interaction & Delegation Protocol](https://datatracker.ietf.org/doc/draft-vandoulas-aidp/)** — Verifiable intent, auditable delegation chains, constrained execution boundaries.
- **[Agent Trust Negotiation](https://datatracker.ietf.org/doc/draft-somoza-dmsc-atn-agent-trust-negotiation/)** — A handshake layer that binds capabilities, delegation, and provenance.
- **[APKI: Agent Public Key Infrastructure](https://datatracker.ietf.org/doc/draft-sharif-apki-agent-pki/)** — X.509 certificates extended with agent-specific attributes: trust tiers, delegation chains.
- **Microsoft's [Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/)** and Auth0's [Agent as Principal](https://auth0.com/blog/agent-as-principal-purpose-built-identity-for-agents/) both argue for treating agents as first-class identity principals — not just API keys or service accounts, but entities with their own lifecycle, credentials, and policy.
- **[WorkOS's auth.md](https://workos.com/blog/teaching-your-api-to-onboard-ai-agents)** proposes that services expose an `auth.md` file describing how agents should authenticate. An agent gets a 401, fetches `auth.md`, and follows the machine-readable instructions to register itself. It's the `robots.txt` for authentication — a discoverable, machine-readable declaration of how to get in.

Sometimes I look at all these specifications, and like with OAuth I nope out. But realistically, once we are settled on patterns and practices our tools should just be able to build and integrate these types of interactions seamlessly.

I do think every agent-to-service interaction will need some form of identity, and I liked my model and it worked for my needs (and I wanted to share it), I know that identity management and authentication are far more complex spaces. For example, in my public-key scenario, blocking a key is pretty easy, however it's also incredibly easy for a malicious actor to just create a new key, yes they lose their state, but they could still spam.

The user-to-agent binding is the trust bridge might be more important than I thought. In the CDS for Agents pattern: a human generates a claim code, an agent presents it, and the binding is cryptographically verifiable. If you want to scale this beyond this one site/conference, well, I'm probably just re-inventing OAuth again.
