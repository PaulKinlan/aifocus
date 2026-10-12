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

## Post Titles

- When drafting, reviewing, or editing a post, always review the visible `title` against the post's actual argument, not just the opening anecdote.
- If the title is vague, overly short, too clever, or not descriptive enough for someone browsing the site, suggest stronger alternatives.
- Prefer titles that are lowercase, specific, and intriguing: clear enough to explain the post, but sharp enough to make someone want to click.
- When a post has a `seotitle`, compare it with the visible `title`. Consider whether the SEO title should become the visible title, or whether the visible title needs a better human-facing version.
- Preserve existing slugs unless Paul explicitly asks to change URLs.

## Website Debugging

- Use Chrome DevTools MCP (`chrome-devtools-mcp`) only for website debugging.
- Inspect rendered pages, DOM state, console output, network requests, storage, screenshots, and performance behavior through Chrome DevTools MCP.
- Do not use Playwright, Puppeteer, Selenium, Browserless, curl-only inspection, or ad hoc browser automation as the debugging path for websites.
- If Chrome DevTools MCP is unavailable, say that website debugging is blocked and ask before using any alternative.

## Dependencies

- Nothing in `package.json` reaches the deployed site: there are no runtime `dependencies`, and `hugo-bin` is a devDependency that exists so the gate can run `hugo`.
- `hugo-bin` is pinned at `^0.165.0` because its install-time downloader chain is the only place this repo ever carried advisories: 0.144.x pulled a critical (`@xhmikosr/decompress`) and a high (`http-cache-semantics`) advisory from `bin-wrapper`, plus 9 moderate ones in the same chain. 0.165.0 resolves `file-type` 21.3.4, `decompress` 11.1.4 and `http-cache-semantics` 4.3.0, and `npm audit` reports 0 advisories at every severity, so no `overrides` are needed (aifocus-3ik, aifocus-ubh).
- The `hugo-bin` bump does not change the Hugo binary the site builds with: `hugo-bin.version` in `package.json` (0.147.2, extended) outranks the version the package would default to (0.167.0 in 0.165.0). Builds stay on 0.147.2 and the output is byte-identical across the bump; moving Hugo itself is a separate change that needs its own visual check.
- `hugo-bin` 0.165.0 requires Node >= 22.12.0, so `.nvmrc` pins the Cloudflare Pages build to 22.12 (Pages reads `.nvmrc`/`.node-version`; its current default is 22.16.0).
- Do not add `npm audit` to the gate: it needs the npm registry over the network and the gate is budgeted at ~1.4 s (tools/check.conf).
