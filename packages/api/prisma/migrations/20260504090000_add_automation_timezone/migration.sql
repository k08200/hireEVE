ALTER TABLE "AutomationConfig" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul';
ALTER TABLE "AutomationConfig" ALTER COLUMN "briefingTime" SET DEFAULT '07:30';
