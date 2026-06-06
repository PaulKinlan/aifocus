---
title: "I think i've got it: WebMCP is the new web intents"
date: 2026-06-06T21:10:00.000Z
slug: i-think-ive-got-it-web-intents
authors:
  - paulkinlan
---

Just over a month ago I wrote that [WebMCP is the new web intents ... maybe](/webmcp-is-the-new-web-intents), but now I really do think that WebMCP is the new web intents (in a good way, not the "[the entire project crashed and burned](https://paul.kinlan.me/what-happened-to-web-intents/)" way). While the spec says that this is not the intended goal, I think we have a federated way for the web to declare its capabilities and for someone (ideally you) to keep an index of them, and then to have your tools recall and re-use those tools when they can match the user's (or their) intent with the capability of the page.

[webmcp-relay](https://github.com/PaulKinlan/WebMCP-relay) is a a small MCP server that discovers the tools that a page exposes via "WebMCP" and can call them. You install it in your agent (Codex, Claude Code, whatever), and under the hood it uses [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) to actually run the browser.

Install like this:

```json
{
  "mcpServers": {
    "webmcp-relay": {
      "command": "npx",
      "args": ["-y", "webmcp-relay", "--headless", "--channel", "canary"]
    }
  }
}
```

And when the agent opens a page, the relay asks DevTools to list the page's WebMCP tools, hands them straight back to the agent as callable MCP tools, and writes every one it sees into a local SQLite registry for future recall.

The tool surface is quite small:

- `open_page` - try to make it super clear to use this tool to open web pages
- `webmcp_refresh_tools`
- `webmcp_list_tools`
- `webmcp_call_tool`
- `webmcp_search_registry`
- `webmcp_execute_registry_tool`

I didn't want to include all of the page's tools, or the entire index of tools in the context, so I followed the idea I saw in [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/) which has a tool to look-up skills to include in the context, and in this case, your agent can query the local database of tools.

An unglamorous log of the run for https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/

```JSON
{"time":"2026-06-06T20:34:18.377Z","level":"info","component":"devtools","event":"webmcp_tools.list.start"}
{"time":"2026-06-06T20:34:18.379Z","level":"info","component":"devtools","event":"webmcp_tools.list.done","toolCount":7,"toolNames":["set_pizza_size","set_pizza_style","toggle_layer","add_topping","remove_topping","manage_pizza","share_pizza"],"latencyMs":2.1177500000012515}
{"time":"2026-06-06T20:34:18.381Z","level":"debug","component":"relay","event":"registry.persist.done","url":"https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/","count":7,"ids":["webmcp_3e98acb9d6148878","webmcp_4e60e97f52b66c15","webmcp_b0994585796e27d6","webmcp_baaf13d8de6acaa8","webmcp_a4b14c9df1412dcc","webmcp_16dc11bbcf96c478","webmcp_7ee5f6a78f435bb5"]}
{"time":"2026-06-06T20:34:18.381Z","level":"info","component":"relay","event":"tools.list_changed","currentUrl":"https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/","toolCount":7,"toolNames":["set_pizza_size","set_pizza_style","toggle_layer","add_topping","remove_topping","manage_pizza","share_pizza"]}
{"time":"2026-06-06T20:34:18.381Z","level":"info","component":"relay","event":"refresh_tools.done","url":"https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/","latencyMs":3.988958999998431,"isError":false,"toolCount":7,"toolNames":["set_pizza_size","set_pizza_style","toggle_layer","add_topping","remove_topping","manage_pizza","share_pizza"]}
{"time":"2026-06-06T20:34:21.598Z","level":"debug","component":"relay","event":"mcp.call_tool.received","toolName":"webmcp_search_registry","args":{"keys":["query","limit"]}}
{"time":"2026-06-06T20:34:21.598Z","level":"debug","component":"relay","event":"mcp.call_tool.dispatch","toolName":"webmcp_search_registry","args":{"keys":["query","limit"]}}
{"time":"2026-06-06T20:34:21.599Z","level":"info","component":"relay","event":"search_registry.start","query":"set pizza size large bbq style"}
{"time":"2026-06-06T20:34:21.600Z","level":"info","component":"relay","event":"search_registry.done","query":"set pizza size large bbq style","latencyMs":1.344375000000582,"isError":false,"resultCount":7,"topRegistryId":"webmcp_4e60e97f52b66c15","topToolName":"set_pizza_style"}
{"time":"2026-06-06T20:34:27.819Z","level":"debug","component":"relay","event":"mcp.call_tool.received","toolName":"webmcp_call_tool","args":{"keys":["name","input"],"inputKeys":["size"]}}
{"time":"2026-06-06T20:34:27.820Z","level":"debug","component":"relay","event":"mcp.call_tool.dispatch","toolName":"webmcp_call_tool","args":{"keys":["name","input"],"inputKeys":["size"]}}
{"time":"2026-06-06T20:34:27.820Z","level":"info","component":"relay","event":"call_site_tool.start","url":"https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/","toolName":"set_pizza_size"}
{"time":"2026-06-06T20:34:27.820Z","level":"info","component":"devtools","event":"webmcp_tool.execute.start","toolName":"set_pizza_size","inputKeys":["size"]}
{"time":"2026-06-06T20:34:27.823Z","level":"info","component":"devtools","event":"webmcp_tool.execute.done","toolName":"set_pizza_size","isError":true,"latencyMs":2.6875830000026326}
```

The neat thing is that with these tools, every page the agent visits on the user's behalf leaves a record of what that page could do: its tools, their schemas, the site they came from. Over time you don't have a single page's tools, you now have a personal index of capabilities across every site you've ever touched. Ask for something you've done before and the agent can search the registry, reopen the right site, and run the tool, without you ever saying the words "WebMCP". You just say "book the thing" and it knows where the thing gets booked.

Running `npx webmcp-relay registry list` would show a list of all the discovered tools, and as you can see, the description could be then used in the agent's look-up.

```
id                       tool             origin                              uses  description                                                              url
-----------------------  ---------------  ----------------------------------  ----  -----------------------------------------------------------------------  ------------------------------------------------------------------
webmcp_4e60e97f52b66c15  set_pizza_style  https://googlechromelabs.github.io  2     Set the style of the pizza (colors/theme)                                https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
webmcp_3e98acb9d6148878  set_pizza_size   https://googlechromelabs.github.io  2     Set the pizza size directly or infer it based on the number of people.   https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
webmcp_7ee5f6a78f435bb5  share_pizza      https://googlechromelabs.github.io  1     Get a shareable URL for the current pizza creation                       https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
webmcp_b0994585796e27d6  toggle_layer     https://googlechromelabs.github.io  0     Control pizza layers (sauce, cheese). Use "add", "remove", or "toggle".  https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
webmcp_baaf13d8de6acaa8  add_topping      https://googlechromelabs.github.io  0     Add one or more toppings to the pizza                                    https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
webmcp_a4b14c9df1412dcc  remove_topping   https://googlechromelabs.github.io  0     Remove a specific topping from the pizza                                 https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
webmcp_16dc11bbcf96c478  manage_pizza     https://googlechromelabs.github.io  0     Manage pizza state                                                       https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
```

I find genuinely exciting. But the relay shouldn't have to exist. This should be built into every agent harness that has it's own tools to interact with a browser (built-in, or the users default browser). I really like the fact that the registry of tools builds itself as a side effect of normal use. While you can maintain the list of tools, you don't have to, its just the residue of the agent doing its job, and it best of all it lives on your machine.

Check out the [code](https://github.com/PaulKinlan/WebMCP-relay), give me feedback (It's rough). It's held together with sticky tape, Chrome Canary flags and a couple of SQLite files that are managed by nodejs (I don't know if it works with Bun or Deno yet). But you can see it working...
