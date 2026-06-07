# Agent Instructions

## Language Tone

- Use plain, direct, technically precise language. Avoid hype, marketing phrasing, cute metaphors, and unnecessary flourish.
- Do not anthropomorphize AI systems. Avoid terms such as "brain", "thinks", "believes", "knows", "understands", "wants", "learns", or "remembers" unless the text is describing a literal implemented capability such as persistent memory, retrieval, or online training.
- Prefer accurate technical terms: model, system, training data, knowledge cutoff, model weights, context window, inference, output, retrieved context, tool call, fine-tuning, evaluation, uncertainty, and failure mode.
- When writing about model limitations, name the mechanism: stale training data, missing retrieved context, unavailable tool access, nondeterministic output, hallucinated output, incorrect source data, or runtime failure.
- Keep posts and UI copy grounded in observable behavior. Avoid implying intent, agency, desire, awareness, or subjective experience.

## Website Debugging

- Use Chrome DevTools MCP (`chrome-devtools-mcp`) only for website debugging.
- Inspect rendered pages, DOM state, console output, network requests, storage, screenshots, and performance behavior through Chrome DevTools MCP.
- Do not use Playwright, Puppeteer, Selenium, Browserless, curl-only inspection, or ad hoc browser automation as the debugging path for websites.
- If Chrome DevTools MCP is unavailable, say that website debugging is blocked and ask before using any alternative.
