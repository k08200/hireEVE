-- Clean bootstrap gap repair.
--
-- Several tables/columns were introduced through `prisma db push` during
-- dogfooding and never received checked-in migrations. A clean production
-- database therefore reached the later EmailLabelFeedback migration without
-- the EmailPriority enum, and would then continue to miss the email/memory/
-- token usage tables that the current Prisma schema expects.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MemoryType" AS ENUM ('PREFERENCE', 'FACT', 'DECISION', 'CONTEXT', 'FEEDBACK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EmailPriority" AS ENUM ('URGENT', 'NORMAL', 'LOW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EmailRuleAction" AS ENUM ('AUTO_REPLY', 'DRAFT_REPLY', 'LABEL', 'ARCHIVE', 'NOTIFY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatModel" TEXT NOT NULL DEFAULT 'openai/gpt-5.4-nano';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agentModel" TEXT;

-- AlterTable: Conversation / Message
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "metadata" TEXT;

-- AlterTable: AutomationConfig notification preferences
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "notifyEmailUrgent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "notifyMeeting" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "notifyTaskDue" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "notifyAgentProposal" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "notifyDailyBriefing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "quietHoursStart" TEXT;
ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "quietHoursEnd" TEXT;

-- CreateTable: Device
CREATE TABLE IF NOT EXISTS "Device" (
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

-- CreateTable: Memory
CREATE TABLE IF NOT EXISTS "Memory" (
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

-- CreateTable: TokenUsage
CREATE TABLE IF NOT EXISTS "TokenUsage" (
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

-- CreateTable: ConversationSummary
CREATE TABLE IF NOT EXISTS "ConversationSummary" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "upToMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmailMessage
CREATE TABLE IF NOT EXISTS "EmailMessage" (
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

-- CreateTable: EmailRule
CREATE TABLE IF NOT EXISTS "EmailRule" (
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Device_tokenHash_key" ON "Device"("tokenHash");
CREATE INDEX IF NOT EXISTS "Device_userId_idx" ON "Device"("userId");

CREATE INDEX IF NOT EXISTS "Memory_userId_type_idx" ON "Memory"("userId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "Memory_userId_type_key_key" ON "Memory"("userId", "type", "key");

CREATE INDEX IF NOT EXISTS "TokenUsage_userId_createdAt_idx" ON "TokenUsage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TokenUsage_conversationId_idx" ON "TokenUsage"("conversationId");

CREATE INDEX IF NOT EXISTS "ConversationSummary_conversationId_idx" ON "ConversationSummary"("conversationId");

CREATE INDEX IF NOT EXISTS "EmailMessage_userId_receivedAt_idx" ON "EmailMessage"("userId", "receivedAt");
CREATE INDEX IF NOT EXISTS "EmailMessage_userId_threadId_idx" ON "EmailMessage"("userId", "threadId");
CREATE INDEX IF NOT EXISTS "EmailMessage_userId_priority_idx" ON "EmailMessage"("userId", "priority");
CREATE INDEX IF NOT EXISTS "EmailMessage_userId_category_idx" ON "EmailMessage"("userId", "category");
CREATE INDEX IF NOT EXISTS "EmailMessage_userId_isRead_idx" ON "EmailMessage"("userId", "isRead");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailMessage_userId_gmailId_key" ON "EmailMessage"("userId", "gmailId");

CREATE INDEX IF NOT EXISTS "EmailRule_userId_isActive_idx" ON "EmailRule"("userId", "isActive");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Device_userId_fkey') THEN
        ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Memory_userId_fkey') THEN
        ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TokenUsage_userId_fkey') THEN
        ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TokenUsage_conversationId_fkey') THEN
        ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversationSummary_conversationId_fkey') THEN
        ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailMessage_userId_fkey') THEN
        ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailRule_userId_fkey') THEN
        ALTER TABLE "EmailRule" ADD CONSTRAINT "EmailRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
