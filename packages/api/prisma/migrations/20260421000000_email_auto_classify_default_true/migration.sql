-- Flip the default and backfill every existing row. The feature is the
-- product's core promise ("EVE reads your email"), never an opt-in. Users
-- who signed up before this migration had emailAutoClassify=false, which
-- caused the scheduler to skip their Gmail sync entirely — EVE appeared
-- silent even when new emails arrived.

ALTER TABLE "AutomationConfig"
  ALTER COLUMN "emailAutoClassify" SET DEFAULT true;

UPDATE "AutomationConfig"
  SET "emailAutoClassify" = true
  WHERE "emailAutoClassify" = false;
