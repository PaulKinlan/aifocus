// /ask/ page: reads ?q=, posts it to /api/ask and renders the generated answer
// with the essays its passages came from.

import { renderResult } from "./search-render.js";

const form = document.querySelector("#ask-form");
const input = document.querySelector("#ask-input");
const status = document.querySelector("#ask-status");
const answer = document.querySelector("#ask-answer");
const sources = document.querySelector("#ask-sources");
const sourcesHeading = document.querySelector("#ask-sources-heading");

const ask = async (question) => {
  answer.hidden = true;
  sourcesHeading.hidden = true;
  sources.replaceChildren();
  if (!question) return;
  status.textContent = "Retrieving passages and generating an answer…";
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
    status.textContent = `No answer: ${err.message}`;
    return;
  }
  status.textContent = "Generated answer. Check it against the sources below.";
  answer.replaceChildren(
    ...body.answer.split(/\n{2,}/).map((para) => {
      const p = document.createElement("p");
      p.textContent = para.trim();
      return p;
    }),
  );
  answer.hidden = false;
  if (body.sources?.length) {
    sources.replaceChildren(...body.sources.map(renderResult));
    sourcesHeading.hidden = false;
  }
};

if (form && input && status && answer && sources) {
  const question = new URLSearchParams(location.search).get("q")?.trim() ?? "";
  input.value = question;
  if (question) ask(question);
  else input.focus();
}
