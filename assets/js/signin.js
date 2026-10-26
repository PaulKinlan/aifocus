// Sign-in controls shared by the reader section on essays (reader.js) and
// the /account/ page (account-page.js). Server side: functions/api/auth/*.
// Starting a sign-in while already signed in links that sign-in method to
// the current account.

export const SIGNIN_MESSAGES = {
  failed: "Sign-in did not complete. Try again, or use another account.",
  cancelled: "Sign-in was cancelled.",
  expired: "Sign-in took too long. Try again.",
  unavailable: "That sign-in method is not available.",
  "bad-handle": "That is not a valid Bluesky handle. It looks like you.bsky.social.",
  "already-linked": "That account is already linked to a different aifoc.us account.",
  blocked: "This account cannot post here.",
};

export const startUrl = (provider, returnTo) =>
  `/api/auth/start/${provider}?${new URLSearchParams({ return: returnTo })}`;

// One control per provider this deployment offers. Bluesky needs a handle to
// find the reader's server; the others are plain links. `verb` is "Sign in"
// or "Link".
export const signInControls = (providers, returnTo, { verb = "Sign in" } = {}) => {
  const nodes = [];
  for (const provider of providers) {
    if (provider.id === "bluesky") {
      const form = document.createElement("form");
      form.action = "/api/auth/start/bluesky";
      form.method = "get";
      const handle = document.createElement("input");
      handle.type = "text";
      handle.name = "handle";
      handle.placeholder = "you.bsky.social";
      handle.autocomplete = "username";
      handle.setAttribute("aria-label", "Bluesky handle");
      handle.spellcheck = false;
      const go = document.createElement("button");
      go.type = "submit";
      go.textContent = `${verb} with Bluesky`;
      form.append(handle, go);
      // Navigate instead of submitting: the site CSP's form-action also
      // applies to the redirect that follows a form submission, and the
      // reader's Bluesky server can be any origin.
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        location.assign(`${startUrl("bluesky", returnTo)}&${new URLSearchParams({ handle: handle.value.trim() })}`);
      });
      nodes.push(form);
    } else {
      const link = document.createElement("a");
      link.className = "reader-signin-link";
      link.href = startUrl(provider.id, returnTo);
      link.textContent = `${verb} with ${provider.label}`;
      nodes.push(link);
    }
  }
  return nodes;
};

// Read and remove ?signin=<reason> after a sign-in attempt, so a reload does
// not report it again. Returns the message to show, or null.
export const takeSignInResult = () => {
  const params = new URLSearchParams(location.search);
  const signin = params.get("signin");
  if (!signin) return null;
  params.delete("signin");
  const query = params.toString();
  history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  return SIGNIN_MESSAGES[signin] || SIGNIN_MESSAGES.failed;
};
