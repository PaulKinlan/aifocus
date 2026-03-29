---
title: the token salary
date: 2026-03-27T20:00:00.000Z
slug: the-token-salary
draft: false
authors:
  - paulkinlan
---

Two conversations have been rattling around in my head this month, and they frame the same question from completely opposite directions.

The first is [Steve Yegge on The Pragmatic Engineer podcast](https://newsletter.pragmaticengineer.com/p/from-ides-to-ai-agents-with-steve) with [Gergely Orosz](https://newsletter.pragmaticengineer.com/). Steve's argument is blunt. Every company has a dial, and [he puts it like this](https://www.youtube.com/watch?v=aFsAOu2bgFk&t=1105s): "Everybody has a dial that they get to turn from zero to 100. And you can keep your hand off the dial, but it just has a default setting of what percentage of your engineers you need to get rid of in order to pay for the rest of them to have AI. Because they're all starting to spend their own salaries in tokens." He thinks the dial is being set at about 50. Half the workforce gets cut to fund AI for the remaining half. And as he points out, "half your engineers don't want to prompt anyway, and they're ready to quit."

The second is Jensen Huang at [GTC 2026](https://www.nvidia.com/gtc/). Same topic, completely different framing. Jensen told the [All-In Podcast](https://www.youtube.com/watch?v=gwW8GKwHB3I&t=3370s) that if a $500,000 engineer didn't consume at least $250,000 worth of tokens by year's end, he'd be ["deeply alarmed."](https://the-decoder.com/nvidia-ceo-jensen-huang-says-hed-be-deeply-alarmed-if-a-500k-developer-spent-less-than-250k-on-ai-tokens/) He wants to give every engineer tokens worth half their salary on top of their comp, not instead of it. Of course, Jensen is selling the GPUs that run all these tokens, so he would say that. But I still think it's interesting when you start to look at the data.

I've been pulling data from [OpenRouter's](https://openrouter.ai) public [usage rankings](https://openrouter.ai/rankings) since January, originally just to understand their business (I [put the raw analysis in a spreadsheet](https://docs.google.com/spreadsheets/d/1LhJ0HomGPJiwgueW-gOIkybaxouyev87oVJnyQV3dBo/edit?gid=0#gid=0)). When I tried to estimate their revenue from the raw token volumes, my numbers were wildly off. The thing that surprised me most wasn't the cost comparison between models. It was the ratio of input to output tokens.

Before I looked at the data, my mental model was that output tokens would dominate. You're paying for the AI to write code, so surely the expensive part is what it produces, right? I would have guessed something like 60/40 or maybe 70/30 skewed towards output. The reality is nothing like that. Real-world data from [OpenRouter's programming category](https://openrouter.ai/rankings/programming?view=week) shows **93.4% input tokens, 2.5% reasoning tokens, and just 4.0% output tokens**. It's almost entirely input.

Once you think about how people actually use these tools, it makes sense. If you're working in an IDE like [Cursor](https://www.cursor.com/) or a coding agent like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), you're uploading large chunks of your codebase as context. Every conversation turn reloads files, diffs, error logs, test output. The model reads thousands of lines to produce a handful of changed ones. A typical interaction might feed in 50,000 tokens of context to get back 2,000 tokens of actual code changes. And then the next turn does it all over again with the updated files. The output, the actual delta that gets applied to your code, is tiny in comparison.

This matters enormously for the salary-to-tokens calculation because input tokens are 3 to 8 times cheaper than output tokens. Most back-of-the-envelope calculations assume something like a 1:1 ratio and dramatically overestimate the cost. The per-model ratios vary too, and you can see it clearly in the data. Here are the top programming models on OpenRouter right now (week of March 27, 2026), with the input/output split for each:

| Model | Weekly Tokens | Input % | Output % | Reasoning % | Input $/1M | Output $/1M | Weekly Cost |
|-------|-------------:|--------:|---------:|------------:|-----------:|------------:|------------:|
| [MiMo-V2-Pro](https://openrouter.ai/xiaomi/mimo-v2-pro) | 3,280B | 99.5% | 0.5% | 0.0% | $1.00 | $3.00 | $3,311,474 |
| [Step 3.5 Flash](https://openrouter.ai/stepfun/step-3.5-flash) (free) | 1,581B | 96.6% | 3.0% | 0.4% | $0.10 | $0.30 | $168,735 |
| [DeepSeek V3.2](https://openrouter.ai/deepseek/deepseek-v3.2) | 1,204B | 96.7% | 3.2% | 0.0% | $0.26 | $0.38 | $317,709 |
| [MiniMax M2.7](https://openrouter.ai/minimax/minimax-m2.7) | 1,083B | 98.3% | 1.6% | 0.1% | $0.30 | $1.20 | $341,795 |
| [MiniMax M2.5](https://openrouter.ai/minimax/minimax-m2.5) | 1,050B | 98.9% | 1.0% | 0.1% | $0.20 | $1.17 | $220,858 |
| [GLM 5 Turbo](https://openrouter.ai/z-ai/glm-5-turbo) | 1,032B | 99.5% | 0.5% | 0.0% | $1.20 | $4.00 | $1,251,876 |
| [Claude Opus 4.6](https://openrouter.ai/anthropic/claude-opus-4.6) | 1,024B | 98.8% | 1.2% | 0.0% | $1.90 | $25.00 | $2,224,234 |
| [Claude Sonnet 4.6](https://openrouter.ai/anthropic/claude-sonnet-4.6) | 1,010B | 98.6% | 1.4% | 0.0% | $1.27 | $15.00 | $1,472,611 |
| [Gemini 3 Flash](https://openrouter.ai/google/gemini-3-flash-preview) | 951B | 94.7% | 5.2% | 0.1% | $0.50 | $3.00 | $600,929 |
| [Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite) | 554B | 90.1% | 9.8% | 0.1% | $0.10 | $0.40 | $71,794 |
| [Grok 4.1 Fast](https://openrouter.ai/x-ai/grok-4.1-fast) | 552B | 86.5% | 11.9% | 1.7% | $0.20 | $0.50 | $132,718 |
| [Nemotron 3 Super](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b) (free) | 550B | 98.3% | 1.6% | 0.2% | $0.10 | $0.50 | $58,727 |
| [Kimi K2.5](https://openrouter.ai/moonshotai/kimi-k2.5) | 535B | 97.6% | 2.2% | 0.2% | $0.45 | $2.20 | $263,457 |
| [Gemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash) | 534B | 93.6% | 6.4% | 0.1% | $0.30 | $2.50 | $236,063 |
| [MiMo-V2-Omni](https://openrouter.ai/xiaomi/mimo-v2-omni) | 479B | 99.4% | 0.6% | 0.0% | $0.40 | $2.00 | $196,221 |
| [GPT-OSS-120B](https://openrouter.ai/openai/gpt-oss-120b) | 437B | 87.8% | 11.0% | 1.1% | $0.04 | $0.19 | $25,101 |
| [Claude Sonnet 4.5](https://openrouter.ai/anthropic/claude-sonnet-4.5) | 341B | 98.0% | 2.0% | 0.0% | $1.43 | $15.06 | $581,577 |
| [GPT-5.4](https://openrouter.ai/openai/gpt-5.4) | 327B | 97.8% | 2.1% | 0.1% | $2.50 | $15.00 | $908,884 |
| [Claude Haiku 4.5](https://openrouter.ai/anthropic/claude-haiku-4.5) | 309B | 97.8% | 2.2% | 0.0% | $1.00 | $5.00 | $336,373 |
| [GLM 5](https://openrouter.ai/z-ai/glm-5) | 301B | 95.9% | 3.7% | 0.4% | $0.72 | $2.30 | $236,608 |
| **Total (all models)** | **21,733B** | **95.9%** | **3.9%** | **0.3%** | | | **$17,090,075** |

That's 21.7 trillion tokens per week just for programming on OpenRouter alone, generating $17 million in weekly model costs. When I [ran the same analysis in January](https://docs.google.com/spreadsheets/d/1LhJ0HomGPJiwgueW-gOIkybaxouyev87oVJnyQV3dBo/edit?gid=0#gid=0), the total was 4.2 trillion tokens per week generating $3.7 million. The market has grown roughly 5x in three months. The input/output ratio has barely changed though: it was 93.4% input in January and it's 95.9% input now. If anything, it's become even more input-heavy as agents and IDE integrations have matured and started feeding in more context per turn.

I wrote a [script](https://gist.github.com/PaulKinlan/39072ce8eaf5e0d3d75a0c7d950b58ad) that pulls this data fresh from the [OpenRouter API](https://openrouter.ai/api/v1/models) and their [programming rankings page](https://openrouter.ai/rankings/programming?view=week), so these numbers are reproducible and can be refreshed any time the data moves.

The pattern holds across every model in the table, and it makes the cost calculation much more favourable than most people assume.

Take a senior engineer at [$350,000 total comp](https://www.levels.fyi/t/software-engineer/levels/senior). If you redirect that entire salary into tokens at [Claude Opus 4.5 rates](https://openrouter.ai/anthropic/claude-opus-4.5/pricing) ($5 per million input, $25 per million output, blending to about $6.32 per million at real-world ratios), you get 55.4 billion tokens per year. That's 152 million tokens per day. At a rough guess of 50,000 to 200,000 tokens per substantial coding task (I don't have good data on this, it's an estimate based on what I see in my own agent sessions), that's somewhere between 277,000 and 1.1 million tasks per year. A human senior engineer does maybe 2 to 5 substantial tasks per day, roughly 1,000 per year, though that's a guesstimate too. Even at the most expensive frontier model, the token budget buys 277 times a human's raw throughput. At cheaper models the numbers get absurd: [GPT-5](https://openrouter.ai/openai/gpt-5) at $1.83 per million blended gives you 191 billion tokens, nearly a million tasks, almost 1,000 times human throughput.

Obviously, raw throughput isn't the whole story. Quality, judgment, context, initiative, knowing when not to build something, those are the things that make a senior engineer worth $350K and not just a very fast typist. But the throughput gap is so enormous that it raises questions that I think we all need to discuss.

Play with the calculator below to see how the numbers shift with different salaries, team sizes, models, and approaches. You can also adjust the input/output token ratio (the default 93/7 split matches real-world data, but your usage may differ) and the tokens per task (the default 100K is a rough estimate -- heavier agent sessions with large codebases can easily burn 500K or more per task, which changes the task-count numbers significantly). The sensitivity charts at the bottom show how tasks per engineer per day change as you sweep each variable -- salary, input/output ratio, and tokens per task -- so you can see just how much the assumptions matter:

{{< resize-iframe >}}
{{< iframe "/token-calculator.html" "1500" >}}

What I find interesting is that Steve and Jensen aren't actually as far apart as they sound. Jensen is selling his chips, but he's hitting on something real: if these tools genuinely produce better outcomes, it's probably not silly to invest more in them. I don't have an MBA, so I'm not actually sure how a business would decide between the two. It might be that both are equally useful strategies. But when you look at the calculator, something doesn't quite add up with Jensen's specific model.

Both approaches generate the same token budget at these defaults, $3.5 million. Steve's version costs $7 million total (same as before, just reallocated). Jensen's costs $10.5 million, a 50% increase, and each remaining engineer gets half the tokens per day that Steve's engineers get. Steve's model is just more efficient on the numbers. Jensen's approach means you're paying 50% more for the same amount of AI throughput, spread thinner across twice as many people. The only way Jensen's model wins is if the combination of human plus tokens is dramatically more valuable than tokens alone, which might be true, but it's not obvious. And of course, Jensen still gets paid either way: same number of tokens, same GPU demand, regardless of which model you pick. I'm not an analyst and I could easily be wrong about this, but something about the "just spend more" framing doesn't feel right when you actually cost it out.

I don't think it's as clear-cut as either of these models make it look. But I do feel the ground shifting underneath my feet. I pay for a [Claude Max](https://www.anthropic.com/pricing) subscription and a [Codex](https://openai.com/index/introducing-codex/) subscription. I'm a manager who gets to build a lot more now, during the day and in the evenings. I'm seeing more and more people around me building more things, shipping faster. There's a shift happening in the industry and I just don't know which way it goes.

On one hand, Jensen's pitch is progressive and it models out correctly, but it's more expensive and it doesn't necessarily lead to more outcomes if you think task completion is the thing to aim for. On the other hand, Steve's position is that maybe we need fewer cooks in the kitchen, and those cooks will be the ones driving the change, bringing the taste and the opinion, producing the same amount of output for the same cost in tokens, but a lower cost in salaries. Or maybe it's going to be some entirely different mechanism that neither of them has described, and we just don't know yet.

Since publishing this, a few people have pointed out something that was nagging at me too. Jensen's model has a weird built-in assumption: a more expensive engineer gets more tokens. Applied literally, a $400,000 Bay Area senior engineer gets $200,000 in tokens. A $150,000 London engineer doing identical work gets $75,000. A $60,000 Bangalore engineer gets $30,000. That's nearly 7x less AI throughput for the Bangalore engineer, for no reason related to the actual work. Token prices are global and fixed, like a commodity. The model doesn't produce worse code because the person prompting it earns less.

The regional calculator below shows this clearly. The cards at the top apply each model's formula locally to each region. Under both Jensen's and Steve's models, the numbers scale directly with salary. A Bangalore engineer gets a fraction of the AI throughput of a Bay Area engineer, despite being equally capable.

It could have been an offhand comment from Jensen. But here's the thing: Jensen's model gets dramatically more effective if you take that salary basis and apply it to an engineer in a different region where salaries are much lower.

That's what the relocation matrix shows. If you're currently spending a Bay Area budget ($600,000 under Jensen's model, or $400,000 under Steve's), what happens if you hire in a different region and redirect the salary savings into tokens?

{{< resize-iframe >}}
{{< iframe "/token-calculator-regional.html" "1500" >}}

The matrix makes the arbitrage obvious. Take Jensen's model with a Bay Area budget of $600,000 ($400,000 salary plus $200,000 in tokens). Hiring locally, that $200,000 token budget is all you get. Hire in London instead ($150,000 salary), and you have $450,000 left for tokens, 2.25x the AI throughput for the same total spend. Hire in Bangalore ($60,000 salary), and you have $540,000 in tokens, nearly 3x the throughput. The engineer is equally capable. The model produces the same quality code. The only thing that changed is where the human sits.

Steve's matrix tells a similar story. A Bay Area engineer's $400,000 salary, redirected entirely to tokens, buys a certain number of tasks per day. But if you instead hire a London engineer ($150,000) and put the remaining $250,000 into tokens, you get a human with judgment and context plus significant AI throughput, for the same cost as the Bay Area salary alone.

This is the part that I think neither Steve nor Jensen has fully articulated. Applied naively, "spend X% of salary on tokens" produces absurd geographic disparities. But applied strategically, taking a US-level budget and pairing it with a cheaper-region engineer, it becomes a genuinely powerful model. You keep the human judgment. You massively increase the AI throughput. And you spend less overall.

I suspect this is where the market is heading. Not a flat "50% of your salary in tokens" applied locally, but companies realising that the combination of a strong engineer in a lower-cost region plus a large token budget is far more effective per dollar than an expensive engineer with a proportionally expensive token allocation. The salary covers the human judgment, taste, and context. The token budget covers the AI throughput. Tying them together, which is what both Steve's and Jensen's models implicitly do, conflates two fundamentally different kinds of cost. Once you pull them apart and think about where to spend each dollar independently, the math gets much more interesting.
