---
title: building a claw in the browser
date: 2026-05-21T17:05:00.000Z
slug: building-a-claw-in-the-browser
draft: true
authors:
  - paulkinlan
---

We are witnessing a fascinating transition in how we build and run software. In my last post, I wrote about why [the browser is the sandbox](/the-browser-is-the-sandbox/)—explaining how we can leverage the web platform's battle-tested security boundaries to execute untrusted code. But sandboxing is only half the battle. The other half is utility. 

Recently, the open-source community went wild over **OpenClaw** (initially released as Clawdbot/Moltbot). It amassed over 100,000 GitHub stars in a flash because it gave LLMs "hands"—connecting them directly to messaging platforms, filesystems, and execution environments to perform real-world tasks on your behalf. But running a local autonomous agent with unrestricted native filesystem and network privileges is incredibly risky. A single prompt injection or a runaway LLM loop could exfiltrate your SSH keys, delete your database, or run arbitrary shell scripts.

It got me thinking: **Could we build a Claw-like system entirely inside the browser?**

To find out, I've put together a prototype that I'm calling **Chaos** (Chrome Agent Operating System—and yes, I admit I fell in love with the acronym before I fully built the project). Chaos is an open-source, multi-agent browser environment packaged as a Chrome Extension (Manifest V3) that coordinates with a Deno Deploy relay server to act as a complete, sandboxed agent runtime.

Here is a deep dive into the actual architecture, capabilities, and mechanics under the hood of Chaos, and why the browser might just be the ultimate operating system for AI.

---

## The Chaos Architecture: An OS inside an Extension

At its heart, Chaos is packaged as a Chrome Extension. I’ve written before about how [Chrome extensions are the closest thing we have to a declarative agent packaging format](/where-prompts-run/). They declare their permissions upfront in a manifest, their lifecycle is event-driven, and they run inside V8 isolation. 

Chaos structures this environment to act like a mini-OS, split between a Chrome extension frontend and a Deno Deploy relay server:

```
+------------------------------------------------------------------+
|  Chrome Extension (Manifest V3)                                  |
|                                                                  |
|  +------------------+    +-------------------+                   |
|  | app.html (UI)    |    | background.ts     |                   |
|  | - Agent columns  |<-->| (Service Worker)  |                   |
|  | - Task board     |    | - Message routing |                   |
|  | - File explorer  |    | - Hook listeners  |                   |
|  +------------------+    +--------+----------+                   |
|           |                       |                              |
|           v                       v                              |
|  +------------------+    +-------------------+                   |
|  | IndexedDB        |    | OPFS              |                   |
|  | - Conversations  |    | - agents/{id}/    |                   |
|  | - Page cache     |    |   CLAUDE.md       |                   |
|  | - Vector cache   |    |   memories/       |                   |
|  | - WASM binaries  |    | - shared/         |                   |
|  +------------------+    +-------------------+                   |
+------------------------------------------------------------------+
            |  WebSocket + HTTP polling
            v
+------------------------------------------------------------------+
|  Relay Server (Deno Deploy + Deno KV)                           |
|  - REST API / WebSocket pairing                                  |
|  - Webhook channels & Telegram Bot bridge                        |
+------------------------------------------------------------------+
```

### 1. The Master Agent & Sub-Agent Model
Chaos does not rely on a single agent. Instead, it implements a hierarchical master-worker system.
*   **The Master Agent**: The first agent initialized on installation is the Master. It has exclusive access to system-management tools (like `create_agent`, `assign_task`, `find_agent`, and `delete_agent`) to coordinate sub-agents.
*   **Role Templates**: Chaos ships with specialized role templates (master, researcher, coder, writer, planner, reviewer, and general-purpose neutral). Each role is provisioned with a distinct persona loaded directly from templates into the agent's isolated directory.
*   **Self-Evolving Personalities**: In a wild twist of self-modification, agents are empowered to edit their own `CLAUDE.md` instructions in their OPFS directories as they interact with you, adapting their behavior and learning your preferences over time.

### 2. TweetDeck-Style Multi-Column Chat
Most AI chats lock you into a single column. But Chaos adopts a **TweetDeck-style multi-column layout** where you can pin side-by-side conversation columns. You can have a column for your Master agent, another for an active background Research job, and a third representing a developer agent writing code, letting you oversee the entire "chaos" of your agent pool in real-time.

