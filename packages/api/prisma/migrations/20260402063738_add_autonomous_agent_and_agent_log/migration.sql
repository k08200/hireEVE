-- AlterTable
ALTER TABLE "AutomationConfig" ADD COLUMN     "agentIntervalMin" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "autonomousAgent" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tool" TEXT,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentLog_userId_createdAt_idx" ON "AgentLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
