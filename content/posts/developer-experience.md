---
title: dead framework theory
date: 2025-10-12T23:00:00.000Z
slug: dead-framework-theory
---

_These are my opinions and are ruminations on what might be happening as more and more developers use LLMs and Frameworks to build on the web._

In October last year I wrote "[will developers care about frameworks in the future?](https://paul.kinlan.me/will-we-care-about-frameworks-in-the-future/)" predicting that LLMs would abstract away framework choice. I was wrong—or at least, wrong about the timeline.

The reality is more interesting and more permanent: **React isn't competing with other frameworks anymore. React has become the platform.** And if you're building a new framework, library or browser feature today, you need to understand that you're not just competing with React—you're competing against a self-reinforcing feedback loop between LLM training data, system prompts, and developer output that makes displacing React functionally impossible.

If you look at what Replit, Bolt, and similar tools are doing, they're not trying to abstract away frameworks—they're [explicitly hardcoding React into their system prompts](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/7e9f6102c7d164dfdbfca3bfd66f3d8ad5c0b2cc/Open%20Source%20prompts/Bolt/Prompt.txt#L275). They have to. If you're building a tool today to attract developers, you need to give them code they can maintain. And "code developers can maintain" now means "React" for the vast majority of web developers.

[According to builtwith.com, there were +13m sites outside of the top 1m deployed with React in the last 12 months](https://trends.builtwith.com/javascript/React). Look at these curves:

{{< figure src="/images/react-builtwith-all-time.png" caption="React usage over time" >}}

{{< figure src="/images/react-builtwith-12mo.png" caption="React usage over the last 12 months" >}}

However, looking at [HTTP Archive](https://httparchive.org/reports/techreport/tech?tech=ALL#adoption), it tells a different story. React usage has stalled at 1.2 million mobile origins on mobile vs 55 million origins as reported by Builtwith.

{{< figure src="/images/react-http-archive-all.png" caption="HTTP Archive. React usage over the last 6 months" >}}

The dataset sizes are vastly different. HTTP Archive looks over [some 12-16 million origins](/images/http-archive-origins-over-time.png), while [Builtwith is reportedly looking](https://trends.builtwith.com/javascript/React) at some [414 million _root domains_](/images/built-with-coverage.png). Sites also don't get into HTTP Archive unless there is some amount of usage and many sites in Builtwith might be parked domains or sites that are not actively being used.

Looking at the top 1m, the detection rate is more aligned: 140k vs 160k.

{{< figure src="/images/react-http-archive-top-1m.png" caption="HTTP Archive. React usage in the top 1m" >}}

{{< figure src="/images/react-builtwith-top-1m.png" caption="Builtwith React usage in the top 1m" >}}

We're looking at about 12-18% of sites in the top 1m. Take all these numbers with a pinch of salt. The detection can be broken, the datasets are different sizes and the definitions of what is being measured are different. But the trends feel undeniable: React's growth continues while competitors [like Angular, sadly stagnate](/images/builtwith-angular-12mo.png).

So what has driven the uptick in React sites? My read of the data suggests LLM tools over the last 12-18 months are preferring to output React code.

Look at token growth on OpenRouter. Programming tools are [burning through billions of tokens a day](https://aifoc.us/token-slinging) via just one gateway. The curves look similar:

{{< figure src="/images/open-router-tokens-oct.png" caption="OpenRouter token usage over time" >}}

Correlation is not causation, and only the tool creators see the full picture as tokens flow through their systems. But the timing is striking: massive token growth coinciding with massive React deployment growth.

The models and the tools are preferring the tools that developers are already using, and it's driving a self-reinforcing cycle of adoption. If you are launching a new API or tool today, you need to consider how it will be adopted by the ecosystem and how to get it into the training corpus of the LLMs.

We have two loops of feedback in play here:

1. React dominates the existing web (~13M+ new sites in 12 months)
2. LLMs train on the existing web
3. LLMs output React by default
4. New sites built with LLMs use React
5. More React sites exist for future training
6. Go to step 2

And...

1. React dominates the developer ecosystem
2. IDEs and tools that developers preferntially output React
3. Tools ask LLMs to output React by default
4. New sites built are using React
5. More React sites exist to increase demand for tools to output React
6. Go to step 1

I don't actually know if this is bad or good. We're getting more sites on the web and they're all pretty high quality. But it does create barriers for new frameworks, tools and web platform features that we need to understand. Specifically when:

1. Your framework isn't in the training data because it's new
2. Tool creators hardcode React because that's what developers know today
3. Developers expect React output because that's what works
4. Companies won't use your framework if their developers can't maintain it
5. React has thousands of libraries; you have dozens

If you launch a new framework, library or browser feature today, even if it's technically superior, you need to:

- Get into LLM training data (12-18 month lag minimum)
- Convince tool creators to modify system prompts (requires existing adoption)
- Build a comprehensive library ecosystem (years of development)
- Overcome developer inertia and get developers to ask for it

By the time you've done step 1, the ecosystem using React has generated another 10M+ sites. You might flip that order, and do a massive campaign to get developer mind share, and supplement it with paid integrations in to the library ecosystem. We might even see new business models where framework and library authors pay tooling providers to include their framework in system prompts. But even then, you're fighting against entrenched patterns in both React libraries AND LLM training data.

This isn't about React being the best tool or that it's Model is good for LLMs (I don't see any evidence there at all). It's about React being past the point where network effects make alternatives viable.

Here's what brought this home for me: Last week I used Claude to build a Chrome Extension using Chrome's built-in `prompt` API. Claude dutifully wrote the entire extension, but used `self.ai.languageModel`—the API from 6 months ago. The current API is `LanguageModel.create()`, but that wasn't in the training corpus.

Add in the fact that it can take years of [Interop](https://web.dev/blog/interop-2025) work to get a feature to the point it becomes "[Baseline newly-available](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility#:~:text=Features%20listed%20as%20newly%20available%20work%20in%20at%20least%20the%20latest%20stable%20version%20of%20each%20of%20the%20Baseline%20browsers%2C%20but%20may%20not%20work%20with%20older%20browsers%20and%20devices.)" and then another 36 months for it to reach a point where it's "[Baseline widely-available](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility#:~:text=Features%20listed%20as%20widely%20available%20have%20a%20consistent%20history%20of%20support%20in%20each%20of%20the%20Baseline%20browsers%20for%20at%20least%202.5%20years.)". By that time, the ecosystem has moved on, and the feature is competing against entrenched patterns in both React libraries AND LLM training data.

This is the new reality: **If it's not in the LLM training data, it doesn't exist.** Not for 12-18 months, at least not until the next model training cycle and not until enough examples exist in the wild to statistically matter.

Now apply this to frameworks:

- **Web platform APIs**: 0-6 months of real-world usage before training cutoff
- **New frameworks**: 0-6 months of real-world usage before training cutoff
- **React patterns**: 10+ years of accumulated examples

Today, if your framework or documentation isn't in the training corpus of the LLM, then it won't be output. If the system prompt of the tool a developer uses doesn't have your API, library or framework, then it's not in the output. And if the user of a tool doesn't ask for a specific API, library or framework, then it won't be output. Model providers are skewing it so the model prefers a certain style, or framework or library.

The same dynamic applies to new web platform APIs designed to replace framework features. Consider the typical pattern:

1. Browser teams identify a common pattern in frameworks (e.g., CSS Nesting instead of Sass)
2. Multi-year standardization process begins
3. Feature ships in browsers
4. Developers... keep using the framework pattern

Why? Because:

- **The LLM learned the old pattern**: Sass has 15 years of examples; CSS Nesting has 1 or 2 years
- **The framework already works**: React developers use styled-components, Tailwind, CSS modules
- **The ecosystem is built**: Thousands of React component libraries use existing CSS patterns
- **There's no incentive to switch**: The new platform feature doesn't make the site better for users

For example:

- People loved [Sass](https://sass-lang.com/), but you need a build-step, so we have [CSS Nesting](https://developer.chrome.com/docs/css-ui/css-nesting). However its rarely output because preprocessor patterns are more common in the corpus and also React developers already have CSS-in-JS solutions that LLMs know how to output.
- Carousels are hard to build, so maybe we should have them as an intrinsic part of the platform. But there are [tons](https://flowbite.com/docs/components/carousel/#:~:text=Create%20a%20new%20carousel%20object%20using%20the%20options%20set%20above.) of [libraries](https://daisyui.com/components/carousel/?lang=en) that [create](https://getbootstrap.com/docs/4.0/components/carousel/) great [carousels](https://www.npmjs.com/package/react-multi-carousel) that are already in LLM training data.

As an author of many sites, I love these features. CSS Nesting alone lets me structure my CSS in a way that I personally find easier to read and maintain. But it doesn't really change the quality of the experience of the site for the person using my site. It doesn't change the performance of the site. It doesn't change how accessible my site is. It just makes it easier for me to write and maintain.

The only new platform features that matter are ones that _can't be built in user-space_, like:

- Multi-page view transitions (new navigation capabilities)
- WebGPU (fundamentally new compute access)
- WebAuthN and PassKeys (security primitives)

Everything else is competing against entrenched patterns in both React libraries AND LLM training data.

There's at least 3 constituencies to consider here:

1. The "head" businesses building on the web - The top 1000 sites take the lion's share of traffic and revenue on the web, and we don't see massive technology shifts in the top 1000 through to top 1 million because these are established sites with established teams and shifting technology is hard with often unclear benefit outside of potential improvements to product velocity. They are likely to be using LLM based tooling to help increase velocity, but they are not going to be switching frameworks or libraries lightly.

2. The "middle" businesses building on the web - The next 10 million sites are being built by small teams and individuals and will likely be using LLMs to build new sites completely and unless they prompt will use the defaults the tools output

3. The "long tail" - These are people who are not formal web developers who will use tools like Loveable, Replit, or even directly in a chat app. They may never need to look at the code, so what do any of these new APIs do to help them build better sites? and they represent the growth in the platform and we have an [opportunity for millions more people to deploy on to the web](/transition/)

The people in groups 2 and 3 are the ones driving the growth in sites on the web and are unlikely to be building with these tools don't know about Passkeys, WebAuthn, Web Components, CSS Nesting, View Transitions, or any of the other new features being added to the platform. They just want a site created that does what they need it to do.

The thing is, the normal people using the web don't care about the tools, frameworks and libraries are not something that concerns a normal person using the web. What concerns people is the experience of using the page. Does it load quickly enough? Are the interactions smooth? Does the site actually do what I need it to do?

Today, if you are a company targeting developers in any of those categories (LLM or a tool that outputs code from an LLM), to not output React by default is to limit your potential audience as your competitors are serving the current demand.

Now consider the current working model for code-generating LLM tools which reflect the ecosystem that they are trained on. This means that any new API, framework or library has a large hurdle to get over in terms of being something that will be output by the tool. The fact that _any_ new feature might not be in the training corpus _and_ will not be prevalent enough to have its usage patterns and idioms ingrained in the training and by extension the output of an LLM should be a concern to the people building new platform features.

Looking at today's trend of tools primarily outputting React code, the comprehensive ecosystem of user-space libraries can do almost everything from custom select boxes, specialized date components and everything else. I can't see a world where a new platform feature is going to displace the libraries in use nor can I see a world where a new framework is going to displace React in the short to medium term—I really love what the Remix folks are doing with Remix 3 and I will keenly watch how it is adopted and how LLMs might pick this up to see how this post plays out in the real world. I'd love to see how long it takes for LLMs to start outputting Remix code without specific prompting or including docs in the context.

**For framework authors:** Building a new framework is building a product that LLMs won't output for 12-18 months minimum, that has no library ecosystem, that developers don't know, and that companies won't adopt. You're not competing with React's technical merits—you're competing with React's statistical dominance in every LLM training corpus and every tools providers preference for their customer.

**For platform developers:** Developer experience features (syntactic sugar, convenience APIs) are competing against established React patterns in LLM training data. They will not be adopted at scale. Focus on fundamental capabilities that can't be built in user-space. For features that browser developers are creating today, we need to take a long hard look at the benefits that they will bring to the user and not the developer. To that extent, many of the platform features ranging from Web Components through to syntactical changes are just not needed by the vast majority of people building sites in the coming years.

**For tool creators (e.g, IDEs):** If you're not outputting React by default, you're limiting your addressable market. Your competitors are serving current demand. You can't afford to be principled about framework diversity.

Dead framework theory isn't about frameworks dying. It's about new frameworks being dead on arrival in a world where React has become the platform (at least as long as people need to maintain code.)

As an industry we should absolutely innovate and build new frameworks, libraries and platform features. We need innovation to push the web forward and create competition. But we need to be aware of the dynamics at play and have clear strategies to get our work into LLM training corpus, system prompts, and developer minds.

If the industry continues its current focus on maintainability and developer experience, we'll end up in a world where the web is built by LLMs using React and a handful of libraries entrenched in the training data. Framework innovation stagnates. Platform innovation focuses elsewhere. React becomes infrastructure—invisible and unchangeable.

But here's the optimistic take: If LLM usage continues to grow, tooling vendors will have to compete with each other on this homogenized ecosystem. When everyone outputs React by default, you can't differentiate on framework choice. You have to compete on output quality. Market forces shift the focus from developer experience to user experience.

For either scenario, we need to start competing on user outcomes. I really want to see Evals and Benchmarks that focus on quality outcomes like Core Web Vitals did for performance. When tools compete to attract users, the ones that output meaningfully better experiences will win. This competitive pressure will incentivize the entire ecosystem to optimize for users, not developers.

And if we succeed? Then in the long run, [the framework will become irrelevant](https://paul.kinlan.me/will-we-care-about-frameworks-in-the-future/) as the models improve to the point people [manipulate sites by words alone](https://blog.almaer.com/english-will-become-the-most-popular-development-language-in-6-years/) and the LLM providers believe they can create better outcomes with their own frameworks or tuning (hat tip to Ade). The delivery technology becomes an optimized compiled output that meets user needs—whether it's "React" or something else stops mattering.

As for the raw, naked, web platform? Focus on fundamentally new capabilities—the things that can't be built in user-space, or where there's clear user-experience benefit that can't be achieved with libraries.
