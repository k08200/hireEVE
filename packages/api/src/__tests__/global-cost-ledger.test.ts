/**
 * Durable global daily ceiling.
 *
 * The global cap is the ONLY gate that sees system-initiated calls (schedulers,
 * reconcilers, sweeps — anything without a userId). It used to live in a module
 * variable, so every process restart forgot the day's spend and started again
 * from zero. On Render, where a deploy or a wake-from-idle restarts the
 * container, that meant the "$10/day" ceiling never actually bound — which is
 * why the 2026-06-05 billing spike had no brake and BACKGROUND_AGENTS_DISABLED
 * had to be used as one instead (index.ts).
 *
 * Backing it with the database is what makes turning the schedulers back on
 * safe. The table is keyed by UTC day, so the rollover is a different row
 * rather than a timer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface LedgerRow {
  dayKey: string;
  /** Integer micro-cents (1 cent = 10_000), exactly as the column stores it. */
  microCents: number;
  callCount: number;
}

const MICRO = 10_000;

/** Stands in for the table: survives module re-imports, like a real database. */
const table = new Map<string, LedgerRow>();
const upsertCalls: Array<Record<string, unknown>> = [];

vi.mock("../db.js", () => ({
  prisma: {
    globalCostLedger: {
      findUnique: vi.fn(async (args: { where: { dayKey: string } }) => {
        return table.get(args.where.dayKey) ?? null;
      }),
      upsert: vi.fn(
        async (args: {
          where: { dayKey: string };
          create: LedgerRow;
          update: Record<string, { increment: number }>;
        }) => {
          upsertCalls.push(args as unknown as Record<string, unknown>);
          const key = args.where.dayKey;
          const existing = table.get(key);
          if (!existing) {
            const created = { ...args.create };
            table.set(key, created);
            return created;
          }
          // Mirror Postgres: `increment` is applied server-side, atomically.
          const next: LedgerRow = {
            ...existing,
            microCents: existing.microCents + (args.update.microCents?.increment ?? 0),
            callCount: existing.callCount + (args.update.callCount?.increment ?? 0),
          };
          table.set(key, next);
          return next;
        },
      ),
    },
  },
}));

vi.mock("../billing/cost-trip-alert.js", () => ({ notifyCostCapTrip: vi.fn(async () => {}) }));

const ORIGINAL_CAP = process.env.GLOBAL_DAILY_COST_CAP_CENTS;

/** Re-import the module with a cleared registry — i.e. a process restart. */
async function restartProcess() {
  vi.resetModules();
  return await import("../billing/cost-guard.js");
}

beforeEach(() => {
  table.clear();
  upsertCalls.length = 0;
  process.env.GLOBAL_DAILY_COST_CAP_CENTS = "1000";
});

afterEach(() => {
  if (ORIGINAL_CAP === undefined) delete process.env.GLOBAL_DAILY_COST_CAP_CENTS;
  else process.env.GLOBAL_DAILY_COST_CAP_CENTS = ORIGINAL_CAP;
  vi.resetModules();
});

describe("global ceiling — durability across restarts", () => {
  it("remembers today's spend after a restart", async () => {
    const first = await restartProcess();
    await first.recordGlobalCostUsage(600);
    expect((await first.checkGlobalCostGate()).remainingCents).toBe(400);

    // The container restarts (deploy, idle wake, crash-loop).
    const second = await restartProcess();
    const gate = await second.checkGlobalCostGate();
    expect(gate.usedCents).toBe(600);
    expect(gate.remainingCents).toBe(400);
  });

  it("still refuses calls after a restart once the cap is spent", async () => {
    const first = await restartProcess();
    await first.recordGlobalCostUsage(1000);
    expect((await first.checkGlobalCostGate()).allowed).toBe(false);

    const second = await restartProcess();
    const gate = await second.checkGlobalCostGate();
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/global/i);
  });
});

describe("global ceiling — accounting", () => {
  it("increments server-side so concurrent writers cannot lose spend", async () => {
    const { recordGlobalCostUsage } = await restartProcess();
    await recordGlobalCostUsage(10);
    await recordGlobalCostUsage(15);
    const update = upsertCalls.at(-1)?.update as Record<string, { increment: number }>;
    expect(update.microCents.increment).toBe(15 * MICRO);
    expect(table.values().next().value?.microCents).toBe(25 * MICRO);
  });

  it("accumulates sub-cent charges instead of rounding them away", async () => {
    const { recordGlobalCostUsage, checkGlobalCostGate } = await restartProcess();
    // Floats would drift here (0.3+0.3+0.3+0.3 !== 1.2); integers do not.
    for (let i = 0; i < 4; i++) await recordGlobalCostUsage(0.3);
    expect((await checkGlobalCostGate()).usedCents).toBe(1.2);
  });

  it("reports the post-increment total so a concurrent pair cannot both slip past", async () => {
    const { recordGlobalCostUsage } = await restartProcess();
    await recordGlobalCostUsage(990);
    const result = await recordGlobalCostUsage(20);
    expect(result?.totalCents).toBe(1010);
    expect(result?.overCap).toBe(true);
  });

  it("ignores zero, negative and non-finite amounts without touching the table", async () => {
    const { recordGlobalCostUsage } = await restartProcess();
    expect(await recordGlobalCostUsage(0)).toBeNull();
    expect(await recordGlobalCostUsage(-5)).toBeNull();
    expect(await recordGlobalCostUsage(Number.NaN)).toBeNull();
    expect(upsertCalls).toHaveLength(0);
  });

  it("counts calls alongside cents so the ledger is auditable", async () => {
    const { recordGlobalCostUsage } = await restartProcess();
    await recordGlobalCostUsage(1);
    await recordGlobalCostUsage(1);
    expect(table.values().next().value?.callCount).toBe(2);
  });
});

describe("global ceiling — disabled", () => {
  it("never reads the table when the cap is 0", async () => {
    process.env.GLOBAL_DAILY_COST_CAP_CENTS = "0";
    const { checkGlobalCostGate } = await restartProcess();
    const gate = await checkGlobalCostGate();
    expect(gate.allowed).toBe(true);
    expect(gate.capCents).toBe(0);
    expect(gate.remainingCents).toBe(Number.POSITIVE_INFINITY);
  });
});
