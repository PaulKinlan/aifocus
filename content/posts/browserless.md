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

OK, so we are building browsers with an LLM now, but I haven't addressed point 3. While, I mentioned Talaas, the point is about the progression of capability _and_ speed of LLMs. And this is where I project a bit into the land of science fiction (or maybe just pure fantasy).

Let's make some base assumptions:

* Model quality is good enough to implement features given a good enough spec
* Model quality keeps improving following scaling laws
* Model performance keeps improving following [TODO insert law] laws and we see continued 10x increases in performance.

In [Whither CMS](/whither-cms/) I show that you can build a server middleware that takes any markup and renders it on the fly. `<carousel></carousel>` becomes a working component. If the browser supports the carousel-related CSS primitives the middleware uses them; if not, it implements the feature in JS. It's not practical today, but I think we will get to optimized, generated UIs quickly given the current performance trajectories.

I think us web-developers get a bit of a bum rap. Eveyone is saying the tools will automate page generation. However, the web is the people that have the ideas and make the content... So I want to throw this one idea out to our browser-engineering friends: **There is a point in the future where a web specification could be implemented in real-time in the browser...**

My dog (Cwtch, she's a good girl) and I were discussing this very topic  whilst on a long walk the other week and we were trying to determine what would change if the browser is built around the page, instead of the page around the capabilities of the browser? if the browser produces a working components from the provided markup (heck, even just a description) at request time and what would be the implications on the web and browsers?

Take a website that says "measure my heart rate from my Coros monitor and graph it". Today, that needs WebBluetooth, the browser vendor's prior decision to ship the API, the right Bluetooth profile, and whatever JS the developer writes on top. In an instantly-generated browser, the runtime already knows the device. The Bluetooth Heart Rate Service over GATT is documented hardware. The page describes the intent. The browser builds the binding on the fly, the sandbox enforces the boundary, and the user gets the same end result (a working app) with one less spec in the way. Web Bluetooth as a separate web spec stops being load-bearing the moment the browser can produce its equivalent on demand.

Which means the role of a web spec changes. Today specs define a standardised interface that abstracts complexity, so people can access functionality consistently across browsers, securely. Bluetooth is already specced out as a hardware platform. LLMs are getting increasingly good at interfacing with hardware, either by reverse-engineering it or by reading the vendor's guide. If the browser can generate the binding from the underlying hardware spec, the web's redundant equivalent (WebBluetooth, and maybe dozens of others) stops being necessary. The web-platform then can be pared back to a minimal core, and everything above that is generated on demand from intent.

Rendering is the open question I haven't worked out. A lot of the web's UI surface is developer-experience improvements layered over a much smaller graphics primitive. In an instantly-generated browser, is the UI just WASM, Canvas, and WebGPU? [Flipbook.page](https://flipbook.page/) recently showed some compelling ideas about generating UI in a world of LLMs without HTML, and that's the kind of work I'd be watching.

We'd still need to work out security and privacy. The same-origin model and CSP would have to remain, alongside a lot of new primitives we don't have yet. Assistive technology and machines would also need to read generated content with the same confidence they read hand-written HTML, which is its own problem and probably worth a post on its own.

In a world of instant generation, I don't know whether we want a browser vendor to be the one deciding which features make it into the browser. There are roughly two paths:

* If we do want them to decide on capabilities, then web standards for high-level features still make sense and the browser ships the feature (albeit generated).
* If we want to take the browser to the minimal extreme, then web standards become the absolute minimum needed to make a secure and private runtime, and the runtime solves the rest.

Personally I lean toward the second. The runtime evolves faster than a standards process, and once you trust the sandbox you've solved the load-bearing question. The security implications are doing a lot of the work in that bet, so I'm watching the security primitives more than the feature list.

I think we are many years out from having local hardware quick enough to build a browser at runtime, but I'm very interested to see how browsers, and not just web development changes as LLMs evolve and I think there are some low-hanging fruits when it comes to feature development today.
