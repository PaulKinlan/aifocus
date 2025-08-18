---
title: dead framework theory
date: 2025-08-11T17:00:00.000Z
draft: true
slug: dead-framework-theory
authors:
  - paulkinlan
---

I've been noodling a lot on a post about developer experience in the age of code generated using LLMs and through my research I keep pointing back to my post I wrote back in October: "[will developer care about frameworks in the future?](https://paul.kinlan.me/will-we-care-about-frameworks-in-the-future/)".

I believe that we are going to see an explosion in the number of people building sites on the web over the next few years, and it will be due to tools like Replit, Bolt, Loveable etc.

I watch these tools a lot and I look at how people are using them. Looking at my prediction about the need for frameworks waning in the future, then it's not certainly not playing out that way (at least in the short term). Specifically tools like Replit, Bolt and Lovable are preferring to output React code ([in some cases by crafting their system prompts](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/7e9f6102c7d164dfdbfca3bfd66f3d8ad5c0b2cc/Open%20Source%20prompts/Bolt/Prompt.txt#L275) to ensure it does).

For these developer focused tools, I get it. If you are build a tool today to attract developers of today, then you need to give them confidence that they will be able to maintain the code that is generated.

I can take a short-term L on being right, for the long-term win. Especially because I am a stubborn fool who is happy to dig in on a point that I think I am correct on. I will try and not do that in this post.

Dead internet theory is a theory that you can't rely on the provenance of any content on the web after the launch of Chat GPT. The content that people put on to the web by using these tools, pollutes the future models meaning that you shouldn't use it for training lest it caused context collapse.

While I'm not sure that this has been proven out, it is interesting to consider this with respect to the tools that developers use.

I frequently refer to the growth of LLMs in software engineering. We're seeing more and more developers say that they use LLMs in some part of their workflow, and if you look at the data on OpenRouter, the programming tools are growing significantly burning through Billions of tokens a day via just on gateway.

- Existing developers
- New sites

What will it take to get new libraries, tools and primitives in to the models and to the point where they are being output?

TODO: Query HTTP Archive.

If the user of a tool doesn't ask for a specific library or framework?

A model provider _could_ skew it so the model prefers a certain style, or framework or library.
Programming tools _are_ skewing it.

I'm not even sure that this is wrong or bad.

TODO: 300B tokens a week for Cline. 1M context window. 1B tokens is 1000 developers... Is OpenRouter only counting output tokens, or both input and output?

Maybe Frameworks will be dead.

Much like how Simon Willison monitors how well models generate an [Pelican Riding a Bicycle in SVG](), we probably should monitor the default output across tools and models to see the change in output quality and tool usage over time.
