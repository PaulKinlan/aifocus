---
title: Can a URL influence an LLM's output?
description: Testing whether opaque URLs act as pointers to memorized content in model weights
date: 2026-06-18T21:47:22.638Z
slug: influencing-model-output-with-urls
draft: true
---

I've had this thing on my mind for ages and it started when I was thinking about the mere presence of a technology name in a prompt seemed to bias the output to that technology.

For example, I looked through a number system prompts for Agentic tooling and they would include text like `(e.g, React)` and then it felt like these tools would output React code vs a similar prompt that didn't mention React.

The last couple of days I've embarked on some research to try and help me scratch this itch of influencing prompt output. But before I get too far, I have a request for help. I'm not a researcher. I think what I have here is compelling information (or at least it taught me something), but I might have made a lot of mistakes or made assumptions that have biased the output. If you have any advice I would LOVE to hear from you. [Email me](mailto:paul@aifoc.us).

The question I had was: Would the presence of a URL in a prompt influence the output of the LLM based on the content at that URL or the literal text of the URL? Or maybe more accurately is there a mapping between a URL string in a prompt and the contents of that URL which would then influence the model's latent space in a way to produce output influenced by the content.

If yes, then this could lead to us not having to embed lots of context into the prompt. For example, you might have a Skills file that is deeply integrated into the model's weights and by saying "use what you know about: https://skills.sh/super-security-reviewer do a deep analysis" then information in the model's latent space would bias the output towards the content encoded at that URL.

[I built a model-as-a-judge tool to help me test the hypothesis.](https://github.com/PaulKinlan/url-influence) My plan was:

1. to find each model's known "Knowledge Cut-off date"
2. then find content on either side of that to test if the model could recall the data that I believe should be known in the model.
3. find ranges of content ranging from content that I believe would be popular all the way to likely esoteric.

Content known to be after a cutoff would help me control against hallucination. If my original hypothesis was correct, then the model should clearly state the URL was not in it's training data.

Once I had the data I created a range of tests to help me understand how the models work. The tests are classified as:

1. `name-only` — the task described in words, no URL (baseline)
2. `url-only` — ONLY the opaque URL string; the page is never fetched
3. `mdn-url-only` / `spec-url-only` / `bcd-key-only` — optional identifier probes, not part of the headline lift
4. `url+name` — the opaque URL plus the task name
5. `full-content` — the real page pasted in (ceiling)
6. `fake-structural-url` / `random-url` — controls (a nonexistent URL of the same shape, and an unrelated real URL)

`url-only` was my real test to try to ensure that the LLM couldn't infer the contents from the literal URL string, so for example I used some URLs from chromestatus.com (which is our public dashboard of Chrome features) because it has URLs like: https://chromestatus.com/feature/5157805733183488, which while I believe it's pretty clear to the LLM that they are web-related, you can't infer that it's about CSS-Gap.

I then had other tests, like descriptive URLs (MDN for example is very descriptive - which for the web is very good UX) to validate if the literal URL influenced the output as well as what happens when we add in extra context.

[I have a report here](https://paulkinlan.github.io/url-influence/) and all the [data is here](https://paulkinlan.github.io/url-influence/results/dashboard.html) (iframed too) - I think it's worth looking at, but there's a pretty clear picture and answer to my question.

{{< iframe "https://paulkinlan.github.io/url-influence/results/dashboard.html" 900>}}

My finding is that for the majority of URLs I tested there appears to be _no logical mapping between URL and the content at that URL_. Which means that my original hypothesis is incorrect and that having the URL present in the prompt can't activate some latent-space in the model based on the content at that URL and thus doesn't influence the output outside of a descriptive reading of the URL.

My current read is: URLs are not magic context.

For most ordinary opaque URLs I tested, I did not find evidence that the model reliably uses the content behind the URL. ChromeStatus feature URLs are a good example: the URL clearly says "this is Chrome/web related", but the numeric feature id does not reveal the feature, and models mostly failed to recover the right API from that number alone.

There are two important exceptions.

First, descriptive URLs do influence output. If the URL contains words like `React`, `fetch`, or `text-justify`, those words are normal prompt text. The model can use them just like any other token.

Second, some famous opaque identifiers do work. Landmark arXiv IDs, RFCs, and well-known CVEs can decode surprisingly well. That looks less like "the URL points to live content" and more like "this identifier/content pair is famous enough to be memorized."

So the answer is not "URLs never matter." It is: a URL matters when it is readable text, or when the exact identifier is famous enough. For the long tail of opaque URLs, I would not rely on the URL alone as context.

I think these are fun questions, but with the model lag, I don't know if I want to wait around. Also, the models seem pretty good at pulling in content and as context windows expand, this experiment might just be a costly way for me to have scratched an itch.
