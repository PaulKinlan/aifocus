-- Rate limiting for /api/ask ("Ask the archive"). One row per question,
-- keyed by a salted hash of the client IP (see functions/_lib/reader.js hashIp).
CREATE TABLE IF NOT EXISTS ask_log (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ask_log_ip_created ON ask_log (ip_hash, created_at);
