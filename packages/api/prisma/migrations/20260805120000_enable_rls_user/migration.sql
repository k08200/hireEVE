-- Enable Row-Level Security on "User" — the table the first RLS migration
-- omitted without saying so.
--
-- 20260714140000_enable_rls_permissive covered 43 tables and named three it
-- deliberately skipped (Message, LlmUsageLog, WebhookEvent). "User" was not
-- among either group: it has no "userId" column, so the templated
-- `"userId" = current_setting(...)` shape did not fit and it fell out
-- silently. The result is that the table holding every account's email
-- address is the one table outside the backstop the other 43 get, which
-- inverts the point of the exercise.
--
-- The tenant policy keys on the primary key instead: a user's own row is the
-- one whose id matches the request's tenant context.
--
-- Safety: identical to the earlier migration. ENABLE only, never FORCE, and
-- the app currently connects as a role that both owns the table and carries
-- BYPASSRLS, so this is INERT for the running app — every query still sees
-- every row it did before. It cannot deny-all. See docs/rls-rollout.md.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- A user sees their own row.
CREATE POLICY "User_tenant_isolation" ON "User"
  USING ("id" = current_setting('app.current_user_id', true));

-- Paths with no single owning tenant: schedulers sweeping every account,
-- webhook ingest resolving a user before a context exists, admin fleet views.
CREATE POLICY "User_system_bypass" ON "User"
  USING (current_setting('app.bypass_rls', true) = 'on');
