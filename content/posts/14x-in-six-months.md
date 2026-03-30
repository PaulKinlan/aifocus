---
title: damn claude, that's a lot of commits
date: 2026-03-28T20:00:00.000Z
slug: damn-claude-thats-a-lot-of-commits
draft: false
authors:
  - paulkinlan
---

In early January 2026 I was listening to [Transistor Radio](https://podcasts.apple.com/us/podcast/transistor-radio/id1607558815), the Semi-Analysis podcast, where Doug O'Laughlin was talking about how good Claude Code had become. I follow a lot of analysis sites covering what's happening in LLMs, [Ben Thompson](https://stratechery.com/), [Semi-Analysis](https://newsletter.semianalysis.com/), and others, and this one stuck with me. Then in February they published ["Claude Code is the Inflection Point"](https://newsletter.semianalysis.com/p/claude-code-is-the-inflection-point), showing you could track AI coding tool usage through Co-Authored-By trailers in commit messages. I wanted to see the numbers for myself, so I built scripts to pull data from GitHub's search API across every AI coding tool I could find: [commits](https://gist.github.com/PaulKinlan/68210b7a1c7edfce2fc2f8789065b227), [PRs created](https://gist.github.com/PaulKinlan/c9abaad41c218b64cab00196b88e4d46), [PR interactions](https://gist.github.com/PaulKinlan/bce8a6195e54a17e3afd14253ed6413d), and [issue comments](https://gist.github.com/PaulKinlan/3887bd2a0a533d2ff3c1ee8ed59cc230).

The week of September 29 2025, there were 27.7 million public commits on GitHub. Claude Code accounted for 180,000 of them, about **0.7%**. By the week of March 16 2026, total weekly commits had grown to 57.8 million (itself a 2.1x increase, likely driven in part by AI tooling), and Claude Code accounted for 2.6 million, or **4.5%**. All AI coding tools combined now sit at roughly **5%** of every public commit on GitHub. For context, [GitHub's Octoverse 2025 report](https://github.blog/news-insights/octoverse/what-986-million-code-pushes-say-about-the-developer-workflow-in-2025/) recorded 986 million code pushes for the year, with monthly pushes topping 90 million by May 2025, and that trajectory hasn't slowed down.

{{< figure src="/images/ai-commit-share-of-github.png" alt="AI share of all public GitHub commits over 6 months" caption="Claude Code went from 0.7% to 4.5% of all public GitHub commits in six months" >}}

(You'll notice a dip in the share chart around early March. That's not Claude slowing down, it's total GitHub commits spiking to 61.8 million that week, roughly double the norm. Claude's absolute numbers kept climbing, but the denominator jumped so the percentage dipped temporarily. The last week is also incomplete, only covering through March 27.)

{{< figure src="/images/claude-code-weekly-commits.png" alt="Claude Code weekly commits on GitHub from October 2025 to March 2026" caption="Claude Code weekly commits on GitHub" >}}

{{< figure src="/images/github-total-vs-claude.png" alt="GitHub total commits versus Claude Code commits" caption="Total GitHub commits (bars) versus Claude Code commits (line)" >}}

There's a clear inflection around late December 2025. Before that, Claude Code was growing linearly, 180K to 370K per week over three months. Then something shifts. By February it's over a million per week. By mid-March, 2.6 million.

Claude Code is now generating more commits per week than every other AI coding tool combined. Here are the 6-month totals from late September 2025 through late March 2026:

| Tool | 6-Month Commits | Method | Example Query |
|------|----:|------|------|
| Claude | 20,963,874 | Co-Authored-By trailer | [search](https://github.com/search?q=Co-Authored-By%3A+Claude+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Copilot Agent | 2,550,612 | Bot author account | [search](https://github.com/search?q=author%3Acopilot-swe-agent%5Bbot%5D+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Cursor | 854,505 | Co-Authored-By trailer | [search](https://github.com/search?q=Co-Authored-By%3A+Cursor+author-date%3A2025-09-29..2026-03-27&type=commits) |
| GitHub Copilot | 833,379 | Co-Authored-By trailer | [search](https://github.com/search?q=Co-Authored-By%3A+GitHub+Copilot+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Jules | 548,364 | Bot author account | [search](https://github.com/search?q=author%3Agoogle-labs-jules%5Bbot%5D+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Codex | 173,031 | Co-Authored-By trailer | [search](https://github.com/search?q=Co-Authored-By%3A+Codex+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Happy | 76,478 | Co-Authored-By trailer | [search](https://github.com/search?q=Co-Authored-By%3A+Happy+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Devin | 62,675 | Bot author account | [search](https://github.com/search?q=author%3Adevin-ai-integration%5Bbot%5D+author-date%3A2025-09-29..2026-03-27&type=commits) |
| Aider | 47,769 | Co-Authored-By trailer | [search](https://github.com/search?q=Co-Authored-By%3A+Aider+author-date%3A2025-09-29..2026-03-27&type=commits) |

21 million Claude commits in six months. Damn! The next closest is Copilot's SWE agent at 2.5 million.

{{< figure src="/images/ai-commits-all-tools.png" alt="All AI coding tools weekly commits comparison" caption="AI coding agent commits per week, all tools" >}}

The all-tools chart makes the scale gap obvious but hides what's happening with everyone else. Remove Claude and the other tools have their own stories.

{{< figure src="/images/ai-commits-excluding-claude.png" alt="AI coding tools weekly commits excluding Claude" caption="AI coding agent commits per week, excluding Claude" >}}

Copilot's agent mode launched and quickly ramped to 200K+ commits per week. Cursor had a dramatic spike in late January, peaking over 200K weekly commits before dropping sharply (likely a change in their trailer behaviour rather than actual usage decline). Jules has been climbing steadily. Codex and Devin are smaller but growing.

But the data has a lot of limits.

- **This only counts public repositories.** Most enterprise development happens in private repos, and we can't see any of that. Codex or GitHub Copilot could easily be dominant behind closed doors and we'd never know.
- **The detection methods are uneven.** Claude Code adds a Co-Authored-By trailer to every commit by default. Anthropic has done a good job of making that visible, and it's basically free marketing: every public commit advertises the tool. Other tools aren't as aggressive about marking their output. Copilot's inline completions leave no trailer at all. Codex is a good example: [npm download trends](https://npmtrends.com/@anthropic-ai/claude-code-vs-@google/gemini-cli-vs-@openai/codex) show it being installed at a very high rate, but that's not showing up in commit trailers on public GitHub. That gap could mean Codex users are mostly in private repos, or that Codex doesn't tag commits as consistently, or both.
- **The GitHub search API is unreliable at this scale.** If you run the same query multiple times, you'll often get wildly different numbers back. A search for "Co-Authored-By: Claude" across the full six months might return 8 million on the first try, 16 million on the second, and then settle at around 20 million. I ran these queries until they settled, but anyone clicking the links in the tables might see something different depending on when they hit it. These numbers are estimates, not exact figures.

The data overrepresents tools that tag their output, underrepresents tools used in private repos, and misses inline completions entirely. What it does show is the trend, and the trend is hard to argue with.

## it's not just commits

Commits are the most obvious trace, but not the only one. I tracked AI bot activity across pull requests and issues too.

| Bot | PRs Commented On | PRs Reviewed |
|-----|----:|----:|
| Copilot PR Reviewer | [1,999,173](https://github.com/search?q=is%3Apr+commenter%3Acopilot-pull-request-reviewer%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [2,000,595](https://github.com/search?q=is%3Apr+reviewed-by%3Acopilot-pull-request-reviewer%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| CodeRabbit | [1,852,444](https://github.com/search?q=is%3Apr+commenter%3Acoderabbitai%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [759,541](https://github.com/search?q=is%3Apr+reviewed-by%3Acoderabbitai%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| Codex Connector | [1,129,790](https://github.com/search?q=is%3Apr+commenter%3Achatgpt-codex-connector%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [598,577](https://github.com/search?q=is%3Apr+reviewed-by%3Achatgpt-codex-connector%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| Gemini Code Assist | [691,762](https://github.com/search?q=is%3Apr+commenter%3Agemini-code-assist%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [600,541](https://github.com/search?q=is%3Apr+reviewed-by%3Agemini-code-assist%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| Copilot SWE Agent | [324,127](https://github.com/search?q=is%3Apr+commenter%3Acopilot-swe-agent%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | - |
| Cursor | [165,053](https://github.com/search?q=is%3Apr+commenter%3Acursor%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [163,495](https://github.com/search?q=is%3Apr+reviewed-by%3Acursor%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| Sourcery | [164,621](https://github.com/search?q=is%3Apr+commenter%3Asourcery-ai%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [153,160](https://github.com/search?q=is%3Apr+reviewed-by%3Asourcery-ai%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| Devin | [92,650](https://github.com/search?q=is%3Apr+commenter%3Adevin-ai-integration%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | - |
| Claude | [48,717](https://github.com/search?q=is%3Apr+commenter%3Aclaude%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) | [28,939](https://github.com/search?q=is%3Apr+reviewed-by%3Aclaude%5Bbot%5D+updated%3A2025-09-01..2026-03-28&type=pullrequests) |
| Claude Code (text marker) | [37,479](https://github.com/search?q=is%3Apr+in%3Acomments+"Generated+with+Claude+Code"+updated%3A2025-09-01..2026-03-28&type=pullrequests) | - |

{{< figure src="/images/ai-pr-interactions-6month.png" alt="AI bot PR comments over 6 months" caption="AI bot PR comments, 6-month totals" >}}

Copilot's PR reviewer has touched 2 million pull requests. CodeRabbit is close behind at 1.85 million. Codex Connector (which I only found because it showed up on one of my own repos) has commented on over a million PRs. Gemini Code Assist is reviewing 600K. These are infrastructure at this point.

PR creation:

| Tool | PRs Created (6 months) |
|------|----:|
| Dependabot | [10,993,067](https://github.com/search?q=is%3Apr+author%3Adependabot%5Bbot%5D+created%3A2025-09-01..2026-03-28&type=pullrequests) |
| Renovate | [2,804,964](https://github.com/search?q=is%3Apr+author%3Arenovate%5Bbot%5D+created%3A2025-09-01..2026-03-28&type=pullrequests) |
| Copilot SWE Agent | [1,412,476](https://github.com/search?q=is%3Apr+author%3Acopilot-swe-agent%5Bbot%5D+created%3A2025-09-01..2026-03-28&type=pullrequests) |
| Claude Code (body marker) | [1,385,322](https://github.com/search?q=is%3Apr+"Generated+with+Claude+Code"+created%3A2025-09-01..2026-03-28&type=pullrequests) |
| Jules | [269,456](https://github.com/search?q=is%3Apr+author%3Agoogle-labs-jules%5Bbot%5D+created%3A2025-09-01..2026-03-28&type=pullrequests) |
| Sweep | [66,826](https://github.com/search?q=is%3Apr+"Sweep%3A"+created%3A2025-09-01..2026-03-28&type=pullrequests) |

Setting aside dependency bots (Dependabot and Renovate, which have been doing this for years), Copilot's SWE agent and Claude Code are each creating around 1.4 million PRs over six months. About 230,000 pull requests per month, each.

On issues, AI bots are active commenters too. GitHub Actions dominates (868K issues), but CodeRabbit (36K), Claude (26K), and Dosu (24K) are all leaving commentary on issue threads.

## what this means

I tracked over 30 distinct AI bot accounts active on GitHub, and that's just the ones with public identities. Code reviewers, coding agents, security fixers, optimizers, documentation generators, issue triagers. A year ago most of these didn't exist or were experiments. Now they're part of how software gets built.

LLMs and agentic loops are writing code at scale, right now. What does this mean for the future? I honestly don't know. I don't know if the growth will even continue. Is Claude Code's lead insurmountable, or will Copilot and Codex close the gap once you account for private repos? What does it mean for the economics of software engineering? We're at over 5% of commits to public GitHub being agent-driven. That's crazy to think about.

I've been thinking about the economics of this too. I wrote about [the token salary](/the-token-salary), looking at what happens when you treat AI tokens as a line item alongside engineer compensation. Programming turns out to be overwhelmingly input-token-heavy (95%+ input), which makes the cost calculations much cheaper than most people assume. In [token slinging](/token-slinging) I looked at how token costs are reshaping software economics, similar to the early days of cloud billing. I think we're in a [transition](/transition) as significant as the shift from desktop to mobile, and the commit data is one of the clearest signals it's already happening.

All the scripts are linked above, and the raw CSV data is downloadable: [commits](/data/ai-commits-2026-03-27.csv), [PR interactions](/data/ai-pr-interactions-2026-03-28-v2.csv), [PRs created](/data/ai-prs-2026-03-28.csv), [issue comments](/data/ai-issue-comments-2026-03-28-v2.csv), and [total GitHub commits](/data/total-commits-weekly-2026-03-28.csv). Every row includes the GitHub search URL used to generate it, so you can check any number yourself.
