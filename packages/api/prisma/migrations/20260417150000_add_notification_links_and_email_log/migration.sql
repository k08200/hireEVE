-- AlterTable: Notification — add structured source links
ALTER TABLE "Notification" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "sourceEmailId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "pendingActionId" TEXT;

-- AlterTable: AutomationConfig — Gmail auto-mark-read opt-in
ALTER TABLE "AutomationConfig" ADD COLUMN "autoMarkReadEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: EmailProcessingLog
CREATE TABLE "EmailProcessingLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailProcessingLog_userId_emailId_idx" ON "EmailProcessingLog"("userId", "emailId");
CREATE INDEX "EmailProcessingLog_userId_processedAt_idx" ON "EmailProcessingLog"("userId", "processedAt");

-- AddForeignKey
ALTER TABLE "EmailProcessingLog" ADD CONSTRAINT "EmailProcessingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: Notification new indexes + unique constraint on pendingActionId
CREATE UNIQUE INDEX "Notification_pendingActionId_key" ON "Notification"("pendingActionId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_pendingActionId_idx" ON "Notification"("pendingActionId");

-- AddForeignKey: Notification → PendingAction (SetNull so deleting a proposal doesn't cascade the notification away)
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_pendingActionId_fkey" FOREIGN KEY ("pendingActionId") REFERENCES "PendingAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
