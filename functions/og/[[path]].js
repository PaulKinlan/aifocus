// GET /og/<essay path>.png: the per-essay share card (og:image).
// See functions/_lib/og.js for the render, store and fallback steps.

import { serveCard } from "../_lib/og.js";

export async function onRequestGet({ request, env, params, waitUntil }) {
  const segments = Array.isArray(params?.path) ? params.path : [params?.path].filter(Boolean);
  return serveCard({ request, env, segments, waitUntil });
}
