// Command palette: one dialog for searching essays, asking the archive and
// running page actions (follow, react, comment, highlight, note, copy link).
//
// Opened with Ctrl/Cmd+K or from the header Search and Ask links. Without
// JavaScript those links go to /search/ and /ask/, which keep working on
// their own. The palette is a modal <dialog> with a combobox input and a
// listbox, using aria-activedescendant so focus stays in the input.

import { answerParagraphs, askArchive } from "./ask-client.js";
import { buildCommands, filterGroups, textFragmentUrl } from "./palette-commands.js";
import { formatDate } from "./search-render.js";
import { searchSite } from "./site-search.js";

const SEARCH_DELAY_MS = 250;
const SEARCH_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

let dialog;
let input;
let list;
let answerView;
let hint;
let options = [];
let activeIndex = -1;
let mode = "all"; // "all" or "ask"
let savedRange = null;
let groups = [];
let essayResults = { query: "", state: "idle", results: [] };
let searchTimer = 0;
let searchController = null;
let askController = null;
let uid = 0;

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key in node && typeof value !== "string") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children);
  return node;
};

const build = () => {
  input = el("input", {
    type: "text",
    class: "palette-input",
    role: "combobox",
    "aria-expanded": "true",
    "aria-controls": "palette-list",
    "aria-autocomplete": "list",
    "aria-label": "Search essays, ask a question, or choose an action",
    autocomplete: "off",
    spellcheck: "false",
    enterkeyhint: "go",
    maxlength: "200",
  });
  list = el("div", { id: "palette-list", class: "palette-list", role: "listbox", "aria-label": "Results and actions" });
  answerView = el("section", { class: "palette-answer", "aria-label": "Answer", hidden: true });
  hint = el("p", { class: "palette-hint", role: "status", "aria-live": "polite" });
  const closeButton = el("button", { type: "button", class: "palette-close", "aria-label": "Close", text: "Esc" });
  closeButton.addEventListener("click", () => dialog.close());

  dialog = el(
    "dialog",
    { class: "palette", "aria-label": "Command palette", closedby: "any" },
    el("div", { class: "palette-field" }, input, closeButton),
    list,
    answerView,
    hint,
  );
  document.body.append(dialog);

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeydown);
  list.addEventListener("pointermove", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) setActive(options.indexOf(option), { scroll: false });
  });
  list.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) activate(options.indexOf(option));
  });
  dialog.addEventListener("close", () => {
    clearTimeout(searchTimer);
    searchController?.abort();
    askController?.abort();
  });

  // Light dismiss for browsers without <dialog closedby>: a click whose
  // target is the dialog itself and that lands outside its box hit the backdrop.
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside = rect.top <= event.clientY && event.clientY <= rect.bottom
        && rect.left <= event.clientX && event.clientX <= rect.right;
      if (!inside) dialog.close();
    });
  }
};

// --- Rendering ----------------------------------------------------------------

const optionId = () => `palette-option-${++uid}`;

const renderOption = (item) => {
  const option = el("div", {
    id: optionId(),
    class: "palette-option",
    role: "option",
    "aria-selected": "false",
    "aria-disabled": item.disabled ? "true" : undefined,
  });
  if (item.essay) {
    option.append(
      el("span", { class: "palette-option-title", text: item.essay.title }),
      el("span", { class: "palette-option-meta", text: formatDate(item.essay.date) }),
    );
    const excerpt = item.essay.snippet || item.essay.summary;
    if (excerpt) option.append(el("span", { class: "palette-option-detail", text: excerpt }));
  } else {
    option.append(el("span", { class: "palette-option-title", text: item.label }));
    if (item.detail) option.append(el("span", { class: "palette-option-detail", text: item.detail }));
  }
  option._item = item;
  return option;
};

const renderGroup = (group) => {
  const labelId = optionId();
  return el(
    "div",
    { class: "palette-group", role: "group", "aria-labelledby": labelId },
    el("div", { id: labelId, class: "palette-group-label", role: "presentation", text: group.label }),
    ...group.items.map(renderOption),
  );
};

