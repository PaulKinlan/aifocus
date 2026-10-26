// Client for POST /api/ask, shared by the /ask/ page and the command palette.
// Resolves to { question, answer, sources } or throws with the server's error.

export const askArchive = async (question, { signal } = {}) => {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
};

// Split a generated answer into paragraph elements. Text only, never HTML.
export const answerParagraphs = (answer) =>
  (answer || "").split(/\n{2,}/).filter((para) => para.trim()).map((para) => {
    const p = document.createElement("p");
    p.textContent = para.trim();
    return p;
  });
