# Agent Instructions

## Language Tone

- Use plain, direct, technically precise language. Avoid hype, marketing phrasing, cute metaphors, and unnecessary flourish.
- Do not anthropomorphize AI systems. Avoid terms such as "brain", "thinks", "believes", "knows", "understands", "wants", "learns", or "remembers" unless the text is describing a literal implemented capability such as persistent memory, retrieval, or online training.
- Prefer accurate technical terms: model, system, training data, knowledge cutoff, model weights, context window, inference, output, retrieved context, tool call, fine-tuning, evaluation, uncertainty, and failure mode.
- When writing about model limitations, name the mechanism: stale training data, missing retrieved context, unavailable tool access, nondeterministic output, hallucinated output, incorrect source data, or runtime failure.
- Keep posts and UI copy grounded in observable behavior. Avoid implying intent, agency, desire, awareness, or subjective experience.

## Article Drafting and Research

- Treat article drafting as research-backed web publishing, not just plain prose. When planning, drafting, or revising a post, suggest interactive elements that could help readers understand, compare, inspect, or experiment with the idea.
- For every post, actively consider web-native additions such as small demos, calculators, timelines, charts, comparison tables, filters, searchable lists, embedded examples, iframe embeds of related site tools, runnable snippets, or annotated data views.
- Prefer interactive elements that clarify the argument rather than decorate it. Tie each suggestion to the reader question it answers or the concept it makes easier to inspect.
- Link generously to primary sources: specifications, standards discussions, official documentation, release notes, source repositories, research papers, company announcements, data sources, and issue threads.
- Prefer primary sources over commentary. Use secondary sources only when they add analysis, context, or discovery value that the primary source does not provide.
- When a relevant existing post, demo, or page on this blog clearly relates to the topic, include an internal link to it. Search the local content when needed instead of relying on memory.
- When making article suggestions or edits, include concrete link opportunities and interactive-element ideas alongside prose recommendations.

## Website Debugging

- Use Chrome DevTools MCP (`chrome-devtools-mcp`) only for website debugging.
- Inspect rendered pages, DOM state, console output, network requests, storage, screenshots, and performance behavior through Chrome DevTools MCP.
- Do not use Playwright, Puppeteer, Selenium, Browserless, curl-only inspection, or ad hoc browser automation as the debugging path for websites.
- If Chrome DevTools MCP is unavailable, say that website debugging is blocked and ask before using any alternative.
