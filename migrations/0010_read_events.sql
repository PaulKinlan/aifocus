-- aifocus-reader migration 0010: append-only read-event ledger for the
-- per-IP cap on /api/reader/state.
--
-- Every post page view fetches reader state, which is a three-statement D1
-- batch (reaction counts, the reader's reactions, and a 500-row annotations
-- join) with no limiter in front of it, so an anonymous loop over one valid
-- post slug drove unbounded queries against a shared database (aifocus-0cz).
-- Read events get their own ledger: sharing write_events would let readers
-- spend writers' budget, and sharing search_log would tie page views to the
-- search cap.
-- Apply with: npx wrangler d1 migrations apply aifocus-reader --remote

CREATE TABLE IF NOT EXISTS read_events (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS read_events_ip_created ON read_events (ip_hash, created_at);
-- The opportunistic prune deletes on created_at alone; without this index that
-- DELETE table-scans the ledger on every read.
CREATE INDEX IF NOT EXISTS read_events_created ON read_events (created_at);
