---
title: the prompt is the program
date: 2026-02-21T19:15:00.000Z
slug: prompt-is-the-program
authors:
  - paulkinlan
---

I built an application recently. It has a contact directory, a database, cross-referencing, topic tracking, meeting notes, project management, backup and restore, automated sync, conflict resolution, and a task queue. The entire program is a markdown file.

It's just a [`CLAUDE.md`](https://github.com/PaulKinlan/journal/blob/main/CLAUDE.md) file. It sits in a git repo with some bash scripts for plumbing, but the actual behaviour (what the system does, how it organises data, when it evolves) lives in natural language instructions. The prompt is the program.

This started from a gap in my own workflow. I used [Logseq](https://logseq.com/) every day for a long time and it worked well: markdown, daily logs, cross-references. Then I went on holiday for a couple of weeks, stopped, and never got back into it. The problem was never the app. It was the operating model. I needed memory I controlled, that worked within enterprise constraints, and that didn't lock context inside a platform.

As I spent more time with large language models, I kept coming back to a few things.

First, memory. Why is it treated as a feature when it should be the base state? And where should it live if I'm serious about keeping it mine? Most chat systems still feel built for isolated conversations. If one thread remembers the previous one, that can be a bonus, but it can also be incredibly creepy because it's not always expected. But some systems, you expect memory to be the baseline, and that's what I wanted to explore, within the constraints of it being local, private, and mine.

But there was something else. I was using LLMs to build applications, libraries, tools, services (I even [replaced most of my apps with an LLM on a trip to Japan](/super-apps)), and I noticed that sometimes a model would create a small, complete program from a single instruction to solve a very specific task. No scaffolding, no framework, just an instruction and a working result. That got me wondering: how far could you push this? Could you build systems that are emergent, where the application grows and restructures itself as the conversation continues?

So I wrote a behaviour contract in markdown and pointed an LLM at it.

The common objection is fair: prompts are too loose to count as programs. But I've started to find that high-level instructions are enough, and often better.
Here's what my [`CLAUDE.md`](https://github.com/PaulKinlan/journal/blob/main/CLAUDE.md) actually specifies:

- **Data model:** daily entries in `entries/`, people and topics indexed separately, TODOs as first-class objects, ideas and projects explicit, meetings with dedicated structure. All plain-text markdown.
- **Behaviour on input:** when the user journals something, create the daily entry, create or update any referenced topic/person/idea/TODO files, cross-link everything, update the living index. Every action produces structured state.
- **Boundaries:** personal data stays in specific folders, excluded from the public repo by policy. Private data is marked as such. The system knows what not to share.
- **Evolution:** the system is expected to change. The prompt tells the agent to propose new folder types when it notices recurring patterns, update its own conventions, and log structural changes.

The last point kinda blew my mind. The prompt tells the agent to modify itself.

Within a week of use, the system proposed a `meetings/` folder because I kept logging meetings inline. It proposed a `projects/` folder to separate active codebases from broader topics. And when I noticed I couldn't easily see which TODOs were still active, I asked the model how we might solve it. It proposed a `todos/done/` subfolder to archive completed items without losing history. Each time, it updated its own instructions to include the new convention.

The program can rewrite its own source code. Early on it happened a lot as the system found its shape. Now it happens less and less, which I think is actually a good sign. The structure has settled into something that works for me and my workflow.

That is weird, and a little bit scary, and also genuinely useful.

A concrete example: we were renovating a house and picking paint colours online. I told the journal to remember the URL, extract the colour codes, and remind me to get samples the next day. I asked a journal to do work for me on data I'd just given it. That in itself is kind of crazy.

The next day, the reminder was there. I went to the store. The store wanted [RAL codes](https://en.wikipedia.org/wiki/RAL_colour_standard), a standard colour format used across the paint industry, and couldn't use what I had from the website. I had no clue what a RAL code was and no clue how to convert it. There were [tools](https://rgb.to/ral) [online](https://hextoral.com/) that could do it, but I didn't have time. So I just asked the journal to continue the task: find the equivalent local format and convert the values.

By the time I got home, the conversion was done:

```
| Original Colour | Brand Code | Valspar Equivalent | Valspar Code |
| --------------- | ---------- | ------------------ | ------------ |
| Manchester Tan  | BM HC-81   | Rattan Basket      | 3007-10C     |
| Bleeker Beige   | BM HC-80   | Ancient Relic      | M302         |
| Shaker Beige    | BM HC-45   | Garden Rain        | V094-2       |
| Grant Beige     | BM HC-83   | Vanderbilt Beach   | V134-1       |
| Canvas Tan      | SW 7531    | Vanderbilt Beach   | V134-1       |
....
Shortened
....
| Kilim Beige     | SW 6106    | *(give SW code to mixer)* | N/A   |
| Wool Skein      | SW 6148    | *(give SW code to mixer)* | N/A   |

BM is Benjamin Moore, SW is Sherwin-Williams.
Nearby RAL matches (not exact): RAL 1013, 1014, 1015, 7032 [ shortened ......]
```

I went back to the store the following day. I learned a lot more about what RAL codes actually are and how they don't cleanly map to the colours we'd picked from the website. But the ones the system suggested were, when I checked them physically, close enough to what we needed as inspiration.

The journal wasn't storing context. It was solving the next step in a chain of work, [mashing up data across sources](/ai-powered-site-mashups) like an agent would. The prompt defined a system that could pick up a task, carry it across sessions, and act on it. Not because I wrote task-management code, but because the instructions said to.

The latest evolution: the system now suggests work it can do on its own. I have a backlog of article ideas, research tasks, and project seeds captured in the journal. The prompt instructs the agent to review these at the start of each session and suggest things it could research in the background. Gather data, find prior art, identify logical gaps, surface follow-on questions.

I didn't write a task scheduler. I wrote a sentence that said "review ideas and suggest things you could work on." And it does.

The same set of instructions works reasonably well across Claude Code, Codex, and Gemini CLI. It's not perfect, but I can use them more or less interchangeably. That's surprising. These LLM CLIs are a new kind of runtime, and the fact that a markdown file can act as a program across all of them opens up a way of building software that I hadn't really thought about before.

I'm not rejecting existing tools. Logseq is excellent. My friend [Rob Dodson](https://robdodson.me/) is doing great work at the intersection of second brain thinking and large language models. His piece on [giving his second brain a gardener](https://robdodson.me/posts/i-gave-my-second-brain-a-gardener/), his writing on [building a mobile second brain](https://robdodson.me/posts/how-i-built-my-mobile-second-brain/), and his thoughts on [why AI chatbots become gatekeepers](https://robdodson.me/posts/your-ai-chatbot-is-a-gatekeeper/) are all worth reading, and at the same time, I now have a tool that works well enough for me.

And I'll be honest: there's a good chance I fall away from this model eventually. It would be a stretch to pretend this has permanently replaced everything.

But the thing that keeps it alive is not a feature. It's the self-organising behaviour. I can type or dictate, and the system turns that into state: reminders, links, TODOs, references, context for next week. The structure emerged from use, not from upfront design.

Most people still design from the UI outward. I started with a minimal behaviour contract and let the structure emerge from what I was actually doing day to day with the system.

What surprised me is how little code I had to write. The bash scripts handle plumbing: backup, restore, merge, sync. And honestly, if I'd encoded that in the prompt too, the model could probably manage it. I just didn't have the confidence to do that at the start. The actual program, the part that decides what to do with my input and how I organise my life, is prose.

I'd really encourage people to explore this. In the last six months or so, something has shifted. Models have become dramatically better at tool calling. The concept of [agentic loops](https://sketch.dev/blog/agent-loop) has developed far enough that you can keep these systems on rails, at least for simple enough use cases. We've hit a point we've never been at before: you can build a real, useful system by having a conversation with an LLM and writing down the instructions for how it should behave. No framework, no app store, no deployment pipeline. Just prose, an LLM as a runtime, and a loop. I can imagine more and more people starting to think about building programs, automations, and personal systems this way.
