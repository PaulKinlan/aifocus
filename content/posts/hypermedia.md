---
title: hypermedia
date: 2025-08-10T00:00:00.000Z
slug: hypermedia
---

I got introduced to the concept of the [Memex](https://en.wikipedia.org/wiki/Memex) after my post about [super-apps](/super-apps/). It's a fascinating view of a future from late 1940's and early 1950's Vannevar Bush presented a vision of an information system that he named the Memex. Ignoring the gendered language and technology that we're firmly set in their time (microfilm), ["As we might think", resulting in the Memex, was a fabulous read that I encourage everyone to do](https://www.ias.ac.in/article/fulltext/reso/005/11/0094-0103).

I've been thinking about the nature of hyperlinking for a little while now, and the concept of the Memex pushed me in to immersing myself in as much pre-web research about the concept of [hypertext](https://archive.org/details/SelectedPapers1977) and [hypermedia](https://dl.acm.org/doi/10.1145/800197.806036) and how people thought about it. It was fun. Ranging from spats between researchers, to [platforms that never shipped](https://www.w3.org/Xanadu.html), you can see the path to how the web clearly became the first truly popular and universal hyper-media platform.

I also realised that even though I have been doing HTML for 30 years I didn't actually have a clear concept of what the 'HT' in HTML really meant and how the early pioneers were thinking about information systems and how it differs from the web we have today.

The early years of research of hypertext was focused around the opportunities of what digital text could give you that the print medium couldn't. The concept of linking was firmly established in the earliest ideas of hypertext. A user of the hypertext system navigated they would create the links or trails between different documents..

_A user would create the links._

The web when it was introduced had the concept of hyperlinks, but it wasn't until this last month that I realised the web's hyperlinking model is different: It's created by the author whereas many of the early hypertext systems were user-driven, allowing individuals to create their own links and connections between documents.

The author centrality of making links has it's benefits. You can impart the ability to find knowledge on to me, but I frequently see an all too often frustrating side on the web: Sites are acting like a gravity-well. I land on your page and there are fewer and fewer links to other sites. Every link on the site is defined by me (the author), not you. So as sites want to capture as much time and attention as possible links out of my site become less prevalent.

How do you make the connection between two articles for your recall? We have bookmarks at best...

I can understand why the concept of user-links didn't develop. Managing URLs is complex, finding URLs at the start of the web was impossible, and the chrome of the browser is complex with history and bookmarks not being incredibly well understood. Not to mention, how would you get the URLs into a page when you don't own the page and can't write to it?

Well, I built an extension that allows you to create user-defined links between any two pieces of content on the web and have it remain there. It turns out that one of the last changes to how with think about links is the concept behind [TextFragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments) is very helpful at identifying pieces of content on the page and giving you a permanent identifier for it.

{{< youtube user-links >}}

So far this discussion doesn't really have much focus on AI's impact on the web... hopefully I can help make that link (heh!).

As I was thinking about the Memex, I kept circling around the idea that LLMs are the modern embodiment of it, not the web. My usage of Large Language Models doesn't feel a million miles away from what was described. Bush's vision was one that was deeply personal, you build and navigate your own web of knowledge. While LLM's are grounded on their training, your previous conversations and connections to personal data making it something more than what we get on the web. I tied to summarize as:

- The LLM is the information retrieval system.
- ChatGPT/Gemini are the personal machine, with context and memory that is used to you.
- The web is the unstructured non-hierarchical file system.
- Wikipedia is the encyclopedia (obviously)
- Memory in the llm apps are the trails that don't fade.
- Multi-modality are the photocells, the microfiche and the tape.
- Reasoning is the identification of compounds and their reactions.

I find the concept of trails deeply interesting, and to be clear, the LLM tools have not solved a direct connection between the two, but instead they build on previous interactions and information as the conversation progresses. They don't create a hard link, but if you see the "thinking traces", you can see the link being inferred.

I think the web could develop to further differentiate itself from applications _and_ LLMs, and it is all about linking.

While the `<a>` is part of the concept of hypertext, I don't think that the humble `<a>` is actually hyper. It's just a link. It points from site A to site B. Maybe it has some `rel` properties to define the nature of the link a bit more, but fundamentally it's just a pointer.

Now, I'm being mean to the `<a>`. It's actually pretty incredible. They are very simple to create. You write a small bit of text and you can point to a page, a named element in a page, and probably the biggest change to anchoring, you can now link to arbitrary text with Text Fragments, and for a brief while you could also link into functionality.](https://paul.kinlan.me/what-happened-to-web-intents/)

The way that we experience much of an actual link is one-way. `A->B`. Yes there are many platforms like [Wikipedia](https://www.wikimedia.org/) or [TidlyWiki](https://tiddlywiki.com/) that allow for bi-directional linking, and Yes, there are protocols like WebMention that enable ping-backs so that a site owner can preset all the linked sites. But with site-level features, they are just that, your site has to support it and with infrastructure protocols, you have to stand up some very complex infrastructure.

It just got me thinking about how might links on the web become two-way? Actually, how many ways can we make a link?

Let's assume we have a simple link `<a href="https://paul.kinlan.me/slice-the-web/">Slice the web</a>` and ignore how links work today in HTML and JavaScript (i.e, referrer).

1. Site A points to Site B. `A -> B`. This is the traditional link that we know today.
2. Site A pulls from Site B `A <- B`. What can we do if we are able to pull the information from the target of a link into the current context of the page? Could we summarize the information so you have an idea of the content prior to a navigation? Could we merge the target page and the current page together?
3. Site B could understand which sites point to it. `B -> A`. As a user I might want to know where I came from more clearly (yes, we have a back button) or I might want to know who links to this page. Web Mention solves some of this, even if the infrastructure is complex, could it be part of the browser?
4. Site B pulls from Site A. `B <- A`. This is a bit more complex, but as with `A <- B`, being able to merge content from the referring site directly into the current page offers interesting possibilities.

I'm particularly enamoured by "A Pull B" `A <- B` and I can understand why it wasn't explored in the past. How do you do anything useful with the content on the target page? Until recently NLP techniques have been incredibly hard to perform, and with the introduction of LLMs being able to summarize content is surprisingly easy.

I wrote an extension that will summarize the link ahead of a navigation.

{{< youtube video-summarize >}}

What about merging text?

I will quickly digress into another hypermedia concept introduced by Ted Nelson is the context of [StretchText](https://archive.org/details/STRETCHTEXT). I think the concept is brilliant: You can have some text, and it can be expanded to provide significantly more information, and expanded again. It's incredibly hard to manage because you as an author have to manage the creation of this information, so how much time do you spend doing this? Zero probably.

With today's LLM technologies we can reason more about the content of pages. this gives us the ability to think of ways where we can take the text of a page, or a selection and expand it with the context and what the models know.

You can then take this concept and change the way that linking works. By parsing the linked page and the current page, it is possible to merge the link into the current place where the link exists. Perhaps we could remove the scourge of "Click here" links and provide more context to the user for any link on the page.

{{< youtube video1 >}}

It's pretty fun to think about how links might evolve as the technology we have in the world evolves. Here's some more ideas:

- Image maps have died out, but now we have the ability to identify objects in an image, could we make it easier to author an image map with language annotation instead of bounding boxes, e.g "red car" -> ford.com
- We have the ability to link to a time-code in an audio file, with audio to text models, could we do something like text fragments?
- During my research on hyperlinking much of content I had access to was PDF's on the internet archive, these PDF's are hosted in an app that requires many clicks to get to the page that is important. Could links be augmented with simple actions? Now... I can imagine we would have to think a lot more about safety to mitigate "Buy these nappies" and a host of other attacks,

So far, I've really only focused on hyperlinks with a sprinkling of augmenting images and audio links. I'm pretty enamoured with the idea of user-links, because it's me augmenting the experience of the web. If I look at how people use Chrome extensions to augment and manipulate their user-agent, I do wonder how the LLM technology we have could be applied to any content on the page and have it completely customized to the user's needs.

The original discussion of hypermedia and hypertext was met with almost no practical use for 30 years. It appears to have been all academic and centered around egos. While technologies like HyperCard did exist and were well liked, it wasn't until the web came that humanity progressed. However in the following 30 years there's really not been that much development in linking, we have the opportunity to make links and the web even more useful. Now, with some of the newer technologies like LLMs, Vision models, we have so much more opportunity to expand the definition and utility of links.

I would like to see browsers develop more, but maybe the fact that we have Extensions that can augment and personalize every part of the page means that we are already here...

Maybe this post is all academic and ego driven and the hypermedia found it's perfect fit for authors and users. I hope not. The link is what makes the web, and the link is what will keep the web strong and differentiated from other all platforms but I really want to see experimentation in hyperlinking.
