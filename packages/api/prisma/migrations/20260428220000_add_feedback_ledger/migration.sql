-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('PENDING_ACTION', 'ATTENTION_ITEM', 'NOTIFICATION', 'DRAFT');

-- CreateEnum
CREATE TYPE "FeedbackSignal" AS ENUM ('APPROVED', 'REJECTED', 'EDITED', 'IGNORED', 'SNOOZED', 'DISMISSED');

-- CreateTable: FeedbackEvent — substrate for Step 8 policy learning. Append
-- only; rows are never updated in place so the audit trail of what the user
-- did and when stays clean.
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "FeedbackSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "signal" "FeedbackSignal" NOT NULL,
    "toolName" TEXT,
    "recipient" TEXT,
    "threadId" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: chronological list (newest first) for the inspection API
CREATE INDEX "FeedbackEvent_userId_createdAt_idx" ON "FeedbackEvent"("userId", "createdAt");

-- CreateIndex: "all rejections", "all approvals" type rollups
CREATE INDEX "FeedbackEvent_userId_signal_idx" ON "FeedbackEvent"("userId", "signal");

-- CreateIndex: per-recipient policy ("how do I treat Sarah") — used by #169
CREATE INDEX "FeedbackEvent_userId_recipient_idx" ON "FeedbackEvent"("userId", "recipient");

-- CreateIndex: per-tool policy ("how do I treat send_email") — used by #169
CREATE INDEX "FeedbackEvent_userId_toolName_idx" ON "FeedbackEvent"("userId", "toolName");

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
