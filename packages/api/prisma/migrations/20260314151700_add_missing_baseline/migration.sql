-- Backfill enums and tables that drifted from migration history because they
-- were originally created via `db push` against Neon prod. A clean Postgres
-- cannot bootstrap without them — later migrations reference these types.
-- Placed immediately after init so dependent tables and FKs see them.

-- CreateEnum
CREATE TYPE "AttentionSource" AS ENUM ('PENDING_ACTION', 'TASK', 'CALENDAR_EVENT', 'NOTIFICATION', 'COMMITMENT');

-- CreateEnum
CREATE TYPE "AttentionType" AS ENUM ('REPLY_NEEDED', 'MEETING_PREP', 'RISK', 'DEADLINE', 'FOLLOWUP', 'DECISION', 'COMMITMENT_DUE', 'COMMITMENT_UNCONFIRMED', 'COMMITMENT_OVERDUE');

-- CreateEnum
CREATE TYPE "EmailPriority" AS ENUM ('URGENT', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "EmailRuleAction" AS ENUM ('AUTO_REPLY', 'DRAFT_REPLY', 'LABEL', 'ARCHIVE', 'NOTIFY');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('PREFERENCE', 'FACT', 'DECISION', 'CONTEXT', 'FEEDBACK');

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "upToMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceType" TEXT NOT NULL DEFAULT 'web',
    "ipAddress" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailId" TEXT NOT NULL,
    "threadId" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "body" TEXT,
    "htmlBody" TEXT,
    "labels" TEXT[],
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "priority" "EmailPriority" NOT NULL DEFAULT 'NORMAL',
    "category" TEXT,
    "summary" TEXT,
    "keyPoints" TEXT,
    "actionItems" TEXT,
    "sentiment" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "conditions" TEXT NOT NULL,
    "actionType" "EmailRuleAction" NOT NULL DEFAULT 'AUTO_REPLY',
    "actionValue" TEXT NOT NULL,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MemoryType" NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);
