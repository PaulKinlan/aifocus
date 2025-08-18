---
title: developer-experience
date: 2025-07-31T17:00:00.000Z
draft: true
slug: developer-experience
---

In October last year I wrote "[will developer care about frameworks in the future?](https://paul.kinlan.me/will-we-care-about-frameworks-in-the-future/)" and it's been on my mind a lot since then.

If I look at what the like of Replit, Bolt and other tools are doing, they are doing the opposite, they are preferring to output React code ([in some cases by crafting their system prompts](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/7e9f6102c7d164dfdbfca3bfd66f3d8ad5c0b2cc/Open%20Source%20prompts/Bolt/Prompt.txt#L275)) so developers today can understand and use. I get it. If you are build a tool today to attract developers of today, then you need to give them confidence that they will be able to maintain the code that is generated.

I can take a short-term L on being right, for the long-term win. I'm also stubborn and happy to dig in on a point that I think I am correct on.

Another way to frame my "will we care about frameworks in the future?" post is "will we care about developer experience in the future?". With this framing, I want to take a quick look at what is happening in the web platform today, that is the APIs that browser are putting into the runtime and what it might mean.

Over the last couple of years there's been a push to smooth a lot of the rough edges of the web platform, that is, developers like feature that make it easier for developers to do something that was hard. We like libraries and frameworks for this reason, and many developers are excited by the fact that something that once required a tool will now be a part of the web runtime by default.

For example:

- People loved [Sass](https://sass-lang.com/), but you need a build-step, so it would be better for it to be in the platform, so we have [CSS Nesting](https://developer.chrome.com/docs/css-ui/css-nesting).
- Colour-space functions like `okchl` and `hsl` make it easier for designers to modify the colours on a page because they are in a language they are used to from their tools.
- Carousels are hard to build, so maybe we should have them as an intrinsic part of the platform. At the same time, there are [tons](https://flowbite.com/docs/components/carousel/#:~:text=Create%20a%20new%20carousel%20object%20using%20the%20options%20set%20above.) of [libraries](https://daisyui.com/components/carousel/?lang=en) that [create](https://getbootstrap.com/docs/4.0/components/carousel/) great [carousels](https://www.npmjs.com/package/react-multi-carousel).

As an author of many sites, I love these features. CSS Nesting alone lets me structure my CSS in a way that I personally find easier to read and maintain. But it doesn't really change the quality of the experience of the site for the person using my site. It doesn't change the performance of the site. It doesn't change how accessible my site is. It just makes it easier for me to write and maintain.

From the perspective of someone who uses the web though, I've almost no interest in the code under the hood for the vast majority of sites that I visit... Well, that's not true, when I see something new and novel I will go and admire at the code and try and learn from it. But by and large, the tools, frameworks and libraries are not something that concerns me much as a user. What concerns me is the experience of using the page. Hijacking scroll mechanics? Yuk. Not using autofill for forms? Urgh. [TODO Add more].

Lets have a quick look at a common pattern that I've seen over the years for development of new web platform features is:

- Web browser's identify a common pattern in popular user-space tools that might be interesting for the web, so a multi-year standardisation and development cycle starts;
- User-space tools that are being used by developers continue to get adoption and develop further.
- The web platform APIs that was being designed to replace the need for the user-space tools frequently don't do enough for them to be replaced with the platform primitive
- The user-space tools (Frameworks and existing libraries) that are "being replaced" are not incentivize to use the platform because they already have something working that is being used.

For motivated developers, green-field projects might take advantage of the new platform primitive. For everyone else? you use what you know.

[TODO: Should we talk about Figma and it's output?]

I believe that there is an opportunity for millions more people to deploy on to the web, that is people who are not formal web developers who will use tools like Loveable, Replit, or even directly in a chat app and they may never need to look at the code, so what then do any of these new APIs do to help them build better sites?

Now, if you consider our current working model for code-generating LLM tools which reflect the ecosystem that they are trained on. This means that any new API, frameworks or library has a large hurdle to get over in terms of being something that will be output by the tool. The fact that _any_ new feature might not be in the training corpus _and_ will not be prevalent enough to have it's usage patterns and idioms ingrained in the training and by extension the output of an LLM; should be a concern.

Forget about Dead internet theory. What about dead framework theory? Maybe we won't care about frameworks directly... but they will still be used.

Now, if we take a view that what can be deployed to the web today is already possible in "user-space", that is pure JS, then the LLM tool can output any code to meet the requirements set out by the user. I see less and less need for developer experience based improvements to the platform, especially in a world where people creating sites might never actually look at the code.

I was recently chatting with a colleague and we were discussing broad tooling needs for the web and the fact that nearly all code created today goes through a compiler. It makes sense, right? We have high-level languages for a reason and a compiler turns it into something that can run on a machine. But unless you are a compiler engineer, you are just placing 100% of your trust in the compiler to do the right thing. In the majority of cases, you don't know how it works, you just know that it does.

We got to discussing how these compilers are built to optimize any arbitrary code as best it can, from the respect of the compiler it doesn't care about the developer's experience at all.

In April, Minko Gechev wrote a [great post](https://blog.mgechev.com/2025/04/19/llm-first-web-framework/) about how you might have LLM output an Intermediate representation (IR) that is then compiled to the target framework, or even just straight out to JS. The idea being that the IR is a more stable target than the framework or even just easier for the LLM to work with.

Well, maybe React is that IR...

Maybe there will be tools to take the IR and optimize them back to platform features if present. Note: I remember Jason Miller experimenting with the idea of reverse-polyfills, which detected say Q.js and replaced it with the native promise implementation.

I was playing around with the code behind Townie by val.town, and one of the things I liked was how they encoded some of the constraints of the runtime they host on (Deno) and their own APIs. The output was surprisingly good and consistently constrained to the platform.

It got me thinking. Does it matter if we have APIs that are designed for developer experience if the LLMs can just generate the code that is needed?

Looking at todays trend of tools outputting React code primarily, the comprehensive ecosystem of user-space libraries can do everything from custom select boxes, specialized date components and everything else that is available.

I think JavaScript is in a good position for the future. Along with Python it's the most use, widely deployed and openly available language.

I think for the web to progress we should be looking to fundamentally new capabilities in the browser; the things that can't be built in user-space, or where there is clear user-experience benefit. View Transitions as an example, especially Multi-page view transitions is something that fits the bill.

For features that browser developers are creating today, we need to take a long hard look at the benefits that they will bring to the user. To that extent, I would argue many of the platform features ranging from Web Components through to CSS syntactical changes are just not needed.

I don't know... I still enjoy handcrafting a site and applying care to the structure of the code, even if there is no difference to what is rendered on the page.
