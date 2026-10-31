// /admin/: moderation queue for reader notes and comments.

const statusEl = document.querySelector("#mod-status");
const list = document.querySelector("#mod-list");
const tabs = [...document.querySelectorAll(".mod-tabs button")];
const searchForm = document.querySelector("#mod-search");
let current = "pending";

const ACTIONS = {
  pending: [["approved", "Approve"], ["rejected", "Reject"], ["spam", "Spam"]],
  approved: [["rejected", "Unpublish"]],
  rejected: [["approved", "Approve"], ["spam", "Spam"]],
  spam: [["approved", "Approve"], ["rejected", "Not spam, reject"]],
};

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
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

const renderItem = (item) => {
  const li = document.createElement("li");
  li.className = "mod-item";

  const meta = document.createElement("p");
  meta.className = "mod-meta";
  const link = document.createElement("a");
  link.href = item.post;
  link.textContent = item.post;
  const type = document.createElement("span");
  type.textContent = item.type;
  // Signed-in writers link to the profile they signed in with.
  const who = document.createElement(item.author_profile_url ? "a" : "span");
  if (item.author_profile_url) {
    who.href = item.author_profile_url;
    who.rel = "noopener noreferrer";
    who.target = "_blank";
  }
  who.textContent = `${item.author_name || "Anonymous reader"}${item.author_trusted ? " (trusted)" : ""}`;
  const when = document.createElement("time");
  when.dateTime = new Date(item.created_at).toISOString();
  when.textContent = new Date(item.created_at).toLocaleString();
  meta.append(link, type, who, when);
  if (item.screen && item.screen !== "safe") {
    const flag = document.createElement("span");
    flag.className = "mod-flag";
    flag.textContent = item.screen === "error" ? "Not screened" : `Flagged: ${item.screen.replace(/^unsafe:?/, "") || "unsafe"}`;
    meta.append(flag);
  }
  li.append(meta);

  if (item.quote_exact) {
    const quote = document.createElement("blockquote");
    quote.textContent = item.quote_exact;
    li.append(quote);
  }
  const body = document.createElement("p");
  body.textContent = item.body || "";
  li.append(body);

  const actions = document.createElement("div");
  actions.className = "mod-actions";
  for (const [status, label] of ACTIONS[current] ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => moderate([item.id], status));
    actions.append(button);
  }
  // Trust is set per account, by hand. Trusted accounts skip the queue.
  if (item.author_id) {
    const trust = document.createElement("button");
    trust.type = "button";
    trust.textContent = item.author_trusted ? "Stop trusting this person" : "Trust this person";
    trust.addEventListener("click", () => setTrust(item.author_id, !item.author_trusted));
    actions.append(trust);
  }
  li.append(actions);
  return li;
};

const renderTrusted = (user) => {
  const li = document.createElement("li");
  li.className = "mod-item";
  const meta = document.createElement("p");
  meta.className = "mod-meta";
  const name = document.createElement(user.profile_url ? "a" : "span");
  if (user.profile_url) {
    name.href = user.profile_url;
    name.rel = "noopener noreferrer";
    name.target = "_blank";
  }
  name.textContent = user.display_name;
  const ids = document.createElement("span");
  ids.textContent = user.identities || "";
  meta.append(name, ids);
  const actions = document.createElement("div");
  actions.className = "mod-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Stop trusting";
  button.addEventListener("click", () => setTrust(user.id, false));
  actions.append(button);
  li.append(meta, actions);
  return li;
};

const loadTrusted = async () => {
  const data = await api("/api/admin/trust");
  list.replaceChildren(...data.users.map(renderTrusted));
  statusEl.textContent = data.users.length
    ? `Signed in as ${data.moderator}. Notes and comments from these people are published without review unless the safety screen flags them.`
    : `Signed in as ${data.moderator}. Nobody is trusted yet: use "Trust this person" on a comment.`;
};

const profileLink = (user) => {
  const name = document.createElement(user.profile_url ? "a" : "span");
  if (user.profile_url) {
    name.href = user.profile_url;
    name.rel = "noopener noreferrer";
    name.target = "_blank";
  }
  name.textContent = user.display_name;
  return name;
};

const renderAccount = (user) => {
  const li = document.createElement("li");
  li.className = "mod-item";
  const meta = document.createElement("p");
  meta.className = "mod-meta";
  const ids = document.createElement("span");
  ids.textContent = user.identities || "";
  const joined = document.createElement("time");
  joined.dateTime = new Date(user.created_at).toISOString();
  joined.textContent = `joined ${new Date(user.created_at).toLocaleDateString()}`;
  meta.append(profileLink(user), ids, joined);
  for (const [flag, on] of [["Trusted", user.trusted], ["Blocked", user.status === "blocked"]]) {
    if (!on) continue;
    const badge = document.createElement("span");
    badge.className = flag === "Blocked" ? "mod-flag" : "";
    badge.textContent = flag;
    meta.append(badge);
  }
  const counts = document.createElement("p");
  counts.className = "mod-meta";
  counts.textContent = `${user.written} notes and comments: ${user.approved} published, ${user.pending} pending, ${user.rejected} rejected or spam`;
  const actions = document.createElement("div");
  actions.className = "mod-actions";
  if (user.status !== "blocked") {
    const trust = document.createElement("button");
    trust.type = "button";
    trust.textContent = user.trusted ? "Stop trusting" : "Trust";
    trust.addEventListener("click", () => setTrust(user.id, !user.trusted));
    actions.append(trust);
  }
  const block = document.createElement("button");
  block.type = "button";
  block.textContent = user.status === "blocked" ? "Unblock" : "Block";
  block.addEventListener("click", () => setBlocked(user.id, user.status !== "blocked"));
  actions.append(block);
  li.append(meta, counts, actions);
  return li;
};

