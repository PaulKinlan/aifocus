---
title: projects
description: 
date: 2026-01-02T19:20:54.779Z
slug: projects
---

It's been nearly 9 months since I started this blog and I feel that while I kept up a good pace of articles and I've dived deeper in to my thoughts on the intersection of web and AI (specifically LLMs), a lot of what I've done in the last year is building things, so it's all been kind of hidden.

To set some context, I'm the manager and lead of the Chrome Developer Relations team. My day job is to help my team be successful (they are successful when they help developers build amazing websites and help the web to thrive). Up until 2024 I'd been personally very pessimistic about the health and future of the Web. The platform is competing against mobile platforms (specifically Apps) and the platforms defined by those Apps (Facebook, Instagram, TikTok) and not really succeeding. These new platforms made it even easier to share ideas and content, and the general thought was that all use of computing by the billions of people on the planet will move to these new platforms and you could see and feel this slow decline of the web. While LLMs have enabled me to be incredibly productive both in helping me do my day job, they have revitalised my passion for the web because 1) I think it's the most versitile medium that we have ever seen (and will ever see), and the ability for LLMs to parse and manipulate content give us an ability to build entirely new experiences instantly for anyone with a computer and internet connection, and 2) it rekindled my love of experimenting and pushing the boundaries of what is possible on the medium that is called "The Web". I certainly don't dismiss the challenges that LLMs might also present for the medium, but I'm also happy to work out how to tackle these while also building and pushing the capabilities of browsers.

This post details just some of the things that I built that I think are interesting enough to share (and that I can talk about)

First up, the experiments that I built to try and push on the intersection of the Web and LLMs by deeply integrating both technologies:

