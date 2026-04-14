-- AlterTable
ALTER TABLE "AutomationConfig" ADD COLUMN "alwaysAllowedTools" TEXT[] DEFAULT ARRAY[]::TEXT[];
