// /search/ page: reads ?q=, runs searchSite() and renders the results.
// The form is a plain GET form, so a submitted search is a normal navigation
// to /search/?q=… and the URL can be shared or bookmarked.

import { searchSite } from "./site-search.js";
import { renderResult } from "./search-render.js";

const form = document.querySelector("#site-search-form");
const input = document.querySelector("#site-search-input");
const status = document.querySelector("#site-search-status");
const list = document.querySelector("#site-search-results");

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
  const fallbackNote = source === "keyword"
    ? " Only titles and summaries were searched (full-text search is unavailable right now)."
    : "";
  if (results.length === 0) {
    status.textContent = `No essays matched “${query}”.${fallbackNote}`;
    return;
  }
  const plural = results.length === 1 ? "essay" : "essays";
  status.textContent = `${results.length} ${plural} for “${query}”.${fallbackNote}`;
  list.replaceChildren(...results.map(renderResult));
};

const params = new URLSearchParams(location.search);

if (form && input && status && list) {
  const query = params.get("q")?.trim() ?? "";
  input.value = query;
  if (!query) input.focus();
  run(query);
}