-   [ai-wc](https://github.com/PaulKinlan/ai-wc) - AI Web Components. In my [elements](https://aifoc.us/elements/) post I explored how we might add LLM technology to enhance existing elements. I've got a bit of a love-hate relationship with Web Components, but the ability for them to now participate in a `<form>` submission is a critical enhancement and I really wish there was more exploration of web components in this context.
    
-   [Blog Craft Editor](https://blogcrafteditor.paulkinlan-ea.deno.net/) - I explored how to add writing assistance to an existing editor that I build just using LLM's. The new updated editor now has the ability to upload all of your content from a directory on your machine and use it to cross-reference existing posts finding links that I forgot, and more importantly for me to help me find gaps or connections across things that you've said before. Using your existing writing as context, the tools can act as a useful critic of your ideas if you prompt the tool correctly.
    
-   [Deep Research via Email](https://www.val.town/x/paulkinlan/deep-research-email) - Send an email to: `deep-research@valtown.email`**. Subject**: Your research topic (used for threading and replies). **Body**: Detailed research question or context. **Wait**: The system will process your request via Gemini DeepResearch Agent and send the research report back to your email.
    
-   [Fauxmium](https://github.com/PaulKinlan/fauxmium) - I'm particularly proud of this one. A fully fake internet. Inspired by the original websim project - you enter a URL and you get a website that the LLM outputs based on how the model's biases tend to what that URL might represent. This version is even more advanced, it starts up a real browser (Chrome for Testing) and the LLM intercepts every request and generates a response. I just run `npx fauxmium` when I need some entertainment and I browse a fake web for a couple of hours. Some neat things on this: It generates images for the page and it can also create videos. This means that you can go to a fake youtube and watch an entire infinite set of 8 second clips (the neat thing is that the video uses the generated poster art as the source). The final neat thing is that it installs a Chrome Extension to help you track the cost of your browsing.... It's fun that it's about as fast as the 90's internet and costs a similar amount to what my parents paid for the minutes I used on the telephone.
    
    -   [Interceptium](https://github.com/PaulKinlan/interceptium) - Following on from Fauxmium, I wanted to experiment with what an LLM could do if it was a different parts of the network request stack. i.e, if you can generate POST data or completely change the response. This was a pretty interesting experiment because it formed my thoughts on a completely personalised browsing experience. If I like sites to be summarized, why can't I as the user of the user-agent just say thats how _I_ want to browse the web. There is a constant tension between site owners who want their exact intent rendered and a users' needs and preferences. I don't know where I sit on this, but I do think with LLMs the web is changing under our feet and everything will be personalised soon.
        
-   [Flikity.val.run](http://Flikity.val.run) - this is a fun one, as I think about personalisation I wondered if we could spruce up the new tab page in Chrome on Mobile and instead of just showing a list of articles, show a dynamic video like you get on TikTok. The quality is not yet there (the coherence of the video is not quite right when it renders what the page might look like), but it's very fun to watch (especially when I ask it to generate dancing TikTok videos). The process for doing this though is simple. I get a list of posts from Hackernews, I take extract the content and summarize it as a script. I take a screenshot that can be used in the video and then I use Veo3 to render a video. It lead me to [hyper-content-negotiation](https://aifoc.us/hyper-content-negotiation/)
    
-   [Hyperlink Experiment](https://github.com/PaulKinlan/hyperlink): There is a lot in here.... I struggle with the hubris the industry has around the link. I set out to experiment with the concept of linking on the web and I really want to encourage people to really push the boundaries of what a link is and if possible with technologies like LLMs, Image recognition models change how the web fundamentally works.
    
    -   [Merge](https://github.com/PaulKinlan/hyperlink/tree/main/packages/merge) - [Extension](https://chromewebstore.google.com/detail/merge-link/ffpcdfloldhbeielaoiblgalmpkalnjo) - One of the things I love about the web is that you don't really know what is on the other side of a link. One of thing I dislike is that you don't know what is on the other side of a link. I also wonder what the intent of a link it -
        
    -   [Trails](https://github.com/PaulKinlan/hyperlink/tree/main/packages/memex-join) - [Extension](https://chromewebstore.google.com/detail/trails/cmhofadlaokelmccnocbnojdbdnfjhga) - This uses no LLM technology, but I built it with an LLM. Vannevar Bush's "User links", lets you create your own links on pages and have them be permanent.
        
    -   [Summary](https://github.com/PaulKinlan/hyperlink/tree/main/packages/summary) - Hover over a link and get a summary of what is on the linked page before you click it.
        
    -   [Stretch Text](https://github.com/PaulKinlan/hyperlink/tree/main/packages/stretchtext) - Taking Ted Nelson's idea and trying to make it useable. Select some text and zoom in to (Expand) or Zoom out (summarize). After reading Ted Nelson's ideas on this, it was up to the author to offer this and knowing how I know how people publish on the web, people just aren't going to do this. LLM's make it possible to add extra context or summarize it. I didn't really test this too much in the end because I wanted to get Merging and Trails working.
        
    -   I made a lot of other experiments, such as linking into images with descriptions, and also make it easy to do [image-maps again by using english (using Segment anything model)](https://github.com/PaulKinlan/hyperlink/tree/main/packages/image-links/src) instead of points. [Link to audio content vs timestamps with a whisper-like model.](https://github.com/PaulKinlan/hyperlink/tree/main/packages/audio-link) [Pull in the UI of a linked element](https://github.com/PaulKinlan/hyperlink/tree/main/packages/ui-links) into the current page, taking the Merge experiment on step further.
        
-   [LLMdeck.xyz](http://LLMdeck.xyz) - I really just wanted a way to see the results from a couple of models at the same time. It can use Gemini, Claude, OpenAI and Chrome's built-in model. Hosted on [val.town](http://val.town) and [built](https://www.val.town/x/paulkinlan/eval) with Townie (1 manual change to a CSS class)
    
-   [Makemy.blog](http://Makemy.blog) - I [built a full on site building platform on Deno](https://github.com/PaulKinlan/gen-site), mostly coded with an LLM. You describe the site you want and it will be generated. It does it on request vs a build step. I need to update the models it uses (for example, it generates images before Nano-banana even existed). This was really just an experiment to see if I can make it as easy as possible for non-coders to get a site online without having to engage an agency or fall back to facebook (which happens a lot here in Ruthin).
    
-   <[generate-html-element](https://github.com/PaulKinlan/generate-html-element)\> [Custom Element](https://generate-html-element.paulkinlan-ea.deno.net/) - I spent some time reverse engineering how OpenAI's Skybridge works. I thought it was neat how they use a double iframe and the `sandbox` attribute to make it more safe to embed and interact with untrusted 3p content. So i [decided to push on](https://generate-html-element.paulkinlan-ea.deno.net/) this and see how feasible it would be to allow LLMs to go nuts inside a custom element. Fun experiment (but it requires exposing your API key in the client so has very limited production value right now - hey, [API keys still need to be solved](https://aifoc.us/dangerous/))
    
-   [reactive-prompt](https://github.com/PaulKinlan/reactive-prompt) - technically 2024, but I've updated it a fair bit this year. I think an un-explored area of LLMs is reactivity, that is using a set of prompts where parts of the inputs can change and the prompt will automatically get re-run. I think this is important if we are going to build dynamic UIs that respond to user input and act in a similar way to reactive-UIs. Also as we consider workflows vs agent processes, if I know the steps we need to take and every steps is processed by an LLM (or even normal code) then being able to control this and package it up will be important.
    
    -   [reactive-agent](https://github.com/PaulKinlan/reactive-agent) - Built on top of `reactive-prompt` I tried to explore building agent workflows that run in response to changes in input. This model is pretty convoluted and you quickly get caught up in `effect()` overload. Fun though.
        
    -   [f](https://github.com/PaulKinlan/f) - Inspired by my friend Dion and his post on English as _the_ programming language, I wanted to test if we could built functions in the browser "f``Create a UI that renders the Space Weather forecast using this schema`({someData:""})``". I'd never use this in product unless the environment was completely locked down. I do think it is a very interesting experiment that should get a lot more research.
        
-   [ssgen](https://github.com/PaulKinlan/ssgen/blob/main/content/carousel.md) - I really went all in thinking about how CMS's might work in the future. ssgen is a simple CMS that parses Markdown of the content and then applies intent and design (via images or text). It also has high-level concepts like custom elements that are just prompts (think `<carousel>a list of things</carousel>` and it [just works out what to render](https://github.com/PaulKinlan/ssgen/blob/main/content/carousel.md)). In this demo I also pushed on the idea of every web page being personalised to the user: It knows what browser you are using so it can output very specific HTML, CSS and JS that target that version of the browser; It might know your preference via an `accept-preference` and it renders the page to _your_ liking.
    
-   [Token counter](https://github.com/PaulKinlan/token-counter) - I wanted a CLI way to quickly check how many tokens are in some text. `tcnt` is your [answer](https://www.npmjs.com/package/tcnt).
    
-   [Omnibox-mcp](https://github.com/PaulKinlan/omnibox-mcp) - I built this to showcase to the Chrome team what having MCP as a first-class citizen might look like. It's a Chrome extension that registers a omnibox keyword `@mcp` and when invoked will act like an agent. It was built pretty much exclusively with an LLM.
    

I've built a lot of software this year that while they don't push on the intersection of Web and LLMs, they are me using LLM's exclusively to accelerate and amplify my ability to ship products. Here's just a few of them:

-   [LeviRoutes](https://github.com/PaulKinlan/leviroutes) - Untouched for over a decade, I refactored using LLMs and even published it to [npm](https://www.npmjs.com/package/leviroutes). I wouldn't have done this at all without an LLM. I use co-pilot a lot and I thought it was pretty neat that you can [get it to write reports for you too](https://github.com/PaulKinlan/leviroutes/issues/22).
    
-   [Hacker News Deck](https://paulkinlan.github.io/HackerNewsDeck/) - I really like the TweetDeck UX pattern, so I built one for [Hacker News](https://github.com/PaulKinlan/HackerNewsDeck). This one was almost one-shotted.
    
-   [Content Crafter](https://github.com/PaulKinlan/ContentCrafter) - a tool to help me and the team make social posts. I use it a lot less than I thought I would, but hey, I built it in about an hour.
    
-   [BlueSky poster](https://github.com/PaulKinlan/bluesky-poster) - I built this for a demo for Google IO to demonstrate Chrome's on-device APIs... It's fine, I guess.
    
-   [Full RSS](https://github.com/PaulKinlan/full-rss) - It annoys me that sites only do partial RSS. [This](https://full-rss.deno.dev/) site fixes that.
    
-   [Superfeedr](https://github.com/PaulKinlan/superduperfeeder) clone and [hub](https://github.com/PaulKinlan/superduperfeeder-hub) - I really needed a way to get updates from RSS feeds without polling every sitge. WebSub nee PubSubhubbub was a great solution and Superfeedr a great product (now owned by Medium) but was too pricey. I used an LLM to [build me the entire platform I needed](https://superduperfeeder.deno.dev/ui). I made a mistake in the first version I built where I merged the client and the hub in to one project. It took a bit longer to unstick all this, but Claude helped me a lot.
    
-   [NTP](https://github.com/PaulKinlan/ntp) - I just needed a simple way to customise what happens on CMD/CTRL-T,.
    
-   [TLDR.express](http://TLDR.express) - a site that takes a list of RSS feeds and summarises new posts to them each day. The [code is pretty simple](https://github.com/PaulKinlan/RSSFeedSummary), it just runs and I find it incredibly useful.
    
-   [posthero.us](http://posthero.us) - I [built](https://www.val.town/x/paulkinlan/postherous) an email based blogging platform that is integrated in to the fediverse. All coded via an LLM including the ActivityPub integration (It was crazy, Val.town's Townie even built KeyGen tools for me to ensure that I had the correct public and private keys). It was crazy how far I got building this on a phone.
    
-   [sendvia.me](http://sendvia.me) - It blows my mind that I can't email docs and newsletters to my remarkable, I have to download them and sync them in drive. Ridiculous. Anyway, I [built an tool that does it](https://github.com/PaulKinlan/send-to-remarkable). It needs updating to the latest API from remarkable - big shout out to [Erik Brinkman and rmapi-js](https://github.com/erikbrinkman/rmapi-js)
    
-   [Robots.txt scanner](https://github.com/PaulKinlan/robots-txt-scanner) - I needed a simple tool that helps me get some stats on who blocks what in the context of AI companies. It's not perfect, but it got me the answer I needed.
    
-   [Site categoriser](https://github.com/PaulKinlan/site-category) - Similar to robots.txt, I wanted to quickly categorize the top 10k sites. Again, far from perfect but useful enough.
    
-   [Stop don't do this](https://www.val.town/x/paulkinlan/stop-dont-do-this) - Shell script generator. At somepoint I want to explore an shell entirely driven by LLMs.
    
-   [Warpscan.app](https://github.com/PaulKinlan/warpscan) - I [built](https://warpscan.app/) this to make my daughter laugh. I saw a bunch of funny videos for a similar native app and just wanted something that worked well in the browser. This was built entirely with an LLM but also highlighted issues when asking it to use APIs that were not in the model (in this case the new FileSystem API). The lag between new API coming out and being in the model is alarming and presents real challenges for any new tool, and RAG just doesn't cut the mustard.
    

I will aim to also keep this post updated over the coming months and years.