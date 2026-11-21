// Reader responses on essays: reactions, shared highlights, notes on
// passages and comments. Server side: functions/api/reader/*. Notes and
// comments need a signed-in account (functions/api/auth/*); reactions and
// highlights do not.
//
// Highlights are drawn with the CSS Custom Highlight API, so the article text
// is never modified. Browsers without it still get reactions, notes and
// comments; only the shading is missing. Notes are also shown beside the
// block they quote (see renderMarginNotes). Highlights are snapped to whole
// words and neighbouring ones merged into runs (highlight-runs.js); each
// block with highlights gets one count at its end of the people who marked
// text in it (see renderCounts), so a count never sits inside a word. Those
// elements are marked data-reader-ui and skipped by the text index.

import { quotePatternFor } from "./quote-pattern.js";
import { countLabel, mergeRuns, snapToWords } from "./highlight-runs.js";
import { safeHref, safeImgSrc } from "./safe-href.js";
import { signInControls, takeSignInResult } from "./signin.js";

const section = document.querySelector("#reader");
const content = document.querySelector(".e-content");
const toolbar = document.querySelector(".reader-toolbar");
const dialog = document.querySelector(".reader-dialog");

const post = section?.dataset.post;
const statusEl = section?.querySelector(".reader-status");
const supportsHighlights = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";

let state = null;
let pendingQuote = null;

const setStatus = (text) => {
  if (statusEl) statusEl.textContent = text;
};

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    credentials: "same-origin",
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body.
  }
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
};

// --- Text index over the article -------------------------------------------

const BLOCKS = "p, li, blockquote, pre, figure, h2, h3, h4, h5, h6, table";

// Concatenated text of every text node in the article, with the node and
// offset where each one starts, so offsets in the string map back to a Range.
// `block` is the paragraph-level element a node sits in, and `breaks` holds
// the offsets where the block changes from one node to the next: the text
// has no separator there, so word snapping needs to be told.
const buildTextIndex = () => {
  const nodes = [];
  const breaks = new Set();
  let text = "";
  let lastBlock;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("[data-reader-ui]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = node.parentElement?.closest(BLOCKS) ?? null;
    if (nodes.length && block !== lastBlock) breaks.add(text.length);
    lastBlock = block;
    nodes.push({ node, start: text.length, block });
    text += node.data;
  }
  return { nodes, text, breaks, isBreak: (i) => breaks.has(i) };
};

const locate = (index, offset) => {
  let lo = 0;
  let hi = index.nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index.nodes[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  const entry = index.nodes[lo];
  return { node: entry.node, offset: Math.min(offset - entry.start, entry.node.data.length) };
};

// Offset in the index text of a (node, offset) boundary point: the start of
// the first indexed text node at or after it.
const offsetOf = (index, node, offset) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((e) => e.node === node);
    if (entry) return entry.start + offset;
  }
  const point = document.createRange();
  point.setStart(node, offset);
  const entry = index.nodes.find((e) => point.comparePoint(e.node, 0) >= 0);
  return entry ? entry.start : index.text.length;
};

const similarity = (a, b) => {
  const x = a.replace(/\s+/g, " ").trim();
  const y = b.replace(/\s+/g, " ").trim();
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n += 1;
  return n;
};

// Find the offsets in the index text of a stored quote. Whitespace is
// matched loosely; when the quote occurs more than once, the occurrence whose
// surrounding text best matches the stored prefix and suffix wins.
const findSpan = (index, quote) => {
  const pattern = quotePatternFor(quote.exact);
  if (!pattern) return null;
  // matchAll works from a copy, but reset anyway so the shared pattern cannot
  // carry a stale position into the next note.
  pattern.lastIndex = 0;
  let best = null;
  for (const match of index.text.matchAll(pattern)) {
    const before = index.text.slice(Math.max(0, match.index - 64), match.index);
    const after = index.text.slice(match.index + match[0].length, match.index + match[0].length + 64);
    const score =
      similarity(before, quote.prefix || "") +
      similarity([...after].reverse().join(""), [...(quote.suffix || "")].reverse().join(""));
    if (!best || score > best.score) best = { start: match.index, end: match.index + match[0].length, score };
  }
  return best;
};

