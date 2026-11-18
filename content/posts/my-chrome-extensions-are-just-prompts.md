---
title: my chrome extensions are just prompts
seotitle: ""
slug: my-chrome-extensions-are-just-prompts
description: ""
date: 2026-11-18T20:05:22.019Z
draft: true
authors:
  - paulkinlan
---
Earlier this year I wrote about how more and more of my [software are just prompts](/the-prompt-is-the-program/) and how I built an [agent harness](/agent-do/) that was used to help me [ship a prompt](/shipping-a-prompt/) as a Chrome Extension, and the more I've got into it the more I've been able to customize Chrome to my intent with little mini-agents that run with the aim of doing one thing well.

Announcing: [Prompt in a Box](https://github.com/PaulKinlan/prompt-in-a-box).... err, I need better names, and not to do the same thing again... This time it's different though. I updated the project a fair bit to make it very easy to experiment with the concept of building programs entirely from a prompt.

{{< figure src="/images/my-chrome-extensions-are-just-prompts/screenshot-2026-11-18-at-20.19.59.png" alt="" caption="The Extension Studio" >}}

You can describe how you want the extension to work in relatively straight forward terms in Markdown format. At the simplest level you can provide a very simple prompt like `De-duplicate my tabs` and when the extension is invoked it will depublicate your tabs to the best it can work out. Naturally, this is very broad and you most likely want even more control. Should it run every 10 minutes, or at the end of your day? What are the cases that you don't want it work? Should it just look at the URL or should it consider the content too? What should it do when you are using the tab? Well, for any of those questions you can just write it down.

The "prompt in a box" project was pretty capable when I made it earlier this year, but it was just a bunch of scripts to take markdown files and throw them into a crx bundle. As I was experimenting with this project and sharing it with some teams to enable rapid prototyping of features there were a couple of additional things that we wanted from the platform:

* A UI that makes it easy to edit all the assets needed for an Extension -  the Studio now lets you create all the icons, select or infer permissions and also have an agent help you define the parameters and logic further than your original prompt.
* A deterministic way to build UI for the popup - you can now do that with a JSON schema that can be inferred from the prompt. If you don't the agent will decide how to render the UI (if UI is even needed)

{{< figure src="/images/my-chrome-extensions-are-just-prompts/screenshot-2026-11-18-at-20.26.45.png" alt="" caption="UI Built for the agent via a prompt" >}}

* Because the results are non-deterministic people needed a way to Undo the action if the extension got it wrong
* There needed to be a full trace an accountability so that we can review how the harness works especially when it went wrong. This critical so that you can refine your prompt
* Agent Harnesses are normally a step-by-step conversation with LLM service and this can be quite slow. If you have 50 tabs and you have to analyse the content of each, do you do 50 LLM steps, or think of another way? The other way is `code_mode` inspired by [Pi.dev](https://pi.dev/) where the agent will dynamically write the code for part of the extension steps and then run it in batch.

{{< warning >}}You will not be able to submit any of these extensions to the Chrome Web Store, sorry. They rely on dynamic code execution either directly through `code_mode` or indirectly through the agent loop.{{</ warning >}}

I really liked this project not only because we've used it to test some early concepts and it showed me how valuable the rapid iteration is, but also because it furthered my thinking on how we can compose agents from small prompts in to useful experiences and how systems built around [extensions](/extensible-web-apps/) can enable more customizable products that can be as simple or as complex as _you_ need. 

As people build more agentic software we are going to have to think about how our existing surfaces can enable tooling to be built around them. I constantly think about how spreadsheets made millions of people Programmers, without them actually knowing they were. We should all be considering how our products can enable not only orchestration by agents (e.g, MCP) but how the functionality of the product can be customized by our users from within the product, I also think it gives software a chance to survive against the onslaught of LLM harnesses that are racing towards being the one true and only application that you will ever need. 

Make _your_ software so indispensable to _your_ users because they customized it to _their_ needs and moving to another platform or tool makes no sense.

This project and the concept of extensible and custimizable software is not without risk. While these extensions would not be allowed in the Chrome Web Store and can only be loaded in "developer-mode", if this is _a_ future to how software is created then how do we enable more people to safely run prompts or non-deterministic software?. Do we need better virtualisation? Do we need to provide better segregation between the user-defined extension and the site they are operating on? It seems to me that it's quite possible to imagine a world where a specially crafted web page could influece the execution of the extension in future runs to extract sensetive information or manipulate a page to hide some other actions the tool has taken.

That's it for me. I really just wanted to give you a glimpse of you being able to hyper-customize Chrome with just a few prompts. Have fun.

