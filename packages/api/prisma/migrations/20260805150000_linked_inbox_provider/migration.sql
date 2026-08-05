-- Phase 0a of the multi-provider plan (docs/providers/multi-provider-plan.md):
-- LinkedInboxAccount stops being implicitly Google.
--
--   provider           which service the row belongs to; every existing row is
--                      a Google OAuth link, so the default backfills them all.
--   accessToken        now nullable — IMAP rows never have one. Reads already
--                      guard `row.accessToken ?` (gmail.ts:492,671), so no
--                      code assumed NOT NULL.
--   imapHost /         IMAP-provider credentials: exact host (allowlisted at
--   imapPasswordCipher the route) + AES-256-GCM password cipher via the same
--                      crypto-tokens helper the OAuth ciphers use.
--
-- The dedup key gains provider so one address can exist on two services
-- without colliding. No data is rewritten. The column adds and the NOT NULL
-- drop are metadata-only; the index swap below is the one non-free step (see
-- its comment).

CREATE TYPE "InboxProvider" AS ENUM ('GOOGLE', 'NAVER', 'ICLOUD', 'OUTLOOK', 'IMAP');

ALTER TABLE "LinkedInboxAccount"
  ADD COLUMN "provider" "InboxProvider" NOT NULL DEFAULT 'GOOGLE',
  ADD COLUMN "imapHost" TEXT,
  ADD COLUMN "imapPasswordCipher" TEXT,
  ALTER COLUMN "accessToken" DROP NOT NULL;

-- Not CONCURRENTLY on purpose: Prisma migrations run in a transaction (where
-- CONCURRENTLY is illegal), and the brief write-lock during the rebuild is
-- acceptable on this small Pro-only table — this is not the hot Email table.
DROP INDEX "LinkedInboxAccount_userId_email_key";
CREATE UNIQUE INDEX "LinkedInboxAccount_userId_provider_email_key"
  ON "LinkedInboxAccount"("userId", "provider", "email");
