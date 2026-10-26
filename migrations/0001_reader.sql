-- aifocus-reader: reactions, highlights, notes and comments on essays.
-- Apply with: npx wrangler d1 migrations apply aifocus-reader --remote

-- One row per (post, reaction kind, reader). Counts are aggregated on read.
CREATE TABLE IF NOT EXISTS reactions (
  post TEXT NOT NULL,
  kind TEXT NOT NULL,
  reader TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post, kind, reader)
);

-- Highlights, notes and comments.
--   highlight: a quote from the post, no body. Approved on creation because
--              the server checks that the quote is text from the post.
--   note:      a quote plus a body. Starts pending.
--   comment:   a body about the whole post. Starts pending.
-- A reader always sees their own rows; everyone else sees approved rows only.
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  post TEXT NOT NULL,
  reader TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('highlight', 'note', 'comment')),
  quote_exact TEXT,
  quote_prefix TEXT,
  quote_suffix TEXT,
  body TEXT,
  author_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'spam')),
  screen TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  moderated_at INTEGER,
  moderated_by TEXT
);

CREATE INDEX IF NOT EXISTS annotations_post_status ON annotations (post, status);
CREATE INDEX IF NOT EXISTS annotations_reader ON annotations (reader, created_at);
CREATE INDEX IF NOT EXISTS annotations_status_created ON annotations (status, created_at);
CREATE INDEX IF NOT EXISTS annotations_ip_created ON annotations (ip_hash, created_at);

-- Key/value settings, e.g. the salt used to hash client IPs for rate limiting.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
