---
title: quality
date: 2025-08-09T00:00:00.000Z
slug: quality
draft: true
authors:
  - paulkinlan
---

It's been astounding to see the progression in the quality of code that is output by LLMs. I'm a regular user of Gemini via Cline and I've been incredibly.happy with what it's enabled me to do.

The other week after a model launch was lauding the improvements to model against common coding benchmarks, I started to wonder what the experience of those sites generated is like. My own anecdotal experience is that I feel pretty happy overall. The sites tend to work well, they tend to look good, they are pretty quick. I have frustrations such as none of the models output form that enable autofill well (specifically account creation fields like passwords), but because of my job, I'm constantly on the lookout for flaws and when I see them, I fix them.

A lot of developers scoff at the sites outputting React or using Tailwind, but do we actually know if they are better or worse that the sites that people produce? We just don't know.

Are their CWV good? bad? We just don't know.

Are the sites accessible? We just don't know.

Do the sites look good and navigate well? We just don't know

Do the site follow best practices for forms? We just don't know.

[TODO: Validate the different benchmarks]
None of the benchmarking arenas cover the quality.
[TODO: Validate the different benchmarks]

I think many developers will say something like "Well, LLMs are just the average of all the training data", so by that logic, the average will be, well, crap. Very crap to use a technical term. And much like dead internet theory, the crappiness will compound.

I just don't see it though. But outside of feels, we can do a lot better as an industry. We really need a quality benchmark, or if not a benchmark, a way to monitor the quality of the output of the tools and highlight it publicly.

Luckily [HTTPArchive](https://httparchive.org) exists and has access to the homepage of 16 million sites (and the a selected next page for those same sites). While it's not all of the web there is no other publicly accessible crawl of the web with easy access to this data.

My rough proposal is three fold:

1. Analyze the Lighthouse scores for performance, accessibility and forms to see how well best-practices are followed. And inspect the Core-Web Vitals of the sites we discover to get a sense of how users perceive their performance.
2. Create a public 'quality benchmark' for future models, so that when we talk about the progress in the development of models we can see that outcomes get better.
3. Establish a process for determining objective quality metrics that would be included in steps 1 and 2.

Understanding where the industry is as a baseline and then measuring progress against it will be critical in ensuring that we can put pressure on the ecosystem of models and tooling to do better.

Finally, I look at how I use Chrome DevTool's AI performance inspection tools, and it feels like we have the technology to inspect and determine what can be done to improve a site. It is possible for tools to automatically include something like [lighthouse-ci]() so that as the agents are looking at the output, they don't just look at the console for errors, they recongise quality issues and plan to improve the quality of the site too.

Maybe this will just play out naturally over time. As the number of tools for generating sites increases there will have to be differentiation. Cost will naturally be one model, and if [tokens are the pricing model](/token-slinging/) there will be a floor to that. After cost, quality would be the other vector... people always want the best quality for the price they can afford, but how do would a customer be confident in quality? Benchmarks and Dashboards.

I'd rather not wait though.
