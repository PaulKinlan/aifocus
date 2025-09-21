---
title: interception
date: 2025-09-21T13:00:00.000Z
slug: interception
authors:
  - paulkinlan
---

This is a very quick post. I had an idea as I was walking the dog this evening, and I wanted to build a functioning demo and write about it within a couple of hours.

While the post and idea started this evening, the genesis of the idea has been brewing for a while and goes back over a year to August 2024, when I wrote about [being sucked into a virtual internet](https://paul.kinlan.me/fictitious-web/). WebSim has been on my mind for a while, and I wanted to be able to simulate my own version of the web using the browser directly and not via another web page. A couple of weeks ago, I managed to work out how to get [Puppeteer](https://pptr.dev/) to intercept requests and respond with content generated via an LLM.

`npx fauxmium` is the command, and there are more details on my [personal blog](https://paul.kinlan.me/projects/fauxmium/). The code is on [GitHub](https://github.com/paulkinlan/fauxmium). You can watch it in action on my YouTube channel:

{{< youtube id="NZ0D2MwNbrM" class="youtube">}}

The architecture of Fauxmium is relatively straightforward (although there is more complexity in my repository as I try to stream responses). You launch a browser via Puppeteer and set it up to [intercept all requests](https://pptr.dev/guides/network-interception). When a request is made, you send the URL to an LLM (along with a prompt to help it generate content), and it generates HTML or images, which are then returned to the browser.

{{< figure src="/images/fauxmium.png" alt="Fauxmium in action" >}}

This evening, I was wondering if I could take it a step further and have a large language model (LLM) be in every point of the request lifecycle.

So I built a proof of concept off the back of `fauxmium` called `interceptium` [[code](https://github.com/paulkinlan/interceptium)]. You launch [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing) via Puppeteer and set it up to intercept every request. Then, [when a request is made](https://github.com/PaulKinlan/interceptium/blob/e0389616f2b087033054b4f60e47de2d2cb739af/browser.js#L67), you decide if you want to handle the request or let it go to the network. If you want to handle it, you have the chance to change the request (you might want to automatically generate post-data, for example). You send the potentially modified request to the network, get the response, and then you can pass the request data to an LLM, which generates HTML that is then returned to the browser.

Under the hood this looks like a typical request router that you might see in a web framework. This enables you to have multiple interceptors that can handle different types of requests. You can have one interceptor that handles requests for home pages and summarizes the content and another that will modify an image through something like `nano-banana`.

A concrete example is below. I like summaries, so I have a `SummaryInterceptor` that intercepts requests to my blog's homepage, and I ask the LLM to summarize the content of the page. The LLM returns a summary in HTML format, which is then rendered in the browser.

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

And you know what? It only flippin' works! (Note: I use Groq for this demo because it has an incredibly fast response time. You can use any LLM you like).

{{< figure src="/images/summary.png" alt="Interceptium intercepting a request and summarizing the web page" >}}

Why is this interesting? Well, it opens up a whole new world of possibilities. You could have interceptors that craft pages to your needs and preferences without the author having to do anything. Some ideas for interceptors that spring to mind are:

- One that adds links to related content based on my reading history or one that translates content into my preferred language.
- One that can augment the structure of the page to make it more navigable or accessible.
- One that highlights key information based on my interests—I could imagine indicating that I want to highlight key information about whether a hotel is kid-friendly or has good Wi-Fi.
- One that find unstructured data within a page (e.g., a paragraph describing a product's specs) and automatically reformats it into a clean, sortable HTML table. For example, it could turn a camera review into a spec sheet comparing it to other models you've recently viewed.
- One that identifies section breaks and headings to automatically generate and inject a floating "Table of Contents" for easy navigation.
- One that adjusts a recipe page and adds controls to instantly adjust ingredient quantities for a different number of servings. Based on your preferences, it could also automatically convert all measurements to metric and suggest substitutions for dietary restrictions.

There are also a lot of risks and challenges with this approach. The security implications are significant, and there would need to be a lot of thought put into how to ensure that users are protected from malicious interceptors that change the functionality or even the content of a page to be misleading, harmful or inserts prompt injections to exfiltrate sensitive information. Not to mention the significant performance considerations and energy requirements from large language models.

That being said, I do think that we should be discussing this type of functionality as a potential future direction for browsers because the ability to customize and adapt the web to our needs is incredibly powerful.