const queryGroups = (query) => {
  const out = [];
  if (query.length < MIN_QUERY_LENGTH) return out;
  out.push({
    id: "ask",
    label: "Ask the archive",
    items: [{
      id: "ask",
      label: `Ask: “${query}”`,
      detail: "Generates an answer from passages in these essays. Generated answers can be wrong.",
      run: { ask: query },
    }],
  });
  if (mode === "ask") return out;
  const essays = [];
  if (essayResults.query === query && essayResults.state === "done") {
    for (const essay of essayResults.results) essays.push({ id: essay.url, essay, run: { href: essay.url } });
    if (essays.length === 0) essays.push({ id: "none", label: "No matching essays", disabled: true });
    essays.push({ id: "all-results", label: `See all results for “${query}”`, run: { href: `/search/?q=${encodeURIComponent(query)}` } });
  } else {
    essays.push({ id: "searching", label: "Searching essays…", disabled: true });
  }
  out.push({ id: "essays", label: "Essays", items: essays });
  return out;
};

const render = () => {
  const query = input.value.trim();
  const commands = mode === "ask" ? [] : filterGroups(groups, query);
  // Commands and the Ask row render synchronously ahead of the essay results,
  // so results arriving later never move the row Enter would activate.
  const all = [...commands, ...queryGroups(query)];
  const previous = options[activeIndex]?._item?.id;
  list.replaceChildren(...all.map(renderGroup));
  options = [...list.querySelectorAll('[role="option"]')];
  const keep = options.findIndex((o) => o._item.id === previous && !o._item.disabled);
  setActive(keep >= 0 ? keep : firstEnabled(0, 1));
  if (all.length === 0) {
    list.append(el("p", { class: "palette-empty", text: mode === "ask" ? "Type a question, then press Enter." : "No matching actions." }));
  }
};

const firstEnabled = (start, step) => {
  for (let i = start; i >= 0 && i < options.length; i += step) {
    if (!options[i]._item.disabled) return i;
  }
  return -1;
};

