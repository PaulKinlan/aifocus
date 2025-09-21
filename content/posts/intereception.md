---
title: interception
date: 2025-09-21T00:00:00.000Z
slug: interception
authors:
  - paulkinlan
---

This is a very quick post by me. I had an idea as I was walking the dog this evening and I wanted to build a functioning demo and write about it in the space of a couple of hours.

While the post and idea started this evening, the genesis of the idea has been brewing for a while and goes back over a year to August 2024 when I wrote about [being sucked into a virtual internet](https://paul.kinlan.me/fictitious-web/). WebSim has been on my mind for a while, and I wanted to be able to simulate my own version of the web using the browser directly and not via another web page. Now, I go back a couple of weeks and I managed to work out how to get [Puppeteer](https://pptr.dev/) to intercept requests and respond with content generated via an LLM.

`npx fauxmium` is the command and there are more details on my [personal blog](https://paul.kinlan.me/projects/fauxmium/) and the code is on [GitHub](https://github.com/paulkinlan/fauxmium). You can watch it in action on my YouTube channel:

{{< youtube id="NZ0D2MwNbrM" class="youtube">}}

The architecture of Fauxmium is relatively straight forward (although there is more complexity in my repo as I try to stream responses). You launch a browser via Puppeteer and you set it up to intercept all requests. When a request is made, you send the URL to an LLM (along with a prompt to help it generate content) and it generates HTML which is then returned to the browser.

{{< figure src="/images/fauxmium.png" alt="Fauxmium in action" >}}

<br>

But this evening I was thinking about Chrome Extensions and how they used to be able to intercept and modify requests and responses. It was a powerful feature, but one fraught with security issues given the trust that you have to place in the extension developer and the fact that those extensions would have access to all your browsing data down to the request and response.

Using this concept and the way that Fauxmium works, I wondered: What if browsers in the future had a way to integrate LLMs into the request lifecycle?

So I built a proof of concept built off the back of `fauxmium` called `interceptium`. You launch Chrome for Testers via puppeteer and you set it up to intercept every request. Then when a request is made you decide if you to want to handle the request or let it go to the network. If you want to handle it, you have the chance to change the request (you might want to automatically generate post-data for example). You send the potentially modified request to the network, get the response and then you can pass the request data to an LLM and it generates HTML which is then returned to the browser.

Under the hood it looks like a request router that you might see in a web framework. This enables you to have multiple interceptors that can handle different types of requests. You can have one interceptor that handles requests for home pages and summarizes the content and another that will modify an image through something like nano-banana.

A concrete example is below: I like summaries. So I have a `SummaryInterceptor` that intercept requests to my blog homepage and I ask the LLM to summarize the content of the page. The LLM returns a summary in HTML format which is then rendered in the browser.

```JavaScript
import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

class SummaryInterceptor {
  #test = (request) => {
    console.log("Testing request:", request.url());
    const url = new URL(request.url());
    return url.hostname === "paul.kinlan.me" && url.pathname === "/";
  };
  #requestHandler = null;
  #responseHandler = async (request, response) => {
    const ai = console.log("Handling response for:", request, response);
    const headers = response.headers;
    const status = response.status;

    const result = await generateText({
      model: groq("openai/gpt-oss-120b"),
      system: `You are a world class expert in summarizing web pages. You take the content of a web page and distill it down to the most important points. You return the summary in markdown format. You return HTML only.`,
      prompt: await response.text(),
    });

    return {
      headers: headers,
      status: status,
      body: result.text,
    };
  };

  constructor(test) {
    this.name = "SummaryInterceptor";
    this.#test = test;
  }

  get test() {
    return this.#test;
  }

  get requestHandler() {
    return this.#requestHandler;
  }

  get responseHandler() {
    return this.#responseHandler;
  }
}

export { SummaryInterceptor };
```

And you know what, it only flippin' works! (Note: I use Groq for this demo because it has an incredibly fast response time. You can use any LLM you like).

{{< figure src="/images/summary.png" alt="Interceptium intercepting a request and summarizing the web page" >}}

Why is this interesting? Well, it opens up a whole new world of possibilities. You could have interceptors that craft pages to your needs and preferences without the author having to do anything. Some ideas for interceptors that spring to mind are:

- One that adds links to related content based on my reading history or one that translates content into my preferred language.
- One that can augment the structure of the page to make it more navigable or accessible.
- One that highlights key information based on my interests - I could imagine indicating that I want to highlight key information about if a hotel is kid friendly or has good WiFi.
- One that modifies images to be more in line with my aesthetic preferences.

There are also a lot of risks and challenges with this approach. The security implications are significant, and there would need to be a lot of thought put into how to ensure that users are protected from malicious interceptors that change the functionality or even the content of a page to be misleading or harmful. Not to mention the significant performance considerations, as large language models can be slow.
