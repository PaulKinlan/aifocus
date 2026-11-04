-- Audit log for privileged admin actions (Cloudflare Access protected).
-- Records actor (email), action, subject (e.g. user id), before and after state.
CREATE TABLE IF NOT EXISTS admin_actions (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  before TEXT,
  after TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_actions_subject ON admin_actions (subject, created_at);
CREATE INDEX IF NOT EXISTS admin_actions_created ON admin_actions (created_at);