### 3. A Massive Tool Chest (69+ Built-In Tools)
To give agents "hands," Chaos implements a pluggable tool system assembled per-agent and whitelisted/blacklisted dynamically. These are divided into core families:
*   **Chrome APIs (31 tools)**: Managing tabs, windows, cookies, and reading list entries.
*   **File Operations (11 tools)**: Rich interaction with the sandboxed file store (`read_file`, `write_file`, `edit_file`, `grep_file`, `find_files`).
*   **Communication (10 tools)**: Sending messages, managing channels, and syncing state.
*   **Web & Search Grounding (2 tools)**: Extracting clean markdown using a content-script-based Readability+Turndown extractor (`tab_read` with three-tier fallback) or an offscreen document parser (`fetch_page`), combined with LLM provider-native search grounding (Google, Anthropic, or OpenAI search).
*   **WASM Custom Tools (7 tools)**: Safe local processing for hashing, encoding, or text transformation.

Every single tool execution is wrapped in a permission-checking layer where the user can set tool-specific trust rules (always allow, ask each time, never allow) to prevent unauthorized file writes or network calls.

---

## Semantic Tool Lookup & OPFS Storage

To support this heavy workflow, Chaos uses a sophisticated three-tier storage system:

*   **Origin Private File System (OPFS)**: Acts as the primary agent hard drive. Each agent gets its own directory containing its `CLAUDE.md`, append-only `activity-log.jsonl`, a local `TODO.md` checklist, and topic-specific `memories/`. Files are shared via a central `shared/` bus which handles `messages.jsonl` (message bus), `tasks.jsonl` (task board), and `artifacts.jsonl` (published shared artifacts).
*   **IndexedDB**: Caches full conversational history, page contents, WASM binaries, and a **vector cache** for semantic tool lookups. When an agent has access to dozens of tools, passing every schema in the system prompt wastes tokens and causes model confusion. Chaos implements **Keyword** (TF-IDF) and **Embedding** (`text-embedding-3-small` vector similarity) lookup strategies to inject only the tools relevant to the current task.
*   **Chrome Storage**: Keeps lightweight metadata, whitelists, and scheduled alarms synced across your Chrome profile.

---

## Reactive State Hooks: Giving Agents Senses

True agents shouldn't just respond when prompted; they should react to their environment. Chaos implements **14 Hook Trigger Types** that hook directly into native Chrome events:

| Trigger | Event | Typical Use Case |
|---|---|---|
| `bookmark-created` | `chrome.bookmarks.onCreated` | Strip ads, extract text, index in memory. |
| `tab-navigated` | `chrome.tabs.onUpdated` | Trigger an audit or audit page performance. |
| `download-completed` | `chrome.downloads.onChanged` | Read file metadata, run code reviews. |
| `history-visited` | `chrome.history.onVisited` | Extract concepts to build user interest maps. |
| `idle-changed` | `chrome.idle.onStateChanged` | Perform heavy indexing when system is idle. |
| `omnibox` | `chrome.omnibox.onInputEntered` | Custom keyword execution in the URL bar. |
| `context-menu` | `chrome.contextMenus.onClicked` | Highlight text -> trigger deep research. |

When an event fires, the background service worker captures it, resolves the context, builds a prompt, and launches an autonomous `agentic-loop` in the background. If a bookmark hook fires, a background agent can extract the page content, summarize it, and save the digest as a shared artifact without interrupting your active tabs.

---

## Under the Hood: Pluggable Power with `agent-do`

Chaos runs its agent loops using **agent-do**—the provider-agnostic, event-driven agent harness I built as glue around Vercel's AI SDK. 

Because `agent-do` abstracts the core LLM loop, Chaos can swap models on the fly (Gemini 2.5 Pro, Claude 3.5 Sonnet, GPT-4o, or OpenRouter models) and stream progress events directly to the columns. 