const loadAccounts = async () => {
  const q = searchForm.elements.q.value.trim();
  const data = await api(`/api/admin/accounts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  list.replaceChildren(...data.users.map(renderAccount));
  const plural = (n) => `${n} ${n === 1 ? "account" : "accounts"}`;
  const found = q ? ` ${plural(data.matched)} match "${q}".` : "";
  const shown = data.users.length < data.matched ? ` Showing the newest ${data.users.length}; search to find others.` : "";
  statusEl.textContent = `Signed in as ${data.moderator}. ${plural(data.total)}.${found}${shown}`;
};

// Share cards: the hook line printed under each essay's title on its og:image.
const cardUrl = (path) => `/og/${path.replace(/^\/|\/$/g, "")}.png`;

const renderCard = (item) => {
  const li = document.createElement("li");
  li.className = "mod-item";
  const meta = document.createElement("p");
  meta.className = "mod-meta";
  const link = document.createElement("a");
  link.href = item.path;
  link.textContent = item.title || item.path;
  const source = document.createElement("span");
  source.textContent = item.source === "manual"
    ? "Set by hand"
    : item.source === "ai"
      ? `Workers AI${item.model ? ` (${item.model.replace(/^@cf\//, "")})` : ""}`
      : "No hook yet: one is generated the first time the card is requested";
  const preview = document.createElement("a");
  // The query only defeats the browser cache after an edit; the Function
  // ignores it when it looks up the stored image.
  preview.href = `${cardUrl(item.path)}?t=${item.updated_at || Date.now()}`;
  preview.target = "_blank";
  preview.rel = "noopener";
  preview.textContent = "Open card";
  meta.append(link, source, preview);

  const label = document.createElement("label");
  label.className = "visually-hidden";
  label.htmlFor = `og-${item.path}`;
  label.textContent = `Hook for ${item.title}`;
  const input = document.createElement("textarea");
  input.className = "og-hook";
  input.id = `og-${item.path}`;
  input.rows = 2;
  input.maxLength = 140;
  input.value = item.hook;
  input.placeholder = "One line shown under the title on the share image";

  const actions = document.createElement("div");
  actions.className = "mod-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save hook";
  save.addEventListener("click", () => saveCard({ path: item.path, hook: input.value }));
  const regen = document.createElement("button");
  regen.type = "button";
  regen.textContent = "Generate a new one";
  regen.addEventListener("click", () => saveCard({ path: item.path, regenerate: true }));
  actions.append(save, regen);
  li.append(meta, label, input, actions);
  return li;
};

const loadCards = async () => {
  const data = await api("/api/admin/og");
  list.replaceChildren(...data.items.map(renderCard));
  statusEl.textContent = `Signed in as ${data.moderator}. Saving or regenerating deletes the stored image; the next request renders a new one. Platforms that already fetched the old image keep it until they fetch again.`;
};

const saveCard = async (body) => {
  try {
    const out = await api("/api/admin/og", { method: "POST", body: JSON.stringify(body) });
    await load();
    statusEl.textContent = out.source
      ? `Saved the hook for ${out.path}.`
      : `Cleared the hook for ${out.path}. Open the card to generate a new one.`;
  } catch (err) {
    statusEl.textContent = `Could not update: ${err.message}`;
  }
};

const load = async () => {
  statusEl.textContent = "Loading…";
  searchForm.hidden = current !== "accounts";
  try {
    if (current === "trusted") {
      await loadTrusted();
      return;
    }
    if (current === "accounts") {
      await loadAccounts();
      return;
    }
    if (current === "og") {
      await loadCards();
      return;
    }
    const data = await api(`/api/admin/queue?status=${current}`);
    for (const span of document.querySelectorAll("[data-count]")) {
      const n = data.counts?.[span.dataset.count] ?? 0;
      span.textContent = n ? `(${n})` : "";
    }
    list.replaceChildren(...data.items.map(renderItem));
    statusEl.textContent = data.items.length
      ? `Signed in as ${data.moderator}.`
      : `Signed in as ${data.moderator}. Nothing ${current}.`;
  } catch (err) {
    list.replaceChildren();
    statusEl.textContent = err.status === 403
      ? "Not authorized. /admin/ and /api/admin/ must be behind Cloudflare Access, and ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set on the Pages project."
      : `Could not load the queue: ${err.message}`;
  }
};

const moderate = async (ids, status) => {
  try {
    await api("/api/admin/moderate", { method: "POST", body: JSON.stringify({ ids, status }) });
    await load();
  } catch (err) {
    statusEl.textContent = `Could not update: ${err.message}`;
  }
};

const setTrust = async (userId, trusted) => {
  try {
    await api("/api/admin/trust", { method: "POST", body: JSON.stringify({ userId, trusted }) });
    await load();
  } catch (err) {
    statusEl.textContent = `Could not update: ${err.message}`;
  }
};

const setBlocked = async (userId, blocked) => {
  if (blocked && !confirm("Block this account? It will be signed out and cannot post.")) return;
  try {
    await api("/api/admin/accounts", { method: "POST", body: JSON.stringify({ userId, status: blocked ? "blocked" : "active" }) });
    await load();
  } catch (err) {
    statusEl.textContent = `Could not update: ${err.message}`;
  }
};

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  load();
});

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    current = tab.dataset.status;
    for (const t of tabs) t.setAttribute("aria-pressed", String(t === tab));
    load();
  });
}

load();
