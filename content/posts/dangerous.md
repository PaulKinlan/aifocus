---
title: dangerous
date: 2025-08-18T00:00:00.000Z
slug: dangerous
draft: true
---

The thing about the web is that you don't know what is on the end of a link, and yet we happily click and tab on these blue underlined pieces of text that could then run practically anything within the confines of the little tabbed rectangle. It's an incredible thing to be able to deliver and run code unknown and unseen by the user. Imagine a world where instead of links, you had to visit an store, look at reviews and screenshots and then install some software before it could be run, pffft. What are we? Mobile platforms?

Us web users love to live dangerously. Decades of work by the browsers engines have made the reality of clicking a link and blindly running code by and large safe... Well, safer. When we were coining the [SLICE](https://paul.kinlan.me/slice-the-web/) acronym, the S was for security. So much of what we know as the web today is pulled from other origins. Scripts, Stylesheets, fonts, images, videos, audio, entire pages (via iframes), fetch requests (with CORS) are all able to run in some form on another origin. The same origin model was developed along with Netscape 2.0 to give users confidence that one site couldn't exfiltrate data from another, process isolation was built to reduce the chance of actions in one tab or site affecting another and sandboxing lets us run arbitrary code without worrying that it can have access to anything on my system.

The modern web is truly an incredible architecture of safety (famous last words). At the same this model puts a real limit on the types of things that we want to do. Try building a client-side RSS reader or podcast app? The limitation on reading from other origin means that we can't fetch an RSS feed from another origin because who would put a `Access-Control-Allow-Origin: *` header on an XML file, let alone an mp3.

Large language model service providers are my current area of focus and have an escape hatch with solutions like `anthropic-dangerous-direct-browser-access` (I'm happy to be the first issue to ask for [CORS for Anthropic](https://github.com/anthropics/anthropic-sdk-typescript/issues/219)) and `dangerouslyAllowBrowser` letting me drop API keys into web pages.... This is the solution we have and not the one we need.

We should be able to access services directly from one origin to another without having to have every thing proxied. The minute I have to make a proxy, I also have to secure it and deal with many of the same problems as having my keys in the client.

Open AI have had to deal with this head on with their rather spectacular Real-time audio API which is accessible directly in the client because it opens up a WebRTC connection to their services, after all you can't be expected to proxy the audio through a server.

> Connecting to the Realtime API from the browser should be done with an ephemeral API key

— [OpenAI Web RTC Documentation](https://platform.openai.com/docs/guides/realtime#:~:text=Connecting%20to%20the%20Realtime%20API%20from%20the%20browser%20should%20be%20done%20with%20an%20ephemeral%20API%20key%2C)

Ephemeral API Keys!! It's kinda like XRSF built into the API! It works well for what it is, while not completely exposing my API key, instead providing time-bound access for a single user. The key can still be stolen, but then it's only accessible for a relatively short amount of time.

It really does feel like we need a scalable platform solution for accessing protected resources in the client, not just LLM APIs. I can't see a world where it's not opt-in from the server which means we probably won't see a world where we can access and process common resources like RSS feeds and the like, but the need and opportunity seem clear.

I always liked the idea of [Opaque Javascript Objects](https://www.w3.org/TR/webcrypto/#:~:text=The%20handle%20represents,underlying%20cryptographic%20implementation)

> This specification does not explicitly provide any new storage mechanisms for `CryptoKey` objects. Instead, by defining [serialization and deserialization steps](https://www.w3.org/TR/webcrypto/#cryptokey-interface-serializable) for `CryptoKey` objects, any existing or future web storage mechanisms that support storing [serializable objects](https://www.w3.org/TR/webcrypto/#dfn-serializable-objects) can be used to store `CryptoKey` objects.
>
> In practice, it is expected that most authors will make use of the Indexed Database API \[[INDEXEDDB](https://www.w3.org/TR/webcrypto/#bib-indexeddb)\], which allows associative storage of key/value pairs, where the key is some string identifier meaningful to the application, and the value is a `CryptoKey` object. This allows the storage and retrieval of key material, without ever exposing that key material to the application or the JavaScript environment. Additionally, this allows authors the full flexibility to store any additional metadata with the `CryptoKey` itself.

[CryptoKey](https://www.w3.org/TR/webcrypto/#:~:text=This%20specification%20does%20not%20explicitly,used%20to%20store%20CryptoKey%20objects) - user-land JS doesn't have access to the key, but the APIs do. Neat.

Everyone I've spoken to about this though has not wanted to explore it because "if the key is on the device, it's compromised" and at some point it will be visible (e.g, in a network trace). I understand the concern, but then we have situations like we have today where people are putting their API keys in the browser or are using temporary tokens, so to me at least it feels like an Opaque Object system would help a lot.

By extension, I wonder if there is a concept of `Subscription` or `Session` at the platform level that could be used for providing information about who the user is and what they have access to. If things are running all in the client, it's unlikely there's any 'secret sauce' at the application level. But it would be nice to then apply the Subscription to likes of `LanguageModel` in Chrome that just use the user's subscription to 1) use my preferred service, 2) use my identity. While this sounds a bit like OAuth and I would be very happy if I never had to deal with this again.

I would love to see progress in this space. Building and running in the client has huge benefits. I would love RSS readers to be a viable client-side experience. I would love to call an LLM or many other

There should be continued exploration into to the same-origin model. [Alex Komoroske](https://x.com/komorama/status/1943637836030255495) is doing a lot of thinking in this space and has [interesting thesis that it's wrought centralisation of user-data that is hard](https://www.techdirt.com/2025/06/16/why-centralized-ai-is-not-our-inevitable-future/), if not impossible to enable portability between services with the current architecture of the web and that we might need a new model by having policies attached to the data vs the site ([you can also keep up with his Bits and Bobs]https://docs.google.com/document/d/1GrEFrdF_IzRVXbGH1lG0aQMlvsB71XihPPqQN-ONTuo/edit?tab=t.0).
