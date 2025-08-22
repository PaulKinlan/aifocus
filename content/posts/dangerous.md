---
title: dangerous
date: 2025-08-18T00:00:00.000Z
slug: dangerous
draft: true
---

The thing about the web is that you don't know what is on the other end of a link. And yet, we happily click and tab on these blue, underlined pieces of text that could then run practically anything within the confines of that little tabbed rectangle. It's an incredible thing to be able to deliver and run code that is unknown and unseen by the user. Imagine a world where instead of links, you had to visit a store, look at reviews and screenshots, and then install some software before it could be run. Pffft. What are we? Mobile platforms?

We web users love to live dangerously. Decades of work by browser engines have made the reality of clicking a link and blindly running code by and large safe... well, safer. When we were coining the [SLICE](https://paul.kinlan.me/slice-the-web/) acronym, the 'S' was for security. So much of what we know as the web today is pulled from other origins. Scripts, stylesheets, fonts, images, videos, audio, and entire pages (via iframes) are all able to run in some form on another origin. The same-origin model was developed along with Netscape 2.0 to give users confidence that one site couldn't exfiltrate data from another. Process isolation was built to reduce the chance of actions in one tab or site affecting another, and sandboxing lets us run arbitrary code without worrying that it can have access to anything on our systems.

The modern web is an incredible architecture of safety (famous last words). At the same time, this model puts a real limit on the types of things that we want to do. Try building a client-side RSS reader or a podcast app. The limitation on reading from another origin means that we can't fetch an RSS feed from it because who would put an `Access-Control-Allow-Origin: *` header on an XML file, let alone an MP3?

Large language model service providers are my current area of focus and they have an escape hatch with solutions like `anthropic-dangerous-direct-browser-access` (I'm happy to be the first issue to ask for [CORS for Anthropic](https://github.com/anthropics/anthropic-sdk-typescript/issues/219)) and `dangerouslyAllowBrowser`, which let me drop API keys into web pages. This is the solution we have, not the one we need.

We should be able to access services directly from one origin to another without having to proxy everything. The minute I have to make a proxy, I also have to secure it and deal with many of the same problems as having my keys on the client.

OpenAI has had to deal with this head-on with their rather spectacular Real-time Audio API, which is accessible directly in the client because it opens up a WebRTC connection to their services. After all, you can't be expected to proxy the audio through a server.

> Connecting to the Realtime API from the browser should be done with an ephemeral API key.
> — [OpenAI WebRTC Documentation](https://platform.openai.com/docs/guides/realtime#:~:text=Connecting%20to%20the%20Realtime%20API%20from%20the%20browser%20should%20be%20done%20with%20an%20ephemeral%20API%20key)

Ephemeral API keys! It's kind of like CSRF protection built into the API. It works well for what it is, providing time-bound access for a single user without completely exposing my API key. The key can still be stolen, but it's only accessible for a relatively short amount of time.

It really feels like we need a scalable platform solution for accessing protected resources on the client, not just LLM APIs. I can't see a world where it's not opt-in from the server, which means we probably won't see a world where we can access and process common resources like RSS feeds and the like. But the need and opportunity seem clear.

I always liked the idea of [Opaque JavaScript Objects](https://www.w3.org/TR/webcrypto/#:~:text=The%20handle%20represents,underlying%20cryptographic%20implementation).

> This specification does not explicitly provide any new storage mechanisms for `CryptoKey` objects. Instead, by defining serialization and deserialization steps for `CryptoKey` objects, any existing or future web storage mechanisms that support storing serializable objects can be used to store `CryptoKey` objects. In practice, it is expected that most authors will make use of the Indexed Database API, which allows associative storage of key/value pairs, where the key is some string identifier meaningful to the application, and the value is a `CryptoKey` object. This allows the storage and retrieval of key material, without ever exposing that key material to the application or the JavaScript environment. Additionally, this allows authors the full flexibility to store any additional metadata with the `CryptoKey` itself.
> — [CryptoKey](https://www.w3.org/TR/webcrypto/#:~:text=This%20specification%20does%20not%20explicitly,used%20to%20store%20CryptoKey%20objects)

With `CryptoKey`, user-land JS doesn't have access to the key, but the APIs do. Neat.

Everyone I've spoken to about this has not wanted to explore it because "if the key is on the device, it's compromised," and at some point, it will be visible (e.g., in a network trace). I understand the concern, but then we have situations like we do today where people are putting their API keys in the browser or using temporary tokens. So to me, at least, it feels like an Opaque Object system would help a lot.

I do wonder if there is a concept of a `Subscription` or `Session` at the platform level that could be used for providing information about who the user is and what they have access to. If things are all running on the client, it's unlikely there's any 'secret sauce' at the application level. But it would be nice to then apply the `Subscription` to something like a `LanguageModel` in Chrome that just uses the user's subscription to 1) use my preferred service, and 2) use my identity.

Maybe the answer is just OAuth, a way to mint API keys for the user and then managing key lifetimes with something like [Demonstration of Proof-of-Possession (DPoP)](https://oauth.net/2/dpop/). I would be very happy if I never had to deal with OAuth again though.

Regardless of the solution, I would love to see progress in being able to create and run more work solely on the client. I would love to see a better solution for non-protected resources so that I we can enable RSS readers to be a viable client-side experience, and I would love to call protected resources such as an LLM without exposing my service keys or leaking API keys.
