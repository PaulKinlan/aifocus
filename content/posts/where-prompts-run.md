---
title: shipping a prompt
date: 2026-04-24T11:10:00.000Z
slug: where-prompts-run
draft: true
authors:
  - paulkinlan
---

If the majority of my app is just a prompt, then I have a very transportable program. The agent loop is the same everywhere ([I have my own one](/agent-do-my-agent-loop) but there are dozens). The memory is a few hundred kilobytes of files. The system prompt is a markdown document. I can take that bundle and run it on a server, in an email host, in a browser, on my laptop. The portability of the program isn't really in question.

But shipping one is more than moving the prompt around. The prompt has dependencies. The skills it references live somewhere. The tool definitions need to be present at runtime. Any supplementary scripts the prompt expects to call have to ship with it. And before any of that runs, there is the question of what the program is allowed to touch on the host machine. A prompt I trust on my laptop is not a prompt I want a stranger's email server running with file-system access, no questions asked.

What I'm doing here with my agents is running untrusted prose, which is now 'code', in whatever environment happens to be convenient. On one hand it's amazing that I have such a portable, flexible, easily adaptable system. On the other... damn, it's dangerous.

There's two areas I want to dig into:

1. **sandboxing**: what the program is allowed to do once it's running.
2. **packaging**: how the program, its skills, and its declared permissions get from me to the host that runs it.

## Sandboxing

`codex`, `claude`, and `gemini-cli` all do their own sandboxing, and I really don't want it to be up to them. Maybe I was wrong about [the browser is the sandbox](/the-browser-is-the-sandbox). No other platform has put as much work into isolating arbitrary code from the real machine, but the web's permission model is permissive by default (you have to restrict, not open up) and it's tied to an origin. The tools an agent uses (search, file-write, send-email) aren't really *of* any origin in the sense of the web. The `WebFetch` and `WebSearch` tools are the offspring of `crossorigin=anonymous` and a proxy server that was birthed to get around a heap of the web's security model. Every agent I've built behaves more like a hyper-specialised User-Agent than a site. My browser already has access to all the sandboxes of the pages I visit and it mediates that access. The way I'm building agents right now, they need that same view across sessions, data sources, and tabs.

V8 created an isolation boundary for untrusted JavaScript from any random page or script. It really does feel like we need a V8-shaped sandbox for the agent loop.

It's worth holding the existing permission models up next to each other, because each of them gets part of this story right.

**Chrome extensions** are declarative. The manifest lists every Chrome API the extension touches and every URL it can reach. The user sees that list at install time and either accepts the bundle or rejects it. Optional permissions can be requested at runtime via `chrome.permissions.request`. The CSP, declared in the same manifest, locks down what scripts run and what origins the extension can connect to. The browser enforces all of it.

**Deno** is deny-by-default. You start the program with explicit flags (`--allow-net`, `--allow-read`, `--allow-write`) and you can scope them: `--allow-net=api.openai.com,api.anthropic.com`. The runtime can prompt the user interactively when the program asks for a capability it wasn't started with. Deno 2.6 added more granular permissions, and Node has since adopted a similar model with opt-in `--allow-*` flags of its own.

**Cloudflare Workers** uses bindings rather than permissions. `wrangler.toml` declares the KV namespaces, D1 databases, R2 buckets, queues, services, and outbound network policies the Worker is allowed to reach. There is no runtime grant. Everything is configured at deploy time, and V8 isolates handle the cross-Worker boundary. The dynamic Workers and dedicated agent-sandbox providers that shipped this year (E2B, Modal, Vercel Sandbox, Firecrawl, Northflank) build on roughly the same idea.

**OpenAI's sandbox agents** declare a `Capabilities` list (`Shell`, `Filesystem`, `Skills`, `Memory`) on the agent definition. The runtime grants only what's listed, workspace paths can't escape the sandbox, and sensitive operations (auth, billing, audit) are kept in the harness, outside what the model can reach.

What all of these share is that the host enforces the boundary, and the program declares what it needs upfront. None prompt the user for individual operations the way an OS file picker does. None let the program escalate beyond what the manifest, the flags, or the bindings declared. That's the shape that's missing for prompt-programs running in random Node processes today, and it's why I keep coming back to the conclusion that a useful agent is more likely to look like a Chrome Extension than a normal web app.

## Packaging

If the prompt is the program, how do we distribute it?

