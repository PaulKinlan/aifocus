---
title: a business in a box
date: 2026-05-10T20:00:00.000Z
slug: business-in-a-box
draft: true
authors:
  - paulkinlan
---

Before Google, I worked at a small telecoms company in Liverpool called Qire. It was an interesting company and I'd just gone from working in a big slow corporate building Fraud Detection systems to a small company that had to be pretty nimble. It had maybe 15 people in total. We ended up build [voice interaction systems](/llm-whisperer), automated outbound calling, SMS campaigns, data processing and the like. I built reporting, call record management, web infrastructure, and helped wire some of these systems together. It was also one of my most productive periods as a developer where I built a lot of side-projects that would ultimately be one of the reasons why I could get into Google.

I could see every role from where I sat. Account managers, marketing, accounts receivable, accounts payable, the support engineer, project managers, the person who managed the phone infrastructure and all the salespeople working through their clients right next to me. Every single role was in the same room. What struck me was that each role was relatively well defined, but people could swap between them when they needed to because someone was out. People might call it a lifestyle business, because some of the original owners wanted people to be there a long time, and they were. Most of the original people knew the business well enough to understand what other people's roles could be and would do. Interestingly, they communicated mostly over email or by shouting across the office, and the whole thing worked because it was small enough that everyone had enough context to make decent decisions.

This post has been sitting with me for the last couple of months as I explore what agents can do and how we might deploy them and it started originally with me running `claude` as my login-shell on my Linux box and finding it surprisingly good at being able to manage many of the tasks that I need to do, it then lead me to a question: What if all the users on a machine are an agent?

Like with my post [The Browser is the sandbox](/the-browser-is-the-sandbox/) where I was questioning how much new infrastructure do we need to be able to run an LLM, my first port of call was the tools I use every day: Linux. My hunch was that Unix based systems have a pretty good and well-established account, security and permissions model, while also having some pretty comprehensive sandboxing if required that might solve all we need.

I've been running an experiment called [docker-agent-test](https://github.com/PaulKinlan/docker-agent-test) with my pal [Elias Helou](https://www.linkedin.com/in/eh-veso/). The setup is this: a single Docker container running Arch Linux with systemd, and inside it, multiple agents built using the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), each running as a separate Linux user. Each agent has its own home directory, its own mailbox, its own persona defined in a markdown file, and a systemd service that runs it in a loop and they communicate with each other over email (using OpenSMTPD and Maildir).

When I say "each agent is a Linux user," I mean it literally. `useradd` creates the account. The agent's role and purpose are stored in the GECOS field of `/etc/passwd`, so other agents can discover what their colleagues do by running `getent passwd`. They share a `/home/shared/` directory for artifacts and a task board. They can't sudo. They can't write outside their home directory. They're sandboxed the same way any unprivileged user on a Unix system would be - that being said, it's not using process isolation like `cgroups`.

The email part is what reminded me of DDS. At the Liverpool office, email was how work actually moved. A client would email in a request, someone would pick it up, do the work, email back. Internally, we'd email each other tasks, status updates, questions. The email thread was the project management system. Nobody opened Jira. The inbox was the to-do list.

In docker-agent-test, it works the same way. When a task's dependencies are satisfied, the orchestrator emails the assigned agent: "your blockers are clear, here's what you need to do." The agent reads its mail, does the work, publishes artifacts to the shared directory, and the orchestrator picks up the completion and notifies the next agent downstream. If an agent needs something installed and doesn't have sudo, it does what any employee without admin access would do: it sends an email asking for it. I get that email. It's genuinely funny to open my inbox and find a polite request from "coder-1" explaining why it needs `imagemagick` installed and what it plans to do with it.

The persona system is interesting. There's a base persona that every agent gets, which covers the basics: how to read mail, how to use the task board, how to publish artifacts. Then there are specialist personas layered on top: coder, researcher, architect, security auditor, QA, writer, editor, planner, devops. Each one is a markdown file that describes the role, the decision-making framework, the tools the agent should reach for. It's the same pattern as [the prompt is the program](/prompt-is-the-program). The persona markdown makes up  "the employee" which is a combination of their skills, the systems "judgement" based on what it can discover about the task, the system, the memory it has access to.

Because the system is built on top of Docker and it mounts some directories from the host system, I can see *everything* the agents are doing. I can look at their home directories, their mail queues, their logs and errors.

It's fun to watch these next-token prediction machines operate, call tools and then look up from the system directory other people "in the company" that might be able to solve their problem.

What surprised me is how much this feels like managing a small team rather than running software. The agents have a DAG-based task board, so work flows through them in dependency order. But the coordination layer is thin. The orchestrator polls the task board every 30 seconds, checks for completed tasks, and sends mail when blockers are cleared. That's it. There's no complex scheduling. No resource allocation algorithm. Just "your thing is ready, go." The same way a manager at a small company would tap someone on the shoulder and say "the data's in, you can start on the report now."

The circuit breaker pattern is good too. If an agent fails five times in a row, it stops and emails root. That's basically the equivalent of an employee coming to you and saying "I've tried this five times and I can't figure it out, I need help." Exponential backoff on transient errors, immediate halt on fatal ones. The system doesn't thrash.

There are preset workflows you can load that define an entire team and task graph in a JSON file. A bug triage preset, a feature build preset, a codebase audit. The preset compiler creates the agents, sets up the task DAG, sends the kickoff email, and everything starts flowing. It feels like hiring a temporary project team. Define the roles, define the work, press go.

The thing that nags at me is whether this is actually a good idea or just a fun one. Running agents as Linux users is felt elegant in a "this is how computers were always supposed to work" and seems like a natural extension for what Unix was designed for. The fact that some of those actors are now LLMs instead of humans doesn't change the model much. But the failure modes are different. A human employee who gets confused asks for clarification. An agent that gets confused might quietly do the wrong thing for five cycles before the circuit breaker kicks in. The email-as-coordination pattern works well when the messages are clear, but LLMs can be verbose, and email threads between agents can get long and circular in ways that human email threads usually don't.

Still, every time I open my inbox and see an email from an agent explaining what it did, what it found, and what it thinks should happen next, I get the same feeling I had at DDS when a colleague would send me a question from one of our customers. There's context. There's reasoning. There's a clear next step that I need to do or solve. Bingo.

This was a fun experiment although it cost me a lot of money. It turns out polling for new work, even when using sonnet can burn through tokens like crazy. If you want to play with it, go ahead. It's a bit weird to get set up as it's all managed via `make`:

* `make build` creates the system
* `make up` starts the system
* `make down` stops the system (you should do this otherwise your token bill will be high)
* `make create [name] --persona coder` - will make a user on the system with the uid `name` and set up the default prompts to be the coder persona (there's a lot of other personas)
* `make task-add` will add a task to the shared board for the best agent to pick up
* `make send [user] "[message]"` send the user an email and get them to start work
* `make tui` will run the text-ui that makes it easier to set up

I think my general question is that with the development of `claude-code` and `codex` CLIs and apps and their continued pushing into agents and automation, they're effectively building an OS, so what does this mean for OS's? I think a system like the one described in this article could work, but the cost is too high especially when the CLIs are subsidized behind their subscriptions.
