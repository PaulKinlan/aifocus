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

One extreme is where there is a [super-app](/super-apps/) and it is the agent that can do everything for the user, generating content and UIs on the fly to fulfil a goal. Where does the web sit in this? The web is a legacy fallback and it's not the web I want to see. Is there a possibility that an exchange of value could happen between the site and super-app? Could we embed some functionality that brings my brand or service in front of the user in any site or app, including the super-app? Maybe it's a checkout form, or a registration page, or, well anything that needs a user-action.

In 2020, while on my team, Jason Miller documented the [Island architecture](https://jasonformat.com/islands-architecture/) (first proposed by [Katie Sylor-Miller](https://sylormiller.com/)). At the time if felt a logical extension to "[AppShell](https://web.dev/learn/pwa/architecture/)": Here's some static code and here's the dynamic bit &mdash; which on a technical level _is_ what it describes, but at an architectural level it is something rather different. Islands are a way to think about how to compose your web app in to different bits of functionality. While still nascent, frameworks like [Fresh](https://fresh.deno.dev/docs/concepts/islands) and [Astro](https://docs.astro.build/en/concepts/islands/) have adopted this idea, but it's a framework-level concept and not a platform-level concept.

When I look at the extreme that is "the super-app", it feels like embedding and composability needs to be a key part of the future of the web, and it needs to something that developers and businesses can opt-in to and control to their brand and experience to as much as an extent as possible.

And continuing on that thread, the designers of the web-platform, that is browser vendors and participants of the W3C should be imagining what the platform should look like and how it should act and provided a clear value.

Now there is a natural reaction: Well, I don't want super apps or LLMs. The technology is now here and it's being used for good and for bad, and as I learnt from the desktop to mobile [transition](/transition/) How does the web differentiate then?

a platform-level boundary between functional components of a page, this could be:

1. exposing them to the browser in a way that it understands there is an island there and understands what it can do while ensuring there can be security and privacy boundaries between the islands if required.
2. allowing the browser to load these islands from other sites, and then render them in the page
3. allowing apps, or other agents to load these islands from other sites, and then render the users' current context.

This might sound like Web Components, but we don't have clear contracts. It's something that I started to think about in [Custom Elements Ecosystem](https://paul.kinlan.me/custom-elements-ecosystem/).

It might also sound like an `iframe`, but these are too heavy. I might just want to embed a small bit of functionality like a checkout form, or a map that has all my own branding..

It might also sound like the `<portal>` element which was meant as a more privacy-preserving `<iframe> element, but it's too high-level and doesn't allow for the embedding of functionality that is not just a page.

It might also look like [Web Intents](https://paul.kinlan.me/what-happened-to-web-intents/) but this was a page level and not at a component level (and it got pulled out of Chrome).

We are in the start of an era where the [web will be headless](https://paul.kinlan.me/the-headless-web/) _and_ I believe that we don't have the correct primitives to enable the web to be composable in a way that is useful and for it to thrive.

We need a way to define components as islands on the platform and enable them to be embedded across the site, in other sites and as a first class citizen in native apps. This might necessitate changes to system level WebViews and the browser itself.

We need better ways to define intent of not just the page, but islands in teh page, and therefore we need a way to define intent or contracts between sites and components.
