// WebMCP integration for aifoc.us
// Spec: https://webmachinelearning.github.io/webmcp/
//
// Registers tools on navigator.modelContext so MCP-capable agents running
// in the browser can contact Paul and explore the article catalogue.

import { loadArticleIndex, searchSite } from "./site-search.js";

const OWNER_EMAIL = "paul@aifoc.us";

const textResult = (text) => ({ content: [{ type: "text", text }] });

const extractArticleText = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const content = doc.querySelector(".e-content");
  const title = doc.querySelector(".p-name")?.textContent?.trim()
    || doc.querySelector("title")?.textContent?.trim()
    || "";
  const text = (content?.textContent || doc.body?.textContent || "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
};

const registerTools = (modelContext) => {
  modelContext.registerTool({
    name: "contact_paul",
    description:
      "Compose an email to Paul Kinlan (the author of aifoc.us) at " +
      OWNER_EMAIL +
      ". Use this whenever the user wants to get in touch, ask a question, " +
      "share feedback, or propose something. Opens the user's mail client " +
      "with a pre-filled draft; the user reviews and sends it themselves.",
    inputSchema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Subject line for the email.",
        },
        body: {
          type: "string",
          description:
            "Message body. Write it as the user would, in the first person.",
        },
      },
      required: ["subject", "body"],
    },
    async execute({ subject, body }, agent) {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      const mailto = `mailto:${OWNER_EMAIL}?${params.toString()}`;

      const approved = await agent.requestUserInteraction(async () => {
        return window.confirm(
          `Open your email client to send this message to ${OWNER_EMAIL}?\n\n` +
          `Subject: ${subject}\n\n${body}`,
        );
      });

      if (!approved) {
        return textResult("User declined to send the email.");
      }

      window.location.href = mailto;
      return textResult(
        `Opened the user's mail client with a draft to ${OWNER_EMAIL}.`,
      );
    },
  });

  modelContext.registerTool({
    name: "list_articles",
    description:
      "List essays published on aifoc.us, most recent first. Use this to " +
      "give the user an overview of available articles or to pick something " +
      "to read in full with read_article.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of articles to return (default 20).",
          minimum: 1,
          maximum: 100,
        },
      },
    },
    annotations: { readOnlyHint: true },
    async execute({ limit = 20 }) {
      const index = await loadArticleIndex();
      const articles = index.articles.slice(0, limit).map((a) => ({
        title: a.title,
        url: a.url,
        date: a.date,
        summary: a.summary,
      }));
      return textResult(JSON.stringify({ count: articles.length, articles }, null, 2));
    },
  });

  modelContext.registerTool({
    name: "search_articles",
    description:
      "Search essays on aifoc.us. Uses the site's AI Search index over the " +
      "full text of each essay, and falls back to keyword matching on titles " +
      "and summaries if that index is unavailable (the `source` field says " +
      "which was used). Returns titles, URLs, dates, summaries and, for index " +
      "results, the best-matching passage — use read_article to fetch the " +
      "full body of a match.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text search query.",
        },
        limit: {
          type: "integer",
          description: "Maximum number of matches to return (default 10).",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
    async execute({ query, limit = 10 }) {
      const { source, results } = await searchSite(query, { limit });
      return textResult(
        JSON.stringify(
          { query, source, count: results.length, matches: results },
          null,
          2,
        ),
      );
    },
  });

  modelContext.registerTool({
    name: "read_article",
    description:
      "Fetch the full text of an article on aifoc.us given its URL (from " +
      "list_articles or search_articles). Returns the article's title and " +
      "body as plain text.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Absolute or site-relative URL of the article, e.g. " +
            "https://aifoc.us/a-link-is-all-you-need/ or /a-link-is-all-you-need/.",
        },
      },
      required: ["url"],
    },
    annotations: { readOnlyHint: true },
    async execute({ url }) {
      // The url argument comes from an agent, so it is untrusted input: a
      // malformed string would otherwise throw a TypeError out of the URL
      // constructor and reject the tool call with an opaque runtime error.
      if (typeof url !== "string" || url.trim() === "") {
        return textResult(
          "Invalid article URL: read_article needs a non-empty URL string, " +
            "e.g. https://aifoc.us/a-link-is-all-you-need/ or " +
            "/a-link-is-all-you-need/.",
        );
      }
      let resolved;
      try {
        resolved = new URL(url, window.location.origin);
      } catch {
        return textResult(
          `Invalid article URL: ${url.slice(0, 200)} could not be parsed. Pass ` +
            "an absolute or site-relative URL, e.g. /a-link-is-all-you-need/.",
        );
      }
      if (resolved.origin !== window.location.origin) {
        throw new Error(
          `read_article only reads articles on ${window.location.origin}.`,
        );
      }
      const res = await fetch(resolved.toString(), {
        headers: { Accept: "text/html" },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch article: HTTP ${res.status}`);
      }
      const html = await res.text();
      const { title, text } = extractArticleText(html);
      return textResult(
        JSON.stringify({ url: resolved.toString(), title, text }, null, 2),
      );
    },
  });
};

// modelContext recently moved from navigator to document; prefer document.modelContext
// and fall back to navigator.modelContext for older Chrome builds.
const modelContext =
  (typeof document !== "undefined" && document.modelContext) ||
  (typeof navigator !== "undefined" && navigator.modelContext);
if (modelContext) {
  try {
    registerTools(modelContext);
  } catch (err) {
    console.warn("WebMCP tool registration failed:", err);
  }
}
