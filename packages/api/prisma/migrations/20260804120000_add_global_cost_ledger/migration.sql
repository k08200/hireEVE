-- Durable global daily LLM spend ceiling (one row per UTC day).
-- Replaces an in-memory accumulator that reset on every process restart, which
-- left system-initiated calls (no userId) effectively uncapped on a platform
-- that restarts the container on each deploy.
CREATE TABLE "GlobalCostLedger" (
    "dayKey" TEXT NOT NULL,
    "microCents" INTEGER NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalCostLedger_pkey" PRIMARY KEY ("dayKey")
);
