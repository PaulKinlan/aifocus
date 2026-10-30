---
title: WAT the heck
slug: wat-the-heck
description: "I asked a model to benchmark JS against WASM and it did, but it
  did something more than I expected and it made me question that if we stop
  reading generated code, why ship JavaScript at all?"
date: 2026-10-30T17:43:57.541Z
draft: false
authors:
  - paulkinlan
---
I had a conversation with a buddy in work about the performance differences between WASM and JS that started like something like this:

> THEM: Hey, team X has had some really good wins with WASM, they're saying it's a lot faster than their JS implementation. Should we be thinking about developers using WASM as their preferred runtime?
> 
> ME: huh. I'm not sure. What's the data?
>
> THEM: Outside of team X, it's not clear either way because I've never seen a clear comparison.
>
> ME: Err... I wasn't planning to do this, but let me go and play.

The issue now is that I had a mindworm that I had to try and get an answer to and more importantly I have an LLM-shaped hammer. So my LLM-shapped hammer squashed the worm. I built a benchmark suite that helped me test and validate some of the questions that we had... And you know what, I have some data, but it needs a lot more validation, but it turns out it's not the most interesting point of the story. Btw, [the code is on GitHub](https://github.com/paulKinlan/wasm-vs-js) if you want to look.

The project is pretty simple, I defined a suite of tests for things that I would expect a modern web site or application to do such as Math, Data Processing, DOM manipulation, Text Processing, 3D and Neural networks and then I asked the model to build out the suite of tests in "JS and WASM" and then let me compare the performance between runs.

I just want to highlight one thing, "JS and WASM" was literally what I asked. My harness went away for about a day and built out about 30 different tests, the test harness, the reporting, the validation that each of the algorithms in JS and WASM produced the same results. Bingo! I could run it from the UI and see the results... WASM was waaaay slower! Weird!

I should look at the code.

It turned out I had asked for tests to be end-to-end and that we should account for the network (I had thought payload, processing and then execution were important to measure) and the model didn't account for the fact that JS has to load, it had assumed "well, it's native to the browser"... The WASM tests had the cost of the download and compile that the JS tests didn't.

"I should probably check all of this over a bit more".... A few moments later... "Hmm. Where are the C files?" I couldn't find them. My assumption was that for every test the harness would create the JS version (it did) and it would create the same algorithm in C, compile it with [Emscripten](https://emscripten.org/) and that is what would be run.

Nope. I saw a heap of JS files and a heap of WAT files. A WAT file is the [WebAssembly Text representation of the WASM binary](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Understanding_the_text_format) that the browser can run. While it still needs to be compiled to actually be run, I was surprised that the model correctly output the code in the most minimal form of readable WASM possible. There was no higher-level language used.

This led me to ask the question: Why do we need to ship JS?

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Idly musing that if we don't look at the code anymore, why are we shipping JS and not WASM.</p>&mdash; Paul Kinlan (@Paul_Kinlan) <a href="https://x.com/Paul_Kinlan/status/2084250175074160822?ref_src=twsrc%5Etfw">August 3, 2026</a></blockquote>
<script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>

I know why I ship JS. It's the language I've used for decades building websites, but the more I use these LLM tools, the less I am looking at the outputted code and relying on my tests and usage of the output. I used to want to write well-structured code so I can maintain it, but now the tools are good at making the changes that I need to get the outcome I want.

So when would you use JS for your application?

* It's faster than WASM - my (still relatively unscientific) testing has not found a case where JS is faster than code that is compiled to WASM (with C, C++ or Rust).
* It's safer than WASM - I'm unsure of when this would ever be the case. WASM doesn't have direct access to the DOM so it has to go through JS imports, and it runs in the same browser sandbox as JS.
* You want people to be able to maintain it - I think this is probably the strongest and most rational reason, but if the tools make the changes and the tests check the output, it might matter less than it used to.

But I think there is a broader and long-term question. I was mind-blown that the model just output WAT files and it made me think when would you even want the model to output a higher-level language? The models seem incredibly capable of just spitting out WAT. Well, it's actually probably quite similar to why people choose higher-level languages:

* Context efficiency - you will be able to describe more of the functionality with fewer tokens
* Safety - while WAT output was incredible there are no guardrails like memory safety that you might get with a language like Rust or Dart.

So no, I don't think we want to output WAT directly from the LLM, but we should do a far deeper dive into the effectiveness of WASM as the runtime for logic in web apps. Early looks at the [data in the benchmark](https://wasm-vs-js.paulkinlan-ea.deno.net/) suggest that WASM (irrespective of WAT, C, C++ or Rust) consistently runs faster than the equivalent JS code for both straight algorithmic logic (think data processing) and also cases where there are interactions with the DOM. WASM still reaches the DOM through JS, so that DOM result is the one that needs the most validation.

{{< iframe "https://wasm-vs-js.paulkinlan-ea.deno.net/" "900" >}}

This was a very fun project to build.  I learnt a lot building this project over and over again. If you go and look at the repository for this project you will see that I've done a lot of iteration over it and structurally it's changed a lot. For example, I do now include other languages that compile down to WASM in the tests (C, C++, Rust, Dart). If you have any questions, comments or critiques, please let me know.