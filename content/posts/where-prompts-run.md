---
title: where prompts run
date: 2026-04-24T11:10:00.000Z
slug: where-prompts-run
draft: true
authors:
  - paulkinlan
---

I've been thinking a lot about [the prompt is the program](/prompt-is-the-program) since I wrote about it in February. That post was me working out the thesis. The months since have been me working out the runtime, and the runtime question turns out to be the interesting one. I keep writing small agent harnesses, the same loop, the same way to store and retrive memory, and a markdown prompt that is mostly the same, and yet each one ends up being a different kind of project.

Every Monday morning I get an email telling me what happened last week in the Chinese web development ecosystem. It not a newsletter I subscribed to. It was my own agent reading the open web on my behalf, and emailing me a digest. The same inbox also has weekly notes on Passkeys, WASM, HTML-in-Canvas, on OpenClaw, and many other topics I'm tracking. I didn't write a scraper. I didn't wire up RSS. I forwarded a handful of newsletters to an address on [emaila.gent](https://emaila.gent), a service I run where mail to any alias spins up a sandboxed agent that reads, "thinks", and replies. It gobbles tokens like crazy and costs me a pretty penny. But I get to say that "I'm interested in these topics, track them, tell me what's new each week," and it does.

[emaila.gent](https://emaila.gent) came out of my thinking when I wrote about in [email, the web's forgotten medium](https://paul.kinlan.me/email-the-webs-forgotten-medium/) and "the prompt is the program": if you trust the prompt to be the program, an email address is the easiest way to distribute and sandbox as you're going to get. So I built a servivec that you send a mail to, it spins up a sandboxed agent for that alias, the agent reads, thinks, and replies, and then saves it's memory.

Emaila.gent is the tool that does most of my research now. Part of my job in developer relations is understanding what's happening in the ecosystem for every area my team supports, and the ecosystem moves fast enough that I can't read everything myself. I also care about plenty of areas my team doesn't cover, and keeping even a loose picture of those helps me have better conversations about prioritization and resourcing. So I forward the interesting newsletters to aliases on emaila.gent, tell each one what context to hold onto and what topics to track, and let it pull the signal out. Every week I get back a summary that's better shaped than anything I'd have assembled by reading directly, and I end up with a usable picture of what's actually happening across the ecosystem.

I then made [mix.email](https://mix.email) when I wanted to explore the concept that an email address is its own application. Its prompt defines the scope, the behaviour, and everything else about what that address does. Each sender to that alias gets their own sandbox on top, with the alias's prompt as the guide and their own state accumulating over time. It's a platform where the programs are prose and the distribution is sending email. It's great for my F1 addiction.

Actually as a total aside, my "F1" agent is surprisingly good. The first interaction is to ask you what your favourite team is, your favourite driver, and what kind of news you want, and then it's completely personalised to you after that.

Mostly I wanted to know what applications look like if you take "the prompt is the program" seriously. There are real open questions in that direction. What happens when a sender pushes an alias into something it wasn't designed to do? I don't have clean answers to that. It's an interesting experiment for now.

I've also got a huge number of local programs: a securutiy checker, tone-cheker, deep-researcher, todo-logger, my journal... All of them have the shape, so naturally I wanted to build my own harness. It turns out Harness's (Harnessi?) are the new TodoMVC - gotta build your own.

[agent-do](https://github.com/PaulKinlan/agent-do) is the abstraction the pattern in this article. I wrote it as glue around the provider SDKs because I didn't want every project tied to Anthropic's agent SDK. Having the ability to have one library that let me write the agent once and swap the model and the tools underneath is incredibly useful. That's what agent-do turned into: a provider-agnostic loop with first-class tools, skills, lifecycle hooks, memory stores, and a master/worker orchestrator. You pass in a model, a set of tools, a system prompt, and a task. The loop does the rest.

What the harness actually is, when you strip it down, turns out to be pretty simple. A loop. A way for the model to call tools. A place to keep state. A boundary around what the agent can see and do. Everything above that is user space.

The boundary between "the OS" and user space is the one I keep getting stuck on. I've argued before that [the browser is the sandbox](/the-browser-is-the-sandbox), because nothing else has put as much work into isolating arbitrary code from the real machine. Agents need an equivalent story and I don't think it quite exists yet. V8 is an isolation boundary for untrusted JavaScript. What we're doing with agents is running untrusted prose, which is a stranger kind of code, and right now we're running it in whatever environment happens to be convenient. A V8-shape for prompt-programs, specifically inside the browser, feels like one of the larger missing pieces.

The other primitive I keep thinking about is how the agent knows when to do something. "Send it a message in a chat window" is the default, but the richer channels are the interesting ones. Email is one: a message arrives at an alias and the agent wakes. Time is another: a scheduled tick every thirty minutes, every hour, once a day. When I run agent-do as a shell command, I can tell it to watch a folder and react when a file changes. The more I build agents, the less I chat with them. I want them to pick up context from what I'm already doing, and act when something happens, rather than me typing at a prompt every time.

The browser is the host where this gets most interesting (for me at least), because the set of things that can wake an agent there is enormous. A page navigation is a trigger. A tab update is a trigger. A right-click on selected text is a trigger. A newly-created bookmark could wake the agent and ask it to summarise the page. Chrome alarms can schedule work on a cadence. Commands, omnibox entries, context-menu clicks, download completions, idle state changes, all of those are valid reasons for a prompt to run, and the same harness can sit behind all of them and wake up for whichever ones the prompt cares about.

I imagine we can go one step further and offer proactive suggestion based on the patterns of how you use the browser or navigate the web. It's not a big leaps to look at your own browser history for the last month and detect patterns: You open the same tab at the same time every day. You search for the same kind of thing on Fridays. You follow the same click path through the same site most weeks. A proactive runtime could offer to do any of that for you, at the right moment... Anyway, I think I'm arguing that the future doesn't need to be chat-centric.

If the prompt is the program, how do we distribute it?

The other thing worth noticing about the browser is that it already has a pretty good packaging format for this kind of program. A Chrome extension is a `.crx` file, which is a zip containing a manifest, some HTML, some JavaScript, a few images. The manifest declares entry points and permissions. The service worker (in MV3) is event-driven, sandboxed, can't touch the DOM, can't call the network beyond the hosts listed in the manifest, can't evaluate inline scripts under its CSP, and wakes up on schedule when a `chrome.alarms` event fires. If you squint, that is an agent runtime someone already built. All you need to do is drop a prompt into the zip, point a generic loop at it, and let the browser enforce the boundary.

I put together a small demo to check whether this feels as clean as it sounds. It does. The extension is called [prompt-in-a-box](https://github.com/PaulKinlan/prompt-in-a-box). The whole implementation is about 500 lines of JavaScript, not counting the agent-do library it depends on. The behaviour lives in `prompt.md`, and that is the only user-writable file, because the prompt is the program. The shipped example is a tab-hygiene agent: every thirty minutes it looks at the open tabs, and if there are more than twenty, it sends a desktop notification suggesting the oldest few to close. Swap `prompt.md` for a different set of instructions and the same extension becomes a completely different tool. The manifest decides what the prompt is allowed to reach. The CRX format provides the sandbox. The alarm provides the schedule. `chrome.storage` and OPFS provide the memory. I wrote almost no new infrastructure.

Given the correct security and privacy guardrails, we have a world where anyone can be a developer.

The more I play with CRX files, the more I wonder if the format itself is the right shape for packaging prompt-programs in general. A `.crx` is a signed zip with a manifest that declares entry points and permissions, and the browser already knows how to verify it, install it, update it, and enforce the boundary it declares. I don't have to ship a Dockerfile. I don't have to write sandboxing configuration. The distribution channel, the permission system, and the update mechanism are all there. A `.crx` with a prompt inside is a small self-contained statement of "here is what the agent should do, and here is what it's allowed to touch", and the host either accepts those permissions or refuses them. Other runtimes could, in principle, read the same bundle. You'd need a manifest the shell also understood, and you'd need the other hosts to know how to enforce the permissions declared inside, but none of that is hypothetical. The hard parts already exist. Somebody just has to agree on the shape.

The one thing that I haven't reconciled yet is if people will expect consistent routines, or self adapting "emergent" behaviour.

1. The extension demo above is that the iniatil prompt doesn't evovle. Yes, the stored data can influence the output (like my F1 app), but the prompt itself doesn't change. But it's behaviour is more like a traditional "deterministic" program or macro. It's aims to do the same thing every time.
2. My Jouranl app, on the other hand, is designed to evolve. The prompt is written in a way that encourages it to rewrite itself as it learns about the user and their habits, and it adapts over time to the extent it now offers to proactively bvuild things for me.


[TODO: WORK OUT WHERE TO PUT THIS]

{{< iframe "/where-prompts-run-demo/" "920" >}}

