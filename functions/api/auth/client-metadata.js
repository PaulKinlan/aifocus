// GET /api/auth/client-metadata
//
// The atproto OAuth client metadata document. Its URL is this site's
// client_id for Bluesky sign-in, so it is generated per origin: production
// and preview deployments each describe themselves.

import { clientMetadata } from "../../_lib/providers/bluesky.js";

export function onRequestGet({ request }) {
  const { origin } = new URL(request.url);
  return new Response(JSON.stringify(clientMetadata(origin)), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
