-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_subject_key" ON "UserIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_userId_provider_key" ON "UserIdentity"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS backstop, same templated shape as the 43 userId-keyed tables in
-- 20260714140000_enable_rls_permissive — a new PII table must not fall
-- outside the pattern the way "User" once did (see 20260805120000 and
-- docs/rls-rollout.md). ENABLE only, never FORCE; inert while the app role
-- carries BYPASSRLS.
ALTER TABLE "UserIdentity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "UserIdentity_tenant_isolation" ON "UserIdentity" USING ("userId" = current_setting('app.current_user_id', true));
CREATE POLICY "UserIdentity_system_bypass" ON "UserIdentity" USING (current_setting('app.bypass_rls', true) = 'on');

