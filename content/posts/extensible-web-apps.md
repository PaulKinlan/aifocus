---
title: Extensible web apps
seotitle: ""
slug: extensible-web-apps
description: ""
date: 2026-11-08T19:21:51.772Z
draft: true
authors:
  - paulkinlan
---
I started writing this post about how I struggle with merge issues and how it's slows  our ability to build software, however while I was writing that snoozefest I think I've just rebuilt Sharepoint... wait, wait, wait, stay with me... I promise this post will be good. If it's not, [email me](mailto:paul@aifoc.us?subject=What+are+you+on) or [X-flame me](https://x.com/intent/post?text=Hey+@Paul_Kinlan+what+were+you+on+when+you+made+this?&url=https://aifoc.us/extensible-web-apps/).

I've been thinking for a long time how might the web evolve now that we have the tools (LLMs and coding-harnesses) that can build almost anything and we also have the tools that can take almost anything the user needs.

I've been noodling with lots of different types of harnesses that wrangle agents: [A voice-based one](https://github.com/PaulKinlan/voicebox) (more soon - but it's very cool), [a TweetDeck style Chrome harness](https://github.com/paulkinlan/chaos), [another Chrome harness](https://github.com/paulkinlan/chrome-agent-platform) and an [API](https://github.com/paulkinlan/agent-do) that has a CLI and a TUI. I live in a lot of these tools now, they control my machines and help me work in ways that I personally find very useful.

I've also been using a lot of Agent Harnesses. [Pi](https://pi.dev/) is my particular favourite because of it's low footprint and it's ethos of customization. I like it to the extent that I realised that my entire approach with [agent-do](https://github.com/paulkinlan/agent-do) was entirely wrong. Pi got me thinking about how I might bring the concept of harness customizability to the web.

I built [a Markdown editor](https://markdown-editor.kinlan-test.workers.dev/) that I hoped would follow the spirit of Pi. A tiny core that does the bare minimum, while exposing a surface that is entirely customizable to what the user needs.

{{< figure src="/images/extensible-web-apps/screenshot-2026-11-08-at-19.38.33.png" alt="A markdown editor editing this very post" caption="Look YAME! (Yet another Markdown Editor)" >}}

It's worked surprisingly well. It serves *my* needs and if I need a new feature, say a little notification that tells me the reading time, well, I don't have to bake it into the core, I can just create a little plugin outside the main repo and not have to deploy it. 

The plugins have access to different parts of the UI.

{{< figure src="/images/extensible-web-apps/screenshot-2026-11-08-at-19.42.33.png" alt="" caption="Extending the UI" >}}

And they can hook into events and actions that happen inside the web app such as pressing keys and then updating the UI. 

{{< figure src="/images/extensible-web-apps/screenshot-2026-11-08-at-19.47.08.png" alt="" caption="The blue line is a sentence length plugin" >}}

For example I have a sentence length plugin *could* be something that is in the core, and so could the *writing* streak plugin, but why should I have to rebuild and redeploy the project if I get bored of them one day. Do I really need to go back and re-build a project just to add a side-panel that checks all the claims that I am making? No, no I shouldn't have to.

The principles that I saw in Pi, were incredibly invigorating and I started to see every problem in software as one that could be fixed with an Extensibility-shaped hammer.

Then I remembered the awesome post "[Malleable software: Restoring user agency in a world of locked-down apps](https://www.inkandswitch.com/essay/malleable-software/)" by the folks at Ink and Switch (and low and behold, they also built a Markdown Editor :D) and I really had to dive a lot deeper into this space and try and answer the question: Why don’t more websites offer customization? 

{{< aside >}}There was a time where I was pitching every feature in Chrome should be a Web Intent that can be replaced (my idea was instead of the "Print" opening the printer dialog, it would search for services the user had installed and offere that. It could point the users preferred service, maybe Fedex or ... a fax machine service){{</ aside >}}

So, why don't more websites offer customization? Easy. It's hard. 

It's hard to be secure. It's hard to be performant. It's hard to design a product around customization without feeling like you are losing control of your product, and it's hard to not break existing customizations when you update your core.  While there is user demand  (just look at Chrome extensions) I think people want a [naked robotic core](https://hypercritical.fireside.fm/86) and then the ability to [dress and change their tools to their needs](https://youtu.be/vV85dNeGRhY?t=94).

Then I discovered the DeepSeek Harness. The harness is built around the principle that everything in the core system is a plugin. It's rather spectacular. The paper that describes the [Cordis](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/) system is rather incredible too. While I found the Maths and proofs of theorems overwhelming, if you can drive through it there are glimpses of magic for mere mortals like me: Self evolving Harness systems. 

It left me thinking. If I want the web to win in the long-run then we need websites to offer more than what you can get inside a Chat harness. Chat apps will be dynamic in the future and completely personalised to the user, so why don't we have the same for web applications that live on the web? 

So, well, here we are... Introducing my experiment: [Extensible Web Apps](https://extensibleweb.apps) [[source](https://github.com/PaulKinlan/ExtensibleWebApps)] --- a harness that enables you to build and compose web apps that the user can extend how they see fit.

{{< aside >}}
I know, I know - the <a href="https://github.com/extensibleweb/manifesto">Extensible Web Manifesto</a>... I'm very likely to be prodding a sleeping bear, but the domain names were available, the name is very apropo of the intent of what I am about to describe, and, well, The Extensible Web manifesto was of a time that has passed (I should probably write this up on paul.kinlan.me).
{{</ aside >}}

Before we start, I am presuming that you don't mind that I built this with my agent with heavy and constant review (you will see Claude and other tools all over this repo). This web-app harness builds off the core kernel of Cordis and then attempts to build on top of the existing primitives of the web such as `<slot>`, `<template>`, `serviceWorker`, `Worker`, `SharedWorker`, `MessageChannel`, `@layer`, `@scope` to let you build rich and complex web applications that the user can customize without you having to do anything new.

While a user can write the code to customize the web app, the expectation is that people will use an LLM to create the plugins at runtime and as such LLMs are built into the harness as a core principle component (even if it's not enabled by an app developer)

It's a rather complex system when you have to try and look at it all, but the way I would say it is: We have an app and it's made up of plugins that are managed by "the kernel". Plugins *are the system* and they are added by the developer who builds the app *and* importantly that the user adds.

{{< figure src="/images/extensible-web-apps/architecture.png" alt="" caption="Architecture of the system" >}}

{{< figure src="/images/extensible-web-apps/dataflow.png" alt="" caption="Data flow" >}}

Really, everything is a plugin. That includes the UI shell, storage, sync and the AI agents. Plugins run in their own `Worker`, can only do what their manifest asks for, and draw their UI as plain HTML. They emit events and can listen to messages that were emitted from other plugins, but they can't directly talk to any other worker. Because plugins are so isolated, this means that we can "safely" run them without stomping over 


Technically, an app needs no server as it can run entirely in t client, but it can also open in a space that a group of people share, where the same kernel runs on a server too, with plugins of its own.

Given this is a harness and it's for building apps, I don't take as seveer hardline about what's in the core as Pi or Cordis does. It's more akin to how the DeepSeek Harness builds on Cordis meaning that I give you a product you can build applications on top of.



One of the nice things about this, is because everything is a `Worker` all app updates happen via messaging, this means cross-tab communication is easy. The Demo that follows is a little bit mroe complex because it is technically two apps A contact manager and a generic calendar, but because they both expose a contract for how they work via hooks, they can listen to changes in the data. Watch the calendar update when we delete a contact - it works across tabs (I punched the air when that just worked)

{{< figure src="/images/extensible-web-apps/output.gif" alt="" caption="Data in two different apps syncing across tabs" >}}

Say you build a web app and you don't have agent support, but the user wants to integrate Claude somehow? Well, we have an Agents plugin that can let the user configure their own agents. Say you had a Book tracking web app and your user keeps asking you to add Agent support in, but you really don;t know what that means, or how it would help? The user adds the Agent plugin

{{< figure src="/images/extensible-web-apps/agent.gif" alt="" caption="You can add your agent - in this case the Agent is a Librarian" >}}

In this demo you can see that I submit the details of "Tools for Thought" (I'm a hypermedia nut) and I don't have the published date or the name of the Author and you can see the [Librarian Agent](https://github.com/PaulKinlan/ExtensibleWebApps/blob/main/demos/librarian/librarian.agent.md) listen for changes to the data store and then talking to the [Bibliographaer Agent](https://github.com/PaulKinlan/ExtensibleWebApps/blob/main/demos/librarian/bibliographer.agent.md) to then make the changes needed to annotate the data (with permission)


If you want to learn more here are some good links to get started: 

Core:
* [Architecture](https://extensibleweb.com/docs/architecture)
* [Security Model](https://extensibleweb.com/docs/security)
* [The Kernel](https://extensibleweb.com/docs/kernel)

Developer Guide:
* [Writing a Plugin](https://extensibleweb.com/docs/guide/writing-a-plugin)
* [Views and templates](https://extensibleweb.com/docs/guide/views-and-templates)
* [Data and Permissions](https://extensibleweb.com/docs/guide/data-and-permissions)
* [Styling components](https://extensibleweb.com/docs/guide/styling)

It has been incredibly fulfilling to think about an extensible system and how we can use a lot of existing Web primitives. I've particularly enjoyed getting back in to MessageChannels and MessagePorts ([two of the most underrated APIs on the web](https://paul.kinlan.me/reinventing-web-intents/)). I'm not sure if this will take off or be the future, but I can't not explore these concepts especially as everything around the web is evolving so quickly. I really do think the concept of minimal cores, [malleable software](https://www.inkandswitch.com/essay/malleable-software/) and user-extensibility are a very interesting area for the future of software and I want the web to be central.

So, anyway, I will get around to writing about Merge issues, but for now you have a new paradigm for creating web apps that 100% aren't Sharepoint. I would love you to have a look and send me feedback on this experiment.