-- CreateEnum
CREATE TYPE "AttentionSource" AS ENUM ('PENDING_ACTION', 'TASK', 'CALENDAR_EVENT', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "AttentionType" AS ENUM ('REPLY_NEEDED', 'MEETING_PREP', 'RISK', 'DEADLINE', 'FOLLOWUP', 'DECISION');

-- CreateEnum
CREATE TYPE "AttentionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'SNOOZED');

-- CreateTable: AttentionItem — unified work queue separate from Notification (the bell)
CREATE TABLE "AttentionItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "AttentionSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" "AttentionType" NOT NULL,
    "status" "AttentionStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "autonomyLevel" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "suggestedAction" TEXT,
    "costOfIgnoring" TEXT,
    "evidence" JSONB,
    "surfacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttentionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: enforce one AttentionItem per (source, sourceId) pair
CREATE UNIQUE INDEX "AttentionItem_source_sourceId_key" ON "AttentionItem"("source", "sourceId");

-- CreateIndex: list/sort the user's open queue by recency
CREATE INDEX "AttentionItem_userId_status_surfacedAt_idx" ON "AttentionItem"("userId", "status", "surfacedAt");

-- AddForeignKey
ALTER TABLE "AttentionItem" ADD CONSTRAINT "AttentionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
