---
title: seamless agent identity
slug: agent-identity
draft: true
date: 2026-08-09
---

I've been building a lot of agentic projects recently and they all need the same thing — a simpleish way for an agent to prove who it is.

The projects that I created needed some sort of stable identifier to identify a returning agent and sync some state, but in most cases I didn't need to know who owned the agent.

My hope with this post is to document the ways I've implemented it — to give you some ideas of what you could do, and more importantly what not to do. (I hear that you shouldn't roll your own crypto or your own authentication... well, I did one of those.)

It seemed to me that public/private keypairs were a possible answer to this and I thought it would be interesting to share how I've added them to a number of my projects, and how I've expanded on some of this for an experimental "Web Developer Event for Agents".

## Project 1: pi-chaos-relay

Before pi-chaos-relay, there was [CHAOS](https://github.com/PaulKinlan/chaos) — Chrome Agent OS. A multi-agent Chrome extension where AI agents live in your browser, learn about you, and act on your behalf. Multiple agents, each with their own tools and personality, running inside a browser extension.

CHAOS needed a way for me to talk to my agents when I wasn't at my keyboard. So I built a relay server — a Deno app that bridged Telegram, Discord, email and any future protocol that I want to support into the extension's WebSocket. And because the relay needed to tally the identity of what was sending messages and who should receive replies, I gave it a a simple identity model: an ECDSA P-256 keypair, generated on first run, with the public key sent to the server and every request cryptographically signed.

The pattern held up well enough that I extracted it into a standalone pi extension: [pi-chaos-relay](https://github.com/PaulKinlan/pi-chaos-relay). Now instead of a Chrome Extension full of agents, it was command line that was full of agents (i.e. pi), that I could drive from Telegram and email. I was quite happy that I could abstract the same functionality and port it to a new application. You can find more information about [pi-chaos-relay here](https://paulkinlan-ea.github.io/pi-chaos-relay/).

I tried to keep the architecture minimal. I don't want to know who is communicating through the relay or what they are communicating, it felt like a very important principal to not ask for any identity information. Obviously at some point this breaks down a bit because if you want to send an email, I need someway to validate that the email address we recieve is actually yours, but we can solve that with a one time token and a confirmation link and you could use a throw-away email address.

![pi-chaos-relay authentication flow](/images/chaos-relay-auth-flow.svg)

I really liked this entire flow. After the you install the extension, the subsequent launch of `pi` will just register with the service and then you can create new channels (i.e, email) or change all the configuration (and even point to a self-hosted service) by issuing a `/chaos-relay configure` command/

An early piece of feedback that I had from users was that had was that people still like a traditional UI to set up and configure new channels, so I needed to work out a way to connect your session up to the relay. TODO: Add a brief detail on how the hand-off to the UI works and how we exchange a token without requiring an account or having the private key exposed.

## Project 2: CDS for Agents

[CDS for Agents](https://cds-for-agents.paulkinlan-ea.deno.net/) is a faux Chrome Dev Summit experience where the attendees are agents — your agent goes to the summit alongside you, or instead of you. An agent can register for sessions at a real event, react to talks on a live commentary wall (it's only agents talking to agents, there is no UI for humans), and gets a machine-readable challenge when the talk ends, builds a demo, and submits it to a gallery.

The registration flow was fun to think about:

1. A human attendee scans their badge QR code, gets a unique claim code, and tells their agent to visit the site.
2. The agent reads the `AGENTS.md` file on the site, discovers the available tools, and calls `register(claim_code)`. (There's an MCP server too, but who's going to install one for an event?)
3. The Gateway validates the code, binds the agent to the attendee record, and issues a summit-scoped session. The agent reuses that identity across all interactions.

The identity problem is a bit different because there are no keypairs involved.

![CDS for Agents enrollment flow](/images/cds-agents-auth-flow.svg)

The important design decision: the claim code is *entered by the agent*, not by the human. The system generates the code for the attendee; the agent proves it was the intended recipient by presenting it. This prevents humans from pretending to be agents (which is what happened to Moltbook, the agent social network that inspired parts of CDS for Agents).

## Project 3: Cairn Gateway - 

I'm not sure if I will share this more broadly (i.e, there might be a website but I won't proactively share), but I'm getting more and more frustrated managing keys and OAuth callbacks and access tokens so that I can access services across agents and services. 

I also liked how Deno sandboxes have their own HTTP proxy that substitutes your ENV keys and I wanted to see if there was a different way to think about interacting with external services that I am expecting my agent to access.

The [Cairn Gateway](https://github.com/PaulKinlan/cairn-gateway) is a shared authoritative OAuth/token gateway designed for agents first. I expect this to be something you would run your own instance of given a public global secret repository would be an attractive target.

I wanted the same principal as the pi-chaos-relay: I don't really care who creates the account, I just want the credentials to be secure; but I needed some way to be able to show a UI to configure keys and manage the oauth flow that didn't require the management of an account.

It exposes one MCP server that essentially has a `query` and `execute` tool, which looks for registered services that can match the intent of the user, and then exposes a set of capabiltieis back to the agent.



**Capabilities, not tokens.** An agent doesn't get a reusable API token. It gets a five-minute capability bound to tenant, user, agent, device, connection, operation, JTI, expiry, and maximum calls. The gateway proxies the operation. The agent never sees a credential.


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

Every agent-to-service interaction will need some form of identity. My model worked for my needs (and I wanted to share it) but identity management and authentication are far more complex spaces than what I've scratched the surface of here. For example, in my public-key scenario, blocking a key is pretty easy, however it's also incredibly easy for a malicious actor to just create a new key, yes they lose their state, but they could still spam.

The user-to-agent binding (the trust bridge) might be more important than I thought. In the CDS for Agents pattern: a human generates a claim code, an agent presents it, and the binding is cryptographically verifiable. If you want to scale this beyond this one site/conference, well, I'm probably just re-inventing OAuth again.
