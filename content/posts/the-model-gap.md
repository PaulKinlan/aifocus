---
title: "the model gap"
date: 2026-06-06T18:00:00.000Z
slug: the-model-gap
draft: true
authors:
  - paulkinlan
---

I asked a model the other day how to do something on the web that shipped in Chrome a few months ago. It confidently told me to do it the old way. Not wrong, exactly, just years out of date, reaching for a workaround for a problem the platform had already solved. And it had no idea, because the web it learned from is frozen somewhere back in early 2025.

This is the thing that does not get said enough about the models we all use to write code now. Whether it is Gemini, Codex, or Claude, they were trained on a snapshot of the web, and that snapshot is old. The knowledge cutoff is not a footnote on the model card, it is the lens through which the model sees the entire platform. And the platform did not stop moving the day the training data was frozen.

Here is what that gap actually looks like, measured in the only unit that matters for a web developer, which is Chrome releases shipped since the model last looked.

{{< iframe "/model-gap.html" "960" >}}

The numbers are bigger than people expect. A model with a January 2025 cutoff is missing more than fifteen Chrome stable releases. Each of those releases shipped new APIs, new CSS, new samples, new documentation, and crucially new Baseline support data telling you what is actually safe to use across browsers. None of it is in the model. The model will happily tell you a feature is not widely supported when it has in fact been Baseline for a year, because the support data baked into its weights is a year old.

This is not really a Chrome problem, it is a web platform problem, and it is the reason my team built [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/) ([on GitHub](https://github.com/GoogleChrome/modern-web-guidance)). The idea is simple. If the models cannot keep up with the platform on their own, give them a way to pull the current truth into their context at the moment they need it. Up-to-date guidance, best practices, the use cases, the features that actually solve them, and the support data as it stands today, not as it stood whenever the model was last trained.

The part I find most interesting is that it is deliberately not an API reference. A reference is organised the way the platform thinks, by interface and method and property. But a model writing code for someone is not starting from an API, it is starting from an intent. The user wants a sticky header, an image carousel that does not jank, a form that validates nicely, a view that transitions smoothly. The model already knows the shape of those use cases. What it does not reliably know is which current feature solves them, because the current feature might be newer than the model. So the guidance is organised around use cases, and it points from the thing you are trying to do to the modern way to do it. That turns out to be exactly the join the model is missing.

And once you see it as a gap that has to be actively closed rather than waited out, the conclusion is uncomfortable. This is not a job only Chrome has. Every library, every framework, every API vendor is in the same position. Your docs are excellent and the model has read them, but it read last year's version. Every default the model reaches for, every "best practice" it confidently recites, is pinned to a cutoff date you do not control. If you ship anything developers build on, the model's mental picture of your project is already drifting out of date the moment you release, and the drift only grows.

Agents can search the web to patch around this, and they do. But search is an SEO game played at inference time, a few links skimmed under token pressure, and it is a poor substitute for something being deeply woven into the model's understanding of the world. The web inside the model is the thing developers actually inherit. Right now that web is a year stale and getting staler with every release, and the only real fix is for the people who build the platform, and the libraries on top of it, to hand the model the present on demand.

The gap will never close on its own. The release cadence guarantees it. So the interesting question is not how to make the models fresher, it is who is going to take responsibility for handing each model the current version of their corner of the web, every time it sits down to write.
