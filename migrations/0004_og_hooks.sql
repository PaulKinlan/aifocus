-- One-line hooks printed on each essay's share card (functions/_lib/og.js).
-- source: 'ai' when written by Workers AI on first render, 'manual' when set
-- in /admin/. Deleting a row makes the next render generate a new AI hook.
CREATE TABLE IF NOT EXISTS og_hooks (
  path TEXT PRIMARY KEY,
  hook TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
  model TEXT,
  updated_at INTEGER NOT NULL
);