The other thing worth noticing about the browser is that it already has a pretty good packaging format for this kind of program. A Chrome extension is a `.crx` file, which is a zip containing a manifest, some HTML, some JavaScript, a few images. The manifest declares entry points and permissions. The service worker (in MV3) is event-driven, sandboxed, can't touch the DOM, can't call the network beyond the hosts listed in the manifest, can't evaluate inline scripts under its CSP, and wakes up on schedule when a `chrome.alarms` event fires. If you squint, that is an agent runtime someone already built. All you need to do is drop a prompt into the zip, point a generic loop at it, and let the browser enforce the boundary.

I put together a small demo to check whether this feels as clean as it sounds. The extension is called [prompt-in-a-box](https://github.com/PaulKinlan/prompt-in-a-box). The whole implementation is about 500 lines of JavaScript, not counting the agent-do library it depends on. The behaviour lives in `prompt.md`, and that is the only user-writable file, because the prompt is the program. The shipped example is a tab-hygiene agent: every thirty minutes it looks at the open tabs, and if there are more than twenty, it sends a desktop notification suggesting the oldest few to close. Swap `prompt.md` for a different set of instructions and the same extension becomes a completely different tool. The manifest decides what the prompt is allowed to reach. The CRX format provides the sandbox. The alarm provides the schedule. `chrome.storage` and OPFS provide the memory. I wrote almost no new infrastructure.

Given the correct security and privacy guardrails, we have a world where anyone can be a developer.

The more I play with CRX files, the more I wonder if the format itself is the right shape for packaging prompt-programs in general. A `.crx` is a signed zip with a manifest that declares entry points and permissions, and the browser already knows how to verify it, install it, update it, and enforce the boundary it declares. I don't have to ship a Dockerfile. I don't have to write sandboxing configuration. The distribution channel, the permission system, and the update mechanism are all there. A `.crx` with a prompt inside is a small self-contained statement of "here is what the agent should do, and here is what it's allowed to touch", and the host either accepts those permissions or refuses them. Other runtimes could, in principle, read the same bundle. You'd need a manifest the shell also understood, and you'd need each host to know how to enforce the permissions declared inside, but none of that is hypothetical. The hard parts already exist.

I just don't think we are there right now.

Services today are starting to offer MCP servers to expose tools so agents can call them, and that works reasonably well, but it still seems one-way. My agent asks your service to do something. I want my agent to be told that something has changed. MCP has the concept of [notifications](https://modelcontextprotocol.io/docs/learn/architecture#notifications), but it isn't really used and it seems to be more about state changes to the server (such as tool list updates) than about changes to application state.

I expect that the next level of agent integration is that apps and services will offer their own "agent-runtime", that is, you'll be able to extend an application like you can with Chrome Extensions or Google Apps Script, but instead of JavaScript you just include a prompt and the application's agent-runtime will work out which APIs to call and which events to listen to. Effectively, prompt-in-a-box becomes a pattern that many apps offer.

The final piece, and the one we're missing, is a way for my agent to receive updates about changes in applications and across the user's operating system. Chrome has a very robust extension system, and it's relatively easy to build an agent that responds to some action happening in the browser that my agent can then consume and proactively work on. It's empowering to have this emergent system react to what I'm working on.

It's almost like we need the concept of `<iframe>`, but for agents.

After building agent-do, using it enough, and having a quiet shelf of small prompt-programs running in the background and learning the rhythm of how I work in the browser, I'm not going back. So I've tried to collate my beliefs.

1. **The agent-loop is here to stay** and will be a major way most people build for their computers. What I haven't reconciled yet is whether people will expect consistent routines or self-adapting "emergent" behaviour. Will these prompts be more like a traditional deterministic program or macro, written in plain language and given enough freedom to handle changes in the system it's working on top of? Or will people want agents more like my journal app, where the prompt is written to encourage it to rewrite itself as it learns about the user, and adapts over time to the point of proactively offering things?
2. **A portable agent format is needed**. The same primitives keep showing up across all of these projects. The agent loop. The system prompt, which is both the instructions and, for the more emergent agents, a description of how the program is meant to evolve. Memory, in whatever form. Skills and supplementary scripts. Hooks (timers, browser events, file changes, the kind of triggers I described earlier). Permissions. I want to be able to run them anywhere: in Chrome, on my machine, on a server so they're always on.
3. **We need a way to embed and discover the user's system-agents** and communicate with them in a push and pull manner. There's no way I'm setting up webhooks for every service to get updates, and MCP isn't enough.

I can totally imagine a world where deploying an agent stops being a software project and starts to look more like publishing a document. And what better place to publish and discover than the web.
