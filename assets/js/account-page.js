// /account/: the signed-in reader's profile, linked sign-in methods, and
// everything they have written on the essays. Data: GET /api/account
// (functions/api/account.js). Linking uses the normal sign-in flow: starting
// a sign-in while signed in adds that method to the current account.

import { loadArticleIndex } from "./site-search.js";
import { signInControls, takeSignInResult } from "./signin.js";

const RETURN = "/account/";
const statusEl = document.querySelector("#account-status");
const signedOut = document.querySelector("#account-signed-out");
const signedIn = document.querySelector("#account-signed-in");
const activityList = document.querySelector("#account-activity");
const filters = [...document.querySelectorAll(".account-filters button")];

const TYPE_LABELS = { comment: "Comment", note: "Note", highlight: "Highlight", reaction: "Reaction" };
const STATUS_LABELS = {
  approved: "Published",
  pending: "Awaiting approval, only you can see this",
  rejected: "Not published",
  spam: "Not published",
};
const REACTION_LABELS = { useful: "👍 Useful", "new-to-me": "💡 New to me", "not-convinced": "🤔 Not convinced" };

let items = [];
let filter = "all";
let titles = new Map();

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
};

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
};

const postLink = (post) => el("a", { href: post, text: titles.get(post) || post });

const when = (ms) => el("time", { datetime: new Date(ms).toISOString(), text: new Date(ms).toLocaleDateString() });

const renderProfile = (user) => {
  const profile = document.querySelector("#account-profile");
  const nodes = [];
  if (user.avatarUrl) {
    const img = el("img", { src: user.avatarUrl, alt: "", width: "48", height: "48", referrerpolicy: "no-referrer" });
    nodes.push(img);
  }
  nodes.push(el("strong", { text: user.displayName }));
  const out = el("button", { type: "button", text: "Sign out" });
  out.addEventListener("click", signOut);
  nodes.push(out);
  profile.replaceChildren(...nodes);
};

const renderIdentities = (identities, providers) => {
  const labels = new Map(providers.map((p) => [p.id, p.label]));
  document.querySelector("#account-identities").replaceChildren(
    ...identities.map((identity) => {
      const name = identity.profileUrl
        ? el("a", { href: identity.profileUrl, rel: "noopener noreferrer", text: identity.handle })
        : el("span", { text: identity.handle });
      return el("li", {}, el("p", {}, `${labels.get(identity.provider) || identity.provider}: `, name));
    }),
  );
  const linked = new Set(identities.map((i) => i.provider));
  const remaining = providers.filter((p) => !linked.has(p.id));
  const box = document.querySelector("#account-link");
  box.replaceChildren(
    ...(remaining.length
      ? [el("p", { class: "account-meta", text: "Link another account so you can sign in with either:" }),
        ...signInControls(remaining, RETURN, { verb: "Link" })]
      : []),
  );
};

const statusBadge = (status) =>
  el("span", { class: "account-badge", "data-status": status, text: STATUS_LABELS[status] || status });

const renderItem = (item) => {
  const meta = el("p", { class: "account-meta" }, el("span", { class: "account-badge", text: TYPE_LABELS[item.type] }),
    postLink(item.post), when(item.createdAt));
  if (item.type === "reaction") {
    meta.append(el("span", { text: REACTION_LABELS[item.kind] || item.kind }));
    return el("li", {}, meta);
  }
  if (item.type !== "highlight") meta.append(statusBadge(item.status));
  const remove = el("button", { type: "button", text: "Delete" });
  remove.addEventListener("click", () => deleteItem(item, remove));
  meta.append(remove);
  const li = el("li", {}, meta);
  if (item.quote) li.append(el("blockquote", { text: item.quote }));
  if (item.body) li.append(el("p", { text: item.body }));
  return li;
};

const renderActivity = () => {
  const shown = filter === "all" ? items : items.filter((item) => item.type === filter);
  activityList.replaceChildren(...shown.map(renderItem));
  if (shown.length === 0) {
    activityList.append(el("li", {}, el("p", { class: "account-meta", text: "Nothing here yet." })));
  }
  const counts = {};
  for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
  const parts = ["comment", "note", "highlight", "reaction"]
    .filter((type) => counts[type])
    .map((type) => `${counts[type]} ${TYPE_LABELS[type].toLowerCase()}${counts[type] === 1 ? "" : "s"}`);
  const essays = new Set(items.map((i) => i.post)).size;
  document.querySelector("#account-summary").textContent = parts.length
    ? `${parts.join(", ")} across ${essays} ${essays === 1 ? "essay" : "essays"}.`
    : "You have not written anything on the essays yet.";
};

const deleteItem = async (item, button) => {
  if (!confirm(`Delete this ${TYPE_LABELS[item.type].toLowerCase()}?`)) return;
  button.disabled = true;
  try {
    await api(`/api/reader/annotations?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    items = items.filter((other) => other !== item);
    renderActivity();
    statusEl.textContent = `${TYPE_LABELS[item.type]} deleted.`;
  } catch (err) {
    button.disabled = false;
    statusEl.textContent = `Could not delete: ${err.message}`;
  }
};

const signOut = async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    await load();
    statusEl.textContent = "Signed out.";
  } catch (err) {
    statusEl.textContent = `Could not sign out: ${err.message}`;
  }
};

const showSignedOut = async () => {
  signedIn.hidden = true;
  let providers = [];
  try {
    providers = (await api("/api/auth/me")).providers || [];
  } catch {
    // Shown as "not available" below.
  }
  signedOut.replaceChildren(
    el("p", { text: providers.length
      ? "Sign in to see your comments, notes, highlights and reactions, and the accounts linked to your profile."
      : "Accounts are not available right now." }),
    ...signInControls(providers, RETURN),
  );
  signedOut.hidden = false;
};

const load = async () => {
  let data;
  try {
    data = await api("/api/account");
  } catch (err) {
    if (err.status === 401) {
      if (statusEl.textContent === "Loading…") statusEl.textContent = "";
      await showSignedOut();
      return;
    }
    statusEl.textContent = `Could not load your account: ${err.message}`;
    return;
  }
  try {
    const index = await loadArticleIndex();
    titles = new Map(index.articles.map((a) => [new URL(a.url, location.origin).pathname, a.title]));
  } catch {
    // Without titles, posts are shown by path.
  }
  items = [
    ...data.annotations,
    ...data.reactions.map((r) => ({ ...r, type: "reaction" })),
  ].sort((a, b) => b.createdAt - a.createdAt);
  signedOut.hidden = true;
  renderProfile(data.user);
  renderIdentities(data.identities, data.providers);
  renderActivity();
  signedIn.hidden = false;
  if (statusEl.textContent === "Loading…") statusEl.textContent = "";
};

for (const button of filters) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    for (const other of filters) other.setAttribute("aria-pressed", String(other === button));
    renderActivity();
  });
}

const signinResult = takeSignInResult();
if (signinResult) statusEl.textContent = signinResult;
load();
