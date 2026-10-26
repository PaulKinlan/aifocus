-- Reader accounts, for signed-in notes and comments and for later community
-- features. An account is separate from the ways of signing in to it:
-- `identities` links external accounts (GitHub, Bluesky, X today; passkeys
-- or email could be added as further identity kinds) to one `users` row.
-- Nothing here stores a password or a provider access token.
-- Apply with: npx wrangler d1 migrations apply aifocus-reader --remote

-- One row per reader account. Display fields are copied from the identity
-- used to create the account and can be changed later. `trusted` is set by
-- the moderator in /admin/; notes and comments from a trusted user are
-- published without waiting in the queue.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  profile_url TEXT,
  trusted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One row per external account linked to a user. `provider_id` is the
-- provider's stable id (GitHub numeric id, Bluesky DID, X user id), never the
-- handle, which can change.
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  handle TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS identities_user ON identities (user_id);

-- Sessions are looked up by the SHA-256 of the cookie value, so a copy of
-- this table cannot be replayed as cookies.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

-- In-flight OAuth sign-ins: the state value sent to the provider, the PKCE
-- verifier, the page to return to, any provider-specific data, and, when a
-- signed-in reader is linking another sign-in method, their account id.
-- Rows are single use and expire after ten minutes.
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  data TEXT,
  link_user_id TEXT,
  created_at INTEGER NOT NULL
);

-- Every reader action taken while signed in records the account (`users.id`
-- is the account key), so a profile or forum page can list a person's
-- reactions, highlights, notes and comments across posts. Rows written
-- before sign-in keep only the anonymous `reader` cookie id.
ALTER TABLE annotations ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS annotations_user ON annotations (user_id, created_at);
ALTER TABLE reactions ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS reactions_user ON reactions (user_id, created_at);