One of the most critical challenges of multi-step loops is token bloat. If an agent executes 10 tool calls in a row, repeating the large outputs of those tools in the history quickly exhausts the context window. To solve this, `agent-do` implements **History Hygiene**:
```
Turn 1: [User] -> [Model] -> Call: read_file -> [Result: 1000 lines of code] -> [Model]
                                                                                   |
                                                                        (History Hygiene fires)
                                                                                   v
Turn 2: [User] -> [Model] -> Call: edit_file -> [Result: Edited] -> [Model] (Turn 1 Result becomes <tool_output redacted="stale">)
```
Between loop steps, older `<tool_output>` blocks in the conversation history are replaced with compact `redacted="stale"` self-closing markers. The agent retains the memory of *which* tool ran and on *what* path, but the huge payload is dropped, preventing malicious inputs in files from poisoning later steps and keeping token costs tightly bounded.

---

## The Multi-Channel Bridge: Overcoming Browser Isolation

A major hurdle for any browser-based agent system is accessibility. Because a Chrome extension is hosted locally, it lacks a public IP address, cannot open public ports, and is completely isolated behind the browser’s networking stack. How does a script running on an external server (like a GitHub Action) or a chat message on your phone reach your browser agent to trigger a task?

To bridge this gap, Chaos integrates with a public-facing **Relay Server** (built in Deno and hosted on Deno Deploy) that acts as a secure intermediary.

```
 +-----------------+          +-----------------------------------+          +------------------------------+
 | External Source |          | Relay Server (Deno Deploy)        |          | Chrome Extension             |
 |                 |          |                                   |          |                              |
 |   Webhook POST  |          |  POST /webhook/:id                |          |                              |
 |  -------------->|=========>|  1. Validate signature / secret   |          |                              |
 |                 |          |  2. Store in Deno KV              |          |                              |
 |                 |          |  3. Trigger kv.watch()            |          |                              |
 |                 |          |                                   |          |                              |
 |                 |          |  WebSocket: /ws?token=...         |          |  WebSocket Connection        |
 |                 |          |  ================================>|=========>|  - Wakes up BG script        |
 |                 |          |  - Instant push message payload   |          |  - Dispatches to agentic loop|
 |                 |          |                                   |          |                              |
 |                 |          |  WS "reply" or POST /reply        |          |  Agent runs loop (OPFS files)|
 |  Platform Send  |          |  <================================|<=========|  - Sends reply back to Relay |
 |  <--------------|==========|  - Route to Bot API / Resend      |          |                              |
 +-----------------+          +-----------------------------------+          +------------------------------+
```

### Routing Constraints: One-Way vs. Bidirectional
To maintain tight security boundaries, the Relay Server **only ever routes agent replies back through the exact channel that ingested the original trigger**. The extension dispatches a reply carrying the original `channelId` and `channelType`, which the relay uses to resolve the correct outbound path.

These channels fall into two classifications:

1.  **One-Way (Inbound-Only) Channels**: 
    *   *Example*: Generic HTTP `webhook`.
    *   *Flow*: An external service POSTs JSON data to `POST /webhook/{channelId}?token={secret}`. Because generic webhooks are one-way HTTP pushes, the Relay has no platform endpoint to push replies back to. Instead, when the agent completes its run, the relay stores the output in Deno KV. The external service must poll `GET /responses/{channelId}?since={timestamp}` to retrieve the agent's replies.
2.  **Bidirectional Channels**: 
    *   *Examples*: `telegram`, `discord`, `email`.
    *   *Flow*: The platform dispatches an event (Telegram update, Discord interaction, inbound email) which is stored and sent to the extension. When the agent replies, the relay intercepts it and **immediately dispatches the reply** back to the active chat context using that platform's native API.

### The Inbound Sync: Fast Path vs. Slow Path
Chrome extensions running under Manifest V3 operate with event-driven background service workers (`background.ts`) which Chrome terminates aggressively to save memory. To ensure reliable message delivery, Chaos implements a dual-mode communication engine:

*   **The Fast Path (WebSocket + `kv.watch()`)**: When your browser is open and online, the extension maintains a persistent WebSocket connection to the relay at `GET /ws?token={apiKey}`. The relay uses Deno's native `Deno.kv.watch()` API to observe database writes. The instant an external message is ingested, the relay pushes the payload down the WebSocket. This wakes up the service worker immediately and dispatches the task.
*   **The Slow Path (Chrome Alarm Polling)**: When your laptop is closed, or when the WebSocket connection is severed, the relay caches inbound messages in **Deno KV** (stored safely for up to 24 hours). The extension registers a background Chrome Alarm that wakes up periodically (every 1 minute when offline, or 5 minutes when online) to poll `GET /messages?since={timestamp}`, pulling down any queued events so no triggers are ever lost.

