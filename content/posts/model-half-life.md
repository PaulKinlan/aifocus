---
title: model half-life
date: 2026-05-11T09:00:00.000Z
slug: model-half-life
draft: true
authors:
  - paulkinlan
---

People keep saying the half-life of model drops has gone from four months to two. I have heard the number quoted with such confidence that I wanted to actually look at the data.

So I made a [TSV of every headline model release](/model-drops.tsv) from late 2022 through today across the US frontier labs (OpenAI, Anthropic, Google, xAI, Meta, Mistral) and the major Chinese labs (DeepSeek, Qwen, Zhipu, MiniMax, Moonshot, 01.AI, ByteDance). I split each vendor into the sub-series it actually ships in (Claude Opus is a different line from Claude Sonnet, GPT is a different line from the o-series, Gemini Pro is a different line from Flash). Then I plotted them.

A note on provenance, since I want to re-run this every few months. The initial dataset was compiled by Claude from vendor announcements and the references at the bottom of this post. I am working through it manually to verify dates, and I will correct entries in place when I find errors. If a row looks wrong to you, tell me. The full source list is in the [sources section](#sources) below.

{{< iframe "/model-drops.html" "1280" >}}

The dashed dots are predictions. The method is deliberately simple. For each series I sort drops chronologically, compute the gap in days between each consecutive pair, take the trailing three gaps (or all of them if there are fewer than three), and round the median to the nearest day. I use median rather than mean so a single outlier (a same-week double-drop, or a long unplanned hiatus) does not distort the prediction. Adding that median gap to the most recent release date gives the predicted next drop.

A one-drop series gets no prediction. A two-drop series uses its single gap. From three drops up, only the trailing three count, so the prediction tracks *current* cadence rather than a long-run average. The "predicted next drop per series" table sorts ascending, so anything in the past is overdue, and the dashed segments in the timeline connect each series's last shipped drop to its predicted next.

This is not a probabilistic forecast and there are no error bars. It is "if the recent cadence holds, here is when". A series running at sub-monthly cadence should be treated as a hint, not a deadline.

A couple of observations from sitting with this for a while:

The cadence line in the middle chart does compress. The first stretch of 2023 has the major labs trading at roughly six-month intervals. By mid 2025 the trailing median of frontier drops sits comfortably under 60 days. "Four months to two" is approximately right as a vibes-level claim. Whether it is *exactly* halved depends on what you count, but the direction is unambiguous.

The compression is not uniform across series. Claude Sonnet and the OpenAI GPT line are the fastest movers, with median gaps below 90 days and recent gaps closer to 50. Claude Opus and Llama tick slower, closer to 130 days, which is roughly where everyone was two years ago. The "average" cadence is being pulled down by a small number of teams shipping more often, not by everyone speeding up evenly.

The Chinese labs are surprisingly close to parity now on cadence. DeepSeek, Zhipu, Qwen, and MiniMax are each running median gaps comparable to the US frontier labs, and DeepSeek's V/R lines have been shipping faster than most US series since early 2025. If the half-life conversation focuses only on OpenAI and Anthropic, it understates how compressed the field actually is.

A series-level cadence stops being a useful concept when you cross a certain frequency. Below about 60 days the prediction interval is wider than the gap itself, and "what comes next" matters less than what was *different* about the latest drop. The half-life metaphor breaks down when half-life and product cycle become the same number.

The data file is at [/model-drops.tsv](/model-drops.tsv). If I have got dates or series wrong, file an issue or just tell me.

## Sources

These are the primary references used to compile and verify [/model-drops.tsv](/model-drops.tsv). I will keep adding to this list as the dataset is updated.

Vendor announcements and release notes:

- OpenAI: [news](https://openai.com/news/) and [release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
- Anthropic: [news](https://www.anthropic.com/news)
- Google DeepMind: [Google blog AI category](https://blog.google/products/ai/), [Gemini models docs](https://ai.google.dev/gemini-api/docs/models), [DeepMind blog](https://deepmind.google/discover/blog/)
- xAI: [news](https://x.ai/news)
- Meta AI: [blog](https://ai.meta.com/blog/), [Llama model cards](https://www.llama.com/)
- Mistral: [news](https://mistral.ai/news)
- DeepSeek: [API news](https://api-docs.deepseek.com/news/news)
- Qwen (Alibaba): [blog](https://qwenlm.github.io/blog/)
- Zhipu / GLM: [z.ai blog](https://z.ai/blog)
- MiniMax: [news](https://www.minimax.io/news)
- Moonshot: [moonshot.cn](https://www.moonshot.cn/)
- 01.AI: [01.ai](https://www.01.ai/)
- ByteDance Seed: [team page](https://seed.bytedance.com/en/)

Aggregators used for cross-checking dates:

- [LMArena leaderboard](https://lmarena.ai/leaderboard) (formerly LMSys)
- [Hugging Face model pages](https://huggingface.co/models)
- Wikipedia entries for individual model families (good for triangulating announcement vs release dates)

Disclosure: the initial TSV was compiled by Claude. I am verifying it row by row and will correct entries as I go. If you spot an error, please open an issue or message me.
