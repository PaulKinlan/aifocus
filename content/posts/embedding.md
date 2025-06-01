---
title: embedding
date: 2025-05-28T10:59:06.193Z
slug: embedding
authors:
  - paulkinlan
---

No, not that [one](https://huggingface.co/spaces/hesamation/primer-llm-embedding). The E in [SLICE](https://paul.kinlan.me/slice-the-web/) is for embedding content.... Oh wait, that E was for ephemeral. Hmm, never mind. I guess this is the other E which is actually the C in SLICE. "Composable". After [linking](/a-link-is-all-you-need) composability is one of the most critical features of the medium that is the web. It's the only platform that I know of that enables expression by integrating live content from nearly any other site or service directly into the UI. Yes, we have APIs, but it's the `<iframe>` and `<embed>` that have helped to make the web unique.

There's a story that I heard before joining Google, that our very first developer API was a way to embed Google Maps into your website. It wasn't that we invented an API, it was that the web made it easy to pull content from other sites and embed it into your own and lots of people wanted to do this. While embedding of maps is declining (according to BuiltWith), anywhere between [12-15% of the top 1 million sites](https://trends.builtwith.com/mapping/Google-Maps) still embed Google Maps.

In "[A link is all you need](/a-link-is-all-you-need/)" and [super-apps](/super-apps/) I touched on the ability for LLMs to create or recall content on the fly and how it's potentially a huge shift for how we think about the web and in [AI-powered site mashups](/ai-powered-site-mashups/) Andre Bandarra suggests that Agents will be able to create the ultimate mashup or sites and services because they attempt to solve for the user's goal.

If the only thing really stopping this is the [latency](/latency/) of the LLMs to generate the UI then it is a "when" and not "if" question. We really need to think about some of the downstream implications of this.

One extreme is where there is a [super-app](/super-apps/) and it is the agent that can do everything for the user, generating content and UIs on the fly to fulfil a goal. Where does the web sit in this? The web is a legacy fallback and it's not the web I want to see. Is there a possibility that an exchange of value could happen between the site and super-app? I believe that many site owners and businesses would want some way of keeping their brand, or enabling specific actions like up-sell on checkouts, so could we embed some functionality that brings my brand or service in front of the user in any site or app, including the super-app? Maybe it's a checkout form, or a registration page, or, well anything that needs a user-action.

{{< figure src="/images/embedding.png" alt="Embedding" caption="Fictional example of embedding existing web functionality into a 'chat app'" >}}

In 2020, while on my team, Jason Miller documented the [Island architecture](https://jasonformat.com/islands-architecture/) (first proposed by [Katie Sylor-Miller](https://sylormiller.com/)). At the time if felt a logical extension to "[AppShell](https://web.dev/learn/pwa/architecture/)": Here's some static code and here's the dynamic bit &mdash; which on a technical level _is_ what it describes, but at an architectural level it is something rather different. Islands are a way to think about how to compose your web app in to different bits of functionality. While still nascent, frameworks like [Fresh](https://fresh.deno.dev/docs/concepts/islands) and [Astro](https://docs.astro.build/en/concepts/islands/) have adopted this idea, it's still just a framework-level concept and not a platform-level primitive.

When I look at the extreme that is "the super-app", it feels like embedding and composability need to be key parts of the future of the web, and it needs to something that developers and businesses can opt-in to and control to their brand and experience to as much as an extent as possible.

Now there is a natural reaction: Well, I don't want super apps or LLMs. The technology is now here and it's being used for good and for bad, and as I learnt from the desktop to mobile [transition](/transition/), the answer is to differentiate and not follow. Lean in to the areas that other platforms can't compete on.

So, how does the web differentiate then?

One area that is ripe for innovation is the act of hyper-linking. We should actively investigate hyper-embedding (also known as transclusions). That is, we need to go beyond just being able to embed a site in a page (`iframe`) or an API (`fetch()`), or just merely linking to something (`<a>`), but instead enable the seamless embedding of functionality that is useful and composable and secure.

The boundary between functional components as described in islands offers so many opportunities for the web. By exposing islands/components/widgets to the browser in a way that it understands that a) there is something that is embeddable, b) what it can do, and c) how to talk to it, all while ensuring there can be security and privacy boundaries between the islands if required, could enable:

1. A cleaner separation for site authors for use across their site. Islands and functionality across the current sites, and then render them in the page. Because the browser understands the intent of islands it enables page-level actions, automations, and chat-bots by the browser to help the user interact with the page.
2. Deeper integrations across sites. Developers have a habit of injecting any and all 3P JS into the page. A new primitive could separate the pages, ensure memory safety, and data-leakage while enabling even more composability across sites.
3. Native apps, or other agents to load these islands from other sites, and then render just the island inside their app.
4. There could be a marketplace and discovery mechanism for functionality for any given island's intent and any given contract.

This might sound like Web Components, but we don't have clear contracts or cross-platform embed-ability. It's something that I started to think about in [Custom Elements Ecosystem](https://paul.kinlan.me/custom-elements-ecosystem/) but at the time there wasn't a clear need for it. Now there is.

It might also sound like an `<iframe>`, but these are too heavy. I might just want to embed a small bit of functionality like a checkout form, or a map that has all my own branding.

It might also sound like the `<portal>` element which was meant as a more privacy-preserving `<iframe>` element, but again it's too high-level and doesn't allow for the embedding of functionality at a level that smaller than a page.

It might also look like [Web Intents](https://paul.kinlan.me/what-happened-to-web-intents/) but this was a page level and not at a component level (and it got pulled out of Chrome).

We are in the start of an era where the [web will be headless](https://paul.kinlan.me/the-headless-web/) _and_ we don't have the correct primitives to enable the web to be composable in a way that is useful and for it to thrive. The designers of the web-platform, that is browser vendors and participants of the W3C should be imagining what the platform should look like and how it should continue to differentiate itself in the future.