### Deep Dive: The Bidirectional Email Channel
One of the most complex integrations in Chaos is the **Email Channel**, which allows you to send an email to your agent and get a threaded reply back in your inbox. Built on top of **Resend** (for mail delivery) and **Svix** (for webhook signature verification), it runs as a fully realized bidirectional bridge:

1.  **Unique Inbound Addresses**: Registering an email channel generates a unique address matching `{channelName}-{randomSuffix}@{domain}` (using a random 10-character suffix to prevent collisions) and sends a verification link via Resend. Clicking it updates KV, sets `verified: true`, and establishes a sender allowlist (`allowedSenders`) to block spam.
2.  **Inbound Webhook to API Fetching**: When you email your agent, Resend dispatches a webhook to `POST /email/inbound`. To prevent parsing issues with empty webhook bodies, the relay uses the incoming email ID to fetch the full text/HTML and headers directly from Resend's API (`GET https://api.resend.com/emails/receiving/{emailId}`). It also verifies the Svix HMAC-SHA256 signature headers to guarantee authenticity.
3.  **Seamless Email Threading**: To keep conversations structured, the relay parses standard email threading headers: `Message-ID`, `In-Reply-To`, and `References`. It maps the thread ID and sets `isReply: true` so your extension agent knows it is part of a continuing thread.
4.  **Threaded Outbound Replies**: When your agent produces a reply, the relay automatically formats it, prefixes the subject with `Re: ` (maintaining the thread title), and injects the corresponding `In-Reply-To` and `References` headers into Resend's outbound mail payload. This guarantees that your email client (like Gmail or Apple Mail) threads the agent's reply perfectly inline within the original conversation.

### Cryptographic Security Boundaries
Because your local agent has powerful capabilities (like reading and writing to your local OPFS drive), security on the relay is paramount. Chaos enforces **ECDSA Request Signing**:
*   During registration, the extension and relay can exchange an ECDSA P-256 public key.
*   All outgoing replies or updates from the extension are signed using the private key.
*   The relay validates the signature along with `X-Timestamp` (within a 5-minute window) and a random `X-Nonce` header before taking any action, completely preventing session hijacking or payload spoofing.

---

## The Chrome Web Store Paradox

There is a giant elephant in the room when it comes to shipping browser-based AI agents: **The Chrome Web Store policies**.

Modern browser extension guidelines (specifically Manifest V3) are extremely strict about security. They outright prohibit extensions from executing remotely fetched code. Under standard conditions, this makes total sense—it prevents malicious developers from shipping a benign extension and later injecting malware.

But AI changes the definition of "code."

When we run an agent loop using `agent-do`, the LLM generates a series of tool calls and text steps. The system prompt is a markdown document written in plain prose. Is a prompt "code"? In a very real sense, yes—prose is the new programming language, and the LLM is the compiler. The agent-loop evaluates this prose dynamically to determine which actions to take. 

Because of this, shipping a highly capable, dynamically self-modifying agent environment like Chaos through the official Chrome Web Store is incredibly difficult. Google's review processes are not yet equipped to distinguish between a malicious remote script injection and an LLM choosing to call a local, sandboxed file-write tool.

For now, Chaos will remain an open-source experiment that you load locally in Developer Mode. But this paradox highlights a fundamental tension: **How do we regulate the security of self-modifying, agentic software when the program itself is written in natural language?**

---

## Moving Forward

Building Chaos has made one thing abundantly clear: **the web platform already has the building blocks for the future of AI agency.** We don't need to reinvent the operating system or run heavy, insecure VM environments locally to let agents help us. The browser's 30-year-old security model—refined daily to run hostile scripts from strangers—is already the perfect home for autonomous assistants.

By combining V8 sandboxing, declarative manifests, reactive event hooks, and local file storage, we can build agents that have "hands" without giving them the keys to our castle. 

What about you? Would you trust a browser-based agent operating system to manage your tabs, bookmarks, and research? Let me know what you think on Mastodon or Twitter!