const setActive = (index, { scroll = true } = {}) => {
  if (index >= 0 && options[index]?._item.disabled) return;
  options[activeIndex]?.setAttribute("aria-selected", "false");
  activeIndex = index;
  const option = options[index];
  if (option) {
    option.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", option.id);
    if (scroll) option.scrollIntoView({ block: "nearest" });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
};

const move = (step) => {
  if (options.length === 0) return;
  let i = activeIndex;
  for (let n = 0; n < options.length; n += 1) {
    i = (i + step + options.length) % options.length;
    if (!options[i]._item.disabled) {
      setActive(i);
      return;
    }
  }
};

// --- Search and ask -----------------------------------------------------------

const scheduleSearch = () => {
  clearTimeout(searchTimer);
  searchController?.abort();
  const query = input.value.trim();
  if (mode === "ask" || query.length < MIN_QUERY_LENGTH) return;
  essayResults = { query, state: "loading", results: [] };
  searchTimer = setTimeout(async () => {
    searchController = new AbortController();
    try {
      const body = await searchSite(query, { limit: SEARCH_LIMIT, signal: searchController.signal });
      if (input.value.trim() !== query) return;
      essayResults = { query, state: "done", results: body.results || [] };
      render();
    } catch (err) {
      if (err?.name !== "AbortError") {
        essayResults = { query, state: "done", results: [] };
        render();
      }
    }
  }, SEARCH_DELAY_MS);
};

const showList = () => {
  askController?.abort();
  answerView.hidden = true;
  answerView.replaceChildren();
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
};

const showAnswer = async (question) => {
  list.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  const status = el("p", { class: "palette-status", role: "status", text: "Retrieving passages and generating an answer…" });
  const back = el("button", { type: "button", class: "palette-back", text: "← Back to results" });
  back.addEventListener("click", () => {
    showList();
    render();
    input.focus();
  });
  answerView.replaceChildren(back, el("h2", { class: "palette-question", text: question }), status);
  answerView.hidden = false;

  askController?.abort();
  askController = new AbortController();
  let body;
  try {
    body = await askArchive(question, { signal: askController.signal });
  } catch (err) {
    if (err?.name === "AbortError") return;
    status.textContent = `No answer: ${err.message}`;
    return;
  }
  status.textContent = "Generated answer. Check it against the sources below.";
  const answer = el("div", { class: "palette-answer-text" }, ...answerParagraphs(body.answer));
  answerView.append(answer);
  if (body.sources?.length) {
    answerView.append(
      el("h3", { class: "palette-group-label", text: "Sources" }),
      el("ul", { class: "palette-sources" }, ...body.sources.map((source) =>
        el("li", {}, el("a", { href: source.url, text: source.title }), " ",
          el("span", { class: "palette-option-meta", text: formatDate(source.date) })))),
    );
  }
  answerView.append(el("a", { class: "palette-permalink", href: `/ask/?q=${encodeURIComponent(question)}`, text: "Open this answer on its own page" }));
};

// --- Actions --------------------------------------------------------------------

const copy = async (text, done) => {
  try {
    await navigator.clipboard.writeText(text);
    hint.textContent = done;
  } catch {
    hint.textContent = "Copying is not available here. The link is in the address bar.";
  }
};

const activate = (index) => {
  const item = options[index]?._item;
  if (!item || item.disabled || !item.run) return;
  const { run } = item;
  if (run.ask) {
    showAnswer(run.ask);
  } else if (run.href) {
    dialog.close();
    location.href = run.href;
  } else if (run.copy === "page") {
    copy(location.href.split("#")[0], "Link to this essay copied.");
  } else if (run.copy === "passage") {
    copy(textFragmentUrl(location.href, savedRange?.toString()), "Link to the passage copied.");
  } else if (run.reader) {
    const range = savedRange;
    dialog.close();
    document.dispatchEvent(new CustomEvent("aifocus:reader-command", {
      detail: { action: run.reader, kind: run.kind, range },
    }));
  }
};

const onInput = () => {
  hint.textContent = "";
  if (!answerView.hidden) showList();
  scheduleSearch();
  render();
};

const onKeydown = (event) => {
  if (event.isComposing) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (!answerView.hidden) {
      const question = input.value.trim();
      if (question) showAnswer(question);
    } else {
      activate(activeIndex);
    }
  }
};

// --- Opening --------------------------------------------------------------------

const selectedArticleRange = () => {
  const content = document.querySelector(".e-content");
  const selection = window.getSelection();
  if (!content || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!content.contains(range.commonAncestorContainer) || range.toString().trim().length < 3) return null;
  return range.cloneRange();
};

export const openPalette = ({ mode: nextMode = "all", query = "" } = {}) => {
  if (!dialog) build();
  if (dialog.open) {
    input.focus();
    return;
  }
  savedRange = selectedArticleRange();
  const reader = document.querySelector("#reader");
  groups = buildCommands({ onEssay: Boolean(reader && !reader.hidden), hasSelection: Boolean(savedRange) });
  mode = nextMode;
  input.placeholder = mode === "ask"
    ? "Ask a question about the essays"
    : "Search essays, ask a question, or choose an action";
  input.value = query;
  hint.textContent = "";
  essayResults = { query: "", state: "idle", results: [] };
  showList();
  render();
  scheduleSearch();
  dialog.showModal();
  input.focus();
};

export const initPalette = () => {
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
    if (event.altKey || event.shiftKey) return;
    event.preventDefault();
    openPalette();
  });
  // Header links open the palette; modified clicks (new tab, etc.) and
  // no-JavaScript visits still go to the pages.
  for (const link of document.querySelectorAll(".site-navigation a[data-palette]")) {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openPalette({ mode: link.dataset.palette });
    });
  }
};
