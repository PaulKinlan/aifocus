// Command list and matching for the command palette (command-palette.js).
// Kept free of DOM access so tests/palette.test.mjs can run it under Node.

export const FOLLOW_LINKS = [
  { id: "follow-rss", label: "Follow by RSS", href: "/index.xml", keywords: "feed subscribe atom" },
  { id: "follow-newsletter", label: "Subscribe to the newsletter", href: "https://newsletter.aifoc.us", keywords: "email follow" },
  { id: "follow-bluesky", label: "Follow Paul on Bluesky", href: "https://bsky.app/profile/paul.kinlan.me", keywords: "social" },
  { id: "follow-x", label: "Follow Paul on X (Twitter)", href: "https://x.com/paul_kinlan", keywords: "social twitter" },
  { id: "follow-github", label: "View the source on GitHub", href: "https://github.com/paulkinlan/aifocus", keywords: "code repository" },
];

export const NAV_LINKS = [
  { id: "go-home", label: "Go to the home page", href: "/", keywords: "latest front" },
  { id: "go-essays", label: "Browse all essays", href: "/posts/", keywords: "archive list posts" },
  { id: "go-search", label: "Open the search page", href: "/search/", keywords: "find" },
  { id: "go-ask", label: "Open the Ask the archive page", href: "/ask/", keywords: "question answer" },
  { id: "go-account", label: "Your account", href: "/account/", keywords: "profile sign in login comments notes linked" },
];

export const REACTIONS = [
  { kind: "useful", label: "React: Useful" },
  { kind: "new-to-me", label: "React: New to me" },
  { kind: "not-convinced", label: "React: Not convinced" },
];

// Build the static command groups for the current page. `context` describes
// what the page offers: { onEssay, hasSelection }.
export function buildCommands({ onEssay = false, hasSelection = false } = {}) {
  const groups = [];
  if (onEssay) {
    const essay = [];
    if (hasSelection) {
      essay.push(
        { id: "highlight", label: "Highlight the selected passage", keywords: "mark", run: { reader: "highlight" } },
        { id: "note", label: "Add a note to the selected passage", keywords: "annotate comment", run: { reader: "note" } },
        { id: "copy-passage", label: "Copy a link to the selected passage", keywords: "share quote fragment", run: { copy: "passage" } },
      );
    }
    essay.push(
      { id: "comment", label: "Comment on this essay", keywords: "reply respond", run: { reader: "comment" } },
      ...REACTIONS.map((r) => ({ id: `react-${r.kind}`, label: r.label, keywords: "reaction vote", run: { reader: "react", kind: r.kind } })),
      { id: "copy-link", label: "Copy a link to this essay", keywords: "share url", run: { copy: "page" } },
    );
    if (!hasSelection) {
      essay.push({
        id: "select-hint",
        label: "Select a passage first to highlight it or add a note",
        keywords: "highlight note annotate",
        disabled: true,
      });
    }
    groups.push({ id: "essay", label: "This essay", items: essay });
  }
  groups.push({ id: "follow", label: "Follow", items: FOLLOW_LINKS.map((l) => ({ ...l, run: { href: l.href } })) });
  groups.push({ id: "go", label: "Go to", items: NAV_LINKS.map((l) => ({ ...l, run: { href: l.href } })) });
  return groups;
}

// Every query word must appear in the label or keywords (prefix match on a
// word boundary), so "fol rss" finds "Follow by RSS".
export function matchesQuery(item, query) {
  const words = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${item.label} ${item.keywords || ""}`.toLowerCase();
  return words.every((word) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}`, "u").test(haystack));
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function filterGroups(groups, query) {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => matchesQuery(item, query)) }))
    .filter((group) => group.items.length > 0);
}

// A Text Fragment URL (#:~:text=) for a quote. Long quotes use a start,end
// pair so the URL stays short.
export function textFragmentUrl(pageUrl, exact) {
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C");
  const words = (exact || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return pageUrl;
  const text = words.length > 12
    ? `${enc(words.slice(0, 5).join(" "))},${enc(words.slice(-5).join(" "))}`
    : enc(words.join(" "));
  return `${pageUrl.split("#")[0]}#:~:text=${text}`;
}
