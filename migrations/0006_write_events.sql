-- aifocus-reader migration 0006: append-only write-event ledger for the
-- per-IP rate limit. The limiter used to count live reaction/annotation
-- rows, but a client can toggle reactions on and off, deleting the rows it
-- just created and erasing its own count (62/62 writes accepted). Every
-- accepted write now records one event row that no delete can remove.
-- Apply with: npx wrangler d1 migrations apply aifocus-reader --remote

CREATE TABLE IF NOT EXISTS write_events (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS write_events_ip_created ON write_events (ip_hash, created_at);
-- The opportunistic prune in recordWriteEvent() deletes on created_at alone;
-- without this index that DELETE table-scans the ledger on every write.
CREATE INDEX IF NOT EXISTS write_events_created ON write_events (created_at);
