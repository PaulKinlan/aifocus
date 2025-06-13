---
title: do not read or take seriously
date: 2025-05-18T19:59:06.193Z
draft: true
slug: dumping-ground
---

**If you are reading this, then know that this is just random thoughts that came in to my head and should not be taken as a definitive statement on the state of the web, my employer, or me either.**

For now at least its the best window on to the tools that LLM makers are building, and while there is still a lot of competition in the space, the web still has a chance to thrive.

Do we need to rethink the capabilities of the platform though?

When I was working on the projects that were aimed to help the web go mobile-first, there were a number of states that we (well, Google) went through. "Functionality" is moving into Apps and App Stores are blocking web apps from their stores, therefore we need PWAs to make sure the web has the same presence on the users device, which then leads to an end-state were you believe that you need projects like "Fugu" which attempted to bring the same functionality from Apps in to the browser. We never did get parity with the mobile platforms, they expanded their own capabilities too quickly for even a browser like Chrome to be able to keep up, and the inconsistency of the capabilities of their platform meant that it would be nearly impossible to get the same experience across all devices, something which a lot of developers care about.

There are also other issues. The web is [incredibly lumpy](https://paul.kinlan.me/the-lumpy-web/) and of these capabilities are not baseline functionality across the platform - they're just not implemented because there was never alignment on the extreme end of the mobile-first "App problem".

And what if people who use the internet for the first time don't know about the web? We have a discovery problem not a technology problem.

Then there is the other extreme. As people's time moved into Apps, you saw platforms like Facebook adapt because their natural end-state is a desire to capture more user attention into their experience. In retrospect it felt pretty obvious that when Facebook launched Instant Articles their goal was to have all content to be published into their platform. Why wouldn't you want this? Yes, they could provide a faster, cleaner experience for content consumption than the slow and bloated Web and if people were already in their app, there would be an incentive to publish more in their app. That's certainly _feels_ a threat to the web and someone should do something about it. If you're a company that relies on the web and you see a competitor do what Facebook did, then it's not a stretch to see something like AMP as a potential answer - you want to remove the things that make the web slow, you want to run 3p content in your context but also allow third-parties to do the same...

The adaptation of the web to mobile was a long process, and on reflection, it is unclear if the reaction and the subsequent copying of the functionality of these device platforms was the right thing to do, vs finding ways for the web to differentiate itself from the native platforms.

I look at the fact that both Apple and Google tried to recreate the best of the web: Linking; with Instant Apps and App Clips. They are both trying to create a way to link to content that is not a web page, but a native experience. They are trying to recreate the web in their own image, but have they succeeded? No.

====

OpenRouter is very interesting as a business.

Assuming OpenRouter can negotiate better rates and have a margin for their service, why would you as an app developer send tokens through it when they are more expensive that going direct? Say, I'm an app developer that sends 100's of millions of tokens to the LLM. Should I not get some sort of benefit for preferring their service? You do wonder if there was more competition then these middleware providers would be doing something for the developers of apps that sling tokens their way.

I personally struggle to yet see how any of these services become anything other than an arbitrage of token costs. Kind of like how Vercel has historically sat on top of other services and charged a premium for the convenience of using their platform.

Given how hard it was historically to get an API key from Google, I can totally see the value of a service like OpenRouter. I imagine they might be able to negotiate better rates given that they are chewing through 8.4 trillion tokens a month.
