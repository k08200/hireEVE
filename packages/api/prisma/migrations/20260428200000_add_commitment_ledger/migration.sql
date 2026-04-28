-- AlterEnum: AttentionSource — add COMMITMENT
ALTER TYPE "AttentionSource" ADD VALUE 'COMMITMENT';

-- AlterEnum: AttentionType — add three commitment-shaped types
ALTER TYPE "AttentionType" ADD VALUE 'COMMITMENT_DUE';
ALTER TYPE "AttentionType" ADD VALUE 'COMMITMENT_UNCONFIRMED';
ALTER TYPE "AttentionType" ADD VALUE 'COMMITMENT_OVERDUE';

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "CommitmentKind" AS ENUM ('DELIVERABLE', 'FOLLOW_UP', 'DECISION', 'MEETING', 'REVIEW');

-- CreateEnum
CREATE TYPE "CommitmentOwner" AS ENUM ('USER', 'COUNTERPARTY', 'TEAM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommitmentSource" AS ENUM ('EMAIL', 'CHAT', 'SLACK', 'NOTE', 'CALENDAR');

-- CreateTable: Commitment — the promise ledger. AttentionItem rows project
-- "currently relevant" commitments, but the ledger itself is the canonical
-- record of every promise made.
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "kind" "CommitmentKind" NOT NULL DEFAULT 'DELIVERABLE',
    "owner" "CommitmentOwner" NOT NULL DEFAULT 'USER',
    "counterpartyName" TEXT,
    "contactId" TEXT,
    "dueAt" TIMESTAMP(3),
    "dueText" TEXT,
    "sourceType" "CommitmentSource" NOT NULL DEFAULT 'EMAIL',
    "sourceId" TEXT,
    "threadId" TEXT,
    "evidenceText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "dedupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: dedup across re-extractions for the same user
CREATE UNIQUE INDEX "Commitment_userId_dedupKey_key" ON "Commitment"("userId", "dedupKey");

-- CreateIndex: list/sort the user's open ledger by due date
CREATE INDEX "Commitment_userId_status_dueAt_idx" ON "Commitment"("userId", "status", "dueAt");

-- CreateIndex: pull every commitment from one thread (replies grouping)
CREATE INDEX "Commitment_userId_threadId_idx" ON "Commitment"("userId", "threadId");

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
