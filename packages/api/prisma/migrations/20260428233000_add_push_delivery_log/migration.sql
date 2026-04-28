-- CreateTable: PushDeliveryLog
-- Records server-side Web Push attempts plus client-side service worker
-- receipts. Web Push success only means the push service accepted the payload;
-- receivedAt/clickedAt are the dogfooding signals that the iOS PWA actually
-- woke up and handled it.
CREATE TABLE "PushDeliveryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "notificationId" TEXT,
    "endpointHost" TEXT,
    "category" TEXT NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "errorStatusCode" INTEGER,
    "errorBody" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PushDeliveryLog_userId_createdAt_idx" ON "PushDeliveryLog"("userId", "createdAt");
CREATE INDEX "PushDeliveryLog_userId_status_createdAt_idx" ON "PushDeliveryLog"("userId", "status", "createdAt");
CREATE INDEX "PushDeliveryLog_subscriptionId_idx" ON "PushDeliveryLog"("subscriptionId");

ALTER TABLE "PushDeliveryLog" ADD CONSTRAINT "PushDeliveryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
