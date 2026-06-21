---
title: can a url influence an llm's output?
description: Testing whether opaque URLs act as pointers to memorized content, and finding that JavaScript-rendered sites may be missing from model training entirely
date: 2026-06-18T21:47:22.638Z
slug: influencing-model-output-with-urls
draft: true
---

At first, this was a really easy post to right but then I found some things out and it became one of the harder (and most expensive posts - the API costs were quite large).

I've had this thing on my mind for ages and it started when I was thinking about how the mere presence of a technology name in a prompt seemed to bias the output to that technology.

For example, I looked through a number of system prompts for Agentic tooling and they would include text like `(e.g. React)` and then it felt like these tools would output React code vs a similar prompt that didn't mention React.

The last couple of days I've embarked on some research to try and help me scratch this itch of influencing prompt output. But before I get too far, I have a request for help. I'm not a researcher. I think what I have here is compelling information (or at least it taught me something), but I might have made a lot of mistakes or made assumptions that have biased the output. If you have any advice I would LOVE to hear from you. [Email me](mailto:paul@aifoc.us).

The question I had was: would the presence of a URL in a prompt influence the output of the LLM based on the content at that URL or the literal text of the URL? Or maybe more accurately, is there a mapping between a URL string in a prompt and the contents of that URL which would then influence the model's latent space in a way to produce output influenced by the content.

If yes, then this could lead to us not having to embed lots of context into the prompt. For example, you might have a Skills file that is deeply integrated into the model's weights and by saying "use what you know about: https://skills.sh/super-security-reviewer do a deep analysis" then information in the model's latent space would bias the output towards the content encoded at that URL.

What follows is the journey I took.

---

