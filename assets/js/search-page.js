// /search/ page: reads ?q=, runs searchSite() and renders the results.
// The form is a plain GET form, so a submitted search is a normal navigation
// to /search/?q=… and the URL can be shared or bookmarked.

import { searchSite } from "./site-search.js";

const form = document.querySelector("#site-search-form");
const input = document.querySelector("#site-search-input");
const status = document.querySelector("#site-search-status");
const list = document.querySelector("#site-search-results");

const formatDate = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
};

const renderResult = (result) => {
  const item = document.createElement("li");
  item.className = "search-result";

  const heading = document.createElement("h2");
  const link = document.createElement("a");
  link.href = result.url;
  link.textContent = result.title;
  heading.append(link);

  const meta = document.createElement("p");
  meta.className = "search-result-date";
  const time = document.createElement("time");
  time.dateTime = result.date;
  time.textContent = formatDate(result.date);
  meta.append(time);

  item.append(heading, meta);

  const excerpt = result.snippet || result.summary;
  if (excerpt) {
    const body = document.createElement("p");
    body.className = "search-result-snippet";
    body.textContent = excerpt;
    item.append(body);
  }
  return item;
};

const run = async (query) => {
  list.replaceChildren();
  if (!query) {
    status.textContent = "";
    return;
  }
  status.textContent = `Searching for “${query}”…`;
  let response;
  try {
    response = await searchSite(query, { limit: 15 });
  } catch {
    status.textContent = "Search failed. Try again, or browse all essays.";
    return;
  }
  const { results, source } = response;
  if (results.length === 0) {
    status.textContent = `No essays matched “${query}”.`;
    return;
  }
  const plural = results.length === 1 ? "essay" : "essays";
  status.textContent = source === "keyword"
    ? `${results.length} ${plural} matched “${query}” by title and summary (full-text search is unavailable right now).`
    : `${results.length} ${plural} for “${query}”.`;
  list.replaceChildren(...results.map(renderResult));
};

if (form && input && status && list) {
  const query = new URLSearchParams(location.search).get("q")?.trim() ?? "";
  input.value = query;
  if (!query) input.focus();
  run(query);
}
