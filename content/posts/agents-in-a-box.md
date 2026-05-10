---
title: a business in a box
date: 2026-05-10T20:00:00.000Z
slug: business-in-a-box
draft: true
authors:
  - paulkinlan
---

Before Google, I worked at a small telecoms company in Liverpool called Qire (legally Direct Data Services, but everyone called it Qire). It was an interesting company and I'd just gone from working in a big slow corporate building Fraud Detection systems to a small company that had to be pretty nimble. It had maybe 15 people in total. We ended up building [voice interaction systems](/llm-whisperer), automated outbound calling, SMS campaigns, data processing and the like. I built reporting, call record management, web infrastructure, and helped wire some of these systems together. It was also one of my most productive periods as a developer, where I built a lot of side-projects that would ultimately be one of the reasons why I could get into Google.

I could see every role from where I sat. Account managers, marketing, accounts receivable, accounts payable, the support engineer, project managers, the person who managed the phone infrastructure, and all the salespeople working through their clients right next to me. Every single role was in the same room. What struck me was that each role was relatively well defined, but people could swap between them when someone was out. Most of the original people knew the business well enough to understand what other people's roles were and what they would do. Interestingly, they communicated mostly over email or by shouting across the office, and the whole thing worked because it was small enough that everyone had enough context to make decent decisions.

This post has been sitting with me for the last couple of months as I explore what agents can do and how we might deploy them. It started with me running `claude` as my login-shell on my Linux box and finding it surprisingly good at managing many of the tasks I need to do. That led me to a question: what if every user on a machine were an agent?

Like my post [The Browser is the sandbox](/the-browser-is-the-sandbox/), where I was asking how much new infrastructure we actually need to run an LLM, my first port of call was to look at the tools I use every day: Linux. My hunch was that Unix-based systems already have a good, well-established account, security and permissions model, with comprehensive sandboxing available if required, which might be enough.

I've been running an experiment called [docker-agent-test](https://github.com/PaulKinlan/docker-agent-test) with my pal [Elias Helou](https://www.linkedin.com/in/eh-veso/). The setup is this: a single Docker container running Arch Linux with systemd, and inside it, multiple agents built using the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), each running as a separate Linux user. Each agent has its own home directory, its own mailbox, its own persona defined in a markdown file, and a systemd service that runs it in a loop. They communicate with each other over email (using OpenSMTPD and Maildir).

When I say "each agent is a Linux user," I mean it literally. When I run `make create [name]` it will run `useradd` and create the account. The agent's role and purpose are stored in the GECOS field of `/etc/passwd`, so other agents can discover what their colleagues do by running `getent passwd`. They share a `/home/shared/` directory for artifacts and a task board. They can't sudo. They can't write outside their home directory. They're sandboxed the same way any unprivileged user on a Unix system is. That said, this isn't using process isolation like `cgroups` etc.

The whole thing is managed through `make`. Here's the command surface I use day to day:

* `make build` creates the system
* `make up` starts the system
* `make down` stops the system
* `make create <name> --persona coder` creates a user with the uid `<name>` and sets up the default prompts for the coder persona (there are a lot of other personas)
* `make task-add` adds a task to the shared board for the best agent to pick up
* `make send <user> "<message>"` sends the user an email and gets them to start work
* `make tui` runs the text UI that makes it easier to set up

The email part is what reminded me of Qire. At the Liverpool office, email was how work actually moved. A client would email in a request, someone would pick it up, do the work, email back. Internally, we'd email each other tasks, status updates, questions. The email thread was the project management system. Nobody opened Jira. The inbox was the to-do list.

In docker-agent-test, it works the same way. When a task's dependencies are satisfied, the orchestrator emails the assigned agent: "your blockers are clear, here's what you need to do." The agent reads its mail, does the work, publishes artifacts to the shared directory, and the orchestrator picks up the completion and notifies the next agent downstream. If an agent needs something installed and doesn't have sudo, it does what any employee without admin access would do: it sends an email asking for it and then I can decide what to do. It's genuinely funny to open my inbox and find a polite request from "coder-1" explaining why it needs `imagemagick` installed and what it plans to do with it.

The persona system is interesting. There's a base persona that every agent gets, which covers the basics: how to read mail, how to use the task board, how to publish artifacts. Then there are specialist personas layered on top: coder, researcher, architect, security auditor, QA, writer, editor, planner, devops. Each one is a markdown file that describes the role, the decision-making framework, the tools the agent should reach for. It's the same pattern as [the prompt is the program](/prompt-is-the-program). The persona markdown is the employee, in the sense that it combines their skills, the system's judgement based on what it can discover about the task, and the memory it has access to.

Because the system is built on top of Docker and it mounts some directories from the host system, I can see *everything* the agents are doing. I can look at their home directories, their mail queues, their logs and errors and it's fun to watch these next-token prediction machines operate, call tools, and then look up other people "in the company" from `/etc/passwd` to see who might be able to solve their problem.

What surprised me is how much this feels like managing a small team rather than running software. There are two ways that agents get work:

1) The agents check their email and pick up work and then work out how best to proceed (there are some guardrails and guidance - but it can also evolve as the agests operate) and then email the sender with updates
2) The agents also share a task board, and each task knows what it depends on. There is an optional orchestrator user that polls the board every 30 seconds, checks for completed tasks, and sends mail to the next agent when its blockers are cleared. 

The thing that nags at me is whether this is actually a good idea or just a fun one. Are we going to get businesses running in a box? 

Running agents as Linux users felt elegant in a "this is how computers were always supposed to work" way, and a natural extension of what Unix was designed for. The fact that some of those users are now LLMs instead of humans doesn't change the model much. I do think Linux could be a good place to run agents as users, but the industry will probablly rally around a differnt runtime (or have it appear like the agent *is* the system.)

The email-as-coordination pattern works well when the messages are clear, but LLMs can be verbose, and email threads between agents can get long and circular in ways that human email threads usually don't. And it turns out polling for new work, even when using Sonnet, burns through tokens creating a fun but very an expensive project. Ultimately, email commuinication is novel and it means you could slot an agent in to your company, but there are also so many other ways for tools to also communicate with each other (and I think we are seeing that with OpenClaw etc)

Software project management has also moved on so much since 2010. While a Linux system has lots of tools that it can use to complete a task, so much of a persons work revolves around web-apps and Sass that was just to much of a pain to set up in this project.

Finally, I've also found it incredibly hard to break down a problem in a way that actually makes use of a "full business" in the box. Yes, I can get one agent to do something, and it's very fun to see it "delegate" but in practice nearly all of the things that I am doing cna be managed by one agent.

Still, every time I open my inbox and see an email from an agent explaining what it did, what it found, and what it thinks should happen next, I get the same feeling I had at Qire when a colleague would send me a question from one of our customers.... actually that's a fib and a very tenous link to the opening of this email, I dreaded some of the things that happened in that job, but I do find it very novel that I have a machine asking me questions or showing the work that was just completed. 

My general question is this: with the development of `claude-code` and `codex` CLIs and apps and their continued push into agents and automation, they're effectively building an OS. Does this change our concept the OS? I think a system like the one described in this article could work, but the cost is currently too high, especially when the CLIs are subsidised behind their subscriptions. Who knows, maybe OpenAI or Anthropic will do a linux-disto.
