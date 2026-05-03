---
title: How might a browser be developed
date: 2026-05-03T19:59:06.193Z
slug: how-might-a-browser-be-developed
draft: true
authors:
  - paulkinlan
---

There's a confluence of things that have happened recently that have made me question how browsers might be developed:

1. On January 8th 2026, [Simon Willison predicted](https://simonwillison.net/2026/Jan/8/llm-predictions-for-2026/#3-years-someone-will-build-a-new-browser-using-mainly-ai-assisted-coding-and-it-won-t-even-be-a-surprise) that someone will build a browser using mainly AI-assisted tools within 3 years
2. On January 27th 2026, [one human and one agent](https://emsh.cat/en/one-human-one-agent-one-browser/) built a browser from scratch (great experiments)
3. News came out that [Taalas had a chip](https://taalas.com/the-path-to-ubiquitous-ai/) that can spit out nearly 17,000 tokens per second

I would like to indulge in a little bit of projection and science fiction of my own.

Firstly, I think it is very cool that people are building browsers with LLMs, and as you can expect from a blog about the intersection of the web and AI, I'm on the positive side of this technology.

It turns out that a comprehensive spec and a heap of [unit tests](https://web-platform-tests.org/) are a good way to keep the LLM in check and produce outcomes that should work.

While the Web Platform Tests project is huge with over [72,000 commits](https://github.com/web-platform-tests/wpt/commits/master/), 2,224,302 tests and a testament to the shared goals of browser vendors, it's still nowhere near comprehensive enough.

From my own usage of LLMs and the anecdotes of many other developers, LLMs are very good at creating unit tests, and I expect to see `Spec => Unit Test` happening more and more. I think it will make the specification process a lot more robust, and every browser's implementation will get better as we strive for spec conformance.

If we can get this far with an LLM building a new browser today, and we have comprehensive specs and an even more robust test suite, it feels like there is a pretty straight line to a dramatic change in how all browsers are built:

1. A standards org could create a "canonical reference browser". It's not meant for production but to find all the edge cases in the spec and the test suite.
2. Browser vendors will monitor all test failures in their browser and fix them, or update the browser when a spec changes.
3. Browser vendors will increasingly use LLMs to implement features in the browser, and with a well-planned spec and a comprehensive test suite all features will be developed.

This clearly puts the emphasis on defining good specs.

Browser engines will then differentiate consciously on whether the specs match their vision of the web, rather than on engineering capability or cost.

OK, so we are building browsers with an LLM now, but I haven't addressed point 3. Taalas. I'm not going to talk about the company, but more about the progression of capability _and_ speed of LLMs. And this is where I project a bit into the land of science fiction (or maybe just pure fantasy).

Let's make some base assumptions:

* Model quality is good enough to implement features given a good enough spec
* Model quality keeps improving following scaling laws
* Model performance keeps improving following [TODO insert law] laws and we see continued 10x increases in performance.

**There is a point in the future where a web specification could be implemented in real-time...**

In Whither CMS, I built a server middleware that can take _any_ markup and render it. For example, `<carousel></carousel>` will render a carousel. It worked surprisingly well, all the way up to generating different content types (HTML, image, or video), and it would produce HTML that worked in any browser. If your browser supported the carousel-related CSS primitives, it would use those; if not, it would implement them in JS. Today it isn't quick, but I can see a line where this becomes a way to build sites in the near future.

But I want to take you one step further. During my dog walks I end up daydreaming and talking to my dog (Cwtch, she's great). We both came up with a bit of a thought experiment: if you extend the time horizon far enough and LLMs become fast enough, then the browser can be built around the page, instead of the page around the capabilities of the browser.

Today when I'm building a site, I make a determination of what features I can use based on the audience that I think will access it. If I'm building something that has very specific hardware features, then I might choose Chrome as my target. If it's meant to reach as broad an audience as possible, then I might choose a Baseline feature set that is widely available.

So if we can build the browser on the fly, why would I need to make that decision?

Take, for example: `A website using [Design.md] that measures your heart rate and connects to my Coros monitor`. Today you can get quite far in a couple of minutes; 10x the performance of LLMs twice over and you're at sub-second generation. How might that work in an instantly-generated browser?

The browser runtime knows the machine type and capabilities the user is currently on. In a world of instant generation, the UI follows the `Design.md`, and the browser/LLM knows that Coros heart rate monitors expose the standard Bluetooth Heart Rate Service over GATT. With the browser as the sandbox, it exposes the connection to the HW through the sandbox, and the client-side code calls the hooks that have been defined, and voila... (you have to appreciate the huge hand-waving here.)

Today we create specifications to define a standardised interface that abstracts some form of complexity from the underlying system and enables people to access the technology in a consistent way irrespective of what browser they use, while ensuring the user remains secure and their information private.

So what does that mean for web specs? Do we even need them? I could see a world where the answer is no, because the machines we use have already defined a comprehensive set of specifications of their own.

1. Bluetooth is pretty well specced out as a hardware platform (imagine there was never a Web Bluetooth spec)
2. LLMs are getting increasingly good at accessing hardware, either via reverse-engineering or because the vendor has published a guide.

If we can generate the logic to interface with the user's preferred device at runtime, then we need to take a critical look at features like `WebBluetooth` and ask whether they even need to exist.

We could get to a world where the browser and the web platform are pared back to a minimal set of building blocks, with the rest of the platform generated on demand.

I don't even know how rendering might work. A lot of the web development around UI features is developer-experience improvements. Is UI just WASM and Canvas + WebGPU? [Flipbook.page](https://flipbook.page/) recently showcased some very compelling ideas about generation of UI in the world of LLMs without HTML.

We'd clearly have to work out security and privacy, so I imagine things like the same-origin model and CSP would still be needed, alongside a lot of other new primitives. We'd also need a way to ensure assistive technology and machines can read generated content with the same confidence they read hand-written HTML, which is its own problem and probably worth a post on its own.

In a world of instant generation, I don't know whether we want a browser vendor to be the one deciding which features should be in the browser.

* If we do want them to decide on capabilities, then I imagine web standards for high-level features still make sense and the browser ships the feature (albeit generated).
* If we want to take the browser to the minimal extreme, then web standards become the absolute minimum needed to make a secure and private runtime, and the runtime solves the rest.

I think we are many years out from having local hardware quick enough to build a browser at runtime, but I'm very interested to see how browsers, and not just web development changes as LLMs evolve and I think there are some low-hanging fruits when it comes to feature development today.





