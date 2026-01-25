---
title: If NotebookLM was a web browser
date: "2026-01-25T18:00:00.000Z"
slug: if-notebooklm-was-a-web-browser
description: Building FolioLM - a Chrome extension that brings NotebookLM-style source collection and AI querying directly into the browser
draft: true
authors:
  - paulkinlan
---

NotebookLM is one of my favorite applications in decades. If you haven't experienced it before, it's an application that lets you pull in sources from all around &mdash; Google Drive, PDFs, public links &mdash; collate them into a notebook, and then query or transform that content. Want to turn five research papers into a podcast? Done. Need to extract key takeaways from a collection of articles? Easy. It's a fundamentally different way of interacting with information.

But there's something that has been nagging at me. The browser already _is_ a collection of sources. Tabs, bookmarks, history, tab groups &mdash; these are all repositories of content that I've deemed interesting enough to keep around. Yet the ability to manipulate what's across those sources isn't something we've spent much time thinking about.

What would happen if NotebookLM was actually a web browser?

## The browser as user agent

One of the things I love about browsers and the web is that the browser is my user agent for viewing the entirety of the web. It has full access to the content I consume. Chrome extensions can come in and augment pages, provide extra functionality the original author didn't plan for. The [pliability of hypertext](/elements/) &mdash; HTML, CSS, and JavaScript &mdash; means we can reshape content to suit our needs.

But we haven't really taken this to its logical conclusion. If I have fifteen tabs open about the same topic, why can't I query across all of them? If I've bookmarked a collection of articles over the past year, why can't I transform them into a study guide? The data is right there, inside my browser.

