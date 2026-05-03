ALTER TABLE "EmailMessage"
  ADD COLUMN IF NOT EXISTS "needsReply" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "needsReplyReason" TEXT,
  ADD COLUMN IF NOT EXISTS "needsReplyConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

CREATE INDEX IF NOT EXISTS "EmailMessage_userId_needsReply_idx"
  ON "EmailMessage"("userId", "needsReply");
