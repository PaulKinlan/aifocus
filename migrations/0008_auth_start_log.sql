-- Rate limiting for /api/auth/start/* (unauthenticated). One row per start
-- request, keyed by a salted hash of the client IP (see functions/_lib/reader.js
-- hashIp). Bounds the outbound discovery fan-out a single client can drive.
CREATE TABLE IF NOT EXISTS auth_start_log (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_start_log_ip_created ON auth_start_log (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS auth_start_log_created ON auth_start_log (created_at);
