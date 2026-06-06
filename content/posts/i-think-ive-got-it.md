---
title: "i think i've got it"
date: 2026-06-06T21:10:00.000Z
slug: i-think-ive-got-it
draft: true
authors:
  - paulkinlan
---

A while back I wrote that [webmcp is the new web intents ... maybe](/webmcp-is-the-new-web-intents). The "maybe" was doing a lot of work. The thing I actually wanted, a federated way for the web to declare its capabilities and for someone to keep an index of them, wasn't being built, and I wasn't sure it could be. I think I've built it. Or at least the part I most cared about.

It's a little project called [webmcp-relay](https://github.com/PaulKinlan/WebMCP-relay), and the idea is embarrassingly simple once you see it. WebMCP today is siloed to whatever page the agent happens to be looking at. You open a page, the agent can see that page's tools, you call them, you move on. Nothing remembers anything. So I put a small MCP server in the middle. It speaks MCP to your agent (Codex, Claude Code, whatever), and underneath it drives [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) to actually run the browser. When the agent opens a page, the relay quietly asks DevTools to list the page's WebMCP tools, hands them straight back to the agent as callable MCP tools, and writes every one it sees into a local SQLite registry.

{{< figure src="/images/webmcp-relay-working.png" alt="webmcp-relay discovering and calling a page's tools" caption="PLACEHOLDER: the relay working behind the scenes - agent calls open_page, DevTools MCP lists the page's WebMCP tools, the relay hands them back as callable tools" >}}

That last bit is the whole point. The relay is a proxy, and a proxy gets to watch. Every page the agent visits on the user's behalf leaves a record of what that page could do: its tools, their schemas, the site they came from. Over time you don't have a single page's tools, you have a personal index of capabilities across every site you've ever touched. Ask for something you've done before and the agent can search the registry, reopen the right site, and run the tool, without you ever saying the words "WebMCP". You just say "book the thing" and it knows where the thing gets booked.

{{< figure src="/images/webmcp-relay-registry.png" alt="the local SQLite registry of discovered WebMCP tools" caption="PLACEHOLDER: the personal registry - tools discovered across every site the agent has visited, searchable by intent" >}}

This is the part I find genuinely exciting. If a relay like this becomes the default way an agent browses the web for you, the registry builds itself as a side effect of normal use. Nobody has to maintain a master list. Nobody has to get sites to register anywhere. The index is just the residue of the agent doing its job, and it lives on your machine, which is exactly where I argued it should live. The browser, or something sitting right behind it, is the one piece of software with a relationship to you and every site you visit.

It's rough. It's a relay held together with Chrome Canary flags and a SQLite file. But it does the thing. The local florist's `book-delivery`, the library's `find-book`, all of it, discovered, stored, and addressable, matched by an LLM that doesn't care whether the verb was too open or too constrained.

I've still got `intent:find+a+book+about+raising+chickens` taped to my monitor as the goal. This is the first time it's felt close.
