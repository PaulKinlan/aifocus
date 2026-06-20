---
title: can a url influence an llm's output?
description: Testing whether opaque URLs act as pointers to memorized content in model weights
date: 2026-06-18T21:47:22.638Z
slug: influencing-model-output-with-urls
draft: true
---

I've had this thing on my mind for ages and it started when I was thinking about how the mere presence of a technology name in a prompt seemed to bias the output to that technology.

For example, I looked through a number of system prompts for Agentic tooling and they would include text like `(e.g. React)` and then it felt like these tools would output React code vs a similar prompt that didn't mention React.

The last couple of days I've embarked on some research to try and help me scratch this itch of influencing prompt output. But before I get too far, I have a request for help. I'm not a researcher. I think what I have here is compelling information (or at least it taught me something), but I might have made a lot of mistakes or made assumptions that have biased the output. If you have any advice I would LOVE to hear from you. [Email me](mailto:paul@aifoc.us).

The question I had was: would the presence of a URL in a prompt influence the output of the LLM based on the content at that URL or the literal text of the URL? Or maybe more accurately, is there a mapping between a URL string in a prompt and the contents of that URL which would then influence the model's latent space in a way to produce output influenced by the content.

If yes, then this could lead to us not having to embed lots of context into the prompt. For example, you might have a Skills file that is deeply integrated into the model's weights and by saying "use what you know about: https://skills.sh/super-security-reviewer do a deep analysis" then information in the model's latent space would bias the output towards the content encoded at that URL.

[I built an LLM-as-a-judge tool to help me test the hypothesis.](https://github.com/PaulKinlan/url-influence) My plan was:

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

My finding is that there is no general mapping from an opaque URL to the content behind it. My original hypothesis only holds at the extremes, and for the ordinary case it does not: having a URL in the prompt does not reliably activate some latent representation of the page, outside of a plain descriptive reading of the URL text itself.

My current read is: URLs are not magic context.

For most ordinary opaque URLs I tested, I did not find evidence that the model reliably uses the content behind the URL. ChromeStatus feature URLs are a good example: the URL clearly says "this is Chrome/web related", but the numeric feature id does not reveal the feature, and models mostly failed to recover the right API from that number alone.

My first thought was that ChromeStatus simply wasn't in the training data. It is. Those feature pages show up in Common Crawl about as often as the arXiv papers that decode perfectly, and they still recover almost nothing. So it isn't whether the page was crawled. It's whether the exact identifier gets written down next to its content. People cite `arxiv.org/abs/1706.03762` in prose constantly, right beside a description of the paper, so the model learns the pairing. Nobody ever writes `chromestatus.com/feature/5157805733183488` next to "CSS gap decorations". That number only ever lives on the page itself, never in a sentence about the feature, so the association never forms even though the page was crawled.

There are two important exceptions.

First, descriptive URLs do influence output. If the URL contains words like `React`, `fetch`, or `text-justify`, those words are normal prompt text. The model can use them just like any other token.

Second, some famous opaque identifiers really do decode. Landmark arXiv IDs, classic RFCs, and well-known CVEs recover their content surprisingly well from the bare identifier alone. From just `arxiv.org/abs/1706.03762`, with no other hint, the models reconstruct "Attention Is All You Need" and the transformer. That looks less like "the URL points to live content" and more like "this identifier and its content appeared together often enough in the training data to be memorized". And it's a gradient, not a switch: the decoding is strong for famous identifiers and fades steadily as the content gets more obscure, down to roughly nothing for the long tail. You can watch that gradient directly with GitHub commits. The famous first commits to Linux, Git, and Bitcoin decode from the bare SHA, while ordinary routine commits from the same kinds of repos return nothing at all. The knowledge cutoff bites the same way. Anything published after it is gone, even for otherwise well-known sources.

The controls make me more confident this is about memorized content and not the URL itself. A fake URL of the same shape, an opaque-shaped fake identifier, and an unrelated real URL all scored near zero. So it isn't merely having a URL, or having one that looks the part, that moves the output. It's whether the real content was in the training data.

The flip side is the practical one. When I stopped pointing at the content and just pasted the page in, the models did fine. For the web feature tasks the bare ChromeStatus URL recovered almost nothing, but handing the model the actual page got it most of the way to a correct answer. Obvious in hindsight, but it's the whole point: if you want a model to use a page, give it the page, not a link to it.

So the answer is not "URLs never matter". It is: a URL matters when it's readable text, or when the exact identifier appeared often enough in training to be memorized along with its content. For the long tail of opaque URLs, I would not rely on the URL alone as context. Which is exactly the problem for the idea I started with: a `skills.sh/super-security-reviewer` pointer is, by definition, new and niche, the long-tail case where none of this works.

I think these are fun questions, but with the model lag, I don't know if I want to wait around. Also, the models seem pretty good at pulling in content and as context windows expand, this experiment might just be a costly way for me to have scratched an itch.
