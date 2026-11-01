---
title: merging is an issue
slug: merging
description: ""
date: 2026-11-01T15:33:41.498Z
draft: true
authors:
  - paulkinlan
---
I noted in "[Setting Goals](/setting-goals/)" that I have been building and maintaining a lot of software. It's been hugely rewarding and I'm constantly surprised what these tools are able to now do for me, but I also notice many down-stream problems.

I'm not the first to report  that the increased cadence of code creation is making things like code-reviews harder or making issue management for OSS projects all but impossible. I'm not as impacted as many others are, but I am hitting limits that are slowing my iteration *after* the code is created, and I see two ways the manifest.

1) the way I've built projects in the past is not structured well for having many agents committing to them at the same time.
2) the default project structure that agents create (at least as far as I have seen for web-based projects) doesn't scale well to having many agents committing to them at the same time.

Github recognized that this is an issue for popular Open Source projects by introducing [Merge Queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

I was inspired by [Pi's extension architecture ](https://www.youtube.com/watch?v=RjfbvDXpFls)with a tiny core that *is* the application and then everything else can be added by the users, and the [Malleable software](https://www.inkandswitch.com/essay/malleable-software) ideas expressed by the folks at Ink & Switch.

I didn't really buy it a couple of months ago, but now I am converted. I'd been stung with configuation and performance issues when we were practicing [Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection) many moons ago when I worked in Enterprise land, but I reflected on this bit and I realised that they weren't the same thing. When we practiced dependency injection, we weren't using it to extend the software we were using it swap out database or Caching layers. As software changes and I want to extend

But anyway, this is the point of what I am writing about. How does this extensibility help with merge issues? Extensibility and a focus on the core forces a decoupling (we need callbacks, hooks, events and busses, UI ports) that encourages more stability in the core and then the areas where the application functionality changes a lot and there is a lot of interplay with other modules we can make changes without breaking the other modules.

Arguably, software that is developed by large teams will tend to (but not always) be structured in a way that makes contribution as easy as possible. Just look at Chromium, probably one of the largest OSS projects, it can maintain thousands of people working on it daily and still ship every day ([go and have a look at Mojo](https://chromium.googlesource.com/chromium/src.git/+/51.0.2704.48/docs/mojo_in_chromium.md) as one of the many changes made to Chromium.)

I don't know about you, but I don't find that the default output of models and agents is such that we enable parallel work to happen on our projects.


I put this into practice with my Markdown Editor for this very blog.

I do wonder if we are essentially going to see more software become more user-configurable because we will be forced to change the architecture of our code so that we can increase the cadence or changes and merges.... or maybe someone will solve merge issues.


TODO.
If I don't want my site to be [reverse-engineered](https://rea.tools/) what can I do? Maybe it is keep the core as minimal as possible and allow people to extend it....