const rangeFor = (index, span) => {
  const start = locate(index, span.start);
  const end = locate(index, span.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
};

const findRange = (index, quote) => {
  const span = findSpan(index, quote);
  return span ? rangeFor(index, span) : null;
};

// A Text Fragment link (#:~:text=) that opens the post scrolled to the quote.
const fragmentLink = (quote) => {
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C");
  const words = quote.exact.trim().split(/\s+/);
  const text = words.length > 12
    ? `${enc(words.slice(0, 5).join(" "))},${enc(words.slice(-5).join(" "))}`
    : enc(words.join(" "));
  return `${post}#:~:text=${text}`;
};

// --- Rendering --------------------------------------------------------------

// Passages are snapped to whole words and merged into runs (see
// highlight-runs.js): readers seldom select exactly the same words, and on a
// phone a selection often ends part way through a word.
const runsFor = (index, highlights) => {
  const spans = [];
  for (const h of highlights) {
    const span = findSpan(index, h);
    if (span) spans.push({ start: span.start, end: span.end, people: h.people ?? [], mine: h.mine });
  }
  return mergeRuns(index.text, spans, index.isBreak);
};

// The blocks a run of text touches, ignoring whitespace-only nodes between
// blocks.
const blocksOf = (index, run) => {
  const blocks = new Set();
  for (const entry of index.nodes) {
    if (entry.start >= run.end) break;
    if (entry.start + entry.node.data.length <= run.start || !entry.block) continue;
    if (!entry.node.data.trim()) continue;
    blocks.add(entry.block);
  }
  return blocks;
};

const removeCounts = () => {
  for (const old of content.querySelectorAll(".reader-hl-count")) old.remove();
};

// One count per block with highlighted text in it: the number of distinct
// people who marked any part of the block. It goes at the end of the block,
// after its last word, so it never splits a word or a phrase, however many
// separate passages the block holds. It is a real element (the Custom
// Highlight API cannot draw text), marked data-reader-ui so the text index,
// quote capture and margin notes skip it.
const renderCounts = (index, runs) => {
  const perBlock = new Map();
  for (const run of runs) {
    if (run.people.size === 0) continue;
    for (const block of blocksOf(index, run)) {
      const entry = perBlock.get(block) ?? { people: new Set(), mine: false };
      for (const p of run.people) entry.people.add(p);
      entry.mine ||= run.mine;
      perBlock.set(block, entry);
    }
  }
  for (const [block, { people, mine }] of perBlock) {
    const count = people.size;
    const badge = document.createElement("span");
    badge.className = "reader-hl-count";
    badge.dataset.readerUi = "";
    badge.title = countLabel(count, mine);
    const visible = document.createElement("span");
    visible.setAttribute("aria-hidden", "true");
    visible.textContent = String(count);
    const label = document.createElement("span");
    label.className = "visually-hidden";
    label.textContent = ` (${badge.title})`;
    badge.append(visible, label);
    if (block.matches("pre, table, figure")) {
      // Text added inside these would change what they show; put the count
      // on its own line after the block instead.
      const line = document.createElement("p");
      line.className = "reader-hl-count-line";
      line.dataset.readerUi = "";
      line.append(badge);
      block.after(line);
    } else {
      // In a list item, before any nested list, so the count stays with the
      // item's own text.
      const nested = block.matches("li") ? block.querySelector(":scope > ul, :scope > ol") : null;
      if (nested) nested.before(badge);
      else block.append(badge);
    }
  }
};

const snappedRange = (index, quote) => {
  const span = findSpan(index, quote);
  return span ? rangeFor(index, snapToWords(index.text, span.start, span.end, index.isBreak)) : null;
};

const applyHighlights = () => {
  if (!state) return;
  removeCounts();
  for (const old of content.querySelectorAll(".reader-hl-count-line")) old.remove();
  // Counts are only ever appended between elements, never inside a text
  // node, so the index built here stays valid after renderCounts.
  const index = buildTextIndex();
  const runs = runsFor(index, state.highlights);
  renderCounts(index, runs);
  if (!supportsHighlights) return;
  const tiers = { "reader-shared-1": [], "reader-shared-2": [], "reader-shared-3": [], "reader-mine": [], "reader-note": [] };
  // Your own passages keep their own shading inside a merged run.
  for (const h of state.highlights) {
    if (!h.mine) continue;
    const range = snappedRange(index, h);
    if (range) tiers["reader-mine"].push(range);
  }
  for (const run of runs) {
    const count = run.people.size;
    const range = rangeFor(index, run);
    if (count >= 5) tiers["reader-shared-3"].push(range);
    else if (count >= 2) tiers["reader-shared-2"].push(range);
    else if (count >= 1 && !run.mine) tiers["reader-shared-1"].push(range);
  }
  for (const note of state.notes) {
    const range = note.quote && findRange(index, note.quote);
    if (range) tiers["reader-note"].push(range);
  }
  for (const [name, ranges] of Object.entries(tiers)) {
    CSS.highlights.set(name, new Highlight(...ranges));
  }
};

const STATUS_LABELS = {
  pending: "Awaiting approval, only you can see this",
  rejected: "Not published",
  spam: "Not published",
};

// Sign-in options link back to this essay.
const signInOptions = (providers) => signInControls(providers, post);

const renderWho = (person, fallback) => {
  const href = safeHref(person?.profileUrl);
  const wrap = document.createElement(href ? "a" : "span");
  wrap.className = "reader-who";
  if (href) {
    wrap.href = href;
    wrap.rel = "noopener noreferrer ugc";
  }
  const avatarSrc = safeImgSrc(person?.avatarUrl);
  if (avatarSrc) {
    const img = document.createElement("img");
    img.className = "reader-avatar";
    img.src = avatarSrc;
    img.alt = "";
    img.width = 24;
    img.height = 24;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    wrap.append(img);
  }
  wrap.append(person?.name || person?.displayName || fallback);
  return wrap;
};

const renderAccount = () => {
  const box = section.querySelector("[data-account]");
  const form = section.querySelector('[data-form="comment"]');
  if (state.viewer) {
    const signedIn = document.createElement("span");
    signedIn.append("Signed in as ", renderWho(state.viewer, "you"));
    const out = document.createElement("button");
    out.type = "button";
    out.textContent = "Sign out";
    out.addEventListener("click", signOut);
    const account = document.createElement("a");
    account.href = "/account/";
    account.textContent = "Your account";
    box.replaceChildren(signedIn, account, out);
    form.hidden = false;
  } else {
    const intro = document.createElement("p");
    intro.textContent = state.providers.length
      ? "Sign in to comment or add notes. Your name and avatar from that account are shown with what you write."
      : "Comments are not available right now.";
    box.replaceChildren(intro, ...signInOptions(state.providers));
    form.hidden = true;
  }
};

// One inline reply form at a time, opened under the comment being answered.
let openReplyForm = null;

const closeReplyForm = () => {
  openReplyForm?.remove();
  openReplyForm = null;
};

const renderReplyForm = (item, li) => {
  const form = document.createElement("form");
  form.className = "reader-form reader-reply-form";
  const label = document.createElement("label");
  label.append(`Reply to ${item.name || "this comment"}`);
  const textarea = document.createElement("textarea");
  textarea.name = "body";
  textarea.rows = 3;
  textarea.maxLength = 2000;
  textarea.required = true;
  label.append(textarea);
  const actions = document.createElement("div");
  actions.className = "reader-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    closeReplyForm();
    li.querySelector(":scope > .reader-meta [data-reply]")?.focus();
  });
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Post reply";
  actions.append(cancel, submit);
  form.append(label, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const saved = await createAnnotation({ type: "comment", parentId: item.id, body: textarea.value });
      closeReplyForm();
      setStatus(saved?.status === "approved"
        ? "Reply posted."
        : "Reply saved. Other readers will see it once it is approved.");
    } catch (err) {
      submit.disabled = false;
      setStatus(err.message);
    }
  });
  return form;
};

