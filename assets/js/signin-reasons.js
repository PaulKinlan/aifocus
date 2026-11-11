// Shared by the browser messages and auth redirects. Add a reason here first;
// tests/signin.test.mjs requires every exported value to have a display message.
export const SIGNIN_REASONS = Object.freeze({
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
  unavailable: "unavailable",
  badHandle: "bad-handle",
  alreadyLinked: "already-linked",
  blocked: "blocked",
  ratelimited: "ratelimited",
});
