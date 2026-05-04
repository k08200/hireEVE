-- Backfill schema drift introduced by historical `prisma db push` usage.
--
-- Detected via `prisma migrate diff --from-migrations --to-schema-datamodel`
-- on 2026-05-04. Two divergences remained:
--   1. Notification.link — added to schema in commit 8716d45 (April) but never
--      received a checked-in migration. Caused P2022 on /api/notifications in
--      prod after a clean migrate deploy.
--   2. EmailLabelFeedback.signals/labels — created with SQL DEFAULT
--      ARRAY[]::TEXT[] but schema declares no default. Application always
--      supplies the array via Prisma client, so dropping the default is safe.
--
-- All statements are idempotent (IF NOT EXISTS / DROP DEFAULT) so this can
-- run after any earlier hotfix without conflict.

-- 1. Notification.link
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "link" TEXT;

-- 2. EmailLabelFeedback default cleanup
ALTER TABLE "EmailLabelFeedback" ALTER COLUMN "signals" DROP DEFAULT;
ALTER TABLE "EmailLabelFeedback" ALTER COLUMN "labels" DROP DEFAULT;
