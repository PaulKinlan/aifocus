---
title: setting goals and working backwards
slug: setting-goals
description: web development has changed. setting goals for your agent harness is incredibly powerful
date: 2026-08-09
draft: true
authors: 
  - paulkinlan
---

I think a lot of Web Development has changed almost overnight and I didn't quite realise it was happening. I know there is a lot of discussion about loops, graphs, goals and autoresearch, but general gist is that you give your LLM and agent harness an objective or some endstate and your tools will keep itterating until the goals have been achieved.

I put this to test recently on a number of different projects and it's been pretty incredible and it's enabled me to change my level of engagement with my tools. I steer less.

It feels like I'm watching Tom Cruise in Live, Die, Repeat, but with significantly fewer aliens.

The first project that I tried this on was a problem that we have on our team. Chrome updates every 4 weeks and there can be 30-40 changes to Chrome's view on the web-platform in every release. When Chrome moves to it's 2 week release cycle you would expect that that number might halve, but I expect everyone's favourite paradox (the Jeverons one) will come into play and we will eventually end up with the same number of changes every two weeks. For a developer relations team, the current state is already unsustainable. It's nearly impossible to create the requist examples and samples for every feature in every release.... So can I help the team?

The [chrome-platform-showcase](https://chrome-platform-showcase.paulkinlan-ea.deno.net) is my experiment to create a complete directory of compelling samples, demos and tools for every feature that comes in to Chrome's web facing feature set. Chromestatus.com is our view on what we know about Chrome and it contains links to as much information we have about the state of the feature. So, if we have the links to the Spec (or the draft of it) that describes how it should work; the explainer which contains a more human-readble explanation and use-cases; links to the actual implementation in Chrome, as well as the change requests, bugs and feedback from the other browsers on the platform. We have a pretty good picture for how the feature works and what it was inteded to be used for, we can then prompt our favourite LLM and agent-harness to build what we think a developer (or their agent) might need and want to use.

Create, Test, Repeat.

I had to set out very clear goals and how to test. But the goal also included how to research and how to create a set of demos and tools, and then how to test. The testing loop was also pretty critical. For example, Load the demo. check visually, check the console for error logs, interact with the demo repeat.

While there are some edge cases and issues, it's worked surprisingly well.


* [state of the web](https://paulkinlan.github.io/state-of-the-web) - Using [webuplift](htttps://github.com/paulkinlan/webuplift) - you can take the report and optimize it.



* [wasm-vs-js](https://wasm-vs-js.paulkinlan-ea.deno.dev/) - A side by side comparison of WebAssembly perforamnce and JavaScript
* [webai.show](https://webai.show) - 

pi-auto-research - itterate until you reach a performance goal.
  * For the WASM-vs-JS project, it took about 120 seconds to run the validation/testing phase of the build. It was a critical component because it helped me make sure that the LLM correctly implemented what I had asked. `/autoresearch make the build fastser` was enough for the tools to go through about 50 itterations and take the build from 120 seconds to about 12.

