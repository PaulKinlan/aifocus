// Which same-origin URL is a published article. The WebMCP read_article tool
// fetches a URL an agent supplied, and fetch() is same-origin and carries the
// reader's session cookie, so checking the origin alone let any path on the
// site through - /api/account, /admin/, /api/admin/og. That is a confused
// deputy inside the origin, not a cross-origin problem: the guard has to name
// the pages the tool is for.
//
// The list is /index.json, the same data list_articles and search_articles
// hand out, so read_article can only fetch URLs those tools would have given.

// "/a-link/" and "/a-link" are the same page; the site links with the slash.
export const normalizeArticlePath = (pathname) => {
  const path = typeof pathname === "string" ? pathname.trim() : "";
  if (!path.startsWith("/")) return null;
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
};

// Index entries are absolute URLs. A relative or malformed entry cannot be
// compared against a pathname, so it is not offered rather than guessed at.
const pathOf = (url) => {
  try {
    return normalizeArticlePath(new URL(url).pathname);
  } catch {
    return null;
  }
};

export const findArticle = (articles, pathname) => {
  const wanted = normalizeArticlePath(pathname);
  if (!wanted || !Array.isArray(articles)) return null;
  for (const article of articles) {
    if (!article || typeof article.url !== "string") continue;
    if (pathOf(article.url) === wanted) return article;
  }
  return null;
};

// The canonical path to fetch once an article matched: the index's own URL, so
// the request goes to the page the index names and not to the agent's spelling.
export const articleFetchPath = (article) => {
  const path = article && typeof article.url === "string" ? pathOf(article.url) : null;
  if (!path) return null;
  return path === "/" ? "/" : `${path}/`;
};
