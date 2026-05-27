---
title: are pwas cooked?
date: 2026-05-17T08:00:00.000Z
slug: are-pwas-cooked
authors:
  - paulkinlan
---

I'm 45 years old and using cooked to mean something that it never meant. I don't know when it happened, but it's out there along with vibe.

Anyway... This post is all personal opinion.

Before we go too deep, I just want to ground some of this article in the definition of a PWA. [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app) has a good overview.

> "A progressive web app (PWA) is an app that's built using web platform technologies, but that provides a user experience like that of a platform-specific app." 

There's a lot more detail on MDN where they discuss "Platform Specific Apps" and the benefits of using the web. 

One of the sites that I help to run [web.dev](https://web.dev/pwa), says this

> Progressive Web Apps (PWA) are web apps built and enhanced with modern APIs to provide enhanced capabilities while still reaching any web user on any device with a single codebase. They combine the broad reach of web apps with the rich capabilities of platform-specific apps to enhance the user experience.

See: https://web.dev/articles/what-are-pwas

But what does the actual support look like? I pulled together the following, which is my best attempt to accurately try and summarize and categorize PWA capabilities from Core "what the og definition said", through to "device APIs" that Chrome has pushed on with a lot of enthusiasm.

{{< iframe "/pwa-cooked-baseline.html" "1280" >}}

That support matrix doesn't look great. The core of the original technical requirements are mostly supported (Service Worker, Cache, and installability), but the further you go into the capabilities that people might expect a "platform application" to have are increasingly not supported across the web.

Now you can argue that Device Capabilites like USB, Serial, HID and Bluetooth should never be on the web, but when I look at the last decade [going back to Frances Berriman and Alex Russell's original 2015 framing](https://infrequently.org/2015/06/progressive-apps-escaping-tabs-without-losing-our-soul/), the case for PWAs as a target for serious application development rested on one bet: the web platform is good enough to host and run the majority of experiences that a business or developer would want to run. Implied in that bet was that we could close the gap with native fast enough that developers wouldn't have to write four codebases (iOS, Android, Mac and Windows).

I've tried to pull together, as best I can, the shipping history for the full API surface that makes up what people think a PWA is, grouped into the same bands as above, dividing it into: core, engagement, background work, system integration, and device. Blue dots are Chrome, orange are Firefox, and grey are Safari. The open circles are "still not shipped".

{{< iframe "/pwa-cooked-timeline.html" "980" >}}

We never closed the capability gap on the platform, and now with LLMs you can build four platform-specific codebases that are deeply integrated into the hosts that they run on quickly and to a high quality.

I think the pattern by band tells you a lot, and I expect each Browser vendor will have their own take that supports their stance. 

* **Core PWA** (Service Worker, Web App Manifest, Cache API) is the one band where every engine shipped. This is the foundation, and it works everywhere. 
* **Engagement** (Notifications, Push, beforeinstallprompt, App Badging) is a half-shipped surface. [Safari got Push and Notifications in iOS 16.4 (March 2023) but only for installed home-screen PWAs](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), and beforeinstallprompt is still Chromium-only (iirc [Firefox removed its Site Specific Browser (the closest thing it had to a PWA install) in Firefox 86, February 2021](https://bugzilla.mozilla.org/show_bug.cgi?id=1682593)) and [Safari has no equivalent prompt; installation is manual via the share sheet](https://web.dev/learn/pwa/installation-prompt). 
* **Background work** (Background Sync, Background Fetch, Periodic Background Sync) is the band where the cross-engine story collapses entirely. Every API in it is Chromium-only and has been for years. [Mozilla's position on Background Sync is "negative"](https://github.com/mozilla/standards-positions/issues/173), and so is [its position on Periodic Background Sync](https://github.com/mozilla/standards-positions/issues/214). Background Fetch is still [under review](https://github.com/mozilla/standards-positions/issues/30) and Mozilla has not committed to shipping it. 
* **System integration** (Web Share, Web Share Target, File Handling, Launch Handler, Manifest Shortcuts, Window Controls Overlay) is mostly Chromium-only, with Web Share as the one partial exception. 
* **Device / Fugu** (Bluetooth, USB, NFC, Serial, File System Access, HID, Idle Detection, Local Fonts, Compute Pressure) - 0 progress.

The point of breaking it down this way is that "PWA on the open web" was never just a Fugu story. Fugu is the surface that gets quoted because we excitedly promoted it, and at the same time, the rejections are loudest. For me, the broader gap is in engagement and system integration work, the things developers most associate with what a PWA *is* - it should feel like it's part of the system. If you cannot run a Web Push notification, badge the icon, or sync data in the background on every engine the same way, the PWA-as-app metaphor doesn't hold. The Core PWA band is the only one where the metaphor still works, and even then, installability is a big gap.

Set against that, native development is getting dramatically cheaper. [Xcode 26 with Claude Agent SDK + Predictive Code Completion is reporting ~60% time reduction on SwiftUI projects](https://medium.com/@osmandemiroz/reduce-ios-development-time-by-60-with-claude-code-86a4e9d864ca). Apple's [Predictive Code Completion runs on-device](https://lickability.com/blog/xcode-predictive-code-completion/) on the NPU, trained on Swift and the Apple SDKs. [Anthropic's Agent SDK is integrated into Xcode 26.3](https://www.anthropic.com/news/apple-xcode-claude-agent-sdk). [Compose Multiplatform iOS reached Stable](https://www.jetbrains.com/lp/compose-multiplatform/) last year. [React Native New Architecture](https://reactnative.dev/architecture/landing-page) shipped with the bridge removed. [Tauri 2](https://v2.tauri.app/) covers six targets, including iOS and Android. [Lynx](https://thenewstack.io/cross-platform-ui-framework-lynx-competes-with-react-native/) is in TikTok production at a 2.5× React Native startup. The cost differential between "ship native iOS + Android + Desktop" and "ship a PWA" is getting ever closer.

My worry is that the web is shipping the same APIs across browsers significantly more slowly than native is becoming cheap. The gap is widening on the things developers actually want a PWA *for* (install and system integration, and to a far lesser extent, hardware access), and the alternative is materially less expensive than it was even 6 months ago.

The biggest benefit of the web is that they're not an app store, and that seems to be one of the last major hurdles if we think the web *is* the app platform.

I actually don't know what the answer is. Speed up? [I do expect browser vendors to start using LLMs to land features](/how-might-a-browser-be-developed/). I just don't think we are going to get over the hurdles of the differing principles of what Browser vendors want to prioritize. Apple could ship System integrations and device APIs. Mozilla could ship the APIs they have been opposing. Google could slow down... The Interop project could be more aggressive... A power of the web's standardising process is that everyone can disagree and offer a version of the web they want their users to experience.

The thing that is genuinely cooked is the framing that put PWAs in competition with native apps in the first place. The framing said: pick a platform target, the web is your option for cross-platform, install your PWA, and get most of the benefits of native without the cost. I really do think that this framing is over. Native is no longer the cost it used to be. The web cannot win that comparison on capability, and the consumer behaviour on installable PWAs never crossed the threshold required to make it a category. [Web app manifest adoption has been flat at around 9% of sites since 2022](https://almanac.httparchive.org/en/2025/pwa). 

[Service worker adoption is about 19% of all sites](https://almanac.httparchive.org/en/2025/pwa), up roughly tenfold from 2022. However, it appears that much of that is Google Tag Manager auto-installing them for performance, which is itself the point: the *plumbing* of progressive web apps became background infrastructure. Sites don't seem to be adopting installability, and offline and caching, with about 8% of sites that have a service-worker use `caches.matchAll` (a sign of integrating offline support). That means approximatly 1.5% of sites in HTTP Archive are doing offline (a core tenet of PWA).

Sheesh - it's great that people are able to do this, but it's certainly not what I hoped it would be when we started this 10 years ago.

The web's value as a *substrate*, or the platform, is that it's the surface that anyone, human or machine, can read, link to, embed, compose against, is having its strongest year in a decade. The tools that people use whether that's Chat GPT or Coding CLIs - they do not load app bundles. They load URLs. [A link is all you need](/a-link-is-all-you-need/) apparently.

If you are shipping a productivity tool that wants widgets, [Live Activities](https://developer.apple.com/documentation/activitykit), [App Intents](https://developer.apple.com/documentation/appintents), system-wide hotkeys, deep accessibility services, or [Apple Intelligence integration](https://developer.apple.com/apple-intelligence/), the web is the wrong target. You have to ship native because the vendor made choices to not let the web integrate as you might want, and now you will use an LLM to write most of the code. The PWA can't ever win that fight.

Government intervention hasn't changed it, and my feeling is that it is unlikely to change. So maybe how we think about what goes onto the web has to change.

I'm not going to sit here and say "OMG there's an existential threat, therefore to save the web you need to do [insert google priortity]"... But as an industry, I do think we should look at the opportunity of the new platforms that are putting pressure on OS owners and see if we can lean in more.

If you are shipping content, embeddables, agent-callable services, anything that benefits from URLs and search and links and silent updates and zero install, the web is by some distance the right answer. Discovery still happens on the web. Sharing still happens through links. Agents still consume the open web. The more I use LLMs the more I think that next generation of clients is not mobile apps. It could be web-shaped clients with agent layers on top.

I think the web can actually accelerate and influence the direction of computing, so I thought it might be good to enumerate some that I think it could:

The first is the agent-interface. Whether [WebMCP is the right solution or not](https://developer.chrome.com/blog/webmcp-epp) is not something I can litigate now, but having a developer or business have their web pages expose tools to the user's agent over a standard interface could cement the web in a future that might see massive growth in people using new "User agents". This concept is structurally the most important new web API since Service Worker that I've seen imo. It will need broader cross-engine support etc, conventions for agent-card manifests, and a public registry story etc and a heap of things that I can't think of right now. [But I think it offers so much opportunity](/webmcp-is-the-new-web-intents/)

The second is on-device inference in the browser. [WebGPU achieved Baseline in January 2026](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers-now-ship-it/). [WebLLM](https://webllm.mlc.ai/) runs frontier models in-tab via WebGPU, and even the prompt API to an extent offers a vision that the web can evolve quickly as the first cross-platform runtime for client-side AI, as long as web developers learn how to deal with non-determinism. If that lands while native still requires per-platform model packaging, the web gets a capability native does not have.

The third is Interop and Baseline confidence. [Interop 2026](https://web.dev/blog/interop-2026) is the right project. Its weakness is that "Interop landed" still means waiting 30 months for the Baseline window to close. If the four major engines collectively cut the Newly-to-Widely lag by a year, the entire developer experience of writing for the web shifts.

The fourth is embedding + composition + portability. I do however think we're missing out on primitives that enable better embedding and composition. For example, I regret Web Bundles' tie to AMP because it offered a vision for being able to share content more broadly while keeping same-origin semantics, and as I see coding tools creating HTML pages, I really think we have an opportunity to make bundling and sharing simple and safe. There's also a lot to be explored around iframes and sandbox, as I noted in [the browser is the sandbox](/the-browser-is-the-sandbox/)

The fifth is making content experiences even stronger. There's been great work on things like [view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/), [popover](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/popover), [anchor positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning), [scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations) to make it easier to build very rich experiences. And when I look at things like HTML in Canvas and what they can enable, that I can't imagine these being easy to ship across native platforms. But as an industry, we have to think about making it easier for everyone to create, publish, and share amazing experiences to make the web something people want to keep coming back to.

The 6th is distribution. The web has no gatekeepers and no approval process. The biggest things slowing down apps are the time it's taking to land, the approval process for app stores, and the gatekeeping that comes with that. Maybe there's a world where the app review times get so long because so many people are submitting apps to the stores that it's clear the web is a winner here.

I'm personally not optimistic about PWA outside of the core set of features (SW, Cache, and Manifest), ignore the device APIs, there's a lot that is still needed. But at the same time, I came across [this post just before publishing](https://justsitandgrin.im/posts/native-all-the-way-until-you-need-text/) that gives me hope we have a bit of time. 

I am interested in hearing how you think the platform needs to evolve.
