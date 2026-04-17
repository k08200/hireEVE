-- Enable pg_trgm for fast ILIKE/substring search on Message.content.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index using gin_trgm_ops accelerates case-insensitive substring search
-- used by GET /api/chat/search (Prisma `contains` with `mode: "insensitive"`).
CREATE INDEX IF NOT EXISTS "Message_content_trgm_idx"
  ON "Message" USING gin ("content" gin_trgm_ops);
