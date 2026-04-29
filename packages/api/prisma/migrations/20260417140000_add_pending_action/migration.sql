-- This migration backfills the PendingAction table that was previously created
-- by `db push` against Neon prod but never had a checked-in migration. A clean
-- Supabase database hits a foreign-key error on the next migration without it.

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "toolName" TEXT NOT NULL,
    "toolArgs" TEXT NOT NULL,
    "reasoning" TEXT,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingAction_messageId_key" ON "PendingAction"("messageId");
CREATE INDEX "PendingAction_userId_status_idx" ON "PendingAction"("userId", "status");
CREATE INDEX "PendingAction_conversationId_idx" ON "PendingAction"("conversationId");

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
