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

I'm not the first to report  that the increased cadence of code creation is making things like code-reviews harder or making issue management for OSS projects all but impossible. I'm not as impacted by those changes as many others are, but there is one thing that I've clearly noticed is that:

1) the way I've built projects in the past is not structured well for having many agents committing to them at the same time.
2) the default project structure that agents create (at least as far as I have seen for web-based projects) doesn't scale well to having many agents committing to them at the same time.

Github recognized that this is an issue for popular Open Source projects by introducing [Merge Queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

I was inspired by Pi's extension architecture with a tiny core, and the [Malleable software](https://www.inkandswitch.com/essay/malleable-software) ideas expressed by the folks at Ink & Switch.

I do wonder if we are essentially going to see more software become 