const renderItem = (item, depth = 0) => {
  const li = document.createElement("li");
  li.className = "reader-item";
  li.dataset.id = item.id;
  if (item.quote) {
    const quote = document.createElement("blockquote");
    const link = document.createElement("a");
    link.href = fragmentLink(item.quote);
    link.textContent = item.quote.exact;
    quote.append(link);
    li.append(quote);
  }
  if (item.body) {
    const body = document.createElement("p");
    body.textContent = item.body;
    li.append(body);
  }
  const meta = document.createElement("p");
  meta.className = "reader-meta";
  const who = renderWho(item, "Anonymous reader");
  const when = document.createElement("time");
  when.dateTime = new Date(item.createdAt).toISOString();
  when.textContent = new Date(item.createdAt).toLocaleDateString();
  meta.append(who);
  if (item.isAuthor) {
    const author = document.createElement("span");
    author.className = "reader-badge reader-badge-author";
    author.textContent = "Author";
    meta.append(author);
  }
  meta.append(when);
  if (item.mine && STATUS_LABELS[item.status]) {
    const badge = document.createElement("span");
    badge.className = "reader-badge";
    badge.textContent = STATUS_LABELS[item.status];
    meta.append(badge);
  }
  // Comments (not notes) can be replied to by any signed-in reader, at any
  // depth. Replies are moderated like comments.
  if (item.type === "comment" && state.viewer) {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.dataset.reply = "";
    reply.textContent = "Reply";
    reply.addEventListener("click", () => {
      const existing = openReplyForm?.parentElement === li;
      closeReplyForm();
      if (existing) return;
      openReplyForm = renderReplyForm(item, li);
      meta.after(openReplyForm);
      openReplyForm.querySelector("textarea").focus();
    });
    meta.append(reply);
  }
  if (item.mine) {
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeAnnotation(item.id));
    meta.append(del);
  }
  li.append(meta);
  if (item.replies?.length) {
    const list = document.createElement("ol");
    list.className = "reader-list reader-replies";
    // Indent stops growing after a few levels so deep threads stay readable
    // on narrow screens; the tree itself has no depth limit.
    if (depth >= 3) list.classList.add("reader-replies-flat");
    list.setAttribute("aria-label", item.replies.length === 1 ? "1 reply" : `${item.replies.length} replies`);
    list.append(...item.replies.map((reply) => renderItem(reply, depth + 1)));
    li.append(list);
  }
  return li;
};