First up, [I built an LLM-as-a-judge tool to help me test the hypothesis.](https://github.com/PaulKinlan/url-influence) My plan was:

1. to find each model's known "Knowledge Cut-off date"
2. then find content on either side of that to test if the model could recall the data that I believe should be known in the model.
3. find ranges of content ranging from content that I believe would be popular all the way to likely esoteric.

Content known to be after a cutoff would help me control against hallucination. If my original hypothesis was correct, then for that content the model should decline, or say it doesn't know, rather than confidently make something up.

Once I had the data I created a range of tests to help me understand how the models work. The tests are classified as:

1. `described`: the task described in words, no URL (the baseline)
2. `opaque-url`: ONLY the opaque URL string, and the page is never fetched
3. `mdn-url-only` / `spec-url-only` / `bcd-key-only`: optional identifier probes, not part of the main comparison
4. `url+described`: the opaque URL plus the task described
5. `full-content` / `content-only`: the real page pasted in, with and without the task spelled out (the ceiling)
6. `fake-structural-url` / `random-url`: controls (a nonexistent URL of the same shape, and an unrelated real URL)

`opaque-url` was my real test, to try to ensure that the LLM couldn't infer the contents from the literal URL string. So for example I used some URLs from chromestatus.com (which is our public dashboard of Chrome features) because it has URLs like https://chromestatus.com/feature/5157805733183488, and while I believe it's pretty clear to the LLM that they are web-related, you can't infer that it's about CSS Gap Decorations.

I then had other tests, like descriptive URLs (MDN for example is very descriptive, which is very good UX for the web) to validate whether the literal URL influenced the output, as well as what happens when we add in extra context.

[I have a report here](https://paulkinlan.github.io/url-influence/) and all the [data is here](https://paulkinlan.github.io/url-influence/results/dashboard.html) (iframed too). I think it's worth looking at, and there's a pretty clear picture and answer to my question.

{{< iframe "https://paulkinlan.github.io/url-influence/results/dashboard.html" 900>}}

My first hunch was that URLs are not magic context. The averaged numbers seemed to back that up. Adding a bare opaque URL to a prompt did almost nothing on average, and plenty of opaque URLs recovered nothing at all.

But there was all of these URLs that had really good recall.

For many of the ordinary opaque URLs I tested (notably Chromestatus ones), I did not find evidence that the model reliably uses the content behind the URL. ChromeStatus feature URLs are a good opaque URL. While the URL clearly says "this is Chrome/web related", the numeric feature id does not reveal the feature, and models mostly failed to recover the right API from that number alone.

But then I had a lot of other Opaque IDs that didn't recall well. StackOverflow. I went and checked StackOverflow's [robots.txt](https://stackoverflow.com/robots.txt) and it's pretty much deny everything. Hmm. What's ChromeStatus's? I checked and it looked fine... maybe ChromeStatus URLs are just not in the model for some other reason. For example, one of Chrome's most popular features, [Service Worker](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=service-worker), couldn't be reacalled from the URL... It was just odd, and it wasn't until I pulled the Common Crawl data that it clicked. 

I went to look for what the models use to ingest data, and it's kinda hard to find the exact corpus of crawl data, but I did remember a podcast from a little while ago that discussed [Common Crawl](https://commoncrawl.org) being used as a source of a lot of data. So I went to check if Chromestatus was in the common crawl. It is. The pages show up in Common Crawl about as often as the arXiv papers that decode almost perfectly. But when I pulled the actual crawled bytes, there was no content in them!!! 

ChromeStatus is a JavaScript app (I remember it first being built with Polymer)and the crawler captured an empty shell. The saved page for CSS Gap Decorations is about 3KB of HTML with 22 characters of visible text, "Chrome Platform Status", and not one word about the feature ([here is the actual Common Crawl capture](https://paulkinlan.github.io/url-influence/results/cc-samples/chromestatus-css-gap-decorations.cc.html.txt)). I checked four features and they were all identical empty shells. The arXiv page, by contrast, is server-rendered, so the crawl holds the full title and abstract ([its capture](https://paulkinlan.github.io/url-influence/results/cc-samples/arxiv-attention.cc.html.txt)).

The fact that we don't know the source of "web data" for the models is concerning. If Common Crawl is a source of data, then I'm making the assumption that SPA's that require JS to get data to the user are very likley to not be in the models training data (that might be a feature for some folks - heh.) My evidence is that you can watch every model flatline on the bare ChromeStatus id, then recover the feature once handed the actual page, [in the per-test view here](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=css-gap-decorations).

Anyway, to kill the "maybe it just wasn't crawled" doubt entirely, I tried a case where the content is beyond question in the model. Every Wikipedia article has an internal numeric id you can address directly: `en.wikipedia.org/?curid=24544` is Photosynthesis. The content is server-rendered and unquestionably in every model. But here is the detail I only caught when I checked Common Crawl directly: the `?curid=` URL is in none of the crawl indexes I looked at, while the canonical `en.wikipedia.org/wiki/Photosynthesis` URL is in all of them (200, full text). I checked all five. Every `/wiki/` article present, every `?curid=` absent. This makes sense because Wikipedia points the curid at the canonical title URL and the crawler respects that canonical, so the content gets crawled under its title and the bare curid string is recorded nowhere. The content is in, the identifier is not. From the curid alone, the models recover nothing. Zero, every time, across all five articles I tried (Photosynthesis, [Mitochondrion](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=wiki-curid-mitochondrion), [HTTP 404](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=wiki-curid-http-404), [Bitcoin](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=wiki-curid-bitcoin), and the Transformer). If you ask by name and they score perfectly, paste the article and they score perfectly, give the bare numeric id and wah wah, a flat 0.00. You can see every model on it [in the per-test view here](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=wiki-curid-photosynthesis), and the same for [the Transformer article](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=wiki-curid-transformer-dl). That is the whole finding in one test: the content being in the model is necessary but not enough. The id has to be something people actually write down and cite, and a curid never is.

There are two important exceptions.

First, descriptive URLs do appear to influence output. If the URL contains words like `React`, `fetch`, or `text-justify`, those words are normal prompt text. The model can use them just like any other token.

Second, some famous opaque identifiers really do decode. Landmark arXiv IDs, [classic RFCs](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=rfc-9110-http-semantics), and [well-known CVEs](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=cve-2014-0160-heartbleed) recover their content surprisingly well from the bare identifier alone. From just `arxiv.org/abs/1706.03762`, with no other hint, the models reconstruct "Attention Is All You Need" and the transformer ([every model on that bare id](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=arxiv-attention)). That looks less like "the URL points to live content" and more like "this identifier and its content appeared together often enough in the training data to be memorized". And it's a gradient, not a switch: the decoding is strong for famous identifiers and fades steadily as the content gets more obscure, down to roughly nothing for the long tail. You can watch that gradient directly with GitHub commits. The famous first commits to [Linux](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=gh-sha-linux-initial-git), [Git](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=gh-sha-git-initial-commit), and [Bitcoin](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=gh-sha-bitcoin-first-commit) decode from the bare SHA, while [ordinary routine commits](https://paulkinlan.github.io/url-influence/results/dashboard.html#test=gh-sha-obscure-ky-searchparams) from the same kinds of repos return nothing at all. The knowledge cutoff bites the same way. Anything published after it is gone, even for otherwise well-known sources.

And for the URLs that are memorized, the influence goes further than answering when asked. I ran a version where I never told the model to use the URL at all. I gave it a neutral task, like suggesting a memorable security incident for a talk, and just left a URL sitting in the prompt as if it were a tab I happened to have open. With a famous CVE link present but unmentioned, the model raised that exact vulnerability almost every time, when otherwise it would have picked something else. A random link did nothing. An obscure one did nothing. So a memorized URL doesn't just respond when you interrogate it, it quietly tilts the output even as ambient context. That is the React hunch I opened with, confirmed, but only for the URLs the model has already memorized.

The controls make me more confident this is about memorized content and not the URL itself. A fake URL of the same shape, an opaque-shaped fake identifier, and an unrelated real URL all scored near zero. So it isn't merely having a URL, or having one that looks the part, that moves the output. It's whether the real content was in the training data.

One caveat so I don't oversell the crawl angle. Stack Overflow blocks the crawler, so none of my Stack Overflow questions are in Common Crawl at all, yet the famous ones still decode from the bare question URL. Stack Overflow clearly reaches the model another way, most likely its openly licensed data dumps. So "not in Common Crawl" is not the same as "not in the model". The crawl is one source among several. ChromeStatus is the clean failure because its content is missing from the crawl and isn't reposted anywhere else either, so it never made it into training by any route.

The flip side is the practical one. When I stopped pointing at the content and just pasted the page in, the models did fine. For the web feature tasks the bare ChromeStatus URL recovered almost nothing, but handing the model the actual page got it most of the way to a correct answer. Obvious in hindsight, but it's the whole point: if you want a model to use a page, give it the page, not a link to it.

So the answer is not "URLs never matter". It is: a URL matters when it's readable text, or when the exact identifier appeared often enough in training to be memorized along with its content. For the long tail of opaque URLs, I would not rely on the URL alone as context. Which is exactly the problem for the idea I started with: a `skills.sh/super-security-reviewer` pointer is, by definition, new and niche, the long-tail case where none of this works.

Here is the part that actually stuck with me, and it has nothing to do with URLs. ChromeStatus is a site whose entire job is to document the web platform, and it contributes almost nothing to what these models know, because it renders its content with JavaScript and the crawler only ever saw an empty shell. The page is public. It is crawled. Its robots.txt allows it. And it is still effectively absent from the model.

If that is true for ChromeStatus, it is true for a slice of the modern web. Single-page apps, JavaScript-rendered docs, anything that assembles its content in the browser: a crawler can fetch the URL and come away with nothing but a loading shell. Server-rendered sites like arXiv, Wikipedia, and MDN walk straight in. Client-rendered ones can be invisible, however good the content is.

So I tried to measure it. I streamed a large sample of Common Crawl, kept the real (200, text/html) pages, and looked for the ones a model would see as blank. How you count this turns out to matter a lot, and my first instinct was wrong. The obvious approach is to count pages with almost no visible text, but any single text cutoff is arbitrary: raise it and you start sweeping in short but real pages that happen to use a framework, lower it and you miss shells that carry a stray word of chrome. So the number I actually trust needs no cutoff at all. A client-rendered page ships its framework's mount point empty, a literal `<div id="root"></div>` or `<app-root></app-root>` sitting there waiting for JavaScript, where a server-rendered page has already filled that container before the crawler ever sees it. Counting pages whose app mount is present but empty is a clean structural signature of client-rendering, with nothing to argue about. Across about 1.04 million pages from 88 crawl files, 0.45% were empty mounts like this. The looser text-based count (almost no visible text, nothing hiding in inline JSON, plus a client-render marker) lands around 1.2%, but I only quote that one next to its sensitivity sweep, because you can watch the cutoff move it; the 0.45% empty-mount figure is the floor I would actually stand behind. Either way, "a real slice of crawled pages is effectively blank to the model" is where it ends up. These are not small files: the shells average about 53KB of HTML, all bundles and markup, with next to no text. The biggest bucket is pages with no attributable framework at all, then jQuery building its DOM on load, then Next.js. For context, jQuery shows up on two thirds of all crawled pages and Bootstrap on a fifth, but those are mostly fine, sitting on server-rendered HTML; it is specifically the client-rendered ones that vanish.

I also ran it twice, on the February crawls a year apart, to see which way this is going, and it is getting worse rather than better. The threshold-free empty-mount rate rose from 0.38% to 0.45% year over year, and the looser text-based estimate from 0.94% to 1.21%. Both measures, over more than a million pages each, move in the same direction. The blank slice of the web is growing, not shrinking.

The part I did not expect: it gets worse the more popular the site is. Joining each page to a domain ranking, the shell rate climbs from 0.86% across the long tail (unranked domains) to about 2% in the 10k-100k band and 2.5 to 2.8% among the top 10,000 sites. The polished, well-funded, modern front of the web is the part most likely to be a blank shell in the crawl. And that gap is widening: a year earlier the top-1k shell rate was 1.6%, and now it is 2.5%. So this is not a problem of obscure sites being neglected; it is the opposite. (Every number here is from a sample I have published, including the exact list of crawl files used, so it can be re-run and checked.)

{{< iframe "https://paulkinlan.github.io/url-influence/results/shell-survey.html" 760>}}

In a world where people increasingly ask a model instead of opening ten tabs, being absent from the training data is a real discoverability problem, and I don't think it is well understood yet. There is a lot more to dig into: does the rate differ between providers, given some of them run search crawlers that do execute JavaScript? I would be glad if this nudged someone to take it further.

So I went looking for what the model providers actually say about how they collect the web, and the honest answer is very little. [Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) describes a general-purpose crawler (ClaudeBot) that follows robots.txt. [OpenAI](https://cdn.openai.com/gpt-5-system-card.pdf) says its models are trained on publicly available data, alongside data from partners and from its own users. [Google](https://storage.googleapis.com/deepmind-media/Model-Cards/Gemini-2-5-Pro-Model-Card.pdf) says Gemini is trained on publicly available web documents. Every one of them tells you they crawl the public web. Not one of them tells you whether the crawler runs JavaScript, and that single detail decides whether a huge part of the modern web makes it in at all. I would like to see that in the model cards.

There is a gap that everyone are sleep-walking into. Developers ship sites that look perfect in a browser and are blank to a crawler, and never find out. Providers train on a web that quietly excludes a chunk of itself, and don't tell you which parts they can and can't see. Both halves are easy to miss, and both are fixable, but only once you know to look.

If you run a site and you care whether models know it exists, the safe move imo is the boring one: server-render your content, or at least make sure the words are in the HTML before any JavaScript runs.
