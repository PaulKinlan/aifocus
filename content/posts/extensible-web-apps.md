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
I started writing this post about how I struggle with merge issues and how it slows our ability to build software, however while I was writing that snoozefest I think I've just rebuilt SharePoint... wait, wait, wait, stay with me... I promise this post will be good. If it's not, [email me](mailto:paul@aifoc.us?subject=What+are+you+on) or [X-flame me](https://x.com/intent/post?text=Hey+@Paul_Kinlan+what+were+you+on+when+you+made+this?&url=https://aifoc.us/extensible-web-apps/).

I've been thinking for a long time about how the web might evolve now that we have the tools (LLMs and coding-harnesses) that can build almost anything and we also have the tools that can take almost anything the user needs.

I've been noodling with lots of different types of harnesses that wrangle agents: [A voice-based one](https://github.com/PaulKinlan/voicebox) (more soon - but it's very cool), [a TweetDeck style Chrome harness](https://github.com/paulkinlan/chaos), [another Chrome harness](https://github.com/paulkinlan/chrome-agent-platform) and an [API](https://github.com/paulkinlan/agent-do) that has a CLI and a TUI. I live in a lot of these tools now, they control my machines and help me work in ways that I personally find very useful.

I've also been using a lot of Agent Harnesses. [Pi](https://pi.dev/) is my particular favourite because of its low footprint and its ethos of customization. I like it to the extent that I realised that my entire approach with [agent-do](https://github.com/paulkinlan/agent-do) was entirely wrong. Pi got me thinking about how I might bring the concept of harness customizability to the web.

I built [a Markdown editor](https://markdown-editor.kinlan-test.workers.dev/) that I hoped would follow the spirit of Pi. A tiny core that does the bare minimum, while exposing a surface that is entirely customizable to what the user needs.

{{< figure src="/images/extensible-web-apps/screenshot-2026-11-08-at-19.38.33.png" alt="A markdown editor editing this very post" caption="Look YAME! (Yet another Markdown Editor)" >}}

It's worked surprisingly well. It serves *my* needs and if I need a new feature, say a little notification that tells me the reading time, well, I don't have to bake it into the core, I can just create a little plugin outside the main repo and not have to deploy it. 

The plugins have access to different parts of the UI.

{{< figure src="/images/extensible-web-apps/screenshot-2026-11-08-at-19.42.33.png" alt="" caption="Extending the UI" >}}

And they can hook into events and actions that happen inside the web app such as pressing keys and then updating the UI. 

{{< figure src="/images/extensible-web-apps/screenshot-2026-11-08-at-19.47.08.png" alt="" caption="The blue line is a sentence length plugin" >}}

For example, I have a sentence length plugin that *could* be something that is in the core, and so could the *writing* streak plugin, but why should I have to rebuild and redeploy the project if I get bored of them one day? Do I really need to go back and re-build a project just to add a side-panel that checks all the claims that I am making? No, no I shouldn't have to.

The principles that I saw in Pi were incredibly invigorating and I started to see every problem in software as one that could be fixed with an Extensibility-shaped hammer.

Then I remembered the awesome post "[Malleable software: Restoring user agency in a world of locked-down apps](https://www.inkandswitch.com/essay/malleable-software/)" by the folks at Ink and Switch (and lo and behold, they also built a Markdown Editor :D) and I really had to dive a lot deeper into this space and try and answer the question: Why don’t more websites offer customization? 

{{< aside >}}There was a time where I was pitching every feature in Chrome should be a Web Intent that can be replaced (my idea was instead of the "Print" opening the printer dialog, it would search for services the user had installed and offer that. It could point to the user's preferred service, maybe FedEx or ... a fax machine service){{</ aside >}}

So, why don't more websites offer customization? Easy. It's hard. 

It's hard to be secure. It's hard to be performant. It's hard to design a product around customization without feeling like you are losing control of your product, and it's hard to not break existing customizations when you update your core.  While there is user demand  (just look at Chrome extensions) I think people want a [naked robotic core](https://hypercritical.fireside.fm/86) and then the ability to [dress and change their tools to their needs](https://youtu.be/vV85dNeGRhY?t=94).

Then I discovered the DeepSeek Harness. The harness is built around the principle that everything in the core system is a plugin. It's rather spectacular. The paper that describes the [Cordis](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/) system is rather incredible too. While I found the Maths and proofs of theorems overwhelming, if you can drive through it there are glimpses of magic for mere mortals like me: Self-evolving Harness systems. 

It left me thinking. If I want the web to win in the long run then we need websites to offer more than what you can get inside a Chat harness. Chat apps will be dynamic in the future and completely personalised to the user, so why don't we have the same for web applications that live on the web? 

So, well, here we are... Introducing my experiment: [Extensible Web Apps](https://extensibleweb.app/) [[source](https://github.com/PaulKinlan/ExtensibleWebApps)] --- a harness that enables you to build and compose web apps that the user can extend how they see fit.

{{< aside >}}
I know, I know - the <a href="https://github.com/extensibleweb/manifesto">Extensible Web Manifesto</a>... I'm very likely to be prodding a sleeping bear, but the domain names were available, the name is very apropos of the intent of what I am about to describe, and, well, The Extensible Web manifesto was of a time that has passed (I should probably write this up on paul.kinlan.me).
{{</ aside >}}

Before I explain anything, have a play. This is a beat pad built on the platform, running live in this page. Press play. Then hit **Customize** in the corner, pick the **Sunset theme** sample and turn it on. You just installed a plugin into somebody else's app, and the author (me) didn't have to do anything to let you.

{{< demo src="https://extensibleweb.app/demos/beats/" title="Beat pad" height="680" caption="A step sequencer. The sequencer, the Euclidean rhythm menu and the ripples visualiser are each their own plugin." >}}

Before we start, I am presuming that you don't mind that I built this with my agent with heavy and constant review (you will see Claude and other tools all over this repo). This web-app harness builds off the core kernel of Cordis and then attempts to build on top of the existing primitives of the web such as `<slot>`, `<template>`, `serviceWorker`, `Worker`, `SharedWorker`, `MessageChannel`, `@layer`, `@scope` to let you build rich and complex web applications that the user can customize without you having to do anything new.

While a user can write the code to customize the web app, the expectation is that people will use an LLM to create the plugins at runtime and as such LLMs are built into the harness as a core principle component (even if it's not enabled by an app developer).

It's a rather complex system when you have to try and look at it all, but the way I would say it is: We have an app and it's made up of plugins that are managed by "the kernel". Plugins *are the system* and they are added by the developer who builds the app *and*, importantly, by the user.

{{< figure src="/images/extensible-web-apps/architecture.png" alt="" caption="Architecture of the system" >}}

{{< figure src="/images/extensible-web-apps/dataflow.png" alt="" caption="Data flow" >}}

Really, everything is a plugin. That includes the UI shell, storage, sync and the AI agents. Plugins run in their own `Worker`, can only do what their manifest asks for, and draw their UI as plain HTML. They emit events and can listen to messages that were emitted from other plugins, but they can't directly talk to any other worker. Because plugins are so isolated, this means that we can "safely" run them without stomping over each other, or over the app they're running in. <!-- TODO PAUL: this sentence was unfinished in your draft; I finished it, check it's what you meant. -->

Technically, an app needs no server as it can run entirely in the client, but it can also open in a space that a group of people share, where the same kernel runs on a server too, with plugins of its own.

Given this is a harness and it's for building apps, I don't take as severe a hardline about what's in the core as Pi or Cordis do. It's more akin to how the DeepSeek Harness builds on Cordis, meaning that I give you a product you can build applications on top of.

One of the nice things about this is that because everything is a `Worker`, all app updates happen via messaging, which means cross-tab communication is easy. The demo that follows is a little bit more complex because it is technically two apps: a contact manager and a generic calendar, but because they both expose a contract for how they work via hooks, they can listen to changes in the data.

You don't have to take my word for it. Below are the two real apps, each in its own iframe. Add someone in Contacts with a birthday in the next two weeks and watch it turn up in the Calendar's "Next two weeks" list. (I punched the air when that just worked, and then I punched it again when it also worked embedded in a blog post.)

{{< demo-row >}}
{{< demo src="https://extensibleweb.app/demos/contacts/" title="Contacts" height="620" >}}
{{< demo src="https://extensibleweb.app/demos/calendar/" title="Calendar" height="620" >}}
{{< /demo-row >}}

If you're reading this somewhere the iframes don't show up, here's what it looks like across two tabs. Watch the calendar update when we delete a contact.

{{< figure src="/images/extensible-web-apps/output.gif" alt="Deleting a contact in one tab and the calendar in another tab updating" caption="Data in two different apps syncing across tabs" >}}

{{< aside >}}
Anything you change in these embedded demos stays in your browser, and it's kept apart from the same apps on extensibleweb.app itself (browsers partition storage for iframes by the site they're embedded in). So go wild, you won't break anything for anyone else.
{{</ aside >}}

Here's the bit I really want you to try. This is a whole plugin. It reads the contacts and puts a little line under the app's heading. The Contacts app has no slot for it, so the plugin names its own place in its manifest (`header h1`, put it `after`).

```js
export const manifest = {
  id: "headcount",
  name: "Headcount",
  description: "Says how many people you know, under the heading.",
  version: "1.0.0",
  permissions: ["ui", "data:read:contacts"],
  places: { count: { at: "header h1", put: "after" } },
};

export default async function (ctx) {
  const html = ctx.ui.html;
  const draw = async () => {
    const people = await ctx.call("data", "list", "contacts");
    ctx.ui.render("count", "count", html`<small>You know ${people.length} people 👋</small>`);
  };
  ctx.on("data:changed:contacts", draw);
  await draw();
}
```

Copy it, hit **Customize** in the Contacts demo above, paste it into the box under "Add a plugin", and click **Add this code**. It starts off, and the panel tells you exactly what it asks for (`ui`, `data:read:contacts`) and where it will draw before you turn it on. Turn it on, add another person, and the count goes up. That's the whole loop: an app author ships an app, and a user (or their agent) bends it to what they need, without a fork, a rebuild or a deploy.

{{< figure src="/images/extensible-web-apps/headcount.png" alt="The Contacts app with 'You know 3 people' added under its heading by a pasted plugin" caption="A plugin pasted into somebody else's app" >}}

Say you build a web app and you don't have agent support, but the user wants to integrate Claude somehow? Well, we have an Agents plugin that can let the user configure their own agents. Say you had a Book tracking web app and your user keeps asking you to add Agent support in, but you really don't know what that means, or how it would help? The user adds the Agent plugin.

{{< figure src="/images/extensible-web-apps/agent.gif" alt="" caption="You can add your agent - in this case the Agent is a Librarian" >}}

In this demo you can see that I submit the details of "Tools for Thought" (I'm a hypermedia nut) and I don't have the published date or the name of the Author and you can see the [Librarian Agent](https://github.com/PaulKinlan/ExtensibleWebApps/blob/main/demos/librarian/librarian.agent.md) listening for changes to the data store and then talking to the [Bibliographer Agent](https://github.com/PaulKinlan/ExtensibleWebApps/blob/main/demos/librarian/bibliographer.agent.md) to then make the changes needed to annotate the data (with permission). You can [try the Librarian yourself](https://extensibleweb.app/demos/librarian/), you'll just need to bring your own API key.

How the agents work
Here's the thing I love about this one: neither agent is code. An agent is a Markdown file. The frontmatter is its manifest (what it's allowed to do, what wakes it up, and how much it may spend) and the body is its instructions. The kernel turns the file into a plugin, so an agent goes through exactly the same permission gate as any other plugin. That's also why you get asked before the Librarian changes your books: it doesn't own the library collection, so every write it wants to make shows up on a review card.

{{< figure src="/images/extensible-web-apps/agents.png" alt="Sequence diagram: you add a book with only a title; the kernel wakes the Librarian agent on data:changed:library; it asks the model, then messages the Bibliographer agent, which may ask you to pick between candidates; the Librarian writes the author and year back, and the kernel shows you a review card before the change lands" caption="What happens when you add a book with just a title" >}}

The whole app is one page. Two of the plugins are just Markdown files, linked with `rel="agent"` instead of `rel="plugin"`, and the model is a plugin too, so you can swap Anthropic for OpenAI, Gemini or anything OpenAI-compatible by changing one line:

```html
<link rel="plugin" href="../reading-list/library.js">
<link rel="plugin" href="activity.js">
<link rel="agent" href="librarian.agent.md">
<link rel="agent" href="bibliographer.agent.md">
<link rel="plugin" href="/std/board.js">
<link rel="plugin" href="/std/llm/anthropic.js">
```

This is the Librarian, the entire file. It wakes whenever a book changes (`on: - hook: data:changed:library`), it can read and write the library and send messages to the bibliographer, and nothing else. `model: fast` asks for whichever fast model the app's LLM plugin has, and `limits` caps how often it runs and how many tokens it uses; the kernel counts those, not the agent.

```markdown
---
id: librarian
name: Librarian
description: Fills in a book's author and first year of publication when they're missing.
model: fast
permissions: [data:read:library, data:write:library, bus:send:bibliographer]
on:
  - hook: data:changed:library
  - command: fill-missing
limits: { runs-per-hour: 30, tokens-per-day: 200000, steps: 8 }
---
You look after a reading list, kept in the `library` collection.

When a book is added or changed and it has a title but no author or no year,
fill in what's missing: the author's usual name, and the year the book was
first published. Write the whole book back with `data_put_library`, keeping
its id and every field it already has, and give a short reason, such as
"Added the author and year of Middlemarch".

If you aren't sure of a book, ask the bibliographer: send it the title with
`bus_send_bibliographer`, waiting for the reply, and use its answer. If it
answers "Unknown", leave the book as it is. Never change a
field that already has a value, and never delete a book.

When asked to `fill-missing`, list the books with `data_list_library` and do
the same for each one that needs it.
```

The tools it mentions, like `data_put_library`, aren't something I wrote for agents. They're generated from the platform's services, filtered down to what the manifest allows. If the permission isn't in the frontmatter, the model never even sees the tool.

The Bibliographer can't touch the library at all. It has an inbox (`- message: true`) so other agents can ask it things, and one permission, `bus:ask`, which lets it put a question to you on the board when it isn't sure:

```markdown
---
id: bibliographer
name: Bibliographer
description: Answers questions about who wrote a book and when, asking you when a title could be more than one book.
model: fast
permissions: [bus:ask]
on:
  - message: true
limits: { runs-per-hour: 30, tokens-per-day: 200000, steps: 6 }
---

You know books. Others send you questions about one: usually who wrote it
and the year it was first published.

Answer in one line, as "Author, year", such as "Susanna Clarke, 2020".

If the title could be more than one well-known book, don't guess: ask the
person with `bus_ask`, giving the candidates as choices, such as
"Mary Shelley, 1818" and "Dean Koontz, 1987", and answer with the one they
pick. If you don't know the book at all, say "Unknown".
```

And because agents are plugins, everything they do is an event any other plugin can listen to. The activity panel in the demo is an ordinary plugin with one permission, `hook:listen:agent:*`:

```JavaScript
ctx.on("agent:wake", ({ agent, trigger }) => add("woke", `${agent}: ${trigger.name}`));
ctx.on("agent:toolResult", ({ agent, tool, ok }) => add("tool", `${agent} called ${tool}${ok ? "" : ", which failed"}`));
ctx.on("agent:budget", ({ agent, limit, used, max }) => add("limit", `${agent} reached its ${limit} limit: ${used} of ${max}`));
```

So if your users want "AI in the app", you don't have to design that feature. They can drop in a Markdown file, and the platform holds it to the same rules as everything else. The Agents guide has the rest, including agents that check other plugins' writes before they land.

I wanted to know how far the UI could go when every piece of it is a plugin drawing plain HTML from a worker, so I (well, me and my agents) built a bunch of apps. All of them are at [extensibleweb.app/demos](https://extensibleweb.app/demos/), and every one has the Customize button.

* **[Studio board](https://extensibleweb.app/demos/board/)**: a kanban board with due dates, checklists, WIP limits and a "pulse" chart. Try the **Focus** and **Midnight theme** samples in Customize.
{{< demo src="https://extensibleweb.app/demos/board/" title="Studio board" height="680" >}}

  {{< figure src="/images/extensible-web-apps/board.png" alt="The Studio board kanban app" caption="Studio board image if it doesn't work for you" >}}

* **[Trails](https://extensibleweb.app/demos/trails/)**: an activity journal with canvas charts and a year heatmap. The **Miles** sample shows every distance in miles, and the app's author never wrote a units setting.
{{< demo src="https://extensibleweb.app/demos/trails/" title="Trails" height="720" >}}

  {{< figure src="/images/extensible-web-apps/trails.png" alt="The Trails activity journal" caption="Trails" >}}
  
* **[Household](https://extensibleweb.app/demos/household/)**: a shared shopping list and chores. On its own it works in your browser; open it in a shared space and the kernel also runs on a server, so everyone in the house stays in sync, even after being offline.
* **[The plugin debugger](https://extensibleweb.app/demos/debugger/)**: an app that inspects the running kernel: every plugin, what it asked for, and the events going past.
* **[The homepage itself](https://extensibleweb.app/)**: it's made of plugins too. Every chapter is a plugin, and the switchboard lets you turn them off one by one until there's nothing left (yes, you can turn off the switchboard; there's a reset).
  {{< figure src="/images/extensible-web-apps/home-all-off.png" alt="The Extensible Web Apps homepage with every plugin switched off" caption="The homepage with every plugin turned off" >}}

Want to build your own? You need a recent Node (I use 22) and that's it. There's no build step for your app: an app is an HTML page and some plugins, each one an ES module.

**1. Make a project.** It isn't on npm yet, so you run it straight from GitHub: 

```sh
npx github:PaulKinlan/ExtensibleWebApps packing-list
cd packing-list
npm run dev
```

That copies the whole platform into `packing-list/` (the kernel, the standard plugins, the service worker, and all the demos to learn from), installs it, and makes your app in `demos/packing-list/` from the starter. Open [http://localhost:5173/demos/packing-list/](http://localhost:5173/demos/packing-list/) and you have a working list app. The folder name becomes your app's id, so keep it to lowercase letters, digits and dashes.

**2. Look at what you got.** Three files. The page, `app.html`, says which plugins make up the app with `<link rel="plugin">`, and where they can draw with `<slot>`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packing list</title>
  <link rel="stylesheet" href="/platform/host.css">
  <script type="module" src="/platform/host.js"></script>
  <link rel="plugin" href="main.js">
  <link rel="plugin" href="/std/debug-console.js">
</head>
<body>
  <header>
    <h1>Packing list</h1>
  </header>
  <main>
    <slot name="main"><p>Loading…</p></slot>
  </main>
  <slot name="debug"></slot>
</body>
</html>
```

The plugin, `main.js`, starts with a manifest the kernel reads as data before any of its code runs. It owns a collection with a JSON schema (so every write is checked), and it draws a live view, which redraws whenever the data changes, in this tab or any other:

```js
export const manifest = {
  id: "packing-list",
  name: "Packing list",
  description: "A list to start from.",
  version: "0.1.0",
  permissions: ["ui"],
  collections: {
    "packing-list-items": {
      title: "Items",
      schema: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", title: "Item", maxLength: 200 },
          done: { type: "boolean", title: "Done" },
        },
      },
    },
  },
};

export default async function (ctx) {
  const views = ctx.ui.views("main.html");

  views.live("main", "items", async (ctx) => {
    const items = await ctx.call("data", "list", "packing-list-items");
    return { items };
  });

  ctx.ui.onEvent(async (action, value) => {
    const [verb, id] = action.split(":");
    if (verb === "done") {
      const item = await ctx.call("data", "get", "packing-list-items", id);
      if (item) await ctx.call("data", "put", "packing-list-items", { ...item, done: value === true });
    }
    if (verb === "remove") await ctx.call("data", "delete", "packing-list-items", id);
  });
}
```

And the view, `main.html`, is a plain `<template>`. Holes like `{{item.title}}` are always filled as text (never HTML), `<template for>` repeats, `<template if>` keeps or drops, and `data-action` sends an action back to the plugin. `<ui-form>` builds a whole form from the collection's schema and saves new items by itself:

```html
<template id="items">
  <ul class="items">
    <template for="item of items">
      <li class="item" key="{{item.id}}">
        <label><input type="checkbox" checked="{{item.done}}" data-action="done:{{item.id}}"> {{item.title}}</label>
        <button data-action="remove:{{item.id}}">Remove</button>
      </li>
    </template>
  </ul>
  <ui-form collection="packing-list-items" fields="title" submit="Add"></ui-form>
</template>
```

(I've trimmed the starter a little here. The real files have comments explaining every line, and an empty state.)

**3. Add a plugin.** Make a new file next to the others, add a `<link rel="plugin" href="weather.js">` to `app.html`, and a `<slot name="side">` if it needs somewhere to draw. Or don't touch the page at all and add it through Customize like you did above. `npm run check` finds the usual mistakes before you open the page: a manifest the kernel won't read, a plugin drawing into a `<slot>` the page doesn't have, or a call the plugin's permissions don't allow.

**4. Or let your agent do it.** This is really how I expect most plugins to get written. The repo has an [AGENTS.md](https://github.com/PaulKinlan/ExtensibleWebApps/blob/main/AGENTS.md) with the rules the kernel enforces, and the site has an [llms.txt](https://extensibleweb.app/llms.txt). Point Claude, Pi, or whatever you use at your project and ask for the plugin you want.

**5. Ship it.** Any one app can go out on a Cloudflare Worker of its own, with the whole platform (including the server side for shared spaces) carried along:

```sh
npx wrangler login                            # once per machine
npm run deploy:app -- demos/packing-list
```

It prints your app's address, `https://packing-list.<your-subdomain>.workers.dev/`. Add `--dev` to try it locally first. There's also a "Deploy one app" GitHub Actions workflow if you'd rather not deploy from your machine; [Deploying one app](https://extensibleweb.app/docs/guide/deploying-an-app) has the details.

If you want to learn more, here are some good links to get started: 

Core:
* [Start here](https://extensibleweb.app/docs/)
* [Architecture](https://extensibleweb.app/docs/architecture)
* [The layers](https://extensibleweb.app/docs/layers)
* [Security Model](https://extensibleweb.app/docs/security)
* [The Kernel](https://extensibleweb.app/docs/kernel)
* [Every standard plugin](https://extensibleweb.app/docs/plugins)

Developer Guide:
* [How an app works](https://extensibleweb.app/docs/guide/how-an-app-works)
* [Writing a Plugin](https://extensibleweb.app/docs/guide/writing-a-plugin)
* [Views and templates](https://extensibleweb.app/docs/guide/views-and-templates)
* [Data and Permissions](https://extensibleweb.app/docs/guide/data-and-permissions)
* [Places](https://extensibleweb.app/docs/guide/places) (how user plugins draw where the app has no slot)
* [Agents](https://extensibleweb.app/docs/guide/agents)
* [Styling components](https://extensibleweb.app/docs/guide/styling)

It has been incredibly fulfilling to think about an extensible system and how we can use a lot of existing Web primitives. I've particularly enjoyed getting back into MessageChannels and MessagePorts ([two of the most underrated APIs on the web](https://paul.kinlan.me/reinventing-web-intents/)). I'm not sure if this will take off or be the future, but I can't not explore these concepts especially as everything around the web is evolving so quickly. I really do think the concepts of minimal cores, malleable software and user-extensibility are a very interesting area for the future of software and I want the web to be central.

So, anyway, I will get around to writing about merge issues, but for now you have a new paradigm for creating web apps that 100% aren't SharePoint. I would love you to have a look and send me feedback on this experiment.
