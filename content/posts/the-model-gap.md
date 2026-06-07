---
title: "please mind the model gap"
date: 2026-06-07T18:00:00.000Z
slug: please-mind-the-model-gap
authors:
  - paulkinlan
---

I'm building software every day at a pace I've never managed before, even when I wasn't a manager. The tools (Claude, Codex, Antigravity) have unlocked a huge amount of potential and given me the ability to experiment. However, I constantly run into issues. I live at the cutting edge of the web platform. A lot of what I build is literally just landing in the browser, so it kind of makes sense that the data is not in the models.

The models are good at stitching context together, so if I want to use HTML in Canvas ([like I did for my I/O talk](https://youtu.be/YuMdsHIXatY?list=PLNYkxOF6rcIBrquBiQhO2csae4Mi147Go)) ([source](https://github.com/PaulKinlan/3d-io-demo-26)), then I can throw in the spec, the explainer, reference materials, and some examples, and the tools can make a pretty good go of it. But I need to know all of these details, most of which are, by their nature, largely unknown.

It gets worse, though, because the models we use, whether Gemini, Codex, or Claude, were trained on the web that was, not the web that is. This means that everything after the cutoff date has to be searched for before it can be used. The agent's desire to search has to be higher than its weights' need to implement what it thinks is the answer.

Here are some examples of issues that I constantly run into:

- Baseline support for features. Many models have an outdated view (by at least a year) of which features are Baseline Widely available.
- The Chrome Prompt API. Most models want to implement the code that was on the web before the API changed (`window.ai` is the wrong API).
- `alert` and `confirm` being preferred instead of the dialog element.
- Any third-party library that is less than a year old.

The knowledge cutoff is not a footnote on the model card; it is the lens through which the model sees the entire platform. And the platform did not stop moving the day the training data was frozen.

Here is what that gap actually looks like, measured in the only unit that matters for a web developer: Chrome releases shipped since the model last looked.

{{< iframe "/model-gap.html" "1120" >}}

The numbers are bigger than people expect. A model with a January 2025 cutoff is missing more than fifteen Chrome stable releases (I know there are other browsers; this compounds the issue even more). Each of those releases shipped new APIs, new CSS, new samples, new documentation, and, crucially, new Baseline support data telling you what is actually safe to use across browsers. None of it is in the model. The model will happily tell you a feature is not widely supported when, in fact, it has been [Baseline](https://webstatus.dev/) for a year, because the support data baked into its weights is a year old.

This is not really a Chrome problem; it is a web platform problem, and it is the reason my team built [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/) ([on GitHub](https://github.com/GoogleChrome/modern-web-guidance)). The idea is simple. If the models cannot keep up with the platform on their own, give them a way to pull the current truth into their context at the moment they need it. Up-to-date guidance, best practices, the use cases, the features that actually solve them, and the support data as it stands today, not as it stood whenever the model was last trained.

I encourage everyone to watch my colleague Phil Walton's I/O talk, "Unlock modern web capabilities in your AI coding workflows."

{{< youtube id=bo3i0FzDUYo >}}
<br>

What I love about this project is that it is deliberately _not an API reference_ but guidance written to solve common developer tasks. The user wants a sticky header, an image carousel that does not jank, a form that validates nicely, or a view that transitions smoothly. The model frequently knows the shape of those use cases. What it does not reliably know is which current feature solves them, how to stitch them together, and how to provide fallbacks or progressive enhancements, because all of that information just doesn't yet exist in the model's weights.

And once you see it as a gap that has to be actively closed rather than waited out, the conclusions, IMO, are uncomfortable. Every library, every framework, and every API vendor is in the same position. You might have great docs, and the models might think they know what to do, but they read last year's version. If you ship anything developers build on, the model's mental picture of your project drifts out of date the moment you release, and the drift only grows.

Coding agents can search the web to patch around this, and they do, but it's nowhere near enough. 1) Search APIs cost you money inside agents. 2) Search APIs bloat your context as they check all the pages. 3) Search is an SEO game played at inference time, with a few links skimmed under token pressure, and it is a poor substitute for something that should be deeply woven into the model's understanding of the world. The web inside the model is the thing developers actually inherit, and this entire situation is compounding what I mentioned in the [Dead Framework Theory](/dead-framework-theory) (which I've heard from many library authors).

The gap will never close on its own. The release cadence of the entire web ecosystem guarantees it. So what can we do?

- Model owners need to build models that are vastly more up to date (I know this is a huge challenge).
- In lieu of model owners doing better, every platform vendor, framework, or library author should work to ensure that their ecosystems have access to the latest guidance and best practices in the most token-efficient ways possible. Take what we've done in Modern Web Guidance and build your own.
