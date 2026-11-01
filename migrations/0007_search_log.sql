-- Rate limiting for /api/search. One row per uncached search query,
-- keyed by a salted hash of the client IP (see functions/_lib/reader.js hashIp).
CREATE TABLE IF NOT EXISTS search_log (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS search_log_ip_created ON search_log (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS search_log_created ON search_log (created_at);

-- Rate limiting for /og/* uncached share-card renders. One row per render,
-- keyed by a salted hash of the client IP (see functions/_lib/reader.js hashIp).
CREATE TABLE IF NOT EXISTS og_render_log (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS og_render_log_ip_created ON og_render_log (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS og_render_log_created ON og_render_log (created_at);
