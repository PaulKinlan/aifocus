---
title: "webmcp is the new web intents ... maybe"
date: 2026-04-27T21:15:00.000Z
slug: webmcp-is-the-new-web-intents
authors:
  - paulkinlan
---

One day the web will have a federated way to link to functionality. I swear we will.

For those who know me, you can tell that I've been thinking about Web Intents again... a lot. 

If you don't know me, Web Intents was a 2012 attempt to give the web a vocabulary for "I want to do X, what site can help me?". Share, edit, pick, save-for-later, buy. And a way for sites to ask for a link to a site that matched their intent. It was basically Android Intents for the web. It got pulled. I've written about [what happened to Web Intents](https://paul.kinlan.me/what-happened-to-web-intents/) and again when I was [reinventing Web Intents](https://paul.kinlan.me/reinventing-web-intents/).

I've always had hope though, and I think WebMCP could be Anakin. (Hmm, maybe not the best analogy.)

[WebMCP](https://github.com/webmachinelearning/webmcp) is, well, [MCP](https://modelcontextprotocol.io/docs/getting-started/intro) in a web page. A site can declare what it can do (by listing tools) and an agent can discover what functionality is on the page and call it.

We're not there yet though. The current model of WebMCP is very much siloed to an agent that is working on the currently open page. [It's not the intent of the project to solve this](https://github.com/webmachinelearning/webmcp#:~:text=Enable%20/%20influence%20discoverability%20of%20sites%20to%20agents) either (I can understand why). More concretely, if you are not familiar with the spec, a user has to say "do x, y and z" on the current page and the LLM will work out how it might achieve that within the current page.

I know it's not the intent of the spec, but I just think it will happen in the industry, it's too valuable of a problem to solve. For example, [Cloudflare](https://developers.cloudflare.com/browser-run/features/webmcp/) exposes the APIs via their platform. It's not a leap before someone uses this to create an index of sites and their capabilities.

Someone will create the master registry (either via some search engine or a list maintained by the user's own User Agent) and I really hope it's a browser that does it. The browser is the natural place to do this, it's the one piece of software that has a relationship with the user and every site they visit. It can keep track of what sites have registered what capabilities and use that to help the user find the right site for their needs.

The fact I'm writing this post is a not-so-subtle hint that it's not something being focused on. So why is now a good time to look at this again?

A lot of people ask me about the many issues we had with Web Intents and how they were solved. For example, one issue was that the verbs we had were either too constrained or too open. The verbs' schema probably wasn't the right way to describe things, because it was too easy to define an intent and there was a lot of worry about the ecosystem getting too diffuse and never finding an app that would match the intent (`share` vs `send` vs `share_image` vs `share_picture`).

The solution was to constrain things into bespoke APIs and it worked for the platform at the time. `navigator.share` and `share_target` were two APIs that did what they said on the tin, they worked well and matched the intent on the supply and demand side.

LLMs and tool-calling have changed all this. The ability to have a site declare "here is what I do" in any language and as precise or imprecise as you want and still have it callable and addressable is incredible. The problem we had about the verbs being too open is now a non-issue, they can be whatever you want: The local florist can register a `book-delivery` capability; The library can register `find-book`; The hospital can register `request-appointment`. LLMs can understand the intent and match the right capability far more effectively than we could in the past.

Heck, if we get this right, even us mere mortal sacks of fluid could maybe devise a special type of link `intent:find+a+book+about+raising+chickens` that we can click on and have the same look-up happen that we granted to the machines first...

:fingers-crossed:
