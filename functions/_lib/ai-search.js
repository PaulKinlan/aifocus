// Access to the `aifocus-search` AI Search instance from Pages Functions.
//
// Cloudflare has three ways to reach an instance, and which of them a Pages
// project supports has changed over time, so this module tries them in order
// and uses the first that answers:
//
//   1. env.AI_SEARCH   an `ai_search_namespaces` binding (current API)
//   2. env.AI          the Workers AI binding's env.AI.autorag() (older API,
//                      documented for Pages Functions)
//   3. env.AI_SEARCH_PUBLIC_URL  the instance's public endpoint, called from
//                      the server so the browser never talks to it directly
//
// Every path returns the same normalized shape: { chunks: [{ key, score, text }] }
// for search, plus { answer } for ask.

export const INSTANCE_NAME = "aifocus-search";

// Accept the chunk shapes the APIs return: AI Search `chunks`
// ({ text, score, item: { key } }) and AutoRAG `data`
// ({ filename, score, attributes, content: [{ text }] }), optionally wrapped
// in a REST `{ result: ... }` envelope.
export function extractChunks(result) {
  if (!result || typeof result !== "object") return [];
  if (result.result && typeof result.result === "object") return extractChunks(result.result);
  if (Array.isArray(result.chunks)) {
    return result.chunks.map((chunk) => ({
      key: chunk?.item?.key ?? chunk?.item?.metadata?.url ?? chunk?.filename,
      score: Number(chunk?.score) || 0,
      text: typeof chunk?.text === "string" ? chunk.text : "",
    }));
  }
  if (Array.isArray(result.data)) {
    return result.data.map((entry) => ({
      key: entry?.attributes?.file?.url ?? entry?.filename,
      score: Number(entry?.score) || 0,
      text: Array.isArray(entry?.content)
        ? entry.content.map((part) => part?.text ?? "").join(" ")
        : "",
    }));
  }
  return [];
}

function extractAnswer(result) {
  if (!result || typeof result !== "object") return "";
  if (result.result && typeof result.result === "object") return extractAnswer(result.result);
  if (typeof result.response === "string") return result.response;
  const content = result.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function postJson(url, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${new URL(url).pathname}: HTTP ${res.status}`);
  return res.json();
}

function strategies(env, fetchImpl) {
  const list = [];
  if (env?.AI_SEARCH && typeof env.AI_SEARCH.get === "function") {
    const instance = () => env.AI_SEARCH.get(INSTANCE_NAME);
    list.push({
      name: "binding",
      search: (query, n) =>
        instance().search({
          messages: [{ role: "user", content: query }],
          ai_search_options: { retrieval: { max_num_results: n }, query_rewrite: { enabled: false } },
        }),
      ask: (query, system, n) =>
        instance().chatCompletions({
          messages: [
            { role: "system", content: system },
            { role: "user", content: query },
          ],
          ai_search_options: { retrieval: { max_num_results: n }, query_rewrite: { enabled: true } },
        }),
    });
  }
  if (env?.AI && typeof env.AI.autorag === "function") {
    list.push({
      name: "autorag",
      search: (query, n) =>
        env.AI.autorag(INSTANCE_NAME).search({ query, max_num_results: n, rewrite_query: false }),
      ask: (query, system, n) =>
        env.AI.autorag(INSTANCE_NAME).aiSearch({
          query,
          system_prompt: system,
          max_num_results: n,
          rewrite_query: true,
        }),
    });
  }
  const base = typeof env?.AI_SEARCH_PUBLIC_URL === "string" ? env.AI_SEARCH_PUBLIC_URL.replace(/\/+$/, "") : "";
  if (/^https:\/\//.test(base)) {
    list.push({
      name: "public-endpoint",
      search: (query, n) =>
        postJson(
          `${base}/search`,
          {
            messages: [{ role: "user", content: query }],
            ai_search_options: { retrieval: { max_num_results: n }, query_rewrite: { enabled: false } },
          },
          fetchImpl,
        ),
      ask: (query, system, n) =>
        postJson(
          `${base}/chat/completions`,
          {
            messages: [
              { role: "system", content: system },
              { role: "user", content: query },
            ],
            ai_search_options: { retrieval: { max_num_results: n }, query_rewrite: { enabled: true } },
          },
          fetchImpl,
        ),
    });
  }
  return list;
}

async function firstThatAnswers(env, fetchImpl, run) {
  const list = strategies(env, fetchImpl);
  if (list.length === 0) throw new Error("No AI Search binding or endpoint is configured");
  let lastError;
  for (const strategy of list) {
    try {
      return { via: strategy.name, raw: await run(strategy) };
    } catch (err) {
      lastError = err;
      console.warn(`ai-search ${strategy.name} failed`, err?.message ?? err);
    }
  }
  throw lastError;
}

export async function searchChunks(env, query, n, { fetchImpl = fetch } = {}) {
  const { via, raw } = await firstThatAnswers(env, fetchImpl, (s) => s.search(query, n));
  return { via, chunks: extractChunks(raw) };
}

export async function askArchive(env, query, system, n, { fetchImpl = fetch } = {}) {
  const { via, raw } = await firstThatAnswers(env, fetchImpl, (s) => s.ask(query, system, n));
  return { via, answer: extractAnswer(raw), chunks: extractChunks(raw) };
}
