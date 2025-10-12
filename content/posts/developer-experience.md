---
title: dead framework theory
date: 2025-10-11T17:00:00.000Z
slug: dead-framework-theory
---

In October last year I wrote "[will developer care about frameworks in the future?](https://paul.kinlan.me/will-we-care-about-frameworks-in-the-future/)" and it's been on my mind a lot since then.

If I look at what the likes of Replit, Bolt and other tools are doing, they are doing the opposite, they are preferring to output React code ([in some cases by crafting their system prompts](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/7e9f6102c7d164dfdbfca3bfd66f3d8ad5c0b2cc/Open%20Source%20prompts/Bolt/Prompt.txt#L275)) so developers today can understand and use. I get it. If you are building a tool today to attract developers of today, then you need to give them confidence that they will be able to maintain the code that is generated.

[According to builtwith.com, there were +13m sites outside of the top 1m deployed with React in the last 12 months](https://trends.builtwith.com/javascript/React). I think about the following charts a lot.

{{< figure src="/images/react-builtwith-all-time.png" caption="React usage over time" >}}

{{< figure src="/images/react-builtwith-12mo.png" caption="React usage over the last 12 months" >}}

However, looking at [HTTP Archive](https://httparchive.org/reports/techreport/tech?tech=ALL#adoption), it tells a different story. React usage has stalled at 9 million origins on mobile vs 55 million origins as reported by Builtwith.

{{< figure src="/images/react-http-archive-all.png" caption="HTTP Archive. React usage over the last 6 months" >}}

Firstly, the dataset size is vastly different. HTTP Archive is looking over [some 12-16 million origins](/images/http-archive-origins-over-time.png), while [Builtwith is reportedly looking](https://trends.builtwith.com/javascript/React) at some [414 million _root domains_](/images/built-with-coverage.png). Sites also don't get into HTTP Archive unless there is some amount of usage and many sites in builtwith might be parked domains or sites that are not actively being used.

Looking at the top 1m, the detection rate is a lot more aligned, 140k vs 160k.

{{< figure src="/images/react-http-archive-top-1m.png" caption="HTTP Archive. React usage in the top 1m" >}}

{{< figure src="/images/react-builtwith-top-1m.png" caption="Builtwith React usage in the top 1m" >}}

There are always false positives in these numbers, but the trends are interesting. To sanity check myself, I looked at the 2nd most popular framework, Angular (both variants - AngularJS and Angular).

{{< figure src="/images/builtwith-angularjs-alltime.png" caption="Angular usage over time" >}}

{{< figure src="/images/builtwith-angularjs-12mo.png" caption="Angular usage over the last 12 months" >}}

Compared to [HTTP Archive](https://httparchive.org/reports/techreport/tech?tech=React,Angular,AngularJS&geo=ALL&rank=ALL&page=1#adoption)...

{{< figure src="/images/angular-react-http-archive-all.png" caption="HTTP Archive. Angular vs React usage all time" >}}

... the numbers look like they are inline with [builtwith alltime](/images/builtwith-angular-alltime.png) and [over the last 12 months](/images/builtwith-angular-12mo.png). It doesn't look good for Angular.

Could it be vercel that is driving the growth in React sites? They've had a meteoric rise in sites hosted on them. Just look at the curve!

{{< figure src="/images/vercel.png" caption="Vercel usage over time" >}}

But looking at the last 12 months, the growth is not as pronounced.

{{< figure src="/images/vercel-builtwith-12mo.png" caption="Vercel usage over the last 12 months" >}}

Take all these numbers with a pinch of salt. I'm sure Vercel would quibble with these numbers, the React and Angular teams too. The detection can be broken, the datasets are different sizes and the definitions of what is being measured are different. But the trends are interesting.

Thinking on the trends, we don't see massive technology shifts in the top 1000 through to top 1 million because these are established sites with established teams and shifting technology is hard and often unclear benefit outside of potential improvements to product velocity.

So what has driven the uptick in React sites? Is it being driven because LLM tools over the last 12-18 months are prefering to outputting React code?

Truthfully, we don't know. I look at Token growth on OpenRouter, programming tools are [burning through Billions of tokens a day](https://aifoc.us/token-slinging) via just one gateway, the curves look similar....

{{< figure src="/images/open-router-tokens-oct.png" caption="OpenRouter token usage over time" >}}

But correlation is not causation and really only the tool creators know as they see the tokens that flow through their systems.

_If_ you believe that the majority of new sites being deployed are being created with the help of LLMs, then... something

I was using Claude code last week to build a Chrome Extension that uses Chrome's built-in `prompt` API to help me take a prompt from the Omnibox and route it to a tool in the Chrome extension. Claude was great, it dutifully helped wriste the entire extension, but for one small error. It used `self.ai.languageModel` to call the prompt API. This _was_ the correct API to call 6 months ago, but now it's `LanguageModel.create()`. It wasn't in the corpus and it had no context to build from to get to the correct API. I had to fix it.

Today, if your framework or documentation isn't in the training corpus of the LLM, then it won't be output. If the system prompt of the tool a developer uses doesn't have your API, library or framework, then it's not in the output. And, if the user of a tool doesn't ask for a specific API, library or framework, then it won't be output. Model providers are skewing it so the model prefers a certain style, or framework or library (I do wonder if we will see library and framework authors paying tooling providers to include even the faintest mention of their library or framework in the system prompt.)

I can take a short-term L on being right, for the long-term win - I still believe that as LLMs progress they won't actually need the human constructs to efficiently build a maintainable site (also, I'm stubborn and happy to dig in on a point that I think I am correct on.)

The models and the tools are preferring the tools that developers are already using, and it's driving a virtuous (vicious?) circle of adoption, to the point that if you are launching a new API or tools today you need to consider how it will be adopted by the ecosystem and how to get it into the training corpus of the LLMs.

But what does this mean for the web platform APIs, that is the things that are being built into the browser? Over the last few years, we've seen a lot of new APIs and features that are designed to make the developer's life easier.

Over the last couple of years there's been a push to smooth a lot of the rough edges of the web platform, that is, developers like feature that make it easier for developers to do something that was hard. We like libraries and frameworks for this reason, and many developers are excited by the fact that something that once required a tool will now be a part of the web runtime by default.

For example:

- People loved [Sass](https://sass-lang.com/), but you need a build-step, so it would be better for it to be in the platform, so we have [CSS Nesting](https://developer.chrome.com/docs/css-ui/css-nesting).
- Colour-space functions like `okchl` and `hsl` make it easier for designers to modify the colours on a page because they are in a language they are used to from their tools.
- Carousels are hard to build, so maybe we should have them as an intrinsic part of the platform. At the same time, there are [tons](https://flowbite.com/docs/components/carousel/#:~:text=Create%20a%20new%20carousel%20object%20using%20the%20options%20set%20above.) of [libraries](https://daisyui.com/components/carousel/?lang=en) that [create](https://getbootstrap.com/docs/4.0/components/carousel/) great [carousels](https://www.npmjs.com/package/react-multi-carousel).

As an author of many sites, I love these features. CSS Nesting alone lets me structure my CSS in a way that I personally find easier to read and maintain. But it doesn't really change the quality of the experience of the site for the person using my site. It doesn't change the performance of the site. It doesn't change how accessible my site is. It just makes it easier for me to write and maintain.

But if you look at the tools that developers use to start a site, they are not going to "use the platform", they either use what their company has mandated, or what they are used to, and I believe that this is compounding at an increasing rate that you can't escape that React might be _the platform_.

But let me hard double-down on a point and go completely against all the evidence that the graphs that point up and to the right in this post. Please, just humour me for a moment and [email me](mailto:paul@aifoc.us) if you disagree.

Lets have a quick look at a common pattern that I've seen over the years for development of new web platform features is:

- Web browser's identify a common pattern in popular user-space tools that might be interesting for the web, so a multi-year standardisation and development cycle starts;
- User-space tools that are being used by developers continue to get adoption and develop further.
- The web platform APIs that was being designed to replace the need for the user-space tools frequently don't do enough for them to be replaced with the platform primitive
- The user-space tools (Frameworks and existing libraries) that are "being replaced" are not incentivize to use the platform because they already have something working that is being used.

For motivated developers, green-field projects might take advantage of the new platform primitive. For everyone else? you use what you know or are told to use.

The tools, frameworks and libraries are not something that concerns a normal person using the web. What concerns people is the experience of using the page. Does it load quickly enough? Are the interactions smooth? Does the site actually do what I need it to do?

[I believe that there is an opportunity for millions more people to deploy on to the web](/transition/), that is people who are not formal web developers who will use tools like Loveable, Replit, or even directly in a chat app and they may never need to look at the code, so what then do any of these new APIs do to help them build better sites?

People building with these tools don't know about Passkeys, WebAuthn, Web Components, CSS Nesting, View Transitions, or any of the other new features that are being added to the platform. They just want to have a site created that does what they need it to do.

Today, if you are an LLM or an tool that outputs code from an LLM, to not output React by default is to limit your potential audience as your competitors are serving the current demand. Tomorrow?

Now, if you consider our current working model for code-generating LLM tools which reflect the ecosystem that they are trained on. This means that any new API, frameworks or library has a large hurdle to get over in terms of being something that will be output by the tool. The fact that _any_ new feature might not be in the training corpus _and_ will not be prevalent enough to have it's usage patterns and idioms ingrained in the training and by extension the output of an LLM; should be a concern to the people building new platform features.

What should the platform creators do then (that is spec authors and browser developers)?

If you take [JS0](https://docs.google.com/presentation/d/1ylROTu3N6MyHzNzWJXQAc7Bo1O0FHO3lNKfQMfPOA4o/edit?slide=id.p#slide=id.p) to an extreme and apply it to HTML and CSS and browser APIs (Web0 anyone??) then you could argue that a healthy tooling ecosystem already exists to abstract away the platform (WebSugar): If you want a carousel, you can use a library. If you want state management, you can use a library. If you want animations, you can use a library. If you want to do .... you can use a library. It's only when there is something fundamentally new that can't be built in user-space that the platform needs to evolve. And if we take a view that LLMs tool can output any code to meet the requirements set out by the user. I see less and less need for developer experience based improvements to the raw web-platform, especially in a world where people creating sites might never actually look at the code.

Looking at todays trend of tools primarily outputting React code, the comprehensive ecosystem of user-space libraries can do almost everything from custom select boxes, specialized date components and everything else that is available. I can't see a world where a new platform feature is going to displace the libraries in use nor can I see a world where a new framework is going to displace React in the short to medium term &mdash; (that was a handcrafted mdash) I really love what the Remix folks are doing with Remix 3 and I will keenly watch how it is adopted and how LLMs might pick this up to see how this post plays out in the real world - I'd love see how long it takes for LLMs to start outputting Remix code without specific prompting or including docs in the context.

This entire post might sound like a capitulation to the dominance of React and the pointlessness of building any new platform feature or tools, but I don't think it is. I think it's a call to action for people building new platform features to really consider the incentives of the people building sites and the tools that they are using. If you are building a new framework or library, then you need to consider how it will be adopted by the ecosystem and how to get it into the training corpus of the LLMs. If you are building a new platform feature, then you need to consider how it will be adopted by the ecosystem and how to get it into the training corpus of the LLMs.

And that as an industry we should be competing on the outcomes for the user.

As for the web runtime, I think for the web to progress we should be looking to fundamentally new capabilities in the browser; the things that can't be built in user-space, or where there is clear user-experience benefit that can't be achieved with libraries. Multi-page view transitions are a great example.

For features that browser developers are creating today, we need to take a long hard look at the benefits that they will bring to the user and not the developer. To that extent, I would argue many of the platform features ranging from Web Components through to syntactical changes are just not needed by the vast majority of people building sites in the coming years.

I really want to see Evals and Benchmarks that focus on quality outcomes like Core Web Vitals did for performance. My hope would be then that as users of tools that create sites care more about the experience of the site, then the tools will be incentivized to output code that meets those needs vs what is the easiest to output for the developer to maintain today.

And while I still enjoy handcrafting a site and applying care to the structure of the code and the direct access to the platform, I am in the minority. The majority of people building sites will be using tools that generate their sites and will not care about the code, or the frameworks, or the libraries, just the experience of the site.... hopefully... and who needs a frameworks then?
