// Reader responses on essays: reactions, shared highlights, notes on
// passages and comments. Server side: functions/api/reader/*. Notes and
// comments need a signed-in account (functions/api/auth/*); reactions and
// highlights do not.
//
// Highlights are drawn with the CSS Custom Highlight API, so the article DOM
// is never modified. Browsers without it still get reactions, notes and
// comments; only the shading is missing.

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

// Concatenated text of every text node in the article, with the node and
// offset where each one starts, so offsets in the string map back to a Range.
const buildTextIndex = () => {
  const nodes = [];
  let text = "";
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: text.length });
    text += node.data;
  }
  return { nodes, text };
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

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const similarity = (a, b) => {
  const x = a.replace(/\s+/g, " ").trim();
  const y = b.replace(/\s+/g, " ").trim();
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n += 1;
  return n;
};

// Find the Range for a stored quote. Whitespace is matched loosely; when the
// quote occurs more than once, the occurrence whose surrounding text best
// matches the stored prefix and suffix wins.
const findRange = (index, quote) => {
  const words = quote.exact.trim().split(/\s+/).map(escapeRegExp);
  if (words.length === 0 || !words[0]) return null;
  const pattern = new RegExp(words.join("\\s+"), "g");
  let best = null;
  for (const match of index.text.matchAll(pattern)) {
    const before = index.text.slice(Math.max(0, match.index - 64), match.index);
    const after = index.text.slice(match.index + match[0].length, match.index + match[0].length + 64);
    const score =
      similarity(before, quote.prefix || "") +
      similarity([...after].reverse().join(""), [...(quote.suffix || "")].reverse().join(""));
    if (!best || score > best.score) best = { start: match.index, end: match.index + match[0].length, score };
  }
  if (!best) return null;
  const start = locate(index, best.start);
  const end = locate(index, best.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
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

const applyHighlights = () => {
  if (!supportsHighlights || !state) return;
  const index = buildTextIndex();
  const tiers = { "reader-shared-1": [], "reader-shared-2": [], "reader-shared-3": [], "reader-mine": [] };
  for (const h of state.highlights) {
    const range = findRange(index, h);
    if (!range) continue;
    if (h.mine) tiers["reader-mine"].push(range);
    if (h.count >= 5) tiers["reader-shared-3"].push(range);
    else if (h.count >= 2) tiers["reader-shared-2"].push(range);
    else if (h.count >= 1 && !h.mine) tiers["reader-shared-1"].push(range);
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
  const wrap = document.createElement(person?.profileUrl ? "a" : "span");
  wrap.className = "reader-who";
  if (person?.profileUrl) {
    wrap.href = person.profileUrl;
    wrap.rel = "noopener noreferrer ugc";
  }
  if (person?.avatarUrl) {
    const img = document.createElement("img");
    img.className = "reader-avatar";
    img.src = person.avatarUrl;
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

const renderItem = (item) => {
  const li = document.createElement("li");
  li.className = "reader-item";
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
  meta.append(who, when);
  if (item.mine && STATUS_LABELS[item.status]) {
    const badge = document.createElement("span");
    badge.className = "reader-badge";
    badge.textContent = STATUS_LABELS[item.status];
    meta.append(badge);
  }
  if (item.mine) {
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeAnnotation(item.id));
    meta.append(del);
  }
  li.append(meta);
  return li;
};

const render = () => {
  for (const button of section.querySelectorAll(".reader-reaction")) {
    const kind = button.dataset.kind;
    button.querySelector(".reader-count").textContent = String(state.reactions[kind] ?? 0);
    button.setAttribute("aria-pressed", String(state.myReactions.includes(kind)));
  }
  const notesWrap = section.querySelector(".reader-notes");
  notesWrap.hidden = state.notes.length === 0;
  section.querySelector('[data-list="notes"]').replaceChildren(...state.notes.map(renderItem));
  section.querySelector('[data-list="comments"]').replaceChildren(...state.comments.map(renderItem));
  renderAccount();
  applyHighlights();
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
  const exact = range.toString();
  if (exact.trim().length < 3) return null;
  const pre = document.createRange();
  pre.setStart(content, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const { text } = buildTextIndex();
  return {
    range,
    quote: {
      exact: exact.trim(),
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
