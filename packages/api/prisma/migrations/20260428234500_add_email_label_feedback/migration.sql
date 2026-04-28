-- CreateTable: EmailLabelFeedback
-- User-supplied corrections of EVE's automatic email priority classification.
-- Captures both the wrong auto-label AND the heuristic signals/reason snapshot
-- so the case can later be replayed as a regression test or few-shot example.
CREATE TABLE "EmailLabelFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "originalPriority" "EmailPriority" NOT NULL,
    "correctedPriority" "EmailPriority" NOT NULL,
    "reason" TEXT,
    "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLabelFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailLabelFeedback_userId_emailId_key" ON "EmailLabelFeedback"("userId", "emailId");
CREATE INDEX "EmailLabelFeedback_userId_createdAt_idx" ON "EmailLabelFeedback"("userId", "createdAt");

ALTER TABLE "EmailLabelFeedback" ADD CONSTRAINT "EmailLabelFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
