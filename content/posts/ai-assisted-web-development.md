---
title: "AI Assisted Web Development"
date: 2025-06-04T16:00:06.193Z
slug: ai-assisted-webdev
authors:
  - andreban
---

AI assisted programming is becoming more and more frequent amongst developers. Its usage ranges from asking AI tools like Gemini and pasting answers into the IDE, to using AI as a glorified auto complete, to full on vibe coding, delegating most of the code written to AI agents.

Models are getting more capable and, but still not perfect. Developers are still ultimately responsible for the code produced, and should review it before publishing to avoid [nasty surprises][10] like [leaking API keys][4]. But it's amazing to see how models like [Gemini 2.5 Pro][2] are capable of building entire (even if reasonably simple) web applications from a one shot prompt, like [this example][3] where my prompt was *Build a force directed graph demo*. 

One thing to note, however, is that AI models are not equally performant for all programming languages and stacks. Because model performance depends on the availability training data for the model, AI models tend to be quite good for web development, and have the potential to boost the productivity of web developers more than other stacks.

Maybe that's because the web has been around for such a long time and the open nature of web implementations, there is plenty of training data available for training models for web development. Another characteristic that favours the web is that it excels in backward compatibility (remember [spacejam.com][5], from '96? Its still up an running), so even when a model produces slightly outdated code, it will generally still work, without issues.

Another point that makes the web a great platform to build with AI tooling is low-friction deployment. Because the web doesn't have review queues, or requirements, developers can easily deploy and their creations, iterate, and share them.

The combination of AI models capabilities on web development with lack of friction for deploying them is spurring a new type of developer, one that is first and foremost a vibe coder and frequently doesn't know other types of development.

This became clear to me when chatting with the founders of [usecurling.com][7], a Brazilian startup aiming at differentiating themselves by delivering products faster by using AI. The team there also hosts a closed vibe coding community where the vast majority of participants don't have a software development background, but are using tools like [Replit](https://replit.com/) and [Lovable](https://lovable.dev/) to build projects.

What those developers can achieve is, of course, limited to what the AI model can do. The team reported that those developers will often run into brick walls, either because they aren't able to get the AI tooling to implement what they want or because they run into issues, like security or scalability, when productionizing them.

And that's where their community comes in, it's a forum where the Curling AI team, who are experienced developers, can help vibe coders to overcome those issues.

AI Tooling does indeed lower the barrier of entry for web development, allowing people who otherwise wouldn't have the time or resources to learn, to effective realize their ideas. It also doesn't mean there will be less work for traditional developers. In fact, my view is quite the opposite. With a lower barrier of entry, the need for developers who can take over when AI tooling hits a brick wall will only grow.

Another interesting trend are developers who moved into leadership or management position, like CTOs, VPs, directors and managers, starting to build again, because AI tooling gives them the opportunity to quickly put together projects within the time they have left after dealing with other responsibilities that comes with those roles.

While, at one hand, this may be contributing to a [dissonance between leadership and developers on generative AI][9], it's also great to see AI bringing those developers back to building things, and excited about the future of web development.

An URL is a powerful tool that allows sharing web projects around. With more people becoming developers and publishing their creations on-line, I wonder if we will start seeing more directories where those developers can showcase their applications, and users can discover new ones - sort of an [itch.io][8], but for web applications.

Maybe this won't make sense in today's world, but the concept of more people being able to transform their ideas into web applications, with reduced friction to build and deploy, reminds me of the early days of the web - distribution of native applications was always an issue, but the web allowed developers to share their creations with a simple link. AI Tooling is changing that by allowing more people to become developers, and that's great!

[1]: https://web.lmarena.ai/leaderboard
[2]: https://deepmind.google/models/gemini/pro/
[3]: https://g.co/gemini/share/fec5ce76d958
[4]: https://x.com/leojr94_/status/1901560276488511759
[5]: https://www.spacejam.com/1996/
[6]: https://www.ft.com/content/f4f3def2-2858-4239-a5ef-a92645577145
[7]: https://www.usecurling.com/
[8]: https://itch.io
[9]: https://leaddev.com/technical-direction/why-developers-and-their-bosses-disagree-over-generative-ai
[10]: https://futurism.com/problem-vibe-coding
