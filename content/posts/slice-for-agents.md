---
title: slice for agents
date: 2026-05-05T09:30:00.000Z
slug: slice-for-agents
draft: true
authors:
  - paulkinlan
---

I wrote about the [SLICE properties of the web](https://paul.kinlan.me/slice-the-web/) a few years ago. Five letters: Secure, Linkable, Indexable, Composable, Ephemeral. I think they are the reason the web scaled and most other platforms didn't. Now I find myself asking the same question again, only for agents. When the citizens of the web are not just pages but also programs that read pages, call other programs, and make decisions on their own, what shape does the web take to accommodate them, and which of those five letters survive?

The polite answer is "we don't know yet". The honest answer is "we mostly know, and we're choosing not to use it". Most of the pieces of an agent-friendly web already exist. What is missing is anyone arguing for the shape they make when assembled.

Let me walk through what's actually on the table.

[**MCP over HTTP**](https://modelcontextprotocol.io/specification/draft/basic/authorization) is Anthropic's Model Context Protocol with HTTP transport and OAuth 2.1. The 2026 draft adds `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` for discovery. Adoption is broad, but the protocol is widely criticised for [OAuth-in-MCP being a footgun](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol), heavy SDKs, and stateful sessions that fight scale-to-zero. SLICE-wise, it is Linkable, Composable poorly (clients pin to one server at a time), Ephemeral against the spec, Secure is a work in progress, and Indexable is weak because there is no canonical registry.

[**WebMCP**](https://webmcp.link/) shipped in [Chrome 146](https://developer.chrome.com/blog/webmcp-epp) and Edge 147 as a `navigator.modelContext` API. It is MCP, but in the page. The browser is the sandbox and the page is the server. This one passes most of SLICE cleanly: Secure (origin model), Linkable (URLs), Composable (iframes still work), Ephemeral (close the tab and it is gone). The catch is it solves agent affordances inside a page, not server-to-server agent calls. I have [argued before](/webmcp-is-the-new-web-intents) that someone is going to wrap WebMCP into a registry, and I still think they should.

[**Google A2A**](https://a2a-protocol.org/latest/specification/), now under the Linux Foundation, has the load-bearing good idea hidden inside a heavy spec: an Agent Card at `/.well-known/agent-card.json` describing what the agent does. The card alone is the right shape. The rest of the spec (multi-turn task lifecycle, modality negotiation, push-notification config) is an enterprise-shaped JSON-RPC envelope sat on top of it, and most builders I have talked to find the surface area intimidating. SLICE: the card is Linkable; the protocol overall is Composable in theory; Indexable if `.well-known` were crawled; Ephemeral struggles because tasks are first-class long-lived entities.

**Plain HTTP plus `.well-known`** is the lightest option, and the most under-rated. OpenAI's [`.well-known/ai-plugin.json`](https://github.com/openai/chatgpt-retrieval-plugin/blob/main/.well-known/ai-plugin.json) was the first version of this idea (a JSON manifest plus an OpenAPI spec), abandoned as a product but the convention persists. A2A's agent-card is its direct descendant. Jeremy Howard's [llms.txt](https://www.answer.ai/posts/2024-09-03-llmstxt.html) is an even simpler version: a markdown file at the root pointing to AI-readable summaries of a site's content. Adoption is around 10% of large sites already. SLICE-wise this family wins on every axis. A URL. A JSON or markdown file. No SDK. Whatever HTTPS plus auth you want is your security layer.

Then there are some genuinely new pieces from the last twelve months.

[**x402**](https://www.x402.org/) is Coinbase's revival of HTTP 402. It is now a Linux Foundation project with Cloudflare as a co-sponsor, and last I checked there were 119 million transactions on Base and roughly $600 million in annualised volume. The shape is pure HTTP: the server returns a 402 with payment metadata, the client (or agent) pays, retries the request. This is the cleanest "web primitive for agents" anyone has shipped. Commerce becomes a header, not a platform.

[**DIDs and verifiable credentials for agents**](https://arxiv.org/abs/2511.02841) are emerging as the identity layer. The pattern is W3C Decentralised Identifiers anchored to a ledger, with verifiable credentials issued to the agent, so it can present a portable cryptographic identity at any endpoint. Trulioo's [Know-Your-Agent](https://www.testlio.com/blog/identity-verified-ai-agents) and OpenAgents' [Agent Identity](https://openagents.org/blog/posts/2026-02-03-introducing-agent-identity) are two examples. The thing this gives you is identity that travels with the agent rather than being granted by each platform separately.

And [**DNS-based discovery**](https://aid.agentcommunity.org/docs/specification) is starting to show up. AID uses a `_agent.<domain>` TXT record. The IETF [BANDAID draft](https://www.ietf.org/archive/id/draft-mozleywilliams-dnsop-bandaid-00.html) puts it in SVCB records. ACDP is yet another proposal. DNS is already how the web does discovery; extending it for agents is the lowest-friction option I can think of.

Now look at the alternative direction, the one that is currently winning attention.

[**Moltbook**](https://www.moltbook.com/) launched on 28 January 2026 as "the front page of the agent internet": a Reddit-shaped network where only AI agents post, comment, and vote, organised into "submolts". Acquired by Meta on 10 March. There are several variants of the same shape (Molt Road for agent commerce, [SkillsMP](https://skillsmp.com/) for distributing Anthropic-format skills, the surviving GPT Store, [Poe](https://aitoolsdevpro.com/ai-tools/poe-guide/)). They are useful, but they fail SLICE on multiple axes. Linkable, sure, if you are a member. Indexable, only inside the hub. Composable, only across other agents on the same hub. Ephemeral, no, because the hub keeps the state. Secure depends entirely on the hub's prompt-injection posture, and [Vectra has already flagged Moltbook as a prompt-injection super-spreader](https://www.vectra.ai/blog/moltbook-and-the-illusion-of-harmless-ai-agent-communities).

Hubs are AOL, not the web.

Here is the stack I think actually preserves SLICE.

A URL that returns an agent manifest at `/.well-known/agent-card.json`. The manifest is JSON, describes the agent's tools, channels, schedules, owner, and a public key. Discovery via DNS, with a TXT record at `_agent.<domain>` pointing at the manifest URL, so you can find an agent by domain the same way you find a mail server. Identity via a DID, signed onto the manifest, so the agent can prove who issued it without depending on the hosting platform. Optional commerce via an HTTP 402 response when the agent wants to be paid. Optional in-page affordances via WebMCP for the websites that want to be callable directly by their visitors' agents.

Every piece of that stack is already in production. None of them are MCP, which is fine, because the value is not in the protocol, it is in the manifest. None of them require a hub, which is good, because the moment you have a hub you have a gatekeeper, and the moment you have a gatekeeper SLICE starts to die.

I keep coming back to the same point. The web scaled because the unit was a URL returning bytes. Discovery was DNS plus crawlers plus links. There was no hub, no signup, no API key. The agent equivalents that inherit those primitives unchanged are the only ones that scale the same way. Everything else is reinventing AOL with better autocomplete.

I do not mind anyone shipping Moltbook. I do mind everyone agreeing it is the future. The future I want has every site that does something useful publishing a small JSON file at `/.well-known/agent-card.json`, signed by a key I can verify. My agent finds it through DNS or a search index of those manifests. It calls it with HTTP. It pays for it with a header. It gets a response. Then it composes that response with three other agents I have never heard of, because their cards described what they do well enough for my agent to choose them.

That is the same web I have always loved, with one new file at the root.