// --- Notes beside the passage they quote ---------------------------------------

// Margin notes need this much room to the right of the article column.
const MARGIN_NOTE_SPACE = 17 * 16;

const wideEnough = () =>
  content.getBoundingClientRect().right + MARGIN_NOTE_SPACE <= document.documentElement.clientWidth;

const blockFor = (range) => {
  const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = start?.closest(BLOCKS);
  return block && content.contains(block) ? block : null;
};

const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const renderMarginNote = (note) => {
  const item = document.createElement("li");
  const quote = document.createElement("blockquote");
  quote.textContent = shorten(note.quote.exact, 90);
  const body = document.createElement("p");
  body.textContent = note.body;
  const meta = document.createElement("p");
  meta.className = "reader-meta";
  meta.append(renderWho(note, "Anonymous reader"));
  if (STATUS_LABELS[note.status]) {
    const badge = document.createElement("span");
    badge.className = "reader-badge";
    badge.textContent = STATUS_LABELS[note.status];
    meta.append(badge);
  }
  item.append(quote, body, meta);
  return item;
};

// Each block with notes gets one <aside>. On a wide window it sits in the
// right margin level with the block (inserted before the block and
// absolutely positioned); otherwise it follows the block as a collapsed
// disclosure. The asides are outside the text index, so they do not affect
// quote matching.
const renderMarginNotes = () => {
  for (const old of content.querySelectorAll(".reader-margin-notes")) old.remove();
  if (!state?.notes.length) return;
  const index = buildTextIndex();
  const groups = new Map();
  for (const note of state.notes) {
    const range = note.quote && findRange(index, note.quote);
    const block = range && blockFor(range);
    if (!block) continue;
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block).push(note);
  }
  // Read the available space before the class write below: measuring after it
  // would make the toggle itself force a layout.
  const wide = wideEnough();
  content.classList.toggle("reader-has-margin-notes", wide);
  // Notes arrive in creation order; lay them out top to bottom so the overlap
  // adjustment only ever pushes an aside down past the one above it.
  const ordered = [...groups].sort(([a], [b]) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const asides = [];
  for (const [block, notes] of ordered) {
    const aside = document.createElement("aside");
    aside.className = "reader-margin-notes";
    aside.dataset.readerUi = "";
    aside.setAttribute("aria-label", notes.length === 1 ? "Note on this passage" : `${notes.length} notes on this passage`);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = notes.length === 1 ? "1 note" : `${notes.length} notes`;
    const list = document.createElement("ul");
    list.append(...notes.map(renderMarginNote));
    details.append(summary, list);
    aside.append(details);
    if (wide) {
      details.open = true;
      block.before(aside);
      asides.push(aside);
    } else {
      block.after(aside);
    }
  }
  if (!wide) return;
  // Keep stacked notes on neighbouring blocks from overlapping. Reading each
  // aside's position as it is inserted made every note force its own layout;
  // the inserts are writes, so all the geometry is read in one pass (the first
  // read flushes layout once and the rest are cached) before the offsets are
  // written back. Each aside is absolutely positioned, so moving one does not
  // move the next, and the offsets stay the same as when they were interleaved.
  const boxes = asides.map((aside) => ({ aside, top: aside.offsetTop, height: aside.offsetHeight }));
  let lastBottom = -Infinity;
  for (const { aside, top, height } of boxes) {
    let start = top;
    if (top < lastBottom + 8) {
      aside.style.marginTop = `${lastBottom + 8 - top}px`;
      start = lastBottom + 8;
    }
    lastBottom = start + height;
  }
};

