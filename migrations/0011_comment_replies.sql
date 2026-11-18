-- Replies to comments. A reply is a `comment` row whose parent_id is the id
-- of the comment (or reply) it answers, so threads nest to any depth. Replies
-- follow the same moderation rules as comments (see
-- functions/api/reader/annotations.js).
-- Apply with: npx wrangler d1 migrations apply aifocus-reader --remote
-- (ALTER TABLE is not re-runnable: run this file once.)
ALTER TABLE annotations ADD COLUMN parent_id TEXT;
CREATE INDEX IF NOT EXISTS annotations_parent ON annotations (parent_id);
