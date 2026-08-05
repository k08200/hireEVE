-- Phase 0b (docs/providers/multi-provider-plan.md): copy each user's Naver
-- IMAP connection from the four flat User columns into a LinkedInboxAccount
-- row (provider NAVER) — the shape that makes Naver multi-account.
--
-- Copy, not move: the User columns stay in place (stale, unread by code as of
-- this release) and are dropped by a later contract migration once this
-- release has proven itself in production. Password ciphers transfer as-is —
-- same crypto-tokens keyring either way.
--
-- ON CONFLICT: re-running is a no-op, and a row the user already created by
-- hand (connected via the new route between deploy steps) wins over the copy.

INSERT INTO "LinkedInboxAccount"
  ("id", "userId", "provider", "email", "imapHost", "imapPasswordCipher", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  u."id",
  'NAVER',
  u."naverImapEmail",
  u."naverImapHost",
  u."naverImapPasswordCipher",
  COALESCE(u."naverImapConnectedAt", now()),
  now()
FROM "User" u
WHERE u."naverImapEmail" IS NOT NULL
  AND u."naverImapPasswordCipher" IS NOT NULL
  AND u."naverImapHost" IS NOT NULL
ON CONFLICT ("userId", "provider", "email") DO NOTHING;
