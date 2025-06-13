---
title: hawking tokens
date: 2025-06-06T19:59:06.193Z
slug: hawking-tokens
draft: true
authors:
  - paulkinlan
---

17 years ago I discovered Google App Engine. It was the first truly scalable "serverless" platform that I had ever seen. I could just write an HTTP handler and it would scale to meet the demand.

It was also the first time in computing where I experienced a direct relationship with the cost of my code running. Prior to this every service I built was compartmentalized to a physical server. I was used to building software and algorithms for this model. Database contention, process contention, C10k etc were all things that I had to plan for. Yes, you developed your algorithms to avoid those problems, but we tended to scale by estimating the total QPS per box and when you hit a limit you would just buy another box and stick it in the rack.

App Engine however could scale to meet any demand I could throw at it. I just didn't have to worry about any of the physical limitations, or other constraints that I had previously worked with. It was a new world for me. I just had to deal with this one weird thing... A new billing model based on [CPU time](https://web.archive.org/web/20100208021046/http://code.google.com/appengine/docs/quotas.html).

The more money that I could spend in the moment, the more access to CPU time I had. It was such an interesting model for me. What if I get popular? I'm just using this as a side-project... In the "old days", my box would just grind to a halt and I would make a decision to either upgrade the box or buy another one. Now.... Should I charge my customers using a similar model? How would I explain that?

Ultimately, I chose not to follow that model for billing my customers, but AppEngine lead me down an optimization path that I never thought about before, but couldn't get out of my head. CPU time cost me real money, I need to reduce it on a per user basis.

I did some back of the envelope calculations and I realized that if I shaved off 100ms of CPU from my request handler, I would save tens of dollars a day (this was a lot for me at the time). I started to think about how I could optimize my code to get the CPU time down, lots of micro-optimizations here and there, and as I deployed each new version and I could see the CPU time drop.

I felt like an absolute genius.

[Then AppEngine changed their billing model](https://glaforge.dev/posts/2011/09/01/google-app-engine-s-new-pricing-model/).... hah.

Today, I'm building software and using LLMs all of the time to help me. They chew through bootstrapping of projects, bug fixes and even new features. I'm sold on the model and the gains that I get from it. Granted, I'm not a typical engineer, I'm a manager and I've spent a lot of time _not building_ things over the last couple of years, but these tools have changed my life.

It feels like a real moment of change. "Normal Businesses" can be relatively rational when it comes to controlling costs, so my logical assumption is that if the companies are spending the money (and I'm hearing that they are), they have likely costed it out and they must feel that they are getting a return on investment. I've no clue or connection to what happens at Google, but I hear from people in the ecosystem that lots of companies have blanket deals with LLM providers to enable all of their employees to use LLMs all day, and when there isn't a corporate deal, some companies give their teams budgets of a couple of hundred dollars _a day_ to use these tools.

Inference trends seem to indicate that there is more usage happening.

I find OpenRouter's inference trends fascinating. They are a service that provides access to a wide range of LLMs, and they have been tracking the usage of these models across their platform. You can see the trends in usage, [the most popular models](https://openrouter.ai/rankings), and even the [top applications that are using these models](https://openrouter.ai/#:~:text=View%20docs-,Top%20Apps,-Largest%20public%20apps).

{{< figure src="/images/openrouter.png" alt="OpenRouter Inference Trends" caption="OpenRouter Inference Trends" >}}

{{< figure src="/images/openrouter-topapps.png" alt="OpenRouter Inference Trends - Top Apps for the month" caption="OpenRouter Inference Trends - Top Apps for the month" >}}

As LLMs chew through teraflops of compute, it seems like tokens _is_ the current best model for billing. When models are less intensive to run the tokens tend to be cheaper (Gemini flash) and more expensive when they are doing more.

Per token billing is the new CPU time billing. Per-goal is the new per-request billing. Is there an equivalent to per-instance billing?

It raise a number of questions for me as a web developer.

Firstly, for web developers selling a service that interfaces with an LLM how do you bill? Like CPU time, tokens just aren't a measure that any normal person will understand, and they should probably never have to understand it. We are going to see a lot of iteration in this space. For example, I run an RSS summary service called [tldr.express](https://tldr.express). It's small enough that I can eat the cost of running every RSS feed that is subscribed to through the LLM... But when I reach 1000 users, then what? I don't think there is any way that I could add a margin on top of my direct token cost, I would have to think about a more traditional SaaS model and hope people use the service but not too much...

Secondly, a bigger challenge for web developer is the tools that we are starting to use every day now have a cost associated tied directly with their usage and this is a huge change from the past.

I'm old enough to remember buying Visual Studio so that I could build windows apps with MFC (I lied a bit here, my Dad bought it for me). The tools cost money, but it was a one time purchase. We then transitioned to expect that your development environment and tool chain is free.

Now we are seeing an explosion of token-slinging services that cost significant amounts of cash. Cursor costs $20 a month for 500 request (I think I get through 500 requests in a day sometimes.) Replit is per "goal". Cline is per-token based.

It's a difficult trade-off for web developers. You can feel incredibly productive and can see the output; when things are going well, you don't want to stop. But at some point, you have to. So, do you trade cost for quality? I don't know a single developer who wants to produce a low-quality product or use a tool that outputs lower-quality code than another. It's a real challenge and one that will increase as more developers find value in these tools.

It's very interesting that IDEs and other tools are asking you to have a direct relationship with the LLM vendor. I can see the logic to some extent; the IDE doesn't assume the cost of the developer's work. However, I now get annoyed with the tools when there is an obvious mistake in the LLM-generated code because it actually cost me real money.

Cost is going to be the next barrier that we have to overcome. I have a job that enables me to spend what I want to spend and see the benefits from it, but for a small individual developer or a small software shop, even $10 a day is a lot of money, and can equate to less than an hour of LLM usage.

How should we think about our more junior folk or people starting out in the industry how don't have access to the funds to use these tools?

How do we think about emerging or weaker economies? Tokens aren't priced to the market they are being used in. If you're in a region that has lower salaries, lower revenues or has a currency that isn't as strong against the dollar, then you might struggle to be able to afford to use these tools even if the increase in productivity is significant.

I worry that there might be an ever widening gap between those who can afford to use LLMs and those who can't.
