---
title: hypermedia
date: 2025-08-18T00:00:00.000Z
slug: hypermedia
---

I was introduced to the concept of the [Memex](https://en.wikipedia.org/wiki/Memex) after my post about [super-apps](/super-apps/). It's a fascinating view of the future from the late 1940s and early 1950s. [Vannevar Bush](https://en.wikipedia.org/wiki/Vannevar_Bush) presented a vision of an information system that he named the Memex. Ignoring the heavily gendered language and technology that were firmly set in their time (microfilm), ["As We May Think," the article that introduced the Memex, was a fabulous read that I encourage everyone to explore](https://www.ias.ac.in/article/fulltext/reso/005/11/0094-0103).

I've been thinking about the nature of hyperlinking for a little while now, and the concept of the Memex pushed me to immerse myself in as much pre-web research about [hypertext](https://archive.org/details/SelectedPapers1977) and [hypermedia](https://dl.acm.org/doi/10.1145/800197.806036) as I could find, and to learn how people originally thought about it. It was a fun exploration. From spats between researchers to [platforms that never shipped](https://www.w3.org/Xanadu.html), and the incredible firsts shown by pioneers like Douglas Engelbart in "[The Mother of All Demos](https://en.wikipedia.org/wiki/The_Mother_of_All_Demos)", you can clearly see the path that led to the web becoming the first truly popular and universal hypermedia platform.

I also realized that even though I have been working with HTML for 30 years, I didn't have a clear concept of what the 'HT' truly meant or how the early pioneers envisioned information systems—and how their vision differs from the web we have today.

The early years of hypertext research focused on the opportunities that digital text offered over the print medium. The concept of linking was firmly established in the earliest ideas of hypertext. Vannevar Bush, with his Memex, imagined a system where the _user_, not the author, would create personal connections between documents. As an individual navigated information, they would forge what Bush called "trails"—links that were deeply personal and catered to their own memory and thought processes. Other pioneers like Ted Nelson conceptualized even more expansive ideas, such as _StretchText_ , where text could be expanded to reveal layers of additional information, hinting at a far more interactive system than what we have today.

_A user would create the links._

When the web was introduced, it had the concept of hyperlinks, but it wasn't until this past month that I realized the web's hyperlinking model is different: Links are created by the author, whereas many of the early hypertext systems were user-driven, allowing individuals to create their own links and connections between documents.

The author-centricity of creating links has its benefits. An author can guide me to knowledge, but I frequently see a frustrating side effect on the web: sites acting like gravity wells. I land on a page and find fewer and fewer links to other sites. Every link is defined by the author, not the reader. As sites try to capture as much time and attention as possible, external links become less prevalent.

How do you make a connection between two articles for your own recall? At best, we have bookmarks.

I can understand why the concept of user-created links didn't develop. Managing URLs is complex, finding URLs was nearly impossible at the start of the web, and the "chrome" of the browser, with its history and bookmarks, isn't incredibly well understood by most. Not to mention, how would you inject links into a page you don't own and can't write to?

Well, I built an extension that allows you to create and persist user-defined links between any two pieces of content on the web. It turns out that one of the latest changes in how we think about links, the concept behind [Text Fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments), is very helpful for identifying pieces of content on a page and giving them a permanent identifier.

{{< youtube id=BD_CWhJzGfQ class="youtube" >}}

So far, this discussion hasn't focused much on AI's impact on the web... hopefully, I can help make that link (heh!).

As I was thinking about the Memex, I kept circling back to the idea that LLMs, not the web, are its modern embodiment. My usage of Large Language Models doesn't feel a million miles away from what Bush described. His vision was deeply personal: you build and navigate your own web of knowledge. While LLMs are grounded in their training data, your previous conversations and connections to personal data make the experience something more than what we get on the web. I tried to summarize the analogy as follows:

- The LLM is the information retrieval system.
- ChatGPT/Gemini are the personal machines, with context and memory tailored to you.
- The web is the unstructured, non-hierarchical file system.
- Wikipedia is the encyclopedia (obviously).
- Memory in LLM apps represents the trails that don't fade.
- Multimodality corresponds to the photocells, microfiche, and tape.
- Reasoning is analogous to the identification of compounds and their reactions.

I find the concept of trails deeply interesting. To be clear, LLM tools have not solved creating a direct connection between two distinct pieces of information. Instead, they build on previous interactions as a conversation progresses. They don't create a hard link, but if you observe their "thinking traces," you can see the link being inferred.

I think the web could evolve to further differentiate itself from applications _and_ LLMs, and it all comes down to linking.

While the `<a>` tag is part of the concept of hypertext, I don't think the humble `<a>` is actually "hyper." It's just a link. It points from Site A to Site B. It might have some `rel` properties to define the nature of the link, but fundamentally, it's just a pointer.

Now, I'm being a bit harsh on the `<a>` tag. It's actually pretty incredible. Links are very simple to create. You write a small bit of text and can point to a page, a named element within a page, and in probably the biggest change to anchoring—you can now link to arbitrary text with Text Fragments. For a brief while, you could also link into functionality.

The way we experience a link is typically one-way: `A->B`. Yes, many platforms like [Wikipedia](https://www.wikimedia.org/) or [TiddlyWiki](https://tiddlywiki.com/) allow for bi-directional linking. And yes, there are protocols like WebMention that enable ping-backs so that a site owner can present all the sites that link to them. But site-level features like these require the site to support them, and infrastructure protocols require you to set up some very complex infrastructure.

This got me thinking: how might links on the web become two-way? Actually, how many "ways" could a link be?

Let's assume we have a simple link `<a href="https://paul.kinlan.me/slice-the-web/">Slice the web</a>` and ignore how links work today in HTML and JavaScript (i.e., referrer).

1.  **Site A points to Site B (`A -> B`).** This is the traditional link we know today.
2.  **Site A pulls from Site B (`A <- B`).** What if we could pull information from the link's target into the current page's context? Could we summarize the information to give you an idea of the content before navigating? Could we merge the target page and the current page?
3.  **Site B understands what points to it (`B -> A`).** As a user, I might want to know where I came from more clearly (yes, we have a back button), or I might want to know which other sites link to this page. WebMention solves some of this, but could this functionality be part of the browser itself, even with complex infrastructure?
4.  **Site B pulls from Site A (`B <- A`).** This is more complex, but as with `A <- B`, being able to merge content from the referring site directly into the current page offers interesting possibilities.

I'm particularly enamored by the "A pulls from B" (`A <- B`) concept, frequently known as "[transclusion](https://en.wikipedia.org/wiki/Transclusion)", and I can understand why it wasn't built in the past. How could you do anything useful with the content on the target page? Until recently, NLP techniques were incredibly difficult to perform, but with the introduction of LLMs, summarizing and other manipulation of content has become surprisingly easy.

I wrote an extension that can help you to summarize a link's destination before you navigate to it.

{{< youtube id=p0za2eedC9M class="youtube">}}

I'll quickly digress to another hypermedia concept introduced by Ted Nelson: [StretchText](https://archive.org/details/STRETCHTEXT). I think the concept is brilliant. You have a piece of text that can be expanded to provide significantly more information, and then expanded again. It's incredibly difficult to manage from an author's perspective because you have to create all this layered information. How much time would you spend doing this? Probably zero.

With today's LLM technologies, we can reason more about the content of pages giving us the ability to take the text of a page or a selection and expand it with additional context from what the models know.

You can then take this concept and change the way linking works. By parsing both the linked page and the current page, it's possible to merge the linked content into the current context where the link exists. Perhaps we could remove the scourge of "Click here" links and provide more context to the user for any link on the page.

{{< youtube id=M0o4MNmWIDo class="youtube" >}}

In [super-apps](/super-apps/) and [embedding](/embedding/) I touched on the idea that increasing amounts of people's time might be spent in LLM based chat experiences and not in the browser. If this happens, there is a world where the way people interact with services and tools is managed entirely by the LLM and that is a risk for the web.

Imagine you are a store and you provide a service that helps a use find flights, one of the ways that you make money for your service is by up-selling services on top of the booking (e.g, gate change information). In a world where the LLM is the primary way that people interact with content, you will want to ensure that your brand and service are still visible to the user. LLMs will either generate their own the entire UI to integrate with services and existing sites, or they will ask site authors to customize their site (including bespoke API integrations). If it's the latter path, LLM providers will want to use what already exists (i.e, hundreds of millions of existing pages of content), which leads me to believe that there will be a need for sites to easily control the presentation of their brand and service inside the "super-app".

"Transclusions" is the technical term. Today, `<iframe>` is the transclusion that enables you to have an entire page run inside another page, but that feels to coarse. We need to explore the idea of securely running islands of functionality from the target page directly in the host.

I mocked this up in the following video. This demo is a Chrome Extension that opens the target page, finds the element that is specified on the link and clones the DOM into a `<foreignObject>` in SVG which is then bundled up and rendered in the host page (/me handwaves security issues).

{{< youtube id=WU-VVTkwDoU class="youtube" >}}

Make no mistake that this particular demo is a parlour trick, but I think there might be a useful primitive here not just for Web content being integrated more seamlessly into an LLM, but this could also be something that native-app platforms could also offer and enable a more seamless integration between web and app content. The solution might be a new element, adding something on top of an iframe, or maybe even a media-query to enable the site to hide certain UI when it knows it's embedded.

It's fun to think about how links might evolve as our technology evolves. Here are some more ideas:

- Image maps have largely died out, but now that we can identify objects in an image, could we make it easier to author an image map with language annotations instead of bounding boxes (e.g., "red car" -> ford.com)?
- We can link to a time-code in an audio file. With audio-to-text models, could we do something similar to text fragments for audio?
- Could we make it easier to extract useful content from an `<audio>` such as links that were 'heard' in the discussion.
- During my research on hyperlinking, much of the content I accessed was in PDFs on the Internet Archive. These PDFs are hosted in an application that requires many clicks to get to the important page. Could links be augmented with simple actions? Of course, we would have to think carefully about safety to mitigate "Buy these nappies" attacks and a host of others.

For 30-40 years the original discussions around hypermedia and hypertext had almost no practical applications. It appears to have been all academic and centered around egos. While technologies like HyperCard existed and were well-liked, it wasn't until the web arrived that humanity really progressed in this area. In the following 30 years, there again wasn't much development in linking on the web.

We are at a moment where new technologies like LLMs and Vision models can enable us to expand and improve the very definition of a hyperlink while also maintaining the reason why I think the web's linking mechanism enabled the web to succeed where other hypermedia platforms failed: That authoring a `<a>` is the easiest way of linking that we've known.

Maybe the fact that we have extensions that can augment and personalize every part of a page means we are already there. Maybe this post is also academic and ego-driven, and hypermedia has already found its perfect fit for authors and users. I hope not. The link is what makes the web, and the link is what will keep the web strong and differentiated from all other platforms. I really want to see more experimentation in hyperlinking.