const render = () => {
  for (const button of section.querySelectorAll(".reader-reaction")) {
    const kind = button.dataset.kind;
    button.querySelector(".reader-count").textContent = String(state.reactions[kind] ?? 0);
    button.setAttribute("aria-pressed", String(state.myReactions.includes(kind)));
  }
  const notesWrap = section.querySelector(".reader-notes");
  notesWrap.hidden = state.notes.length === 0;
  section.querySelector('[data-list="notes"]').replaceChildren(...state.notes.map((n) => renderItem(n)));
  // A refresh rebuilds the list; an open reply form is dropped with it.
  openReplyForm = null;
  section.querySelector('[data-list="comments"]').replaceChildren(...state.comments.map((c) => renderItem(c)));
  renderAccount();
  applyHighlights();
  renderMarginNotes();
};

const refresh = async () => {
  state = await api(`/api/reader/state?post=${encodeURIComponent(post)}`);
  render();
};

// --- Actions ----------------------------------------------------------------

const toggleReaction = async (button) => {
  const kind = button.dataset.kind;
  const on = button.getAttribute("aria-pressed") !== "true";
  button.disabled = true;
  try {
    const res = await api("/api/reader/reactions", {
      method: "POST",
      body: JSON.stringify({ post, kind, on }),
    });
    state.reactions[kind] = res.count;
    state.myReactions = on
      ? [...new Set([...state.myReactions, kind])]
      : state.myReactions.filter((k) => k !== kind);
    render();
  } catch (err) {
    setStatus(err.message);
  } finally {
    button.disabled = false;
  }
};

const signOut = async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    await refresh();
    setStatus("Signed out.");
  } catch (err) {
    setStatus(err.message);
  }
};

const createAnnotation = async (payload) => {
  const res = await api("/api/reader/annotations", {
    method: "POST",
    body: JSON.stringify({ post, ...payload }),
  });
  await refresh();
  return res.annotation;
};

