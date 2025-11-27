---
title: hyper content negotiation
description:
date: 2025-11-27T11:39:28.653Z
slug: hyper-content-negotiation
---

I fondly remember sitting with my friend Chris learning how to make HTTP requests so that we more quickly check if our web pages were rendering as we expected without the need to load the browser.

We would use:

```
c:\telnet.exe pcbware.com 80
```

Then blindly type:

```
GET /index.shtml HTTP/1.0
```

The keys I typed weren't echoed back to me, but if we got it right it would return:

```
200 OK
Content-Type: text/html

<! .......
```

Huh. What's Content-Type?

Content-Type: text/html has literally been in my life for the the last 25-30 years, and yet I hardly ever think about what it might offer us and how it might be one of the most critical things for the future of the web (Btw - [http.dev](https://http.dev/) is such a good resource for all things HTTP headers).

When I started web development I had no concept of content-negotiation and it's importance - for the unintroduced, on the request to the server you could tell the server what type of content that you can [accept](https://http.dev/accept) and the server has the option of serving any type of format back.

```
GET /index.html HTTP/1.1
Accept: text/html, text/plain;q=0.9, text/*;q=0.8, */*;q=0.7
```

:mind-blown-emoji-in-1998:

My version of Chrome offers this to every page that I navigate to:

```
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
```

That's a lot of things that can be handled by the browser. But what do we do with this data on the server?

Well, a lot and not a lot at the same time. CDNs make extensive use of it for things like optimizing image delivery - if you know you can send an avif to millions of users, then transcoding the image while maintaining the same quality is a huge benefit to both the CDN and to users. But for how we think about serving content optimized for the mode of interaction? I really just don't see it, and for good reason - you are in a browser, we expect a request to probably return HTML. Well the guidance says to prefer the highest `q`. It's kinda neat to see that the default request has `*/*` and a range of image formats.

There's something around this that got me thinking...

I've been spending a fair bit of time playing and thinking about how a future Web Browser might work. As I try to understand how people are using the internet, you can see the rise of closed platforms and specifically video platforms. Ben Thompson has frequently noted that text is easy to share, [but Video is what the majority of people consume or at least want to consume](https://stratechery.com/2020/the-tiktok-war/). Now the web, while being the most versatile hypermedia platform the world has ever seen is dominated by text and more and more user-time is transitioning on to other platforms. It seems like a risk to me, so what if the final form for success for the web is whatever the user wants in whatever format they want?

I recently spent some time wondering how we might have a more of a 'lean-back' experience in the browser, that is a simpler way to scan new content and then engage with it. A couple of years back I built a screenshot based 'TikTok' like list of articles that I might be interested in (it used to be on Glitch RIP). Screenshots are cool and all, but with the introduction of `veo3` I thought it might be interesting to see if we can create a video out of the contents of a web page.

[Flickity](http://flickity.val.run) is a surprisingly fun experiment. I screenshot the url, extract the markdown and use an LLM to generate a script. The script is then passed into `veo3` and now we have a list of overviews of the pages. Yes, the videos aren't perfect—the text coherence is a little off—but I thought it was a neat experiment.

{{< video src="/images/flickity.mp4" caption="Flickity Web Demo (I don't know why there's no sound in the video)" >}}

Flickity just made me think a lot about the future of the web being truly a multimodal hypermedia platform that is shaped to the user's preference.

With LLMs we have the ability to convert almost any content into any form of content and I think this will be a super-power of the web and the browser. In [interception](https://aifoc.us/interception/) I explored what it might be like for the browser to mediate and control the response from a server (for example to only every summarize the content) - it was an interesting experiment in that it shows that the web is more flexible than we take for granted, but highlights that morphing content in the client has a lot of potential issues ranging from lack of developer control all the way to breaking expectations of how JavaScript might work.

We are starting to see services and web apps that transform content from one form to another: NotebookLM can create podcasts, videos, interactive quizzes, mindmaps out of pages and source content. [Google search has started to generate "interactives" inside the AI mode](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/). Why isn't this something the browser can just do or at least the developer can indicate support for from the server? Why not make this available to every single site on the users behalf? HTML into video. HTML into an image. Static HTML into an interactive web app... Video into article; Audio file into vide... well, anything into anything else?

We have 30 years of being able to negotiate the content type and we have the technology via LLMs, having the two combined might be a powerful concept for the future of the web. In `ssgen` (my [experimental](https://aifoc.us/headless-stopgap/) "[CMS](https://github.com/PaulKinlan/ssgen)") I wanted to explore if I can offer a way to have the server return whatever preferred output format is.

Today, web browsers have a pretty permissive Accept header, so there's nothing really stopping us from returning a format that we think is appropriate. What if we introduce more the ability for servers to determine the best way to return the content?

If you want the page as a video, like in Flickity Web, you can:

```bash
curl https://ssgen.paulkinlan-ea.deno.net/carousel -H "Accept: video/mp4"
```

If you want an image representation of the experience, you can:

```bash
curl https://ssgen.paulkinlan-ea.deno.net/carousel -H "Accept: image/jpeg"
```

Below are the first renderings I got from the demo (image, webm)

{{< figure src="/images/hyper-content-test-image.jpeg" caption="literal image of the content" >}}

{{< video src="/images/hyper-content-test.webm" caption="literal video of the content" >}}

I still need to tweak the prompts because right now it will return a literal video of a carousel that meets the requirements, but this literal interpretation of the content made me think about what the user might want.

I also make heavy use of Gems in Gemini and instructions in ChatGPT. It made me think if there is ever a world where we could personalise every response from the sites to the explicit needs of the user more. How might I want my preferences to be communicated to a page?

There's a couple of ways to think about it, maybe the browser makes a request to the resource, load it and then processes it. Or maybe we pass some notion of our preferences to the server and have the content be negotiated along with our preference. We already express some preference through `Accept-Language` , what if we could do more? Could we have a way to pass user preference by a prompt?

```
Accept-Prompt: I am a person who likes kittens. Please make sure the output has a kitten influence. Please ensure that all units are metric, I hate imperial measurements (like really, wtf?). Please ensure that you output in dark-mode.
```

I thought it might be fun to test this out:

```bash
curl https://ssgen.paulkinlan-ea.deno.net/carousel -H "Accept-Prompt: I am a person who likes kittens. Please make sure the output has a kitten influence."
```

{{< figure src="/images/hyper-content-kittens.png" caption="literal kitten influence" >}}

Having a "prompt" on every request is **very unlikely to happen**; a prompt can contain very personal data and this means that it shouldn't be sent on the first request. We saw from things like the Topics API that this wasn't something the ecosystem thought was acceptable. User opt-in though via a client-hint (and only when there is strict CSP or limited access to hardware)...? Maybe that is interesting.

I don't know where the web is going to go in this regard and I don't think what is in this post is viable _today_ given the performance of LLMs, but when the [latency](/latency/) is solved and we have ways to protect users and site owners from prompt exfiltration and impersonation, I do think we should be looking at how User Agents can act more on the behalf of the user, especially in a way that is outside of the UA is being an "autonomous agent" and we are going to have to deal with the tension that publishers and site owners want their exact output to be what is presented to the user, and the user, well, likely wants it _their_ way and that Chat apps give them that ability.

The thing is, the web is a hypermedia platform and it can be far more flexible than we treat it today. I think we have the opportunity to experiment at the forefront of the platform (client and server) and keep the web as _the_ platform for all computing interaction.
