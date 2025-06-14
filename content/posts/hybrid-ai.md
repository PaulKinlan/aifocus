---
title: Hybrid AI
date: 2025-06-14T19:59:06.193Z
slug: hybrid-ai
authors:
  - andreban
---

[Paul][2] recently wrote about [on-device AI][1] and asked an important question:

> But what about if you are someone that has to use a candy-bar phone?

This may make it sound like the decision between running AI models on-device or in the cloud is a binary one, but in reality, it is more nuanced. There are scenarios where a hybrid approach, where some tasks are handled on the client side and others on the server, can be beneficial.

One of the scenarios is a hybrid approach where the decision of running the a workload is based on the user's *device capabilities* - if the user has a device powerful enough device, the workload is executed on the client side and, if not, the task is delegate to Cloud AI.

While, for some frameworks and models, the only way to find if the device is capable of running the model is to benchmark some workload on the user's device, the [Built-in AI API][3] provide affordances for this pattern by giving all the APIs an `availability()` method, which developers should check before trying to run inference on those APIs, and make a decision on where to run the workload dynamically. The [Firebase AI Logic][4] takes advantage of that to provide an LLM framework that dynamically switches between client and server.

Another scenario for a hybrid approach is when the decision is made based on the on-device *model capabilities*. In this case, if the client side model is capable of handling the user's prompt, the prompt is handled locally. Otherwise, the request is delegated to a more powerful Cloud AI.

[Ian Ballantyne][6], from the DeepMind team, recently [lunched a video][5] on this topic and, in summary, the approach consists on training a third model from a curated set of prompts that have been labeled with there they should run, and use this new model to classify new prompts for being handled by the local model or the remote one.

One important aspect to keep in mind is that a hybrid solution gives away some of the advantages of a client-side only solution. There's a compromise on privacy, as the application now may communicate data to a Cloud server, and a compromise on network latency introduce by communication to the Cloud server, there may network latency.

Another important compromise is cost. Paul wrote:

> Cost just hasn’t been a thing that I’ve seen really talked about when it comes to the web-experiences. Instead the narrative is about privacy, ownership of data and compute, resilience to the network, resilience to business failure, avoidance of big-tech etc. All of these are great reasons to build local-first, and cost being a factor for running models, and specifically LLMs, I think is a new vector worth looking at to see some of the challenges that we might face as an industry.

With hybrid, rather reducing the cost to zero, the goal is to reduce costs by running models on the user's device when possible.

We can expect that, over time, more user devices will capable of running client-side large language models. The addition of [Neural Processing Units (NPUs)][8], supported on the web by standards like [WebNN][9], may accelerate the shift, and enable those devices to run LLM workloads more efficiently. At the same time, smaller models, like the [recenty announced Gemma 3n][10] are becoming capable for running a more diverse set of tasks, with higher quality.

In the meantime, Hybrid AI can be a great option to optimize costs when running LLM workloads, by shifting computing to the user's device when possible, and using Cloud AI when not, ensuring your AI features are available to all your users.

[1]: /on-device/
[2]: /authors/paulkinlana
[3]: https://developer.chrome.com/docs/ai/built-in-apis
[4]: https://firebase.blog/posts/2025/06/hybrid-inference-firebase-ai-logic
[5]: https://www.youtube.com/watch?v=PvKEHPbZ4-Y
[6]: https://www.linkedin.com/in/ianballantyne/
[7]: https://ai.google.dev/edge/mediapipe/solutions/text/text_classifier
[8]: https://en.wikipedia.org/wiki/Neural_processing_unit
[9]: https://www.w3.org/TR/webnn/
[10]: https://deepmind.google/models/gemma/gemma-3n/
