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

// --- Ask the archive ---------------------------------------------------------

const askForm = document.querySelector("#ask-form");
const askInput = document.querySelector("#ask-input");
const askStatus = document.querySelector("#ask-status");
const askAnswer = document.querySelector("#ask-answer");
const askSources = document.querySelector("#ask-sources");
const askSourcesHeading = document.querySelector("#ask-sources-heading");

const ask = async (question) => {
  askAnswer.hidden = true;
  askSourcesHeading.hidden = true;
  askSources.replaceChildren();
  if (!question) return;
  askStatus.textContent = "Retrieving passages and generating an answer…";
  let body;
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ question }),
    });
    body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  } catch (err) {
    askStatus.textContent = `No answer: ${err.message}`;
    return;
  }
  askStatus.textContent = "Generated answer. Check it against the sources below.";
  askAnswer.replaceChildren(
    ...body.answer.split(/\n{2,}/).map((para) => {
      const p = document.createElement("p");
      p.textContent = para.trim();
      return p;
    }),
  );
  askAnswer.hidden = false;
  if (body.sources?.length) {
    askSources.replaceChildren(...body.sources.map(renderResult));
    askSourcesHeading.hidden = false;
  }
};

const params = new URLSearchParams(location.search);

if (form && input && status && list) {
  const query = params.get("q")?.trim() ?? "";
  input.value = query;
  if (!query && !params.has("ask")) input.focus();
  run(query);
}

if (askForm && askInput && askStatus && askAnswer && askSources) {
  const question = params.get("ask")?.trim() ?? "";
  askInput.value = question;
  if (question) {
    askForm.scrollIntoView();
    ask(question);
  }
}