So I started to explore this in a project I call [FolioLM](https://github.com/PaulKinlan/NotebookLM-Chrome).

## The browser sees what you see

Here's something that differentiates FolioLM from NotebookLM and similar tools: FolioLM runs inside your browser, which means it has access to everything _you_ have access to.

That paywall-protected article from the Financial Times? If you're logged in, FolioLM can extract it. That internal wiki behind your corporate firewall? Accessible. That research paper you can only read because your university has a subscription? It's right there.

External tools can only see what's publicly available on the open web. But the browser is your authenticated view of the internet. It carries your cookies, your sessions, your credentials. When you extend the browser with something like a Chrome extension, that extension inherits that same authenticated context.

This is genuinely powerful. The content that matters most to me &mdash; the stuff I'm paying for, the stuff behind logins, the internal documentation &mdash; is exactly the content I most want to query and transform. And because FolioLM operates within the browser, it can.

## What FolioLM does

FolioLM is a Chrome extension that tries to bring NotebookLM-style capabilities directly into the browser. It's built around a few core concepts:

**Source Collection**: You can add sources from anywhere the browser can see:

- The current tab (one click)
- Multiple selected tabs at once
- All tabs in a tab group
- Bookmarks (browse and multi-select)
- Browser history (search and select)
- Right-click any link or image
- Drag and drop links from web pages
- Create your own text notes

{{< figure src="/images/foliolm-source-collection.png" alt="FolioLM source collection interface" caption="Adding sources from tabs, bookmarks, and history" >}}

**Content Extraction**: When you add a source, FolioLM extracts the content and converts it to clean markdown using [Turndown](https://github.com/mixmark-io/turndown). It filters out navigation, ads, and boilerplate &mdash; just the content you actually care about.

**AI-Powered Chat**: Query across all your sources with natural language. Ask questions, get answers with citations back to the original sources. Clicking a citation opens the source URL with text fragment highlighting, so you can see exactly where the information came from.

{{< figure src="/images/foliolm-chat.png" alt="FolioLM chat interface with citations" caption="Querying sources with AI-powered chat and inline citations" >}}

**Transformations**: This is where it gets interesting. FolioLM can transform your collected sources into 19 different formats:

| Category    | Transformations                                         |
| ----------- | ------------------------------------------------------- |
| Educational | Quiz, Flashcards, Study Guide                           |
| Creative    | Podcast Script, Email Summary, Slide Deck               |
| Analytical  | Report, Timeline, Comparison, Data Table, Mind Map      |
| Reference   | Glossary, FAQ, Outline, Citations                       |
| Business    | Action Items, Executive Brief, Key Takeaways, Pros/Cons |

Each transformation is configurable &mdash; you can adjust the number of quiz questions, the tone of the podcast, the depth of the report. The results can be saved, opened in full-screen, or copied to your clipboard.

{{< figure src="/images/foliolm-slide-deck.png" alt="FolioLM slide deck transformation" caption="Transforming sources into a slide deck presentation" >}}

{{< figure src="/images/foliolm-timeline.png" alt="FolioLM timeline transformation" caption="Generating a timeline from collected sources" >}}

{{< figure src="/images/foliolm-study-guide.png" alt="FolioLM study guide transformation" caption="Creating an interactive study guide" >}}

## Built with links in mind

One thing I care deeply about is staying true to the web. FolioLM is designed to enhance your relationship with web content, not replace it.

Every source you add keeps its original URL. There's an external link icon on every source that opens the original page in a new tab. When the AI cites a source in a response, those citations are clickable &mdash; they open the source URL with [text fragment highlighting](https://developer.chrome.com/docs/web-platform/text-fragments), so you land directly on the relevant passage.

The extension also extracts links from the content itself. When you add an article, FolioLM captures all the outbound links along with their anchor text and surrounding context. These get analyzed by AI and surfaced as "Suggested Links" &mdash; related sources you might want to add to your notebook. It's actively encouraging you to explore more of the web, not less.

Source types are visually distinguished with icons &mdash; tabs, bookmarks, history entries &mdash; so you always know where content came from. You can refresh sources to re-extract content from the original URL. Nothing is locked inside the extension; every piece of information has a path back to where it came from.

This matters because it would be easy to build a tool that just ingests content and presents it in a closed environment. But that's not the web. The web is about connections, about following links, about discovering things you didn't know existed. FolioLM tries to amplify that rather than replace it.

## The technical bits

FolioLM is a Manifest V3 Chrome extension built with TypeScript, Preact, and the Vercel AI SDK. It supports 16+ AI providers including Anthropic, OpenAI, Google Gemini, Groq, Mistral, and Chrome's built-in Gemini Nano (which works offline and costs nothing).

The architecture is hooks-based with a clean separation between UI components and business logic. Content extraction happens via a content script that's injected into pages, with a fallback inline extraction for pages loaded before the extension was installed.

One thing I'm particularly proud of is the background execution of transformations. They run in the service worker, which means they continue even if you close the side panel. When you reopen the panel, it syncs with the background state and shows you the completed results.

For anyone interested, the [source is available on GitHub](https://github.com/PaulKinlan/NotebookLM-Chrome).

## Why this matters

There's a pattern I keep coming back to: the browser knows things about my browsing that I don't fully leverage. It knows what tabs I have open. It knows what I've bookmarked. It knows my history. But these remain largely isolated data stores.

When I think about the intersection of AI and the browser, I see an opportunity to make the browser a more intelligent user agent. Not just a renderer of content, but an active participant in how I consume and synthesize information.

Consider a scenario: I find an interesting thread on TechMeme with fifteen different news sources covering the same story. Today, I'd have to open each one, read through them, and manually synthesize. With FolioLM, I can select all those links, add them to a folio, and ask "What are the key differences in how each outlet is covering this story?" Or transform them into a comparison table. Or a timeline of how the story evolved.

This isn't just convenience. It's a fundamentally different relationship with information. The browser becomes less of a window and more of a workshop.

## Suggested links

One feature that emerged from this thinking is "Suggested Links." When FolioLM extracts content, it also extracts links from that content. It then uses AI to filter and rank those links by relevance to your notebook's topic. The result is a list of suggestions: "Based on what you've collected, here are related sources you might want to add."

This feels like the beginning of something. The browser understanding not just what content I have, but what content I might want. It's a small step toward what I'd call an "intelligent reading environment."

## What's next

FolioLM is still a work in progress. PDF support is planned. Video and audio source detection is on the roadmap. And I keep thinking about what it would mean to have this kind of capability built directly into the browser rather than as an extension.

The web has always been about connecting documents. Links are the fundamental unit of the web's structure. But we've mostly treated that structure as something static &mdash; you follow a link, you read a document, you maybe link to it in your own writing. What if the browser could help you see patterns across documents? Synthesize information? Transform it into new forms?

That's the question I'm exploring. And the more I use FolioLM, the more convinced I become that this is a direction worth pursuing.

---

If you want to try it out, FolioLM is [available on GitHub](https://github.com/PaulKinlan/NotebookLM-Chrome). I'd love to hear what you think.
