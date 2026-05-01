---
title: where to run my agent loop?
date: 2026-04-24T11:10:00.000Z
slug: where-prompts-run
draft: true
authors:
  - paulkinlan
---

Knowing what is happening on in the web development ecosystem is a critical part of my job in Chrome DevRel, so every Monday morning I get an emails telling me what happened last week in the Chinese web development; the state of Passkeys; WASM; HTML-in-Canvas; the Prompt API; AI Coding tools; OpenClaw, and many other topics I'm tracking - a lot of what I'm tracking there are no newsletters or ecosytem-experts that publish this information and so pulling this together manually is a huge lift. I took the ideas and agent-loop in "[The prompt is the program](/prompt-is-the-program)" and brought it into reality with a tool called [emaila.gent](https://emaila.gent). You create your own agent by emailing it and it will adapt to what you need. I mostly send it newsletters and ask it to track the concepts and topics mentioned in it and it does, and that's how I get my emails. It's 99% the same as the Journal in the "prompt is a program".

This wasn't the only project where I use the [same agent + memory + tools loops](https://code.claude.com/docs/en/agent-sdk/agent-loop). I keep writing the same small agent harness for every project I've done recently. I use literally the same loop and the same way to access memory, with a markdown prompt that is mostly the same. And yet the small variations of the prompt and the stored data mean that projects end up being a different kind of thing.

For example, I built [mix.email](https://mix.email) as an experiment to explore the concept that an email address is its own application. It's the same loop as the Journal and Emaila.gent, with an addition to the prompt to the scope, the behaviour, and everything else about what that app does. Each sender to that alias gets their own sandbox on top, with the alias's prompt as the guide and their own state accumulating over time. I've got an app that tells me weekly about my sons' favourite football team, and it's great for my F1 addiction (the first interaction asks you what your favourite team is, your favourite driver, and what kind of news you want, and then it's completely personalised to you after that).

Using the same loop, I've then got tools that do basic security audits, performance audits, deep research, todo logger, anyway, I think you get the idea.

My agent loop started with Anthropics AgentSDK, which is very good but locked me into Anthropic and given that I've used Vercel's `ai-sdk` in every project recently I decided to build my own Agent harness that had a pluggable model system.

[agent-do](https://github.com/PaulKinlan/agent-do) is the abstraction of the pattern in this article (it's not sandboxed, so be warned). I wrote it as glue around the provider SDKs because I didn't want every project to be locked to one vendor. Having the ability to have one library that let me write the agent once and swap the model and the tools underneath is incredibly useful. And that's what we have: a provider-agnostic loop with first-class tools, skills, lifecycle hooks, memory stores, and a master/worker orchestrator. You pass in a model, a set of tools, a system prompt, and a task. The loop does the rest.

The most basic version of that loop running in a browser is a web version of the Journal that I mentioned in [the prompt is the program](/prompt-is-the-program):

{{< iframe "/where-prompts-run-demo/" "920" >}}

I like this demo, but it is just a proof of concept of what you can do with one of these agent loops at a very basic level. The demo above has OPFS tools (read, write, list), one markdown system prompt, the same iterate-until-done shape that agent-do abstracts. It works suprisingly well. Tell it something about your day and it decides which files to create or update.

What gets me about this little demo is how much of the application lives in the prose. Go back to the system prompt panel above and rewrite it, and the application changes with it, without touching a line of code. Tell it to behave like a research assitant and it will search the web for you and analyse the results... Same loop, same handful of tools, same runtime. Different program every time. I think it's pretty incredible that we have self-modifying software.

What I'm doing here with my agents is running untrusted prose, which is now 'code', in whatever environment happens to be convenient and on one hand it's amazing that I've got such a portable, flexible and easily adaptable system, but on the other... damn, it's dangerous.

There's two areas that I want to further explore in this post:

1) sandboxing
2) packaging

While `codex` or `claude` or `gemini-cli` all have sandboxing, I really don't want it to be up to them. Maybe I was wrong about "[the browser is the sandbox](/the-browser-is-the-sandbox)" - yes, no other platform has put as much work into isolating arbitrary code from the real machine, but with the web's permission model being relatively permissive by default (you have to restrict vs open up), I think it's going to work less well when the program is an agent. The tools an agent uses (search, file-write, send-email) aren't really *of* any origin in the sense of the web... The `WebFetch` and `WebSearch` tools are the offspring of `crossorigin=anonymous` and a Proxy Server that was birthed to get around a heap of the web's security model... But it made me realise that every single agent that I've built is more akin to a hyper-specialized User-Agent than a site. My browser (user-agent) has access to all of the sandboxes of the pages that I visit and it mediates the access. The way that I'm building Agents right now, they need the context across sessions, data-sources, tabs.... 

V8 created an isolation boundary for untrusted JavaScript from any random page or script, and it really does feel like we need a V8-shaped sandbox for these agent-loops.

The more I build agents, the less I chat with them and the more I want them to pick up context from what I'm already doing, and act when something happens.
For example, I might want an agent to understand email, so when a message arrives at an alias, the agent wakes and does some work. Time is another: a scheduled tick every thirty minutes, every hour, once a day. When I run `agent-do` as a shell command, I can tell it to watch a folder and react when a file changes. When I bookmark something in the browser... 

The browser now has many of these hooks to let me do all of those things without needing to install a new runtime for each one, I've come to realise that while [co-do.xyz](https://co-do.xyz) is a fun proof-of-concept of the browser being good sandbox, it's not particularly useful at acting like an agent because it only responds to a user prompt and not other environmental prompts that you might expect an agent to be able to react to.

I think a useful agent is more likely to be something like a Chrome Extension.

The browser is the host where this gets most interesting (for me at least), because the set of things that can wake an agent there is enormous. A page navigation is a trigger. A tab update is a trigger. A right-click on selected text is a trigger. A newly-created bookmark could wake the agent and ask it to summarise the page. Chrome alarms can schedule work on a cadence. Commands, omnibox entries, context-menu clicks, download completions, idle state changes, all of those are valid reasons for a prompt to run, and the same harness can sit behind all of them and wake up for whichever ones the prompt cares about.

I imagine we can go one step further and offer proactive suggestions based on the patterns of how you use the browser or navigate the web. It's not a big leap to look at your own browser history for the last month and detect patterns: You open the same tab at the same time every day. You search for the same kind of thing on Fridays. You follow the same click path through the same site most weeks. A proactive runtime could offer to do any of that for you, at the right moment... Anyway, I think I'm arguing that the future doesn't need to be chat-centric.

If the prompt is the program, how do we distribute it?

The other thing worth noticing about the browser is that it already has a pretty good packaging format for this kind of program. A Chrome extension is a `.crx` file, which is a zip containing a manifest, some HTML, some JavaScript, a few images. The manifest declares entry points and permissions. The service worker (in MV3) is event-driven, sandboxed, can't touch the DOM, can't call the network beyond the hosts listed in the manifest, can't evaluate inline scripts under its CSP, and wakes up on schedule when a `chrome.alarms` event fires. If you squint, that is an agent runtime someone already built. All you need to do is drop a prompt into the zip, point a generic loop at it, and let the browser enforce the boundary.

I put together a small demo to check whether this feels as clean as it sounds.  The extension is called [prompt-in-a-box](https://github.com/PaulKinlan/prompt-in-a-box). The whole implementation is about 500 lines of JavaScript, not counting the agent-do library it depends on. The behaviour lives in `prompt.md`, and that is the only user-writable file, because the prompt is the program. The shipped example is a tab-hygiene agent: every thirty minutes it looks at the open tabs, and if there are more than twenty, it sends a desktop notification suggesting the oldest few to close. Swap `prompt.md` for a different set of instructions and the same extension becomes a completely different tool. The manifest decides what the prompt is allowed to reach. The CRX format provides the sandbox. The alarm provides the schedule. `chrome.storage` and OPFS provide the memory. I wrote almost no new infrastructure.

Given the correct security and privacy guardrails, we have a world where anyone can be a developer.

The more I play with CRX files, the more I wonder if the format itself is the right shape for packaging prompt-programs in general. A `.crx` is a signed zip with a manifest that declares entry points and permissions, and the browser already knows how to verify it, install it, update it, and enforce the boundary it declares. I don't have to ship a Dockerfile. I don't have to write sandboxing configuration. The distribution channel, the permission system, and the update mechanism are all there. A `.crx` with a prompt inside is a small self-contained statement of "here is what the agent should do, and here is what it's allowed to touch", and the host either accepts those permissions or refuses them. Other runtimes could, in principle, read the same bundle. You'd need a manifest the shell also understood, and you'd need the other hosts to know how to enforce the permissions declared inside, but none of that is hypothetical. The hard parts already exist. Somebody just has to agree on the shape.

I just don't think we are there right now.

Services today are starting to offer MCP Servers to enable tools so they can be called by the agents and it works reasonably well, but it still seems one-way. My agent asks your service to do something. I want my agent to be told that something has changed. MCP has the concept of [Notifications](https://modelcontextprotocol.io/docs/learn/architecture#notifications) it's not really used and it seems to be more about state changes to the server (such as tool list updates) vs changes to application state.

I expect that the next level of agent integration is that apps and services will offer their own "agent-runtime", that is you will be able to extend an application like you can with Chrome Extensions or Google AppScript, but instead of JavaScript you just include a prompt and the applications agent-runtime will work out which APIs to call and events to listen to. Effectively my prompt-in-a-box will a pattern that many apps offer.

The final level and one that we are missing is a way for my agent to recieve updates about changes in applications and across the user's operating system. Chrome has a very robust extension system, and it's relatively easy to build an agent that responds to some action happening in the browser that my agent can then consume and proactively work on. It's incredibly empowering to have this emergent system react to what I'm working on.

It's almost like we need the concept of `<iframe>` but for agents.

After building `agent-do` and using it enough and having a quiet shelf of small prompt-programs running in the background, learning the rhythm of how I work in the browser is convincing enough that I'm not going back, so I've tried to collate my beliefs. 

1) **I'm conviced that this agent-loop is here to stay** and will be a major way that most people build for their computers. I haven't reconciled yet is if people will expect consistent routines, or self adapting "emergent" behaviour. Will these prompts be more like a traditional "deterministic" program or macro. It aims to do the same thing every time, but written in plain langauge and given enough freedom to manage changes in the syhstem it's working on top of - or - is will people want agents that are more like my Journal app which is designed to evolve and self modify where the prompt is written in a way that encourages it to rewrite itself as it learns about the user and their habits, and it adapts over time to the extent that it now offers to proactively build things for me.
2) **A portable agent format is needed**. The same primitives keep showing up across all of these projects. The agent loop. The system prompt, which is both the instructions and, for the more emergent agents, a description of how the program is meant to evolve. Memory, in whatever form. Skills. Hooks, by which I mean system-level events: timers, browser events, file changes, the kind of triggers I described earlier. Permissions... I want to be able to run them anywhere: in chrome, on my machine, on the server so it's always on.
3) **We need a way to embed or discover the user's system-agents** and commuicate with them in a push and pull manner. There's no way I'm setting up webhooks for every service to get updates, and MCP isn't enough.

I can totally imagine a world where deploying an agent would stop being a software project and start to look more like publishing a document, and what better place than the web to publish and discover.


