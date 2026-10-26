// Sign-in providers, in the order they are offered. Each module exports
// id, label, isConfigured(env) and the functions its flow needs; see
// functions/api/auth/start/[provider].js and callback/[provider].js.

import * as github from "./github.js";
import * as bluesky from "./bluesky.js";
import * as x from "./x.js";

export const PROVIDERS = [github, bluesky, x];

export const getProvider = (id) => PROVIDERS.find((p) => p.id === id) ?? null;

export const configuredProviders = (env) =>
  PROVIDERS.filter((p) => p.isConfigured(env)).map((p) => ({ id: p.id, label: p.label }));