const removeAnnotation = async (id) => {
  try {
    await api(`/api/reader/annotations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
    setStatus("Deleted.");
  } catch (err) {
    setStatus(err.message);
  }
};

// Capture a Range as { exact, prefix, suffix } if it lies inside the article.
const captureRange = (range) => {
  if (!range || range.collapsed || !content.contains(range.commonAncestorContainer)) return null;
  // The quote comes from the text index, not range.toString(), so note text
  // inside a selection (see renderMarginNotes) is left out of it.
  const index = buildTextIndex();
  const { text } = index;
  const rawStart = offsetOf(index, range.startContainer, range.startOffset);
  const rawEnd = Math.max(rawStart, offsetOf(index, range.endContainer, range.endOffset));
  const raw = text.slice(rawStart, rawEnd);
  const trimmedStart = rawStart + raw.length - raw.trimStart().length;
  const trimmedEnd = rawStart + raw.trimEnd().length;
  if (trimmedEnd <= trimmedStart) return null;
  // Store whole words: a selection that stops part way through a word (common
  // on touch screens) is widened to the word's edges.
  const { start, end } = snapToWords(text, trimmedStart, trimmedEnd, index.isBreak);
  const exact = text.slice(start, end);
  if (exact.length < 3) return null;
  return {
    range,
    quote: {
      exact,
      prefix: text.slice(Math.max(0, start - 32), start),
      suffix: text.slice(start + exact.length, start + exact.length + 32),
    },
  };
};

// Capture the current selection, if it lies inside the article.
const captureSelection = () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  return captureRange(selection.getRangeAt(0));
};

const hideToolbar = () => {
  toolbar.hidden = true;
};

const showToolbar = () => {
  const captured = captureSelection();
  if (!captured) {
    hideToolbar();
    return;
  }
  pendingQuote = captured.quote;
  const rect = captured.range.getBoundingClientRect();
  toolbar.hidden = false;
  const width = toolbar.offsetWidth;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    document.documentElement.clientWidth - width - 8,
  );
  toolbar.style.left = `${left + window.scrollX}px`;
  toolbar.style.top = `${rect.bottom + window.scrollY + 8}px`;
};

// Margin notes are laid out for the window width; lay them out again when it
// changes.
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state) renderMarginNotes();
  }, 150);
});

const init = async () => {
  if (!section || !content || !post) return;
  try {
    await refresh();
  } catch {
    // Reader features unavailable (no D1 binding, network error): leave the
    // section hidden so the essay renders exactly as before.
    return;
  }
  section.hidden = false;

  // Back from a sign-in attempt: report the outcome once, then drop the
  // parameter so a reload does not repeat it.
  const signinResult = takeSignInResult();
  if (signinResult) setStatus(signinResult);

  for (const button of section.querySelectorAll(".reader-reaction")) {
    button.addEventListener("click", () => toggleReaction(button));
  }

  section.querySelector('[data-form="comment"]').addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const saved = await createAnnotation({ type: "comment", body: data.get("body") });
      form.reset();
      setStatus(saved?.status === "approved"
        ? "Comment posted."
        : "Comment saved. Other readers will see it once it is approved.");
    } catch (err) {
      setStatus(err.message);
    }
  });

  // selectionchange covers mouse, keyboard and touch selection alike. It is
  // debounced so the toolbar appears once the selection settles.
  let timer = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(timer);
    if (dialog.open) return;
    timer = setTimeout(showToolbar, 200);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideToolbar();
  });

  const runPassageAction = async (action) => {
    if (action === "highlight") {
      try {
        await createAnnotation({ type: "highlight", quote: pendingQuote });
        window.getSelection()?.removeAllRanges();
        setStatus("Highlighted.");
      } catch (err) {
        setStatus(err.message);
      }
    } else if (action === "note") {
      dialog.querySelector(".reader-dialog-quote").textContent = pendingQuote.exact;
      const signedIn = Boolean(state.viewer);
      dialog.querySelector('[data-form="note"]').hidden = !signedIn;
      const signin = dialog.querySelector("[data-note-signin]");
      signin.hidden = signedIn;
      if (!signedIn) {
        const intro = document.createElement("p");
        intro.textContent = "Sign in to add a note. You can select the passage again afterwards.";
        signin.replaceChildren(intro, ...signInOptions(state.providers));
      }
      dialog.showModal();
    }
  };

  toolbar.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action || !pendingQuote) return;
    hideToolbar();
    runPassageAction(action);
  });

  // Commands from the command palette (command-palette.js). detail is
  // { action: "highlight" | "note" | "comment" | "react", range?, kind? }.
  document.addEventListener("aifocus:reader-command", (event) => {
    const { action, range, kind } = event.detail || {};
    if (action === "highlight" || action === "note") {
      const captured = captureRange(range);
      if (!captured) {
        setStatus("Select a passage in the essay first.");
        return;
      }
      pendingQuote = captured.quote;
      runPassageAction(action);
    } else if (action === "comment") {
      // Signed out, the comment form is replaced by the sign-in options.
      const target = state.viewer
        ? section.querySelector('[data-form="comment"] textarea')
        : section.querySelector("[data-account] a, [data-account] input:not([type=hidden])");
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    } else if (action === "react") {
      const button = section.querySelector(`.reader-reaction[data-kind="${CSS.escape(kind || "")}"]`);
      if (button) {
        button.scrollIntoView({ block: "center" });
        toggleReaction(button);
      }
    }
  });

  const noteForm = dialog.querySelector('[data-form="note"]');
  dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => dialog.close());
  // Light dismiss for browsers without <dialog closedby>: a click on the
  // dialog element itself that lands outside its box hit the backdrop.
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside = rect.top <= event.clientY && event.clientY <= rect.bottom
        && rect.left <= event.clientX && event.clientX <= rect.right;
      if (!inside) dialog.close();
    });
  }
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(noteForm);
    try {
      const saved = await createAnnotation({
        type: "note",
        quote: pendingQuote,
        body: data.get("body"),
      });
      noteForm.reset();
      dialog.close();
      window.getSelection()?.removeAllRanges();
      setStatus(saved?.status === "approved"
        ? "Note posted."
        : "Note saved. Other readers will see it once it is approved.");
    } catch (err) {
      setStatus(err.message);
    }
  });
};

init();
