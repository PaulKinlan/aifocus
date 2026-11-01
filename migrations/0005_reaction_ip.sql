-- aifocus-reader migration 0005: record a client IP hash on reactions.
-- The reader cookie is client-controlled, so rate limiting reactions by
-- reader id alone is bypassed by rotating or dropping the cookie. Reaction
-- rows now carry the same salted ip_hash as annotations, and the per-IP half
-- of isRateLimited() counts them (see functions/_lib/reader.js).
-- Apply with: npx wrangler d1 migrations apply aifocus-reader --remote

ALTER TABLE reactions ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS reactions_ip_created ON reactions (ip_hash, created_at);
