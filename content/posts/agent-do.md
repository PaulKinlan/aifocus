---
title: >
  agent-do: my agent loop
date: 2026-05-01T11:10:00.000Z
slug: agent-do-my-agent-loop
authors:
  - paulkinlan
---

Knowing what is happening on in the web development ecosystem is a critical part of my job in Chrome DevRel, so every Monday morning I get an emails telling me what happened last week in the Chinese web development; the state of Passkeys; WASM; HTML-in-Canvas; the Prompt API; AI Coding tools; OpenClaw, and many other topics I'm tracking - a lot of what I'm tracking there are no newsletters or ecosytem-experts that publish this information and so pulling this together manually is a huge lift. I took the ideas and agent-loop in "[The prompt is the program](/prompt-is-the-program)" and brought it into reality with a tool called [emaila.gent](https://emaila.gent). You create your own agent by emailing it and it will adapt to what you need. I mostly send it newsletters and ask it to track the concepts and topics mentioned in it and it does, and that's how I get my emails. It's 99% the same as the Journal in the "prompt is a program".

This wasn't the only project where I use the [same agent + memory + tools loops](https://code.claude.com/docs/en/agent-sdk/agent-loop). I keep writing the same small agent harness for every project I've done recently. I use literally the same loop and the same way to access memory, with a markdown prompt that is mostly the same. And yet the small variations of the prompt and the stored data mean that projects end up being a different kind of thing.

For example, I built [mix.email](https://mix.email) as an experiment to explore the concept that an email address is its own application. It's the same loop as the Journal and Emaila.gent, with an addition to the prompt to the scope, the behaviour, and everything else about what that app does. Each sender to that alias gets their own sandbox on top, with the alias's prompt as the guide and their own state accumulating over time. I've got an app that tells me weekly about my sons' favourite football team, and it's great for my F1 addiction (the first interaction asks you what your favourite team is, your favourite driver, and what kind of news you want, and then it's completely personalised to you after that).

Using the same loop, I've then got tools that do basic security audits, performance audits, deep research, todo logger, anyway, I think you get the idea.

My agent loop started with Anthropic's AgentSDK, which is very good but locked me into Anthropic and given that I've used Vercel's `ai-sdk` in every project recently I decided to build my own Agent harness that had a pluggable model system.

[agent-do](https://github.com/PaulKinlan/agent-do) is the abstraction of the pattern in this article (it's not sandboxed, so be warned). I wrote it as glue around the provider SDKs because I didn't want every project to be locked to one vendor. Having the ability to have one library that let me write the agent once and swap the model and the tools underneath is incredibly useful. And that's what we have: a provider-agnostic loop with first-class tools, skills, lifecycle hooks, memory stores, and a master/worker orchestrator. You pass in a model, a set of tools, a system prompt, and a task. The loop does the rest.

```JavaScript
import { createAgent } from 'agent-do';
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const agent = createAgent({
  id: 'researcher',
  name: 'Researcher',
  model: anthropic('claude-sonnet-4-6'),
  systemPrompt: 'You are a research assistant. Be thorough.',
  tools: {
    // ... your tools here
  },
});

for await (const event of agent.stream('Tell me about Paris')) {
  switch (event.type) {
    case 'thinking':
      process.stdout.write(event.content);
      break;
    case 'tool-call':
      console.log(`Calling ${event.toolName}`, event.toolArgs);
      break;
    case 'tool-result':
      console.log(`Result from ${event.toolName}:`, event.toolResult);
      break;
    case 'text':
      console.log('Agent says:', event.content);
      break;
    case 'step-complete':
      console.log(`Step ${event.step! + 1} complete`);
      break;
    case 'done':
      console.log('Final answer:', event.content);
      break;
    case 'error':
      console.error('Error:', event.content);
      break;
  }
}
```

The most basic version of that loop running in a browser is a web version of the Journal that I mentioned in [the prompt is the program](/prompt-is-the-program):

{{< iframe "/where-prompts-run-demo/" "920" >}}

I like this demo, but it is just a proof of concept of what you can do with one of these agent loops at a very basic level. The demo above has OPFS tools (read, write, list), one markdown system prompt, the same iterate-until-done shape that agent-do abstracts. It works suprisingly well. Tell it something about your day and it decides which files to create or update.

What gets me about this little demo is how much of the application lives in the prose. Go back to the system prompt panel above and rewrite it, and the application changes with it, without touching a line of code. Tell it to behave like a research assitant and it will search the web for you and analyse the results... Same loop, same handful of tools, same runtime. Different program every time. 

Because `agent-do` is a simple library, if you are not interested in programming, that's ok. The same agent loop can be used from the CLI with the same instructions (warning: it's not sandboxed).

For example, you can crate an agent on your system

```bash
# Create a reusable agent
npx agent-do create code-reviewer --provider anthropic --system "Review code for bugs"
```

And then you can run it.

```bash
# Run a saved agent by name
npx agent-do run code-reviewer "Review all the files in $(cwd)"
```

And if you want it to remember and use state from previous runs as it builds up knowledge about you, you can run it `--with-memory`.

```bash
# Run a saved agent by name
npx agent-do run code-reviewer "Review all the files in $(cwd)" --with-memory
```

Agent-do isn't new, there's lots of agent-loops and agent harnesses ([pi](https://github.com/badlogic/pi-mono) for example), but I think it's pretty incredible that we have self-modifying software *and* **a portable program** (the agent's instruction) *and* the start of a runtime.

I'm also very happy that I've built some infrastructure that I use across all my projects now.